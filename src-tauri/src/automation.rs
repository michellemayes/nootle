//! Write access to Nootle's automations — integrations, workflows, summary
//! templates, and insight types — for agents driving Nootle through
//! `nootle-cli` or the MCP server.
//!
//! The app UI builds valid config from forms; agents send free-form JSON. So
//! everything here is validated against [`CATALOG`], which mirrors
//! `src/lib/integrations.ts`, and errors say what's allowed so an agent can
//! correct itself. Credentials are write-only: nothing here returns them.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::db::{
    Database, InsightType, Integration, NewTemplate, Template, UpdateTemplate, Workflow,
};
use crate::error::{NootleError, Result};

#[derive(Debug, Serialize)]
pub struct FieldSpec {
    pub key: &'static str,
    pub description: &'static str,
    pub required: bool,
}

#[derive(Debug, Serialize)]
pub struct ActionSpec {
    pub action_type: &'static str,
    pub description: &'static str,
    pub config_fields: &'static [FieldSpec],
}

#[derive(Debug, Serialize)]
pub struct IntegrationSpec {
    pub integration_type: &'static str,
    pub name: &'static str,
    pub credential_fields: &'static [FieldSpec],
    pub actions: &'static [ActionSpec],
}

const fn field(key: &'static str, description: &'static str, required: bool) -> FieldSpec {
    FieldSpec {
        key,
        description,
        required,
    }
}

const TEMPLATE_ID: FieldSpec = field(
    "template_id",
    "ID of a summary template whose output fills {{template_summary}}; generated on demand if the meeting lacks it",
    false,
);
const DESCRIPTION_PROMPT: FieldSpec = field(
    "description_prompt",
    "Instructions for an LLM to write each item's description; plain text is used when unset",
    false,
);

/// Placeholders the text fields of a workflow config can use.
pub const PLACEHOLDERS: &[&str] = &[
    "{{title}}",
    "{{date}}",
    "{{summary}}",
    "{{template_summary}}",
    "{{action_items}}",
];

/// Icons an insight type can use; mirrors `src/lib/insightIcons.ts`.
pub const INSIGHT_ICONS: &[&str] = &[
    "lightbulb",
    "list-checks",
    "star",
    "alert-triangle",
    "target",
    "calendar-clock",
    "message-square",
    "help-circle",
];

pub const CATALOG: &[IntegrationSpec] = &[
    IntegrationSpec {
        integration_type: "slack",
        name: "Slack",
        credential_fields: &[field("bot_token", "Bot token (xoxb-...)", true)],
        actions: &[ActionSpec {
            action_type: "post_summary",
            description: "Post the meeting summary to a channel",
            config_fields: &[
                field("channel", "Channel name or ID, e.g. #general", true),
                TEMPLATE_ID,
                field(
                    "message_template",
                    "Message text; supports placeholders",
                    false,
                ),
            ],
        }],
    },
    IntegrationSpec {
        integration_type: "notion",
        name: "Notion",
        credential_fields: &[field("api_key", "Integration secret (secret_...)", true)],
        actions: &[ActionSpec {
            action_type: "create_page",
            description: "Create a page in a Notion database",
            config_fields: &[
                field("database_id", "Notion database ID", true),
                TEMPLATE_ID,
            ],
        }],
    },
    IntegrationSpec {
        integration_type: "confluence",
        name: "Confluence",
        credential_fields: &[
            field("email", "Atlassian account email", true),
            field("api_token", "Atlassian API token", true),
            field("base_url", "e.g. https://your-domain.atlassian.net", true),
        ],
        actions: &[ActionSpec {
            action_type: "create_page",
            description: "Create a page in a Confluence space",
            config_fields: &[field("space_key", "Space key, e.g. ENG", true), TEMPLATE_ID],
        }],
    },
    IntegrationSpec {
        integration_type: "github",
        name: "GitHub",
        credential_fields: &[field("token", "Personal access token (ghp_...)", true)],
        actions: &[ActionSpec {
            action_type: "create_issues",
            description: "Open one issue per action item",
            config_fields: &[field("repo", "owner/repo", true), DESCRIPTION_PROMPT],
        }],
    },
    IntegrationSpec {
        integration_type: "linear",
        name: "Linear",
        credential_fields: &[field("api_key", "Personal API key (lin_api_...)", true)],
        actions: &[ActionSpec {
            action_type: "create_issues",
            description: "Open one issue per action item",
            config_fields: &[
                field("team_id", "Linear team ID", true),
                field("project_id", "Linear project ID", false),
                DESCRIPTION_PROMPT,
            ],
        }],
    },
    IntegrationSpec {
        integration_type: "asana",
        name: "Asana",
        credential_fields: &[field("token", "Personal access token", true)],
        actions: &[ActionSpec {
            action_type: "create_tasks",
            description: "Create one task per action item",
            config_fields: &[
                field("project_id", "Asana project ID", true),
                DESCRIPTION_PROMPT,
            ],
        }],
    },
    IntegrationSpec {
        integration_type: "email",
        name: "Email",
        credential_fields: &[],
        actions: &[ActionSpec {
            action_type: "generate_draft",
            description: "Generate an email draft (subject and body) for the user to send",
            config_fields: &[
                field("subject", "Subject line; supports placeholders", false),
                TEMPLATE_ID,
                field("body", "Body text; supports placeholders", false),
            ],
        }],
    },
    IntegrationSpec {
        integration_type: "obsidian",
        name: "Obsidian",
        credential_fields: &[field("vault_path", "Absolute path to the vault", true)],
        actions: &[ActionSpec {
            action_type: "create_note",
            description: "Write a Markdown note into the vault",
            config_fields: &[
                field("subfolder", "Folder inside the vault, e.g. Meetings", true),
                TEMPLATE_ID,
                field(
                    "filename_template",
                    "Defaults to {{date}} - {{title}}",
                    false,
                ),
                field("note_template", "Note body; supports placeholders", false),
            ],
        }],
    },
];

