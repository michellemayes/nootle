# nootle-cli Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a read-only CLI tool (`nootle-cli`) that queries all Nootle meeting data from SQLite, outputs JSON by default, and ships with a Claude Code skill.

**Architecture:** Second `[[bin]]` target in `src-tauri/Cargo.toml` at `src-tauri/src/bin/nootle-cli.rs`. Imports `db.rs` and model structs from the existing crate. No Tauri, audio, or ML code touched.

**Tech Stack:** Rust, clap (derive), serde_json, existing rusqlite/db layer

---

### Task 1: Add clap dependency and binary target

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add clap dependency and bin target**

Add to `[dependencies]`:
```toml
clap = { version = "4", features = ["derive"] }
```

Add after the `[lib]` section:
```toml
[[bin]]
name = "nootle-cli"
path = "src/bin/nootle-cli.rs"
```

**Step 2: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "Add clap dependency and nootle-cli binary target"
```

---

### Task 2: Create CLI skeleton with DB connection

**Files:**
- Create: `src-tauri/src/bin/nootle-cli.rs`

**Step 1: Write the CLI entry point with clap arg parsing**

```rust
use clap::{Parser, Subcommand};
use std::process;
use std::sync::Arc;

#[derive(Parser)]
#[command(name = "nootle-cli", about = "Query Nootle meeting data")]
struct Cli {
    /// Path to the Nootle database file
    #[arg(long, env = "NOOTLE_DB")]
    db: Option<String>,

    /// Pretty-print output for human readability
    #[arg(long, global = true)]
    pretty: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List and query meetings
    Meetings {
        #[command(subcommand)]
        action: MeetingsAction,
    },
    /// Full-text search across transcripts
    Search {
        /// Search query
        query: String,
    },
    /// List and query insights
    Insights {
        #[command(subcommand)]
        action: InsightsAction,
    },
    /// List action items
    Actions {
        #[command(subcommand)]
        action: ActionsAction,
    },
    /// Get summaries for a meeting
    Summaries {
        #[command(subcommand)]
        action: SummariesAction,
    },
    /// List categories
    Categories {
        #[command(subcommand)]
        action: CategoriesAction,
    },
    /// List and query prompts
    Prompts {
        #[command(subcommand)]
        action: PromptsAction,
    },
    /// Show embedding status
    Embeddings {
        #[command(subcommand)]
        action: EmbeddingsAction,
    },
    /// List chat conversations and messages
    Chat {
        #[command(subcommand)]
        action: ChatAction,
    },
}

#[derive(Subcommand)]
enum MeetingsAction {
    /// List meetings
    List {
        /// Filter by category ID
        #[arg(long)]
        category: Option<String>,
        /// Search by title
        #[arg(long)]
        search: Option<String>,
        /// Include archived meetings
        #[arg(long)]
        archived: bool,
    },
    /// Get a meeting by ID
    Get {
        /// Meeting ID
        id: String,
    },
    /// Get the transcript for a meeting
    Transcript {
        /// Meeting ID
        id: String,
    },
}

#[derive(Subcommand)]
enum InsightsAction {
    /// List all insights
    List {
        /// Filter by insight type slug
        #[arg(long, name = "type")]
        insight_type: Option<String>,
        /// Filter by status (open or done)
        #[arg(long)]
        status: Option<String>,
        /// Search insight content
        #[arg(long)]
        search: Option<String>,
    },
    /// Get insights for a specific meeting
    Get {
        /// Meeting ID
        meeting_id: String,
    },
    /// List insight type definitions
    Types,
}

#[derive(Subcommand)]
enum ActionsAction {
    /// List action items
    List {
        /// Filter by status (open or done)
        #[arg(long)]
        status: Option<String>,
    },
}

#[derive(Subcommand)]
enum SummariesAction {
    /// Get summaries for a meeting
    Get {
        /// Meeting ID
        meeting_id: String,
    },
}

#[derive(Subcommand)]
enum CategoriesAction {
    /// List all categories
    List,
}

#[derive(Subcommand)]
enum PromptsAction {
    /// List all prompts
    List,
    /// Get a prompt by ID
    Get {
        /// Prompt ID
        id: String,
    },
}

#[derive(Subcommand)]
enum EmbeddingsAction {
    /// Show embedding status
    Status,
}

