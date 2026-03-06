# Post-Meeting Workflows

## Problem

Granola requires active note-taking and runs on cloud infrastructure. Nootle already differentiates on privacy (local-first) and passive capture (auto-detection, auto-transcription, auto-insights). The next leap: after a meeting ends, Nootle should *act* — pushing results to the tools users already live in, with one click.

## Core Concept

**Workflows** are one-click post-meeting actions. Connect your tools once in Settings, create reusable workflows, then fire them from any meeting.

## Architecture

Two layers:

1. **Integrations** — connections configured in Settings (Slack, Notion, Confluence, GitHub, Linear, Asana). OAuth or API key.
2. **Workflows** — reusable actions targeting one integration. Examples: "Post summary to #engineering", "Create Linear issues from action items", "Push notes to Confluence space X."

No auto-apply rules. No workflow grouping. Users run workflows manually via one-click buttons on the meeting detail page.

## Data Model

```
Integration
  id            TEXT PRIMARY KEY
  type          TEXT NOT NULL  -- slack | notion | confluence | github | linear | asana | email
  name          TEXT NOT NULL
  credentials_json TEXT NOT NULL
  created_at    TEXT NOT NULL

Workflow
  id            TEXT PRIMARY KEY
  name          TEXT NOT NULL
  description   TEXT
  icon          TEXT
  integration_id TEXT NOT NULL REFERENCES Integration(id)
  action_type   TEXT NOT NULL
  config_json   TEXT NOT NULL
  is_enabled    INTEGER NOT NULL DEFAULT 1
  created_at    TEXT NOT NULL

MeetingWorkflowRun
  id            TEXT PRIMARY KEY
  meeting_id    TEXT NOT NULL REFERENCES Meeting(id)
  workflow_id   TEXT NOT NULL REFERENCES Workflow(id)
  status        TEXT NOT NULL  -- pending | running | completed | failed
  result_json   TEXT
  error         TEXT
  started_at    TEXT NOT NULL
  completed_at  TEXT
```

## Action Types

| Integration   | Action Types                                              |
|---------------|-----------------------------------------------------------|
| Slack         | Post summary to channel, DM action items to assignees     |
| Notion        | Create page in database, append to existing page          |
| Confluence    | Create page in space                                      |
| GitHub        | Create issues from action items, create discussion        |
| Linear        | Create issues from action items (migrates existing feature)|
| Asana         | Create tasks from action items in a project               |
| Email         | Generate draft from template (copy/export, no send)       |

## UX

### Settings > Integrations

Connect accounts via OAuth or API key. Each integration type shows its connection status and a configure/disconnect button.

### Settings > Workflows

Create and edit workflows. Each workflow selects:
- An integration (must be connected first)
- An action type (filtered by integration)
- Configuration specific to the action (channel, space, repo, project, template, etc.)

### Meeting Detail Page

A **"Run workflow"** dropdown or toolbar near the existing action buttons. Shows all enabled workflows as one-click buttons. After running, shows status inline:
- Spinner while running
- Checkmark on success
- Error icon with retry on failure

### Run History

Expandable section on meeting detail showing past workflow runs with timestamps, status, and results.

## Email Workflow

No OAuth or SMTP integration required. User configures:
- Subject template
- Body template

Templates support variables: `{{title}}`, `{{date}}`, `{{summary}}`, `{{action_items}}`, `{{attendees}}`.

"Run" copies the formatted email to clipboard or exports as `.eml`.

## Linear Migration

The existing Linear ticket creation UI stays as-is for now. Linear also appears as an integration type so users can create workflows for it. Over time, the bespoke Linear UI can be replaced by the workflow system.

## Execution

- Each workflow runs independently — one failure does not block others.
- Results are stored per-run for audit and retry.
- Notification on completion: "Workflow completed" or "Failed — click to retry."
- Workflows require a summary or insights to exist before running (they operate on processed meeting data).
