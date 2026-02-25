use std::sync::Arc;

use rmcp::{
    handler::server::router::tool::ToolRouter, handler::server::wrapper::Parameters, model::*,
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, RoleServer, ServerHandler,
};
use serde_json::json;

use crate::db::Database;

// ----- Parameter structs for tools -----

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListMeetingsParams {
    /// Optional category ID to filter meetings by
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
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

// ----- MCP Server struct -----

#[derive(Clone)]
pub struct NootleMcpServer {
    db: Arc<Database>,
    tool_router: ToolRouter<NootleMcpServer>,
}

#[tool_router]
impl NootleMcpServer {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            tool_router: Self::tool_router(),
        }
    }

    /// List meetings with optional category and search filters
    #[tool(
        description = "List meetings with optional category_id and search filters. Returns meeting metadata (id, title, start_time, status, etc)."
    )]
    fn list_meetings(
        &self,
        Parameters(params): Parameters<ListMeetingsParams>,
    ) -> Result<CallToolResult, McpError> {
        let meetings = self
            .db
            .list_meetings(params.category_id.as_deref(), params.search.as_deref())
            .map_err(|e| {
                McpError::internal_error(format!("Failed to list meetings: {}", e), None)
            })?;

        let json = serde_json::to_string_pretty(&meetings)
            .map_err(|e| McpError::internal_error(format!("Serialization error: {}", e), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get full meeting details including transcript and summaries
    #[tool(
        description = "Get full meeting details including transcript segments and summaries. Requires a meeting ID."
    )]
    fn get_meeting(
        &self,
        Parameters(params): Parameters<GetMeetingParams>,
    ) -> Result<CallToolResult, McpError> {
        let meeting = self
            .db
            .get_meeting(&params.id)
            .map_err(|e| McpError::internal_error(format!("Failed to get meeting: {}", e), None))?;

        let transcript = self.db.get_transcript(&params.id).map_err(|e| {
            McpError::internal_error(format!("Failed to get transcript: {}", e), None)
        })?;

        let summaries = self.db.get_summaries_for_meeting(&params.id).map_err(|e| {
            McpError::internal_error(format!("Failed to get summaries: {}", e), None)
        })?;

        let result = json!({
            "meeting": meeting,
            "transcript": transcript,
            "summaries": summaries,
        });

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(format!("Serialization error: {}", e), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Full-text search across all transcripts
    #[tool(
        description = "Full-text search across all meeting transcripts. Returns matching transcript segments with meeting context."
    )]
    fn search_transcripts(
        &self,
        Parameters(params): Parameters<SearchTranscriptsParams>,
    ) -> Result<CallToolResult, McpError> {
        let results = self.db.search_transcripts(&params.query).map_err(|e| {
            McpError::internal_error(format!("Failed to search transcripts: {}", e), None)
        })?;

        let json = serde_json::to_string_pretty(&results)
            .map_err(|e| McpError::internal_error(format!("Serialization error: {}", e), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }
}

#[tool_handler]
impl ServerHandler for NootleMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
            server_info: Implementation {
                name: "nootle-mcp".into(),
                version: env!("CARGO_PKG_VERSION").into(),
                title: Some("Nootle MCP Server".into()),
                description: Some("MCP server for accessing Nootle meeting data".into()),
                icons: None,
                website_url: None,
            },
            instructions: Some(
                "Nootle MCP server. Provides tools to list/get meetings, search transcripts, \
                 and resources for accessing meeting transcripts."
                    .into(),
            ),
        }
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        // List all meetings and create a resource entry for each transcript
        let meetings = self.db.list_meetings(None, None).map_err(|e| {
            McpError::internal_error(format!("Failed to list meetings: {}", e), None)
        })?;

        let resources: Vec<Resource> = meetings
            .iter()
            .map(|m| {
                RawResource {
                    uri: format!("nootle://meetings/{}/transcript", m.id),
                    name: format!("Transcript: {}", m.title),
                    title: Some(format!("Transcript for {}", m.title)),
                    description: Some(format!(
                        "Full transcript for meeting '{}' ({})",
                        m.title, m.start_time
                    )),
                    mime_type: Some("text/plain".into()),
                    size: None,
                    icons: None,
                    meta: None,
                }
                .no_annotation()
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

            Ok(ReadResourceResult {
                contents: vec![ResourceContents::text(transcript_text, uri.clone())],
            })
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
        let templates = vec![RawResourceTemplate {
            uri_template: "nootle://meetings/{id}/transcript".into(),
            name: "Meeting Transcript".into(),
            title: Some("Meeting Transcript".into()),
            description: Some("Full transcript for a specific meeting".into()),
            mime_type: Some("text/plain".into()),
            icons: None,
        }
        .no_annotation()];

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
                category_id: None,
                calendar_event_id: None,
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

        let params = ListMeetingsParams {
            category_id: None,
            search: None,
        };
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