#[derive(Subcommand)]
enum ChatAction {
    /// List chat conversations
    Conversations,
    /// List messages in a conversation
    Messages {
        /// Conversation ID
        conversation_id: String,
    },
}

fn default_db_path() -> String {
    dirs::data_dir()
        .expect("Could not determine data directory")
        .join("Nootle")
        .join("nootle.db")
        .to_string_lossy()
        .into_owned()
}

fn print_json<T: serde::Serialize>(value: &T, pretty: bool) {
    let output = if pretty {
        serde_json::to_string_pretty(value).unwrap()
    } else {
        serde_json::to_string(value).unwrap()
    };
    println!("{output}");
}

fn print_error(msg: &str) -> ! {
    eprintln!("{}", serde_json::json!({"error": msg}));
    process::exit(1);
}

fn main() {
    let cli = Cli::parse();
    let db_path = cli.db.unwrap_or_else(default_db_path);

    let db = match nootle_app_lib::db::Database::new(&db_path) {
        Ok(db) => Arc::new(db),
        Err(e) => print_error(&format!("Failed to open database at {db_path}: {e}")),
    };

    let result = run_command(&db, &cli.command, cli.pretty);
    if let Err(e) = result {
        print_error(&e.to_string());
    }
}

fn run_command(
    db: &nootle_app_lib::db::Database,
    command: &Commands,
    pretty: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    match command {
        Commands::Meetings { action } => match action {
            MeetingsAction::List { category, search, archived } => {
                let meetings = db.list_meetings(
                    category.as_deref(),
                    search.as_deref(),
                    *archived,
                )?;
                print_json(&meetings, pretty);
            }
            MeetingsAction::Get { id } => {
                let meeting = db.get_meeting(id)?;
                print_json(&meeting, pretty);
            }
            MeetingsAction::Transcript { id } => {
                let segments = db.get_transcript(id)?;
                if pretty {
                    for seg in &segments {
                        let secs = seg.start_ms / 1000;
                        let h = secs / 3600;
                        let m = (secs % 3600) / 60;
                        let s = secs % 60;
                        println!("[{h:02}:{m:02}:{s:02}] {}: {}", seg.speaker_label, seg.text);
                    }
                } else {
                    print_json(&segments, false);
                }
            }
        },
        Commands::Search { query } => {
            let results = db.search_transcripts(query)?;
            print_json(&results, pretty);
        }
        Commands::Insights { action } => match action {
            InsightsAction::List { insight_type, status, search } => {
                let insights = db.get_all_insights(
                    insight_type.as_deref(),
                    status.as_deref(),
                    search.as_deref(),
                )?;
                print_json(&insights, pretty);
            }
            InsightsAction::Get { meeting_id } => {
                let insights = db.get_insights_for_meeting(meeting_id)?;
                print_json(&insights, pretty);
            }
            InsightsAction::Types => {
                let types = db.list_insight_types()?;
                print_json(&types, pretty);
            }
        },
        Commands::Actions { action } => match action {
            ActionsAction::List { status } => {
                // Use get_all_insights with status filter — action items are joined with insights
                let insights = db.get_all_insights(
                    Some("action_item"),
                    status.as_deref(),
                    None,
                )?;
                print_json(&insights, pretty);
            }
        },
        Commands::Summaries { action } => match action {
            SummariesAction::Get { meeting_id } => {
                let summaries = db.get_summaries_for_meeting(meeting_id)?;
                print_json(&summaries, pretty);
            }
        },
        Commands::Categories { action } => match action {
            CategoriesAction::List => {
                let categories = db.list_categories()?;
                print_json(&categories, pretty);
            }
        },
        Commands::Prompts { action } => match action {
            PromptsAction::List => {
                let prompts = db.list_prompts()?;
                print_json(&prompts, pretty);
            }
            PromptsAction::Get { id } => {
                let prompt = db.get_prompt(id)?;
                print_json(&prompt, pretty);
            }
        },
        Commands::Embeddings { action } => match action {
            EmbeddingsAction::Status => {
                let (embedded, total) = db.get_embedding_status()?;
                print_json(&serde_json::json!({
                    "embedded_meetings": embedded,
                    "total_meetings": total,
                }), pretty);
            }
        },
        Commands::Chat { action } => match action {
            ChatAction::Conversations => {
                let convos = db.list_chat_conversations()?;
                print_json(&convos, pretty);
            }
            ChatAction::Messages { conversation_id } => {
                let messages = db.list_chat_messages(conversation_id)?;
                print_json(&messages, pretty);
            }
        },
    }
    Ok(())
}
```

**Step 2: Build to verify it compiles**

Run: `cd /Users/michelle/conductor/workspaces/nootle/cebu && cargo build --bin nootle-cli --manifest-path src-tauri/Cargo.toml`
Expected: Successful compilation (warnings OK)

**Step 3: Commit**

```bash
git add src-tauri/src/bin/nootle-cli.rs
git commit -m "Add nootle-cli binary with all read commands"
```

---

### Task 3: Create Claude Code skill file

**Files:**
- Create: `src-tauri/skills/nootle-cli.md`

**Step 1: Write the skill**

```markdown
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
```

**Step 2: Commit**

```bash
git add src-tauri/skills/nootle-cli.md
git commit -m "Add Claude Code skill for nootle-cli"
```

---

### Task 4: Add help docs and update Help page

**Files:**
- Create: `src/help/cli-tool.md`
- Modify: `src/pages/Help.tsx`

**Step 1: Write the CLI help doc**

Create `src/help/cli-tool.md`:

```markdown
# CLI Tool

