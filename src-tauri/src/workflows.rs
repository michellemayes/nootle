use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowContext {
    pub meeting_title: String,
    pub meeting_date: String,
    pub summary: Option<String>,
    pub action_items: Vec<ActionItemContext>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionItemContext {
    pub content: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub message: String,
    pub output: Option<String>,
}

pub async fn execute_workflow(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    match integration.integration_type.as_str() {
        "email" => execute_email(workflow, context),
        "slack" => execute_slack(workflow, integration, context).await,
        "notion" => execute_notion(workflow, integration, context).await,
        "confluence" => execute_confluence(workflow, integration, context).await,
        "github" => execute_github(workflow, integration, context).await,
        "linear" => execute_linear(workflow, integration, context).await,
        "asana" => execute_asana(workflow, integration, context).await,
        "obsidian" => execute_obsidian(workflow, integration, context).await,
        other => Err(format!("Unknown integration type: {other}")),
    }
}

fn parse_creds_and_config(
    integration: &crate::db::Integration,
    workflow: &crate::db::Workflow,
) -> std::result::Result<(serde_json::Value, serde_json::Value), String> {
    let creds = serde_json::from_str(&integration.credentials_json)
        .map_err(|e| format!("Invalid credentials: {e}"))?;
    let config =
        serde_json::from_str(&workflow.config_json).map_err(|e| format!("Invalid config: {e}"))?;
    Ok((creds, config))
}

fn render_template(template: &str, context: &WorkflowContext) -> String {
    let action_items_text = context
        .action_items
        .iter()
        .map(|ai| {
            let mut line = format!("- {}", ai.content);
            if let Some(ref assignee) = ai.assignee {
                line.push_str(&format!(" (assigned to {assignee})"));
            }
            if let Some(ref due) = ai.due_date {
                line.push_str(&format!(" [due: {due}]"));
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n");

    template
        .replace("{{title}}", &context.meeting_title)
        .replace("{{date}}", &context.meeting_date)
        .replace(
            "{{summary}}",
            context.summary.as_deref().unwrap_or("No summary available"),
        )
        .replace("{{action_items}}", &action_items_text)
}

fn execute_email(
    workflow: &crate::db::Workflow,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let config: serde_json::Value =
        serde_json::from_str(&workflow.config_json).map_err(|e| format!("Invalid config: {e}"))?;

    let subject_template = config["subject"]
        .as_str()
        .unwrap_or("Meeting Notes: {{title}}");
    let body_template = config["body"]
        .as_str()
        .unwrap_or("{{summary}}\n\n## Action Items\n{{action_items}}");

    let subject = render_template(subject_template, context);
    let body = render_template(body_template, context);

    Ok(WorkflowResult {
        message: "Email draft generated".to_string(),
        output: Some(format!("Subject: {subject}\n\n{body}")),
    })
}

async fn execute_slack(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let token = creds["bot_token"]
        .as_str()
        .ok_or("Missing bot_token in Slack credentials")?;
    let channel = config["channel"]
        .as_str()
        .ok_or("Missing channel in workflow config")?;

    let message_template = config["message_template"]
        .as_str()
        .unwrap_or("*{{title}}* — {{date}}\n\n{{summary}}");
    let text = render_template(message_template, context);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://slack.com/api/chat.postMessage")
        .bearer_auth(token)
        .json(&serde_json::json!({
            "channel": channel,
            "text": text,
        }))
        .send()
        .await
        .map_err(|e| format!("Slack API error: {e}"))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Slack response: {e}"))?;

    if body["ok"].as_bool() == Some(true) {
        Ok(WorkflowResult {
            message: format!("Posted to {channel}"),
            output: None,
        })
    } else {
        Err(format!(
            "Slack error: {}",
            body["error"].as_str().unwrap_or("unknown")
        ))
    }
}

async fn execute_notion(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let token = creds["api_key"]
        .as_str()
        .ok_or("Missing api_key in Notion credentials")?;
    let database_id = config["database_id"]
        .as_str()
        .ok_or("Missing database_id in workflow config")?;

    let content = render_template("{{summary}}\n\n## Action Items\n{{action_items}}", context);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.notion.com/v1/pages")
        .bearer_auth(token)
        .header("Notion-Version", "2022-06-28")
        .json(&serde_json::json!({
            "parent": { "database_id": database_id },
            "properties": {
                "title": {
                    "title": [{ "text": { "content": context.meeting_title } }]
                }
            },
            "children": [{
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{ "text": { "content": content } }]
                }
            }]
        }))
        .send()
        .await
        .map_err(|e| format!("Notion API error: {e}"))?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Notion response: {e}"))?;
        Ok(WorkflowResult {
            message: "Page created in Notion".to_string(),
            output: body["url"].as_str().map(String::from),
        })
    } else {
        Err(format!(
            "Notion error: {}",
            resp.text().await.unwrap_or_default()
        ))
    }
}

async fn execute_confluence(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let email = creds["email"]
        .as_str()
        .ok_or("Missing email in Confluence credentials")?;
    let api_token = creds["api_token"]
        .as_str()
        .ok_or("Missing api_token in Confluence credentials")?;
    let base_url = creds["base_url"]
        .as_str()
        .ok_or("Missing base_url in Confluence credentials")?;
    let space_key = config["space_key"]
        .as_str()
        .ok_or("Missing space_key in workflow config")?;

    let content = render_template(
        "<h2>Summary</h2><p>{{summary}}</p><h2>Action Items</h2><p>{{action_items}}</p>",
        context,
    );

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base_url}/wiki/api/v2/pages"))
        .basic_auth(email, Some(api_token))
        .json(&serde_json::json!({
            "spaceId": space_key,
            "status": "current",
            "title": format!("Meeting Notes: {}", context.meeting_title),
            "body": {
                "representation": "storage",
                "value": content
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Confluence API error: {e}"))?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Confluence response: {e}"))?;
        Ok(WorkflowResult {
            message: "Page created in Confluence".to_string(),
            output: body["_links"]["webui"].as_str().map(String::from),
        })
    } else {
        Err(format!(
            "Confluence error: {}",
            resp.text().await.unwrap_or_default()
        ))
    }
}

async fn execute_github(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let token = creds["token"]
        .as_str()
        .ok_or("Missing token in GitHub credentials")?;
    let repo = config["repo"]
        .as_str()
        .ok_or("Missing repo in workflow config (format: owner/repo)")?;

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let body = format!(
            "From meeting: **{}** ({})\n\n{}{}",
            context.meeting_title,
            context.meeting_date,
            item.content,
            item.assignee
                .as_deref()
                .map(|a| format!("\n\nAssignee: {a}"))
                .unwrap_or_default(),
        );

        let resp = client
            .post(format!("https://api.github.com/repos/{repo}/issues"))
            .bearer_auth(token)
            .header("User-Agent", "Nootle")
            .header("Accept", "application/vnd.github+json")
            .json(&serde_json::json!({
                "title": item.content,
                "body": body,
            }))
            .send()
            .await
            .map_err(|e| format!("GitHub API error: {e}"))?;

        if resp.status().is_success() {
            let issue: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse GitHub response: {e}"))?;
            if let Some(url) = issue["html_url"].as_str() {
                created.push(url.to_string());
            }
        } else {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("GitHub error creating issue: {err}"));
        }
    }

    Ok(WorkflowResult {
        message: format!("Created {} GitHub issue(s)", created.len()),
        output: Some(created.join("\n")),
    })
}

