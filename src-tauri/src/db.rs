use crate::error::{NootleError, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub category_id: Option<String>,
    pub audio_path: Option<String>,
    pub status: String,
    pub calendar_event_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMeeting {
    pub title: String,
    pub category_id: Option<String>,
    pub calendar_event_id: Option<String>,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn: Mutex::new(conn) };
        db.initialize()?;
        Ok(db)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn: Mutex::new(conn) };
        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#6366f1',
                icon TEXT NOT NULL DEFAULT '📋',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                category_id TEXT REFERENCES categories(id),
                audio_path TEXT,
                status TEXT NOT NULL DEFAULT 'recording',
                calendar_event_id TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                speaker_label TEXT NOT NULL DEFAULT 'Speaker',
                text TEXT NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                confidence REAL NOT NULL DEFAULT 1.0
            );

            CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_auto_run INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS summaries (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                prompt_id TEXT REFERENCES prompts(id),
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category_id TEXT REFERENCES categories(id),
                sections TEXT NOT NULL DEFAULT '[]',
                auto_apply_rules TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
                text, content='transcripts', content_rowid='rowid'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts USING fts5(
                content, content='summaries', content_rowid='rowid'
            );
            ",
        )?;
        Ok(())
    }

    pub fn list_tables(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE '%_content%' AND name NOT LIKE '%_docsize%' AND name NOT LIKE '%_data%' AND name NOT LIKE '%_idx%' AND name NOT LIKE '%_config%'"
        )?;
        let tables = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tables)
    }

    pub fn create_meeting(&self, new: NewMeeting) -> Result<Meeting> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let status = "recording";

        conn.execute(
            "INSERT INTO meetings (id, title, start_time, category_id, status, calendar_event_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, new.title, now, new.category_id, status, new.calendar_event_id, now, now],
        )?;

        Ok(Meeting {
            id,
            title: new.title,
            start_time: now.clone(),
            end_time: None,
            category_id: new.category_id,
            audio_path: None,
            status: status.to_string(),
            calendar_event_id: new.calendar_event_id,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn get_meeting(&self, id: &str) -> Result<Meeting> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, start_time, end_time, category_id, audio_path, status, calendar_event_id, created_at, updated_at
             FROM meetings WHERE id = ?1",
        )?;

        let meeting = stmt.query_row(params![id], |row| {
            Ok(Meeting {
                id: row.get(0)?,
                title: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                category_id: row.get(4)?,
                audio_path: row.get(5)?,
                status: row.get(6)?,
                calendar_event_id: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        }).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                NootleError::Other(format!("Meeting not found: {}", id))
            }
            other => NootleError::Database(other),
        })?;

        Ok(meeting)
    }

    pub fn list_meetings(&self, category_id: Option<&str>, search: Option<&str>) -> Result<Vec<Meeting>> {
        let conn = self.conn.lock().unwrap();

        let mut sql = String::from(
            "SELECT id, title, start_time, end_time, category_id, audio_path, status, calendar_event_id, created_at, updated_at
             FROM meetings"
        );
        let mut conditions: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(cat_id) = category_id {
            conditions.push(format!("category_id = ?{}", param_values.len() + 1));
            param_values.push(Box::new(cat_id.to_string()));
        }

        if let Some(query) = search {
            conditions.push(format!("title LIKE ?{}", param_values.len() + 1));
            param_values.push(Box::new(format!("%{}%", query)));
        }

        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        sql.push_str(" ORDER BY start_time DESC");

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
        let meetings = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(Meeting {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    category_id: row.get(4)?,
                    audio_path: row.get(5)?,
                    status: row.get(6)?,
                    calendar_event_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(meetings)
    }

    pub fn update_meeting_status(&self, id: &str, status: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE meetings SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;

        Ok(())
    }

    pub fn delete_meeting(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])?;

        Ok(())
    }
}
