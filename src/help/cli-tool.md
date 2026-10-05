# CLI Tool

Nootle includes a command-line tool (`nootle-cli`) for querying your meeting data and managing automations from the terminal. It reads and writes the Nootle database directly — the app doesn't need to be running.

## Install

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
```

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

Credentials are never printed. If Nootle is open, reopen the page to see changes.

## All Commands

| Command | Description |
|---------|-------------|
| `meetings list` | List meetings (supports `--search`, `--archived`) |
| `meetings get <id>` | Get a meeting by ID |
| `meetings transcript <id>` | Get the transcript for a meeting |
| `meetings export <id> --format md\|txt\|srt\|vtt [--output FILE]` | Export a meeting as Markdown, plain text, or subtitles |
| `meetings rename-speaker <id> <from> <to>` | Rename a speaker throughout a meeting |
| `search <query>` | Full-text search across all transcripts |
| `insights list` | List insights (supports `--type`, `--status`, `--search`) |
| `insights get <meeting-id>` | Get insights for a meeting |
| `insights types` | List insight type definitions |
| `actions list` | List action items (supports `--status`) |
| `summaries get <meeting-id>` | Get summaries for a meeting |
| `embeddings status` | Show embedding status |
| `chat conversations` | List chat conversations |
| `chat messages <id>` | List messages in a conversation |
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

| | CLI (`nootle-cli`) | MCP Server (`nootle --mcp`) |
|---|---|---|
| **Use case** | Terminal queries, scripts, piping | AI assistant integration |
| **Data access** | All data (meetings, insights, chat, etc.) | Meetings, transcripts, search |
| **Automations** | Create, update, run, delete | Create, update, run, delete |
| **Output** | JSON (or `--pretty`) | MCP protocol |
| **Requires app** | No | No |
| **Binary size** | Small (no ML/audio deps) | Full app binary |
