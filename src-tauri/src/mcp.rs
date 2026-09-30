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

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListMeetingsParams {
    /// Optional search query to filter meetings by title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct GetMeetingParams {
    /// The meeting ID to retrieve
    pub id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SearchTranscriptsParams {
    /// Full-text search query to match against transcript segments
    pub query: String,
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
pub enum AutomationKind {
    Integration,
    Workflow,
    Template,
    InsightType,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct DeleteAutomationParams {
    /// What to delete. Deleting an integration also deletes its workflows.
    pub kind: AutomationKind,
    /// ID of the item
    pub id: String,
}

/// Serializes `result` as the tool's output. Errors go back to the model as a
/// tool error rather than a protocol error, so it can read them and retry.
fn respond<T: serde::Serialize>(
    result: crate::error::Result<T>,
) -> Result<CallToolResult, McpError> {
    Ok(match result {
        Ok(value) => {
            let json = serde_json::to_string_pretty(&value)
                .map_err(|e| McpError::internal_error(format!("Serialization error: {e}"), None))?;
            CallToolResult::success(vec![ContentBlock::text(json)])
        }
        Err(e) => CallToolResult::error(vec![ContentBlock::text(e.to_string())]),
    })
}

#[derive(Clone)]
pub struct NootleMcpServer {
    db: Arc<Database>,
}

#[tool_router]
impl NootleMcpServer {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// List meetings with optional search filter
    #[tool(
        description = "List meetings with optional search filter. Returns meeting metadata (id, title, start_time, status, etc).",
        annotations(read_only_hint = true)
    )]
    fn list_meetings(
        &self,
        Parameters(params): Parameters<ListMeetingsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(self.db.list_meetings(params.search.as_deref(), false))
    }

    /// Get full meeting details including transcript and summaries
    #[tool(
        description = "Get full meeting details including transcript segments and summaries. Requires a meeting ID.",
        annotations(read_only_hint = true)
    )]
    fn get_meeting(
        &self,
        Parameters(params): Parameters<GetMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        respond((|| {
            Ok(json!({
                "meeting": self.db.get_meeting(&params.id)?,
                "transcript": self.db.get_transcript(&params.id)?,
                "summaries": self.db.get_summaries_for_meeting(&params.id)?,
            }))
        })())
    }

    /// Full-text search across all transcripts
    #[tool(
        description = "Full-text search across all meeting transcripts. Returns matching transcript segments with meeting context.",
        annotations(read_only_hint = true)
    )]
    fn search_transcripts(
        &self,
        Parameters(params): Parameters<SearchTranscriptsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(self.db.search_transcripts(&params.query))
    }

    #[tool(
        description = "Describe what can be automated: each integration type with its credential fields and actions, each action's config fields, the {{placeholders}} text fields accept, and the icons insight types can use. Read this before creating integrations or workflows.",
        annotations(read_only_hint = true)
    )]
    fn get_automation_catalog(&self) -> Result<CallToolResult, McpError> {
        respond(Ok(automation::catalog()))
    }

    #[tool(
        description = "List the user's automations: connected integrations (credentials never included), workflows, summary templates, and insight types.",
        annotations(read_only_hint = true)
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
        description = "Connect an integration (Slack, Notion, GitHub, ...) so workflows can send to it. Credentials are stored locally and never returned.",
        annotations(destructive_hint = false)
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
        description = "Rename an integration or replace its credentials.",
        annotations(destructive_hint = false, idempotent_hint = true)
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
        description = "Create a workflow that sends a meeting's summary or action items to a connected integration. The user runs it from a meeting's Run menu, or you can run it with run_workflow.",
        annotations(destructive_hint = false)
    )]
    fn create_workflow(
        &self,
        Parameters(p): Parameters<NewWorkflowInput>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_workflow(&self.db, &p))
    }

    #[tool(
        description = "Update a workflow: rename, change its config or integration, or enable/disable it.",
        annotations(destructive_hint = false, idempotent_hint = true)
    )]
    fn update_workflow(
        &self,
        Parameters(p): Parameters<UpdateParams<WorkflowPatch>>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_workflow(&self.db, &p.id, &p.patch))
    }

    #[tool(
        description = "Run a workflow against a meeting now. This sends data to the external service (posts to Slack, opens issues, ...). Returns the run with status completed or failed and its output or error.",
        annotations(destructive_hint = false, open_world_hint = true)
    )]
    async fn run_workflow(
        &self,
        Parameters(p): Parameters<RunWorkflowParams>,
    ) -> Result<CallToolResult, McpError> {
        let llm = crate::llm::LlmRegistry::detect(&self.db);
        respond(
            crate::workflows::run_workflow_for_meeting(
                &self.db,
                &llm,
                &p.meeting_id,
                &p.workflow_id,
                p.llm_provider.as_deref(),
                p.llm_model.as_deref(),
            )
            .await
            .map_err(crate::error::NootleError::Other),
        )
    }

    #[tool(
        description = "List past workflow runs for a meeting, newest first.",
        annotations(read_only_hint = true)
    )]
    fn list_workflow_runs(
        &self,
        Parameters(p): Parameters<ListWorkflowRunsParams>,
    ) -> Result<CallToolResult, McpError> {
        respond(self.db.list_workflow_runs_for_meeting(&p.meeting_id))
    }

    #[tool(
        description = "Create a summary template. With auto_run, every new meeting is summarized with it automatically.",
        annotations(destructive_hint = false)
    )]
    fn create_template(
        &self,
        Parameters(p): Parameters<NewTemplateInput>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_template(&self.db, &p))
    }

    #[tool(
        description = "Update a summary template, including turning auto-run on or off.",
        annotations(destructive_hint = false, idempotent_hint = true)
    )]
    fn update_template(
        &self,
        Parameters(p): Parameters<UpdateParams<TemplatePatch>>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_template(&self.db, &p.id, &p.patch))
    }

    #[tool(
        description = "Create a custom insight type that Nootle extracts from every transcript alongside decisions and action items.",
        annotations(destructive_hint = false)
    )]
    fn create_insight_type(
        &self,
        Parameters(p): Parameters<NewInsightTypeInput>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::create_insight_type(&self.db, &p))
    }

    #[tool(
        description = "Update a custom insight type's name, prompt, icon, or action fields.",
        annotations(destructive_hint = false, idempotent_hint = true)
    )]
    fn update_insight_type(
        &self,
        Parameters(p): Parameters<UpdateParams<InsightTypePatch>>,
    ) -> Result<CallToolResult, McpError> {
        respond(automation::update_insight_type(&self.db, &p.id, &p.patch))
    }

    #[tool(
        description = "Permanently delete an integration (and its workflows), workflow, template, or insight type. Built-in templates and insight types can't be deleted. Confirm with the user first.",
        annotations(destructive_hint = true, idempotent_hint = true)
    )]
    fn delete_automation(
        &self,
        Parameters(p): Parameters<DeleteAutomationParams>,
    ) -> Result<CallToolResult, McpError> {
        let result = match p.kind {
            AutomationKind::Integration => self.db.delete_integration(&p.id),
            AutomationKind::Workflow => self.db.delete_workflow(&p.id),
            AutomationKind::Template => self.db.delete_template(&p.id),
            AutomationKind::InsightType => self.db.delete_insight_type(&p.id),
        };
        respond(result.map(|()| json!({ "deleted": p.id })))
    }
}

