use clap::{Parser, Subcommand};
use nootle_app_lib::db::{Database, NewRecipe};
use nootle_app_lib::embedding::EmbeddingEngine;
use nootle_app_lib::llm::LlmRegistry;
use nootle_app_lib::{automation, ops};
use std::future::Future;
use std::process;

type CliResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

#[derive(Parser)]
#[command(
    name = "nootle-cli",
    about = "Query Nootle meeting data and manage its automations"
)]
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
    /// List, query, and edit meetings
    Meetings {
        #[command(subcommand)]
        action: MeetingsAction,
    },
    /// Full-text search across transcripts
    Search {
        /// Search query
        query: String,
    },
    /// Ask a question answered from all meetings' transcripts (LLM)
    Ask {
        question: String,
        #[command(flatten)]
        filters: AskFilterArgs,
        /// Save the question and answer as a new chat conversation
        #[arg(long)]
        save: bool,
        #[command(flatten)]
        llm: LlmArgs,
    },
    /// List, query, and extract insights
    Insights {
        #[command(subcommand)]
        action: InsightsAction,
    },
    /// List and update action items
    Actions {
        #[command(subcommand)]
        action: ActionsAction,
    },
    /// Get summaries for a meeting
    Summaries {
        #[command(subcommand)]
        action: SummariesAction,
    },
    /// List and manage labels
    Labels {
        #[command(subcommand)]
        action: LabelsAction,
    },
    /// List and manage a meeting's timestamped scratch notes
    ScratchNotes {
        #[command(subcommand)]
        action: ScratchNotesAction,
    },
    /// List and delete screenshots captured from shared screens
    Snapshots {
        #[command(subcommand)]
        action: SnapshotsAction,
    },
    /// Manage the custom dictionary used to correct transcripts
    Dictionary {
        #[command(subcommand)]
        action: DictionaryAction,
    },
    /// List, manage, and run recipes (slash commands)
    Recipes {
        #[command(subcommand)]
        action: RecipesAction,
    },
    /// List and manage summary templates
    Templates {
        #[command(subcommand)]
        action: TemplatesAction,
    },
    /// Show the integration types, actions, and config fields automations can use
    Catalog,
    /// List and manage connected integrations
    Integrations {
        #[command(subcommand)]
        action: IntegrationsAction,
    },
    /// List, manage, and run workflows
    Workflows {
        #[command(subcommand)]
        action: WorkflowsAction,
    },
    /// List and manage insight types
    InsightTypes {
        #[command(subcommand)]
        action: InsightTypesAction,
    },
    /// Speaker, engagement, and sentiment analytics
    Analytics {
        #[command(subcommand)]
        action: AnalyticsAction,
    },
    /// Show embedding status and build the search index
    Embeddings {
        #[command(subcommand)]
        action: EmbeddingsAction,
    },
    /// List the LLM providers and models available
    Llm {
        #[command(subcommand)]
        action: LlmAction,
    },
    /// Serve Nootle's MCP server over stdio, for Claude Code and other MCP clients
    Mcp,
    /// List and manage chat conversations
    Chat {
        #[command(subcommand)]
        action: ChatAction,
    },
    /// Read and change app settings
    Settings {
        #[command(subcommand)]
        action: SettingsAction,
    },
    /// Linear tickets created from meetings
    Linear {
        #[command(subcommand)]
        action: LinearAction,
    },
    /// Store and remove API keys for LLM providers and Linear
    ApiKeys {
        #[command(subcommand)]
        action: ApiKeysAction,
    },
    /// Start or stop recording in the running Nootle app (macOS)
    Record {
        #[command(subcommand)]
        action: RecordAction,
    },
    /// List upcoming calendar events (macOS; needs calendar access)
    Calendar {
        /// How many hours ahead to look
        #[arg(long, default_value_t = 12)]
        hours: i64,
    },
}

/// Provider and model for commands that call an LLM.
#[derive(clap::Args)]
struct LlmArgs {
    /// LLM provider, e.g. anthropic or ollama (see `nootle-cli llm models`);
    /// defaults to the one automatic work uses
    #[arg(long)]
    provider: Option<String>,
    /// Model ID; defaults to the provider's first model
    #[arg(long)]
    model: Option<String>,
}

/// Filters for questions asked across all meetings.
#[derive(clap::Args)]
struct AskFilterArgs {
    /// Only search meetings with this label (ID or name); repeatable
    #[arg(long = "label")]
    labels: Vec<String>,
    /// Only search meetings on or after this date (YYYY-MM-DD)
    #[arg(long)]
    from: Option<String>,
    /// Only search meetings on or before this date (YYYY-MM-DD)
    #[arg(long)]
    to: Option<String>,
}

