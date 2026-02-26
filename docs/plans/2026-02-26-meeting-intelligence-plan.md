# Meeting Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-extract decisions, action items, and key moments from meeting transcripts; display inline per meeting and on a cross-meeting insights dashboard with full action item workflow.

**Architecture:** New `extraction.rs` module runs a structured LLM extraction after transcription completes. Results stored in `insights` + `action_items` + `extraction_runs` SQLite tables. Frontend adds an Insights tab to MeetingDetail and a new Insights dashboard page.

**Tech Stack:** Rust/Tauri (backend), React/TypeScript/Tailwind (frontend), SQLite, serde_json for LLM JSON parsing.

---

### Task 1: Add DB Tables and Rust Structs

**Files:**
- Modify: `src-tauri/src/db.rs:1-18` (add structs after existing ones)
- Modify: `src-tauri/src/db.rs:178-279` (add tables to `initialize()`)

**Step 1: Add structs to `db.rs`**

After the `TranscriptSearchResult` struct (line 153), add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insight {
    pub id: String,
    pub meeting_id: String,
    #[serde(rename = "type")]
    pub insight_type: String,
    pub content: String,
    pub context: Option<String>,
    pub transcript_start_ms: Option<i64>,
    pub transcript_end_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewInsight {
    pub meeting_id: String,
    pub insight_type: String,
    pub content: String,
    pub context: Option<String>,
    pub transcript_start_ms: Option<i64>,
    pub transcript_end_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    pub id: String,
    pub insight_id: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub status: String,
    pub linear_ticket_id: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewActionItem {
    pub insight_id: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionRun {
    pub id: String,
    pub meeting_id: String,
    pub provider: String,
    pub model: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightWithActionItem {
    pub id: String,
    pub meeting_id: String,
    #[serde(rename = "type")]
    pub insight_type: String,
    pub content: String,
    pub context: Option<String>,
    pub transcript_start_ms: Option<i64>,
    pub transcript_end_ms: Option<i64>,
    pub created_at: String,
    // Action item fields (null for non-action-items)
    pub action_item_id: Option<String>,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub status: Option<String>,
    pub linear_ticket_id: Option<String>,
    pub action_item_updated_at: Option<String>,
    // Meeting context (for dashboard)
    pub meeting_title: Option<String>,
    pub meeting_start_time: Option<String>,
}
```

**Step 2: Add CREATE TABLE statements to `initialize()`**

Inside `initialize()`, after the `summaries_fts` triggers (before the closing `"`), add:

```sql
CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT,
    transcript_start_ms INTEGER,
    transcript_end_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    insight_id TEXT NOT NULL UNIQUE REFERENCES insights(id) ON DELETE CASCADE,
    assignee TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    linear_ticket_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extraction_runs (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(
    content, content='insights', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS insights_ai AFTER INSERT ON insights BEGIN
    INSERT INTO insights_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS insights_ad AFTER DELETE ON insights BEGIN
    INSERT INTO insights_fts(insights_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
```

**Step 3: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compiles with no errors (warnings OK)

**Step 4: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): add insights, action_items, extraction_runs tables"
```

---

### Task 2: Add DB CRUD Methods for Insights

**Files:**
- Modify: `src-tauri/src/db.rs` (add methods to `impl Database`)

**Step 1: Add insight CRUD methods**

After the `search_transcripts` method (around line 901), add these methods inside `impl Database`:

```rust
// --- Insights ---

pub fn create_insight(&self, new: NewInsight) -> Result<Insight> {
    let conn = self.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO insights (id, meeting_id, type, content, context, transcript_start_ms, transcript_end_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, new.meeting_id, new.insight_type, new.content, new.context, new.transcript_start_ms, new.transcript_end_ms, now],
    )?;

    Ok(Insight {
        id,
        meeting_id: new.meeting_id,
        insight_type: new.insight_type,
        content: new.content,
        context: new.context,
        transcript_start_ms: new.transcript_start_ms,
        transcript_end_ms: new.transcript_end_ms,
        created_at: now,
    })
}

pub fn get_insights_for_meeting(&self, meeting_id: &str) -> Result<Vec<InsightWithActionItem>> {
    let conn = self.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT i.id, i.meeting_id, i.type, i.content, i.context, i.transcript_start_ms, i.transcript_end_ms, i.created_at,
                a.id, a.assignee, a.due_date, a.status, a.linear_ticket_id, a.updated_at,
                m.title, m.start_time
         FROM insights i
         LEFT JOIN action_items a ON a.insight_id = i.id
         LEFT JOIN meetings m ON m.id = i.meeting_id
         WHERE i.meeting_id = ?1
         ORDER BY i.transcript_start_ms ASC NULLS LAST, i.created_at ASC",
    )?;

    let rows = stmt
        .query_map(params![meeting_id], |row| {
            Ok(InsightWithActionItem {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                insight_type: row.get(2)?,
                content: row.get(3)?,
                context: row.get(4)?,
                transcript_start_ms: row.get(5)?,
                transcript_end_ms: row.get(6)?,
                created_at: row.get(7)?,
                action_item_id: row.get(8)?,
                assignee: row.get(9)?,
                due_date: row.get(10)?,
                status: row.get(11)?,
                linear_ticket_id: row.get(12)?,
                action_item_updated_at: row.get(13)?,
                meeting_title: row.get(14)?,
                meeting_start_time: row.get(15)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}

pub fn get_all_insights(
    &self,
    insight_type: Option<&str>,
    status: Option<&str>,
    search: Option<&str>,
) -> Result<Vec<InsightWithActionItem>> {
    let conn = self.conn.lock().unwrap();

    let mut sql = String::from(
        "SELECT i.id, i.meeting_id, i.type, i.content, i.context, i.transcript_start_ms, i.transcript_end_ms, i.created_at,
                a.id, a.assignee, a.due_date, a.status, a.linear_ticket_id, a.updated_at,
                m.title, m.start_time
         FROM insights i
         LEFT JOIN action_items a ON a.insight_id = i.id
         LEFT JOIN meetings m ON m.id = i.meeting_id"
    );
    let mut conditions: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(t) = insight_type {
        conditions.push(format!("i.type = ?{}", param_values.len() + 1));
        param_values.push(Box::new(t.to_string()));
    }

    if let Some(s) = status {
        conditions.push(format!("a.status = ?{}", param_values.len() + 1));
        param_values.push(Box::new(s.to_string()));
    }

    if let Some(q) = search {
        conditions.push(format!(
            "i.rowid IN (SELECT rowid FROM insights_fts WHERE insights_fts MATCH ?{})",
            param_values.len() + 1
        ));
        param_values.push(Box::new(q.to_string()));
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    // Action items: open first, then by due date. Others: most recent first.
    sql.push_str(
        " ORDER BY CASE WHEN a.status = 'open' THEN 0 ELSE 1 END, a.due_date ASC NULLS LAST, i.created_at DESC"
    );

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(InsightWithActionItem {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                insight_type: row.get(2)?,
                content: row.get(3)?,
                context: row.get(4)?,
                transcript_start_ms: row.get(5)?,
                transcript_end_ms: row.get(6)?,
                created_at: row.get(7)?,
                action_item_id: row.get(8)?,
                assignee: row.get(9)?,
                due_date: row.get(10)?,
                status: row.get(11)?,
                linear_ticket_id: row.get(12)?,
                action_item_updated_at: row.get(13)?,
                meeting_title: row.get(14)?,
                meeting_start_time: row.get(15)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}

pub fn delete_insights_for_meeting(&self, meeting_id: &str) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    conn.execute("DELETE FROM insights WHERE meeting_id = ?1", params![meeting_id])?;
    Ok(())
}

// --- Action Items ---

pub fn create_action_item(&self, new: NewActionItem) -> Result<ActionItem> {
    let conn = self.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO action_items (id, insight_id, assignee, due_date, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'open', ?5)",
        params![id, new.insight_id, new.assignee, new.due_date, now],
    )?;

    Ok(ActionItem {
        id,
        insight_id: new.insight_id,
        assignee: new.assignee,
        due_date: new.due_date,
        status: "open".to_string(),
        linear_ticket_id: None,
        updated_at: now,
    })
}

pub fn update_action_item_status(&self, id: &str, status: &str) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE action_items SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, id],
    )?;
    Ok(())
}

pub fn update_action_item(&self, id: &str, assignee: Option<&str>, due_date: Option<&str>) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE action_items SET assignee = ?1, due_date = ?2, updated_at = ?3 WHERE id = ?4",
        params![assignee, due_date, now, id],
    )?;
    Ok(())
}

pub fn set_action_item_linear_ticket(&self, id: &str, linear_ticket_id: &str) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE action_items SET linear_ticket_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![linear_ticket_id, now, id],
    )?;
    Ok(())
}

