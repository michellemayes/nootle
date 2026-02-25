use crate::error::Result;
use rusqlite::Connection;
use std::sync::Mutex;

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
}
