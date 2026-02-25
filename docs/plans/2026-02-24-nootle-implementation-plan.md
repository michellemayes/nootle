# Nootle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a lightweight macOS meeting recorder app with local transcription, speaker diarization, AI summaries, and an MCP server.

**Architecture:** Monolithic Tauri 2.x app. Rust backend handles audio capture (Core Audio Process Tap), transcription (Parakeet v3 CoreML), diarization (pyannote-rs), storage (SQLite), LLM integration (multi-provider), and MCP server (rmcp). React/TypeScript frontend with shadcn/ui.

**Tech Stack:** Tauri 2.x, Rust, React 18, TypeScript, SQLite, CoreML, ONNX Runtime, shadcn/ui, Tailwind CSS, Framer Motion

**Design doc:** `docs/plans/2026-02-24-nootle-meeting-recorder-design.md`

---

## Phase 1: Project Scaffolding

### Task 1: Scaffold Tauri 2.x project

**Files:**
- Create: entire project structure via `create-tauri-app`

**Step 1: Create the Tauri project**

Run:
```bash
cd /Users/michelle/conductor/workspaces/nootle/auckland
pnpm create tauri-app@latest nootle-app --template react-ts
```

Select: React, TypeScript, pnpm

**Step 2: Verify project scaffolded correctly**

Run:
```bash
ls nootle-app/src-tauri/src/lib.rs nootle-app/src/App.tsx nootle-app/src-tauri/Cargo.toml
```

Expected: all three files exist

**Step 3: Move contents to repo root**

Move the scaffolded project contents into the repo root (not nested in `nootle-app/`):

```bash
mv nootle-app/* nootle-app/.* . 2>/dev/null; rmdir nootle-app
```

**Step 4: Install frontend dependencies**

Run:
```bash
pnpm install
```

**Step 5: Verify dev server starts**

Run:
```bash
pnpm tauri dev
```

Expected: Tauri window opens with React template

**Step 6: Commit**

```bash
git add -A
git commit -m "scaffold: Tauri 2.x project with React + TypeScript"
```

---

### Task 2: Add Rust backend dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add all required crates**

Edit `src-tauri/Cargo.toml` to add dependencies:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.32", features = ["bundled", "serde_json"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
anyhow = "1"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
futures-util = "0.3"
```

**Step 2: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: compiles without errors

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "deps: add core Rust dependencies"
```

---

### Task 3: Set up frontend with shadcn/ui and Tailwind

**Files:**
- Modify: `package.json`, `tailwind.config.ts`, `src/App.tsx`, `src/App.css`
- Create: `components.json`, `src/components/ui/` (via shadcn init)

**Step 1: Install Tailwind CSS v4 + shadcn/ui**

```bash
pnpm add -D tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init
```

When prompted: TypeScript, default style, CSS variables for colors.

**Step 2: Add core shadcn components**

```bash
pnpm dlx shadcn@latest add button card input dialog dropdown-menu scroll-area separator tabs badge tooltip
```

**Step 3: Install Framer Motion**

```bash
pnpm add framer-motion
```

**Step 4: Clean up default App.tsx**

Replace `src/App.tsx` with a minimal shell:

```tsx
function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <h1 className="text-2xl font-bold p-8">Nootle</h1>
    </div>
  );
}

export default App;
```

**Step 5: Verify it renders**

Run:
```bash
pnpm tauri dev
```

Expected: dark background, "Nootle" heading

**Step 6: Commit**

```bash
git add -A
git commit -m "ui: set up shadcn/ui, Tailwind CSS, and Framer Motion"
```

---

### Task 4: Organize Rust backend modules

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/db.rs`, `src-tauri/src/audio.rs`, `src-tauri/src/transcription.rs`, `src-tauri/src/diarization.rs`, `src-tauri/src/llm.rs`, `src-tauri/src/mcp.rs`, `src-tauri/src/detection.rs`, `src-tauri/src/error.rs`

**Step 1: Create module files**

Create each module file with a placeholder:

`src-tauri/src/error.rs`:
```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NootleError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for NootleError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, NootleError>;
```

Other modules (`db.rs`, `audio.rs`, `transcription.rs`, `diarization.rs`, `llm.rs`, `mcp.rs`, `detection.rs`): each just `// TODO` for now.

**Step 2: Wire modules into lib.rs**

```rust
mod audio;
mod db;
mod detection;
mod diarization;
mod error;
mod llm;
mod mcp;
mod transcription;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: compiles

**Step 4: Commit**

```bash
git add -A
git commit -m "scaffold: organize Rust backend modules"
```

---

## Phase 2: Database Layer

### Task 5: Write failing test for database initialization

**Files:**
- Create: `src-tauri/src/db.rs`
- Create: `src-tauri/tests/db_test.rs`

**Step 1: Write failing test**

`src-tauri/tests/db_test.rs`:
```rust
use nootle_app_lib::db::Database;

#[test]
fn test_database_initializes_tables() {
    let db = Database::new_in_memory().unwrap();
    let tables = db.list_tables().unwrap();
    assert!(tables.contains(&"meetings".to_string()));
    assert!(tables.contains(&"transcripts".to_string()));
    assert!(tables.contains(&"summaries".to_string()));
    assert!(tables.contains(&"categories".to_string()));
    assert!(tables.contains(&"templates".to_string()));
    assert!(tables.contains(&"prompts".to_string()));
}
```

Note: The lib crate name is derived from the `[lib] name` in Cargo.toml. Check the scaffolded Cargo.toml for the actual name (usually `app_lib` or `nootle_app_lib`). Adjust imports accordingly.

**Step 2: Run test to verify it fails**

Run:
```bash
cd src-tauri && cargo test --test db_test
```

Expected: FAIL — `Database` not defined

**Step 3: Implement Database struct with schema**

`src-tauri/src/db.rs`:
```rust
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
```

Make sure `Database` is public in `db.rs` and the module is `pub mod db;` in `lib.rs`.

**Step 4: Run test to verify it passes**

Run:
```bash
cd src-tauri && cargo test --test db_test
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: database initialization with full schema"
```

---

### Task 6: Meeting CRUD operations

**Files:**
- Modify: `src-tauri/src/db.rs`
- Create or modify: `src-tauri/tests/db_test.rs`

**Step 1: Write failing tests for meeting CRUD**

Add to `src-tauri/tests/db_test.rs`:
```rust
use nootle_app_lib::db::{Database, Meeting, NewMeeting};

