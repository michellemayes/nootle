---
name: nootle-cli
description: Use when the user asks about meetings, transcripts, action items, insights, summaries, or anything related to recorded conversations from Nootle, or wants to set up Nootle workflows, integrations, summary templates, or insight types
---

# Nootle CLI

`nootle-cli` is a CLI for querying meeting data recorded by the Nootle app and managing its automations. Output is JSON by default. Add `--pretty` for human-readable output.

## Database Location

Default: `~/Library/Application Support/Nootle/nootle.db`
Override: `--db <path>` or `NOOTLE_DB` env var

## Commands

### Meetings

```bash
# List all meetings
nootle-cli meetings list

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

### Templates

```bash
nootle-cli templates list
nootle-cli templates get <template-id>
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

## Automations

Set these up when the user asks for them. Run `nootle-cli catalog` first: it lists each integration type's credential fields, its actions, each action's config fields, the `{{placeholders}}` text fields accept (`{{title}}`, `{{date}}`, `{{summary}}`, `{{template_summary}}`, `{{action_items}}`), and the icons insight types can use. Invalid input fails with an error listing what's allowed.

### Integrations

A workflow sends to an integration, so connect one first. Ask the user for credentials; pass them on stdin so they stay out of shell history. Credentials are never printed back.

```bash
echo '{"bot_token":"xoxb-..."}' | nootle-cli integrations create --type slack --credentials -
nootle-cli integrations create --type email            # no credentials needed
nootle-cli integrations list
nootle-cli integrations update <id> --name "Work Slack"
nootle-cli integrations delete <id>                    # also deletes its workflows
```

### Workflows

A workflow sends a meeting's summary or action items to an integration. The user runs it from a meeting's Run menu; `workflows run` runs it now.

```bash
nootle-cli workflows create --name "Post to #eng" --integration <integration-id> --set channel=#eng
nootle-cli workflows create --name "Issues" --integration <github-id> \
  --config '{"repo":"acme/app","description_prompt":"Include why it matters"}'
nootle-cli workflows update <id> --set message_template='*{{title}}*: {{summary}}'
nootle-cli workflows disable <id>                      # hide from the Run menu
nootle-cli workflows run <id> --meeting <meeting-id>   # sends to the external service
nootle-cli workflows runs --meeting <meeting-id>
```

`--set` merges one field into the current config; `--config` replaces it. Set `template_id` to a template's ID to use that template's summary as `{{template_summary}}`. Pass `--provider` and `--model` to `run` when the workflow has a `description_prompt`, or a `template_id` the meeting has no summary for yet; without them it falls back to plain descriptions and the meeting's existing summary.

### Summary templates

```bash
nootle-cli templates create --name "1:1" --section Wins --section Blockers --prompt "Be brief" --auto-run
nootle-cli templates update <id> --auto-run false
nootle-cli templates delete <id>                       # built-ins can't be deleted
```

`--auto-run` summarizes every new meeting with the template.

### Insight types

Custom things to extract from every transcript, alongside decisions and action items.

```bash
nootle-cli insight-types create --name Risk --prompt "Risks or concerns someone raised" --icon alert-triangle
nootle-cli insight-types create --name "Follow-up" --prompt "..." --action-fields  # adds assignee, due date, status
nootle-cli insight-types update <id> --prompt "..."
nootle-cli insight-types delete <id>
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

- Query commands never modify data. Automation commands do: confirm with the user before deleting anything or running a workflow, since runs post to external services.
- The Nootle app does not need to be running for the CLI to work. If it's open, the user may need to reopen a page to see changes.
- Meeting IDs are UUIDs. Get them from `meetings list` first.