async fn execute_linear(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let api_key = creds["api_key"]
        .as_str()
        .ok_or("Missing api_key in Linear credentials")?;
    let team_id = config["team_id"]
        .as_str()
        .ok_or("Missing team_id in workflow config")?;
    let project_id = config["project_id"].as_str();

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let description = format!(
            "From meeting: **{}** ({})\n\n{}",
            context.meeting_title,
            context.meeting_date,
            item.assignee
                .as_deref()
                .map(|a| format!("Assignee: {a}"))
                .unwrap_or_default(),
        );

        let mut input = serde_json::json!({
            "teamId": team_id,
            "title": item.content,
            "description": description,
        });
        if let Some(pid) = project_id {
            input["projectId"] = serde_json::json!(pid);
        }

        let resp = client
            .post("https://api.linear.app/graphql")
            .bearer_auth(api_key)
            .json(&serde_json::json!({
                "query": "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }",
                "variables": { "input": input }
            }))
            .send()
            .await
            .map_err(|e| format!("Linear API error: {e}"))?;

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Linear response: {e}"))?;

        if let Some(issue) = body["data"]["issueCreate"]["issue"].as_object() {
            let identifier = issue["identifier"].as_str().unwrap_or("?");
            let url = issue["url"].as_str().unwrap_or("");
            created.push(format!("{identifier}: {url}"));
        } else {
            return Err(format!("Linear error: {}", body["errors"]));
        }
    }

    Ok(WorkflowResult {
        message: format!("Created {} Linear issue(s)", created.len()),
        output: Some(created.join("\n")),
    })
}

async fn execute_asana(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let token = creds["token"]
        .as_str()
        .ok_or("Missing token in Asana credentials")?;
    let project_id = config["project_id"]
        .as_str()
        .ok_or("Missing project_id in workflow config")?;

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let notes = format!(
            "From meeting: {} ({})\n\n{}",
            context.meeting_title,
            context.meeting_date,
            item.assignee
                .as_deref()
                .map(|a| format!("Assignee: {a}"))
                .unwrap_or_default(),
        );

        let mut task_data = serde_json::json!({
            "name": item.content,
            "notes": notes,
            "projects": [project_id],
        });
        if let Some(ref due) = item.due_date {
            task_data["due_on"] = serde_json::json!(due);
        }

        let resp = client
            .post("https://app.asana.com/api/1.0/tasks")
            .bearer_auth(token)
            .json(&serde_json::json!({ "data": task_data }))
            .send()
            .await
            .map_err(|e| format!("Asana API error: {e}"))?;

        if resp.status().is_success() {
            let body: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Asana response: {e}"))?;
            if let Some(gid) = body["data"]["gid"].as_str() {
                created.push(format!("https://app.asana.com/0/0/{gid}"));
            }
        } else {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Asana error: {err}"));
        }
    }

    Ok(WorkflowResult {
        message: format!("Created {} Asana task(s)", created.len()),
        output: Some(created.join("\n")),
    })
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

