# Post-Meeting Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a workflows system that lets users run one-click post-meeting actions (Slack, Notion, Confluence, GitHub, Linear, Asana, Email) from the meeting detail page.

**Architecture:** Two-layer system — Integrations (API connections stored in DB) and Workflows (reusable actions targeting an integration). Workflow runs are tracked per-meeting. Follows the existing Linear integration pattern: Rust module → DB methods → Tauri commands → React hooks → UI.

**Tech Stack:** Rust/Tauri backend, SQLite (rusqlite), reqwest for HTTP, React 19 frontend, shadcn/ui components, Tauri IPC via `invoke`.

**Design doc:** `docs/plans/2026-03-06-post-meeting-workflows-design.md`

---

### Task 1: Database Schema — Integrations, Workflows, Runs

**Files:**
- Modify: `src-tauri/src/db.rs` (add structs + migration + CRUD methods)

**Step 1: Add Rust structs**

Add after the existing `LinearTicket` struct (around line 130):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Integration {
    pub id: String,
    pub integration_type: String, // slack | notion | confluence | github | linear | asana | email
    pub name: String,
    pub credentials_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub integration_id: String,
    pub action_type: String,
    pub config_json: String,
    pub is_enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    pub id: String,
    pub meeting_id: String,
    pub workflow_id: String,
    pub status: String, // pending | running | completed | failed
    pub result_json: Option<String>,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub workflow_name: Option<String>,
    pub workflow_icon: Option<String>,
}
```

**Step 2: Add migration in `initialize()`**

Add to the `initialize()` method in db.rs, after the existing migrations:

```rust
conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY,
        integration_type TEXT NOT NULL,
        name TEXT NOT NULL,
        credentials_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        result_json TEXT,
        error TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
    );"
)?;
```

**Step 3: Add CRUD methods for integrations**

Add to the `impl Database` block:

```rust
// --- Integrations ---

pub fn create_integration(&self, integration_type: &str, name: &str, credentials_json: &str) -> Result<Integration> {
    let conn = self.conn();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO integrations (id, integration_type, name, credentials_json) VALUES (?1, ?2, ?3, ?4)",
        params![id, integration_type, name, credentials_json],
    )?;
    self.get_integration(&id)
}

pub fn get_integration(&self, id: &str) -> Result<Integration> {
    let conn = self.conn();
    conn.query_row(
        "SELECT id, integration_type, name, credentials_json, created_at FROM integrations WHERE id = ?1",
        params![id],
        |row| Ok(Integration {
            id: row.get(0)?,
            integration_type: row.get(1)?,
            name: row.get(2)?,
            credentials_json: row.get(3)?,
            created_at: row.get(4)?,
        }),
    ).map_err(Into::into)
}

pub fn list_integrations(&self) -> Result<Vec<Integration>> {
    let conn = self.conn();
    let mut stmt = conn.prepare(
        "SELECT id, integration_type, name, credentials_json, created_at FROM integrations ORDER BY created_at"
    )?;
    let rows = stmt.query_map([], |row| Ok(Integration {
        id: row.get(0)?,
        integration_type: row.get(1)?,
        name: row.get(2)?,
        credentials_json: row.get(3)?,
        created_at: row.get(4)?,
    }))?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn update_integration(&self, id: &str, name: &str, credentials_json: &str) -> Result<Integration> {
    let conn = self.conn();
    conn.execute(
        "UPDATE integrations SET name = ?1, credentials_json = ?2 WHERE id = ?3",
        params![name, credentials_json, id],
    )?;
    self.get_integration(id)
}

pub fn delete_integration(&self, id: &str) -> Result<()> {
    let conn = self.conn();
    conn.execute("DELETE FROM integrations WHERE id = ?1", params![id])?;
    Ok(())
}
```

**Step 4: Add CRUD methods for workflows**

```rust
// --- Workflows ---

pub fn create_workflow(&self, name: &str, description: Option<&str>, icon: Option<&str>, integration_id: &str, action_type: &str, config_json: &str) -> Result<Workflow> {
    let conn = self.conn();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workflows (id, name, description, icon, integration_id, action_type, config_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, name, description, icon, integration_id, action_type, config_json],
    )?;
    self.get_workflow(&id)
}

