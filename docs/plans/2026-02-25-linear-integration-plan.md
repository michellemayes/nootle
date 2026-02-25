# Linear Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one-click creation of Linear tickets from meeting summaries, with LLM-generated titles and descriptions.

**Architecture:** New `linear.rs` backend module handles Linear GraphQL API calls. Existing LLM infrastructure formats summary content into ticket title + description. New DB tables store ticket references and default settings. Frontend gets a `useLinear` hook and UI additions to Settings and MeetingDetail pages.

**Tech Stack:** Rust (Tauri 2, reqwest, serde, rusqlite), React 19, TypeScript, Tailwind/shadcn, Linear GraphQL API.

---

## Task 1: Add Database Schema for Linear

**Files:**
- Modify: `src-tauri/src/db.rs`

**Step 1: Add `LinearTicket` and `LinearSetting` structs**

In `src-tauri/src/db.rs`, after the existing `Summary` struct (around line 95), add:

```rust
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
```

**Step 2: Add table creation to `initialize()`**

In the `initialize()` method's `execute_batch` string, add after the summaries table:

```sql
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
```

**Step 3: Add `create_linear_ticket` DB method**

After the existing `create_summary` method, add:

```rust
pub fn create_linear_ticket(
    &self,
    summary_id: &str,
    meeting_id: &str,
    linear_issue_id: &str,
    linear_issue_url: &str,
    linear_identifier: &str,
    title: &str,
    team_id: &str,
    project_id: Option<&str>,
) -> Result<LinearTicket> {
    let conn = self.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO linear_tickets (id, summary_id, meeting_id, linear_issue_id, linear_issue_url, linear_identifier, title, team_id, project_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, summary_id, meeting_id, linear_issue_id, linear_issue_url, linear_identifier, title, team_id, project_id, now],
    )?;

    Ok(LinearTicket {
        id,
        summary_id: summary_id.to_string(),
        meeting_id: meeting_id.to_string(),
        linear_issue_id: linear_issue_id.to_string(),
        linear_issue_url: linear_issue_url.to_string(),
        linear_identifier: linear_identifier.to_string(),
        title: title.to_string(),
        team_id: team_id.to_string(),
        project_id: project_id.map(|s| s.to_string()),
        created_at: now,
    })
}
```

**Step 4: Add `get_linear_tickets` DB method**

```rust
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
```

**Step 5: Add `get_linear_setting` and `set_linear_setting` DB methods**

```rust
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
```

**Step 6: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && cargo check -p nootle`
Expected: Compiles with no errors (warnings OK).

**Step 7: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: add linear_tickets and linear_settings DB schema"
```

---

## Task 2: Add Linear API Module

**Files:**
- Create: `src-tauri/src/linear.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod linear;`)

**Step 1: Create `src-tauri/src/linear.rs`**