#[derive(Subcommand)]
enum MeetingsAction {
    /// List meetings
    List {
        /// Search by title
        #[arg(long)]
        search: Option<String>,
        /// Include archived meetings
        #[arg(long)]
        archived: bool,
        /// Only meetings with this label (ID or name)
        #[arg(long)]
        label: Option<String>,
    },
    /// Get a meeting by ID
    Get {
        /// Meeting ID
        id: String,
        /// Include labels, summaries, and scratch notes
        #[arg(long)]
        full: bool,
    },
    /// Get the transcript for a meeting
    Transcript {
        /// Meeting ID
        id: String,
    },
    /// Export a meeting as Markdown, a plain-text transcript, or subtitles
    Export {
        /// Meeting ID
        id: String,
        /// md (summaries, action items, notes, transcript), txt, srt, or vtt
        #[arg(long, default_value = "md")]
        format: String,
        /// Write to this file instead of stdout
        #[arg(long, short)]
        output: Option<std::path::PathBuf>,
    },
    /// Rename a speaker throughout a meeting's transcript
    RenameSpeaker {
        /// Meeting ID
        id: String,
        /// Current label, e.g. "Speaker 2"
        from: String,
        /// New name
        to: String,
    },
    /// Change a meeting's title, status, template, or notes
    Update {
        /// Meeting ID
        id: String,
        #[arg(long)]
        title: Option<String>,
        /// recording, transcribing, summarized, or archived
        #[arg(long)]
        status: Option<String>,
        /// Template to summarize with; pass "" to clear
        #[arg(long)]
        template: Option<String>,
        /// Replacement notes as text, @file, or - for stdin
        #[arg(long)]
        notes: Option<String>,
    },
    /// Delete a meeting with its transcript, audio, and snapshots
    Delete {
        /// Meeting ID
        id: String,
    },
    /// List a meeting's labels
    Labels {
        /// Meeting ID
        id: String,
    },
    /// Add or remove labels on a meeting
    Label {
        /// Meeting ID
        id: String,
        /// Label ID or name to add; repeatable
        #[arg(long)]
        add: Vec<String>,
        /// Label ID or name to remove; repeatable
        #[arg(long)]
        remove: Vec<String>,
    },
    /// Correct one transcript segment; with auto-learn on, the fix joins the
    /// dictionary and is applied to the rest of the meeting
    EditSegment {
        /// Segment ID (from `meetings transcript`)
        segment_id: String,
        /// Corrected text
        text: String,
    },
    /// Summarize a meeting with a template (LLM)
    Summarize {
        /// Meeting ID
        id: String,
        /// Template ID; defaults to the meeting's template
        #[arg(long)]
        template: Option<String>,
        #[command(flatten)]
        llm: LlmArgs,
    },
    /// Ask a question about one meeting (LLM)
    Ask {
        /// Meeting ID
        id: String,
        question: String,
        #[command(flatten)]
        llm: LlmArgs,
    },
    /// Merge a meeting's notes with details from its transcript (LLM)
    EnrichNotes {
        /// Meeting ID
        id: String,
        #[command(flatten)]
        llm: LlmArgs,
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
    /// Extract insights from a meeting's transcript (LLM)
    Extract {
        /// Meeting ID
        meeting_id: String,
        /// Delete the meeting's existing insights first
        #[arg(long)]
        replace: bool,
        #[command(flatten)]
        llm: LlmArgs,
    },
}

#[derive(Subcommand)]
enum ActionsAction {
    /// List action items
    List {
        /// Filter by status (open or done)
        #[arg(long)]
        status: Option<String>,
    },
    /// Update an action item; omitted options keep their current value
    Update {
        /// Action item ID (or its insight's ID)
        id: String,
        /// open, done, or cancelled
        #[arg(long)]
        status: Option<String>,
        /// New assignee; pass "" to clear
        #[arg(long)]
        assignee: Option<String>,
        /// New due date, e.g. 2026-10-31; pass "" to clear
        #[arg(long)]
        due_date: Option<String>,
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
enum LabelsAction {
    /// List labels
    List,
    /// Create a label
    Create {
        #[arg(long)]
        name: String,
        /// Hex color, e.g. #3b82f6
        #[arg(long)]
        color: String,
        #[arg(long)]
        icon: Option<String>,
    },
    /// Update a label; omitted options keep their current value
    Update {
        /// Label ID or name
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        color: Option<String>,
        /// New icon; pass "" to clear
        #[arg(long)]
        icon: Option<String>,
    },
    /// Delete a label and remove it from every meeting
    Delete {
        /// Label ID or name
        id: String,
    },
}

#[derive(Subcommand)]
enum ScratchNotesAction {
    /// List a meeting's scratch notes
    List {
        /// Meeting ID
        meeting_id: String,
    },
    /// Add a scratch note to a meeting
    Add {
        /// Meeting ID
        meeting_id: String,
        content: String,
        /// Time into the recording the note refers to, in milliseconds
        #[arg(long, default_value_t = 0)]
        at_ms: i64,
    },
    /// Delete a scratch note
    Delete { id: String },
}

#[derive(Subcommand)]
enum SnapshotsAction {
    /// List a meeting's snapshots
    List {
        /// Meeting ID
        meeting_id: String,
    },
    /// Delete a snapshot and its image
    Delete { id: String },
}

#[derive(Subcommand)]
enum DictionaryAction {
    /// List dictionary entries
    List,
    /// Add a term, or add misheard variants to an existing one
    Add {
        /// Correct spelling, e.g. "Kubernetes"
        term: String,
        /// How it gets misheard, e.g. "cooper netties"; repeatable
        #[arg(long)]
        misheard: Vec<String>,
    },
    /// Update an entry; omitted options keep their current value
    Update {
        id: String,
        #[arg(long)]
        term: Option<String>,
        /// Replacement misheard variant; repeat for each
        #[arg(long)]
        misheard: Option<Vec<String>>,
    },
    /// Delete an entry
    Delete { id: String },
    /// Apply the dictionary to an already-recorded meeting's transcript
    Apply {
        /// Meeting ID
        meeting_id: String,
    },
}

#[derive(Subcommand)]
enum RecipesAction {
    /// List recipes
    List,
    /// Get a recipe by ID
    Get { id: String },
    /// Create a recipe
    Create {
        #[arg(long)]
        name: String,
        /// Slash command name (letters, numbers, hyphens), e.g. brief
        #[arg(long)]
        command: String,
        /// Prompt as text, @file, or - for stdin; may use {{transcript}},
        /// {{title}}, {{date}}, and {{summary}}
        #[arg(long)]
        prompt: String,
        #[arg(long, default_value = "")]
        description: String,
        /// markdown, plain, or json
        #[arg(long, default_value = "markdown")]
        format: String,
    },
    /// Update a recipe; omitted options keep their current value
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        command: Option<String>,
        /// Prompt as text, @file, or - for stdin
        #[arg(long)]
        prompt: Option<String>,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        format: Option<String>,
    },
    /// Delete a recipe
    Delete { id: String },
    /// Run a recipe on a meeting (LLM)
    Run {
        /// Recipe ID
        id: String,
        /// Meeting ID
        #[arg(long)]
        meeting: String,
        #[command(flatten)]
        llm: LlmArgs,
    },
}

#[derive(Subcommand)]
enum TemplatesAction {
    /// List all templates
    List,
    /// Get a template by ID
    Get {
        /// Template ID
        id: String,
    },
    /// Create a template
    Create {
        #[arg(long)]
        name: String,
        /// Section heading; repeat for each section, in order
        #[arg(long = "section", required = true)]
        sections: Vec<String>,
        #[arg(long)]
        description: Option<String>,
        /// Extra instructions for the summarizer
        #[arg(long)]
        prompt: Option<String>,
        /// Summarize every new meeting with this template automatically
        #[arg(long)]
        auto_run: bool,
        /// Pin to the top of the template picker
        #[arg(long)]
        favorite: bool,
    },
    /// Update a template; omitted options keep their current value
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        /// Replacement section heading; repeat for each section
        #[arg(long = "section")]
        sections: Option<Vec<String>>,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        prompt: Option<String>,
        #[arg(long)]
        auto_run: Option<bool>,
        #[arg(long)]
        favorite: Option<bool>,
    },
    /// Delete a template (built-in templates can't be deleted)
    Delete { id: String },
}

#[derive(Subcommand)]
enum IntegrationsAction {
    /// List integrations (credentials are never shown)
    List,
    /// Connect an integration
    Create {
        /// Integration type, e.g. slack (see `nootle-cli catalog`)
        #[arg(long = "type")]
        integration_type: String,
        /// Display name; defaults to the integration's name
        #[arg(long)]
        name: Option<String>,
        /// Credentials as a JSON object, @file, or - for stdin
        #[arg(long)]
        credentials: Option<String>,
    },
    /// Rename an integration or replace its credentials
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        /// Replacement credentials as a JSON object, @file, or - for stdin
        #[arg(long)]
        credentials: Option<String>,
    },
    /// Delete an integration and its workflows
    Delete { id: String },
}

