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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: String,
    pub meeting_id: String,
    pub speaker_label: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTranscriptSegment {
    pub meeting_id: String,
    pub speaker_label: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewCategory {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub name: String,
    pub content: String,
    pub is_favorite: bool,
    pub is_auto_run: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPrompt {
    pub name: String,
    pub content: String,
    pub is_favorite: bool,
    pub is_auto_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub category_id: Option<String>,
    pub sections: String,
    pub auto_apply_rules: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTemplate {
    pub name: String,
    pub category_id: Option<String>,
    pub sections: String,
    pub auto_apply_rules: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub id: String,
    pub meeting_id: String,
    pub prompt_id: Option<String>,
    pub provider: String,
    pub model: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSummary {
    pub meeting_id: String,
    pub prompt_id: Option<String>,
    pub provider: String,
    pub model: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearTicket {
    pub id: String,
    pub summary_id: String,
    pub meeting_id: String,
    pub linear_issue_id: String,
    pub linear_issue_url: String,
    pub linear_identifier: String,
    pub title: String,
    pub team_id: String,
    pub project_id: Option<String>,
    pub created_at: String,
}

pub struct NewLinearTicket<'a> {
    pub summary_id: &'a str,
    pub meeting_id: &'a str,
    pub linear_issue_id: &'a str,
    pub linear_issue_url: &'a str,
    pub linear_identifier: &'a str,
    pub title: &'a str,
    pub team_id: &'a str,
    pub project_id: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSearchResult {
    pub meeting_id: String,
    pub meeting_title: String,
    pub speaker_label: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.initialize()?;
        Ok(db)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Mutex::new(conn),
        };
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

            CREATE TABLE IF NOT EXISTS linear_tickets (
                id TEXT PRIMARY KEY,
                summary_id TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
                meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                linear_issue_id TEXT NOT NULL,
                linear_issue_url TEXT NOT NULL,
                linear_identifier TEXT NOT NULL,
                title TEXT NOT NULL,
                team_id TEXT NOT NULL,
                project_id TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS linear_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
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

            CREATE TRIGGER IF NOT EXISTS transcripts_ai AFTER INSERT ON transcripts BEGIN
                INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
            END;
            CREATE TRIGGER IF NOT EXISTS transcripts_ad AFTER DELETE ON transcripts BEGIN
                INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES('delete', old.rowid, old.text);
            END;
            CREATE TRIGGER IF NOT EXISTS summaries_ai AFTER INSERT ON summaries BEGIN
                INSERT INTO summaries_fts(rowid, content) VALUES (new.rowid, new.content);
            END;
            CREATE TRIGGER IF NOT EXISTS summaries_ad AFTER DELETE ON summaries BEGIN
                INSERT INTO summaries_fts(summaries_fts, rowid, content) VALUES('delete', old.rowid, old.content);
            END;
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

        let meeting = stmt
            .query_row(params![id], |row| {
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
            })
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    NootleError::Other(format!("Meeting not found: {}", id))
                }
                other => NootleError::Database(other),
            })?;

        Ok(meeting)
    }

    pub fn list_meetings(
        &self,
        category_id: Option<&str>,
        search: Option<&str>,
    ) -> Result<Vec<Meeting>> {
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
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
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

    pub fn finalize_meeting(
        &self,
        id: &str,
        end_time: &str,
        audio_path: Option<&str>,
        status: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE meetings SET end_time = ?1, audio_path = ?2, status = ?3, updated_at = ?4 WHERE id = ?5",
            params![end_time, audio_path, status, now, id],
        )?;

        Ok(())
    }

    pub fn delete_meeting(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])?;

        Ok(())
    }

    // --- Categories ---

    pub fn create_category(&self, new: NewCategory) -> Result<Category> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let color = new.color.unwrap_or_else(|| "#6366f1".to_string());
        let icon = new.icon.unwrap_or_else(|| "\u{1F4CB}".to_string());

        conn.execute(
            "INSERT INTO categories (id, name, color, icon, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, new.name, color, icon, now],
        )?;

        Ok(Category {
            id,
            name: new.name,
            color,
            icon,
            created_at: now,
        })
    }

    pub fn list_categories(&self) -> Result<Vec<Category>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, color, icon, created_at FROM categories ORDER BY name ASC",
        )?;

        let categories = stmt
            .query_map([], |row| {
                Ok(Category {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    icon: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(categories)
    }

    pub fn delete_category(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Transcript Segments ---

    pub fn create_transcript_segment(
        &self,
        new: NewTranscriptSegment,
    ) -> Result<TranscriptSegment> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO transcripts (id, meeting_id, speaker_label, text, start_ms, end_ms, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                new.meeting_id,
                new.speaker_label,
                new.text,
                new.start_ms,
                new.end_ms,
                new.confidence
            ],
        )?;

        Ok(TranscriptSegment {
            id,
            meeting_id: new.meeting_id,
            speaker_label: new.speaker_label,
            text: new.text,
            start_ms: new.start_ms,
            end_ms: new.end_ms,
            confidence: new.confidence,
        })
    }

    pub fn get_transcript(&self, meeting_id: &str) -> Result<Vec<TranscriptSegment>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, meeting_id, speaker_label, text, start_ms, end_ms, confidence
             FROM transcripts WHERE meeting_id = ?1 ORDER BY start_ms ASC",
        )?;

        let segments = stmt
            .query_map(params![meeting_id], |row| {
                Ok(TranscriptSegment {
                    id: row.get(0)?,
                    meeting_id: row.get(1)?,
                    speaker_label: row.get(2)?,
                    text: row.get(3)?,
                    start_ms: row.get(4)?,
                    end_ms: row.get(5)?,
                    confidence: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(segments)
    }

    // --- Prompts ---

    pub fn create_prompt(&self, new: NewPrompt) -> Result<Prompt> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let is_favorite = new.is_favorite as i32;
        let is_auto_run = new.is_auto_run as i32;

        conn.execute(
            "INSERT INTO prompts (id, name, content, is_favorite, is_auto_run, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, new.name, new.content, is_favorite, is_auto_run, now],
        )?;

        Ok(Prompt {
            id,
            name: new.name,
            content: new.content,
            is_favorite: new.is_favorite,
            is_auto_run: new.is_auto_run,
            created_at: now,
        })
    }

    pub fn list_prompts(&self) -> Result<Vec<Prompt>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, is_favorite, is_auto_run, created_at
             FROM prompts ORDER BY created_at DESC",
        )?;

        let prompts = stmt
            .query_map([], |row| {
                Ok(Prompt {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    is_favorite: row.get::<_, i32>(3)? != 0,
                    is_auto_run: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(prompts)
    }

    pub fn get_prompt(&self, id: &str) -> Result<Prompt> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, is_favorite, is_auto_run, created_at
             FROM prompts WHERE id = ?1",
        )?;

        let prompt = stmt
            .query_row(params![id], |row| {
                Ok(Prompt {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    is_favorite: row.get::<_, i32>(3)? != 0,
                    is_auto_run: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    NootleError::Other(format!("Prompt not found: {}", id))
                }
                other => NootleError::Database(other),
            })?;

        Ok(prompt)
    }

    pub fn get_auto_run_prompts(&self) -> Result<Vec<Prompt>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, content, is_favorite, is_auto_run, created_at
             FROM prompts WHERE is_auto_run = 1 ORDER BY created_at DESC",
        )?;

        let prompts = stmt
            .query_map([], |row| {
                Ok(Prompt {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    is_favorite: row.get::<_, i32>(3)? != 0,
                    is_auto_run: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(prompts)
    }

    pub fn delete_prompt(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM prompts WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Templates ---

    pub fn create_template(&self, new: NewTemplate) -> Result<Template> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO templates (id, name, category_id, sections, auto_apply_rules, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                new.name,
                new.category_id,
                new.sections,
                new.auto_apply_rules,
                now
            ],
        )?;

        Ok(Template {
            id,
            name: new.name,
            category_id: new.category_id,
            sections: new.sections,
            auto_apply_rules: new.auto_apply_rules,
            created_at: now,
        })
    }

    pub fn list_templates(&self) -> Result<Vec<Template>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, category_id, sections, auto_apply_rules, created_at
             FROM templates ORDER BY created_at DESC",
        )?;

        let templates = stmt
            .query_map([], |row| {
                Ok(Template {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category_id: row.get(2)?,
                    sections: row.get(3)?,
                    auto_apply_rules: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(templates)
    }

    pub fn delete_template(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM templates WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Summaries ---

    pub fn create_summary(&self, new: NewSummary) -> Result<Summary> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO summaries (id, meeting_id, prompt_id, provider, model, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, new.meeting_id, new.prompt_id, new.provider, new.model, new.content, now],
        )?;

        Ok(Summary {
            id,
            meeting_id: new.meeting_id,
            prompt_id: new.prompt_id,
            provider: new.provider,
            model: new.model,
            content: new.content,
            created_at: now,
        })
    }

    pub fn get_summaries_for_meeting(&self, meeting_id: &str) -> Result<Vec<Summary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, meeting_id, prompt_id, provider, model, content, created_at
             FROM summaries WHERE meeting_id = ?1 ORDER BY created_at DESC",
        )?;

        let summaries = stmt
            .query_map(params![meeting_id], |row| {
                Ok(Summary {
                    id: row.get(0)?,
                    meeting_id: row.get(1)?,
                    prompt_id: row.get(2)?,
                    provider: row.get(3)?,
                    model: row.get(4)?,
                    content: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(summaries)
    }

    // --- Linear Tickets ---

    pub fn create_linear_ticket(&self, params: NewLinearTicket<'_>) -> Result<LinearTicket> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO linear_tickets (id, summary_id, meeting_id, linear_issue_id, linear_issue_url, linear_identifier, title, team_id, project_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, params.summary_id, params.meeting_id, params.linear_issue_id, params.linear_issue_url, params.linear_identifier, params.title, params.team_id, params.project_id, now],
        )?;

        Ok(LinearTicket {
            id,
            summary_id: params.summary_id.to_string(),
            meeting_id: params.meeting_id.to_string(),
            linear_issue_id: params.linear_issue_id.to_string(),
            linear_issue_url: params.linear_issue_url.to_string(),
            linear_identifier: params.linear_identifier.to_string(),
            title: params.title.to_string(),
            team_id: params.team_id.to_string(),
            project_id: params.project_id.map(|s| s.to_string()),
            created_at: now,
        })
    }

    pub fn get_linear_tickets(&self, meeting_id: &str) -> Result<Vec<LinearTicket>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, summary_id, meeting_id, linear_issue_id, linear_issue_url, linear_identifier, title, team_id, project_id, created_at
             FROM linear_tickets WHERE meeting_id = ?1 ORDER BY created_at DESC",
        )?;

        let tickets = stmt
            .query_map(params![meeting_id], |row| {
                Ok(LinearTicket {
                    id: row.get(0)?,
                    summary_id: row.get(1)?,
                    meeting_id: row.get(2)?,
                    linear_issue_id: row.get(3)?,
                    linear_issue_url: row.get(4)?,
                    linear_identifier: row.get(5)?,
                    title: row.get(6)?,
                    team_id: row.get(7)?,
                    project_id: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(tickets)
    }

    pub fn get_summary(&self, id: &str) -> Result<Summary> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, meeting_id, prompt_id, provider, model, content, created_at
             FROM summaries WHERE id = ?1",
        )?;

        stmt.query_row(params![id], |row| {
            Ok(Summary {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                prompt_id: row.get(2)?,
                provider: row.get(3)?,
                model: row.get(4)?,
                content: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                NootleError::Other(format!("Summary not found: {}", id))
            }
            other => NootleError::Database(other),
        })
    }

    // --- Linear Settings ---

    pub fn get_linear_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM linear_settings WHERE key = ?1")?;
        match stmt.query_row(params![key], |row| row.get::<_, String>(0)) {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn set_linear_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO linear_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    // --- FTS5 Search ---

    pub fn search_transcripts(&self, query: &str) -> Result<Vec<TranscriptSearchResult>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.meeting_id, m.title, t.speaker_label, t.text, t.start_ms, t.end_ms
             FROM transcripts_fts fts
             JOIN transcripts t ON t.rowid = fts.rowid
             JOIN meetings m ON m.id = t.meeting_id
             WHERE transcripts_fts MATCH ?1
             ORDER BY fts.rank",
        )?;

        let results = stmt
            .query_map(params![query], |row| {
                Ok(TranscriptSearchResult {
                    meeting_id: row.get(0)?,
                    meeting_title: row.get(1)?,
                    speaker_label: row.get(2)?,
                    text: row.get(3)?,
                    start_ms: row.get(4)?,
                    end_ms: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(results)
    }
}