/// Everything an agent needs to build valid automations, as one JSON value.
pub fn catalog() -> Value {
    serde_json::json!({
        "integrations": CATALOG,
        "placeholders": PLACEHOLDERS,
        "insight_icons": INSIGHT_ICONS,
    })
}

fn invalid(msg: impl Into<String>) -> NootleError {
    NootleError::Other(msg.into())
}

fn integration_spec(integration_type: &str) -> Result<&'static IntegrationSpec> {
    CATALOG
        .iter()
        .find(|s| s.integration_type == integration_type)
        .ok_or_else(|| {
            let known: Vec<_> = CATALOG.iter().map(|s| s.integration_type).collect();
            invalid(format!(
                "Unknown integration type '{integration_type}'. Expected one of: {}",
                known.join(", ")
            ))
        })
}

fn action_spec(
    spec: &'static IntegrationSpec,
    action_type: Option<&str>,
) -> Result<&'static ActionSpec> {
    let known = || {
        spec.actions
            .iter()
            .map(|a| a.action_type)
            .collect::<Vec<_>>()
            .join(", ")
    };
    match action_type {
        Some(a) => spec
            .actions
            .iter()
            .find(|s| s.action_type == a)
            .ok_or_else(|| {
                invalid(format!(
                    "{} doesn't support action '{a}'. Expected one of: {}",
                    spec.name,
                    known()
                ))
            }),
        None => match spec.actions {
            [only] => Ok(only),
            _ => Err(invalid(format!(
                "Specify an action for {}: {}",
                spec.name,
                known()
            ))),
        },
    }
}

/// Checks `value` is an object of string fields matching `fields`, and returns
/// it with blank optional fields dropped.
fn validate_fields(fields: &[FieldSpec], value: &Value, what: &str) -> Result<Map<String, Value>> {
    let obj = match value {
        Value::Null => return validate_fields(fields, &Value::Object(Map::new()), what),
        Value::Object(obj) => obj,
        _ => return Err(invalid(format!("{what} must be a JSON object"))),
    };
    let allowed = || fields.iter().map(|f| f.key).collect::<Vec<_>>().join(", ");

    let mut out = Map::new();
    for (key, v) in obj {
        if !fields.iter().any(|f| f.key == key) {
            return Err(invalid(format!(
                "Unknown {what} field '{key}'. Allowed: {}",
                if fields.is_empty() {
                    "none".to_string()
                } else {
                    allowed()
                }
            )));
        }
        let s = v
            .as_str()
            .ok_or_else(|| invalid(format!("{what} field '{key}' must be a string")))?;
        if !s.trim().is_empty() {
            out.insert(key.clone(), Value::String(s.to_string()));
        }
    }
    for f in fields.iter().filter(|f| f.required) {
        if !out.contains_key(f.key) {
            return Err(invalid(format!(
                "Missing required {what} field '{}' ({})",
                f.key, f.description
            )));
        }
    }
    Ok(out)
}

