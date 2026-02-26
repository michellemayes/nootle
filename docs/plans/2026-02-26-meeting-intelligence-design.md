# Meeting Intelligence: Auto-Extracted Insights

## Problem

After a meeting ends, users must manually review transcripts to find decisions, action items, and key moments. Granola surfaces these automatically. Nootle should too.

## Solution

Automatically extract structured insights (decisions, action items, key moments) from every meeting transcript using the configured LLM. Display them inline on each meeting and on a cross-meeting dashboard. Give action items full workflow: assignee, due date, status, and Linear integration.

## Approach

Structured extraction via a dedicated LLM pipeline (Approach A). The LLM returns typed JSON, which gets stored in normalized DB tables. This makes insights queryable, filterable, and sortable without parsing markdown.

Rejected alternatives:
- **Extend existing summary system** -- fragile markdown parsing, entangles summaries with structured data.
- **Embedding-based semantic search** -- too large a scope for v1; can layer on later.

## Data Model

### `insights` table

Stores all extracted items in a single table, differentiated by `type`.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| meeting_id | TEXT FK | References meetings(id) ON DELETE CASCADE |
| type | TEXT NOT NULL | `'decision'`, `'action_item'`, or `'key_moment'` |
| content | TEXT NOT NULL | The extracted text |
| context | TEXT | Surrounding transcript context |
| transcript_start_ms | INTEGER | Timestamp linking back to transcript |
| transcript_end_ms | INTEGER | End timestamp |
| created_at | TEXT NOT NULL | ISO datetime |

### `action_items` table

Workflow state for insights of type `'action_item'` only.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| insight_id | TEXT FK UNIQUE | References insights(id) ON DELETE CASCADE |
| assignee | TEXT | Free-text name (no user system yet) |
| due_date | TEXT | ISO date, nullable |
| status | TEXT NOT NULL | `'open'` or `'done'`, default `'open'` |
| linear_ticket_id | TEXT FK | References linear_tickets(id), nullable |
| updated_at | TEXT NOT NULL | ISO datetime |

### `extraction_runs` table

Tracks extraction runs for status and re-extraction.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| meeting_id | TEXT FK | References meetings(id) ON DELETE CASCADE |
| provider | TEXT NOT NULL | LLM provider used |
| model | TEXT NOT NULL | Model used |
| status | TEXT NOT NULL | `'running'`, `'completed'`, or `'failed'` |
| created_at | TEXT NOT NULL | ISO datetime |

## Extraction Pipeline

New module: `src-tauri/src/extraction.rs`

### Trigger

After transcription completes (meeting status -> `"transcribed"`), automatically call `extract_insights()`. Uses the user's configured default LLM provider/model.

### System prompt

A hardcoded extraction prompt (not user-configurable). Instructs the LLM to return structured JSON:

```json
{
  "decisions": [
    { "content": "We'll ship v2 by March", "context": "Discussion about timeline", "timestamp_ms": 145000 }
  ],
  "action_items": [
    { "content": "Set up staging environment", "assignee": "Sarah", "due_date": null, "context": "...", "timestamp_ms": 230000 }
  ],
  "key_moments": [
    { "content": "CEO announced pivot to enterprise", "context": "...", "timestamp_ms": 50000 }
  ]
}
```

### Parse and store

1. Parse JSON response into typed structs.
2. Create `insights` rows for each item.
3. Create `action_items` rows for each action item (with assignee, due_date from LLM output).
4. Record the `extraction_run` with status `'completed'` or `'failed'`.

### Re-extraction

A `re_extract_insights` Tauri command that deletes existing insights for a meeting and re-runs extraction. Exposed via a "Re-extract" button in the UI.

### Error handling

If the LLM returns malformed JSON, mark the extraction_run as `'failed'` and log the error. Insights are additive -- a failed extraction doesn't break the meeting.

## UI: Inline Meeting Insights

On the MeetingDetail page, a new "Insights" tab alongside transcript and summaries.

Three collapsible sections:

**Decisions** -- listed with content and timestamp. Click timestamp to scroll transcript.

**Action Items** -- each item shows:
- Checkbox (toggle open/done)
- Content text
- Assignee (inline editable)
- Due date (date picker)
- Status badge
- "Push to Linear" button (reuses existing Linear integration)

**Key Moments** -- listed with content and timestamp. Click timestamp to scroll transcript.

A "Re-extract" button at the bottom re-runs the extraction pipeline.

## UI: Cross-Meeting Insights Dashboard

A new top-level page in the sidebar, alongside Meeting Library.

### Sections

1. **Action Items** -- open items first, sorted by due date. Shows assignee, source meeting, and due date. Checkable from the dashboard.
2. **Recent Decisions** -- most recent first, shows source meeting and date.
3. **Key Moments** -- most recent first, shows source meeting and date.

### Filters

- Type (decision / action item / key moment)
- Date range
- Meeting category
- Assignee
- Status (open / done, for action items)

### Search

Full-text search across all insight content. Uses an FTS5 virtual table on the `insights` table.

### Navigation

Click any item to navigate to the source meeting's detail view, scrolled to the relevant insight.

## What this does NOT include

- Charts, analytics, or trend visualizations
- Email/notification system for due dates
- Recurring action item tracking
- Natural language search (embedding-based) -- future enhancement
- People/company entity tracking -- future enhancement

## Sources

Feature gap analysis based on:
- [Granola](https://www.granola.ai/)
- [Granola Review 2026 - efficient.app](https://efficient.app/apps/granola)
- [Granola Review - tl;dv](https://tldv.io/blog/granola-review/)