#[test]
fn test_create_and_get_meeting() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Daily Standup".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    assert_eq!(meeting.title, "Daily Standup");
    assert_eq!(meeting.status, "recording");

    let fetched = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(fetched.title, "Daily Standup");
}

#[test]
fn test_list_meetings() {
    let db = Database::new_in_memory().unwrap();
    db.create_meeting(NewMeeting {
        title: "Meeting 1".to_string(),
        category_id: None,
        calendar_event_id: None,
    })
    .unwrap();
    db.create_meeting(NewMeeting {
        title: "Meeting 2".to_string(),
        category_id: None,
        calendar_event_id: None,
    })
    .unwrap();

    let meetings = db.list_meetings(None, None).unwrap();
    assert_eq!(meetings.len(), 2);
}

#[test]
fn test_update_meeting_status() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    db.update_meeting_status(&meeting.id, "summarized").unwrap();
    let updated = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(updated.status, "summarized");
}

#[test]
fn test_delete_meeting() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "To Delete".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    db.delete_meeting(&meeting.id).unwrap();
    let result = db.get_meeting(&meeting.id);
    assert!(result.is_err());
}
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd src-tauri && cargo test --test db_test
```

Expected: FAIL — `Meeting`, `NewMeeting` not defined

**Step 3: Implement Meeting types and CRUD**

Add to `src-tauri/src/db.rs`:

```rust
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Deserialize)]
pub struct NewMeeting {
    pub title: String,
    pub category_id: Option<String>,
    pub calendar_event_id: Option<String>,
}

impl Database {
    pub fn create_meeting(&self, new: NewMeeting) -> Result<Meeting> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO meetings (id, title, start_time, category_id, calendar_event_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, new.title, now, new.category_id, new.calendar_event_id, now, now],
        )?;
        self.get_meeting(&id)
    }

    pub fn get_meeting(&self, id: &str) -> Result<Meeting> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, title, start_time, end_time, category_id, audio_path, status, calendar_event_id, created_at, updated_at FROM meetings WHERE id = ?1",
            [id],
            |row| {
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
            },
        ).map_err(|e| crate::error::NootleError::Other(format!("Meeting not found: {e}")))
    }

    pub fn list_meetings(&self, category_id: Option<&str>, search: Option<&str>) -> Result<Vec<Meeting>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = "SELECT id, title, start_time, end_time, category_id, audio_path, status, calendar_event_id, created_at, updated_at FROM meetings WHERE 1=1".to_string();
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

        if let Some(cat) = category_id {
            sql.push_str(" AND category_id = ?");
            params.push(Box::new(cat.to_string()));
        }
        if let Some(q) = search {
            sql.push_str(" AND title LIKE ?");
            params.push(Box::new(format!("%{q}%")));
        }
        sql.push_str(" ORDER BY start_time DESC");

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
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
            rusqlite::params![status, now, id],
        )?;
        Ok(())
    }

    pub fn delete_meeting(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM meetings WHERE id = ?1", [id])?;
        Ok(())
    }
}
```

**Step 4: Run tests**

Run:
```bash
cd src-tauri && cargo test --test db_test
```

Expected: all PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: meeting CRUD operations with tests"
```

---

### Task 7: Transcript, category, prompt, and template CRUD

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/tests/db_test.rs`

**Step 1: Write failing tests**

Add tests for:
- `create_transcript_segment` / `get_transcript` (all segments for a meeting)
- `create_category` / `list_categories`
- `create_prompt` / `list_prompts` / `get_auto_run_prompts`
- `create_template` / `list_templates`
- `create_summary` / `get_summaries_for_meeting`
- `search_transcripts` (FTS5 full-text search)

Each test should follow the same pattern: create in-memory DB, insert data, query, assert.

**Step 2: Run tests to verify they fail**

**Step 3: Implement all CRUD methods**

Define structs: `TranscriptSegment`, `NewTranscriptSegment`, `Category`, `NewCategory`, `Prompt`, `NewPrompt`, `Template`, `NewTemplate`, `Summary`, `NewSummary`.

Implement methods on `Database` for each.

For FTS5 search, add triggers to keep FTS in sync:
```sql
CREATE TRIGGER IF NOT EXISTS transcripts_ai AFTER INSERT ON transcripts BEGIN
    INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
END;
```

And a search method:
```rust
pub fn search_transcripts(&self, query: &str) -> Result<Vec<TranscriptSearchResult>> {
    // Use FTS5 MATCH syntax
}
```

**Step 4: Run tests**

Expected: all PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: full CRUD for transcripts, categories, prompts, templates, summaries"
```

---

### Task 8: Tauri commands for database access

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create Tauri state and commands**