pub fn get_workflow(&self, id: &str) -> Result<Workflow> {
    let conn = self.conn();
    conn.query_row(
        "SELECT id, name, description, icon, integration_id, action_type, config_json, is_enabled, created_at FROM workflows WHERE id = ?1",
        params![id],
        |row| Ok(Workflow {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            icon: row.get(3)?,
            integration_id: row.get(4)?,
            action_type: row.get(5)?,
            config_json: row.get(6)?,
            is_enabled: row.get::<_, i32>(7)? != 0,
            created_at: row.get(8)?,
        }),
    ).map_err(Into::into)
}

pub fn list_workflows(&self) -> Result<Vec<Workflow>> {
    let conn = self.conn();
    let mut stmt = conn.prepare(
        "SELECT id, name, description, icon, integration_id, action_type, config_json, is_enabled, created_at FROM workflows ORDER BY created_at"
    )?;
    let rows = stmt.query_map([], |row| Ok(Workflow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        integration_id: row.get(4)?,
        action_type: row.get(5)?,
        config_json: row.get(6)?,
        is_enabled: row.get::<_, i32>(7)? != 0,
        created_at: row.get(8)?,
    }))?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn update_workflow(&self, id: &str, name: &str, description: Option<&str>, icon: Option<&str>, action_type: &str, config_json: &str, is_enabled: bool) -> Result<Workflow> {
    let conn = self.conn();
    conn.execute(
        "UPDATE workflows SET name=?1, description=?2, icon=?3, action_type=?4, config_json=?5, is_enabled=?6 WHERE id=?7",
        params![name, description, icon, action_type, config_json, is_enabled as i32, id],
    )?;
    self.get_workflow(id)
}

pub fn delete_workflow(&self, id: &str) -> Result<()> {
    let conn = self.conn();
    conn.execute("DELETE FROM workflows WHERE id = ?1", params![id])?;
    Ok(())
}
```

**Step 5: Add methods for workflow runs**

```rust
// --- Workflow Runs ---

pub fn create_workflow_run(&self, meeting_id: &str, workflow_id: &str) -> Result<WorkflowRun> {
    let conn = self.conn();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workflow_runs (id, meeting_id, workflow_id, status) VALUES (?1, ?2, ?3, 'pending')",
        params![id, meeting_id, workflow_id],
    )?;
    self.get_workflow_run(&id)
}

pub fn get_workflow_run(&self, id: &str) -> Result<WorkflowRun> {
    let conn = self.conn();
    conn.query_row(
        "SELECT r.id, r.meeting_id, r.workflow_id, r.status, r.result_json, r.error, r.started_at, r.completed_at, w.name, w.icon
         FROM workflow_runs r JOIN workflows w ON r.workflow_id = w.id WHERE r.id = ?1",
        params![id],
        |row| Ok(WorkflowRun {
            id: row.get(0)?,
            meeting_id: row.get(1)?,
            workflow_id: row.get(2)?,
            status: row.get(3)?,
            result_json: row.get(4)?,
            error: row.get(5)?,
            started_at: row.get(6)?,
            completed_at: row.get(7)?,
            workflow_name: row.get(8)?,
            workflow_icon: row.get(9)?,
        }),
    ).map_err(Into::into)
}

pub fn update_workflow_run_status(&self, id: &str, status: &str, result_json: Option<&str>, error: Option<&str>) -> Result<()> {
    let conn = self.conn();
    let completed_at = if status == "completed" || status == "failed" {
        Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string())
    } else {
        None
    };
    conn.execute(
        "UPDATE workflow_runs SET status=?1, result_json=?2, error=?3, completed_at=?4 WHERE id=?5",
        params![status, result_json, error, completed_at, id],
    )?;
    Ok(())
}

pub fn list_workflow_runs_for_meeting(&self, meeting_id: &str) -> Result<Vec<WorkflowRun>> {
    let conn = self.conn();
    let mut stmt = conn.prepare(
        "SELECT r.id, r.meeting_id, r.workflow_id, r.status, r.result_json, r.error, r.started_at, r.completed_at, w.name, w.icon
         FROM workflow_runs r JOIN workflows w ON r.workflow_id = w.id
         WHERE r.meeting_id = ?1 ORDER BY r.started_at DESC"
    )?;
    let rows = stmt.query_map(params![meeting_id], |row| Ok(WorkflowRun {
        id: row.get(0)?,
        meeting_id: row.get(1)?,
        workflow_id: row.get(2)?,
        status: row.get(3)?,
        result_json: row.get(4)?,
        error: row.get(5)?,
        started_at: row.get(6)?,
        completed_at: row.get(7)?,
        workflow_name: row.get(8)?,
        workflow_icon: row.get(9)?,
    }))?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}
