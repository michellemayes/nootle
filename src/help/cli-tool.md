# CLI Tool

Nootle includes a command-line tool (`nootle-cli`) for querying your meeting data and managing automations from the terminal. It reads and writes the Nootle database directly — the app doesn't need to be running.

## Install

`nootle-cli` ships inside Nootle.app. Put it on your PATH with:

```bash
sudo ln -sf /Applications/Nootle.app/Contents/MacOS/nootle-cli /usr/local/bin/nootle-cli
```

If you built from source:

```bash
cargo install --path src-tauri --bin nootle-cli
```

Or build without installing:

```bash
cargo build --release --bin nootle-cli --manifest-path src-tauri/Cargo.toml
# Binary at: src-tauri/target/release/nootle-cli
```

## Usage

All commands output JSON by default. Add `--pretty` for formatted output.

```bash
# List your meetings
nootle-cli meetings list

# Pretty-print a transcript
nootle-cli --pretty meetings transcript <meeting-id>

# Search across all transcripts
nootle-cli search "budget review"

# List open action items
nootle-cli actions list --status open

# Get insights for a meeting
nootle-cli insights get <meeting-id>

# Check embedding status
nootle-cli embeddings status

# Rename, re-label, or archive a meeting
nootle-cli meetings update <meeting-id> --title "Q3 planning" --status archived
nootle-cli meetings label <meeting-id> --add Customer
```

## AI features

Commands that call an LLM take optional `--provider` and `--model`. Without them, Nootle uses the same model as automatic summaries (pin it with `nootle-cli settings set summarization_provider <provider>`). List what's available with `nootle-cli llm models`. These send the meeting's transcript to the provider.

```bash
nootle-cli meetings summarize <meeting-id> --template <template-id>
nootle-cli meetings ask <meeting-id> "What did we decide about pricing?"
nootle-cli insights extract <meeting-id> --replace
nootle-cli recipes run <recipe-id> --meeting <meeting-id>

# Ask across every meeting (needs the search model from Settings → Models)
nootle-cli embeddings embed --all
nootle-cli ask "When did we last discuss hiring?" --label Customer --from 2026-01-01
```

Add `--pretty` to print an answer as plain text.

## Automations

Scripts and agents can set up integrations, workflows, summary templates, and insight types. Input is validated, and errors list what's allowed.

```bash
# What can be automated: integration types, actions, and their fields
nootle-cli catalog

# Connect Slack; read credentials from stdin (or @file) to keep them out of shell history
echo '{"bot_token":"xoxb-..."}' | nootle-cli integrations create --type slack --credentials -

# Post summaries to #eng, then run it on a meeting
nootle-cli workflows create --name "Post to #eng" --integration <integration-id> --set channel=#eng
nootle-cli workflows run <workflow-id> --meeting <meeting-id>

# Summarize every new meeting with a custom template
nootle-cli templates create --name "1:1" --section Wins --section Blockers --auto-run
```

Credentials and API keys are never printed. If Nootle is open, reopen the page to see changes, and restart it after changing an API key.

## All Commands