`src-tauri/src/commands.rs`:
```rust
use crate::db::{Database, Meeting, NewMeeting, Category, NewCategory};
use std::sync::Arc;
use tauri::State;

pub type DbState = Arc<Database>;

#[tauri::command]
pub fn create_meeting(db: State<'_, DbState>, title: String, category_id: Option<String>) -> Result<Meeting, String> {
    db.create_meeting(NewMeeting { title, category_id, calendar_event_id: None })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_meetings(db: State<'_, DbState>, category_id: Option<String>, search: Option<String>) -> Result<Vec<Meeting>, String> {
    db.list_meetings(category_id.as_deref(), search.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_meeting(db: State<'_, DbState>, id: String) -> Result<Meeting, String> {
    db.get_meeting(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_meeting(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_meeting(&id).map_err(|e| e.to_string())
}

// Add similar commands for categories, prompts, templates, summaries
```

**Step 2: Wire into lib.rs**

```rust
mod commands;

pub fn run() {
    let app_dir = dirs::data_dir().unwrap().join("Nootle");
    std::fs::create_dir_all(&app_dir).unwrap();
    let db_path = app_dir.join("nootle.db");
    let db = std::sync::Arc::new(db::Database::new(db_path.to_str().unwrap()).unwrap());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            commands::create_meeting,
            commands::list_meetings,
            commands::get_meeting,
            commands::delete_meeting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Add `dirs = "6"` to Cargo.toml.

**Step 3: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Tauri IPC commands for database access"
```

---

## Phase 3: Audio Capture

### Task 9: Microphone capture with cpal

**Files:**
- Modify: `src-tauri/src/audio.rs`
- Modify: `src-tauri/Cargo.toml` (add `cpal`, `ringbuf`, `hound`)

**Step 1: Add audio dependencies**

Add to `src-tauri/Cargo.toml`:
```toml
cpal = "0.15"
ringbuf = "0.4"
hound = "3.5"
```

**Step 2: Implement microphone capture**

`src-tauri/src/audio.rs`:
```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct MicCapture {
    stream: cpal::Stream,
    consumer: ringbuf::HeapCons<f32>,
    is_recording: Arc<AtomicBool>,
}

impl MicCapture {
    pub fn new() -> anyhow::Result<Self> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No input device found"))?;

        let config = device.default_input_config()?;
        let sample_rate = config.sample_rate().0;
        let channels = config.channels() as usize;

        // Ring buffer: ~5 seconds at 48kHz mono
        let rb = HeapRb::<f32>::new(sample_rate as usize * 5);
        let (mut producer, consumer) = rb.split();
        let is_recording = Arc::new(AtomicBool::new(false));
        let recording_flag = is_recording.clone();

        let stream = device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !recording_flag.load(Ordering::Relaxed) {
                    return;
                }
                // Downmix to mono if stereo
                if channels == 1 {
                    let _ = producer.push_slice(data);
                } else {
                    for chunk in data.chunks(channels) {
                        let mono = chunk.iter().sum::<f32>() / channels as f32;
                        let _ = producer.push_iter(std::iter::once(mono));
                    }
                }
            },
            |err| eprintln!("Audio input error: {err}"),
            None,
        )?;

        Ok(Self {
            stream,
            consumer,
            is_recording,
        })
    }

    pub fn start(&self) {
        self.is_recording.store(true, Ordering::Relaxed);
        self.stream.play().unwrap();
    }

    pub fn stop(&self) {
        self.is_recording.store(false, Ordering::Relaxed);
        self.stream.pause().unwrap();
    }

    pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
        self.consumer.pop_slice(buf)
    }
}
```

**Step 3: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: microphone capture with cpal"
```

---

### Task 10: System audio capture with Core Audio Process Tap

**Files:**
- Modify: `src-tauri/src/audio.rs`
- Modify: `src-tauri/Cargo.toml` (add `cidre`)

**Step 1: Add cidre dependency**

Add to `src-tauri/Cargo.toml`:
```toml
cidre = { version = "0.14", features = ["av"] }
```

**Step 2: Implement system audio capture**

This is macOS-specific. Create `src-tauri/src/audio/system_audio.rs` (refactor audio.rs into a module directory `src-tauri/src/audio/mod.rs`, `mic.rs`, `system_audio.rs`).

The system audio capture creates a Core Audio Process Tap, wraps it in an aggregate device, registers an IO proc, and pushes samples to a ring buffer. See the design doc for the full pattern using `ca::TapDesc::with_mono_global_tap_excluding_processes`.

Key implementation details:
- Create `TapDesc` with mono global tap
- Create `TapGuard` via `tap_desc.create_process_tap()`
- Build aggregate device dictionary with tap UID
- Register IO proc that pushes samples to ring buffer
- Expose `SystemAudioCapture` struct with `start()`, `stop()`, `read_samples()` methods

**Step 3: Verify compilation on macOS**

Run:
```bash
cd src-tauri && cargo check
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: system audio capture via Core Audio Process Tap"
```

---

### Task 11: Audio mixer and WAV writer

**Files:**
- Modify: `src-tauri/src/audio/mod.rs`
- Create: `src-tauri/src/audio/mixer.rs`
- Create: `src-tauri/src/audio/writer.rs`

**Step 1: Implement audio mixer**

`src-tauri/src/audio/mixer.rs`:
- Mix system audio and mic audio with RMS-based ducking
- When mic RMS > threshold, reduce system audio volume to 0.3x
- Output mixed samples to a buffer

**Step 2: Implement WAV writer**

`src-tauri/src/audio/writer.rs`:
- Use `hound` crate to write f32 samples to a WAV file
- 16kHz mono WAV (resample from capture rate if needed)
- Save to `~/Library/Application Support/Nootle/recordings/{meeting_id}.wav`

**Step 3: Implement RecordingSession**

`src-tauri/src/audio/mod.rs`:
- `RecordingSession` struct that owns mic capture, system audio capture, mixer, and writer
- `start()` spawns a tokio task that reads from both captures, mixes, writes to WAV, and pushes to a channel for transcription
- `stop()` signals the task to stop and finalizes the WAV file
- Emits `audio-level` Tauri events for waveform visualization

**Step 4: Verify compilation**

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: audio mixer with RMS ducking and WAV writer"
```

