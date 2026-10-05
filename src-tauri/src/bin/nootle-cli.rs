use clap::{Parser, Subcommand};
use nootle_app_lib::automation;
use std::process;

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
    /// Show embedding status
    Embeddings {
        #[command(subcommand)]
        action: EmbeddingsAction,
    },
    /// Serve Nootle's MCP server over stdio, for Claude Code and other MCP clients
    Mcp,
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

/// Reads a JSON argument given inline, as `@path`, or as `-` for stdin, so
/// secrets needn't appear in shell history.
fn read_json_arg(arg: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let text = match arg {
        "-" => std::io::read_to_string(std::io::stdin())?,
        _ => match arg.strip_prefix('@') {
            Some(path) => std::fs::read_to_string(path)?,
            None => arg.to_string(),
        },
    };
    Ok(serde_json::from_str(&text)?)
}

/// Builds a workflow config from `--config` and `--set` options, starting
/// from `current` when only `--set` is given. `None` when neither is given.
fn workflow_config(
    config: Option<&str>,
    sets: &[String],
    current: impl FnOnce() -> Result<serde_json::Value, Box<dyn std::error::Error>>,
) -> Result<Option<serde_json::Value>, Box<dyn std::error::Error>> {
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

fn main() {
    let cli = Cli::parse();
    let db_path = cli.db.unwrap_or_else(default_db_path);

    let db = match nootle_app_lib::db::Database::new(&db_path) {
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

fn run_command(
    db: &nootle_app_lib::db::Database,
    command: &Commands,
    pretty: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    match command {
        Commands::Meetings { action } => match action {
            MeetingsAction::List { search, archived } => {
                let meetings = db.list_meetings(search.as_deref(), *archived)?;
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
            MeetingsAction::Export { id, format, output } => {
                use nootle_app_lib::export::{export_meeting, ExportFormat};
                let content = export_meeting(db, id, ExportFormat::parse(format)?)?;
                match output {
                    Some(path) => std::fs::write(path, content)?,
                    None => print!("{content}"),
                }
            }
            MeetingsAction::RenameSpeaker { id, from, to } => {
                let to = to.trim();
                if to.is_empty() {
                    print_error("Speaker name can't be empty");
                }
                let changed = db.rename_speaker(id, from, to)?;
                print_json(&serde_json::json!({ "renamed_segments": changed }), pretty);
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
                print_json(&serde_json::json!({ "deleted": id }), pretty);
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
                print_json(&serde_json::json!({ "deleted": id }), pretty);
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
                print_json(&serde_json::json!({ "deleted": id }), pretty);
            }
            WorkflowsAction::Run {
                id,
                meeting,
                provider,
                model,
            } => {
                let llm = match provider {
                    Some(_) => nootle_app_lib::llm::LlmRegistry::detect(db),
                    None => nootle_app_lib::llm::LlmRegistry::new(),
                };
                let run = tokio::runtime::Runtime::new()?.block_on(
                    nootle_app_lib::workflows::run_workflow_for_meeting(
                        db,
                        &llm,
                        meeting,
                        id,
                        provider.as_deref(),
                        model.as_deref(),
                    ),
                )?;
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
                print_json(&serde_json::json!({ "deleted": id }), pretty);
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
        },
    }
    Ok(())
}