```

**Step 6: Run Rust tests to verify compilation**

Run: `cd src-tauri && cargo test`
Expected: All existing tests pass, no compilation errors.

**Step 7: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: add database schema for integrations, workflows, and runs"
```

---

### Task 2: Tauri Commands for Integrations and Workflows

**Files:**
- Modify: `src-tauri/src/commands.rs` (add Tauri commands)
- Modify: `src-tauri/src/lib.rs` (register commands in invoke_handler)

**Step 1: Add integration commands to commands.rs**

Add at the end of the file, before the closing:

```rust
// --- Integrations ---

#[tauri::command]
pub fn create_integration(
    db: State<'_, DbState>,
    integration_type: String,
    name: String,
    credentials_json: String,
) -> Result<crate::db::Integration, String> {
    db.create_integration(&integration_type, &name, &credentials_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_integrations(db: State<'_, DbState>) -> Result<Vec<crate::db::Integration>, String> {
    db.list_integrations().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_integration(
    db: State<'_, DbState>,
    id: String,
    name: String,
    credentials_json: String,
) -> Result<crate::db::Integration, String> {
    db.update_integration(&id, &name, &credentials_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_integration(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_integration(&id).map_err(|e| e.to_string())
}

// --- Workflows ---

#[tauri::command]
pub fn create_workflow(
    db: State<'_, DbState>,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    integration_id: String,
    action_type: String,
    config_json: String,
) -> Result<crate::db::Workflow, String> {
    db.create_workflow(&name, description.as_deref(), icon.as_deref(), &integration_id, &action_type, &config_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workflows(db: State<'_, DbState>) -> Result<Vec<crate::db::Workflow>, String> {
    db.list_workflows().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_workflow(
    db: State<'_, DbState>,
    id: String,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    action_type: String,
    config_json: String,
    is_enabled: bool,
) -> Result<crate::db::Workflow, String> {
    db.update_workflow(&id, &name, description.as_deref(), icon.as_deref(), &action_type, &config_json, is_enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workflow(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_workflow(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workflow_runs(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<crate::db::WorkflowRun>, String> {
    db.list_workflow_runs_for_meeting(&meeting_id).map_err(|e| e.to_string())
}
```

**Step 2: Register commands in lib.rs**

Add to the `invoke_handler` list in `src-tauri/src/lib.rs`:

```rust
commands::create_integration,
commands::list_integrations,
commands::update_integration,
commands::delete_integration,
commands::create_workflow,
commands::list_workflows,
commands::update_workflow,
commands::delete_workflow,
commands::list_workflow_runs,
```

**Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: PASS

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for integrations and workflows"
```

---

### Task 3: TypeScript Types and Hooks

**Files:**
- Modify: `src/types.ts` (add interfaces)
- Create: `src/hooks/useIntegrations.ts`
- Create: `src/hooks/useWorkflows.ts`

**Step 1: Add TypeScript interfaces to types.ts**

```typescript
export interface Integration {
  id: string;
  integration_type: string;
  name: string;
  credentials_json: string;
  created_at: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  integration_id: string;
  action_type: string;
  config_json: string;
  is_enabled: boolean;
  created_at: string;
}