---

### Task 12: Tauri commands for recording

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add recording commands**

```rust
#[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    title: String,
    category_id: Option<String>,
) -> Result<Meeting, String> {
    // Create meeting in DB
    // Start RecordingSession
    // Store session in managed state
    // Return meeting
}

#[tauri::command]
pub async fn stop_recording(
    db: State<'_, DbState>,
    recording: State<'_, RecordingState>,
) -> Result<Meeting, String> {
    // Stop RecordingSession
    // Update meeting end_time and audio_path
    // Trigger transcription
}
```

**Step 2: Manage recording state**

Use `Mutex<Option<RecordingSession>>` as Tauri managed state.

**Step 3: Verify compilation**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Tauri commands for start/stop recording"
```

---

## Phase 4: Transcription

### Task 13: Parakeet v3 CoreML model management

**Files:**
- Modify: `src-tauri/src/transcription.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add ort dependency**

```toml
ort = { version = "2.0.0-rc.10", features = ["ndarray", "coreml"] }
ndarray = "0.16"
```

**Step 2: Implement model download and management**

```rust
pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new() -> Self {
        let models_dir = dirs::data_dir().unwrap().join("Nootle").join("models");
        std::fs::create_dir_all(&models_dir).unwrap();
        Self { models_dir }
    }

    pub fn is_model_downloaded(&self, model_name: &str) -> bool {
        self.models_dir.join(model_name).exists()
    }

    pub async fn download_model(
        &self,
        model_name: &str,
        url: &str,
        on_progress: impl Fn(u64, u64),
    ) -> anyhow::Result<PathBuf> {
        // Download with reqwest, support resume via Range header
        // Report progress via callback
        // Save to models_dir
    }
}
```

Model files to download (from FluidInference/parakeet-tdt-0.6b-v3-coreml on HuggingFace or Meetily CDN):
- `parakeet-v3-encoder.mlmodelc` (or ONNX fallback)
- `parakeet-v3-decoder.mlmodelc`
- `parakeet-v3-preprocessor.onnx`
- `vocab.txt`

**Step 3: Emit download progress via Tauri events**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Parakeet v3 model download and management"
```

---

### Task 14: Transcription engine

**Files:**
- Modify: `src-tauri/src/transcription.rs`

**Step 1: Implement transcription pipeline**

```rust
pub struct TranscriptionEngine {
    // ONNX sessions for preprocessor, encoder, decoder
}

impl TranscriptionEngine {
    pub fn new(model_dir: &Path) -> anyhow::Result<Self> {
        // Load ONNX/CoreML models
    }

    pub fn transcribe(&self, audio_samples: &[f32], sample_rate: u32) -> anyhow::Result<Vec<TranscriptToken>> {
        // 1. Mel-spectrogram preprocessing
        // 2. Encoder forward pass
        // 3. Greedy TDT decoder
        // Return tokens with timestamps
    }
}

pub struct TranscriptToken {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub confidence: f32,
}
```

Reference: Meetily's `parakeet_engine/model.rs` for the three-stage pipeline.

**Step 2: Verify compilation**

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: Parakeet v3 transcription engine"
```

---

### Task 15: Real-time transcription streaming

**Files:**
- Modify: `src-tauri/src/transcription.rs`
- Modify: `src-tauri/src/commands.rs`

**Step 1: Implement streaming transcription**

Process audio in chunks (e.g., 10-second windows). After each chunk:
1. Run transcription
2. Emit `transcript-update` Tauri event with new tokens
3. Save segments to SQLite

```rust
#[derive(Clone, Serialize)]
pub struct TranscriptUpdate {
    pub meeting_id: String,
    pub segments: Vec<TranscriptSegmentPayload>,
}

#[derive(Clone, Serialize)]
pub struct TranscriptSegmentPayload {
    pub speaker: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}
```

**Step 2: Verify events reach frontend**

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: real-time transcription streaming via Tauri events"
```

---

## Phase 5: Speaker Diarization

### Task 16: Integrate pyannote-rs

**Files:**
- Modify: `src-tauri/src/diarization.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add pyannote-rs dependency**

```toml
pyannote-rs = { version = "0.3", features = ["coreml"] }
```

**Step 2: Implement diarization engine**

```rust
use pyannote_rs::{get_segments, EmbeddingExtractor, EmbeddingManager};

pub struct DiarizationEngine {
    segmentation_model_path: PathBuf,
    embedding_model_path: PathBuf,
}

impl DiarizationEngine {
    pub fn new(models_dir: &Path) -> Self {
        Self {
            segmentation_model_path: models_dir.join("segmentation-3.0.onnx"),
            embedding_model_path: models_dir.join("wespeaker_en_voxceleb_CAM++.onnx"),
        }
    }

    pub fn diarize(&self, samples: &[i16], sample_rate: u32, max_speakers: usize) -> anyhow::Result<Vec<DiarizedSegment>> {
        let segments = get_segments(samples, sample_rate, &self.segmentation_model_path)?;
        let mut extractor = EmbeddingExtractor::new(&self.embedding_model_path)?;
        let mut manager = EmbeddingManager::new(max_speakers);

        let mut results = Vec::new();
        for segment in segments {
            let segment = segment?;
            let embedding: Vec<f32> = extractor.compute(&segment.samples)?.collect();
            let emb = ndarray::Array1::from(embedding);

            let speaker_id = if manager.get_all_speakers().len() >= max_speakers {
                manager.get_best_speaker_match(&emb).unwrap_or(0)
            } else {
                manager.search_speaker(emb, 0.5).unwrap_or(0)
            };

            results.push(DiarizedSegment {
                start: segment.start,
                end: segment.end,
                speaker_id,
            });
        }

        Ok(results)
    }
}

pub struct DiarizedSegment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}
```