#[tool_handler]
impl ServerHandler for NootleMcpServer {
    fn get_info(&self) -> ServerInfo {
        let capabilities = ServerCapabilities::builder()
            .enable_tools()
            .enable_resources()
            .build();
        let server_info = Implementation::new("nootle-mcp", env!("CARGO_PKG_VERSION"))
            .with_title("Nootle MCP Server")
            .with_description("MCP server for Nootle meeting data and automations");
        ServerInfo::new(capabilities)
            .with_protocol_version(ProtocolVersion::V_2024_11_05)
            .with_server_info(server_info)
            .with_instructions(
                "Nootle MCP server. Read meetings and transcripts, and set up automations on the \
                 user's behalf: integrations, workflows that send meeting output to them, \
                 summary templates, and custom insight types. Call get_automation_catalog \
                 before creating integrations or workflows.",
            )
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        // List all meetings and create a resource entry for each transcript
        let meetings = self.db.list_meetings(None, false).map_err(|e| {
            McpError::internal_error(format!("Failed to list meetings: {}", e), None)
        })?;

        let resources: Vec<Resource> = meetings
            .iter()
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

        Ok(ListResourcesResult {
            resources,
            next_cursor: None,
            meta: None,
        })
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _ctx: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let uri = &request.uri;

        // Parse nootle://meetings/{id}/transcript
        if let Some(meeting_id) = uri
            .strip_prefix("nootle://meetings/")
            .and_then(|rest| rest.strip_suffix("/transcript"))
        {
            let segments = self.db.get_transcript(meeting_id).map_err(|e| {
                McpError::internal_error(format!("Failed to get transcript: {}", e), None)
            })?;

            let transcript_text: String = segments
                .iter()
                .map(|s| {
                    format!(
                        "[{}] {}: {}",
                        format_ms(s.start_ms),
                        s.speaker_label,
                        s.text
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");

            Ok(ReadResourceResult::new(vec![ResourceContents::text(
                transcript_text,
                uri.clone(),
            )]))
        } else {
            Err(McpError::resource_not_found(
                "resource_not_found",
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

        Ok(ListResourceTemplatesResult {
            resource_templates: templates,
            next_cursor: None,
            meta: None,
        })
    }
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
    fn test_format_ms() {
        assert_eq!(format_ms(0), "00:00:00.000");
        assert_eq!(format_ms(1500), "00:00:01.500");
        assert_eq!(format_ms(65000), "00:01:05.000");
        assert_eq!(format_ms(3661500), "01:01:01.500");
    }

    #[test]
    fn test_list_meetings_tool() {
        let db = setup_test_db();
        let server = NootleMcpServer::new(db);

        let params = ListMeetingsParams { search: None };
        let result = server.list_meetings(Parameters(params));
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
        };
        let result = server.search_transcripts(Parameters(params));
        assert!(result.is_ok());
        let result = result.unwrap();
        let text = result.content[0].as_text().expect("Expected text content");
        assert!(text.text.contains("project updates"));
    }
}
