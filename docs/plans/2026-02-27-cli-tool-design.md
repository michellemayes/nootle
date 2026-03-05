# nootle-cli Design

A read-only CLI tool for querying Nootle meeting data from the terminal.

## Requirements

- Read-only access to all Nootle data: meetings, transcripts, insights, action items, summaries, categories, prompts, embeddings status, chat history
- JSON output by default, `--pretty` for human-readable
- Lightweight binary — no Tauri, audio, or ML dependencies
- Ships with a Claude Code skill for global install
- Documented in the app's Help page

## Architecture

**Approach:** Second `[[bin]]` target in `src-tauri/Cargo.toml`, reusing the existing `Database` struct and model types from `db.rs`. No workspace restructure needed.

**New files:**
- `src-tauri/src/bin/nootle-cli.rs` — CLI entry point, clap arg parsing, command dispatch
- `src/help/cli-tool.md` — Help page docs (rendered in the app)
- `skills/nootle-cli.md` — Claude Code skill file

**Dependencies added to `src-tauri/Cargo.toml`:**
- `clap` with `derive` feature — argument parsing

**Existing deps reused:**
- `serde_json` — already present
- `rusqlite` — already present via `db.rs`

**DB path resolution order:**
1. `--db <path>` flag
2. `NOOTLE_DB` environment variable
3. Default: `~/Library/Application Support/Nootle/nootle.db` (macOS)

## Command Structure

```
nootle-cli [--db <path>] [--pretty] <command>

MEETINGS:
  nootle-cli meetings list [--category <id>] [--search <query>] [--archived]
  nootle-cli meetings get <id>
  nootle-cli meetings transcript <id>

SEARCH:
  nootle-cli search <query>

INSIGHTS:
  nootle-cli insights list [--type <slug>] [--status <open|done>] [--search <query>]
  nootle-cli insights get <meeting-id>

ACTION ITEMS:
  nootle-cli actions list [--status <open|done>]

SUMMARIES:
  nootle-cli summaries get <meeting-id>

CATEGORIES:
  nootle-cli categories list

PROMPTS:
  nootle-cli prompts list
  nootle-cli prompts get <id>

EMBEDDINGS:
  nootle-cli embeddings status

CHAT:
  nootle-cli chat conversations
  nootle-cli chat messages <conversation-id>
```

## Output Format

**JSON by default.** Every command outputs a JSON object or array to stdout.

**`--pretty` flag** activates human-readable formatting:
- Meetings: table with columns (id, title, date, status, category)
- Transcripts: `[HH:MM:SS] Speaker: text` format
- Insights: grouped by type with content
- Action items: table with assignee, due date, status
- Summaries: formatted text blocks

**Errors:** Printed to stderr as `{"error": "message"}`. Non-zero exit code.

## Claude Code Skill

A skill file that teaches Claude how to use `nootle-cli`. Users install it globally:

```bash
nootle-cli --setup-skill
```

This prints the `claude skill add --global` command with the skill file path, or copies the skill to the right location.

The skill content covers:
- When to use it (user asks about meetings, transcripts, action items, etc.)
- All commands with parameters and example output
- The tool is read-only — it queries data, never modifies it
- Output is JSON — pipe through `jq` for filtering

## Help Page

Add a `src/help/cli-tool.md` file rendered in the app's Help page, documenting:
- Install instructions (`cargo install --path src-tauri --bin nootle-cli`)
- All commands with examples
- Claude Code skill setup
- Relationship to the MCP server (CLI works without the app running; MCP requires the full binary)

## Build & Install

```bash
# Build
cargo build --bin nootle-cli --manifest-path src-tauri/Cargo.toml

# Install to PATH
cargo install --path src-tauri --bin nootle-cli
```

No changes to the existing Tauri app build.