**Step 3: Download diarization models on first launch**

Add model download for `segmentation-3.0.onnx` and `wespeaker_en_voxceleb_CAM++.onnx` from the pyannote-rs GitHub releases.

**Step 4: Verify compilation**

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: speaker diarization with pyannote-rs"
```

---

### Task 17: Align transcription with diarization

**Files:**
- Create: `src-tauri/src/alignment.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Implement timestamp alignment**

```rust
pub fn align_transcript_with_speakers(
    tokens: &[TranscriptToken],
    diarized: &[DiarizedSegment],
) -> Vec<AttributedSegment> {
    // For each transcript token, find the overlapping diarized segment
    // Assign the speaker_id from the diarized segment with the most overlap
    // Group consecutive tokens with the same speaker into segments
}

pub struct AttributedSegment {
    pub speaker_label: String, // "Speaker 1", "Speaker 2", etc.
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}
```

**Step 2: Write test for alignment**

Test that tokens spanning multiple speakers get correctly split and attributed.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: align transcription with speaker diarization"
```

---

## Phase 6: LLM Integration

### Task 18: LLM provider trait and OpenAI implementation

**Files:**
- Modify: `src-tauri/src/llm.rs`
- Create: `src-tauri/src/llm/mod.rs`, `src-tauri/src/llm/openai.rs`, `src-tauri/src/llm/types.rs`

**Step 1: Define the provider trait**

`src-tauri/src/llm/types.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
}

#[async_trait::async_trait]
pub trait LlmProvider: Send + Sync {
    fn provider_name(&self) -> &str;
    fn available_models(&self) -> Vec<ModelInfo>;
    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String>;
    // Streaming can be added later
}
```

Add `async-trait = "0.1"` to Cargo.toml.

**Step 2: Implement OpenAI provider**

`src-tauri/src/llm/openai.rs`:
```rust
pub struct OpenAiProvider {
    api_key: String,
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait::async_trait]
impl LlmProvider for OpenAiProvider {
    fn provider_name(&self) -> &str { "openai" }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo { id: "gpt-4o".into(), name: "GPT-4o".into(), provider: "openai".into() },
            ModelInfo { id: "gpt-4o-mini".into(), name: "GPT-4o Mini".into(), provider: "openai".into() },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let resp = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&serde_json::json!({
                "model": model,
                "messages": messages,
            }))
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        Ok(resp["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: LLM provider trait and OpenAI implementation"
```

---

### Task 19: Anthropic, Google, Groq, and Ollama providers

**Files:**
- Create: `src-tauri/src/llm/anthropic.rs`, `src-tauri/src/llm/google.rs`, `src-tauri/src/llm/groq.rs`, `src-tauri/src/llm/ollama.rs`

**Step 1: Implement each provider**

Each follows the same pattern as OpenAI but with provider-specific API formats:

- **Anthropic**: POST to `https://api.anthropic.com/v1/messages`, `x-api-key` header, different request/response format
- **Google**: POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
- **Groq**: OpenAI-compatible API at `https://api.groq.com/openai/v1/chat/completions`
- **Ollama**: OpenAI-compatible API at `http://localhost:11434/v1/chat/completions`, no auth

**Step 2: Create provider registry**

`src-tauri/src/llm/mod.rs`:
```rust
pub struct LlmRegistry {
    providers: Vec<Box<dyn LlmProvider>>,
}

impl LlmRegistry {
    pub fn new() -> Self { Self { providers: vec![] } }

    pub fn register(&mut self, provider: Box<dyn LlmProvider>) {
        self.providers.push(provider);
    }

    pub fn get_provider(&self, name: &str) -> Option<&dyn LlmProvider> {
        self.providers.iter().find(|p| p.provider_name() == name).map(|p| p.as_ref())
    }

    pub fn all_models(&self) -> Vec<ModelInfo> {
        self.providers.iter().flat_map(|p| p.available_models()).collect()
    }
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: Anthropic, Google, Groq, and Ollama LLM providers"
```

---

### Task 20: API key storage in macOS Keychain

**Files:**
- Create: `src-tauri/src/keychain.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add security-framework dependency**

```toml
security-framework = "3"
```

**Step 2: Implement keychain operations**

```rust
use security_framework::passwords::{get_generic_password, set_generic_password, delete_generic_password};

const SERVICE_NAME: &str = "com.nootle.app";

pub fn store_api_key(provider: &str, key: &str) -> anyhow::Result<()> {
    set_generic_password(SERVICE_NAME, provider, key.as_bytes())?;
    Ok(())
}

pub fn get_api_key(provider: &str) -> anyhow::Result<Option<String>> {
    match get_generic_password(SERVICE_NAME, provider) {
        Ok(bytes) => Ok(Some(String::from_utf8(bytes.to_vec())?)),
        Err(_) => Ok(None),
    }
}

pub fn delete_api_key(provider: &str) -> anyhow::Result<()> {
    delete_generic_password(SERVICE_NAME, provider)?;
    Ok(())
}
```

**Step 3: Add Tauri commands for key management**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: API key storage in macOS Keychain"
```

---

### Task 21: Meeting summarization pipeline

**Files:**
- Create: `src-tauri/src/summarization.rs`
- Modify: `src-tauri/src/commands.rs`

**Step 1: Implement summarization**

```rust
pub async fn summarize_meeting(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    prompt_id: &str,
    provider: &str,
    model: &str,
) -> anyhow::Result<Summary> {
    let transcript = db.get_transcript(meeting_id)?;
    let prompt = db.get_prompt(prompt_id)?;

    let transcript_text = transcript
        .iter()
        .map(|s| format!("{}: {}", s.speaker_label, s.text))
        .collect::<Vec<_>>()
        .join("\n");

    let messages = vec![
        ChatMessage { role: "system".into(), content: prompt.content },
        ChatMessage { role: "user".into(), content: transcript_text },
    ];

    let provider = llm.get_provider(provider).ok_or_else(|| anyhow::anyhow!("Provider not found"))?;
    let content = provider.chat(messages, model).await?;

    let summary = db.create_summary(NewSummary {
        meeting_id: meeting_id.to_string(),
        prompt_id: Some(prompt_id.to_string()),
        provider: provider_name.to_string(),
        model: model.to_string(),
        content,
    })?;

    Ok(summary)
}
```

**Step 2: Auto-run prompts after transcription completes**

When transcription finishes, query `prompts WHERE is_auto_run = 1` and run each against the transcript.

**Step 3: Add Tauri commands**

```rust
#[tauri::command]
pub async fn generate_summary(...) -> Result<Summary, String> { ... }

#[tauri::command]
pub async fn chat_with_transcript(...) -> Result<String, String> { ... }
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: meeting summarization and chat with transcript"
```

---

## Phase 7: Meeting Detection

### Task 22: Process monitoring for meeting apps

**Files:**
- Modify: `src-tauri/src/detection.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add sysinfo dependency**

```toml
sysinfo = "0.32"
```

**Step 2: Implement process monitor**

```rust
use sysinfo::System;
use std::collections::HashSet;

const MEETING_PROCESSES: &[&str] = &["zoom.us", "Microsoft Teams", "Google Meet"];

pub struct MeetingDetector {
    system: System,
    known_active: HashSet<String>,
}

impl MeetingDetector {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            known_active: HashSet::new(),
        }
    }

    pub fn check_for_meetings(&mut self) -> Vec<DetectedMeeting> {
        self.system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut detected = Vec::new();

        for process in self.system.processes().values() {
            let name = process.name().to_string_lossy().to_string();
            for &meeting_app in MEETING_PROCESSES {
                if name.contains(meeting_app) && !self.known_active.contains(meeting_app) {
                    self.known_active.insert(meeting_app.to_string());
                    detected.push(DetectedMeeting {
                        app_name: meeting_app.to_string(),
                        process_name: name.clone(),
                    });
                }
            }
        }

        // Remove apps no longer running
        self.known_active.retain(|app| {
            self.system.processes().values().any(|p| p.name().to_string_lossy().contains(app.as_str()))
        });

        detected
    }
}

