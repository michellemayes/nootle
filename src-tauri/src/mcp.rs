use std::sync::Arc;

use rmcp::{
    handler::server::wrapper::Parameters, model::*, schemars, tool, tool_handler, tool_router,
    ErrorData as McpError, RoleServer, ServerHandler,
};
use serde_json::json;

use crate::automation::{
    self, InsightTypePatch, NewInsightTypeInput, NewTemplateInput, NewWorkflowInput, TemplatePatch,
    WorkflowPatch,
};
use crate::db::Database;
use crate::embedding::EmbeddingEngine;
use crate::error::NootleError;
use crate::llm::LlmRegistry;
use crate::ops;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListMeetingsParams {
    /// Optional search query to filter meetings by title or transcript text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    /// Only meetings with this label ID (see list_labels)
    #[serde(default)]
    pub label_id: Option<String>,
    /// Include archived meetings
    #[serde(default)]
    pub include_archived: bool,
    /// From next_offset
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetMeetingParams {
    /// The meeting ID to retrieve
    pub id: String,
    /// From transcript.next_offset
    #[serde(default)]
    pub transcript_offset: usize,
    /// Prefix each transcript line with its segment ID, for edit_transcript_segment
    #[serde(default)]
    pub include_segment_ids: bool,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SearchTranscriptsParams {
    /// Full-text search query to match against transcript segments
    pub query: String,
    /// From next_offset
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct CreateIntegrationParams {
    /// Integration type from the automation catalog, e.g. "slack"
    pub integration_type: String,
    /// Display name; defaults to the integration's name, e.g. "Slack"
    #[serde(default)]
    pub name: Option<String>,
    /// Credential fields from the catalog, as an object of strings
    #[serde(default)]
    pub credentials: serde_json::Value,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateIntegrationParams {
    /// Integration ID
    pub id: String,
    /// New display name
    #[serde(default)]
    pub name: Option<String>,
    /// Replacement credentials (every field, not just the changed ones)
    #[serde(default)]
    pub credentials: Option<serde_json::Value>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateParams<P> {
    /// ID of the item to update
    pub id: String,
    /// Fields to change; omitted fields keep their current value
    #[serde(flatten)]
    pub patch: P,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct RunWorkflowParams {
    /// Workflow ID
    pub workflow_id: String,
    /// Meeting to run it against
    pub meeting_id: String,
    /// LLM provider for LLM-backed steps (source-template summaries, issue
    /// description prompts), e.g. "anthropic" or "ollama"
    #[serde(default)]
    pub llm_provider: Option<String>,
    /// Model ID for `llm_provider`
    #[serde(default)]
    pub llm_model: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListWorkflowRunsParams {
    /// Meeting ID
    pub meeting_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DeleteKind {
    Integration,
    Workflow,
    Template,
    InsightType,
    Recipe,
    Label,
    DictionaryEntry,
    ScratchNote,
    Snapshot,
    Conversation,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct DeleteParams {
    /// What to delete
    pub kind: DeleteKind,
    /// ID of the item
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct IdParams {
    /// ID of the item
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct MeetingIdParams {
    /// Meeting ID
    pub meeting_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct MeetingPageParams {
    /// Meeting ID
    pub meeting_id: String,
    /// From next_offset
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateMeetingParams {
    /// Meeting ID
    pub id: String,
    /// New title
    #[serde(default)]
    pub title: Option<String>,
    /// New status: recording, transcribing, summarized, or archived
    #[serde(default)]
    pub status: Option<String>,
    /// Summary template to summarize this meeting with; "" clears it so the
    /// auto-run templates apply
    #[serde(default)]
    pub template_id: Option<String>,
    /// Replacement for the user's notes (markdown)
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ExportMeetingParams {
    /// Meeting ID
    pub meeting_id: String,
    /// md (summary, notes, and transcript), txt (transcript), srt, or vtt
    pub format: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct RenameSpeakerParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Current speaker label, e.g. "Speaker 2"
    pub from: String,
    /// New name. If another speaker already has it, the two are merged.
    pub to: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct EditSegmentParams {
    /// Transcript segment ID (get_meeting with include_segment_ids shows them)
    pub segment_id: String,
    /// Corrected text for the segment
    pub text: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SaveLabelParams {
    /// Label to update. Omit to create one.
    #[serde(default)]
    pub id: Option<String>,
    /// Unique name; required to create
    #[serde(default)]
    pub name: Option<String>,
    /// Hex color, e.g. "#4f46e5"; required to create
    #[serde(default)]
    pub color: Option<String>,
    /// Icon name; "" removes it
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateMeetingLabelsParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Label IDs to add
    #[serde(default)]
    pub add: Vec<String>,
    /// Label IDs to remove
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct AddScratchNoteParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Note text
    pub content: String,
    /// Time into the meeting the note refers to, in milliseconds
    #[serde(default)]
    pub timestamp_ms: i64,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SaveDictionaryEntryParams {
    /// Entry to update. Omit to add the term, or merge the variants into the
    /// term's existing entry.
    #[serde(default)]
    pub id: Option<String>,
    /// Correct spelling, e.g. "Kubernetes"
    pub term: String,
    /// Ways transcription gets it wrong, e.g. ["cooper netties"]. With id,
    /// replaces the entry's variants; omit to keep them.
    #[serde(default)]
    pub misheard: Option<Vec<String>>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListInsightsParams {
    /// Only this meeting's insights
    #[serde(default)]
    pub meeting_id: Option<String>,
    /// Only this insight type slug, e.g. "action_item" or "decision"
    #[serde(default)]
    pub insight_type: Option<String>,
    /// Only action items with this status: open, done, or cancelled
    #[serde(default)]
    pub status: Option<String>,
    /// Only insights whose text contains this
    #[serde(default)]
    pub search: Option<String>,
    /// From next_offset
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateActionItemParams {
    /// Action item ID (`action_item_id` in list_insights)
    pub id: String,
    /// open, done, or cancelled
    #[serde(default)]
    pub status: Option<String>,
    /// Who owns it; "" clears it
    #[serde(default)]
    pub assignee: Option<String>,
    /// Due date, e.g. "2026-03-31"; "" clears it
    #[serde(default)]
    pub due_date: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct CreateRecipeParams {
    /// Display name
    pub name: String,
    /// What the recipe produces
    #[serde(default)]
    pub description: String,
    /// Command that runs it in the app, e.g. "/email"
    pub slash_command: String,
    /// Instructions for the LLM, which also gets the meeting's transcript
    pub prompt_template: String,
    /// Output format, e.g. "markdown"
    #[serde(default = "default_output_format")]
    pub output_format: String,
}

fn default_output_format() -> String {
    "markdown".into()
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateRecipeParams {
    /// Recipe ID
    pub id: String,
    /// New display name
    #[serde(default)]
    pub name: Option<String>,
    /// New description
    #[serde(default)]
    pub description: Option<String>,
    /// New slash command
    #[serde(default)]
    pub slash_command: Option<String>,
    /// New instructions for the LLM
    #[serde(default)]
    pub prompt_template: Option<String>,
    /// New output format
    #[serde(default)]
    pub output_format: Option<String>,
}

/// Which LLM to use. Both optional: a provider alone uses its first model,
/// and neither uses the model Nootle's automatic summaries use.
#[derive(Debug, Default, serde::Deserialize, schemars::JsonSchema)]
pub struct LlmChoice {
    /// LLM provider from list_llm_models, e.g. "anthropic" or "ollama"
    #[serde(default)]
    pub provider: Option<String>,
    /// Model ID for the provider
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct MeetingLlmParams {
    /// Meeting ID
    pub meeting_id: String,
    #[serde(flatten)]
    pub llm: LlmChoice,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct RunRecipeParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Recipe ID or slash command, e.g. "/email"
    pub recipe: String,
    #[serde(flatten)]
    pub llm: LlmChoice,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SummarizeMeetingParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Summary template ID. Omit to do what Nootle does after a recording:
    /// the meeting's chosen template, else every auto-run template, else General.
    #[serde(default)]
    pub template_id: Option<String>,
    #[serde(flatten)]
    pub llm: LlmChoice,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ExtractInsightsParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Delete the meeting's existing insights and action items first
    #[serde(default)]
    pub replace: bool,
    #[serde(flatten)]
    pub llm: LlmChoice,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct HistoryMessage {
    /// "user" or "assistant"
    pub role: String,
    /// Message text
    pub content: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct AskMeetingParams {
    /// Meeting ID
    pub meeting_id: String,
    /// Question about the meeting
    pub question: String,
    /// Earlier turns of this conversation, oldest first
    #[serde(default)]
    pub history: Vec<HistoryMessage>,
    #[serde(flatten)]
    pub llm: LlmChoice,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct AskMeetingsParams {
    /// Question to answer from all meetings
    pub question: String,
    /// Continue this saved conversation (from list_conversations)
    #[serde(default)]
    pub conversation_id: Option<String>,
    /// Save the question and answer as a new conversation in Nootle's Ask view
    #[serde(default)]
    pub save: bool,
    /// Only search meetings with any of these label IDs
    #[serde(default)]
    pub label_ids: Vec<String>,
    /// Only meetings starting on or after this date, e.g. "2026-01-01"
    #[serde(default)]
    pub date_from: Option<String>,
    /// Only meetings starting on or before this date
    #[serde(default)]
    pub date_to: Option<String>,
    #[serde(flatten)]
    pub llm: LlmChoice,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct EmbedMeetingsParams {
    /// Meeting to index. Omit to index every meeting not yet indexed.
    #[serde(default)]
    pub meeting_id: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct PageParams {
    /// From next_offset
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetConversationParams {
    /// Conversation ID
    pub id: String,
    /// From messages.next_offset
    #[serde(default)]
    pub offset: usize,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct RenameConversationParams {
    /// Conversation ID
    pub id: String,
    /// New title
    pub title: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SetSettingParams {
    /// Setting key, from get_settings
    pub key: String,
    /// New value: "true"/"false" for switches, a provider name (or "" for
    /// automatic) for summarization_provider
    pub value: String,
}

fn invalid(msg: impl Into<String>) -> NootleError {
    NootleError::Other(msg.into())
}

fn deleted(id: &str) -> serde_json::Value {
    json!({ "deleted": id })
}

/// Runs blocking work (database scans, model inference, process probes) off
/// the async workers.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> crate::error::Result<T> + Send + 'static,
) -> crate::error::Result<T> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| invalid(e.to_string()))?
}

/// The cached embedding engine, loaded on first use.
fn loaded_engine(slot: &mut Option<EmbeddingEngine>) -> crate::error::Result<&mut EmbeddingEngine> {
    if slot.is_none() {
        *slot = Some(ops::load_embedding_engine()?);
    }
    Ok(slot.as_mut().expect("just loaded"))
}

/// Serializes `result` as the tool's output. Errors go back to the model as a
/// tool error rather than a protocol error, so it can read them and retry.
fn respond<T: serde::Serialize>(
    result: crate::error::Result<T>,
) -> Result<CallToolResult, McpError> {
    Ok(match result {
        Ok(value) => {
            // Compact, since every byte counts against the client's output limit.
            let json = serde_json::to_string(&value)
                .map_err(|e| McpError::internal_error(format!("Serialization error: {e}"), None))?;
            CallToolResult::success(vec![ContentBlock::text(json)])
        }
        Err(e) => CallToolResult::error(vec![ContentBlock::text(e.to_string())]),
    })
}

/// Items per page for list and search tools, which keeps a long meeting history
/// under Claude Code's MCP output limit (25k tokens by default).
const PAGE_SIZE: usize = 50;
/// Transcript lines per `get_meeting` call, roughly 10k tokens.
const TRANSCRIPT_PAGE_SIZE: usize = 300;

/// The page of `items` starting at `offset`, with the total and, when more
/// remain, the offset of the next page.
fn page<T: serde::Serialize>(items: Vec<T>, offset: usize, size: usize) -> serde_json::Value {
    let total = items.len();
    let items: Vec<T> = items.into_iter().skip(offset).take(size).collect();
    paged(items, total, offset, size)
}

/// A page already cut from `total` items at `offset`.
fn paged<T: serde::Serialize>(
    items: Vec<T>,
    total: usize,
    offset: usize,
    size: usize,
) -> serde_json::Value {
    let next = offset.saturating_add(size);
    json!({
        "items": items,
        "total": total,
        "next_offset": (next < total).then_some(next),
    })
}

fn transcript_line(s: &crate::db::TranscriptSegment) -> String {
    format!(
        "[{}] {}: {}",
        format_ms(s.start_ms),
        s.speaker_label,
        s.text
    )
}

type EngineSlot = Arc<tokio::sync::Mutex<Option<EmbeddingEngine>>>;

#[derive(Clone)]
pub struct NootleMcpServer {
    db: Arc<Database>,
    /// Loaded on first use and kept, since loading takes a while. Lock it
    /// from blocking work only, and release it before calling an LLM.
    engine: EngineSlot,
    /// The LLMs on this machine, detected on first use and again when a
    /// caller asks for one that wasn't there.
    llm: Arc<tokio::sync::RwLock<Option<Arc<LlmRegistry>>>>,
}

impl NootleMcpServer {
    /// Detects the LLMs on this machine and caches them.
    async fn detect_llms(&self) -> crate::error::Result<Arc<LlmRegistry>> {
        let db = self.db.clone();
        // Detection probes Ollama and spawns processes.
        let llm = Arc::new(blocking(move || Ok(LlmRegistry::detect(&db))).await?);
        *self.llm.write().await = Some(llm.clone());
        Ok(llm)
    }

    /// The cached LLMs, detected again if `provider` (or, without one, any
    /// provider) is missing, since it may have been set up since.
    async fn registry(&self, provider: Option<&str>) -> crate::error::Result<Arc<LlmRegistry>> {
        if let Some(llm) = self.llm.read().await.as_ref() {
            let found = match provider {
                Some(p) => llm.get_provider(p).is_some(),
                None => !llm.provider_names().is_empty(),
            };
            if found {
                return Ok(llm.clone());
            }
        }
        self.detect_llms().await
    }

    /// The LLMs on this machine, with the provider and model `choice` resolves to.
    async fn llm(
        &self,
        choice: &LlmChoice,
    ) -> crate::error::Result<(Arc<LlmRegistry>, String, String)> {
        let llm = self.registry(choice.provider.as_deref()).await?;
        let (provider, model) = ops::resolve_model(
            &self.db,
            &llm,
            choice.provider.as_deref(),
            choice.model.as_deref(),
        )?;
        Ok((llm, provider, model))
    }
}

#[tool_router]
impl NootleMcpServer {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            engine: Arc::default(),
            llm: Arc::default(),
        }
    }

    #[tool(
        title = "List meetings",
        description = "List meetings, newest first, with their label names, optionally filtered by title or transcript text, or by label. Archived meetings are left out unless include_archived.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_meetings(
        &self,
        Parameters(params): Parameters<ListMeetingsParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = self.db.clone();
        respond(
            blocking(move || {
                let meetings = db.list_meetings(
                    params.search.as_deref(),
                    params.include_archived,
                    params.label_id.as_deref(),
                )?;
                let total = meetings.len();
                let meetings: Vec<_> = meetings
                    .into_iter()
                    .skip(params.offset)
                    .take(PAGE_SIZE)
                    .collect();
                let ids: Vec<&str> = meetings.iter().map(|m| m.id.as_str()).collect();
                let mut labels: std::collections::HashMap<String, Vec<String>> =
                    std::collections::HashMap::new();
                for (meeting_id, label) in db.get_labels_for_meetings(&ids)? {
                    labels.entry(meeting_id).or_default().push(label.name);
                }
                let items: Vec<_> = meetings
                    .into_iter()
                    .map(|m| {
                        json!({
                            "id": m.id,
                            "title": m.title,
                            "start_time": m.start_time,
                            "end_time": m.end_time,
                            "status": m.status,
                            "labels": labels.remove(&m.id).unwrap_or_default(),
                        })
                    })
                    .collect();
                Ok(paged(items, total, params.offset, PAGE_SIZE))
            })
            .await,
        )
    }

    #[tool(
        title = "Get meeting",
        description = "Get a meeting's details, notes, summaries, labels, scratch notes, Linear tickets, and transcript as \"[HH:MM:SS.mmm] Speaker: text\" lines, 300 per call.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_meeting(
        &self,
        Parameters(params): Parameters<GetMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = self.db.clone();
        respond(
            blocking(move || {
                let meeting = db.get_meeting(&params.id)?;
                let lines: Vec<String> = db
                    .get_transcript(&params.id)?
                    .iter()
                    .map(|s| match params.include_segment_ids {
                        true => format!("{} {}", s.id, transcript_line(s)),
                        false => transcript_line(s),
                    })
                    .collect();
                Ok(json!({
                    "meeting": meeting,
                    "labels": db.get_meeting_labels(&params.id)?,
                    "summaries": db.get_summaries_for_meeting(&params.id)?,
                    "scratch_notes": db.get_scratch_notes(&params.id)?,
                    "linear_tickets": db.get_linear_tickets(&params.id)?,
                    "transcript": page(lines, params.transcript_offset, TRANSCRIPT_PAGE_SIZE),
                }))
            })
            .await,
        )
    }

    #[tool(
        title = "Search transcripts",
        description = "Full-text phrase search across all meeting transcripts. Returns matching segments with their meeting's id and title, best match first.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn search_transcripts(
        &self,
        Parameters(params): Parameters<SearchTranscriptsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            self.db
                .search_transcripts(&params.query)
                .map(|results| page(results, params.offset, PAGE_SIZE)),
        )
    }

    #[tool(
        title = "Get automation catalog",
        description = "Describe what can be automated: each integration type with its credential fields and actions, each action's config fields, the {{placeholders}} text fields accept, and the icons insight types can use. Read this before creating integrations or workflows.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn get_automation_catalog(&self) -> Result<CallToolResult, McpError> {
        respond(Ok(automation::catalog()))
    }

    #[tool(
        title = "List automations",
        description = "List the user's automations: connected integrations (credentials never included), workflows, summary templates, and insight types.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_automations(&self) -> Result<CallToolResult, McpError> {
        respond((|| {
            Ok(json!({
                "integrations": self.db.list_integrations_safe()?,
                "workflows": self.db.list_workflows()?,
                "templates": self.db.list_templates()?,
                "insight_types": self.db.list_insight_types()?,
            }))
        })())
    }

    #[tool(
        title = "Connect integration",
        description = "Connect an integration (Slack, Notion, GitHub, ...) so workflows can send to it. Credentials are stored locally and never returned.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn create_integration(
        &self,
        Parameters(p): Parameters<CreateIntegrationParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_integration(
            &self.db,
            &p.integration_type,
            p.name.as_deref(),
            &p.credentials,
        ))
    }

    #[tool(
        title = "Update integration",
        description = "Rename an integration or replace its credentials.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_integration(
        &self,
        Parameters(p): Parameters<UpdateIntegrationParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_integration(
            &self.db,
            &p.id,
            p.name.as_deref(),
            p.credentials.as_ref(),
        ))
    }

    #[tool(
        title = "Create workflow",
        description = "Create a workflow that sends a meeting's summary or action items to a connected integration. The user runs it from a meeting's Run menu, or you can run it with run_workflow.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn create_workflow(
        &self,
        Parameters(p): Parameters<NewWorkflowInput>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_workflow(&self.db, &p))
    }

    #[tool(
        title = "Update workflow",
        description = "Update a workflow: rename, change its config or integration, or enable/disable it.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_workflow(
        &self,
        Parameters(p): Parameters<UpdateParams<WorkflowPatch>>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_workflow(&self.db, &p.id, &p.patch))
    }

    #[tool(
        title = "Run workflow",
        description = "Run a workflow against a meeting now. This sends data to the external service (posts to Slack, opens issues, ...). Returns the run with status completed or failed and its output or error.",
        annotations(destructive_hint = false, open_world_hint = true)
    )]
    async fn run_workflow(
        &self,
        Parameters(p): Parameters<RunWorkflowParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                // Steps only need an LLM when one was asked for.
                let llm = match p.llm_provider.as_deref() {
                    Some(provider) => self.registry(Some(provider)).await?,
                    None => Arc::default(),
                };
                crate::workflows::run_workflow_for_meeting(
                    &self.db,
                    &llm,
                    &p.meeting_id,
                    &p.workflow_id,
                    p.llm_provider.as_deref(),
                    p.llm_model.as_deref(),
                )
                .await
            }
            .await,
        )
    }

    #[tool(
        title = "List workflow runs",
        description = "List past workflow runs for a meeting, newest first.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_workflow_runs(
        &self,
        Parameters(p): Parameters<ListWorkflowRunsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(self.db.list_workflow_runs_for_meeting(&p.meeting_id))
    }

    #[tool(
        title = "Create summary template",
        description = "Create a summary template. With auto_run, every new meeting is summarized with it automatically.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn create_template(
        &self,
        Parameters(p): Parameters<NewTemplateInput>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_template(&self.db, &p))
    }

    #[tool(
        title = "Update summary template",
        description = "Update a summary template, including turning auto-run on or off.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_template(
        &self,
        Parameters(p): Parameters<UpdateParams<TemplatePatch>>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_template(&self.db, &p.id, &p.patch))
    }

    #[tool(
        title = "Create insight type",
        description = "Create a custom insight type that Nootle extracts from every transcript alongside decisions and action items.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn create_insight_type(
        &self,
        Parameters(p): Parameters<NewInsightTypeInput>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_insight_type(&self.db, &p))
    }

    #[tool(
        title = "Update insight type",
        description = "Update a custom insight type's name, prompt, icon, or action fields.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_insight_type(
        &self,
        Parameters(p): Parameters<UpdateParams<InsightTypePatch>>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_insight_type(&self.db, &p.id, &p.patch))
    }

    #[tool(
        title = "Delete",
        description = "Permanently delete an item other than a meeting. Deleting an integration deletes its workflows; deleting a label removes it from meetings. Built-in templates and insight types can't be deleted.",
        annotations(
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn delete(&self, Parameters(p): Parameters<DeleteParams>) -> Result<CallToolResult, McpError> {
        respond((|| {
            let db = &self.db;
            match p.kind {
                DeleteKind::Integration => db.delete_integration(&p.id)?,
                DeleteKind::Workflow => db.delete_workflow(&p.id)?,
                DeleteKind::Template => db.delete_template(&p.id)?,
                DeleteKind::InsightType => db.delete_insight_type(&p.id)?,
                DeleteKind::Recipe => db.delete_recipe(&p.id)?,
                DeleteKind::Label => db.delete_label(&p.id)?,
                DeleteKind::DictionaryEntry => db.delete_dictionary_entry(&p.id)?,
                DeleteKind::ScratchNote => db.delete_scratch_note(&p.id)?,
                DeleteKind::Snapshot => ops::delete_snapshot(db, &p.id)?,
                DeleteKind::Conversation => db.delete_chat_conversation(&p.id)?,
            }
            Ok(deleted(&p.id))
        })())
    }

    // --- Meeting edits ---

    #[tool(
        title = "Update meeting",
        description = "Change a meeting's title, status, summary template, or notes. Omitted fields keep their value. Notes replace the user's notes entirely. Returns the updated meeting.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_meeting(
        &self,
        Parameters(p): Parameters<UpdateMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        let patch = ops::MeetingPatch {
            title: p.title,
            status: p.status,
            template_id: p.template_id,
            notes: p.notes,
        };
        respond(ops::update_meeting(&self.db, &p.id, patch).map_err(Into::into))
    }

    #[tool(
        title = "Delete meeting",
        description = "Permanently delete a meeting with its transcript, summaries, insights, audio recording, and snapshots.",
        annotations(
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn delete_meeting(
        &self,
        Parameters(p): Parameters<IdParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            ops::delete_meeting(&self.db, &p.id)
                .map(|()| deleted(&p.id))
                .map_err(Into::into),
        )
    }

    #[tool(
        title = "Export meeting",
        description = "Render a meeting as Markdown (md: summaries, notes, insights, and transcript), a plain transcript (txt), or subtitles (srt, vtt). Returns the text.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn export_meeting(
        &self,
        Parameters(p): Parameters<ExportMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = self.db.clone();
        respond(
            blocking(move || {
                let format = crate::export::ExportFormat::parse(&p.format)?;
                let content = crate::export::export_meeting(&db, &p.meeting_id, format)?;
                Ok(json!({ "content": content }))
            })
            .await,
        )
    }

    #[tool(
        title = "Rename speaker",
        description = "Rename a speaker throughout a meeting's transcript (\"Speaker 2\" to \"Priya\"), or merge two speakers by renaming one to the other's name. Analytics and the search index are rebuilt. Returns how many segments changed.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn rename_speaker(
        &self,
        Parameters(p): Parameters<RenameSpeakerParams>,
    ) -> Result<CallToolResult, McpError> {
        let (db, engine) = (self.db.clone(), self.engine.clone());
        respond(
            blocking(move || {
                let rename =
                    |engine| ops::rename_speaker(&db, engine, &p.meeting_id, &p.from, &p.to);
                // Load the search model only to rebuild an index the meeting
                // already had; without it the next indexing pass rebuilds it.
                let changed = if db.has_meeting_chunks(&p.meeting_id)? {
                    rename(loaded_engine(&mut engine.blocking_lock()).ok())?
                } else {
                    rename(None)?
                };
                Ok(json!({ "changed_segments": changed }))
            })
            .await,
        )
    }

    #[tool(
        title = "Edit transcript segment",
        description = "Correct the text of one transcript segment. With dictionary auto-learn on, word fixes join the dictionary and are applied to the rest of the meeting. Get segment IDs from get_meeting with include_segment_ids.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn edit_transcript_segment(
        &self,
        Parameters(p): Parameters<EditSegmentParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = self.db.clone();
        respond(blocking(move || crate::dictionary::record_edit(&db, &p.segment_id, &p.text)).await)
    }

    // --- Labels ---

    #[tool(
        title = "List labels",
        description = "List the labels meetings can be tagged with.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_labels(&self) -> Result<CallToolResult, McpError> {
        respond(self.db.list_labels())
    }

    #[tool(
        title = "Save label",
        description = "Create a label for tagging meetings, or with id, change a label's name, color, or icon. Omitted fields keep their value.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn save_label(
        &self,
        Parameters(p): Parameters<SaveLabelParams>,
    ) -> Result<CallToolResult, McpError> {
        let (name, color, icon) = (p.name.as_deref(), p.color.as_deref(), p.icon.as_deref());
        respond((|| {
            Ok(match &p.id {
                Some(id) => ops::update_label(&self.db, id, name, color, icon)?,
                None => {
                    let color = color.ok_or_else(|| invalid("A new label needs a color"))?;
                    ops::create_label(&self.db, name.unwrap_or_default(), color, icon)?
                }
            })
        })())
    }

    #[tool(
        title = "Update meeting labels",
        description = "Add labels to and remove labels from a meeting. Returns the meeting's labels.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_meeting_labels(
        &self,
        Parameters(p): Parameters<UpdateMeetingLabelsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond((|| {
            self.db.get_meeting(&p.meeting_id)?;
            let labels = self.db.list_labels()?;
            if let Some(unknown) = p.add.iter().find(|id| !labels.iter().any(|l| &l.id == *id)) {
                return Err(invalid(format!(
                    "Label '{unknown}' not found; list_labels lists them"
                )));
            }
            for id in &p.add {
                self.db.add_meeting_label(&p.meeting_id, id)?;
            }
            for id in &p.remove {
                self.db.remove_meeting_label(&p.meeting_id, id)?;
            }
            self.db.get_meeting_labels(&p.meeting_id)
        })())
    }

    // --- Scratch notes and snapshots ---

    #[tool(
        title = "Add scratch note",
        description = "Add a timestamped scratch note to a meeting. get_meeting lists them.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn add_scratch_note(
        &self,
        Parameters(p): Parameters<AddScratchNoteParams>,
    ) -> Result<CallToolResult, McpError> {
        respond((|| {
            self.db.get_meeting(&p.meeting_id)?;
            self.db
                .add_scratch_note(&p.meeting_id, &p.content, p.timestamp_ms)
        })())
    }

    #[tool(
        title = "List snapshots",
        description = "List the screenshots of shared screens taken during a meeting, with the text read off each, in meeting order.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_snapshots(
        &self,
        Parameters(p): Parameters<MeetingPageParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            self.db
                .get_snapshots(&p.meeting_id)
                .map(|snapshots| page(snapshots, p.offset, PAGE_SIZE)),
        )
    }

    // --- Dictionary ---

    #[tool(
        title = "List dictionary",
        description = "List the custom dictionary: correct spellings of names and jargon, with the ways transcription mishears them.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_dictionary(&self) -> Result<CallToolResult, McpError> {
        respond(self.db.list_dictionary_entries())
    }

    #[tool(
        title = "Save dictionary entry",
        description = "Add a term to the dictionary, or with id, change an entry. New recordings and LLM prompts use it; apply_dictionary fixes existing meetings.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn save_dictionary_entry(
        &self,
        Parameters(p): Parameters<SaveDictionaryEntryParams>,
    ) -> Result<CallToolResult, McpError> {
        respond((|| match &p.id {
            Some(id) => Ok(ops::update_dictionary_entry(
                &self.db,
                id,
                Some(&p.term),
                p.misheard.as_deref(),
            )?),
            None => self.db.upsert_dictionary_entry(
                &p.term,
                p.misheard.as_deref().unwrap_or_default(),
                "manual",
            ),
        })())
    }

    #[tool(
        title = "Apply dictionary",
        description = "Rewrite a recorded meeting's transcript with the dictionary's corrections. Returns how many segments changed.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn apply_dictionary(
        &self,
        Parameters(p): Parameters<MeetingIdParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = self.db.clone();
        respond(
            blocking(move || {
                let changed = ops::apply_dictionary(&db, &p.meeting_id)?;
                Ok(json!({ "changed_segments": changed }))
            })
            .await,
        )
    }

    // --- Insights and action items ---

    #[tool(
        title = "List insights",
        description = "List insights extracted from meetings (decisions, action items, custom types), newest first, filtered by meeting, type, action item status, or text. Action items carry action_item_id, assignee, due_date, and status.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_insights(
        &self,
        Parameters(p): Parameters<ListInsightsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            self.db
                .get_all_insights(
                    p.meeting_id.as_deref(),
                    p.insight_type.as_deref(),
                    p.status.as_deref(),
                    p.search.as_deref(),
                )
                .map(|insights| page(insights, p.offset, PAGE_SIZE)),
        )
    }

    #[tool(
        title = "Update action item",
        description = "Mark an action item open, done, or cancelled, or change its assignee or due date. Omitted fields keep their value. Returns the updated item.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_action_item(
        &self,
        Parameters(p): Parameters<UpdateActionItemParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            ops::update_action_item(
                &self.db,
                &p.id,
                p.status.as_deref(),
                p.assignee.as_deref(),
                p.due_date.as_deref(),
            )
            .map_err(Into::into),
        )
    }

    // --- Recipes ---

    #[tool(
        title = "List recipes",
        description = "List recipes: reusable prompts (like /email or /tldr) that turn a meeting into a specific output. Run one with run_recipe.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_recipes(&self) -> Result<CallToolResult, McpError> {
        respond(self.db.list_recipes())
    }

    #[tool(
        title = "Create recipe",
        description = "Create a recipe: a reusable prompt that turns a meeting's transcript into a specific output.",
        annotations(destructive_hint = false, open_world_hint = false)
    )]
    fn create_recipe(
        &self,
        Parameters(p): Parameters<CreateRecipeParams>,
    ) -> Result<CallToolResult, McpError> {
        let recipe = crate::db::NewRecipe {
            name: p.name,
            description: p.description,
            slash_command: p.slash_command,
            prompt_template: p.prompt_template,
            output_format: p.output_format,
        };
        respond(ops::create_recipe(&self.db, recipe).map_err(Into::into))
    }

    #[tool(
        title = "Update recipe",
        description = "Update a recipe's name, description, slash command, prompt, or output format. Omitted fields keep their value.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn update_recipe(
        &self,
        Parameters(p): Parameters<UpdateRecipeParams>,
    ) -> Result<CallToolResult, McpError> {
        let patch = ops::RecipePatch {
            name: p.name,
            description: p.description,
            slash_command: p.slash_command,
            prompt_template: p.prompt_template,
            output_format: p.output_format,
        };
        respond(ops::update_recipe(&self.db, &p.id, patch).map_err(Into::into))
    }

    // --- LLM features ---

    #[tool(
        title = "List LLM models",
        description = "List the LLM providers and models available on this machine, and which provider automatic summaries use. Pass provider and model to the LLM tools to choose one.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_llm_models(&self) -> Result<CallToolResult, McpError> {
        respond(
            async {
                // Detect afresh, in case providers were set up since.
                let llm = self.detect_llms().await?;
                Ok::<_, NootleError>(json!({
                    "models": llm.all_models(),
                    "default": ops::pick_auto_model(&self.db, &llm),
                }))
            }
            .await,
        )
    }

    #[tool(
        title = "Summarize meeting",
        description = "Summarize a meeting with an LLM using a summary template, and save the summary. Returns the new summaries.",
        annotations(destructive_hint = false, open_world_hint = true)
    )]
    async fn summarize_meeting(
        &self,
        Parameters(p): Parameters<SummarizeMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                let (llm, provider, model) = self.llm(&p.llm).await?;
                Ok::<_, NootleError>(match &p.template_id {
                    Some(template_id) => vec![
                        crate::summarization::summarize_meeting(
                            &self.db,
                            &llm,
                            &p.meeting_id,
                            template_id,
                            &provider,
                            &model,
                        )
                        .await?,
                    ],
                    None => {
                        crate::summarization::run_auto_templates(
                            &self.db,
                            &llm,
                            &p.meeting_id,
                            &provider,
                            &model,
                        )
                        .await?
                    }
                })
            }
            .await,
        )
    }

    #[tool(
        title = "Extract insights",
        description = "Extract decisions, action items, and custom insight types from a meeting with an LLM, and save them. With replace, the meeting's existing insights are deleted first. Returns the meeting's insights.",
        annotations(destructive_hint = true, open_world_hint = true)
    )]
    async fn extract_insights(
        &self,
        Parameters(p): Parameters<ExtractInsightsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                self.db.get_meeting(&p.meeting_id)?;
                let (llm, provider, model) = self.llm(&p.llm).await?;
                Ok::<_, NootleError>(
                    ops::extract_insights(
                        &self.db,
                        &llm,
                        &p.meeting_id,
                        &provider,
                        &model,
                        p.replace,
                    )
                    .await?,
                )
            }
            .await,
        )
    }

    #[tool(
        title = "Ask about a meeting",
        description = "Answer a question about one meeting from its full transcript, using an LLM. Nothing is saved.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn ask_meeting(
        &self,
        Parameters(p): Parameters<AskMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                let history = p
                    .history
                    .into_iter()
                    .map(|m| match m.role.as_str() {
                        "user" | "assistant" => Ok(crate::llm::ChatMessage {
                            role: m.role,
                            content: m.content,
                        }),
                        role => Err(invalid(format!(
                            "Invalid history role '{role}': use user or assistant"
                        ))),
                    })
                    .collect::<crate::error::Result<Vec<_>>>()?;
                self.db.get_meeting(&p.meeting_id)?;
                let (llm, provider, model) = self.llm(&p.llm).await?;
                let answer = crate::summarization::chat_with_transcript(
                    &self.db,
                    &llm,
                    &p.meeting_id,
                    &p.question,
                    history,
                    &provider,
                    &model,
                )
                .await?;
                Ok::<_, NootleError>(json!({ "answer": answer }))
            }
            .await,
        )
    }

    #[tool(
        title = "Ask across meetings",
        description = "Answer a question from the most relevant passages across meetings indexed with embed_meetings, citing them. Can continue or save a conversation in Nootle's Ask view.",
        annotations(destructive_hint = false, open_world_hint = true)
    )]
    async fn ask_meetings(
        &self,
        Parameters(p): Parameters<AskMeetingsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                // Fail fast, before loading the search model.
                if let Some(id) = &p.conversation_id {
                    self.db.get_chat_conversation(id)?;
                }
                let (llm, provider, model) = self.llm(&p.llm).await?;
                let (engine, question) = (self.engine.clone(), p.question.clone());
                let embedding = blocking(move || {
                    let mut slot = engine.blocking_lock();
                    Ok(ops::embed_question(loaded_engine(&mut slot)?, &question)?)
                })
                .await?;
                let filters = ops::AskFilters {
                    label_ids: p.label_ids,
                    date_from: p.date_from,
                    date_to: p.date_to,
                };
                Ok::<_, NootleError>(
                    ops::ask(
                        &self.db,
                        &llm,
                        &embedding,
                        &p.question,
                        p.conversation_id.as_deref(),
                        p.save,
                        &provider,
                        &model,
                        &filters,
                    )
                    .await?,
                )
            }
            .await,
        )
    }

    #[tool(
        title = "Enrich notes",
        description = "Merge a meeting's notes with details from its transcript using an LLM, and save the result as the meeting's enriched notes. The user's notes are kept.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn enrich_notes(
        &self,
        Parameters(p): Parameters<MeetingLlmParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                let (llm, provider, model) = self.llm(&p.llm).await?;
                let notes =
                    ops::enrich_notes(&self.db, &llm, &p.meeting_id, &provider, &model).await?;
                Ok::<_, NootleError>(json!({ "enriched_notes": notes }))
            }
            .await,
        )
    }

    #[tool(
        title = "Analyze sentiment",
        description = "Score the sentiment of a meeting in ~30-second windows with an LLM, and save it for the meeting's analytics. Returns the segments.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn analyze_sentiment(
        &self,
        Parameters(p): Parameters<MeetingLlmParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                self.db.get_meeting(&p.meeting_id)?;
                let (llm, provider, model) = self.llm(&p.llm).await?;
                Ok::<_, NootleError>(
                    ops::analyze_sentiment(&self.db, &llm, &p.meeting_id, &provider, &model)
                        .await?,
                )
            }
            .await,
        )
    }

    #[tool(
        title = "Run recipe",
        description = "Run a recipe (by ID or slash command) on a meeting with an LLM and return its output. Nothing is saved.",
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn run_recipe(
        &self,
        Parameters(p): Parameters<RunRecipeParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            async {
                let recipe = self
                    .db
                    .get_recipe(&p.recipe)
                    .or_else(|_| self.db.get_recipe_by_command(&p.recipe))
                    .map_err(|_| {
                        invalid(format!(
                            "Recipe '{}' not found; list_recipes lists them",
                            p.recipe
                        ))
                    })?;
                let (llm, provider, model) = self.llm(&p.llm).await?;
                let output = crate::summarization::run_recipe(
                    &self.db,
                    &llm,
                    &p.meeting_id,
                    &recipe.id,
                    &provider,
                    &model,
                )
                .await?;
                Ok::<_, NootleError>(json!({ "output": output }))
            }
            .await,
        )
    }

    // --- Analytics and search index ---

    #[tool(
        title = "Get meeting analytics",
        description = "Get a meeting's speaker analytics (talk time, turns, interruptions, monologues), engagement, and the sentiment analyze_sentiment last saved.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_meeting_analytics(
        &self,
        Parameters(p): Parameters<MeetingIdParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = self.db.clone();
        respond(blocking(move || Ok(ops::meeting_analytics(&db, &p.meeting_id)?)).await)
    }

    #[tool(
        title = "Get search index status",
        description = "How many meetings are indexed for ask_meetings, out of how many, and whether the search model is downloaded.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn get_embedding_status(&self) -> Result<CallToolResult, McpError> {
        respond(self.db.get_embedding_status().map(|(embedded, total)| {
            json!({
                "embedded": embedded,
                "total": total,
                "model_available": EmbeddingEngine::is_available(),
            })
        }))
    }

    #[tool(
        title = "Index meetings for search",
        description = "Index one meeting, or every meeting not yet indexed, so ask_meetings can find it. Runs locally with the search model, downloaded in Nootle's settings. Indexing everything can take minutes.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn embed_meetings(
        &self,
        Parameters(p): Parameters<EmbedMeetingsParams>,
    ) -> Result<CallToolResult, McpError> {
        let (db, engine) = (self.db.clone(), self.engine.clone());
        respond(
            blocking(move || {
                let ids = match p.meeting_id {
                    Some(id) => vec![db.get_meeting(&id)?.id],
                    None => ops::meetings_to_index(&db)?,
                };
                // Fail once without the search model rather than per meeting.
                loaded_engine(&mut engine.blocking_lock())?;
                // Lock per meeting so ask_meetings needn't wait for the batch.
                Ok(ops::embed_meetings(&ids, |id| {
                    let mut slot = engine.blocking_lock();
                    crate::chunking::embed_meeting(&db, loaded_engine(&mut slot)?, id)
                }))
            })
            .await,
        )
    }

    // --- Conversations ---

    #[tool(
        title = "List conversations",
        description = "List saved Ask conversations, most recently active first.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn list_conversations(
        &self,
        Parameters(p): Parameters<PageParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(
            self.db
                .list_chat_conversations()
                .map(|c| page(c, p.offset, PAGE_SIZE)),
        )
    }

    #[tool(
        title = "Get conversation",
        description = "Get a saved Ask conversation's messages, oldest first.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn get_conversation(
        &self,
        Parameters(p): Parameters<GetConversationParams>,
    ) -> Result<CallToolResult, McpError> {
        respond((|| {
            let conversation = self.db.get_chat_conversation(&p.id)?;
            let messages = self.db.list_chat_messages(&p.id)?;
            Ok(json!({
                "conversation": conversation,
                "messages": page(messages, p.offset, PAGE_SIZE),
            }))
        })())
    }

    #[tool(
        title = "Rename conversation",
        description = "Rename a saved Ask conversation.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn rename_conversation(
        &self,
        Parameters(p): Parameters<RenameConversationParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(ops::rename_conversation(&self.db, &p.id, &p.title).map_err(Into::into))
    }

    // --- Settings ---

    #[tool(
        title = "Get settings",
        description = "Get Nootle's settings. detection_enabled offers to record when a call starts; summarization_provider is the LLM automatic work uses (unset: the first available).",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn get_settings(&self) -> Result<CallToolResult, McpError> {
        respond(ops::settings_map(&self.db).map_err(Into::into))
    }

    #[tool(
        title = "Set setting",
        description = "Change one of the settings get_settings lists, except remote_control_enabled and snapshots_enabled, which only the user changes. Switches take \"true\" or \"false\"; summarization_provider takes a provider from list_llm_models, or \"\" for automatic.",
        annotations(
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn set_setting(
        &self,
        Parameters(p): Parameters<SetSettingParams>,
    ) -> Result<CallToolResult, McpError> {
        respond((|| {
            if ops::AGENT_LOCKED_SETTINGS.contains(&p.key.as_str()) {
                return Err(invalid(format!(
                    "'{}' can only be changed in Nootle's settings",
                    p.key
                )));
            }
            let value = ops::set_setting(&self.db, &p.key, &p.value)?;
            Ok(json!({ p.key: value }))
        })())
    }
}

