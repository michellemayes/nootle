---
name: nootle-cli
description: Use when the user asks about meetings, transcripts, action items, insights, summaries, or anything related to recorded conversations from Nootle
---

# Nootle CLI

`nootle-cli` is a read-only CLI for querying meeting data recorded by the Nootle app. Output is JSON by default. Add `--pretty` for human-readable output.

## Database Location

Default: `~/Library/Application Support/Nootle/nootle.db`
Override: `--db <path>` or `NOOTLE_DB` env var

## Commands

### Meetings

```bash
# List all meetings
nootle-cli meetings list

# Filter by category
nootle-cli meetings list --category <category-id>

# Search by title
nootle-cli meetings list --search "standup"

# Include archived
nootle-cli meetings list --archived

# Get a specific meeting
nootle-cli meetings get <meeting-id>

# Get transcript
nootle-cli meetings transcript <meeting-id>
```

### Search

```bash
# Full-text search across all transcripts
nootle-cli search "quarterly review"
```

### Insights

```bash
# List all insights
nootle-cli insights list

# Filter by type (decision, action_item, key_moment, or custom slugs)
nootle-cli insights list --type decision

# Filter by status
nootle-cli insights list --status open

# Search insight content
nootle-cli insights list --search "deadline"

# Get insights for a specific meeting
nootle-cli insights get <meeting-id>

# List insight type definitions
nootle-cli insights types
```

### Action Items

```bash
# List all action items
nootle-cli actions list

# Filter by status
nootle-cli actions list --status open
nootle-cli actions list --status done
```

### Summaries

```bash
nootle-cli summaries get <meeting-id>
```

### Categories

```bash
nootle-cli categories list
```

### Prompts

```bash
nootle-cli prompts list
nootle-cli prompts get <prompt-id>
```

### Embeddings

```bash
nootle-cli embeddings status
```

### Chat History

```bash
nootle-cli chat conversations
nootle-cli chat messages <conversation-id>
```

## Output

All commands output JSON. Use `jq` for filtering:

```bash
# Get titles of all meetings
nootle-cli meetings list | jq '.[].title'

# Get open action items with assignees
nootle-cli actions list --status open | jq '.[] | {content, assignee}'

# Count meetings by status
nootle-cli meetings list --archived | jq 'group_by(.status) | map({status: .[0].status, count: length})'
```

## Important

- This tool is **read-only**. It queries data but never modifies it.
- The Nootle app does not need to be running for the CLI to work.
- Meeting IDs are UUIDs. Get them from `meetings list` first.