pub struct DetectedMeeting {
    pub app_name: String,
    pub process_name: String,
}
```

**Step 3: Start polling loop in Tauri setup**

Spawn a tokio task that calls `check_for_meetings()` every 5 seconds and emits `meeting-detected` Tauri events.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: process monitoring for Zoom/Teams/Meet detection"
```

---

### Task 23: macOS notifications

**Files:**
- Modify: `src-tauri/src/detection.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add notification support**

Use `tauri-plugin-notification` for native macOS notifications:

```toml
tauri-plugin-notification = "2"
```

**Step 2: Send notifications on meeting detection**

When `meeting-detected` fires, show a macOS notification with "Record" and "Dismiss" actions.

**Step 3: Handle notification actions**

When user clicks "Record", invoke `start_recording` command.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: macOS notifications for meeting detection"
```

---

### Task 24: Calendar integration via EventKit

**Files:**
- Create: `src-tauri/src/calendar.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Implement EventKit bridge**

Use `objc2` and `objc2-event-kit` (or raw FFI) to:
- Request calendar access permission
- Fetch upcoming events within the next 24 hours
- Filter for events with video call URLs (Zoom/Teams/Meet links in notes or URL field)

**Step 2: Schedule pre-meeting notifications**

2 minutes before a calendar event with a video call link, emit a notification.

**Step 3: Auto-populate meeting title from calendar event**

When user starts recording from a calendar notification, pre-fill the meeting title.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: calendar integration via EventKit"
```

---

## Phase 8: MCP Server

### Task 25: Set up rmcp MCP server

**Files:**
- Modify: `src-tauri/src/mcp.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add rmcp dependency**

```toml
rmcp = { version = "0.11", features = ["server", "transport-io"] }
schemars = "1.0"
```

**Step 2: Implement MCP server struct**

`src-tauri/src/mcp.rs`:
```rust
use rmcp::{
    ErrorData as McpError, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::*,
    schemars,
    tool, tool_handler, tool_router,
};
use crate::db::Database;
use std::sync::Arc;