export interface WorkflowRun {
  id: string;
  meeting_id: string;
  workflow_id: string;
  status: string; // "pending" | "running" | "completed" | "failed"
  result_json: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  workflow_name: string | null;
  workflow_icon: string | null;
}
```

**Step 2: Create useIntegrations.ts**

Follow the same pattern as `useLinear.ts` and `useTemplates.ts`:

```typescript
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Integration } from "@/types";

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<Integration[]>("list_integrations");
      setIntegrations(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createIntegration = useCallback(async (
    integration_type: string,
    name: string,
    credentials_json: string,
  ) => {
    const result = await invoke<Integration>("create_integration", {
      integrationType: integration_type,
      name,
      credentialsJson: credentials_json,
    });
    await refresh();
    return result;
  }, [refresh]);

  const updateIntegration = useCallback(async (
    id: string,
    name: string,
    credentials_json: string,
  ) => {
    const result = await invoke<Integration>("update_integration", {
      id,
      name,
      credentialsJson: credentials_json,
    });
    await refresh();
    return result;
  }, [refresh]);

  const deleteIntegration = useCallback(async (id: string) => {
    await invoke("delete_integration", { id });
    await refresh();
  }, [refresh]);

  return { integrations, loading, error, refresh, createIntegration, updateIntegration, deleteIntegration };
}
```

**Step 3: Create useWorkflows.ts**

```typescript
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Workflow, WorkflowRun } from "@/types";

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<Workflow[]>("list_workflows");
      setWorkflows(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createWorkflow = useCallback(async (
    name: string,
    description: string | null,
    icon: string | null,
    integrationId: string,
    actionType: string,
    configJson: string,
  ) => {
    const result = await invoke<Workflow>("create_workflow", {
      name, description, icon, integrationId, actionType, configJson,
    });
    await refresh();
    return result;
  }, [refresh]);

  const updateWorkflow = useCallback(async (
    id: string,
    name: string,
    description: string | null,
    icon: string | null,
    actionType: string,
    configJson: string,
    isEnabled: boolean,
  ) => {
    const result = await invoke<Workflow>("update_workflow", {
      id, name, description, icon, actionType, configJson, isEnabled,
    });
    await refresh();
    return result;
  }, [refresh]);

  const deleteWorkflow = useCallback(async (id: string) => {
    await invoke("delete_workflow", { id });
    await refresh();
  }, [refresh]);

  return { workflows, loading, error, refresh, createWorkflow, updateWorkflow, deleteWorkflow };
}

