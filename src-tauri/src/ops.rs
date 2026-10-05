//! Operations shared by the app's commands, `nootle-cli`, and the MCP server,
//! so each surface does the same thing: the same cleanup on delete, the same
//! re-indexing after a speaker rename, the same prompts for LLM features.
//! Nothing here needs a running app; callers emit any UI events themselves.

use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};

use crate::db::{Database, NewRecipe};
use crate::embedding::EmbeddingEngine;
use crate::llm::{ChatMessage, LlmRegistry, ModelInfo};

/// Where recordings and imported audio live.
pub fn recordings_dir() -> Result<std::path::PathBuf> {
    Ok(dirs::data_dir()
        .context("Could not determine data directory")?
        .join("Nootle")
        .join("recordings"))
}

/// Deletes a meeting with its search index, audio file, and snapshots.
pub fn delete_meeting(db: &Database, id: &str) -> Result<()> {
    let audio_path = db.get_meeting(id).ok().and_then(|m| m.audio_path);
    // vec0 embeddings don't cascade.
    let _ = db.delete_meeting_chunks(id);
    db.delete_meeting(id)?;
    if let Some(path) = audio_path {
        let _ = std::fs::remove_file(path);
    }
    if let Ok(dir) = recordings_dir() {
        let _ = std::fs::remove_dir_all(crate::snapshots::dir_for(&dir, id));
    }
    Ok(())
}

pub const MEETING_STATUSES: &[&str] = &["recording", "transcribing", "summarized", "archived"];
pub const ACTION_ITEM_STATUSES: &[&str] = &["open", "done", "cancelled"];
pub const RECIPE_FORMATS: &[&str] = &["markdown", "plain", "json"];
/// Providers whose API keys can be stored.
pub const API_KEY_PROVIDERS: &[&str] = &[
    "openai",
    "anthropic",
    "google",
    "groq",
    "openrouter",
    "bedrock",
    "codex",
    "claude-agent",
    "linear",
    "asana",
];
/// The provider automatic work (titles, summaries, insights) uses; empty or
/// unset means the first available.
pub const SUMMARIZATION_PROVIDER_SETTING: &str = "summarization_provider";
/// On/off settings the app's settings screen changes.
pub const TOGGLE_SETTINGS: &[&str] = &[
    "denoise_enabled",
    "detection_enabled",
    crate::remote::ENABLED_SETTING,
    crate::dictionary::AUTO_LEARN_SETTING,
];
/// Settings the CLI and MCP server can read and change.
pub const EDITABLE_SETTINGS: &[&str] = &[
    "denoise_enabled",
    "detection_enabled",
    crate::remote::ENABLED_SETTING,
    crate::dictionary::AUTO_LEARN_SETTING,
    SUMMARIZATION_PROVIDER_SETTING,
];

pub fn validate_one_of(what: &str, value: &str, allowed: &[&str]) -> Result<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(anyhow!(
            "Invalid {what} '{value}'. Allowed: {}",
            allowed.join(", ")
        ))
    }
}

pub fn validate_hex_color(color: &str) -> Result<()> {
    let hex = color.strip_prefix('#').unwrap_or_default();
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(anyhow!(
            "Invalid color '{color}': use a hex color like #4f46e5"
        ))
    }
}

/// Checks a setting the CLI or MCP server may change: a toggle takes "true"
/// or "false", and the summarization provider any name ("" for automatic).
pub fn validate_setting(key: &str, value: &str) -> Result<()> {
    validate_one_of("setting", key, EDITABLE_SETTINGS)?;
    if key == SUMMARIZATION_PROVIDER_SETTING {
        return Ok(());
    }
    validate_one_of("value", value, &["true", "false"])
}

/// Checks a recipe the way the app's editor does, including that no other
/// recipe than `id` uses its slash command.
pub fn validate_recipe(db: &Database, recipe: &NewRecipe, id: Option<&str>) -> Result<()> {
    if recipe.name.trim().is_empty() || recipe.prompt_template.trim().is_empty() {
        return Err(anyhow!("A recipe needs a name and a prompt"));
    }
    let command = &recipe.slash_command;
    if command.is_empty()
        || !command
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(anyhow!(
            "Invalid command '{command}': use only letters, numbers, and hyphens"
        ));
    }
    validate_one_of("format", &recipe.output_format, RECIPE_FORMATS)?;
    match db.get_recipe_by_command(command) {
        Ok(other) if Some(other.id.as_str()) != id => {
            Err(anyhow!("Recipe '{}' already uses /{command}", other.name))
        }
        _ => Ok(()),
    }
}