#[derive(Subcommand)]
enum WorkflowsAction {
    /// List workflows
    List,
    /// Get a workflow by ID
    Get { id: String },
    /// Create a workflow
    Create {
        #[arg(long)]
        name: String,
        /// ID of the integration to send to
        #[arg(long = "integration")]
        integration_id: String,
        /// Action type; optional when the integration has only one
        #[arg(long = "action")]
        action_type: Option<String>,
        /// Config as a JSON object, @file, or - for stdin
        #[arg(long)]
        config: Option<String>,
        /// Set one config field, e.g. --set channel=#eng; repeatable
        #[arg(long = "set", value_name = "KEY=VALUE")]
        sets: Vec<String>,
        #[arg(long)]
        description: Option<String>,
        /// Emoji shown next to the workflow
        #[arg(long)]
        icon: Option<String>,
    },
    /// Update a workflow; omitted options keep their current value
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long = "integration")]
        integration_id: Option<String>,
        #[arg(long = "action")]
        action_type: Option<String>,
        /// Replacement config as a JSON object, @file, or - for stdin
        #[arg(long)]
        config: Option<String>,
        /// Set one config field on top of the current config; repeatable
        #[arg(long = "set", value_name = "KEY=VALUE")]
        sets: Vec<String>,
        /// New description; pass "" to clear
        #[arg(long)]
        description: Option<String>,
        /// New emoji; pass "" to clear
        #[arg(long)]
        icon: Option<String>,
    },
    /// Show a workflow in meetings' Run menu
    Enable { id: String },
    /// Hide a workflow from meetings' Run menu
    Disable { id: String },
    /// Delete a workflow
    Delete { id: String },
    /// Run a workflow against a meeting now
    Run {
        /// Workflow ID
        id: String,
        /// Meeting ID
        #[arg(long)]
        meeting: String,
        /// LLM provider for LLM-backed steps, e.g. anthropic or ollama
        #[arg(long)]
        provider: Option<String>,
        /// Model ID for --provider
        #[arg(long)]
        model: Option<String>,
    },
    /// List workflow runs for a meeting
    Runs {
        /// Meeting ID
        #[arg(long)]
        meeting: String,
    },
}

#[derive(Subcommand)]
enum InsightTypesAction {
    /// List insight types
    List,
    /// Create a custom insight type
    Create {
        #[arg(long)]
        name: String,
        /// Identifier used in filters; derived from the name when omitted
        #[arg(long)]
        slug: Option<String>,
        #[arg(long)]
        description: Option<String>,
        /// What to extract from each transcript
        #[arg(long)]
        prompt: String,
        /// Icon (see `nootle-cli catalog`); defaults to lightbulb
        #[arg(long)]
        icon: Option<String>,
        /// Give insights an assignee, due date, and open/done status
        #[arg(long)]
        action_fields: bool,
    },
    /// Update an insight type; omitted options keep their current value
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        /// New description; pass "" to clear
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        prompt: Option<String>,
        #[arg(long)]
        icon: Option<String>,
        #[arg(long)]
        action_fields: Option<bool>,
    },
    /// Delete a custom insight type (built-in types can't be deleted)
    Delete { id: String },
}

#[derive(Subcommand)]
enum AnalyticsAction {
    /// Show a meeting's speaker, engagement, and sentiment analytics
    Get {
        /// Meeting ID
        meeting_id: String,
    },
    /// Recompute speaker and engagement analytics from the transcript
    Compute {
        /// Meeting ID
        meeting_id: String,
    },
    /// Analyze how sentiment changes over a meeting (LLM)
    Sentiment {
        /// Meeting ID
        meeting_id: String,
        #[command(flatten)]
        llm: LlmArgs,
    },
}

#[derive(Subcommand)]
enum EmbeddingsAction {
    /// Show embedding status
    Status,
    /// Add meetings to the search index `ask` uses
    Embed {
        /// Meeting ID
        #[arg(required_unless_present = "all", conflicts_with = "all")]
        meeting_id: Option<String>,
        /// Embed every meeting not yet indexed
        #[arg(long)]
        all: bool,
    },
}

