use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowContext {
    pub meeting_title: String,
    pub meeting_date: String,
    pub summary: Option<String>,
    /// Summary from the workflow's configured `template_id`, generated on the
    /// fly if it didn't exist yet. None when the workflow has no source
    /// template configured. Exposed to templates as `{{template_summary}}`.
    pub template_summary: Option<String>,
    pub action_items: Vec<ActionItemContext>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionItemContext {
    pub content: String,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    /// AI-extracted surrounding context from the transcript. Used to enrich
    /// issue descriptions when pushing to Linear/GitHub/Asana.
    pub context: Option<String>,
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
    llm: Option<&crate::llm::LlmRegistry>,
    llm_provider: Option<&str>,
    llm_model: Option<&str>,
) -> std::result::Result<WorkflowResult, String> {
    match integration.integration_type.as_str() {
        "email" => execute_email(workflow, context),
        "slack" => execute_slack(workflow, integration, context).await,
        "notion" => execute_notion(workflow, integration, context).await,
        "confluence" => execute_confluence(workflow, integration, context).await,
        "github" => execute_github(workflow, integration, context, llm, llm_provider, llm_model).await,
        "linear" => execute_linear(workflow, integration, context, llm, llm_provider, llm_model).await,
        "asana" => execute_asana(workflow, integration, context, llm, llm_provider, llm_model).await,
        "obsidian" => execute_obsidian(workflow, integration, context).await,
        other => Err(format!("Unknown integration type: {other}")),
    }
}

/// Render an issue description for a single action item. If the workflow's
/// config has a `description_prompt` and an LLM is available, ask the LLM to
/// compose the description from the user's instructions plus all available
/// context. Otherwise fall back to a plain template that already includes the
/// AI-extracted insight context if present.
async fn render_issue_description(
    config: &serde_json::Value,
    context: &WorkflowContext,
    item: &ActionItemContext,
    llm: Option<&crate::llm::LlmRegistry>,
    llm_provider: Option<&str>,
    llm_model: Option<&str>,
) -> String {
    let user_prompt = config
        .get("description_prompt")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if let (Some(user_prompt), Some(llm), Some(provider), Some(model)) =
        (user_prompt, llm, llm_provider, llm_model)
    {
        if let Some(provider_impl) = llm.get_provider(provider) {
            let summary = context.summary.as_deref().unwrap_or("(no summary available)");
            let item_context = item.context.as_deref().unwrap_or("");
            let assignee = item.assignee.as_deref().unwrap_or("(unassigned)");
            let due = item.due_date.as_deref().unwrap_or("(no due date)");
            let user_message = format!(
                "Meeting: {title} ({date})\n\nMeeting summary:\n{summary}\n\nAction item: {content}\nAssignee: {assignee}\nDue: {due}\nContext from transcript: {item_context}",
                title = context.meeting_title,
                date = context.meeting_date,
                summary = summary,
                content = item.content,
            );
            let messages = vec![
                crate::llm::ChatMessage {
                    role: "system".into(),
                    content: format!(
                        "You compose issue descriptions for tickets created from meeting action items. Follow the user's instructions and stay grounded in the supplied context — do not invent facts. Output the description as Markdown, no preamble.\n\nUser instructions:\n{user_prompt}"
                    ),
                },
                crate::llm::ChatMessage {
                    role: "user".into(),
                    content: user_message,
                },
            ];
            if let Ok(response) = provider_impl.chat(messages, model).await {
                let trimmed = response.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    let mut parts = vec![format!(
        "From meeting: **{}** ({})",
        context.meeting_title, context.meeting_date,
    )];
    if let Some(ctx) = item.context.as_deref().filter(|s| !s.is_empty()) {
        parts.push(format!("Context: {ctx}"));
    }
    if let Some(assignee) = item.assignee.as_deref() {
        parts.push(format!("Assignee: {assignee}"));
    }
    if let Some(due) = item.due_date.as_deref() {
        parts.push(format!("Due: {due}"));
    }
    parts.join("\n\n")
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

fn no_action_items_error() -> String {
    "No action items found for this meeting. Generate a summary on the Summaries tab and run insight extraction first — the workflow needs action items to push.".to_string()
}

fn looks_like_uuid(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(i, &b)| match i {
        8 | 13 | 18 | 23 => b == b'-',
        _ => b.is_ascii_hexdigit(),
    })
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
        .replace(
            "{{template_summary}}",
            context
                .template_summary
                .as_deref()
                .or(context.summary.as_deref())
                .unwrap_or("No summary available"),
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
    // {{template_summary}} resolves to the configured source template's
    // summary if one is set on the workflow, otherwise falls back to {{summary}}.
    let body_template = config["body"]
        .as_str()
        .unwrap_or("{{template_summary}}\n\n## Action Items\n{{action_items}}");

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
    llm: Option<&crate::llm::LlmRegistry>,
    llm_provider: Option<&str>,
    llm_model: Option<&str>,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let token = creds["token"]
        .as_str()
        .ok_or("Missing token in GitHub credentials")?;
    let repo = config["repo"]
        .as_str()
        .ok_or("Missing repo in workflow config (format: owner/repo)")?;

    if context.action_items.is_empty() {
        return Err(no_action_items_error());
    }

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let body =
            render_issue_description(&config, context, item, llm, llm_provider, llm_model).await;

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
    llm: Option<&crate::llm::LlmRegistry>,
    llm_provider: Option<&str>,
    llm_model: Option<&str>,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let api_key = creds["api_key"]
        .as_str()
        .ok_or("Missing api_key in Linear credentials")?;
    let team_input = config["team_id"]
        .as_str()
        .ok_or("Missing team_id in workflow config")?;
    let project_id = config["project_id"].as_str();

    if context.action_items.is_empty() {
        return Err(no_action_items_error());
    }

    // Linear's issueCreate requires a team UUID. Users often enter the team
    // key (e.g. "MIC") instead, so look the team up if the input doesn't
    // already look like a UUID.
    let team_id_owned = if looks_like_uuid(team_input) {
        team_input.to_string()
    } else {
        let teams = crate::linear::list_teams(api_key)
            .await
            .map_err(|e| format!("Failed to look up Linear team: {e}"))?;
        let needle = team_input.to_ascii_lowercase();
        let team = teams
            .iter()
            .find(|t| {
                t.id == team_input
                    || t.key.to_ascii_lowercase() == needle
                    || t.name.to_ascii_lowercase() == needle
            })
            .ok_or_else(|| {
                format!(
                    "No Linear team matched '{team_input}'. Use the team key (e.g. MIC), name, or UUID."
                )
            })?;
        team.id.clone()
    };
    let team_id = team_id_owned.as_str();

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let description =
            render_issue_description(&config, context, item, llm, llm_provider, llm_model).await;

        let mut input = serde_json::json!({
            "teamId": team_id,
            "title": item.content,
            "description": description,
        });
        if let Some(pid) = project_id {
            input["projectId"] = serde_json::json!(pid);
        }

        // Linear's API rejects 'Authorization: Bearer <key>'. The key goes in
        // the header verbatim with no scheme prefix.
        let resp = client
            .post("https://api.linear.app/graphql")
            .header("Authorization", api_key)
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
    llm: Option<&crate::llm::LlmRegistry>,
    llm_provider: Option<&str>,
    llm_model: Option<&str>,
) -> std::result::Result<WorkflowResult, String> {
    let (creds, config) = parse_creds_and_config(integration, workflow)?;

    let token = creds["token"]
        .as_str()
        .ok_or("Missing token in Asana credentials")?;
    let project_id = config["project_id"]
        .as_str()
        .ok_or("Missing project_id in workflow config")?;

    if context.action_items.is_empty() {
        return Err(no_action_items_error());
    }

    let client = reqwest::Client::new();
    let mut created = Vec::new();

    for item in &context.action_items {
        let notes =
            render_issue_description(&config, context, item, llm, llm_provider, llm_model).await;

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
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let sanitized = sanitized.trim();
    match sanitized {
        "" | "." | ".." => "untitled".to_string(),
        s => s.to_string(),
    }
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

    let speaker_map: HashMap<String, String> = match creds.get("speaker_map") {
        Some(serde_json::Value::String(s)) => serde_json::from_str(s).unwrap_or_default(),
        Some(v) => serde_json::from_value(v.clone()).unwrap_or_default(),
        None => HashMap::new(),
    };

    let subfolder = config["subfolder"]
        .as_str()
        .ok_or("Missing subfolder in workflow config")?;

    let has_traversal = subfolder.split(&['/', '\\']).any(|part| part == "..");
    if has_traversal {
        return Err(format!("Subfolder '{subfolder}' contains path traversal"));
    }

    let filename_template = config["filename_template"]
        .as_str()
        .unwrap_or("{{date}} - {{title}}");
    let note_template = config["note_template"].as_str();

    let date = context
        .meeting_date
        .split('T')
        .next()
        .unwrap_or(&context.meeting_date);

    let raw_filename = filename_template
        .replace("{{date}}", date)
        .replace("{{title}}", &context.meeting_title);
    let filename = sanitize_filename(&raw_filename);

    let dir_path = if subfolder.is_empty() {
        std::path::PathBuf::from(vault_path)
    } else {
        std::path::PathBuf::from(vault_path).join(subfolder)
    };

    let vault_canonical = tokio::fs::canonicalize(vault_path)
        .await
        .map_err(|e| format!("Invalid vault path {vault_path}: {e}"))?;
    tokio::fs::create_dir_all(&dir_path)
        .await
        .map_err(|e| format!("Failed to create directory {}: {e}", dir_path.display()))?;
    let dir_canonical = tokio::fs::canonicalize(&dir_path)
        .await
        .map_err(|e| format!("Failed to resolve directory {}: {e}", dir_path.display()))?;
    if !dir_canonical.starts_with(&vault_canonical) {
        return Err(format!(
            "Subfolder '{subfolder}' escapes vault path '{vault_path}'"
        ));
    }

    let mut file_path = dir_path.join(format!("{filename}.md"));
    let mut counter = 2u32;
    while tokio::fs::try_exists(&file_path).await.unwrap_or(false) {
        file_path = dir_path.join(format!("{filename} ({counter}).md"));
        counter += 1;
    }

    let replace_speakers = |text: &str| -> String {
        let mut result = text.to_string();
        for (raw_name, mapped_name) in &speaker_map {
            result = result.replace(raw_name, &format!("[[{mapped_name}]]"));
        }
        result
    };

    let unique_speakers: BTreeSet<String> = context
        .action_items
        .iter()
        .filter_map(|ai| ai.assignee.clone())
        .collect();

    let speakers_yaml: String = unique_speakers
        .iter()
        .map(|name| match speaker_map.get(name.as_str()) {
            Some(mapped) => format!("  - \"[[{mapped}]]\""),
            None => format!("  - \"{name}\""),
        })
        .collect::<Vec<_>>()
        .join("\n");

    let escaped_title = context.meeting_title.replace('"', "\\\"");
    let mut frontmatter =
        format!("---\ndate: {date}\ntitle: \"{escaped_title}\"\ntags:\n  - meeting\n  - nootle\n",);
    if !unique_speakers.is_empty() {
        frontmatter.push_str("speakers:\n");
        frontmatter.push_str(&speakers_yaml);
        frontmatter.push('\n');
    }
    frontmatter.push_str("---\n");

    let body = if let Some(tmpl) = note_template {
        render_template(tmpl, context)
    } else {
        let summary_text = context.summary.as_deref().unwrap_or("No summary available");
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
                            .map_or_else(|| a.to_string(), |m| format!("[[{m}]]"));
                        format!(" ({display})")
                    })
                    .unwrap_or_default();

                let due_part = ai
                    .due_date
                    .as_deref()
                    .map(|d| format!(" [due: {d}]"))
                    .unwrap_or_default();

                format!("- [ ] {}{assignee_part}{due_part}", ai.content)
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
        message: format!("Note created: {}.md", filename),
        output: Some(path_str),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename_basic() {
        assert_eq!(sanitize_filename("My Meeting"), "My Meeting");
    }

    #[test]
    fn test_sanitize_filename_strips_invalid_chars() {
        assert_eq!(
            sanitize_filename("Q1: Review / Planning"),
            "Q1_ Review _ Planning"
        );
    }

    #[test]
    fn test_sanitize_filename_all_special() {
        assert_eq!(
            sanitize_filename("a\\b:c*d?e\"f<g>h|i"),
            "a_b_c_d_e_f_g_h_i"
        );
    }

    #[test]
    fn test_sanitize_filename_empty() {
        assert_eq!(sanitize_filename(""), "untitled");
    }

    #[test]
    fn test_sanitize_filename_dots() {
        assert_eq!(sanitize_filename("."), "untitled");
        assert_eq!(sanitize_filename(".."), "untitled");
    }

    #[tokio::test]
    async fn test_execute_obsidian_creates_file() {
        let tmp = tempfile::tempdir().unwrap();
        let vault_path = tmp.path().to_str().unwrap();

        let integration = crate::db::Integration {
            id: "int-1".to_string(),
            integration_type: "obsidian".to_string(),
            name: "Obsidian".to_string(),
            credentials_json: serde_json::json!({
                "vault_path": vault_path,
                "speaker_map": { "Speaker 1": "Michelle Mayes" }
            })
            .to_string(),
            created_at: "2026-03-07".to_string(),
        };

        let workflow = crate::db::Workflow {
            id: "wf-1".to_string(),
            name: "Export to Obsidian".to_string(),
            description: None,
            icon: None,
            integration_id: "int-1".to_string(),
            action_type: "create_note".to_string(),
            config_json: serde_json::json!({
                "subfolder": "Meetings"
            })
            .to_string(),
            is_enabled: true,
            created_at: "2026-03-07".to_string(),
        };

        let context = WorkflowContext {
            meeting_title: "Weekly Standup".to_string(),
            meeting_date: "2026-03-07T10:00:00".to_string(),
            summary: Some("Discussed Q1 roadmap. Speaker 1 will lead the effort.".to_string()),
            template_summary: None,
            action_items: vec![ActionItemContext {
                content: "Review PR #42".to_string(),
                assignee: Some("Speaker 1".to_string()),
                due_date: Some("2026-03-10".to_string()),
                context: None,
            }],
        };

        let result = execute_obsidian(&workflow, &integration, &context)
            .await
            .unwrap();
        assert!(result.message.contains("Note created"));

        let file_path = tmp
            .path()
            .join("Meetings")
            .join("2026-03-07 - Weekly Standup.md");
        assert!(file_path.exists(), "File should exist at {:?}", file_path);

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("date: 2026-03-07"));
        assert!(content.contains("title: \"Weekly Standup\""));
        assert!(content.contains("[[Michelle Mayes]]"));
        assert!(content.contains("- [ ] Review PR #42"));
        assert!(content.contains("[due: 2026-03-10]"));
    }

    #[tokio::test]
    async fn test_execute_obsidian_deduplicates_filename() {
        let tmp = tempfile::tempdir().unwrap();
        let vault_path = tmp.path().to_str().unwrap();
        let meetings_dir = tmp.path().join("Meetings");
        std::fs::create_dir_all(&meetings_dir).unwrap();
        std::fs::write(meetings_dir.join("2026-03-07 - Standup.md"), "existing").unwrap();

        let integration = crate::db::Integration {
            id: "int-1".to_string(),
            integration_type: "obsidian".to_string(),
            name: "Obsidian".to_string(),
            credentials_json: serde_json::json!({ "vault_path": vault_path }).to_string(),
            created_at: "2026-03-07".to_string(),
        };

        let workflow = crate::db::Workflow {
            id: "wf-1".to_string(),
            name: "Export".to_string(),
            description: None,
            icon: None,
            integration_id: "int-1".to_string(),
            action_type: "create_note".to_string(),
            config_json: serde_json::json!({ "subfolder": "Meetings" }).to_string(),
            is_enabled: true,
            created_at: "2026-03-07".to_string(),
        };

        let context = WorkflowContext {
            meeting_title: "Standup".to_string(),
            meeting_date: "2026-03-07".to_string(),
            summary: Some("Summary".to_string()),
            template_summary: None,
            action_items: vec![],
        };

        let result = execute_obsidian(&workflow, &integration, &context)
            .await
            .unwrap();
        assert!(result.output.unwrap().contains("(2)"));
    }
}