fn validate_workflow_config(db: &Database, action: &ActionSpec, config: &Value) -> Result<String> {
    let config = validate_fields(action.config_fields, config, "config")?;
    if let Some(template_id) = config.get("template_id").and_then(Value::as_str) {
        db.get_template(template_id)?;
    }
    Ok(Value::Object(config).to_string())
}

fn non_empty(s: Option<&str>) -> Option<&str> {
    s.map(str::trim).filter(|s| !s.is_empty())
}

fn require_name(name: &str, what: &str) -> Result<()> {
    if name.trim().is_empty() {
        return Err(invalid(format!("{what} name can't be empty")));
    }
    Ok(())
}

// --- Integrations ---

pub fn create_integration(
    db: &Database,
    integration_type: &str,
    name: Option<&str>,
    credentials: &Value,
) -> Result<Integration> {
    let spec = integration_spec(integration_type)?;
    let creds = validate_fields(spec.credential_fields, credentials, "credentials")?;
    let name = non_empty(name).unwrap_or(spec.name);
    let integration =
        db.create_integration(integration_type, name, &Value::Object(creds).to_string())?;
    Ok(redact(integration))
}

/// Renames an integration and/or replaces its credentials. Credentials are
/// replaced as a whole, so pass every field.
pub fn update_integration(
    db: &Database,
    id: &str,
    name: Option<&str>,
    credentials: Option<&Value>,
) -> Result<Integration> {
    let existing = db.get_integration(id)?;
    let credentials_json = match credentials {
        Some(c) => {
            let spec = integration_spec(&existing.integration_type)?;
            Value::Object(validate_fields(spec.credential_fields, c, "credentials")?).to_string()
        }
        None => existing.credentials_json,
    };
    let name = non_empty(name).unwrap_or(&existing.name);
    Ok(redact(db.update_integration(
        id,
        name,
        &credentials_json,
    )?))
}

fn redact(mut integration: Integration) -> Integration {
    integration.credentials_json = String::new();
    integration
}