/// Loads the embedding model that asking across meetings and the search
/// index need, or explains how to get it.
pub fn load_embedding_engine() -> Result<EmbeddingEngine> {
    if !EmbeddingEngine::is_available() {
        return Err(anyhow!(
            "The search model isn't downloaded. Download it in Nootle under Settings → Models, \
             then try again."
        ));
    }
    EmbeddingEngine::load()
}

/// Recomputes speaker analytics and engagement from the stored transcript.
pub fn refresh_analytics(db: &Database, meeting_id: &str) -> Result<()> {
    let speaker_analytics = crate::analytics::compute_speaker_analytics(db, meeting_id)?;
    db.save_speaker_analytics(meeting_id, &speaker_analytics)?;
    let texts: Vec<String> = db
        .get_transcript(meeting_id)?
        .into_iter()
        .map(|t| t.text)
        .collect();
    let engagement = crate::analytics::compute_engagement(meeting_id, &speaker_analytics, &texts);
    db.save_engagement(&engagement)?;
    Ok(())
}

/// Renames a speaker throughout a meeting ("Speaker 2" → "Priya"), or merges
/// two speakers by renaming one onto the other, then rebuilds analytics and,
/// when an embedding engine is loaded, the search index so they show the new
/// name. Returns how many segments changed.
pub fn rename_speaker(
    db: &Database,
    engine: Option<&mut EmbeddingEngine>,
    meeting_id: &str,
    from: &str,
    to: &str,
) -> Result<usize> {
    let to = to.trim();
    if to.is_empty() {
        return Err(anyhow!("Speaker name can't be empty"));
    }
    let changed = db.rename_speaker(meeting_id, from, to)?;
    if let Err(e) = refresh_analytics(db, meeting_id) {
        tracing::warn!("Failed to compute analytics for {meeting_id}: {e}");
    }
    if let Some(engine) = engine {
        if let Err(e) = crate::chunking::reindex_meeting(db, engine, meeting_id) {
            tracing::warn!("Failed to re-index meeting {meeting_id} after rename: {e}");
        }
    }
    Ok(changed)
}

/// The model for automatic post-recording LLM work (title, summaries,
/// insights). Honours an explicit choice before falling back to registration
/// order. Order is a fragile default: which provider summarises your meetings
/// then depends on which ones happen to be installed, and standing up a new
/// one silently moves your transcripts to a different vendor. Set
/// `summarization_provider` to pin it.
pub fn pick_auto_model(db: &Database, llm: &LlmRegistry) -> Option<ModelInfo> {
    let preferred = db.get_setting("summarization_provider").unwrap_or(None);
    let models = llm.all_models();
    preferred
        .and_then(|p| models.iter().find(|m| m.provider == p).cloned())
        .or_else(|| models.into_iter().next())
}