| Command | Description |
|---------|-------------|
| `meetings list` | List meetings (supports `--search`, `--archived`) |
| `meetings get <id>` | Get a meeting by ID |
| `meetings transcript <id>` | Get the transcript for a meeting |
| `meetings export <id> --format md\|txt\|srt\|vtt [--output FILE]` | Export a meeting as Markdown, plain text, or subtitles |
| `meetings list --label <label>` | Only meetings with a label (ID or name) |
| `meetings get <id> --full` | Include labels, summaries, and scratch notes |
| `meetings rename-speaker <id> <from> <to>` | Rename a speaker throughout a meeting |
| `meetings update <id>` | Change `--title`, `--status`, `--template` (`""` clears), or `--notes` (text, `@file`, or `-`) |
| `meetings delete <id>` | Delete a meeting with its transcript, audio, and snapshots |
| `meetings labels <id>` | List a meeting's labels |
| `meetings label <id> --add <label> --remove <label>` | Add or remove labels on a meeting (repeatable) |
| `meetings edit-segment <segment-id> <text>` | Correct a transcript segment; with auto-learn on, the fix joins the dictionary |
| `meetings summarize <id> [--template <id>]` | Summarize with a template (LLM) |
| `meetings ask <id> <question>` | Ask about one meeting (LLM) |
| `meetings enrich-notes <id>` | Merge your notes with details from the transcript (LLM) |
| `ask <question>` | Ask across all meetings (LLM; `--label`, `--from`, `--to`, `--save` to keep it as a conversation) |
| `search <query>` | Full-text search across all transcripts |
| `insights list` | List insights (supports `--type`, `--status`, `--search`) |
| `insights get <meeting-id>` | Get insights for a meeting |
| `insights types` | List insight type definitions |
| `insights extract <meeting-id> [--replace]` | Extract insights from a transcript (LLM) |
| `actions list` | List action items (supports `--status`) |
| `actions update <id>` | Set `--status open\|done\|cancelled`, `--assignee`, or `--due-date` |
| `labels list` / `create` / `update <id>` / `delete <id>` | Manage labels (`--name`, `--color #rrggbb`, `--icon`) |
| `scratch-notes list <meeting-id>` / `add <meeting-id> <text>` / `delete <id>` | Manage a meeting's scratch notes |
| `snapshots list <meeting-id>` / `delete <id>` | List or delete screen snapshots |
| `dictionary list` / `add <term> --misheard <variant>` / `update <id>` / `delete <id>` | Manage the transcript dictionary |
| `dictionary apply <meeting-id>` | Apply the dictionary to an existing transcript |
| `recipes list` / `get <id>` / `create` / `update <id>` / `delete <id>` | Manage recipes (slash commands) |
| `recipes run <id> --meeting <id>` | Run a recipe on a meeting (LLM) |
| `analytics get <meeting-id>` | Speaker, engagement, and sentiment analytics |
| `analytics compute <meeting-id>` | Recompute speaker and engagement analytics |
| `analytics sentiment <meeting-id>` | Analyze sentiment over the meeting (LLM) |
| `embeddings embed <meeting-id>` / `embed --all` | Add meetings to the search index `ask` uses (`--all`: every meeting not archived or already indexed). Prints `chunks_added` and any `failed` meetings |
| `llm models` | List available LLM providers and models |
| `summaries get <meeting-id>` | Get summaries for a meeting |
| `embeddings status` | Show embedding status |
| `chat conversations` | List chat conversations |
| `chat messages <id>` | List messages in a conversation |
| `chat create` / `rename <id> <title>` / `delete <id>` | Manage conversations |
| `chat send <id> <message>` | Ask in a conversation, answered from all meetings (LLM) |
| `settings list` / `get <key>` / `set <key> <value>` | App toggles (`denoise_enabled`, `detection_enabled`, `remote_control_enabled`, `dictionary_auto_learn`) and `summarization_provider` |
| `linear tickets <meeting-id>` | Linear tickets created from a meeting |
| `api-keys list` / `set <provider>` / `delete <provider>` | Manage API keys; `set` reads the key from stdin or `--key @file` |
| `record start [--title T]` / `stop` / `toggle` | Control recording in the running app (needs Settings → Recording → Allow URL control) |
| `calendar [--hours N]` | Upcoming calendar events (needs calendar access) |
| `catalog` | Integration types, actions, config fields, and placeholders |
| `integrations list` | List integrations (credentials hidden) |
| `integrations create` / `update <id>` / `delete <id>` | Manage integrations |
| `workflows list` / `get <id>` | List or get workflows |
| `workflows create` / `update <id>` / `delete <id>` | Manage workflows (config via `--config` JSON or `--set key=value`) |
| `workflows enable <id>` / `disable <id>` | Show or hide a workflow in the meeting Run menu |
| `workflows run <id> --meeting <id>` | Run a workflow on a meeting now |
| `workflows runs --meeting <id>` | List a meeting's workflow runs |
| `templates list` / `get <id>` | List or get summary templates |
| `templates create` / `update <id>` / `delete <id>` | Manage templates (`--section` repeatable, `--auto-run`) |
| `insight-types list` / `create` / `update <id>` / `delete <id>` | Manage insight types |

## Database Location

By default, `nootle-cli` reads from `~/Library/Application Support/Nootle/nootle.db`. Override with:

- `--db /path/to/nootle.db`
- `NOOTLE_DB=/path/to/nootle.db`

## Claude Code Skill

Install the Nootle skill so Claude can query your meetings and manage automations:

```bash
claude skill add --global --file "$(dirname $(which nootle-cli))/../skills/nootle-cli.md"
```

Once installed, ask Claude things like:
- *"What meetings did I have this week?"*
- *"Search my transcripts for discussions about the Q3 roadmap."*
- *"Show me open action items."*
- *"Add a workflow that saves meeting notes to my Obsidian vault."*

## CLI vs MCP Server

| | CLI (`nootle-cli`) | MCP Server (`nootle-cli mcp`) |
|---|---|---|
| **Use case** | Terminal queries, scripts, piping | AI assistant integration |
| **Data access** | All data (meetings, insights, chat, etc.) | Meetings, transcripts, search |
| **API keys, recording, calendar** | Yes | No |
| **Automations** | Create, update, run, delete | Create, update, run, delete |
| **Output** | JSON (or `--pretty`) | MCP protocol |
| **Requires app** | No | No |
| **Binary size** | Small (no ML/audio deps) | Full app binary |