export function useWorkflowRuns(meetingId: string | undefined) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!meetingId) return;
    try {
      setLoading(true);
      const result = await invoke<WorkflowRun[]>("list_workflow_runs", { meetingId });
      setRuns(result);
    } catch {
      // silent — runs are optional display data
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { runs, loading, refresh };
}
```

**Step 4: Commit**

```bash
git add src/types.ts src/hooks/useIntegrations.ts src/hooks/useWorkflows.ts
git commit -m "feat: add TypeScript types and hooks for integrations and workflows"
```

---

### Task 4: Workflow Execution Engine (Rust)

**Files:**
- Create: `src-tauri/src/workflows.rs` (execution logic)
- Modify: `src-tauri/src/lib.rs` (add module)
- Modify: `src-tauri/src/commands.rs` (add run_workflow command)

**Step 1: Create workflows.rs**

This module handles executing workflows against external APIs. Start with the email workflow (simplest — no external API), then stub the others:

```rust
use crate::db::{Database, Integration, Workflow, WorkflowRun};
use crate::error::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowContext {
    pub meeting_title: String,
    pub meeting_date: String,
    pub summary: Option<String>,
    pub action_items: Vec<ActionItemContext>,
    pub transcript_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionItemContext {
    pub content: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub message: String,
    pub output: Option<String>,
}

pub async fn execute_workflow(
    db: &Database,
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    match integration.integration_type.as_str() {
        "email" => execute_email_workflow(workflow, context).await,
        "slack" => execute_slack_workflow(workflow, integration, context).await,
        "notion" => execute_notion_workflow(workflow, integration, context).await,
        "confluence" => execute_confluence_workflow(workflow, integration, context).await,
        "github" => execute_github_workflow(workflow, integration, context).await,
        "linear" => execute_linear_workflow(workflow, integration, context).await,
        "asana" => execute_asana_workflow(workflow, integration, context).await,
        other => Err(format!("Unknown integration type: {other}")),
    }
}

fn render_template(template: &str, context: &WorkflowContext) -> String {
    let action_items_text = context.action_items.iter()
        .map(|ai| {
            let mut line = format!("- {}", ai.content);
            if let Some(ref assignee) = ai.assignee {
                line.push_str(&format!(" (assigned to {assignee})"));
            }
            if let Some(ref due) = ai.due_date {
                line.push_str(&format!(" [due: {due}]"));
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n");

    template
        .replace("{{title}}", &context.meeting_title)
        .replace("{{date}}", &context.meeting_date)
        .replace("{{summary}}", context.summary.as_deref().unwrap_or("No summary available"))
        .replace("{{action_items}}", &action_items_text)
}

// --- Email (no external API) ---

async fn execute_email_workflow(
    workflow: &Workflow,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let subject_template = config["subject"].as_str().unwrap_or("Meeting Notes: {{title}}");
    let body_template = config["body"].as_str().unwrap_or("{{summary}}\n\n## Action Items\n{{action_items}}");

    let subject = render_template(subject_template, context);
    let body = render_template(body_template, context);

    let output = format!("Subject: {subject}\n\n{body}");

    Ok(WorkflowResult {
        message: "Email draft generated".to_string(),
        output: Some(output),
    })
}

// --- Slack ---

async fn execute_slack_workflow(
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let token = creds["bot_token"].as_str()
        .ok_or("Missing bot_token in Slack credentials")?;
    let channel = config["channel"].as_str()
        .ok_or("Missing channel in workflow config")?;

    let message_template = config["message_template"].as_str()
        .unwrap_or("*{{title}}* — {{date}}\n\n{{summary}}");
    let text = render_template(message_template, context);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://slack.com/api/chat.postMessage")
        .bearer_auth(token)
        .json(&serde_json::json!({
            "channel": channel,
            "text": text,
        }))
        .send()
        .await
        .map_err(|e| format!("Slack API error: {e}"))?;

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Failed to parse Slack response: {e}"))?;

    if body["ok"].as_bool() == Some(true) {
        Ok(WorkflowResult {
            message: format!("Posted to {channel}"),
            output: None,
        })
    } else {
        Err(format!("Slack error: {}", body["error"].as_str().unwrap_or("unknown")))
    }
}

// --- Notion ---

async fn execute_notion_workflow(
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let token = creds["api_key"].as_str()
        .ok_or("Missing api_key in Notion credentials")?;
    let database_id = config["database_id"].as_str()
        .ok_or("Missing database_id in workflow config")?;

    let content = render_template(
        "{{summary}}\n\n## Action Items\n{{action_items}}",
        context,
    );

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.notion.com/v1/pages")
        .bearer_auth(token)
        .header("Notion-Version", "2022-06-28")
        .json(&serde_json::json!({
            "parent": { "database_id": database_id },
            "properties": {
                "title": {
                    "title": [{ "text": { "content": context.meeting_title } }]
                }
            },
            "children": [{
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{ "text": { "content": content } }]
                }
            }]
        }))
        .send()
        .await
        .map_err(|e| format!("Notion API error: {e}"))?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await
            .map_err(|e| format!("Failed to parse Notion response: {e}"))?;
        let url = body["url"].as_str().unwrap_or("").to_string();
        Ok(WorkflowResult {
            message: "Page created in Notion".to_string(),
            output: Some(url),
        })
    } else {
        let err = resp.text().await.unwrap_or_default();
        Err(format!("Notion error: {err}"))
    }
}

// --- Confluence ---

async fn execute_confluence_workflow(
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let email = creds["email"].as_str()
        .ok_or("Missing email in Confluence credentials")?;
    let api_token = creds["api_token"].as_str()
        .ok_or("Missing api_token in Confluence credentials")?;
    let base_url = creds["base_url"].as_str()
        .ok_or("Missing base_url in Confluence credentials (e.g. https://yoursite.atlassian.net)")?;
    let space_key = config["space_key"].as_str()
        .ok_or("Missing space_key in workflow config")?;

    let content = render_template(
        "<h2>Summary</h2><p>{{summary}}</p><h2>Action Items</h2><p>{{action_items}}</p>",
        context,
    );

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base_url}/wiki/api/v2/pages"))
        .basic_auth(email, Some(api_token))
        .json(&serde_json::json!({
            "spaceId": space_key,
            "status": "current",
            "title": format!("Meeting Notes: {}", context.meeting_title),
            "body": {
                "representation": "storage",
                "value": content
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Confluence API error: {e}"))?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await
            .map_err(|e| format!("Failed to parse Confluence response: {e}"))?;
        let url = body["_links"]["webui"].as_str().unwrap_or("").to_string();
        Ok(WorkflowResult {
            message: "Page created in Confluence".to_string(),
            output: Some(url),
        })
    } else {
        let err = resp.text().await.unwrap_or_default();
        Err(format!("Confluence error: {err}"))
    }
}

// --- GitHub ---

async fn execute_github_workflow(
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let token = creds["token"].as_str()
        .ok_or("Missing token in GitHub credentials")?;
    let repo = config["repo"].as_str()
        .ok_or("Missing repo in workflow config (format: owner/repo)")?;

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let body = format!(
            "From meeting: **{}** ({})\n\n{}\n\n{}",
            context.meeting_title,
            context.meeting_date,
            item.content,
            item.assignee.as_deref().map(|a| format!("Assignee: {a}")).unwrap_or_default(),
        );

        let resp = client
            .post(format!("https://api.github.com/repos/{repo}/issues"))
            .bearer_auth(token)
            .header("User-Agent", "Nootle")
            .header("Accept", "application/vnd.github+json")
            .json(&serde_json::json!({
                "title": item.content,
                "body": body,
            }))
            .send()
            .await
            .map_err(|e| format!("GitHub API error: {e}"))?;

        if resp.status().is_success() {
            let issue: serde_json::Value = resp.json().await
                .map_err(|e| format!("Failed to parse GitHub response: {e}"))?;
            if let Some(url) = issue["html_url"].as_str() {
                created.push(url.to_string());
            }
        } else {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("GitHub error creating issue: {err}"));
        }
    }

    Ok(WorkflowResult {
        message: format!("Created {} GitHub issue(s)", created.len()),
        output: Some(created.join("\n")),
    })
}

// --- Linear ---

async fn execute_linear_workflow(
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let api_key = creds["api_key"].as_str()
        .ok_or("Missing api_key in Linear credentials")?;
    let team_id = config["team_id"].as_str()
        .ok_or("Missing team_id in workflow config")?;
    let project_id = config["project_id"].as_str();

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let description = format!(
            "From meeting: **{}** ({})\n\n{}",
            context.meeting_title,
            context.meeting_date,
            item.assignee.as_deref().map(|a| format!("Assignee: {a}")).unwrap_or_default(),
        );

        let mut input = serde_json::json!({
            "teamId": team_id,
            "title": item.content,
            "description": description,
        });
        if let Some(pid) = project_id {
            input["projectId"] = serde_json::json!(pid);
        }

        let resp = client
            .post("https://api.linear.app/graphql")
            .bearer_auth(api_key)
            .json(&serde_json::json!({
                "query": "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }",
                "variables": { "input": input }
            }))
            .send()
            .await
            .map_err(|e| format!("Linear API error: {e}"))?;

        let body: serde_json::Value = resp.json().await
            .map_err(|e| format!("Failed to parse Linear response: {e}"))?;

        if let Some(issue) = body["data"]["issueCreate"]["issue"].as_object() {
            let identifier = issue["identifier"].as_str().unwrap_or("?");
            let url = issue["url"].as_str().unwrap_or("");
            created.push(format!("{identifier}: {url}"));
        } else {
            let errors = &body["errors"];
            return Err(format!("Linear error: {errors}"));
        }
    }

    Ok(WorkflowResult {
        message: format!("Created {} Linear issue(s)", created.len()),
        output: Some(created.join("\n")),
    })
}