async fn execute_obsidian(
    workflow: &crate::db::Workflow,
    integration: &crate::db::Integration,
    context: &WorkflowContext,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let vault_path = creds["vault_path"]
        .as_str()
        .ok_or("Missing vault_path in Obsidian credentials")?;

    let speaker_map: std::collections::HashMap<String, String> = match creds.get("speaker_map") {
        Some(serde_json::Value::Object(obj)) => {
            serde_json::from_value(serde_json::Value::Object(obj.clone())).unwrap_or_default()
        }
        Some(serde_json::Value::String(s)) => {
            serde_json::from_str(s).unwrap_or_default()
        }
        _ => std::collections::HashMap::new(),
    };

    let subfolder = config["subfolder"].as_str().unwrap_or("");
    let filename_template = config["filename_template"]
        .as_str()
        .unwrap_or("{{date}} - {{title}}");
    let note_template = config["note_template"].as_str();

    // Extract date portion from meeting_date (split on 'T', take first part)
    let date = context
        .meeting_date
        .split('T')
        .next()
        .unwrap_or(&context.meeting_date);

    // Build sanitized filename from template
    let raw_filename = filename_template
        .replace("{{date}}", date)
        .replace("{{title}}", &context.meeting_title);
    let filename = sanitize_filename(&raw_filename);

    // Create directory
    let dir_path = if subfolder.is_empty() {
        std::path::PathBuf::from(vault_path)
    } else {
        std::path::PathBuf::from(vault_path).join(subfolder)
    };
    tokio::fs::create_dir_all(&dir_path)
        .await
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    // Deduplicate filename if file already exists
    let mut file_path = dir_path.join(format!("{filename}.md"));
    let mut counter = 2u32;
    while file_path.exists() {
        file_path = dir_path.join(format!("{filename} ({counter}).md"));
        counter += 1;
    }

    // Helper closure: replace speaker names with wikilinks using speaker_map
    let replace_speakers = |text: &str| -> String {
        let mut result = text.to_string();
        for (raw_name, mapped_name) in &speaker_map {
            result = result.replace(raw_name, &format!("[[{mapped_name}]]"));
        }
        result
    };

    // Build speakers list for frontmatter
    let speakers_yaml: String = speaker_map
        .iter()
        .map(|(raw, mapped)| {
            if raw != mapped {
                format!("  - \"[[{mapped}]]\"")
            } else {
                format!("  - \"[[{mapped}]]\"")
            }
        })
        .chain(
            // If there are no speaker mappings, we still produce nothing extra
            std::iter::empty::<String>(),
        )
        .collect::<Vec<_>>()
        .join("\n");

    // Build YAML frontmatter
    let mut frontmatter = format!(
        "---\ndate: {date}\ntitle: \"{title}\"\ntags:\n  - meeting\n  - nootle\n",
        date = date,
        title = context.meeting_title,
    );
    if !speaker_map.is_empty() {
        frontmatter.push_str("speakers:\n");
        frontmatter.push_str(&speakers_yaml);
        frontmatter.push('\n');
    }
    frontmatter.push_str("---\n");

    // Build body
    let body = if let Some(tmpl) = note_template {
        render_template(tmpl, context)
    } else {
        let summary_text = context
            .summary
            .as_deref()
            .unwrap_or("No summary available");
        let summary_with_links = replace_speakers(summary_text);

        let action_items_text = context
            .action_items
            .iter()
            .map(|ai| {
                let assignee_part = ai
                    .assignee
                    .as_deref()
                    .map(|a| {
                        let display = speaker_map
                            .get(a)
                            .map(|m| format!("[[{m}]]"))
                            .unwrap_or_else(|| a.to_string());
                        format!(" ({display})")
                    })
                    .unwrap_or_default();

                let due_part = ai
                    .due_date
                    .as_deref()
                    .map(|d| format!(" [due: {d}]"))
                    .unwrap_or_default();

                format!("- [ ] {}{}{}", ai.content, assignee_part, due_part)
            })
            .collect::<Vec<_>>()
            .join("\n");

        format!(
            "# {title}\n\n## Summary\n\n{summary}\n\n## Action Items\n\n{actions}\n",
            title = context.meeting_title,
            summary = summary_with_links,
            actions = action_items_text,
        )
    };

    let full_content = format!("{frontmatter}\n{body}");

    tokio::fs::write(&file_path, full_content)
        .await
        .map_err(|e| format!("Failed to write Obsidian note: {e}"))?;

    let path_str = file_path.to_string_lossy().to_string();

    Ok(WorkflowResult {
        message: format!("Note created in Obsidian vault"),
        output: Some(path_str),
    })
}