```rust
use serde::{Deserialize, Serialize};

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearProject {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearIssueResult {
    pub id: String,
    pub identifier: String,
    pub url: String,
    pub title: String,
}

// --- GraphQL response types ---

#[derive(Deserialize)]
struct GqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Deserialize)]
struct TeamsData {
    teams: Nodes<TeamNode>,
}

#[derive(Deserialize)]
struct Nodes<T> {
    nodes: Vec<T>,
}

#[derive(Deserialize)]
struct TeamNode {
    id: String,
    name: String,
    key: String,
}

#[derive(Deserialize)]
struct ProjectsData {
    projects: Nodes<ProjectNode>,
}

#[derive(Deserialize)]
struct ProjectNode {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct IssueCreateData {
    #[serde(rename = "issueCreate")]
    issue_create: IssueCreatePayload,
}

#[derive(Deserialize)]
struct IssueCreatePayload {
    success: bool,
    issue: Option<IssueNode>,
}

#[derive(Deserialize)]
struct IssueNode {
    id: String,
    identifier: String,
    url: String,
    title: String,
}

fn extract_errors<T>(response: &GqlResponse<T>) -> Option<String> {
    response.errors.as_ref().map(|errs| {
        errs.iter()
            .map(|e| e.message.clone())
            .collect::<Vec<_>>()
            .join("; ")
    })
}

pub async fn list_teams(api_key: &str) -> anyhow::Result<Vec<LinearTeam>> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "query": "{ teams { nodes { id name key } } }"
    });

    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<TeamsData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp.data.ok_or_else(|| anyhow::anyhow!("No data in response"))?;
    Ok(data
        .teams
        .nodes
        .into_iter()
        .map(|t| LinearTeam {
            id: t.id,
            name: t.name,
            key: t.key,
        })
        .collect())
}

pub async fn list_projects(api_key: &str, team_id: &str) -> anyhow::Result<Vec<LinearProject>> {
    let client = reqwest::Client::new();
    let query = format!(
        r#"{{ projects(filter: {{ accessibleTeams: {{ id: {{ eq: "{}" }} }} }}) {{ nodes {{ id name }} }} }}"#,
        team_id
    );
    let body = serde_json::json!({ "query": query });

    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<ProjectsData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp.data.ok_or_else(|| anyhow::anyhow!("No data in response"))?;
    Ok(data
        .projects
        .nodes
        .into_iter()
        .map(|p| LinearProject {
            id: p.id,
            name: p.name,
        })
        .collect())
}

pub async fn create_issue(
    api_key: &str,
    team_id: &str,
    project_id: Option<&str>,
    title: &str,
    description: &str,
) -> anyhow::Result<LinearIssueResult> {
    let client = reqwest::Client::new();

    let mut input = serde_json::json!({
        "teamId": team_id,
        "title": title,
        "description": description,
    });

    if let Some(pid) = project_id {
        input.as_object_mut().unwrap().insert("projectId".into(), serde_json::json!(pid));
    }

    let body = serde_json::json!({
        "query": "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }",
        "variables": { "input": input }
    });

    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<IssueCreateData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp.data.ok_or_else(|| anyhow::anyhow!("No data in response"))?;
    if !data.issue_create.success {
        anyhow::bail!("Linear issue creation failed");
    }

    let issue = data
        .issue_create
        .issue
        .ok_or_else(|| anyhow::anyhow!("No issue returned"))?;

    Ok(LinearIssueResult {
        id: issue.id,
        identifier: issue.identifier,
        url: issue.url,
        title: issue.title,
    })
}
```

**Step 2: Register the module in `lib.rs`**

In `src-tauri/src/lib.rs`, add `mod linear;` alongside the other module declarations (near the top with `mod commands;`, `mod db;`, etc.).