// --- Workflows ---

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NewWorkflowInput {
    /// Display name, e.g. "Post standup notes to #eng"
    pub name: String,
    /// Optional one-line description
    #[serde(default)]
    pub description: Option<String>,
    /// Optional emoji shown next to the workflow
    #[serde(default)]
    pub icon: Option<String>,
    /// ID of the connected integration this workflow sends to
    pub integration_id: String,
    /// Action to perform. Optional when the integration supports only one.
    #[serde(default)]
    pub action_type: Option<String>,
    /// Action config: an object of string fields. See the automation catalog
    /// for each action's fields.
    #[serde(default)]
    pub config: Value,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct WorkflowPatch {
    /// New display name
    #[serde(default)]
    pub name: Option<String>,
    /// New description; an empty string clears it
    #[serde(default)]
    pub description: Option<String>,
    /// New emoji; an empty string clears it
    #[serde(default)]
    pub icon: Option<String>,
    /// Move the workflow to another integration
    #[serde(default)]
    pub integration_id: Option<String>,
    /// New action type
    #[serde(default)]
    pub action_type: Option<String>,
    /// Replacement config (replaces the whole object, not merged)
    #[serde(default)]
    pub config: Option<Value>,
    /// Enable or disable the workflow. Disabled workflows are hidden from the
    /// meeting's Run menu.
    #[serde(default)]
    pub enabled: Option<bool>,
}

pub fn create_workflow(db: &Database, input: &NewWorkflowInput) -> Result<Workflow> {
    require_name(&input.name, "Workflow")?;
    let integration = db.get_integration(&input.integration_id)?;
    let spec = integration_spec(&integration.integration_type)?;
    let action = action_spec(spec, input.action_type.as_deref())?;
    let config_json = validate_workflow_config(db, action, &input.config)?;
    db.create_workflow(
        input.name.trim(),
        non_empty(input.description.as_deref()),
        non_empty(input.icon.as_deref()),
        &integration.id,
        action.action_type,
        &config_json,
    )
}

pub fn update_workflow(db: &Database, id: &str, patch: &WorkflowPatch) -> Result<Workflow> {
    let existing = db.get_workflow(id)?;
    if let Some(name) = &patch.name {
        require_name(name, "Workflow")?;
    }
    let integration_id = patch
        .integration_id
        .as_deref()
        .unwrap_or(&existing.integration_id);
    let integration = db.get_integration(integration_id)?;
    let spec = integration_spec(&integration.integration_type)?;

    // Keep the current action when it still applies to the (maybe new)
    // integration; otherwise fall back to its only action.
    let action_type = patch.action_type.as_deref().or_else(|| {
        spec.actions
            .iter()
            .any(|a| a.action_type == existing.action_type)
            .then_some(existing.action_type.as_str())
    });
    let action = action_spec(spec, action_type)?;

    let existing_config: Value = serde_json::from_str(&existing.config_json).unwrap_or(Value::Null);
    let config_json = validate_workflow_config(
        db,
        action,
        patch.config.as_ref().unwrap_or(&existing_config),
    )?;

    let keep_or_clear = |patch: &Option<String>, current: &Option<String>| match patch {
        Some(s) => non_empty(Some(s)).map(str::to_string),
        None => current.clone(),
    };
    db.update_workflow(
        id,
        patch
            .name
            .as_deref()
            .map(str::trim)
            .unwrap_or(&existing.name),
        keep_or_clear(&patch.description, &existing.description).as_deref(),
        keep_or_clear(&patch.icon, &existing.icon).as_deref(),
        &integration.id,
        action.action_type,
        &config_json,
        patch.enabled.unwrap_or(existing.is_enabled),
    )
}

// --- Summary templates ---

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NewTemplateInput {
    /// Template name, e.g. "Weekly 1:1"
    pub name: String,
    /// Short description shown in the template picker
    #[serde(default)]
    pub description: Option<String>,
    /// Section headings the summary should contain, in order
    pub sections: Vec<String>,
    /// Extra instructions for the summarizer
    #[serde(default)]
    pub prompt: Option<String>,
    /// Summarize every new meeting with this template automatically
    #[serde(default)]
    pub auto_run: bool,
    /// Pin to the top of the template picker
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct TemplatePatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Replacement section headings
    #[serde(default)]
    pub sections: Option<Vec<String>>,
    #[serde(default)]
    pub prompt: Option<String>,
    /// Summarize every new meeting with this template automatically
    #[serde(default)]
    pub auto_run: Option<bool>,
    #[serde(default)]
    pub favorite: Option<bool>,
}

fn sections_json(sections: &[String]) -> Result<String> {
    let sections: Vec<&str> = sections
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if sections.is_empty() {
        return Err(invalid("A template needs at least one section"));
    }
    Ok(serde_json::to_string(&sections)?)
}

pub fn create_template(db: &Database, input: &NewTemplateInput) -> Result<Template> {
    require_name(&input.name, "Template")?;
    db.create_template(NewTemplate {
        name: input.name.trim().to_string(),
        description: input.description.clone().unwrap_or_default(),
        sections: sections_json(&input.sections)?,
        auto_apply_rules: "{}".to_string(),
        prompt: input.prompt.clone().unwrap_or_default(),
        is_favorite: input.favorite,
        is_auto_run: input.auto_run,
    })
}

pub fn update_template(db: &Database, id: &str, patch: &TemplatePatch) -> Result<Template> {
    let existing = db.get_template(id)?;
    if let Some(name) = &patch.name {
        require_name(name, "Template")?;
    }
    db.update_template(&UpdateTemplate {
        id: existing.id,
        name: patch
            .name
            .as_deref()
            .map(str::trim)
            .unwrap_or(&existing.name)
            .to_string(),
        description: patch.description.clone().unwrap_or(existing.description),
        sections: match &patch.sections {
            Some(s) => sections_json(s)?,
            None => existing.sections,
        },
        auto_apply_rules: existing.auto_apply_rules,
        prompt: patch.prompt.clone().unwrap_or(existing.prompt),
        is_favorite: patch.favorite.unwrap_or(existing.is_favorite),
        is_auto_run: patch.auto_run.unwrap_or(existing.is_auto_run),
    })
}

// --- Insight types ---

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NewInsightTypeInput {
    /// Display name, e.g. "Risk"
    pub name: String,
    /// Stable identifier used in filters. Derived from the name when omitted.
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// What the extractor should pull out of each transcript
    pub extraction_prompt: String,
    /// One of the insight icons; defaults to "lightbulb"
    #[serde(default)]
    pub icon: Option<String>,
    /// Whether insights of this type carry assignee, due date, and status
    #[serde(default)]
    pub has_action_fields: bool,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct InsightTypePatch {
    #[serde(default)]
    pub name: Option<String>,
    /// New description; an empty string clears it
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub extraction_prompt: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub has_action_fields: Option<bool>,
}

fn validate_icon(icon: &str) -> Result<()> {
    if INSIGHT_ICONS.contains(&icon) {
        Ok(())
    } else {
        Err(invalid(format!(
            "Unknown icon '{icon}'. Expected one of: {}",
            INSIGHT_ICONS.join(", ")
        )))
    }
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

fn require_prompt(prompt: &str) -> Result<()> {
    if prompt.trim().is_empty() {
        return Err(invalid("Extraction prompt can't be empty"));
    }
    Ok(())
}

pub fn create_insight_type(db: &Database, input: &NewInsightTypeInput) -> Result<InsightType> {
    require_name(&input.name, "Insight type")?;
    require_prompt(&input.extraction_prompt)?;
    let slug = slugify(non_empty(input.slug.as_deref()).unwrap_or(&input.name));
    if slug.is_empty() {
        return Err(invalid("Slug must contain letters or digits"));
    }
    if db.list_insight_types()?.iter().any(|t| t.slug == slug) {
        return Err(invalid(format!(
            "An insight type with slug '{slug}' already exists"
        )));
    }
    let icon = non_empty(input.icon.as_deref()).unwrap_or("lightbulb");
    validate_icon(icon)?;
    db.create_insight_type(
        input.name.trim(),
        &slug,
        non_empty(input.description.as_deref()),
        &input.extraction_prompt,
        icon,
        input.has_action_fields,
    )
}

pub fn update_insight_type(
    db: &Database,
    id: &str,
    patch: &InsightTypePatch,
) -> Result<InsightType> {
    let existing = db
        .list_insight_types()?
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| invalid(format!("Insight type not found: {id}")))?;
    if let Some(name) = &patch.name {
        require_name(name, "Insight type")?;
    }
    if let Some(prompt) = &patch.extraction_prompt {
        require_prompt(prompt)?;
    }
    if let Some(icon) = &patch.icon {
        validate_icon(icon)?;
    }
    let description = match &patch.description {
        Some(d) => non_empty(Some(d)).map(str::to_string),
        None => existing.description,
    };
    db.update_insight_type(
        id,
        patch
            .name
            .as_deref()
            .map(str::trim)
            .unwrap_or(&existing.name),
        description.as_deref(),
        patch
            .extraction_prompt
            .as_deref()
            .unwrap_or(&existing.extraction_prompt),
        patch.icon.as_deref().unwrap_or(&existing.icon),
        patch
            .has_action_fields
            .unwrap_or(existing.has_action_fields),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn db() -> Database {
        Database::new_in_memory().unwrap()
    }

    #[test]
    fn catalog_matches_executor() {
        // Every integration type in the catalog must be one execute_workflow knows.
        let known = [
            "email",
            "slack",
            "notion",
            "confluence",
            "github",
            "linear",
            "asana",
            "obsidian",
        ];
        for spec in CATALOG {
            assert!(
                known.contains(&spec.integration_type),
                "{}",
                spec.integration_type
            );
            assert!(!spec.actions.is_empty());
        }
    }

    #[test]
    fn integration_credentials_are_validated_and_redacted() {
        let db = db();
        let err = create_integration(&db, "slack", None, &json!({})).unwrap_err();
        assert!(err.to_string().contains("bot_token"));
        let err = create_integration(&db, "slack", None, &json!({"bot_token": "x", "nope": "y"}))
            .unwrap_err();
        assert!(err.to_string().contains("Unknown credentials field 'nope'"));
        assert!(create_integration(&db, "fax", None, &json!({})).is_err());

        let created =
            create_integration(&db, "slack", None, &json!({"bot_token": "xoxb-1"})).unwrap();
        assert_eq!(created.name, "Slack");
        assert!(created.credentials_json.is_empty());
        assert!(db
            .get_integration(&created.id)
            .unwrap()
            .credentials_json
            .contains("xoxb-1"));

        let renamed = update_integration(&db, &created.id, Some("Work Slack"), None).unwrap();
        assert_eq!(renamed.name, "Work Slack");
        assert!(db
            .get_integration(&created.id)
            .unwrap()
            .credentials_json
            .contains("xoxb-1"));
    }

    #[test]
    fn email_needs_no_credentials() {
        let db = db();
        assert!(create_integration(&db, "email", None, &Value::Null).is_ok());
    }

    #[test]
    fn workflow_lifecycle() {
        let db = db();
        let slack = create_integration(&db, "slack", None, &json!({"bot_token": "t"})).unwrap();

        let missing = NewWorkflowInput {
            name: "Standup".into(),
            description: None,
            icon: None,
            integration_id: slack.id.clone(),
            action_type: None,
            config: json!({}),
        };
        assert!(create_workflow(&db, &missing)
            .unwrap_err()
            .to_string()
            .contains("channel"));

        let bad_template = NewWorkflowInput {
            config: json!({"channel": "#eng", "template_id": "nope"}),
            ..missing
        };
        assert!(create_workflow(&db, &bad_template).is_err());

        let wf = create_workflow(
            &db,
            &NewWorkflowInput {
                config: json!({"channel": "#eng", "message_template": ""}),
                ..bad_template
            },
        )
        .unwrap();
        assert_eq!(wf.action_type, "post_summary");
        assert_eq!(wf.config_json, r##"{"channel":"#eng"}"##);
        assert!(wf.is_enabled);

        let disabled = update_workflow(
            &db,
            &wf.id,
            &WorkflowPatch {
                enabled: Some(false),
                description: Some("Daily".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!disabled.is_enabled);
        assert_eq!(disabled.description.as_deref(), Some("Daily"));
        assert_eq!(disabled.config_json, wf.config_json);

        // The old Slack config doesn't fit GitHub, so moving needs a new one.
        let github = create_integration(&db, "github", None, &json!({"token": "t"})).unwrap();
        let moved = WorkflowPatch {
            integration_id: Some(github.id.clone()),
            ..Default::default()
        };
        assert!(update_workflow(&db, &wf.id, &moved)
            .unwrap_err()
            .to_string()
            .contains("channel"));
        let moved = update_workflow(
            &db,
            &wf.id,
            &WorkflowPatch {
                config: Some(json!({"repo": "acme/app"})),
                ..moved
            },
        )
        .unwrap();
        assert_eq!(moved.action_type, "create_issues");
        assert_eq!(moved.integration_id, github.id);
    }

    #[test]
    fn template_lifecycle() {
        let db = db();
        let input = NewTemplateInput {
            name: "1:1".into(),
            description: None,
            sections: vec!["Wins".into(), " ".into(), "Blockers".into()],
            prompt: None,
            auto_run: true,
            favorite: false,
        };
        let t = create_template(&db, &input).unwrap();
        assert_eq!(t.sections, r#"["Wins","Blockers"]"#);
        assert!(t.is_auto_run);

        let t = update_template(
            &db,
            &t.id,
            &TemplatePatch {
                auto_run: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!t.is_auto_run);
        assert_eq!(t.name, "1:1");

        let empty = NewTemplateInput {
            sections: vec![],
            ..input
        };
        assert!(create_template(&db, &empty).is_err());
    }

    #[test]
    fn insight_type_lifecycle() {
        let db = db();
        let input = NewInsightTypeInput {
            name: "Open Risk".into(),
            slug: None,
            description: None,
            extraction_prompt: "Risks raised".into(),
            icon: None,
            has_action_fields: false,
        };
        let t = create_insight_type(&db, &input).unwrap();
        assert_eq!(t.slug, "open_risk");
        assert_eq!(t.icon, "lightbulb");
        assert!(create_insight_type(&db, &input)
            .unwrap_err()
            .to_string()
            .contains("already exists"));

        let bad_icon = InsightTypePatch {
            icon: Some("rocket".into()),
            ..Default::default()
        };
        assert!(update_insight_type(&db, &t.id, &bad_icon).is_err());
        let t = update_insight_type(
            &db,
            &t.id,
            &InsightTypePatch {
                icon: Some("target".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(t.icon, "target");
        assert_eq!(t.extraction_prompt, "Risks raised");
    }
}