// --- Asana ---

async fn execute_asana_workflow(
    workflow: &Workflow,
    integration: &Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config: serde_json::Value = serde_json::from_str(&workflow.config_json)
        .map_err(|e| format!("Invalid config: {e}"))?;

    let token = creds["token"].as_str()
        .ok_or("Missing token in Asana credentials")?;
    let project_id = config["project_id"].as_str()
        .ok_or("Missing project_id in workflow config")?;

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let notes = format!(
            "From meeting: {} ({})\n\n{}",
            context.meeting_title,
            context.meeting_date,
            item.assignee.as_deref().map(|a| format!("Assignee: {a}")).unwrap_or_default(),
        );

        let mut task_data = serde_json::json!({
            "name": item.content,
            "notes": notes,
            "projects": [project_id],
        });
        if let Some(ref due) = item.due_date {
            task_data["due_on"] = serde_json::json!(due);
        }

        let resp = client
            .post("https://app.asana.com/api/1.0/tasks")
            .bearer_auth(token)
            .json(&serde_json::json!({ "data": task_data }))
            .send()
            .await
            .map_err(|e| format!("Asana API error: {e}"))?;

        if resp.status().is_success() {
            let body: serde_json::Value = resp.json().await
                .map_err(|e| format!("Failed to parse Asana response: {e}"))?;
            if let Some(gid) = body["data"]["gid"].as_str() {
                created.push(format!("https://app.asana.com/0/0/{gid}"));
            }
        } else {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Asana error: {err}"));
        }
    }

    Ok(WorkflowResult {
        message: format!("Created {} Asana task(s)", created.len()),
        output: Some(created.join("\n")),
    })
}
```

**Step 2: Add module to lib.rs**

Add `pub mod workflows;` to the module list in `src-tauri/src/lib.rs`.

**Step 3: Add run_workflow command to commands.rs**

```rust
#[tauri::command]
pub async fn run_workflow(
    db: State<'_, DbState>,
    meeting_id: String,
    workflow_id: String,
) -> Result<crate::db::WorkflowRun, String> {
    let workflow = db.get_workflow(&workflow_id).map_err(|e| e.to_string())?;
    let integration = db.get_integration(&workflow.integration_id).map_err(|e| e.to_string())?;
    let meeting = db.get_meeting(&meeting_id).map_err(|e| e.to_string())?;

    // Build context from meeting data
    let summaries = db.get_summaries(&meeting_id).map_err(|e| e.to_string())?;
    let summary_text = summaries.first().map(|s| s.content.clone());

    let insights = db.get_insights(&meeting_id).map_err(|e| e.to_string())?;
    let action_items: Vec<crate::workflows::ActionItemContext> = insights.iter()
        .filter(|i| i.r#type == "action_item")
        .map(|i| crate::workflows::ActionItemContext {
            content: i.content.clone(),
            assignee: i.assignee.clone(),
            due_date: i.due_date.clone(),
        })
        .collect();

    let context = crate::workflows::WorkflowContext {
        meeting_title: meeting.title.clone(),
        meeting_date: meeting.start_time.clone(),
        summary: summary_text,
        action_items,
        transcript_text: None,
    };

    // Create run record
    let run = db.create_workflow_run(&meeting_id, &workflow_id).map_err(|e| e.to_string())?;

    // Update status to running
    db.update_workflow_run_status(&run.id, "running", None, None).map_err(|e| e.to_string())?;

    // Execute
    match crate::workflows::execute_workflow(&*db, &workflow, &integration, &context).await {
        Ok(result) => {
            let result_json = serde_json::to_string(&result).unwrap_or_default();
            db.update_workflow_run_status(&run.id, "completed", Some(&result_json), None)
                .map_err(|e| e.to_string())?;
            db.get_workflow_run(&run.id).map_err(|e| e.to_string())
        }
        Err(e) => {
            db.update_workflow_run_status(&run.id, "failed", None, Some(&e))
                .map_err(|e| e.to_string())?;
            db.get_workflow_run(&run.id).map_err(|e| e.to_string())
        }
    }
}
```

**Step 4: Register run_workflow in lib.rs invoke_handler**

Add `commands::run_workflow,` to the list.

**Step 5: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: PASS

**Step 6: Commit**

```bash
git add src-tauri/src/workflows.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add workflow execution engine with Slack, Notion, Confluence, GitHub, Linear, Asana, Email support"
```

---

### Task 5: Settings UI — Integrations Tab

**Files:**
- Modify: `src/pages/Settings.tsx` (add Integrations section with connect/disconnect UI)

This task adds the UI for connecting integrations in Settings. Each integration type shows:
- Name and type
- Connection status (connected/not connected)
- Connect button (opens a form for API key/token)
- Disconnect button

Follow the existing `ApiKeyRow` pattern in Settings.tsx. Add an "Integrations" section to the existing Integrations tab that shows cards for each supported integration type (Slack, Notion, Confluence, GitHub, Linear, Asana). Each card allows entering credentials and saving as an Integration record.

**Implementation notes:**
- Use the `useIntegrations` hook from Task 3
- Integration types to show: `slack`, `notion`, `confluence`, `github`, `linear`, `asana`
- Each type has different credential fields (documented in workflows.rs)
- Email type needs no integration — it's configured entirely in the workflow config

**Step 1: Add integration management UI to Settings.tsx**

Add `import { useIntegrations } from "@/hooks/useIntegrations"` and create an `IntegrationCards` component that renders a card per integration type with credential forms.

**Step 2: Verify UI renders**

Run: `pnpm tauri dev`
Navigate to Settings > Integrations. Verify cards render for each type.

**Step 3: Test connecting an integration**

Enter a test API key, click Connect. Verify it appears as connected. Click Disconnect. Verify it's removed.

**Step 4: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add integration management UI to Settings"
```

---

### Task 6: Settings UI — Workflows Tab

**Files:**
- Modify: `src/pages/Settings.tsx` (add Workflows section) OR
- Create: `src/pages/Workflows.tsx` + add route (if Settings is getting too large)

Add a "Workflows" tab/section where users can:
- See all created workflows
- Create new workflow (select integration → select action type → configure)
- Edit existing workflows
- Enable/disable workflows
- Delete workflows

**Implementation notes:**
- Use the `useWorkflows` hook from Task 3
- Use the `useIntegrations` hook to populate the integration dropdown
- Action types are filtered by integration type (hardcoded mapping)
- Config fields change based on action type (channel for Slack, database_id for Notion, etc.)

**Step 1: Build workflow list and create/edit form**

Follow the Templates page pattern — list with cards, dialog for create/edit.

**Step 2: Verify CRUD operations**

Run: `pnpm tauri dev`
Create a workflow, edit it, toggle enabled, delete it.

**Step 3: Commit**

```bash
git add src/pages/Settings.tsx  # or Workflows.tsx + App.tsx
git commit -m "feat: add workflow management UI"
```

---

### Task 7: Meeting Detail — Run Workflow Buttons

**Files:**
- Modify: `src/pages/MeetingDetail.tsx` (add workflow toolbar + run history)
- Modify: `src/hooks/useWorkflows.ts` (add runWorkflow function)

**Step 1: Add runWorkflow to useWorkflows hook**

```typescript
// Add to useWorkflows or create a separate useRunWorkflow hook
const runWorkflow = useCallback(async (meetingId: string, workflowId: string) => {
  return await invoke<WorkflowRun>("run_workflow", { meetingId, workflowId });
}, []);
```

**Step 2: Add workflow buttons to MeetingDetail.tsx**

Add a "Workflows" section below the existing action buttons area. Show each enabled workflow as a button. On click, call `runWorkflow`, show a spinner, then checkmark or error.

**Step 3: Add run history section**

Use `useWorkflowRuns(meetingId)` to show past runs with status badges (completed ✓, failed ✗, running spinner).

**Step 4: Verify end-to-end**

Run: `pnpm tauri dev`
1. Create an integration in Settings
2. Create a workflow targeting that integration
3. Open a meeting with a summary
4. Click the workflow button
5. Verify run appears in history with correct status

**Step 5: Commit**

```bash
git add src/pages/MeetingDetail.tsx src/hooks/useWorkflows.ts
git commit -m "feat: add one-click workflow buttons to meeting detail page"
```

---

### Task 8: Add sidebar nav entry for Workflows

**Files:**
- Modify: `src/components/Sidebar.tsx` (add Workflows nav item)

**Step 1: Add nav item**

If workflows got their own page, add to `navItems` array:
```typescript
{ to: "/workflows", label: "Workflows", icon: Zap },
```

Import `Zap` from lucide-react.

If workflows are a tab in Settings, skip this task.

**Step 2: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Workflows to sidebar navigation"
```

---

### Task 9: Verify and Polish

**Step 1: Run full test suite**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

**Step 2: Run the app and test full flow**

Run: `pnpm tauri dev`

Test each workflow type with the email workflow (no external API needed):
1. Settings > Integrations: no integration needed for email
2. Settings > Workflows: create "Email recap" workflow with email type
3. Open a meeting > Run the email workflow
4. Verify the draft output appears

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: polish workflow UI and fix any remaining issues"
```
