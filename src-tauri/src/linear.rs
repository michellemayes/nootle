use crate::http::CLIENT;
use serde::{Deserialize, Serialize};

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearProject {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearIssueResult {
    pub id: String,
    pub identifier: String,
    pub url: String,
    pub title: String,
}

#[derive(Deserialize)]
struct GqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Deserialize)]
struct TeamsData {
    teams: Nodes<TeamNode>,
}

#[derive(Deserialize)]
struct Nodes<T> {
    nodes: Vec<T>,
}

#[derive(Deserialize)]
struct TeamNode {
    id: String,
    name: String,
    key: String,
}

#[derive(Deserialize)]
struct ProjectsData {
    projects: Nodes<ProjectNode>,
}

#[derive(Deserialize)]
struct ProjectNode {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct IssueCreateData {
    #[serde(rename = "issueCreate")]
    issue_create: IssueCreatePayload,
}

#[derive(Deserialize)]
struct IssueCreatePayload {
    success: bool,
    issue: Option<IssueNode>,
}

#[derive(Deserialize)]
struct IssueNode {
    id: String,
    identifier: String,
    url: String,
    title: String,
}

/// Linear over either connection: the GraphQL API with a pasted key, or
/// Linear's MCP server after a one-click sign-in.
pub enum Linear {
    /// A personal API key. Linear wants it as the bare `Authorization`
    /// header, without a `Bearer` prefix.
    Api(String),
    Mcp(crate::connectors::Session),
}

impl Linear {
    pub async fn for_integration(
        db: &crate::db::Database,
        integration: &crate::db::Integration,
    ) -> Result<Self, String> {
        let creds: serde_json::Value = serde_json::from_str(&integration.credentials_json)
            .map_err(|e| format!("Invalid credentials: {e}"))?;
        if crate::connectors::is_mcp(&creds) {
            return crate::connectors::Session::open(db, integration)
                .await
                .map(Self::Mcp);
        }
        creds["api_key"]
            .as_str()
            .filter(|k| !k.is_empty())
            .map(|k| Self::Api(k.to_string()))
            .ok_or_else(|| "Missing api_key in Linear credentials".to_string())
    }

    pub async fn list_teams(&self) -> Result<Vec<LinearTeam>, String> {
        let session = match self {
            Self::Api(key) => return list_teams(key).await.map_err(|e| e.to_string()),
            Self::Mcp(session) => session,
        };
        let result = session
            .call("list_teams", serde_json::json!({ "limit": 250 }))
            .await?;
        Ok(crate::connectors::find_records(&result, &["id", "name"])
            .into_iter()
            .map(|t| LinearTeam {
                id: str_field(t, "id"),
                name: str_field(t, "name"),
                key: str_field(t, "key"),
            })
            .collect())
    }

    pub async fn list_projects(&self, team_id: &str) -> Result<Vec<LinearProject>, String> {
        let session = match self {
            Self::Api(key) => return list_projects(key, team_id).await.map_err(|e| e.to_string()),
            Self::Mcp(session) => session,
        };
        let result = session
            .call(
                "list_projects",
                serde_json::json!({ "team": team_id, "limit": 250 }),
            )
            .await?;
        Ok(crate::connectors::find_records(&result, &["id", "name"])
            .into_iter()
            .map(|p| LinearProject {
                id: str_field(p, "id"),
                name: str_field(p, "name"),
            })
            .collect())
    }

    pub async fn create_issue(
        &self,
        team_id: &str,
        project_id: Option<&str>,
        title: &str,
        description: &str,
    ) -> Result<LinearIssueResult, String> {
        let session = match self {
            Self::Api(key) => {
                return create_issue(key, team_id, project_id, title, description)
                    .await
                    .map_err(|e| e.to_string())
            }
            Self::Mcp(session) => session,
        };
        let mut args = serde_json::json!({
            "title": title,
            "team": team_id,
            "description": description,
        });
        if let Some(pid) = project_id {
            args["project"] = serde_json::json!(pid);
        }
        let result = session.call("save_issue", args).await?;
        let field = |key| crate::connectors::find_str(&result, key).unwrap_or_default();
        Ok(LinearIssueResult {
            id: field("id"),
            identifier: field("identifier"),
            url: field("url"),
            title: title.to_string(),
        })
    }