#[tool_handler]
impl ServerHandler for NootleMcpServer {
    fn get_info(&self) -> ServerConfig {
        let capabilities = ServerCapabilities::builder()
            .enable_tools()
            .enable_resources()
            .build();
        let server_info = Implementation::new("nootle-mcp", env!("CARGO_PKG_VERSION"))
            .with_title("Nootle MCP Server")
            .with_description("MCP server for Nootle meeting data and automations");
        ServerConfig::new(capabilities)
            .with_server_info(server_info)
            .with_instructions(
                "Nootle MCP server. Read, search, and edit the user's meetings (titles, \
                 notes, labels, transcripts, action items), run LLM features on them \
                 (summaries, insights, questions, recipes, sentiment), and set up \
                 automations: integrations, workflows that send meeting output to them, \
                 summary templates, and custom insight types. Call get_automation_catalog \
                 before creating integrations or workflows. LLM tools take optional \
                 provider and model; list_llm_models shows the options and the default. \
                 Confirm with the user before any destructive tool. Lists, searches, and \
                 transcripts are paged: when a result has a next_offset, pass it back \
                 to get more.",
            )
    }

    async fn list_resources(
        &self,
        request: Option<PaginatedRequestParams>,
        _ctx: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        // The cursor is the offset of the page, newest meetings first.
        let offset: usize = match request.and_then(|r| r.cursor) {
            Some(cursor) => cursor
                .parse()
                .map_err(|_| McpError::invalid_params("Invalid cursor", None))?,
            None => 0,
        };
        let meetings = self.db.list_meetings(None, false, None).map_err(|e| {
            McpError::internal_error(format!("Failed to list meetings: {}", e), None)
        })?;
        let next = offset.saturating_add(PAGE_SIZE);
        let next_cursor = (next < meetings.len()).then(|| next.to_string());

        let resources: Vec<Resource> = meetings
            .iter()
            .skip(offset)
            .take(PAGE_SIZE)
            .map(|m| {
                Resource::new(
                    format!("nootle://meetings/{}/transcript", m.id),
                    format!("Transcript: {}", m.title),
                )
                .with_title(format!("Transcript for {}", m.title))
                .with_description(format!(
                    "Full transcript for meeting '{}' ({})",
                    m.title, m.start_time
                ))
                .with_mime_type("text/plain")
            })
            .collect();

        let mut result = ListResourcesResult::with_all_items(resources);
        result.next_cursor = next_cursor;
        Ok(result)
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _ctx: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let uri = &request.uri;

        // Parse nootle://meetings/{id}/transcript
        if let Some(meeting_id) = uri
            .strip_prefix("nootle://meetings/")
            .and_then(|rest| rest.strip_suffix("/transcript"))
        {
            let segments = self.db.get_transcript(meeting_id).map_err(|e| {
                McpError::internal_error(format!("Failed to get transcript: {}", e), None)
            })?;

            let transcript_text = segments
                .iter()
                .map(transcript_line)
                .collect::<Vec<_>>()
                .join("\n");

            Ok(
                ReadResourceResult::new(vec![ResourceContents::text(transcript_text, uri.clone())])
                    .into(),
            )
        } else {
            // The current spec reports unknown resources as invalid params.
            Err(McpError::invalid_params(
                "Resource not found",
                Some(json!({ "uri": uri })),
            ))
        }
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        let templates =
            vec![
                ResourceTemplate::new("nootle://meetings/{id}/transcript", "Meeting Transcript")
                    .with_title("Meeting Transcript")
                    .with_description("Full transcript for a specific meeting")
                    .with_mime_type("text/plain"),
            ];

        Ok(ListResourceTemplatesResult::with_all_items(templates))
    }
}