#[derive(Subcommand)]
enum LlmAction {
    /// List the models of every provider available on this machine
    Models,
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
    /// Start an empty conversation
    Create,
    /// Rename a conversation
    Rename { id: String, title: String },
    /// Delete a conversation and its messages
    Delete { id: String },
    /// Ask a question in a conversation, answered from all meetings (LLM)
    Send {
        /// Conversation ID
        conversation_id: String,
        message: String,
        #[command(flatten)]
        filters: AskFilterArgs,
        #[command(flatten)]
        llm: LlmArgs,
    },
}

#[derive(Subcommand)]
enum SettingsAction {
    /// Show every setting the CLI can change
    List,
    /// Get one setting
    Get { key: String },
    /// Change a setting
    Set { key: String, value: String },
}

#[derive(Subcommand)]
enum LinearAction {
    /// List Linear tickets created from a meeting
    Tickets {
        /// Meeting ID
        meeting_id: String,
    },
}

#[derive(Subcommand)]
enum ApiKeysAction {
    /// List providers with a stored key (keys are never shown)
    List,
    /// Store a provider's API key
    Set {
        /// openai, anthropic, google, groq, openrouter, bedrock, codex,
        /// claude-agent, linear, or asana
        provider: String,
        /// - to read the key from stdin, or @file
        #[arg(long, default_value = "-")]
        key: String,
    },
    /// Delete a provider's API key
    Delete { provider: String },
}