// --- Extraction Runs ---

pub fn create_extraction_run(&self, meeting_id: &str, provider: &str, model: &str) -> Result<ExtractionRun> {
    let conn = self.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO extraction_runs (id, meeting_id, provider, model, status, created_at)
         VALUES (?1, ?2, ?3, ?4, 'running', ?5)",
        params![id, meeting_id, provider, model, now],
    )?;

    Ok(ExtractionRun {
        id,
        meeting_id: meeting_id.to_string(),
        provider: provider.to_string(),
        model: model.to_string(),
        status: "running".to_string(),
        created_at: now,
    })
}

pub fn update_extraction_run_status(&self, id: &str, status: &str) -> Result<()> {
    let conn = self.conn.lock().unwrap();
    conn.execute(
        "UPDATE extraction_runs SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compiles with no errors

**Step 3: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): add CRUD methods for insights, action items, extraction runs"
```

---

### Task 3: Create Extraction Pipeline Module

**Files:**
- Create: `src-tauri/src/extraction.rs`
- Modify: `src-tauri/src/lib.rs:1` (add `pub mod extraction;`)

**Step 1: Create `extraction.rs`**

```rust
use crate::db::{Database, NewActionItem, NewInsight};
use crate::llm::{ChatMessage, LlmRegistry};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ExtractionResponse {
    #[serde(default)]
    decisions: Vec<ExtractedItem>,
    #[serde(default)]
    action_items: Vec<ExtractedActionItem>,
    #[serde(default)]
    key_moments: Vec<ExtractedItem>,
}

#[derive(Debug, Deserialize)]
struct ExtractedItem {
    content: String,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    timestamp_ms: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ExtractedActionItem {
    content: String,
    #[serde(default)]
    assignee: Option<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    timestamp_ms: Option<i64>,
}

const EXTRACTION_PROMPT: &str = r#"You are a meeting intelligence assistant. Analyze the meeting transcript and extract structured insights.

Return ONLY a JSON object with exactly this schema (no markdown, no extra text):
{
  "decisions": [
    { "content": "concise decision text", "context": "brief surrounding context", "timestamp_ms": 12345 }
  ],
  "action_items": [
    { "content": "what needs to be done", "assignee": "person name or null", "due_date": "YYYY-MM-DD or null", "context": "brief context", "timestamp_ms": 12345 }
  ],
  "key_moments": [
    { "content": "important moment description", "context": "brief context", "timestamp_ms": 12345 }
  ]
}

Rules:
- timestamp_ms should match the approximate start time from the transcript timestamps
- assignee should be a person's name if mentioned, otherwise null
- due_date should be ISO format (YYYY-MM-DD) if a date is mentioned, otherwise null
- Return empty arrays if no items of that type are found
- Be concise: each content field should be 1-2 sentences max
- Only extract items that are clearly stated, not implied"#;

fn format_transcript(db: &Database, meeting_id: &str) -> anyhow::Result<String> {
    let transcript = db.get_transcript(meeting_id)?;
    if transcript.is_empty() {
        anyhow::bail!("No transcript found for meeting {}", meeting_id);
    }

    Ok(transcript
        .iter()
        .map(|s| {
            let total_seconds = s.start_ms / 1000;
            let minutes = total_seconds / 60;
            let seconds = total_seconds % 60;
            format!("[{:02}:{:02}] {}: {}", minutes, seconds, s.speaker_label, s.text)
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Strip markdown code fences if the LLM wraps the JSON in them.
fn strip_code_fences(s: &str) -> &str {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.strip_suffix("```").unwrap_or(rest).trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.strip_suffix("```").unwrap_or(rest).trim()
    } else {
        trimmed
    }
}

pub async fn extract_insights(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<()> {
    let transcript_text = format_transcript(db, meeting_id)?;

    // Create extraction run
    let run = db.create_extraction_run(meeting_id, provider_name, model)?;

    // Call LLM
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: EXTRACTION_PROMPT.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!("Here is the meeting transcript:\n\n{}", transcript_text),
        },
    ];

    let provider = llm
        .get_provider(provider_name)
        .ok_or_else(|| anyhow::anyhow!("Provider '{}' not found", provider_name))?;

    let response = match provider.chat(messages, model).await {
        Ok(r) => r,
        Err(e) => {
            let _ = db.update_extraction_run_status(&run.id, "failed");
            return Err(e);
        }
    };

    // Parse JSON
    let cleaned = strip_code_fences(&response);
    let extracted: ExtractionResponse = match serde_json::from_str(cleaned) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse extraction response: {e}\nRaw: {response}");
            let _ = db.update_extraction_run_status(&run.id, "failed");
            anyhow::bail!("Failed to parse extraction response: {e}");
        }
    };

    // Store decisions
    for item in &extracted.decisions {
        db.create_insight(NewInsight {
            meeting_id: meeting_id.to_string(),
            insight_type: "decision".to_string(),
            content: item.content.clone(),
            context: item.context.clone(),
            transcript_start_ms: item.timestamp_ms,
            transcript_end_ms: None,
        })?;
    }

    // Store key moments
    for item in &extracted.key_moments {
        db.create_insight(NewInsight {
            meeting_id: meeting_id.to_string(),
            insight_type: "key_moment".to_string(),
            content: item.content.clone(),
            context: item.context.clone(),
            transcript_start_ms: item.timestamp_ms,
            transcript_end_ms: None,
        })?;
    }

    // Store action items (insight + action_item row)
    for item in &extracted.action_items {
        let insight = db.create_insight(NewInsight {
            meeting_id: meeting_id.to_string(),
            insight_type: "action_item".to_string(),
            content: item.content.clone(),
            context: item.context.clone(),
            transcript_start_ms: item.timestamp_ms,
            transcript_end_ms: None,
        })?;

        db.create_action_item(NewActionItem {
            insight_id: insight.id,
            assignee: item.assignee.clone(),
            due_date: item.due_date.clone(),
        })?;
    }

    db.update_extraction_run_status(&run.id, "completed")?;
    Ok(())
}

pub async fn re_extract_insights(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider_name: &str,
    model: &str,
) -> anyhow::Result<()> {
    db.delete_insights_for_meeting(meeting_id)?;
    extract_insights(db, llm, meeting_id, provider_name, model).await
}
```

**Step 2: Register the module in `lib.rs`**

In `src-tauri/src/lib.rs`, after `pub mod diarization;` (line 5), add:

```rust
pub mod extraction;
```

**Step 3: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compiles with no errors

**Step 4: Commit**

```bash
git add src-tauri/src/extraction.rs src-tauri/src/lib.rs
git commit -m "feat: add extraction pipeline for meeting insights"
```

---

### Task 4: Add Tauri Commands for Insights

**Files:**
- Modify: `src-tauri/src/commands.rs` (add new commands)
- Modify: `src-tauri/src/lib.rs:207-255` (register commands in invoke_handler)

**Step 1: Add imports to `commands.rs`**

At line 8, after `use crate::summarization;`, add:

```rust
use crate::extraction;
```

**Step 2: Add insight commands to `commands.rs`**

After the `delete_model` command (line 769), add:

```rust
// Insight commands

#[tauri::command]
pub fn get_insights(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<crate::db::InsightWithActionItem>, String> {
    db.get_insights_for_meeting(&meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_insights(
    db: State<'_, DbState>,
    insight_type: Option<String>,
    status: Option<String>,
    search: Option<String>,
) -> Result<Vec<crate::db::InsightWithActionItem>, String> {
    db.get_all_insights(
        insight_type.as_deref(),
        status.as_deref(),
        search.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn extract_meeting_insights(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    meeting_id: String,
    provider: String,
    model: String,
) -> Result<(), String> {
    let llm = llm.read().await;
    extraction::extract_insights(&db, &llm, &meeting_id, &provider, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn re_extract_meeting_insights(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    meeting_id: String,
    provider: String,
    model: String,
) -> Result<(), String> {
    let llm = llm.read().await;
    extraction::re_extract_insights(&db, &llm, &meeting_id, &provider, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_action_item_status(
    db: State<'_, DbState>,
    id: String,
    status: String,
) -> Result<(), String> {
    db.update_action_item_status(&id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_action_item(
    db: State<'_, DbState>,
    id: String,
    assignee: Option<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    db.update_action_item(&id, assignee.as_deref(), due_date.as_deref())
        .map_err(|e| e.to_string())
}
```

**Step 3: Register commands in `lib.rs`**

In `src-tauri/src/lib.rs`, inside the `invoke_handler` macro (before the closing `]`), add:

```rust
commands::get_insights,
commands::get_all_insights,
commands::extract_meeting_insights,
commands::re_extract_meeting_insights,
commands::update_action_item_status,
commands::update_action_item,
```

**Step 4: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compiles with no errors

**Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for insights CRUD and extraction"
```

---

### Task 5: Add Frontend TypeScript Types

**Files:**
- Modify: `src/types.ts:98` (add after LinearProject)

**Step 1: Add types**

After the `LinearProject` interface (line 98), add:

```typescript
export interface InsightWithActionItem {
  id: string;
  meeting_id: string;
  type: string; // "decision" | "action_item" | "key_moment"
  content: string;
  context: string | null;
  transcript_start_ms: number | null;
  transcript_end_ms: number | null;
  created_at: string;
  action_item_id: string | null;
  assignee: string | null;
  due_date: string | null;
  status: string | null; // "open" | "done"
  linear_ticket_id: string | null;
  action_item_updated_at: string | null;
  meeting_title: string | null;
  meeting_start_time: string | null;
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add InsightWithActionItem TypeScript type"
```

---

### Task 6: Create `useInsights` Hook

**Files:**
- Create: `src/hooks/useInsights.ts`

**Step 1: Create the hook**

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InsightWithActionItem } from "@/types";

export function useInsights(meetingId: string) {
  const [insights, setInsights] = useState<InsightWithActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<InsightWithActionItem[]>("get_insights", {
        meetingId,
      });
      setInsights(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const extractInsights = useCallback(
    async (provider: string, model: string) => {
      await invoke("extract_meeting_insights", {
        meetingId,
        provider,
        model,
      });
      await refresh();
    },
    [meetingId, refresh],
  );

  const reExtractInsights = useCallback(
    async (provider: string, model: string) => {
      await invoke("re_extract_meeting_insights", {
        meetingId,
        provider,
        model,
      });
      await refresh();
    },
    [meetingId, refresh],
  );

  const toggleActionItem = useCallback(
    async (actionItemId: string, currentStatus: string) => {
      const newStatus = currentStatus === "open" ? "done" : "open";
      await invoke("update_action_item_status", {
        id: actionItemId,
        status: newStatus,
      });
      await refresh();
    },
    [refresh],
  );

  const updateActionItem = useCallback(
    async (
      actionItemId: string,
      assignee: string | null,
      dueDate: string | null,
    ) => {
      await invoke("update_action_item", {
        id: actionItemId,
        assignee,
        dueDate,
      });
      await refresh();
    },
    [refresh],
  );

  const decisions = insights.filter((i) => i.type === "decision");
  const actionItems = insights.filter((i) => i.type === "action_item");
  const keyMoments = insights.filter((i) => i.type === "key_moment");

  return {
    insights,
    decisions,
    actionItems,
    keyMoments,
    loading,
    error,
    refresh,
    extractInsights,
    reExtractInsights,
    toggleActionItem,
    updateActionItem,
  };
}

export function useAllInsights(
  insightType?: string,
  status?: string,
  search?: string,
) {
  const [insights, setInsights] = useState<InsightWithActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<InsightWithActionItem[]>("get_all_insights", {
        insightType: insightType || null,
        status: status || null,
        search: search || null,
      });
      setInsights(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [insightType, status, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleActionItem = useCallback(
    async (actionItemId: string, currentStatus: string) => {
      const newStatus = currentStatus === "open" ? "done" : "open";
      await invoke("update_action_item_status", {
        id: actionItemId,
        status: newStatus,
      });
      await refresh();
    },
    [refresh],
  );

  const decisions = insights.filter((i) => i.type === "decision");
  const actionItems = insights.filter((i) => i.type === "action_item");
  const keyMoments = insights.filter((i) => i.type === "key_moment");

  return {
    insights,
    decisions,
    actionItems,
    keyMoments,
    loading,
    error,
    refresh,
    toggleActionItem,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useInsights.ts
git commit -m "feat: add useInsights and useAllInsights hooks"
```

---

### Task 7: Add Insights Tab to MeetingDetail Page

**Files:**
- Modify: `src/pages/MeetingDetail.tsx`

This is the largest frontend task. The MeetingDetail page currently has a two-column layout: transcript on the left, summaries on the right. We'll change the right column to have tabs: "Summaries" and "Insights".

**Step 1: Add imports**

At the top of `MeetingDetail.tsx`, add to the existing imports:

```typescript
import { useInsights } from "@/hooks/useInsights";
import { Check, RotateCw, Lightbulb, ListChecks, Star } from "lucide-react";
```

**Step 2: Add the InsightsPanel component**

Before the `MeetingDetail` function, add a new component:

```typescript
function InsightsPanel({
  meetingId,
  providers,
  models,
}: {
  meetingId: string;
  providers: string[];
  models: ModelInfo[];
}) {
  const {
    decisions,
    actionItems,
    keyMoments,
    loading,
    extractInsights,
    reExtractInsights,
    toggleActionItem,
    updateActionItem,
  } = useInsights(meetingId);

  const [extracting, setExtracting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(providers[0] ?? "");
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
  }, [providers, selectedProvider]);

  useEffect(() => {
    if (selectedProvider && models.length > 0 && !selectedModel) {
      const providerModels = models.filter(
        (m) => m.provider === selectedProvider,
      );
      if (providerModels.length > 0) {
        setSelectedModel(providerModels[0].id);
      }
    }
  }, [selectedProvider, models, selectedModel]);

  const filteredModels = models.filter(
    (m) => m.provider === selectedProvider,
  );

  const hasInsights =
    decisions.length > 0 || actionItems.length > 0 || keyMoments.length > 0;

  const handleExtract = async () => {
    if (!selectedProvider || !selectedModel) return;
    setExtracting(true);
    try {
      if (hasInsights) {
        await reExtractInsights(selectedProvider, selectedModel);
      } else {
        await extractInsights(selectedProvider, selectedModel);
      }
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading insights...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {!hasInsights ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <Lightbulb className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            No insights extracted yet. Pick a provider and extract.
          </p>
          <div className="flex gap-2 w-full max-w-xs">
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setSelectedModel("");
              }}
              className="h-8 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 flex-1 rounded-md border bg-transparent px-2 text-xs"
            >
              <option value="">Model</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={handleExtract}
            disabled={extracting || !selectedProvider || !selectedModel}
          >
            {extracting ? "Extracting..." : "Extract Insights"}
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Decisions */}
            {decisions.length > 0 && (
              <InsightSection title="Decisions" icon={<Lightbulb className="h-4 w-4" />} count={decisions.length}>
                {decisions.map((d) => (
                  <div key={d.id} className="flex gap-2 py-1.5">
                    <span className="text-sm flex-1">{d.content}</span>
                    {d.transcript_start_ms != null && (
                      <span className="shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
                        {formatMs(d.transcript_start_ms)}
                      </span>
                    )}
                  </div>
                ))}
              </InsightSection>
            )}

            {/* Action Items */}
            {actionItems.length > 0 && (
              <InsightSection title="Action Items" icon={<ListChecks className="h-4 w-4" />} count={actionItems.length}>
                {actionItems.map((ai) => (
                  <ActionItemRow
                    key={ai.id}
                    item={ai}
                    onToggle={() =>
                      ai.action_item_id &&
                      toggleActionItem(ai.action_item_id, ai.status ?? "open")
                    }
                    onUpdate={(assignee, dueDate) =>
                      ai.action_item_id &&
                      updateActionItem(ai.action_item_id, assignee, dueDate)
                    }
                  />
                ))}
              </InsightSection>
            )}

            {/* Key Moments */}
            {keyMoments.length > 0 && (
              <InsightSection title="Key Moments" icon={<Star className="h-4 w-4" />} count={keyMoments.length}>
                {keyMoments.map((km) => (
                  <div key={km.id} className="flex gap-2 py-1.5">
                    <span className="text-sm flex-1">{km.content}</span>
                    {km.transcript_start_ms != null && (
                      <span className="shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
                        {formatMs(km.transcript_start_ms)}
                      </span>
                    )}
                  </div>
                ))}
              </InsightSection>
            )}

            {/* Re-extract button */}
            <div className="flex items-center gap-2 pt-2">
              <div className="flex gap-2 flex-1">
                <select
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    setSelectedModel("");
                  }}
                  className="h-7 flex-1 rounded-md border bg-transparent px-2 text-xs"
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-7 flex-1 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="">Model</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtract}
                disabled={extracting || !selectedProvider || !selectedModel}
              >
                <RotateCw className={`h-3 w-3 mr-1 ${extracting ? "animate-spin" : ""}`} />
                {extracting ? "Extracting..." : "Re-extract"}
              </Button>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function InsightSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-md border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
      >
        {icon}
        <span>{title}</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {count}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {collapsed ? "+" : "-"}
        </span>
      </button>
      {!collapsed && <div className="px-3 pb-2 space-y-1">{children}</div>}
    </div>
  );
}

function ActionItemRow({
  item,
  onToggle,
  onUpdate,
}: {
  item: InsightWithActionItem;
  onToggle: () => void;
  onUpdate: (assignee: string | null, dueDate: string | null) => void;
}) {
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [assigneeValue, setAssigneeValue] = useState(item.assignee ?? "");
  const [dueDateValue, setDueDateValue] = useState(item.due_date ?? "");
  const isDone = item.status === "done";

  return (
    <div className="py-1.5 space-y-1">
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
            isDone
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground hover:border-foreground"
          }`}
        >
          {isDone && <Check className="h-3 w-3" />}
        </button>
        <span className={`text-sm flex-1 ${isDone ? "line-through text-muted-foreground" : ""}`}>
          {item.content}
        </span>
      </div>
      <div className="flex items-center gap-3 pl-6 text-xs text-muted-foreground">
        {editingAssignee ? (
          <input
            autoFocus
            value={assigneeValue}
            onChange={(e) => setAssigneeValue(e.target.value)}
            onBlur={() => {
              setEditingAssignee(false);
              onUpdate(assigneeValue || null, item.due_date);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditingAssignee(false);
                onUpdate(assigneeValue || null, item.due_date);
              }
            }}
            className="h-5 w-24 rounded border bg-transparent px-1 text-xs"
            placeholder="Assignee"
          />
        ) : (
          <button
            onClick={() => setEditingAssignee(true)}
            className="hover:text-foreground transition-colors"
          >
            {item.assignee || "Unassigned"}
          </button>
        )}
        <span>·</span>
        {editingDueDate ? (
          <input
            autoFocus
            type="date"
            value={dueDateValue}
            onChange={(e) => setDueDateValue(e.target.value)}
            onBlur={() => {
              setEditingDueDate(false);
              onUpdate(item.assignee, dueDateValue || null);
            }}
            className="h-5 rounded border bg-transparent px-1 text-xs"
          />
        ) : (
          <button
            onClick={() => setEditingDueDate(true)}
            className="hover:text-foreground transition-colors"
          >
            {item.due_date || "No due date"}
          </button>
        )}
        <span>·</span>
        <span className={isDone ? "text-green-500" : "text-amber-500"}>
          {isDone ? "Done" : "Open"}
        </span>
      </div>
    </div>
  );
}
```

**Step 3: Modify the right column of `MeetingDetail`**

Replace the right column div (the `<div className="flex w-96 flex-col">` block, approximately lines 381-494) with a tabbed layout that switches between Summaries and Insights:

```typescript
{/* Right column: Summaries + Insights */}
<div className="flex w-96 flex-col">
  <Tabs defaultValue="summaries" className="flex flex-1 flex-col">
    <div className="px-4 py-2 border-b">
      <TabsList className="w-full">
        <TabsTrigger value="summaries" className="flex-1">
          Summaries
        </TabsTrigger>
        <TabsTrigger value="insights" className="flex-1">
          Insights
        </TabsTrigger>
      </TabsList>
    </div>

    <TabsContent value="summaries" className="flex flex-1 flex-col mt-0">
      {/* Generate controls */}
      <div className="space-y-2 p-4 border-b">
        {/* ... existing summary controls (unchanged) ... */}
      </div>
      {/* Summary list */}
      <ScrollArea className="flex-1">
        {/* ... existing summary list (unchanged) ... */}
      </ScrollArea>
    </TabsContent>

    <TabsContent value="insights" className="flex flex-1 flex-col mt-0">
      <InsightsPanel
        meetingId={id!}
        providers={providers}
        models={models}
      />
    </TabsContent>
  </Tabs>
</div>
```

Note: Keep all the existing summary generation controls and summary list exactly as they are inside the "summaries" tab content. Only wrap them in the new tab structure.

**Step 4: Add InsightWithActionItem to the imports from types**

In the imports section, add `InsightWithActionItem` to the type import (line 17):

```typescript
import type { LinearTicket, LinearTeam, LinearProject, ModelInfo, InsightWithActionItem } from "@/types";
```

**Step 5: Verify the app compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && npm run build 2>&1 | tail -10`
Expected: builds successfully

**Step 6: Commit**

```bash
git add src/pages/MeetingDetail.tsx
git commit -m "feat: add Insights tab to meeting detail page"
```

---

### Task 8: Create Insights Dashboard Page

**Files:**
- Create: `src/pages/InsightsDashboard.tsx`

**Step 1: Create the page**

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAllInsights } from "@/hooks/useInsights";
import { Check, Lightbulb, ListChecks, Star, Search } from "lucide-react";
import type { InsightWithActionItem } from "@/types";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function DashboardActionItem({
  item,
  onToggle,
  onNavigate,
}: {
  item: InsightWithActionItem;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const isDone = item.status === "done";

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-accent/30 transition-colors">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
          isDone
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground hover:border-foreground"
        }`}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>
      <button onClick={onNavigate} className="flex-1 text-left min-w-0">
        <p className={`text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>
          {item.content}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.assignee || "Unassigned"}
          {item.meeting_title && ` · ${item.meeting_title}`}
          {item.meeting_start_time && ` (${formatDate(item.meeting_start_time)})`}
          {item.due_date && ` · Due ${item.due_date}`}
        </p>
      </button>
    </div>
  );
}

function DashboardInsightItem({
  item,
  onNavigate,
}: {
  item: InsightWithActionItem;
  onNavigate: () => void;
}) {
  return (
    <button
      onClick={onNavigate}
      className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-accent/30 transition-colors w-full text-left"
    >
      <p className="text-sm flex-1">{item.content}</p>
      <div className="shrink-0 text-right">
        {item.meeting_title && (
          <p className="text-xs text-muted-foreground">{item.meeting_title}</p>
        )}
        {item.meeting_start_time && (
          <p className="text-xs text-muted-foreground">
            {formatDate(item.meeting_start_time)}
          </p>
        )}
      </div>
    </button>
  );
}

export function InsightsDashboard() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");

  const { decisions, actionItems, keyMoments, loading, toggleActionItem } =
    useAllInsights(
      typeFilter || undefined,
      statusFilter || undefined,
      searchQuery || undefined,
    );

  const openActionItems = actionItems.filter((i) => i.status === "open");
  const doneActionItems = actionItems.filter((i) => i.status === "done");

  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-8 py-4">
        <h1 className="text-xl font-bold">Insights</h1>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All types</option>
            <option value="action_item">Action Items</option>
            <option value="decision">Decisions</option>
            <option value="key_moment">Key Moments</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All status</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
          </select>
          <div className="flex items-center gap-1">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search insights..."
              className="h-8 w-48 rounded-md border bg-transparent px-3 text-sm"
            />
            <Button variant="ghost" size="sm" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-8 space-y-8 max-w-3xl">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading insights...</p>
          ) : (
            <>
              {/* Action Items */}
              {(!typeFilter || typeFilter === "action_item") &&
                actionItems.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <ListChecks className="h-5 w-5" />
                      <h2 className="text-lg font-semibold">Action Items</h2>
                      <Badge variant="secondary">
                        {openActionItems.length} open
                      </Badge>
                    </div>
                    <div className="rounded-md border divide-y">
                      {openActionItems.map((ai) => (
                        <DashboardActionItem
                          key={ai.id}
                          item={ai}
                          onToggle={() =>
                            ai.action_item_id &&
                            toggleActionItem(
                              ai.action_item_id,
                              ai.status ?? "open",
                            )
                          }
                          onNavigate={() =>
                            navigate(`/meeting/${ai.meeting_id}`)
                          }
                        />
                      ))}
                      {doneActionItems.map((ai) => (
                        <DashboardActionItem
                          key={ai.id}
                          item={ai}
                          onToggle={() =>
                            ai.action_item_id &&
                            toggleActionItem(
                              ai.action_item_id,
                              ai.status ?? "open",
                            )
                          }
                          onNavigate={() =>
                            navigate(`/meeting/${ai.meeting_id}`)
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}

              {/* Decisions */}
              {(!typeFilter || typeFilter === "decision") &&
                decisions.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="h-5 w-5" />
                      <h2 className="text-lg font-semibold">
                        Recent Decisions
                      </h2>
                    </div>
                    <div className="rounded-md border divide-y">
                      {decisions.map((d) => (
                        <DashboardInsightItem
                          key={d.id}
                          item={d}
                          onNavigate={() =>
                            navigate(`/meeting/${d.meeting_id}`)
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}

              {/* Key Moments */}
              {(!typeFilter || typeFilter === "key_moment") &&
                keyMoments.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="h-5 w-5" />
                      <h2 className="text-lg font-semibold">Key Moments</h2>
                    </div>
                    <div className="rounded-md border divide-y">
                      {keyMoments.map((km) => (
                        <DashboardInsightItem
                          key={km.id}
                          item={km}
                          onNavigate={() =>
                            navigate(`/meeting/${km.meeting_id}`)
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}

              {/* Empty state */}
              {actionItems.length === 0 &&
                decisions.length === 0 &&
                keyMoments.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-16">
                    <Lightbulb className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No insights yet. Record a meeting and extract insights to
                      see them here.
                    </p>
                  </div>
                )}
            </>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/InsightsDashboard.tsx
git commit -m "feat: add cross-meeting Insights dashboard page"
```

---

### Task 9: Wire Up Router and Sidebar

**Files:**
- Modify: `src/App.tsx:1-13` (add import) and `src/App.tsx:39-96` (add route)
- Modify: `src/components/Sidebar.tsx:9` (add icon import) and `src/components/Sidebar.tsx:12-18` (add nav item)

**Step 1: Add route in `App.tsx`**

Add import at the top:

```typescript
import { InsightsDashboard } from "@/pages/InsightsDashboard";
```

Add route after the `/` route (after line 47):

```typescript
<Route
  path="/insights"
  element={
    <Layout>
      <InsightsDashboard />
    </Layout>
  }
/>
```

**Step 2: Add nav item in `Sidebar.tsx`**

Add `Lightbulb` to the lucide-react imports (line 9):

```typescript
import { Mic, FileText, Sparkles, Settings, HelpCircle, Circle, Moon, Sun, Lightbulb } from "lucide-react";
```

Add the Insights nav item to `navItems` array, after the Meetings item (after line 13):

```typescript
{ to: "/insights", label: "Insights", icon: Lightbulb },
```

**Step 3: Verify the app compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && npm run build 2>&1 | tail -10`
Expected: builds successfully

**Step 4: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: add Insights to sidebar navigation and router"
```

---

### Task 10: Wire Auto-Extraction After Transcription

**Files:**
- Modify: `src-tauri/src/commands.rs:325-357` (modify `stop_recording`)

**Step 1: Update `stop_recording` to trigger extraction**

The `stop_recording` command currently finalizes with status `"transcribing"`. After finalization, if an LLM provider is available, automatically extract insights.

After the `db.finalize_meeting(...)` call (around line 352), before `db.get_meeting(...)`, add:

```rust
// Auto-extract insights if an LLM provider is configured
{
    let db_clone = db.inner().clone();
    let llm_clone = llm.inner().clone();
    let mid = meeting_id.clone();
    tokio::spawn(async move {
        let registry = llm_clone.read().await;
        let providers = registry.provider_names();
        if let Some(provider_name) = providers.first() {
            let models = registry.all_models();
            let provider_models: Vec<_> = models
                .iter()
                .filter(|m| m.provider == *provider_name)
                .collect();
            if let Some(model) = provider_models.first() {
                if let Err(e) = crate::extraction::extract_insights(
                    &db_clone,
                    &registry,
                    &mid,
                    provider_name,
                    &model.id,
                )
                .await
                {
                    tracing::warn!("Auto-extraction failed: {e}");
                }
            }
        }
    });
}
```

This also requires adding `llm: State<'_, LlmState>` to the `stop_recording` function signature.

Update the function signature from:

```rust
pub async fn stop_recording(
    db: State<'_, DbState>,
    recording: State<'_, RecordingState>,
) -> Result<Meeting, String> {
```

To:

```rust
pub async fn stop_recording(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    recording: State<'_, RecordingState>,
) -> Result<Meeting, String> {
```

**Step 2: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compiles with no errors

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: auto-extract insights after recording stops"
```

---

### Task 11: Full Build Verification

**Step 1: Run the full Rust build**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`
Expected: successful build

**Step 2: Run the full frontend build**

Run: `cd /Users/michelle/conductor/workspaces/nootle/tripoli && npm run build 2>&1 | tail -10`
Expected: successful build

**Step 3: If any errors, fix them and commit**

```bash
git add -A
git commit -m "fix: resolve build issues from meeting intelligence feature"
```
