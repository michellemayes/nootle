---
name: nootle-cli
description: Use when the user asks about meetings, transcripts, action items, insights, summaries, or anything related to recorded conversations from Nootle, wants to organize or edit meetings (labels, notes, titles, transcript fixes), ask questions across meetings, or set up Nootle workflows, integrations, summary templates, recipes, or insight types
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

# Export as Markdown (summaries, action items, notes, transcript), txt, srt, or vtt
nootle-cli meetings export <meeting-id> --format md
nootle-cli meetings export <meeting-id> --format srt --output call.srt

# Put a name to a diarized speaker
nootle-cli meetings rename-speaker <meeting-id> "Speaker 2" "Priya"

# Meeting with its labels, summaries, and scratch notes
nootle-cli meetings get <meeting-id> --full

# Edit: title, status (recording|transcribing|summarized|archived), template ("" clears), notes (text, @file, or -)
nootle-cli meetings update <meeting-id> --title "Q3 planning" --status archived
nootle-cli meetings update <meeting-id> --notes @notes.md

# Fix a transcript segment (segment IDs come from `meetings transcript`)
nootle-cli meetings edit-segment <segment-id> "We ship Kubernetes on Friday"

# Delete a meeting with its transcript, audio, and snapshots (confirm first)
nootle-cli meetings delete <meeting-id>
```

### Labels

Labels are referenced by ID or name.

```bash
nootle-cli labels list
nootle-cli labels create --name Customer --color "#3b82f6"
nootle-cli labels update Customer --name Customers
nootle-cli labels delete Customers
nootle-cli meetings label <meeting-id> --add Customer --remove Internal
nootle-cli meetings labels <meeting-id>
nootle-cli meetings list --label Customer
```

### Scratch notes, snapshots, dictionary

```bash
nootle-cli scratch-notes list <meeting-id>
nootle-cli scratch-notes add <meeting-id> "Follow up on pricing" --at-ms 120000
nootle-cli scratch-notes delete <note-id>

nootle-cli snapshots list <meeting-id>          # text read off shared screens
nootle-cli snapshots delete <snapshot-id>

nootle-cli dictionary list
nootle-cli dictionary add Kubernetes --misheard "cooper netties"
nootle-cli dictionary update <id> --misheard "cooper netties" --misheard "kuber nettis"
nootle-cli dictionary delete <id>
nootle-cli dictionary apply <meeting-id>        # re-correct an existing transcript
nootle-cli dictionary import-voiceink ~/Downloads/VoiceInk-Dictionary.json  # merge a VoiceInk export
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

# Update (ID is action_item_id, or the insight's id); "" clears assignee or due date
nootle-cli actions update <id> --status done
nootle-cli actions update <id> --assignee Priya --due-date 2026-10-31
```

### AI features

These send the transcript to an LLM. All take optional `--provider` and `--model`; without them Nootle uses the model it uses for automatic summaries. `nootle-cli llm models` lists what's available; if nothing is, the user needs to add an API key in Nootle's settings, install the Claude or Codex CLI, or run Ollama. Answers print as `{"response": ...}`; add `--pretty` for plain text.

```bash
nootle-cli llm models
nootle-cli meetings summarize <meeting-id> --template <template-id>   # defaults to the meeting's template
nootle-cli meetings ask <meeting-id> "What did we decide about pricing?"
nootle-cli meetings enrich-notes <meeting-id>
nootle-cli insights extract <meeting-id>             # --replace deletes existing insights first
nootle-cli analytics sentiment <meeting-id>
nootle-cli analytics get <meeting-id>                # speakers, engagement, sentiment (no LLM)
nootle-cli analytics compute <meeting-id>            # recompute speakers and engagement (no LLM)
```

### Asking across all meetings

Needs the search model, which the user downloads in Nootle under Settings → Models (`embeddings status` shows `model_available`).

```bash
nootle-cli embeddings embed --all                    # index unarchived meetings not yet searchable; prints chunks_added, failed
nootle-cli ask "When did we last talk about hiring?" --label Customer --from 2026-01-01 --to 2026-06-30
nootle-cli ask "..." --save                          # keep it as a chat conversation
nootle-cli chat send <conversation-id> "And who owns it?"   # continue a conversation
```

### Recipes

Slash-command prompts run against a meeting. Prompts may use `{{transcript}}`, `{{title}}`, `{{date}}`, `{{summary}}`.

```bash
nootle-cli recipes list
nootle-cli recipes create --name "Brief" --command brief --prompt @prompt.txt --format markdown   # markdown|plain|json
nootle-cli recipes update <id> --prompt "..."
nootle-cli recipes delete <id>
nootle-cli recipes run <id> --meeting <meeting-id>
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
nootle-cli chat create
nootle-cli chat rename <conversation-id> "Hiring questions"
nootle-cli chat delete <conversation-id>
```

### Settings, API keys, Linear

```bash
nootle-cli settings list
nootle-cli settings set dictionary_auto_learn false       # also denoise_enabled, detection_enabled, remote_control_enabled
nootle-cli settings set summarization_provider anthropic  # provider automatic work uses
nootle-cli api-keys list                                  # keys are never shown
echo "$KEY" | nootle-cli api-keys set anthropic           # or --key @file; never inline
nootle-cli api-keys delete anthropic
nootle-cli linear tickets <meeting-id>
```

Never ask the user to paste an API key into the chat; have them run `api-keys set` themselves.

### Recording and calendar (macOS)

```bash
nootle-cli record start --title "Design review"   # also: record stop, record toggle
nootle-cli calendar --hours 24
```

`record` sends a `nootle://` URL to the running app, which must have Settings → Recording → Allow URL control on (`settings set remote_control_enabled true`). The app reports the result as a notification, not to the CLI.

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

- Query commands never modify data. Other commands do: confirm with the user before deleting anything (meetings, labels, snapshots, recipes, conversations), running a workflow (runs post to external services), or replacing insights.
- AI commands send transcripts to the chosen LLM provider and can take a while.
- The Nootle app does not need to be running for the CLI to work (except `record`). If it's open, the user may need to reopen a page to see changes.
- Meeting IDs are UUIDs. Get them from `meetings list` first.