#[derive(Clone)]
pub struct NootleMcpServer {
    db: Arc<Database>,
    tool_router: ToolRouter<NootleMcpServer>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListMeetingsParams {
    #[schemars(description = "Optional category ID to filter by")]
    pub category_id: Option<String>,
    #[schemars(description = "Optional search query for meeting titles")]
    pub search: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetMeetingParams {
    #[schemars(description = "The meeting ID")]
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SearchTranscriptsParams {
    #[schemars(description = "Full-text search query")]
    pub query: String,
}

#[tool_router]
impl NootleMcpServer {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "List meetings with optional filters by category or search query")]
    fn list_meetings(
        &self,
        Parameters(params): Parameters<ListMeetingsParams>,
    ) -> Result<CallToolResult, McpError> {
        let meetings = self.db
            .list_meetings(params.category_id.as_deref(), params.search.as_deref())
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        let json = serde_json::to_string_pretty(&meetings)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Get full meeting details including transcript and summaries")]
    fn get_meeting(
        &self,
        Parameters(params): Parameters<GetMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        let meeting = self.db
            .get_meeting(&params.id)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        let transcript = self.db
            .get_transcript(&params.id)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        let summaries = self.db
            .get_summaries_for_meeting(&params.id)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        let result = serde_json::json!({
            "meeting": meeting,
            "transcript": transcript,
            "summaries": summaries,
        });
        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Full-text search across all meeting transcripts")]
    fn search_transcripts(
        &self,
        Parameters(params): Parameters<SearchTranscriptsParams>,
    ) -> Result<CallToolResult, McpError> {
        let results = self.db
            .search_transcripts(&params.query)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        let json = serde_json::to_string_pretty(&results)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }
}

#[tool_handler]
impl ServerHandler for NootleMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
            server_info: Implementation {
                name: "nootle".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
            instructions: Some("Nootle meeting recorder. Access meeting transcripts, summaries, and notes.".to_string()),
        }
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        let meetings = self.db
            .list_meetings(None, None)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        let resources: Vec<_> = meetings.iter().map(|m| {
            RawResource::new(
                format!("nootle://meetings/{}/transcript", m.id),
                format!("{} - Transcript", m.title),
            ).no_annotation()
        }).collect();

        Ok(ListResourcesResult {
            resources,
            next_cursor: None,
            meta: None,
        })
    }

    async fn read_resource(
        &self,
        params: ReadResourceRequestParams,
        _ctx: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let uri = params.uri.as_str();
        if let Some(meeting_id) = uri.strip_prefix("nootle://meetings/").and_then(|s| s.strip_suffix("/transcript")) {
            let transcript = self.db
                .get_transcript(meeting_id)
                .map_err(|e| McpError::internal_error(e.to_string(), None))?;
            let text = transcript.iter()
                .map(|s| format!("[{}-{}ms] {}: {}", s.start_ms, s.end_ms, s.speaker_label, s.text))
                .collect::<Vec<_>>()
                .join("\n");
            Ok(ReadResourceResult {
                contents: vec![ResourceContents::text(text, uri.to_string())],
            })
        } else {
            Err(McpError::resource_not_found("resource_not_found", None))
        }
    }
}
```

**Step 3: Add `--mcp` CLI flag to main.rs**

Modify `src-tauri/src/main.rs`:
```rust
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.contains(&"--mcp".to_string()) {
        // Run as MCP server (stdio mode, no GUI)
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let db = /* initialize DB */;
            let server = NootleMcpServer::new(db);
            let service = server.serve(rmcp::transport::stdio()).await.unwrap();
            service.waiting().await.unwrap();
        });
    } else {
        // Normal GUI mode
        nootle_app_lib::run();
    }
}
```

**Step 4: Verify MCP server responds**

Test with: `echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | cargo run -- --mcp`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: MCP server with meeting tools and transcript resources"
```

---

## Phase 9: Frontend UI

### Task 26: App layout and navigation

**Files:**
- Create: `src/components/Layout.tsx`
- Create: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/MeetingLibrary.tsx`, `src/pages/Settings.tsx`

**Step 1: Install React Router**

```bash
pnpm add react-router-dom
```

**Step 2: Build sidebar layout**

Sidebar with navigation: Meetings, Templates, Prompts, Settings. Main content area to the right. Use shadcn/ui components, Tailwind for layout.

Design: dark neutral background (#09090b), sidebar ~240px wide, subtle border separator. Active nav item highlighted with accent color.

**Step 3: Verify it renders**

**Step 4: Commit**

```bash
git add -A
git commit -m "ui: app layout with sidebar navigation"
```

---

### Task 27: Meeting Library page

**Files:**
- Modify: `src/pages/MeetingLibrary.tsx`
- Create: `src/components/MeetingCard.tsx`
- Create: `src/hooks/useMeetings.ts`

**Step 1: Create useMeetings hook**

```tsx
import { invoke } from "@tauri-apps/api/core";