/// The provider and model to use when a CLI or MCP caller may name either,
/// both, or neither: a named provider's first model, else the same model
/// automatic work uses.
pub fn resolve_model(
    db: &Database,
    llm: &LlmRegistry,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<(String, String)> {
    let available = || match llm.provider_names() {
        names if names.is_empty() => "none".to_string(),
        names => names.join(", "),
    };
    let info = match provider {
        Some(p) => llm
            .all_models()
            .into_iter()
            .find(|m| m.provider == p)
            .ok_or_else(|| anyhow!("Provider '{p}' isn't available. Available: {}", available()))?,
        None => pick_auto_model(db, llm).ok_or_else(|| {
            anyhow!(
                "No LLM provider available. Add an API key in Nootle's settings, install the \
                 Claude or Codex CLI, or run Ollama."
            )
        })?,
    };
    Ok((info.provider, model.map(str::to_string).unwrap_or(info.id)))
}

async fn chat(
    llm: &LlmRegistry,
    provider: &str,
    model: &str,
    messages: Vec<ChatMessage>,
) -> Result<String> {
    llm.get_provider(provider)
        .ok_or_else(|| anyhow!("Provider '{provider}' not found"))?
        .chat(messages, model)
        .await
}

/// Merges a meeting's notes with details from its transcript and saves the
/// result as the meeting's enriched notes.
pub async fn enrich_notes(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
) -> Result<String> {
    let meeting = db.get_meeting(meeting_id)?;
    let raw_notes = meeting
        .raw_notes
        .filter(|n| !n.trim().is_empty())
        .ok_or_else(|| anyhow!("No notes to enrich"))?;

    let transcript_text = db
        .get_transcript(meeting_id)?
        .iter()
        .map(|s| format!("{}: {}", s.speaker_label, s.text))
        .collect::<Vec<_>>()
        .join("\n")
        + &crate::snapshots::context_section(db, meeting_id);

    let system_prompt = format!(
        "You are enriching meeting notes using the full transcript into a single merged document. \
         Output in markdown format. Keep the user's original notes as the backbone structure. \
         Wrap the user's original note content in [[highlight]]...[[/highlight]] markers so it stands out. \
         Expand each note point with details, context, and supporting information from the transcript. \
         The result should read as one cohesive document — not two separate sections. \
         Maintain the same topic order as the original notes.\n\n\
         TRANSCRIPT:\n{}\n\n\
         USER'S NOTES:\n{}{}",
        transcript_text,
        raw_notes,
        crate::dictionary::glossary(db)
    );
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system_prompt,
        },
        ChatMessage {
            role: "user".into(),
            content: "Enrich my notes into a single merged markdown document. Highlight my original notes with [[highlight]]...[[/highlight]] markers and weave in transcript details around them.".into(),
        },
    ];

    let enriched = chat(llm, provider, model, messages).await?;
    db.update_meeting_enriched_notes(meeting_id, &enriched)?;
    Ok(enriched)
}

/// Filters for questions asked across all meetings.
#[derive(Debug, Default)]
pub struct AskFilters {
    pub label_ids: Vec<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

/// Embeds a question for `rag_chat`. Separate so callers sharing an engine
/// can release it before the slow LLM call.
pub fn embed_question(engine: &mut EmbeddingEngine, message: &str) -> Result<Vec<f32>> {
    engine.embed(message).context("Failed to embed query")
}

/// Answers a question from the most relevant transcript passages across all
/// meetings, given the question's embedding from `embed_question`. Returns
/// the answer and the passages it drew on.
#[allow(clippy::too_many_arguments)]
pub async fn rag_chat(
    db: &Database,
    llm: &LlmRegistry,
    query_embedding: &[f32],
    message: &str,
    history: Vec<ChatMessage>,
    provider: &str,
    model: &str,
    filters: &AskFilters,
) -> Result<(String, Vec<Value>)> {
    let results = db.search_similar_chunks(
        query_embedding,
        10,
        &filters.label_ids,
        filters.date_from.as_deref(),
        filters.date_to.as_deref(),
    )?;

    if results.is_empty() {
        return Ok((
            "I couldn't find any relevant transcript passages for your question. Try adjusting your filters or asking a different question.".into(),
            Vec::new(),
        ));
    }

    let mut context_parts = Vec::new();
    let mut sources = Vec::new();
    for result in &results {
        let timestamp = crate::summarization::format_ms(result.start_ms);
        context_parts.push(format!(
            "---\n[Meeting: \"{}\", {}]\n{}\n",
            result.meeting_title, timestamp, result.chunk_text
        ));
        sources.push(json!({
            "meeting_id": result.meeting_id,
            "meeting_title": result.meeting_title,
            "start_ms": result.start_ms,
            "end_ms": result.end_ms,
        }));
    }

    let system_prompt = format!(
        "You are Nootle, an AI assistant that answers questions about the user's meetings.\n\n\
         Below are relevant excerpts from the user's meeting transcripts. Each excerpt \
         includes the meeting title and timestamp. Use ONLY these excerpts to answer.\n\
         When you reference information, cite the source as [Meeting Title, timestamp].\n\n\
         {}\n\
         Answer the user's question based on these excerpts. Be concise.{}",
        context_parts.join("\n"),
        crate::dictionary::glossary(db)
    );

    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: system_prompt,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".into(),
        content: message.to_string(),
    });

    Ok((chat(llm, provider, model, messages).await?, sources))
}

pub(crate) fn truncate_at_word_boundary(text: &str, max_chars: usize, suffix: &str) -> String {
    if text.chars().count() <= max_chars {
        return text.trim().to_string();
    }
    let prefix: String = text.chars().take(max_chars).collect();
    match prefix.rfind(' ') {
        Some(pos) => format!("{}{suffix}", &prefix[..pos]),
        None => format!("{prefix}{suffix}"),
    }
}