Nootle includes a command-line tool (`nootle-cli`) for querying your meeting data from the terminal. It reads directly from the Nootle database — the app doesn't need to be running.

## Install

If you built from source:

\`\`\`bash
cargo install --path src-tauri --bin nootle-cli
\`\`\`

Or build without installing:

\`\`\`bash
cargo build --release --bin nootle-cli --manifest-path src-tauri/Cargo.toml
# Binary at: src-tauri/target/release/nootle-cli
\`\`\`

## Usage

All commands output JSON by default. Add `--pretty` for formatted output.

\`\`\`bash
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
\`\`\`

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

\`\`\`bash
claude skill add --global --file "$(dirname $(which nootle-cli))/../skills/nootle-cli.md"
\`\`\`

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
\`\`\`

**Step 2: Update Help.tsx to add the CLI tab**

In `src/pages/Help.tsx`, add the import and tab entry:

Add import:
```typescript
import cliToolMd from "@/help/cli-tool.md?raw";
```

Add to the `tabs` array (after mcp-server entry):
```typescript
{ value: "cli-tool", label: "CLI Tool", content: cliToolMd },
```

**Step 3: Commit**

```bash
git add src/help/cli-tool.md src/pages/Help.tsx
git commit -m "Add CLI tool help docs and Help page tab"
```

---

### Task 5: Build, test, and verify

**Step 1: Build the CLI**

Run: `cd /Users/michelle/conductor/workspaces/nootle/cebu && cargo build --bin nootle-cli --manifest-path src-tauri/Cargo.toml`
Expected: Successful build

**Step 2: Run basic commands to verify**

```bash
./src-tauri/target/debug/nootle-cli --help
./src-tauri/target/debug/nootle-cli meetings list
./src-tauri/target/debug/nootle-cli categories list
./src-tauri/target/debug/nootle-cli --pretty meetings list
./src-tauri/target/debug/nootle-cli embeddings status
```

Expected: JSON output (or pretty output) without errors. If no meetings exist yet, empty arrays `[]` are fine.

**Step 3: Verify the Tauri app still builds**

Run: `cd /Users/michelle/conductor/workspaces/nootle/cebu && cargo build --lib --manifest-path src-tauri/Cargo.toml`
Expected: Successful build, no regressions

**Step 4: Run clippy**

Run: `cd /Users/michelle/conductor/workspaces/nootle/cebu && cargo clippy --bin nootle-cli --manifest-path src-tauri/Cargo.toml`
Expected: No errors (warnings OK)

---

### Task 6: Final commit and summary

**Step 1: Verify all changes**

```bash
git log --oneline -5
```

Expected commits:
1. `Add clap dependency and nootle-cli binary target`
2. `Add nootle-cli binary with all read commands`
3. `Add Claude Code skill for nootle-cli`
4. `Add CLI tool help docs and Help page tab`