**Step 3: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && cargo check -p nootle`
Expected: Compiles with no errors.

**Step 4: Commit**

```bash
git add src-tauri/src/linear.rs src-tauri/src/lib.rs
git commit -m "feat: add Linear GraphQL API module"
```

---

## Task 3: Add Tauri Commands for Linear

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)

**Step 1: Add Linear commands to `commands.rs`**

At the bottom of `src-tauri/src/commands.rs`, add:

```rust
#[tauri::command]
pub async fn list_linear_teams() -> Result<Vec<crate::linear::LinearTeam>, String> {
    let api_key = crate::keychain::get_api_key("linear")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Linear API key not configured".to_string())?;
    crate::linear::list_teams(&api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_linear_projects(team_id: String) -> Result<Vec<crate::linear::LinearProject>, String> {
    let api_key = crate::keychain::get_api_key("linear")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Linear API key not configured".to_string())?;
    crate::linear::list_projects(&api_key, &team_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_linear_ticket(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    summary_id: String,
    team_id: String,
    project_id: Option<String>,
    provider: String,
    model: String,
) -> Result<crate::db::LinearTicket, String> {
    // Fetch summary from DB
    let summaries = db.get_summaries(&"").map_err(|e| e.to_string())?;
    let summary = summaries
        .iter()
        .find(|s| s.id == summary_id)
        .ok_or_else(|| format!("Summary not found: {}", summary_id))?;
    let meeting = db.get_meeting(&summary.meeting_id).map_err(|e| e.to_string())?;

    // Use LLM to generate ticket title and description
    let llm_registry = llm.read().await;
    let llm_provider = llm_registry
        .get_provider(&provider)
        .ok_or_else(|| format!("Provider '{}' not found", provider))?;

    let messages = vec![
        crate::llm::ChatMessage {
            role: "system".into(),
            content: "You are a helpful assistant that creates Linear tickets from meeting summaries. Return valid JSON with exactly two fields: \"title\" (concise, under 80 characters) and \"description\" (markdown-formatted, structured with sections as appropriate). Return ONLY the JSON object, no other text.".into(),
        },
        crate::llm::ChatMessage {
            role: "user".into(),
            content: format!("Meeting: {}\n\nSummary:\n{}", meeting.title, summary.content),
        },
    ];

    let llm_response = llm_provider.chat(messages, &model).await.map_err(|e| e.to_string())?;

    // Parse LLM response, fallback to raw content
    let (title, description) = match serde_json::from_str::<serde_json::Value>(&llm_response) {
        Ok(json) => {
            let title = json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(&meeting.title)
                .to_string();
            let desc = json
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or(&summary.content)
                .to_string();
            (title, desc)
        }
        Err(_) => (meeting.title.clone(), summary.content.clone()),
    };

    // Get Linear API key and create issue
    let api_key = crate::keychain::get_api_key("linear")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Linear API key not configured".to_string())?;

    let issue = crate::linear::create_issue(
        &api_key,
        &team_id,
        project_id.as_deref(),
        &title,
        &description,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Store ticket reference in DB
    let ticket = db
        .create_linear_ticket(
            &summary_id,
            &summary.meeting_id,
            &issue.id,
            &issue.url,
            &issue.identifier,
            &issue.title,
            &team_id,
            project_id.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    Ok(ticket)
}

#[tauri::command]
pub fn get_linear_tickets(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<crate::db::LinearTicket>, String> {
    db.get_linear_tickets(&meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_linear_setting(
    db: State<'_, DbState>,
    key: String,
) -> Result<Option<String>, String> {
    db.get_linear_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_linear_setting(
    db: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    db.set_linear_setting(&key, &value)
        .map_err(|e| e.to_string())
}
```

**Step 2: Fix `get_summaries` call**

The `create_linear_ticket` command needs to find a summary by ID. Check if `db.get_summaries` takes a meeting_id. If there's no `get_summary_by_id` method, add one to `db.rs`:

```rust
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
            crate::NootleError::Other(format!("Summary not found: {}", id))
        }
        other => crate::NootleError::Database(other),
    })
}
```

Then update `create_linear_ticket` to use `db.get_summary(&summary_id)` instead of the `get_summaries` + `find` approach.

**Step 3: Register commands in `lib.rs`**

Add these to the `generate_handler!` macro in `src-tauri/src/lib.rs`:

```rust
commands::list_linear_teams,
commands::list_linear_projects,
commands::create_linear_ticket,
commands::get_linear_tickets,
commands::get_linear_setting,
commands::set_linear_setting,
```

**Step 4: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && cargo check -p nootle`
Expected: Compiles with no errors.

**Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/db.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for Linear ticket creation"
```

---

## Task 4: Add TypeScript Types and `useLinear` Hook

**Files:**
- Modify: `src/types.ts`
- Create: `src/hooks/useLinear.ts`

**Step 1: Add TypeScript types to `src/types.ts`**

At the bottom of the file, add:

```typescript
export interface LinearTicket {
  id: string;
  summary_id: string;
  meeting_id: string;
  linear_issue_id: string;
  linear_issue_url: string;
  linear_identifier: string;
  title: string;
  team_id: string;
  project_id: string | null;
  created_at: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearProject {
  id: string;
  name: string;
}
```

**Step 2: Create `src/hooks/useLinear.ts`**

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LinearTicket, LinearTeam, LinearProject } from "@/types";

export function useLinearTickets(meetingId: string) {
  const [tickets, setTickets] = useState<LinearTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<LinearTicket[]>("get_linear_tickets", {
        meetingId,
      });
      setTickets(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTicket = useCallback(
    async (
      summaryId: string,
      teamId: string,
      projectId: string | null,
      provider: string,
      model: string,
    ) => {
      const ticket = await invoke<LinearTicket>("create_linear_ticket", {
        summaryId,
        teamId,
        projectId,
        provider,
        model,
      });
      await refresh();
      return ticket;
    },
    [refresh],
  );

  return { tickets, loading, error, refresh, createTicket };
}

export function useLinearTeams() {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<LinearTeam[]>("list_linear_teams");
      setTeams(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { teams, loading, error, fetchTeams };
}

export function useLinearProjects(teamId: string | null) {
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setProjects([]);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await invoke<LinearProject[]>("list_linear_projects", {
          teamId,
        });
        setProjects(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [teamId]);

  return { projects, loading, error };
}

export function useLinearSettings() {
  const [defaultTeamId, setDefaultTeamId] = useState<string | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const teamId = await invoke<string | null>("get_linear_setting", {
          key: "default_team_id",
        });
        const projectId = await invoke<string | null>("get_linear_setting", {
          key: "default_project_id",
        });
        setDefaultTeamId(teamId);
        setDefaultProjectId(projectId);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveDefaultTeam = useCallback(async (teamId: string) => {
    await invoke("set_linear_setting", {
      key: "default_team_id",
      value: teamId,
    });
    setDefaultTeamId(teamId);
  }, []);

  const saveDefaultProject = useCallback(async (projectId: string) => {
    await invoke("set_linear_setting", {
      key: "default_project_id",
      value: projectId,
    });
    setDefaultProjectId(projectId);
  }, []);

  return {
    defaultTeamId,
    defaultProjectId,
    loading,
    saveDefaultTeam,
    saveDefaultProject,
  };
}
```

**Step 3: Verify frontend compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/types.ts src/hooks/useLinear.ts
git commit -m "feat: add useLinear hooks and TypeScript types"
```

---

## Task 5: Add Linear Section to Settings Page

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Add Linear settings section**

Import the hooks at the top:

```typescript
import { useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
```

After the existing API Keys `<Card>`, add a new Linear card:

```typescript
<Card>
  <CardHeader>
    <CardTitle>Linear</CardTitle>
    <CardDescription>
      Connect to Linear to create tickets from meeting summaries.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <ApiKeyRow
      provider="linear"
      isStored={storedProviders.includes("linear")}
      onSave={(key) => storeKey("linear", key)}
      onDelete={() => deleteKey("linear")}
    />
    {storedProviders.includes("linear") && (
      <LinearDefaults />
    )}
  </CardContent>
</Card>
```

**Step 2: Create the `LinearDefaults` component**

Add this component inside `Settings.tsx`, before the main `SettingsPage` export:

```typescript
function LinearDefaults() {
  const { teams, loading: teamsLoading, fetchTeams } = useLinearTeams();
  const { defaultTeamId, defaultProjectId, saveDefaultTeam, saveDefaultProject } =
    useLinearSettings();
  const { projects, loading: projectsLoading } = useLinearProjects(defaultTeamId);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Defaults</p>
      <div className="flex items-center gap-3">
        <label className="w-20 shrink-0 text-sm text-muted-foreground">Team</label>
        <select
          value={defaultTeamId ?? ""}
          onChange={(e) => saveDefaultTeam(e.target.value)}
          disabled={teamsLoading}
          className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">Select team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.key})
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <label className="w-20 shrink-0 text-sm text-muted-foreground">Project</label>
        <select
          value={defaultProjectId ?? ""}
          onChange={(e) => saveDefaultProject(e.target.value)}
          disabled={projectsLoading || !defaultTeamId}
          className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">None (optional)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

Add `useEffect` to the imports if not already present.

**Step 3: Verify frontend compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add Linear settings section with team/project defaults"
```

---

## Task 6: Add "Create Ticket" Button to Meeting Detail

**Files:**
- Modify: `src/pages/MeetingDetail.tsx`

**Step 1: Import hooks and types**

Add to the imports:

```typescript
import { useLinearTickets, useLinearTeams, useLinearProjects, useLinearSettings } from "@/hooks/useLinear";
```

**Step 2: Wire up hooks in the component**

Inside the `MeetingDetail` component, alongside the existing hooks:

```typescript
const { tickets, createTicket } = useLinearTickets(id!);
const { teams, fetchTeams } = useLinearTeams();
const { defaultTeamId, defaultProjectId } = useLinearSettings();
const { providers, models } = useLLM();
```

**Step 3: Create the `CreateTicketButton` component**

Add a component that renders on each summary tab. This can be defined inside `MeetingDetail.tsx`:

```typescript
function CreateTicketButton({
  summaryId,
  existingTicket,
  teams,
  defaultTeamId,
  defaultProjectId,
  providers,
  models,
  onFetchTeams,
  onCreate,
}: {
  summaryId: string;
  existingTicket: LinearTicket | undefined;
  teams: LinearTeam[];
  defaultTeamId: string | null;
  defaultProjectId: string | null;
  providers: string[];
  models: ModelInfo[];
  onFetchTeams: () => void;
  onCreate: (
    summaryId: string,
    teamId: string,
    projectId: string | null,
    provider: string,
    model: string,
  ) => Promise<LinearTicket>;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [selectedProvider, setSelectedProvider] = useState(providers[0] ?? "");
  const [selectedModel, setSelectedModel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { projects } = useLinearProjects(teamId || null);

  const filteredModels = models.filter((m) => m.provider === selectedProvider);

  // If ticket already exists, show the link
  if (existingTicket) {
    return (
      <a
        href={existingTicket.linear_issue_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {existingTicket.linear_identifier}
      </a>
    );
  }

  const handleCreate = async () => {
    if (!teamId || !selectedProvider || !selectedModel) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(
        summaryId,
        teamId,
        projectId || null,
        selectedProvider,
        selectedModel,
      );
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onFetchTeams();
          setOpen(true);
        }}
      >
        Create Ticket
      </Button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border p-3">
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setProjectId("");
            }}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.key})
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!teamId}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
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
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !teamId || !selectedProvider || !selectedModel}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
```

**Step 4: Render the button in each summary tab**

In the existing summary `TabsContent`, after the summary content `div`, add:

```typescript
<div className="mt-3 flex items-center gap-2">
  <CreateTicketButton
    summaryId={s.id}
    existingTicket={tickets.find((t) => t.summary_id === s.id)}
    teams={teams}
    defaultTeamId={defaultTeamId}
    defaultProjectId={defaultProjectId}
    providers={providers}
    models={models}
    onFetchTeams={fetchTeams}
    onCreate={createTicket}
  />
</div>
```

**Step 5: Verify frontend compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && npx tsc --noEmit`
Expected: No type errors.

**Step 6: Commit**

```bash
git add src/pages/MeetingDetail.tsx
git commit -m "feat: add Create Ticket button to summary cards"
```

---

## Task 7: Update Keychain Provider List

**Files:**
- Modify: `src-tauri/src/keychain.rs`

**Step 1: Add "linear" to `list_stored_providers`**

Update the `providers` array in `list_stored_providers`:

```rust
let providers = ["openai", "anthropic", "google", "groq", "linear"];
```

**Step 2: Verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && cargo check -p nootle`
Expected: Compiles with no errors.

**Step 3: Commit**

```bash
git add src-tauri/src/keychain.rs
git commit -m "feat: add linear to stored provider list"
```

---

## Task 8: Manual End-to-End Testing

**No files to modify — this is a verification task.**

**Step 1: Build and run the app**

Run: `cd /Users/michelle/conductor/workspaces/nootle/sydney && cargo tauri dev`

**Step 2: Verify Settings page**

- Open Settings
- Confirm "Linear" card appears below API Keys
- Add a Linear API key (personal access token from linear.app/settings/api)
- Confirm team dropdown loads
- Select a default team
- Confirm project dropdown loads
- Optionally select a default project

**Step 3: Verify Meeting Detail page**

- Open a meeting with at least one summary
- Confirm "Create Ticket" button appears on each summary
- Click "Create Ticket"
- Confirm popover shows with team/project/provider/model dropdowns
- Defaults should be pre-filled from settings
- Select provider + model and click "Create"
- Confirm spinner shows while creating
- Confirm button is replaced with the Linear ticket identifier link
- Click the link to confirm it opens the ticket in Linear

**Step 4: Verify error handling**

- Try creating a ticket with an invalid API key — confirm error toast
- Verify the button returns to "Create Ticket" state after an error