/// Serves MCP over stdin/stdout until the client disconnects. Nothing else
/// may write to stdout meanwhile, so log to stderr.
pub fn serve_stdio(db: Database) -> Result<(), Box<dyn std::error::Error>> {
    use rmcp::ServiceExt;

    tokio::runtime::Runtime::new()?.block_on(async {
        let service = NootleMcpServer::new(Arc::new(db))
            .serve(rmcp::transport::stdio())
            .await?;
        service.waiting().await?;
        Ok(())
    })
}

/// Format milliseconds as HH:MM:SS.mmm
fn format_ms(ms: i64) -> String {
    let total_seconds = ms / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, seconds, millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Database, NewMeeting, NewTranscriptSegment};

    fn setup_test_db() -> Arc<Database> {
        let db = Database::new_in_memory().unwrap();

        // Create a test meeting
        let meeting = db
            .create_meeting(NewMeeting {
                title: "Test Meeting".to_string(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();

        // Add transcript segments
        db.create_transcript_segment(NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: "Alice".to_string(),
            text: "Hello everyone, welcome to the test meeting.".to_string(),
            start_ms: 0,
            end_ms: 3000,
            confidence: 0.95,
        })
        .unwrap();

        db.create_transcript_segment(NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: "Bob".to_string(),
            text: "Thanks Alice, let's discuss the project updates.".to_string(),
            start_ms: 3000,
            end_ms: 6000,
            confidence: 0.92,
        })
        .unwrap();

        Arc::new(db)
    }

    #[test]
    fn test_server_creation() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db);
        let info = server.get_info();
        assert_eq!(info.server_info.name, "nootle-mcp");
        assert!(info.capabilities.tools.is_some());
        assert!(info.capabilities.resources.is_some());
    }

    #[test]
    fn test_page() {
        let first = page((0..120).collect(), 0, PAGE_SIZE);
        assert_eq!(first["items"].as_array().unwrap().len(), 50);
        assert_eq!(first["total"], 120);
        assert_eq!(first["next_offset"], 50);

        let last = page((0..120).collect(), 100, PAGE_SIZE);
        assert_eq!(last["items"][0], 100);
        assert!(last["next_offset"].is_null());
    }

    #[test]
    fn test_format_ms() {
        assert_eq!(format_ms(0), "00:00:00.000");
        assert_eq!(format_ms(1500), "00:00:01.500");
        assert_eq!(format_ms(65000), "00:01:05.000");
        assert_eq!(format_ms(3661500), "01:01:01.500");
    }

    #[tokio::test]
    async fn test_list_meetings_tool() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db);

        let params = ListMeetingsParams {
            search: None,
            label_id: None,
            include_archived: false,
            offset: 0,
        };
        let result = server.list_meetings(Parameters(params)).await;
        assert!(result.is_ok());
        let result = result.unwrap();
        // Should contain the test meeting
        let text = result.content[0].as_text().expect("Expected text content");
        assert!(text.text.contains("Test Meeting"));
    }

    #[test]
    fn test_search_transcripts_tool() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db);

        let params = SearchTranscriptsParams {
            query: "project updates".to_string(),
            offset: 0,
        };
        let result = server.search_transcripts(Parameters(params));
        assert!(result.is_ok());
        let result = result.unwrap();
        let text = result.content[0].as_text().expect("Expected text content");
        assert!(text.text.contains("project updates"));
    }

    /// The tool's JSON output, or its error text as a JSON string.
    fn output(result: Result<CallToolResult, McpError>) -> (bool, serde_json::Value) {
        let result = result.unwrap();
        let text = &result.content[0].as_text().unwrap().text;
        let is_error = result.is_error == Some(true);
        let value = serde_json::from_str(text).unwrap_or_else(|_| json!(text));
        (is_error, value)
    }

    fn meeting_id(db: &Database) -> String {
        db.list_meetings(None, true, None).unwrap()[0].id.clone()
    }

    #[test]
    fn test_update_meeting() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let id = meeting_id(&db);
        let update = |title: Option<&str>, status: Option<&str>, template_id: Option<&str>| {
            server.update_meeting(Parameters(UpdateMeetingParams {
                id: id.clone(),
                title: title.map(Into::into),
                status: status.map(Into::into),
                template_id: template_id.map(Into::into),
                notes: Some("- ship it".into()),
            }))
        };

        let (err, meeting) = output(update(Some(" Renamed "), Some("archived"), None));
        assert!(!err);
        assert_eq!(meeting["title"], "Renamed");
        assert_eq!(meeting["status"], "archived");
        assert_eq!(meeting["raw_notes"], "- ship it");

        let (err, msg) = output(update(None, Some("bogus"), None));
        assert!(err);
        assert!(msg.as_str().unwrap().contains("Invalid meeting status"));
        let (err, msg) = output(update(None, None, Some("nope")));
        assert!(err);
        assert!(msg.as_str().unwrap().contains("Template 'nope' not found"));
        let (err, _) = output(update(Some("  "), None, None));
        assert!(err);
    }

    #[tokio::test]
    async fn test_labels_and_meeting_filter() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let id = meeting_id(&db);
        let save =
            |id: Option<&str>, name: Option<&str>, color: Option<&str>, icon: Option<&str>| {
                output(server.save_label(Parameters(SaveLabelParams {
                    id: id.map(Into::into),
                    name: name.map(Into::into),
                    color: color.map(Into::into),
                    icon: icon.map(Into::into),
                })))
            };

        let (err, msg) = save(None, Some("Ops"), Some("red"), None);
        assert!(err, "{msg}");
        assert!(save(None, Some("Ops"), None, None).0);
        let (_, label) = save(None, Some("Ops"), Some("#aa0000"), Some("bolt"));
        let label_id = label["id"].as_str().unwrap().to_string();

        let (_, label) = save(Some(&label_id), Some("Infra"), None, Some(""));
        assert_eq!(label["name"], "Infra");
        assert_eq!(label["color"], "#aa0000");
        assert!(label["icon"].is_null());

        let (err, _) = output(server.update_meeting_labels(Parameters(
            UpdateMeetingLabelsParams {
                meeting_id: id.clone(),
                add: vec!["missing".into()],
                remove: vec![],
            },
        )));
        assert!(err);
        let (_, labels) = output(server.update_meeting_labels(Parameters(
            UpdateMeetingLabelsParams {
                meeting_id: id.clone(),
                add: vec![label_id.clone()],
                remove: vec![],
            },
        )));
        assert_eq!(labels[0]["name"], "Infra");

        let list = |label_id: &str| {
            server.list_meetings(Parameters(ListMeetingsParams {
                search: None,
                label_id: Some(label_id.into()),
                include_archived: false,
                offset: 0,
            }))
        };
        assert_eq!(
            output(list(&label_id).await).1["items"][0]["labels"][0],
            "Infra"
        );
        assert_eq!(output(list("other").await).1["total"], 0);

        let (_, result) = output(server.delete(Parameters(DeleteParams {
            kind: DeleteKind::Label,
            id: label_id,
        })));
        assert!(result["deleted"].is_string());
        assert!(db.get_meeting_labels(&id).unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_get_meeting_segment_ids_and_edit() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let id = meeting_id(&db);
        let segment = db.get_transcript(&id).unwrap()[0].clone();

        let (_, meeting) = output(
            server
                .get_meeting(Parameters(GetMeetingParams {
                    id: id.clone(),
                    transcript_offset: 0,
                    include_segment_ids: true,
                }))
                .await,
        );
        let line = meeting["transcript"]["items"][0].as_str().unwrap();
        assert!(line.starts_with(&format!("{} [00:00:00.000] Alice:", segment.id)));
        assert!(meeting["labels"].as_array().unwrap().is_empty());

        let (err, _) = output(
            server
                .edit_transcript_segment(Parameters(EditSegmentParams {
                    segment_id: segment.id.clone(),
                    text: "Hello everyone, welcome to the demo meeting.".into(),
                }))
                .await,
        );
        assert!(!err);
        assert!(db.get_transcript(&id).unwrap()[0].text.contains("demo"));
    }

    #[test]
    fn test_update_action_item_keeps_omitted_fields() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let insight = db
            .create_insight(crate::db::NewInsight {
                meeting_id: meeting_id(&db),
                insight_type: "action_item".into(),
                content: "Write the doc".into(),
                context: None,
                transcript_start_ms: None,
                transcript_end_ms: None,
            })
            .unwrap();
        let item = db
            .create_action_item(crate::db::NewActionItem {
                insight_id: insight.id,
                assignee: Some("Alice".into()),
                due_date: Some("2026-01-01".into()),
            })
            .unwrap();
        let update = |status: Option<&str>, assignee: Option<&str>, due_date: Option<&str>| {
            output(
                server.update_action_item(Parameters(UpdateActionItemParams {
                    id: item.id.clone(),
                    status: status.map(Into::into),
                    assignee: assignee.map(Into::into),
                    due_date: due_date.map(Into::into),
                })),
            )
        };

        let (_, updated) = update(Some("done"), Some("Bob"), None);
        assert_eq!(updated["status"], "done");
        assert_eq!(updated["assignee"], "Bob");
        assert_eq!(updated["due_date"], "2026-01-01");
        let (_, updated) = update(None, None, Some(""));
        assert_eq!(updated["assignee"], "Bob");
        assert!(updated["due_date"].is_null());
        assert!(update(Some("finished"), None, None).0);
    }

    #[test]
    fn test_settings() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let set = |key: &str, value: &str| {
            output(server.set_setting(Parameters(SetSettingParams {
                key: key.into(),
                value: value.into(),
            })))
            .0
        };
        assert!(!set("denoise_enabled", "false"));
        assert!(!set("summarization_provider", "ollama"));
        assert!(set("denoise_enabled", "off"));
        assert!(set(crate::remote::ENABLED_SETTING, "true"));
        assert!(set("api_key", "x"));

        let (_, settings) = output(server.get_settings());
        assert_eq!(settings["denoise_enabled"], "false");
        assert_eq!(settings["summarization_provider"], "ollama");
        assert!(settings[crate::remote::ENABLED_SETTING].is_null());
    }

    #[tokio::test]
    async fn test_scratch_notes_and_dictionary() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let id = meeting_id(&db);
        let (_, note) = output(server.add_scratch_note(Parameters(AddScratchNoteParams {
            meeting_id: id.clone(),
            content: "follow up".into(),
            timestamp_ms: 1500,
        })));
        assert_eq!(db.get_scratch_notes(&id).unwrap().len(), 1);
        output(server.delete(Parameters(DeleteParams {
            kind: DeleteKind::ScratchNote,
            id: note["id"].as_str().unwrap().into(),
        })));
        assert!(db.get_scratch_notes(&id).unwrap().is_empty());

        let (_, entry) = output(server.save_dictionary_entry(Parameters(
            SaveDictionaryEntryParams {
                id: None,
                term: "Alyce".into(),
                misheard: Some(vec!["Alice".into()]),
            },
        )));
        // Omitted variants are kept.
        let (_, entry) = output(server.save_dictionary_entry(Parameters(
            SaveDictionaryEntryParams {
                id: Some(entry["id"].as_str().unwrap().into()),
                term: "Alysse".into(),
                misheard: None,
            },
        )));
        assert_eq!(entry["term"], "Alysse");
        assert_eq!(entry["misheard"][0], "Alice");
        let (_, applied) = output(
            server
                .apply_dictionary(Parameters(MeetingIdParams {
                    meeting_id: id.clone(),
                }))
                .await,
        );
        assert_eq!(applied["changed_segments"], 1);
    }

    #[tokio::test]
    async fn test_analytics_and_export() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let id = meeting_id(&db);
        let (_, analytics) = output(
            server
                .get_meeting_analytics(Parameters(MeetingIdParams {
                    meeting_id: id.clone(),
                }))
                .await,
        );
        assert_eq!(analytics["speakers"].as_array().unwrap().len(), 2);
        // Computed on first request and saved.
        assert_eq!(db.get_speaker_analytics(&id).unwrap().len(), 2);

        let export = |format: &str| {
            server.export_meeting(Parameters(ExportMeetingParams {
                meeting_id: id.clone(),
                format: format.into(),
            }))
        };
        let (_, srt) = output(export("srt").await);
        assert!(srt["content"].as_str().unwrap().contains("Alice"));
        assert!(output(export("pdf").await).0);
    }

    #[tokio::test]
    async fn test_rename_speaker_without_search_model() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db.clone());
        let id = meeting_id(&db);
        let (err, result) = output(
            server
                .rename_speaker(Parameters(RenameSpeakerParams {
                    meeting_id: id.clone(),
                    from: "Bob".into(),
                    to: "Robert".into(),
                }))
                .await,
        );
        assert!(!err, "{result}");
        assert_eq!(result["changed_segments"], 1);
        assert_eq!(db.get_transcript(&id).unwrap()[1].speaker_label, "Robert");
    }
}
