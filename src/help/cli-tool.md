# CLI Tool

Nootle includes a command-line tool (`nootle-cli`) for querying your meeting data from the terminal. It reads directly from the Nootle database — the app doesn't need to be running.

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

## All Commands

| Command | Description |
|---------|-------------|
| `meetings list` | List meetings (supports `--category`, `--search`, `--archived`) |
| `meetings get <id>` | Get a meeting by ID |
| `meetings transcript <id>` | Get the transcript for a meeting |
| `search <query>` | Full-text search across all transcripts |
| `insights list` | List insights (supports `--type`, `--status`, `--search`) |
| `insights get <meeting-id>` | Get insights for a meeting |
| `insights types` | List insight type definitions |
| `actions list` | List action items (supports `--status`) |
| `summaries get <meeting-id>` | Get summaries for a meeting |
| `categories list` | List all categories |
| `prompts list` | List all prompts |
| `prompts get <id>` | Get a prompt by ID |
| `embeddings status` | Show embedding status |
| `chat conversations` | List chat conversations |
| `chat messages <id>` | List messages in a conversation |

## Database Location

By default, `nootle-cli` reads from `~/Library/Application Support/Nootle/nootle.db`. Override with:

- `--db /path/to/nootle.db`
- `NOOTLE_DB=/path/to/nootle.db`

## Claude Code Skill

Install the Nootle skill so Claude can query your meetings:

```bash
claude skill add --global --file "$(dirname $(which nootle-cli))/../skills/nootle-cli.md"
```

Once installed, ask Claude things like:
- *"What meetings did I have this week?"*
- *"Search my transcripts for discussions about the Q3 roadmap."*
- *"Show me open action items."*

## CLI vs MCP Server

| | CLI (`nootle-cli`) | MCP Server (`nootle --mcp`) |
|---|---|---|
| **Use case** | Terminal queries, scripts, piping | AI assistant integration |
| **Data access** | All data (meetings, insights, chat, etc.) | Meetings, transcripts, search |
| **Output** | JSON (or `--pretty`) | MCP protocol |
| **Requires app** | No | No |
| **Binary size** | Small (no ML/audio deps) | Full app binary |