    /// Resolves a team key (e.g. "MIC"), name, or ID to the team's ID.
    pub async fn resolve_team_id(&self, input: &str) -> Result<String, String> {
        let teams = self
            .list_teams()
            .await
            .map_err(|e| format!("Failed to look up Linear team: {e}"))?;
        let needle = input.to_ascii_lowercase();
        teams
            .into_iter()
            .find(|t| {
                t.id == input
                    || t.key.to_ascii_lowercase() == needle
                    || t.name.to_ascii_lowercase() == needle
            })
            .map(|t| t.id)
            .ok_or_else(|| {
                format!(
                    "No Linear team matched '{input}'. Use the team key (e.g. MIC), name, or UUID."
                )
            })
    }
}

fn str_field(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> String {
    map.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn extract_errors<T>(response: &GqlResponse<T>) -> Option<String> {
    response.errors.as_ref().map(|errs| {
        errs.iter()
            .map(|e| e.message.clone())
            .collect::<Vec<_>>()
            .join("; ")
    })
}

async fn list_teams(api_key: &str) -> anyhow::Result<Vec<LinearTeam>> {
    let client = &*CLIENT;
    let body = serde_json::json!({
        "query": "{ teams { nodes { id name key } } }"
    });

    let resp = client
        .post(LINEAR_API_URL)
        .header("Authorization", api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<TeamsData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp
        .data
        .ok_or_else(|| anyhow::anyhow!("No data in response"))?;
    Ok(data
        .teams
        .nodes
        .into_iter()
        .map(|t| LinearTeam {
            id: t.id,
            name: t.name,
            key: t.key,
        })
        .collect())
}

async fn list_projects(api_key: &str, team_id: &str) -> anyhow::Result<Vec<LinearProject>> {
    let client = &*CLIENT;
    let query = r#"query ListProjects($teamId: String!) { projects(filter: { accessibleTeams: { id: { eq: $teamId } } }) { nodes { id name } } }"#;
    let body = serde_json::json!({
        "query": query,
        "variables": { "teamId": team_id }
    });

    let resp = client
        .post(LINEAR_API_URL)
        .header("Authorization", api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<ProjectsData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp
        .data
        .ok_or_else(|| anyhow::anyhow!("No data in response"))?;
    Ok(data
        .projects
        .nodes
        .into_iter()
        .map(|p| LinearProject {
            id: p.id,
            name: p.name,
        })
        .collect())
}

async fn create_issue(
    api_key: &str,
    team_id: &str,
    project_id: Option<&str>,
    title: &str,
    description: &str,
) -> anyhow::Result<LinearIssueResult> {
    let client = &*CLIENT;

    let mut input = serde_json::json!({
        "teamId": team_id,
        "title": title,
        "description": description,
    });

    if let Some(pid) = project_id {
        input
            .as_object_mut()
            .unwrap()
            .insert("projectId".into(), serde_json::json!(pid));
    }

    let body = serde_json::json!({
        "query": "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }",
        "variables": { "input": input }
    });

    let resp = client
        .post(LINEAR_API_URL)
        .header("Authorization", api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<IssueCreateData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp
        .data
        .ok_or_else(|| anyhow::anyhow!("No data in response"))?;
    if !data.issue_create.success {
        anyhow::bail!("Linear issue creation failed");
    }

    let issue = data
        .issue_create
        .issue
        .ok_or_else(|| anyhow::anyhow!("No issue returned"))?;

    Ok(LinearIssueResult {
        id: issue.id,
        identifier: issue.identifier,
        url: issue.url,
        title: issue.title,
    })
}
