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

fn extract_errors<T>(response: &GqlResponse<T>) -> Option<String> {
    response.errors.as_ref().map(|errs| {
        errs.iter()
            .map(|e| e.message.clone())
            .collect::<Vec<_>>()
            .join("; ")
    })
}

pub async fn list_teams(api_key: &str) -> anyhow::Result<Vec<LinearTeam>> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "query": "{ teams { nodes { id name key } } }"
    });

    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<TeamsData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp.data.ok_or_else(|| anyhow::anyhow!("No data in response"))?;
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

pub async fn list_projects(api_key: &str, team_id: &str) -> anyhow::Result<Vec<LinearProject>> {
    let client = reqwest::Client::new();
    let query = format!(
        r#"{{ projects(filter: {{ accessibleTeams: {{ id: {{ eq: "{}" }} }} }}) {{ nodes {{ id name }} }} }}"#,
        team_id
    );
    let body = serde_json::json!({ "query": query });

    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<ProjectsData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp.data.ok_or_else(|| anyhow::anyhow!("No data in response"))?;
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

pub async fn create_issue(
    api_key: &str,
    team_id: &str,
    project_id: Option<&str>,
    title: &str,
    description: &str,
) -> anyhow::Result<LinearIssueResult> {
    let client = reqwest::Client::new();

    let mut input = serde_json::json!({
        "teamId": team_id,
        "title": title,
        "description": description,
    });

    if let Some(pid) = project_id {
        input.as_object_mut().unwrap().insert("projectId".into(), serde_json::json!(pid));
    }

    let body = serde_json::json!({
        "query": "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }",
        "variables": { "input": input }
    });

    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .json::<GqlResponse<IssueCreateData>>()
        .await?;

    if let Some(err) = extract_errors(&resp) {
        anyhow::bail!("Linear API error: {}", err);
    }

    let data = resp.data.ok_or_else(|| anyhow::anyhow!("No data in response"))?;
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