export function useMeetings() {
    // Fetch meetings via Tauri invoke
    // Return { meetings, loading, error, refetch }
}
```

**Step 2: Build MeetingCard component**

Card showing: title, date/time, duration, category badge, summary preview. Hover state, click to navigate to detail.

**Step 3: Build MeetingLibrary page**

Grid of MeetingCards, search bar at top, category filter dropdown. Empty state when no meetings.

**Step 4: Commit**

```bash
git add -A
git commit -m "ui: meeting library page with cards and search"
```

---

### Task 28: Recording view

**Files:**
- Create: `src/pages/RecordingView.tsx`
- Create: `src/components/Waveform.tsx`
- Create: `src/components/LiveTranscript.tsx`

**Step 1: Build Waveform component**

Canvas-based waveform visualization. Listen to `audio-level` Tauri events, render bars.

**Step 2: Build LiveTranscript component**

Listen to `transcript-update` Tauri events, display segments with speaker labels, auto-scroll to bottom.

**Step 3: Build RecordingView page**

- Large waveform at top
- Editable meeting title
- Timer display (elapsed time)
- Live transcript below
- Large "Stop" button (with Framer Motion scale animation)

**Step 4: Commit**

```bash
git add -A
git commit -m "ui: recording view with waveform and live transcript"
```

---

### Task 29: Meeting detail page

**Files:**
- Create: `src/pages/MeetingDetail.tsx`
- Create: `src/components/TranscriptViewer.tsx`
- Create: `src/components/SummaryPanel.tsx`
- Create: `src/components/AudioPlayer.tsx`

**Step 1: Build TranscriptViewer**

Scrollable list of transcript segments. Each segment shows speaker label (color-coded), text, and timestamp. Click timestamp to seek audio. Search within transcript.

**Step 2: Build SummaryPanel**

Display summaries. Tab bar to switch between different prompt outputs. Button to generate new summary with provider/model picker.

**Step 3: Build AudioPlayer**

Compact audio player at bottom. Play/pause, seek bar, playback speed, time display. Sync with transcript position (highlight current segment).

**Step 4: Assemble MeetingDetail page**

Three-panel layout: transcript left, summary right, audio player bottom.

**Step 5: Commit**

```bash
git add -A
git commit -m "ui: meeting detail with transcript, summaries, and audio player"
```

---

### Task 30: AI Chat panel

**Files:**
- Create: `src/components/ChatPanel.tsx`
- Modify: `src/pages/MeetingDetail.tsx`

**Step 1: Build ChatPanel**

Slide-over panel from right side of meeting detail. Chat interface with:
- Message list (user/assistant alternating)
- Input bar with send button
- Provider/model selector in header
- Streaming response display

**Step 2: Connect to Tauri chat command**

Invoke `chat_with_transcript` command, stream responses via events.

**Step 3: Commit**

```bash
git add -A
git commit -m "ui: AI chat panel for transcript Q&A"
```

---

### Task 31: Templates and Prompts management

**Files:**
- Create: `src/pages/Templates.tsx`
- Create: `src/pages/Prompts.tsx`
- Create: `src/components/PromptEditor.tsx`

**Step 1: Build Prompts page**

List of prompts with:
- Name, preview of content
- Favorite toggle (star icon)
- Auto-run toggle
- Edit/delete actions
- "Add Prompt" button opens editor dialog

**Step 2: Build Templates page**

List of templates with:
- Name, associated category
- Section list preview
- Auto-apply rules display
- Edit/delete actions

**Step 3: Seed default prompts**

On first launch, create default prompts:
- "Meeting Summary" — concise summary of key points
- "Action Items" — extract action items with owners
- "Key Decisions" — list decisions made
- "Follow-up Questions" — questions that need answers

**Step 4: Commit**

```bash
git add -A
git commit -m "ui: templates and prompts management pages"
```

---

### Task 32: Settings page

**Files:**
- Create: `src/pages/Settings.tsx`

**Step 1: Build Settings sections**

- **API Keys**: per-provider key input with show/hide toggle, test connection button
- **Audio**: input device selector, system audio toggle
- **Notifications**: meeting detection toggle, calendar notifications toggle, per-app toggles
- **Categories**: add/edit/delete categories with color picker and icon
- **Appearance**: theme toggle (light/dark/system)
- **About**: version, MCP config snippet with copy button

**Step 2: Connect to Tauri keychain commands**

Load/save API keys via keychain commands.

**Step 3: Commit**

```bash
git add -A
git commit -m "ui: settings page with API keys, audio, notifications, and appearance"
```

---

### Task 33: Onboarding flow

**Files:**
- Create: `src/components/Onboarding.tsx`
- Modify: `src/App.tsx`

**Step 1: Build onboarding wizard**

Multi-step dialog on first launch:
1. Welcome screen — app overview
2. Permissions — request Screen Recording, Microphone, Notifications, Calendar. Show status for each.
3. Model download — download Parakeet v3 + diarization models with progress bars
4. API keys — optional setup for LLM providers
5. Done — ready to use

**Step 2: Check first-launch flag**

Store `onboarding_complete` in SQLite settings table or a config file.

**Step 3: Commit**

```bash
git add -A
git commit -m "ui: first-launch onboarding wizard"
```

---

## Phase 10: Polish and Integration

### Task 34: macOS app configuration

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/Info.plist`
- Create: `src-tauri/entitlements.plist`

**Step 1: Configure Tauri**

Set app name, identifier (`com.nootle.app`), window size (1200x800 default), title bar style (overlay for macOS).

**Step 2: Add Info.plist entries**

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Nootle records meeting audio for transcription.</string>
<key>NSScreenCaptureUsageDescription</key>
<string>Nootle captures system audio for meeting transcription.</string>
<key>NSAudioCaptureUsageDescription</key>
<string>Nootle captures system audio output for meeting transcription.</string>
<key>NSCalendarsUsageDescription</key>
<string>Nootle reads your calendar to detect upcoming meetings.</string>
```

**Step 3: Add entitlements**

```xml
<key>com.apple.security.device.audio-input</key><true/>
<key>com.apple.security.device.audio-output</key><true/>
<key>com.apple.security.device.microphone</key><true/>
<key>com.apple.security.device.screen-capture</key><true/>
```

**Step 4: Commit**

```bash
git add -A
git commit -m "config: macOS permissions, entitlements, and Tauri configuration"
```

---

### Task 35: End-to-end integration test

**Step 1: Manual test the full flow**

1. Launch app (`pnpm tauri dev`)
2. Complete onboarding
3. Start a recording
4. Play audio through speakers (or join a test call)
5. Stop recording
6. Verify transcript appears
7. Generate a summary
8. Chat with transcript
9. Test MCP server: `echo '...' | cargo run -- --mcp`

**Step 2: Fix any integration issues discovered**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
```

---

## Dependency Summary

### Rust (`src-tauri/Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-notification = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.32", features = ["bundled", "serde_json"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
anyhow = "1"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
futures-util = "0.3"
async-trait = "0.1"
dirs = "6"
cpal = "0.15"
ringbuf = "0.4"
hound = "3.5"
cidre = { version = "0.14", features = ["av"] }
ort = { version = "2.0.0-rc.10", features = ["ndarray", "coreml"] }
ndarray = "0.16"
pyannote-rs = { version = "0.3", features = ["coreml"] }
sysinfo = "0.32"
security-framework = "3"
rmcp = { version = "0.11", features = ["server", "transport-io"] }
schemars = "1.0"
```

### Frontend (`package.json`)

```
react, react-dom, react-router-dom
@tauri-apps/api, @tauri-apps/plugin-notification
tailwindcss, @tailwindcss/vite
shadcn/ui components (button, card, input, dialog, dropdown-menu, scroll-area, separator, tabs, badge, tooltip)
framer-motion
```
