use clap::{Parser, Subcommand};
use std::process;

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
        Ok(db) => db,
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
            MeetingsAction::List {
                category,
                search,
                archived,
            } => {
                let meetings =
                    db.list_meetings(category.as_deref(), search.as_deref(), *archived)?;
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
            InsightsAction::List {
                insight_type,
                status,
                search,
            } => {
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
                let insights = db.get_all_insights(Some("action_item"), status.as_deref(), None)?;
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
                print_json(
                    &serde_json::json!({
                        "embedded_meetings": embedded,
                        "total_meetings": total,
                    }),
                    pretty,
                );
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