#[derive(Subcommand)]
enum RecordAction {
    /// Start recording
    Start {
        /// Meeting title; defaults to the current calendar event or the time
        #[arg(long)]
        title: Option<String>,
    },
    /// Stop recording
    Stop,
    /// Start recording, or stop if already recording
    Toggle {
        /// Meeting title when this starts a recording
        #[arg(long)]
        title: Option<String>,
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

/// Prints LLM output as `{key: text}`, or as plain text with `--pretty`.
fn print_text(key: &str, text: &str, pretty: bool) {
    if pretty {
        println!("{text}");
    } else {
        print_json(&serde_json::json!({ key: text }), false);
    }
}

fn print_deleted(id: &str, pretty: bool) {
    print_json(&serde_json::json!({ "deleted": id }), pretty);
}

fn print_error(msg: &str) -> ! {
    eprintln!("{}", serde_json::json!({"error": msg}));
    process::exit(1);
}

/// Reads an argument given inline, as `@path`, or as `-` for stdin, so long
/// text and secrets needn't appear in shell history.
fn read_text_arg(arg: &str) -> CliResult<String> {
    Ok(match arg {
        "-" => std::io::read_to_string(std::io::stdin())?,
        _ => match arg.strip_prefix('@') {
            Some(path) => std::fs::read_to_string(path)?,
            None => arg.to_string(),
        },
    })
}

fn read_json_arg(arg: &str) -> CliResult<serde_json::Value> {
    Ok(serde_json::from_str(&read_text_arg(arg)?)?)
}

/// Reads an API key from stdin (`-`) or `@path`, never inline, where it would
/// land in shell history.
fn read_secret_arg(arg: &str) -> CliResult<String> {
    if arg != "-" && !arg.starts_with('@') {
        return Err(
            "Pass the key on stdin (--key -, the default) or as --key @file, \
                    so it stays out of shell history"
                .into(),
        );
    }
    let key = read_text_arg(arg)?.trim().to_string();
    if key.is_empty() {
        return Err("The API key is empty".into());
    }
    Ok(key)
}

/// Builds a workflow config from `--config` and `--set` options, starting
/// from `current` when only `--set` is given. `None` when neither is given.
fn workflow_config(
    config: Option<&str>,
    sets: &[String],
    current: impl FnOnce() -> CliResult<serde_json::Value>,
) -> CliResult<Option<serde_json::Value>> {
    let mut value = match (config, sets.is_empty()) {
        (Some(c), _) => read_json_arg(c)?,
        (None, false) => current()?,
        (None, true) => return Ok(None),
    };
    if value.is_null() {
        value = serde_json::json!({});
    }
    let obj = value
        .as_object_mut()
        .ok_or("--config must be a JSON object")?;
    for set in sets {
        let (key, val) = set
            .split_once('=')
            .ok_or_else(|| format!("--set expects KEY=VALUE, got '{set}'"))?;
        obj.insert(key.to_string(), val.into());
    }
    Ok(Some(value))
}

/// Runs one of the library's async operations to completion.
fn block_on<T, E: Into<Box<dyn std::error::Error>>>(
    future: impl Future<Output = Result<T, E>>,
) -> CliResult<T> {
    tokio::runtime::Runtime::new()?
        .block_on(future)
        .map_err(Into::into)
}

/// The LLM providers on this machine, with the provider and model `args`
/// resolve to.
fn llm(db: &Database, args: &LlmArgs) -> CliResult<(LlmRegistry, String, String)> {
    Ok(ops::detect_llm(
        db,
        args.provider.as_deref(),
        args.model.as_deref(),
    )?)
}

/// Answers `question` from all meetings: in `conversation_id`, in a new
/// saved conversation with `save`, or else one-off.
fn ask(
    db: &Database,
    question: &str,
    conversation_id: Option<&str>,
    save: bool,
    filters: &AskFilterArgs,
    llm_args: &LlmArgs,
) -> CliResult<serde_json::Value> {
    let filters = ops::AskFilters {
        label_ids: ops::find_label_ids(db, &filters.labels)?,
        date_from: filters.from.clone(),
        date_to: filters.to.clone(),
    };
    let embedding = ops::embed_question(&mut ops::load_embedding_engine()?, question)?;
    let (llm, provider, model) = llm(db, llm_args)?;
    block_on(ops::ask(
        db,
        &llm,
        &embedding,
        question,
        conversation_id,
        save,
        &provider,
        &model,
        &filters,
    ))
}

fn main() {
    let cli = Cli::parse();
    let db_path = cli.db.unwrap_or_else(default_db_path);

    let db = match Database::new(&db_path) {
        Ok(db) => db,
        Err(e) => print_error(&format!("Failed to open database at {db_path}: {e}")),
    };

    if let Commands::Mcp = cli.command {
        if let Err(e) = nootle_app_lib::mcp::serve_stdio(db) {
            print_error(&e.to_string());
        }
        return;
    }

    let result = run_command(&db, &cli.command, cli.pretty);
    if let Err(e) = result {
        print_error(&e.to_string());
    }
}

fn run_command(db: &Database, command: &Commands, pretty: bool) -> CliResult {
    match command {
        Commands::Meetings { action } => run_meetings(db, action, pretty)?,
        Commands::Search { query } => {
            let results = db.search_transcripts(query)?;
            print_json(&results, pretty);
        }
        Commands::Ask {
            question,
            filters,
            save,
            llm: llm_args,
        } => print_json(&ask(db, question, None, *save, filters, llm_args)?, pretty),
        Commands::Insights { action } => match action {
            InsightsAction::List {
                insight_type,
                status,
                search,
            } => {
                let insights = db.get_all_insights(
                    None,
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
            InsightsAction::Extract {
                meeting_id,
                replace,
                llm: llm_args,
            } => {
                db.get_meeting(meeting_id)?;
                let (llm, provider, model) = llm(db, llm_args)?;
                let insights = block_on(ops::extract_insights(
                    db, &llm, meeting_id, &provider, &model, *replace,
                ))?;
                print_json(&insights, pretty);
            }
        },
        Commands::Actions { action } => match action {
            ActionsAction::List { status } => {
                let insights =
                    db.get_all_insights(None, Some("action_item"), status.as_deref(), None)?;
                print_json(&insights, pretty);
            }
            ActionsAction::Update {
                id,
                status,
                assignee,
                due_date,
            } => {
                if status.is_none() && assignee.is_none() && due_date.is_none() {
                    return Err("Pass --status, --assignee, or --due-date".into());
                }
                // Accept the insight's ID too, since `actions list` shows both.
                let item_id = match db.get_action_item_id_for_insight(id)? {
                    Some(item_id) => item_id,
                    None => id.clone(),
                };
                let item = ops::update_action_item(
                    db,
                    &item_id,
                    status.as_deref(),
                    assignee.as_deref(),
                    due_date.as_deref(),
                )?;
                print_json(&item, pretty);
            }
        },
        Commands::Summaries { action } => match action {
            SummariesAction::Get { meeting_id } => {
                let summaries = db.get_summaries_for_meeting(meeting_id)?;
                print_json(&summaries, pretty);
            }
        },
        Commands::Labels { action } => match action {
            LabelsAction::List => print_json(&db.list_labels()?, pretty),
            LabelsAction::Create { name, color, icon } => {
                let label = ops::create_label(db, name, color, icon.as_deref())?;
                print_json(&label, pretty);
            }
            LabelsAction::Update {
                id,
                name,
                color,
                icon,
            } => {
                let label_id = ops::find_label(&db.list_labels()?, id)?.id.clone();
                let updated = ops::update_label(
                    db,
                    &label_id,
                    name.as_deref(),
                    color.as_deref(),
                    icon.as_deref(),
                )?;
                print_json(&updated, pretty);
            }
            LabelsAction::Delete { id } => {
                let label_id = ops::find_label(&db.list_labels()?, id)?.id.clone();
                db.delete_label(&label_id)?;
                print_deleted(&label_id, pretty);
            }
        },
        Commands::ScratchNotes { action } => match action {
            ScratchNotesAction::List { meeting_id } => {
                print_json(&db.get_scratch_notes(meeting_id)?, pretty)
            }
            ScratchNotesAction::Add {
                meeting_id,
                content,
                at_ms,
            } => {
                db.get_meeting(meeting_id)?;
                let note = db.add_scratch_note(meeting_id, content, *at_ms)?;
                print_json(&note, pretty);
            }
            ScratchNotesAction::Delete { id } => {
                db.delete_scratch_note(id)?;
                print_deleted(id, pretty);
            }
        },
        Commands::Snapshots { action } => match action {
            SnapshotsAction::List { meeting_id } => {
                print_json(&db.get_snapshots(meeting_id)?, pretty)
            }
            SnapshotsAction::Delete { id } => {
                ops::delete_snapshot(db, id)?;
                print_deleted(id, pretty);
            }
        },
        Commands::Dictionary { action } => run_dictionary(db, action, pretty)?,
        Commands::Recipes { action } => run_recipes(db, action, pretty)?,
        Commands::Templates { action } => match action {
            TemplatesAction::List => {
                let templates = db.list_templates()?;
                print_json(&templates, pretty);
            }
            TemplatesAction::Get { id } => {
                let template = db.get_template(id)?;
                print_json(&template, pretty);
            }
            TemplatesAction::Create {
                name,
                sections,
                description,
                prompt,
                auto_run,
                favorite,
            } => {
                let input = automation::NewTemplateInput {
                    name: name.clone(),
                    description: description.clone(),
                    sections: sections.clone(),
                    prompt: prompt.clone(),
                    auto_run: *auto_run,
                    favorite: *favorite,
                };
                print_json(&automation::create_template(db, &input)?, pretty);
            }
            TemplatesAction::Update {
                id,
                name,
                sections,
                description,
                prompt,
                auto_run,
                favorite,
            } => {
                let patch = automation::TemplatePatch {
                    name: name.clone(),
                    description: description.clone(),
                    sections: sections.clone(),
                    prompt: prompt.clone(),
                    auto_run: *auto_run,
                    favorite: *favorite,
                };
                print_json(&automation::update_template(db, id, &patch)?, pretty);
            }
            TemplatesAction::Delete { id } => {
                db.delete_template(id)?;
                print_deleted(id, pretty);
            }
        },
        Commands::Catalog => print_json(&automation::catalog(), pretty),
        Commands::Integrations { action } => match action {
            IntegrationsAction::List => print_json(&db.list_integrations_safe()?, pretty),
            IntegrationsAction::Create {
                integration_type,
                name,
                credentials,
            } => {
                let credentials = match credentials {
                    Some(c) => read_json_arg(c)?,
                    None => serde_json::Value::Null,
                };
                let created = automation::create_integration(
                    db,
                    integration_type,
                    name.as_deref(),
                    &credentials,
                )?;
                print_json(&created, pretty);
            }
            IntegrationsAction::Update {
                id,
                name,
                credentials,
            } => {
                let credentials = credentials.as_deref().map(read_json_arg).transpose()?;
                let updated =
                    automation::update_integration(db, id, name.as_deref(), credentials.as_ref())?;
                print_json(&updated, pretty);
            }
            IntegrationsAction::Delete { id } => {
                db.delete_integration(id)?;
                print_deleted(id, pretty);
            }
        },
        Commands::Workflows { action } => match action {
            WorkflowsAction::List => print_json(&db.list_workflows()?, pretty),
            WorkflowsAction::Get { id } => print_json(&db.get_workflow(id)?, pretty),
            WorkflowsAction::Create {
                name,
                integration_id,
                action_type,
                config,
                sets,
                description,
                icon,
            } => {
                let input = automation::NewWorkflowInput {
                    name: name.clone(),
                    description: description.clone(),
                    icon: icon.clone(),
                    integration_id: integration_id.clone(),
                    action_type: action_type.clone(),
                    config: workflow_config(config.as_deref(), sets, || Ok(Default::default()))?
                        .unwrap_or_default(),
                };
                print_json(&automation::create_workflow(db, &input)?, pretty);
            }
            WorkflowsAction::Update {
                id,
                name,
                integration_id,
                action_type,
                config,
                sets,
                description,
                icon,
            } => {
                let patch = automation::WorkflowPatch {
                    name: name.clone(),
                    description: description.clone(),
                    icon: icon.clone(),
                    integration_id: integration_id.clone(),
                    action_type: action_type.clone(),
                    config: workflow_config(config.as_deref(), sets, || {
                        Ok(serde_json::from_str(&db.get_workflow(id)?.config_json)?)
                    })?,
                    enabled: None,
                };
                print_json(&automation::update_workflow(db, id, &patch)?, pretty);
            }
            WorkflowsAction::Enable { id } | WorkflowsAction::Disable { id } => {
                let patch = automation::WorkflowPatch {
                    enabled: Some(matches!(action, WorkflowsAction::Enable { .. })),
                    ..Default::default()
                };
                print_json(&automation::update_workflow(db, id, &patch)?, pretty);
            }
            WorkflowsAction::Delete { id } => {
                db.delete_workflow(id)?;
                print_deleted(id, pretty);
            }
            WorkflowsAction::Run {
                id,
                meeting,
                provider,
                model,
            } => {
                let llm = match provider {
                    Some(_) => LlmRegistry::detect(db),
                    None => LlmRegistry::new(),
                };
                let run = block_on(nootle_app_lib::workflows::run_workflow_for_meeting(
                    db,
                    &llm,
                    meeting,
                    id,
                    provider.as_deref(),
                    model.as_deref(),
                ))?;
                print_json(&run, pretty);
                if run.status == "failed" {
                    process::exit(1);
                }
            }
            WorkflowsAction::Runs { meeting } => {
                print_json(&db.list_workflow_runs_for_meeting(meeting)?, pretty)
            }
        },
        Commands::InsightTypes { action } => match action {
            InsightTypesAction::List => print_json(&db.list_insight_types()?, pretty),
            InsightTypesAction::Create {
                name,
                slug,
                description,
                prompt,
                icon,
                action_fields,
            } => {
                let input = automation::NewInsightTypeInput {
                    name: name.clone(),
                    slug: slug.clone(),
                    description: description.clone(),
                    extraction_prompt: prompt.clone(),
                    icon: icon.clone(),
                    has_action_fields: *action_fields,
                };
                print_json(&automation::create_insight_type(db, &input)?, pretty);
            }
            InsightTypesAction::Update {
                id,
                name,
                description,
                prompt,
                icon,
                action_fields,
            } => {
                let patch = automation::InsightTypePatch {
                    name: name.clone(),
                    description: description.clone(),
                    extraction_prompt: prompt.clone(),
                    icon: icon.clone(),
                    has_action_fields: *action_fields,
                };
                print_json(&automation::update_insight_type(db, id, &patch)?, pretty);
            }
            InsightTypesAction::Delete { id } => {
                db.delete_insight_type(id)?;
                print_deleted(id, pretty);
            }
        },
        Commands::Analytics { action } => match action {
            AnalyticsAction::Get { meeting_id } => {
                print_json(&ops::meeting_analytics(db, meeting_id)?, pretty)
            }
            AnalyticsAction::Compute { meeting_id } => {
                db.get_meeting(meeting_id)?;
                ops::refresh_analytics(db, meeting_id)?;
                print_json(
                    &serde_json::json!({
                        "speakers": db.get_speaker_analytics(meeting_id)?,
                        "engagement": db.get_engagement(meeting_id)?,
                    }),
                    pretty,
                );
            }
            AnalyticsAction::Sentiment {
                meeting_id,
                llm: llm_args,
            } => {
                db.get_meeting(meeting_id)?;
                let (llm, provider, model) = llm(db, llm_args)?;
                let segments = block_on(ops::analyze_sentiment(
                    db, &llm, meeting_id, &provider, &model,
                ))?;
                print_json(&segments, pretty);
            }
        },
        Commands::Embeddings { action } => match action {
            EmbeddingsAction::Status => {
                let (embedded, total) = db.get_embedding_status()?;
                print_json(
                    &serde_json::json!({
                        "embedded_meetings": embedded,
                        "total_meetings": total,
                        "model_available": EmbeddingEngine::is_available(),
                    }),
                    pretty,
                );
            }
            EmbeddingsAction::Embed { meeting_id, .. } => {
                let ids = match meeting_id {
                    Some(id) => vec![db.get_meeting(id)?.id],
                    None => ops::meetings_to_index(db)?,
                };
                let mut engine = ops::load_embedding_engine()?;
                let report = ops::embed_meetings(&ids, |id| {
                    nootle_app_lib::chunking::embed_meeting(db, &mut engine, id)
                });
                print_json(&report, pretty);
                if meeting_id.is_some() && !report.failed.is_empty() {
                    process::exit(1);
                }
            }
        },
        Commands::Llm { action } => match action {
            LlmAction::Models => print_json(&LlmRegistry::detect(db).all_models(), pretty),
        },
        Commands::Mcp => unreachable!("served from main"),
        Commands::Chat { action } => match action {
            ChatAction::Conversations => {
                let convos = db.list_chat_conversations()?;
                print_json(&convos, pretty);
            }
            ChatAction::Messages { conversation_id } => {
                let messages = db.list_chat_messages(conversation_id)?;
                print_json(&messages, pretty);
            }
            ChatAction::Create => print_json(&db.create_chat_conversation()?, pretty),
            ChatAction::Rename { id, title } => {
                print_json(&ops::rename_conversation(db, id, title)?, pretty)
            }
            ChatAction::Delete { id } => {
                db.delete_chat_conversation(id)?;
                print_deleted(id, pretty);
            }
            ChatAction::Send {
                conversation_id,
                message,
                filters,
                llm: llm_args,
            } => {
                // Fail fast, before loading the search model.
                db.get_chat_conversation(conversation_id)?;
                let answer = ask(db, message, Some(conversation_id), false, filters, llm_args)?;
                print_json(&answer, pretty);
            }
        },
        Commands::Settings { action } => match action {
            SettingsAction::List => print_json(&ops::settings_map(db)?, pretty),
            SettingsAction::Get { key } => print_json(
                &serde_json::json!({ key: ops::get_setting(db, key)? }),
                pretty,
            ),
            SettingsAction::Set { key, value } => {
                let value = ops::set_setting(db, key, value)?;
                print_json(&serde_json::json!({ key: value }), pretty);
            }
        },
        Commands::Linear { action } => match action {
            LinearAction::Tickets { meeting_id } => {
                print_json(&db.get_linear_tickets(meeting_id)?, pretty)
            }
        },
        Commands::ApiKeys { action } => run_api_keys(db, action, pretty)?,
        Commands::Record { action } => {
            let (path, title) = match action {
                RecordAction::Start { title } => ("start", title),
                RecordAction::Stop => ("stop", &None),
                RecordAction::Toggle { title } => ("toggle", title),
            };
            let mut url = url::Url::parse(&format!("nootle://record/{path}"))?;
            if let Some(title) = title {
                url.query_pairs_mut().append_pair("title", title);
            }
            let status = process::Command::new("open")
                .arg(url.as_str())
                .status()
                .map_err(|e| {
                    format!("Couldn't run `open` (recording control is macOS-only): {e}")
                })?;
            if !status.success() {
                return Err(format!("`open {url}` failed; is Nootle installed?").into());
            }
            let enabled = db
                .get_setting(nootle_app_lib::remote::ENABLED_SETTING)?
                .as_deref()
                == Some("true");
            let mut note = "Sent to Nootle, which must be running with Settings → Recording → \
                            Allow URL control on. It reports the result as a notification."
                .to_string();
            if !enabled {
                note.push_str(
                    " URL control is off: turn it on in Nootle, or run \
                     `nootle-cli settings set remote_control_enabled true`.",
                );
            }
            print_json(
                &serde_json::json!({ "sent": url.as_str(), "note": note }),
                pretty,
            );
        }
        Commands::Calendar { hours } => {
            let hours = (*hours).clamp(1, 24 * 7);
            print_json(&nootle_app_lib::calendar::upcoming(hours), pretty);
        }
    }
    Ok(())
}

fn run_meetings(db: &Database, action: &MeetingsAction, pretty: bool) -> CliResult {
    match action {
        MeetingsAction::List {
            search,
            archived,
            label,
        } => {
            let label_id = match label {
                Some(label) => Some(ops::find_label(&db.list_labels()?, label)?.id.clone()),
                None => None,
            };
            let meetings = db.list_meetings(search.as_deref(), *archived, label_id.as_deref())?;
            print_json(&meetings, pretty);
        }
        MeetingsAction::Get { id, full } => {
            let meeting = db.get_meeting(id)?;
            if *full {
                let mut value = serde_json::to_value(&meeting)?;
                value["labels"] = serde_json::to_value(db.get_meeting_labels(id)?)?;
                value["summaries"] = serde_json::to_value(db.get_summaries_for_meeting(id)?)?;
                value["scratch_notes"] = serde_json::to_value(db.get_scratch_notes(id)?)?;
                print_json(&value, pretty);
            } else {
                print_json(&meeting, pretty);
            }
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
        MeetingsAction::Export { id, format, output } => {
            use nootle_app_lib::export::{export_meeting, ExportFormat};
            let content = export_meeting(db, id, ExportFormat::parse(format)?)?;
            match output {
                Some(path) => std::fs::write(path, content)?,
                None => print!("{content}"),
            }
        }
        MeetingsAction::RenameSpeaker { id, from, to } => {
            // Rebuild the search index too, if there is one and the model is
            // there to do it.
            let mut engine = match db.has_meeting_chunks(id)? {
                true => ops::try_load_embedding_engine(),
                false => None,
            };
            let changed = ops::rename_speaker(db, engine.as_mut(), id, from, to)?;
            print_json(&serde_json::json!({ "renamed_segments": changed }), pretty);
        }
        MeetingsAction::Update {
            id,
            title,
            status,
            template,
            notes,
        } => {
            if title.is_none() && status.is_none() && template.is_none() && notes.is_none() {
                return Err("Pass --title, --status, --template, or --notes".into());
            }
            let patch = ops::MeetingPatch {
                title: title.clone(),
                status: status.clone(),
                template_id: template.clone(),
                notes: notes.as_deref().map(read_text_arg).transpose()?,
            };
            print_json(&ops::update_meeting(db, id, patch)?, pretty);
        }
        MeetingsAction::Delete { id } => {
            db.get_meeting(id)?;
            ops::delete_meeting(db, id)?;
            print_deleted(id, pretty);
        }
        MeetingsAction::Labels { id } => print_json(&db.get_meeting_labels(id)?, pretty),
        MeetingsAction::Label { id, add, remove } => {
            if add.is_empty() && remove.is_empty() {
                return Err("Pass --add or --remove".into());
            }
            db.get_meeting(id)?;
            let labels = db.list_labels()?;
            let ids = |keys: &[String]| -> CliResult<Vec<String>> {
                keys.iter()
                    .map(|key| Ok(ops::find_label(&labels, key)?.id.clone()))
                    .collect()
            };
            let (add, remove) = (ids(add)?, ids(remove)?);
            for label_id in add {
                db.add_meeting_label(id, &label_id)?;
            }
            for label_id in remove {
                db.remove_meeting_label(id, &label_id)?;
            }
            print_json(&db.get_meeting_labels(id)?, pretty);
        }
        MeetingsAction::EditSegment { segment_id, text } => {
            let result = nootle_app_lib::dictionary::record_edit(db, segment_id, text)?;
            print_json(&result, pretty);
        }
        MeetingsAction::Summarize {
            id,
            template,
            llm: llm_args,
        } => {
            let template = match template {
                Some(t) => t.clone(),
                None => db.get_meeting(id)?.template_id.ok_or(
                    "The meeting has no template; pass --template (see `nootle-cli templates list`)",
                )?,
            };
            let (llm, provider, model) = llm(db, llm_args)?;
            let summary = block_on(nootle_app_lib::summarization::summarize_meeting(
                db, &llm, id, &template, &provider, &model,
            ))?;
            print_json(&summary, pretty);
        }
        MeetingsAction::Ask {
            id,
            question,
            llm: llm_args,
        } => {
            db.get_meeting(id)?;
            let (llm, provider, model) = llm(db, llm_args)?;
            let answer = block_on(nootle_app_lib::summarization::chat_with_transcript(
                db,
                &llm,
                id,
                question,
                Vec::new(),
                &provider,
                &model,
            ))?;
            print_text("response", &answer, pretty);
        }
        MeetingsAction::EnrichNotes { id, llm: llm_args } => {
            let (llm, provider, model) = llm(db, llm_args)?;
            let enriched = block_on(ops::enrich_notes(db, &llm, id, &provider, &model))?;
            print_text("enriched_notes", &enriched, pretty);
        }
    }
    Ok(())
}

fn run_dictionary(db: &Database, action: &DictionaryAction, pretty: bool) -> CliResult {
    match action {
        DictionaryAction::List => print_json(&db.list_dictionary_entries()?, pretty),
        DictionaryAction::Add { term, misheard } => {
            print_json(
                &db.upsert_dictionary_entry(term, misheard, "manual")?,
                pretty,
            );
        }
        DictionaryAction::Update { id, term, misheard } => {
            let entry = ops::update_dictionary_entry(db, id, term.as_deref(), misheard.as_deref())?;
            print_json(&entry, pretty);
        }
        DictionaryAction::Delete { id } => {
            db.delete_dictionary_entry(id)?;
            print_deleted(id, pretty);
        }
        DictionaryAction::Apply { meeting_id } => {
            let changed = ops::apply_dictionary(db, meeting_id)?;
            print_json(
                &serde_json::json!({ "corrected_segments": changed }),
                pretty,
            );
        }
    }
    Ok(())
}

fn run_recipes(db: &Database, action: &RecipesAction, pretty: bool) -> CliResult {
    match action {
        RecipesAction::List => print_json(&db.list_recipes()?, pretty),
        RecipesAction::Get { id } => print_json(&db.get_recipe(id)?, pretty),
        RecipesAction::Create {
            name,
            command,
            prompt,
            description,
            format,
        } => {
            let recipe = NewRecipe {
                name: name.clone(),
                description: description.clone(),
                slash_command: command.clone(),
                prompt_template: read_text_arg(prompt)?,
                output_format: format.clone(),
            };
            print_json(&ops::create_recipe(db, recipe)?, pretty);
        }
        RecipesAction::Update {
            id,
            name,
            command,
            prompt,
            description,
            format,
        } => {
            let patch = ops::RecipePatch {
                name: name.clone(),
                description: description.clone(),
                slash_command: command.clone(),
                prompt_template: prompt.as_deref().map(read_text_arg).transpose()?,
                output_format: format.clone(),
            };
            print_json(&ops::update_recipe(db, id, patch)?, pretty);
        }
        RecipesAction::Delete { id } => {
            db.delete_recipe(id)?;
            print_deleted(id, pretty);
        }
        RecipesAction::Run {
            id,
            meeting,
            llm: llm_args,
        } => {
            db.get_recipe(id)?;
            let (llm, provider, model) = llm(db, llm_args)?;
            let output = block_on(nootle_app_lib::summarization::run_recipe(
                db, &llm, meeting, id, &provider, &model,
            ))?;
            print_text("output", &output, pretty);
        }
    }
    Ok(())
}

fn run_api_keys(db: &Database, action: &ApiKeysAction, pretty: bool) -> CliResult {
    match action {
        ApiKeysAction::List => print_json(&ops::list_api_key_providers(db)?, pretty),
        ApiKeysAction::Set { provider, key } => {
            // Check before waiting on stdin for the key.
            ops::validate_one_of("provider", provider, ops::API_KEY_PROVIDERS)?;
            ops::store_api_key(db, provider, &read_secret_arg(key)?)?;
            print_json(
                &serde_json::json!({
                    "stored": provider,
                    "note": "If Nootle is open, restart it to use the new key.",
                }),
                pretty,
            );
        }
        ApiKeysAction::Delete { provider } => {
            ops::delete_api_key(db, provider)?;
            print_deleted(provider, pretty);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_inline_secrets() {
        let err = read_secret_arg("sk-123").unwrap_err();
        assert!(err.to_string().contains("stdin"));
    }
}
