# Linear Integration Design

Turn meeting summaries into Linear tickets with one click.

## Overview

Add a Linear integration that lets users create a Linear issue from any meeting summary. The summary content is sent to the user's configured LLM to generate a clean ticket title and structured description, then posted to Linear's GraphQL API. Created tickets are stored locally and displayed on the summary.

## Authentication

Linear personal API key stored in macOS keychain via existing `keychain.rs`. Same pattern as LLM provider keys.

## Backend

### New module: `src-tauri/src/linear.rs`

Types:
- `LinearConfig` — team ID, default project ID
- `LinearTeam` / `LinearProject` — dropdown data
- `LinearTicket` — created ticket (id, url, identifier, title)

Functions:
- `list_teams(api_key)` — fetch user's Linear teams
- `list_projects(api_key, team_id)` — fetch projects in a team
- `create_issue(api_key, team_id, project_id, title, description)` — create an issue via Linear GraphQL API (`https://api.linear.app/graphql`)

All HTTP via `reqwest` (existing dependency). API key sent as Bearer token.

### Tauri commands

- `list_linear_teams` — returns teams for settings/dropdown
- `list_linear_projects(team_id)` — returns projects for dropdown
- `generate_linear_ticket(summary_id, team_id, project_id)` — orchestrates the full flow:
  1. Fetch summary content from DB
  2. Send to LLM with formatting prompt to get JSON `{title, description}`
  3. Call Linear API to create issue
  4. Store ticket reference in DB
  5. Return ticket to frontend
- `get_linear_tickets(meeting_id)` — return all tickets for a meeting

### LLM ticket formatting

Uses the user's configured default LLM provider/model. System prompt asks for JSON with `title` (under 80 chars) and `description` (markdown). If LLM returns malformed JSON, falls back to meeting name as title and raw summary as description.

## Database

### `linear_tickets` table

```sql
CREATE TABLE linear_tickets (
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
```

### `linear_settings` table

```sql
CREATE TABLE linear_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Stores `default_team_id` and `default_project_id`.

## Frontend

### Settings page — "Linear" section

- API key input (stored via keychain)
- Default team dropdown (populated after key saved)
- Default project dropdown (populated after team selected)

### Meeting Detail page — summary cards

- "Create Linear Ticket" button on each summary
- Clicking opens a popover with team/project dropdowns (pre-filled with defaults) and "Create" button
- Loading spinner during creation
- After creation: button replaced with ticket link (e.g. "ENG-123") that opens in browser

### `useLinear` hook

- `createTicket(summaryId, teamId, projectId)`
- `tickets` — tickets for current meeting
- `teams` / `projects` — for dropdowns
- `loading` / `error` state

## Error Handling

- **Auth errors (401):** Toast directing user to update key in Settings.
- **LLM format failure:** Fall back to meeting name + raw summary. Proceed with creation.
- **Rate limiting:** No special handling (Linear allows 1500 req/hr).
- **Duplicate prevention:** Button becomes a ticket link after creation. No explicit dedup.
- **Network errors:** Error toast with message. User can retry.