/// Asks a question in a saved conversation (the app's Ask view): stores the
/// question and answer, and titles the conversation after its first message.
/// Returns `{"response", "sources"}`.
#[allow(clippy::too_many_arguments)]
pub async fn send_chat_message(
    db: &Database,
    llm: &LlmRegistry,
    query_embedding: &[f32],
    conversation_id: &str,
    message: &str,
    provider: &str,
    model: &str,
    filters: &AskFilters,
) -> Result<Value> {
    db.create_chat_message(conversation_id, "user", message, None)?;
    let db_messages = db.list_chat_messages(conversation_id)?;

    // History for the LLM, without the question just saved: rag_chat appends it.
    let history: Vec<ChatMessage> = db_messages[..db_messages.len().saturating_sub(1)]
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    let (response, sources) = rag_chat(
        db,
        llm,
        query_embedding,
        message,
        history,
        provider,
        model,
        filters,
    )
    .await?;

    let sources_json = serde_json::to_string(&sources).ok();
    db.create_chat_message(
        conversation_id,
        "assistant",
        &response,
        sources_json.as_deref(),
    )?;

    if db_messages.len() <= 1 {
        let fallback = if message.chars().count() > 50 {
            truncate_at_word_boundary(message, 47, "...")
        } else {
            message.to_string()
        };
        let prompt = format!(
            "Generate a short title (max 6 words) for a conversation that starts with this message. \
             Return ONLY the title, nothing else. No quotes, no punctuation at the end.\n\n{message}"
        );
        let title_messages = vec![ChatMessage {
            role: "user".into(),
            content: prompt,
        }];
        let title = match chat(llm, provider, model, title_messages).await {
            Ok(resp) => {
                let t = resp.trim().trim_matches('"').trim().to_string();
                if t.is_empty() || t.len() > 100 {
                    fallback
                } else {
                    t
                }
            }
            Err(_) => fallback,
        };
        let _ = db.update_chat_conversation_title(conversation_id, &title);
    }

    db.touch_chat_conversation(conversation_id)?;

    Ok(json!({ "response": response, "sources": sources }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_recipes_like_the_app() {
        let db = Database::new_in_memory().unwrap();
        let recipe = |command: &str, format: &str| NewRecipe {
            name: "Brief".into(),
            description: String::new(),
            slash_command: command.into(),
            prompt_template: "Summarize {{transcript}}".into(),
            output_format: format.into(),
        };
        assert!(validate_recipe(&db, &recipe("brief-2", "markdown"), None).is_ok());
        assert!(validate_recipe(&db, &recipe("has space", "markdown"), None).is_err());
        assert!(validate_recipe(&db, &recipe("", "markdown"), None).is_err());
        assert!(validate_recipe(&db, &recipe("brief", "html"), None).is_err());

        let saved = db.create_recipe(recipe("team-brief", "markdown")).unwrap();
        assert!(validate_recipe(&db, &recipe("team-brief", "markdown"), None).is_err());
        assert!(validate_recipe(&db, &recipe("team-brief", "markdown"), Some(&saved.id)).is_ok());
    }

    #[test]
    fn settings_are_allow_listed_and_toggles_are_boolean() {
        assert!(validate_setting("denoise_enabled", "true").is_ok());
        assert!(validate_setting("denoise_enabled", "yes").is_err());
        assert!(validate_setting(SUMMARIZATION_PROVIDER_SETTING, "anthropic").is_ok());
        assert!(validate_setting(SUMMARIZATION_PROVIDER_SETTING, "").is_ok());
        assert!(validate_setting("theme", "dark").is_err());
    }

    #[test]
    fn checks_hex_colors() {
        assert!(validate_hex_color("#3b82F6").is_ok());
        assert!(validate_hex_color("3b82f6").is_err());
        assert!(validate_hex_color("#3b82fg").is_err());
    }

    #[test]
    fn truncates_at_word_boundary() {
        assert_eq!(truncate_at_word_boundary("short", 10, "..."), "short");
        assert_eq!(
            truncate_at_word_boundary("hello brave new world", 12, "..."),
            "hello brave..."
        );
    }

    #[test]
    fn resolve_model_without_providers_explains_how_to_add_one() {
        let db = Database::new_in_memory().unwrap();
        let err = resolve_model(&db, &LlmRegistry::new(), None, None).unwrap_err();
        assert!(err.to_string().contains("No LLM provider available"));
    }
}
