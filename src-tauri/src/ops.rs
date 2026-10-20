//! Operations shared by the app's commands, `nootle-cli`, and the MCP server,
//! so each surface does the same thing: the same cleanup on delete, the same
//! re-indexing after a speaker rename, the same prompts for LLM features.
//! Nothing here needs a running app; callers emit any UI events themselves.

use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};

use crate::db::{
    ChatConversation, Database, InsightWithActionItem, Label, Meeting, MeetingAnnotation,
    NewMeetingAnnotation, NewRecipe, Recipe, SentimentSegment, TranscriptSegment,
};
use crate::dictionary::DictionaryEntry;
use crate::embedding::EmbeddingEngine;
use crate::llm::{ChatMessage, LlmRegistry, ModelInfo};

/// Where recordings and imported audio live.
pub fn recordings_dir() -> Result<std::path::PathBuf> {
    Ok(dirs::data_dir()
        .context("Could not determine data directory")?
        .join("Nootle")
        .join("recordings"))
}

/// Deletes a meeting with its search index, audio file, snapshots, and
/// audio recap.
pub fn delete_meeting(db: &Database, id: &str) -> Result<()> {
    let audio_path = db.get_meeting(id).ok().and_then(|m| m.audio_path);
    // vec0 embeddings don't cascade.
    let _ = db.delete_meeting_chunks(id);
    db.delete_meeting(id)?;
    if let Some(path) = audio_path {
        let _ = std::fs::remove_file(crate::audio::writer::stems_path(path.as_ref()));
        let _ = std::fs::remove_file(path);
    }
    if let Ok(dir) = recordings_dir() {
        let _ = std::fs::remove_dir_all(crate::snapshots::dir_for(&dir, id));
        crate::room_recap::delete_files(&dir, id);
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
    "detection_enabled",
    crate::voices::SETTING_KEY,
    crate::llm::LOCAL_ONLY_SETTING,
    CONSENT_REMINDER_SETTING,
    crate::remote::ENABLED_SETTING,
    crate::dictionary::AUTO_LEARN_SETTING,
    crate::snapshots::SETTING_KEY,
    crate::live_assist::SETTING_KEY,
    crate::coach::SETTING_KEY,
    crate::menu_bar::SETTING_KEY,
    crate::menu_bar::HIDE_DOCK_SETTING,
];
/// Settings the MCP server refuses to change. URL control lets other apps
/// start recordings and snapshots capture shared screens, so turning either
/// on stays a decision made by the user.
pub const AGENT_LOCKED_SETTINGS: &[&str] = &[
    crate::remote::ENABLED_SETTING,
    crate::voices::SETTING_KEY,
    crate::llm::LOCAL_ONLY_SETTING,
    crate::snapshots::SETTING_KEY,
];

/// Reminds you to tell people they're being recorded when a recording
/// starts. On unless turned off.
pub const CONSENT_REMINDER_SETTING: &str = "consent_reminder";
/// The message the reminder offers to copy into the meeting chat.
pub const CONSENT_MESSAGE_SETTING: &str = "consent_message";
pub const DEFAULT_CONSENT_MESSAGE: &str = "Heads up: I'm recording and transcribing this call \
     with Nootle so I can take notes. The recording stays on my computer. Let me know if you'd \
     rather I didn't.";
const MAX_CONSENT_MESSAGE_CHARS: usize = 600;

/// Settings the app, CLI, and MCP server can read and change.
pub fn editable_settings() -> impl Iterator<Item = &'static str> {
    TOGGLE_SETTINGS
        .iter()
        .copied()
        .chain([SUMMARIZATION_PROVIDER_SETTING, CONSENT_MESSAGE_SETTING])
}

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

/// A trimmed name, or an error when nothing is left.
pub fn non_empty_name<'a>(what: &str, name: &'a str) -> Result<&'a str> {
    match name.trim() {
        "" => Err(anyhow!("{what} can't be empty")),
        name => Ok(name),
    }
}

/// For fields where omitting keeps the current value and "" clears it:
/// `None` keeps, `Some(None)` clears.
fn clearable(value: Option<&str>) -> Option<Option<&str>> {
    value.map(|v| Some(v.trim()).filter(|v| !v.is_empty()))
}

fn validate_setting_key(key: &str) -> Result<()> {
    validate_one_of("setting", key, &editable_settings().collect::<Vec<_>>())
}

/// Checks a setting change: a toggle takes "true" or "false", and the
/// summarization provider any name ("" for automatic).
pub fn validate_setting(key: &str, value: &str) -> Result<()> {
    validate_setting_key(key)?;
    match key {
        SUMMARIZATION_PROVIDER_SETTING => Ok(()),
        CONSENT_MESSAGE_SETTING if value.chars().count() > MAX_CONSENT_MESSAGE_CHARS => Err(
            anyhow!("The consent message can be at most {MAX_CONSENT_MESSAGE_CHARS} characters"),
        ),
        CONSENT_MESSAGE_SETTING => Ok(()),
        _ => validate_one_of("value", value, &["true", "false"]),
    }
}

/// One editable setting's value; `None` when unset.
pub fn get_setting(db: &Database, key: &str) -> Result<Option<String>> {
    validate_setting_key(key)?;
    Ok(db.get_setting(key)?)
}

/// Every editable setting, unset ones as null.
pub fn settings_map(db: &Database) -> Result<serde_json::Map<String, Value>> {
    editable_settings()
        .map(|key| Ok((key.to_string(), json!(db.get_setting(key)?))))
        .collect()
}

/// Validates and saves a setting, returning the value stored.
pub fn set_setting(db: &Database, key: &str, value: &str) -> Result<String> {
    let value = value.trim();
    validate_setting(key, value)?;
    db.set_setting(key, value)?;
    if key == crate::llm::LOCAL_ONLY_SETTING {
        crate::llm::set_local_only(value == "true");
    }
    Ok(value.to_string())
}

// --- Meetings ---

/// Changes to a meeting. `None` keeps a field; a `template_id` of "" clears
/// it so the auto-run templates apply.
#[derive(Debug, Default)]
pub struct MeetingPatch {
    pub title: Option<String>,
    pub status: Option<String>,
    pub template_id: Option<String>,
    pub notes: Option<String>,
}

pub fn validate_meeting_status(status: &str) -> Result<()> {
    validate_one_of("meeting status", status, MEETING_STATUSES)
}

pub fn validate_template(db: &Database, template_id: &str) -> Result<()> {
    db.get_template(template_id)
        .map(drop)
        .map_err(|_| anyhow!("Template '{template_id}' not found"))
}

/// Applies `patch` to a meeting, checking every field before writing any,
/// and returns the updated meeting.
pub fn update_meeting(db: &Database, id: &str, patch: MeetingPatch) -> Result<Meeting> {
    db.get_meeting(id)?;
    let title = patch
        .title
        .as_deref()
        .map(|t| non_empty_name("Title", t))
        .transpose()?;
    if let Some(status) = &patch.status {
        validate_meeting_status(status)?;
    }
    let template_id = clearable(patch.template_id.as_deref());
    if let Some(Some(template_id)) = template_id {
        validate_template(db, template_id)?;
    }

    if let Some(title) = title {
        db.update_meeting_title(id, title)?;
    }
    if let Some(status) = &patch.status {
        db.update_meeting_status(id, status)?;
    }
    if let Some(template_id) = template_id {
        db.update_meeting_template(id, template_id)?;
    }
    if let Some(notes) = &patch.notes {
        db.update_meeting_notes(id, notes)?;
    }
    Ok(db.get_meeting(id)?)
}

// --- Labels ---

pub fn create_label(db: &Database, name: &str, color: &str, icon: Option<&str>) -> Result<Label> {
    let name = non_empty_name("Label name", name)?;
    validate_hex_color(color)?;
    Ok(db.create_label(name, color, clearable(icon).flatten())?)
}

/// Updates a label; `None` keeps a field, and an icon of "" removes it.
pub fn update_label(
    db: &Database,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
    icon: Option<&str>,
) -> Result<Label> {
    let label = db.get_label(id)?;
    let name = non_empty_name("Label name", name.unwrap_or(&label.name))?;
    let color = color.unwrap_or(&label.color);
    validate_hex_color(color)?;
    let icon = clearable(icon).unwrap_or(label.icon.as_deref());
    Ok(db.update_label(id, name, color, icon)?)
}

/// The label in `labels` with ID `key`, or named `key` ignoring case.
pub fn find_label<'a>(labels: &'a [Label], key: &str) -> Result<&'a Label> {
    labels
        .iter()
        .find(|l| l.id == key || l.name.eq_ignore_ascii_case(key))
        .ok_or_else(|| anyhow!("Label not found: {key}"))
}

/// The IDs of the labels `keys` name (by ID or name), in order.
pub fn find_label_ids(db: &Database, keys: &[String]) -> Result<Vec<String>> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let labels = db.list_labels()?;
    keys.iter()
        .map(|key| find_label(&labels, key).map(|l| l.id.clone()))
        .collect()
}

// --- Recipes ---

/// Changes to a recipe; `None` keeps a field.
#[derive(Debug, Default)]
pub struct RecipePatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub slash_command: Option<String>,
    pub prompt_template: Option<String>,
    pub output_format: Option<String>,
}

/// Trims the name and accepts a slash command typed with its "/".
fn normalize_recipe(recipe: NewRecipe) -> NewRecipe {
    NewRecipe {
        name: recipe.name.trim().to_string(),
        slash_command: recipe
            .slash_command
            .trim()
            .trim_start_matches('/')
            .to_string(),
        ..recipe
    }
}

pub fn create_recipe(db: &Database, recipe: NewRecipe) -> Result<Recipe> {
    let recipe = normalize_recipe(recipe);
    validate_recipe(db, &recipe, None)?;
    Ok(db.create_recipe(recipe)?)
}

pub fn update_recipe(db: &Database, id: &str, patch: RecipePatch) -> Result<Recipe> {
    let current = db.get_recipe(id)?;
    let recipe = normalize_recipe(NewRecipe {
        name: patch.name.unwrap_or(current.name),
        description: patch.description.unwrap_or(current.description),
        slash_command: patch.slash_command.unwrap_or(current.slash_command),
        prompt_template: patch.prompt_template.unwrap_or(current.prompt_template),
        output_format: patch.output_format.unwrap_or(current.output_format),
    });
    validate_recipe(db, &recipe, Some(id))?;
    Ok(db.update_recipe(
        id,
        &recipe.name,
        &recipe.description,
        &recipe.slash_command,
        &recipe.prompt_template,
        &recipe.output_format,
    )?)
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

// --- Action items, snapshots, dictionary, conversations ---

/// Updates an action item: `None` keeps a field, and an assignee or due date
/// of "" clears it. Returns the updated item.
pub fn update_action_item(
    db: &Database,
    id: &str,
    status: Option<&str>,
    assignee: Option<&str>,
    due_date: Option<&str>,
) -> Result<InsightWithActionItem> {
    let current = db.get_insight_by_action_item(id)?;
    if let Some(status) = status {
        validate_one_of("action item status", status, ACTION_ITEM_STATUSES)?;
    }
    let (assignee, due_date) = (clearable(assignee), clearable(due_date));

    if let Some(status) = status {
        db.update_action_item_status(id, status)?;
    }
    if assignee.is_some() || due_date.is_some() {
        db.update_action_item(
            id,
            assignee.unwrap_or(current.assignee.as_deref()),
            due_date.unwrap_or(current.due_date.as_deref()),
        )?;
    }
    Ok(db.get_insight_by_action_item(id)?)
}

/// Deletes a snapshot and its image file.
pub fn delete_snapshot(db: &Database, id: &str) -> Result<()> {
    let snapshot = db
        .delete_snapshot(id)?
        .ok_or_else(|| anyhow!("Snapshot not found: {id}"))?;
    let _ = std::fs::remove_file(&snapshot.image_path);
    Ok(())
}

/// Longest annotation body, in characters: a few paragraphs, not a report.
pub const MAX_ANNOTATION_CHARS: usize = 4000;
/// Who annotations from `nootle-cli` are by.
pub const CLI_ANNOTATION_AUTHOR: &str = "cli";

/// How long a meeting runs: to the end of its transcript or its end time,
/// whichever is later, and up to now while it's still recording.
fn meeting_length_ms(db: &Database, meeting: &Meeting) -> Result<i64> {
    let parse = |t: &str| chrono::DateTime::parse_from_rfc3339(t).ok();
    let wall = parse(&meeting.start_time).map_or(0, |start| {
        let end = match meeting.end_time.as_deref() {
            Some(end) => parse(end).map(|e| e.to_utc()),
            None => Some(chrono::Utc::now()),
        };
        end.map_or(0, |end| (end - start.to_utc()).num_milliseconds())
    });
    Ok(wall.max(db.transcript_end_ms(&meeting.id)?))
}

/// Pins an agent's annotation to a meeting, checking its body and that it
/// falls within the meeting. An empty range becomes a moment.
pub fn add_annotation(db: &Database, mut a: NewMeetingAnnotation) -> Result<MeetingAnnotation> {
    a.body = non_empty_name("Annotation body", &a.body)?.to_string();
    let chars = a.body.chars().count();
    if chars > MAX_ANNOTATION_CHARS {
        bail!("Annotation body is {chars} characters; the limit is {MAX_ANNOTATION_CHARS}");
    }
    let meeting = db.get_meeting(&a.meeting_id)?;
    let length = meeting_length_ms(db, &meeting)?;
    let end = a.end_ms.unwrap_or(a.start_ms);
    if end < a.start_ms {
        bail!("Annotation end_ms can't be before start_ms");
    }
    if a.start_ms < 0 || end > length {
        bail!(
            "Annotation must fall within the meeting, between 00:00 and {} ({length} ms)",
            crate::summarization::format_ms(length)
        );
    }
    a.end_ms = a.end_ms.filter(|end| *end > a.start_ms);
    a.author = match a.author.trim() {
        "" => "agent".to_string(),
        author => author.chars().take(100).collect(),
    };
    Ok(db.add_meeting_annotation(a)?)
}

/// Updates a dictionary entry; `None` keeps a field. Returns the entry.
pub fn update_dictionary_entry(
    db: &Database,
    id: &str,
    term: Option<&str>,
    misheard: Option<&[String]>,
) -> Result<DictionaryEntry> {
    let entry = db.get_dictionary_entry(id)?;
    db.update_dictionary_entry(
        id,
        term.unwrap_or(&entry.term),
        misheard.unwrap_or(&entry.misheard),
    )?;
    Ok(db.get_dictionary_entry(id)?)
}

/// Rewrites a recorded meeting's transcript with the dictionary's
/// corrections, returning how many segments changed.
pub fn apply_dictionary(db: &Database, meeting_id: &str) -> Result<usize> {
    db.get_meeting(meeting_id)?;
    let rules = crate::dictionary::Rules::new(&db.list_dictionary_entries()?);
    Ok(crate::dictionary::apply_to_meeting(
        db, meeting_id, &rules, None,
    )?)
}

pub fn rename_conversation(db: &Database, id: &str, title: &str) -> Result<ChatConversation> {
    db.get_chat_conversation(id)?;
    db.update_chat_conversation_title(id, non_empty_name("Title", title)?)?;
    Ok(db.get_chat_conversation(id)?)
}

// --- API keys ---

/// Stores a provider's API key. Linear's lives with the other Linear
/// settings.
pub fn store_api_key(db: &Database, provider: &str, key: &str) -> Result<()> {
    validate_one_of("provider", provider, API_KEY_PROVIDERS)?;
    if provider == "linear" {
        db.set_linear_setting("api_key", key)?;
    } else {
        db.store_api_key(provider, key)?;
    }
    Ok(())
}

pub fn delete_api_key(db: &Database, provider: &str) -> Result<()> {
    validate_one_of("provider", provider, API_KEY_PROVIDERS)?;
    if provider == "linear" {
        db.delete_linear_setting("api_key")?;
    } else {
        db.delete_api_key(provider)?;
    }
    Ok(())
}

/// Providers with a stored API key.
pub fn list_api_key_providers(db: &Database) -> Result<Vec<String>> {
    let mut providers = db.list_api_key_providers()?;
    if db
        .get_linear_setting("api_key")?
        .is_some_and(|k| !k.is_empty())
    {
        providers.push("linear".into());
    }
    Ok(providers)
}

// --- Analytics and search index ---

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

/// The cached embedding engine in `slot`, loaded on first use so a model
/// downloaded after launch works without a restart.
pub fn loaded_embedding_engine(slot: &mut Option<EmbeddingEngine>) -> Result<&mut EmbeddingEngine> {
    if slot.is_none() {
        *slot = Some(load_embedding_engine()?);
    }
    Ok(slot.as_mut().expect("just loaded"))
}

/// The embedding model if it's downloaded and loads, for work that can do
/// without it.
pub fn try_load_embedding_engine() -> Option<EmbeddingEngine> {
    EmbeddingEngine::is_available()
        .then(EmbeddingEngine::load)
        .and_then(Result::ok)
}

/// The meetings "index everything" covers: those not archived, not still
/// being recorded or transcribed (their transcript isn't final), and not yet
/// indexed.
pub fn meetings_to_index(db: &Database) -> Result<Vec<String>> {
    let mut ids = Vec::new();
    for meeting in db.list_meetings(None, false, None)? {
        let in_progress = matches!(meeting.status.as_str(), "recording" | "transcribing");
        if !in_progress && !db.has_meeting_chunks(&meeting.id)? {
            ids.push(meeting.id);
        }
    }
    Ok(ids)
}

#[derive(Debug, serde::Serialize)]
pub struct EmbedFailure {
    pub meeting_id: String,
    pub error: String,
}

#[derive(Debug, Default, serde::Serialize)]
pub struct EmbedReport {
    pub chunks_added: usize,
    pub failed: Vec<EmbedFailure>,
}

/// Indexes each meeting with `embed` (`chunking::embed_meeting` with an
/// engine, which callers may lock per meeting), carrying on past failures.
pub fn embed_meetings(ids: &[String], mut embed: impl FnMut(&str) -> Result<usize>) -> EmbedReport {
    let mut report = EmbedReport::default();
    for id in ids {
        match embed(id) {
            Ok(n) => report.chunks_added += n,
            Err(e) => report.failed.push(EmbedFailure {
                meeting_id: id.clone(),
                error: format!("{e:#}"),
            }),
        }
    }
    report
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

/// A meeting's stored speaker analytics, engagement, and sentiment,
/// computing the first two if they haven't been yet.
pub fn meeting_analytics(db: &Database, meeting_id: &str) -> Result<Value> {
    db.get_meeting(meeting_id)?;
    let mut speakers = db.get_speaker_analytics(meeting_id)?;
    if speakers.is_empty() {
        refresh_analytics(db, meeting_id)?;
        speakers = db.get_speaker_analytics(meeting_id)?;
    }
    Ok(json!({
        "speakers": speakers,
        "engagement": db.get_engagement(meeting_id)?,
        "sentiment": db.get_sentiment_segments(meeting_id)?,
    }))
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
    if let Err(e) = crate::voices::learn_from_rename(db, meeting_id, from, to) {
        tracing::warn!("Couldn't learn {to}'s voice: {e}");
    }
    if let Err(e) = refresh_analytics(db, meeting_id) {
        tracing::warn!("Failed to compute analytics for {meeting_id}: {e}");
    }
    // The rename dropped the meeting's stale chunks; rebuild them now when the
    // search model is at hand, otherwise the next indexing pass will.
    if let Some(engine) = engine {
        if let Err(e) = crate::chunking::embed_meeting(db, engine, meeting_id) {
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
    let preferred = db
        .get_setting(SUMMARIZATION_PROVIDER_SETTING)
        .unwrap_or(None);
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
    // A long-running CLI or MCP process sees the app's latest choice.
    crate::llm::sync_local_only(db);
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

/// The LLM providers on this machine, with the provider and model the caller
/// asked for resolved as `resolve_model` does. Detection probes Ollama and
/// spawns processes, so async callers should run it off their workers.
pub fn detect_llm(
    db: &Database,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<(LlmRegistry, String, String)> {
    let llm = LlmRegistry::detect(db);
    let (provider, model) = resolve_model(db, &llm, provider, model)?;
    Ok((llm, provider, model))
}

pub(crate) async fn chat(
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

/// The last `minutes` of a meeting's transcript, for catching up.
pub fn recent_transcript(segments: &[TranscriptSegment], minutes: i64) -> Vec<TranscriptSegment> {
    let Some(latest) = segments.iter().map(|s| s.end_ms).max() else {
        return Vec::new();
    };
    let since = latest - minutes * 60_000;
    segments
        .iter()
        .filter(|s| s.end_ms > since)
        .cloned()
        .collect()
}

/// "What did I miss?": a few bullets on the last `minutes` of a meeting
/// (usually one still being recorded), calling out anything put to the
/// user, using the automatic summary model.
pub async fn catch_up(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    minutes: i64,
) -> Result<String> {
    let recent = recent_transcript(&db.get_transcript(meeting_id)?, minutes);
    if recent.is_empty() {
        return Ok("Nothing has been transcribed yet.".into());
    }
    crate::llm::sync_local_only(db);
    let model = pick_auto_model(db, llm)
        .ok_or_else(|| anyhow!("Add an AI provider in Settings to catch up on a meeting"))?;
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: format!(
                "You help someone who stepped away from a live meeting catch up. In 3–5 short \
                 bullets, say what was discussed in the last {minutes} minutes. Then, if \
                 anyone asked \"You\" a question, assigned \"You\" something, or is waiting \
                 on \"You\", add a line starting \"For you:\". Be brief; no preamble.{}",
                crate::dictionary::glossary(db)
            ),
        },
        ChatMessage {
            role: "user".into(),
            content: crate::summarization::format_transcript(&recent),
        },
    ];
    chat(llm, &model.provider, &model.id, messages).await
}

/// A meeting's notes as one text: what was typed, then the timestamped
/// quick notes. Empty when it has neither.
pub fn meeting_notes(db: &Database, meeting_id: &str) -> Result<String> {
    let mut notes = db
        .get_meeting(meeting_id)?
        .raw_notes
        .unwrap_or_default()
        .trim()
        .to_string();
    let quick_notes = db.get_scratch_notes(meeting_id)?;
    if !quick_notes.is_empty() {
        notes.push_str(&format!(
            "\n\nQuick notes, with when in the meeting they were taken:\n{}",
            crate::summarization::format_scratch_notes(&quick_notes)
        ));
    }
    Ok(notes.trim().to_string())
}

/// The embedding of a meeting's title and notes, for finding related
/// documents. None when the knowledge base is empty, there are no notes, or
/// the search model can't load, since notes are still enriched without it.
pub fn notes_embedding(
    db: &Database,
    engine: &mut Option<EmbeddingEngine>,
    meeting_id: &str,
) -> Option<Vec<f32>> {
    if !db.has_knowledge().unwrap_or(false) {
        return None;
    }
    let notes = meeting_notes(db, meeting_id)
        .ok()
        .filter(|n| !n.is_empty())?;
    let title = db.get_meeting(meeting_id).ok()?.title;
    let engine = loaded_embedding_engine(engine).ok()?;
    embed_question(engine, &format!("{title}\n{notes}")).ok()
}

/// Merges a meeting's notes (typed shorthand and timestamped quick notes)
/// with details from its transcript, calendar event and, given the notes'
/// embedding from `notes_embedding`, the closest knowledge-base passages,
/// and saves the result as the meeting's enriched notes.
pub async fn enrich_notes(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
    notes_embedding: Option<&[f32]>,
) -> Result<String> {
    let notes = meeting_notes(db, meeting_id)?;
    if notes.is_empty() {
        bail!("No notes to enrich");
    }

    let transcript_text =
        crate::summarization::llm_transcript(db, meeting_id, &db.get_transcript(meeting_id)?);
    // By meaning only: a keyword query built from every word of the notes
    // would match nearly every passage.
    let documents = match notes_embedding {
        Some(embedding) => db.search_knowledge_similar(embedding, 5, &[], &[])?,
        None => Vec::new(),
    };
    let documents_section = if documents.is_empty() {
        String::new()
    } else {
        format!(
            "\n\nRELATED PASSAGES FROM THE USER'S DOCUMENTS (use only where they clarify a note; \
             cite as [Document title, page]):\n{}",
            crate::knowledge::prompt_context(&documents)
        )
    };

    let system_prompt = format!(
        "You are enriching meeting notes using the full transcript into a single merged document. \
         Output in markdown format. Keep the user's original notes as the backbone structure. \
         The notes are often terse shorthand: fragments, abbreviations, arrows, initials. Work out \
         what each one refers to in the transcript and expand it into a clear point with the \
         specifics: who said what, numbers, decisions, next steps and owners. \
         Wrap the user's original note content in [[highlight]]...[[/highlight]] markers so it stands out. \
         Expand each note point with details, context, and supporting information from the transcript. \
         Never invent details that aren't in the transcript, calendar event or documents. \
         The result should read as one cohesive document — not two separate sections. \
         Maintain the same topic order as the original notes; place quick notes where they \
         fit by time.\n\n\
         TRANSCRIPT:\n{}{}\n\n\
         USER'S NOTES:\n{}{}",
        transcript_text,
        documents_section,
        notes,
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

/// Extracts decisions, action items, and custom insights from a meeting,
/// first deleting its existing ones with `replace`. Returns its insights.
pub async fn extract_insights(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
    replace: bool,
) -> Result<Vec<InsightWithActionItem>> {
    db.get_meeting(meeting_id)?;
    if replace {
        crate::extraction::re_extract_insights(db, llm, meeting_id, provider, model).await?;
    } else {
        crate::extraction::extract_insights(db, llm, meeting_id, provider, model).await?;
    }
    Ok(db.get_insights_for_meeting(meeting_id)?)
}

/// Scores a meeting's sentiment over time and saves it with its analytics.
pub async fn analyze_sentiment(
    db: &Database,
    llm: &LlmRegistry,
    meeting_id: &str,
    provider: &str,
    model: &str,
) -> Result<Vec<SentimentSegment>> {
    db.get_meeting(meeting_id)?;
    let segments =
        crate::analytics::analyze_sentiment(db, llm, meeting_id, provider, model).await?;
    db.save_sentiment_segments(meeting_id, &segments)?;
    Ok(segments)
}

pub use crate::db::{AskFilters, AskScope};

/// Embeds a question for `rag_chat`. Separate so callers sharing an engine
/// can release it before the slow LLM call.
pub fn embed_question(engine: &mut EmbeddingEngine, message: &str) -> Result<Vec<f32>> {
    engine.embed(message).context("Failed to embed query")
}

/// Passages for a question from both the vector index (meaning) and the
/// keyword index (exact names, numbers and jargon), merged with Reciprocal
/// Rank Fusion so a passage either one ranks highly makes the cut.
pub fn hybrid_search(
    db: &Database,
    query_embedding: &[f32],
    question: &str,
    filters: &AskFilters,
    limit: usize,
) -> Result<Vec<crate::db::ChunkSearchResult>> {
    let candidates = limit * 2;
    let by_meaning = db.search_similar_chunks(query_embedding, candidates, filters)?;
    let by_keywords = db.search_chunks_by_keywords(question, candidates, filters)?;
    Ok(reciprocal_rank_fusion(
        [by_meaning, by_keywords],
        limit,
        |r| &r.chunk_id,
    ))
}

/// Scores each passage 1/(60 + rank) per list it appears in and keeps the
/// best `limit`. 60 is the constant from the original RRF paper; it stops a
/// single first place from outweighing broad agreement. `id` names a passage
/// across lists.
pub(crate) fn reciprocal_rank_fusion<T, const N: usize>(
    lists: [Vec<T>; N],
    limit: usize,
    id: impl Fn(&T) -> &str,
) -> Vec<T> {
    const K: f64 = 60.0;
    let mut scored: Vec<(f64, T)> = Vec::new();
    for list in lists {
        for (rank, result) in list.into_iter().enumerate() {
            let score = 1.0 / (K + rank as f64 + 1.0);
            match scored.iter_mut().find(|(_, r)| id(r) == id(&result)) {
                Some((total, _)) => *total += score,
                None => scored.push((score, result)),
            }
        }
    }
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.into_iter().take(limit).map(|(_, r)| r).collect()
}

/// Meeting and document passages formatted for a prompt, each headed with
/// how to cite it, and the same passages as sources for the answer.
pub(crate) fn passages_context(
    meetings: &[crate::db::ChunkSearchResult],
    documents: &[crate::db::KnowledgeHit],
) -> (String, Vec<Value>) {
    let mut context: Vec<String> = meetings
        .iter()
        .map(|m| {
            format!(
                "---\n[Meeting: \"{}\", {}]\n{}\n",
                m.meeting_title,
                crate::summarization::format_ms(m.start_ms),
                m.chunk_text
            )
        })
        .collect();
    let mut sources: Vec<Value> = meetings
        .iter()
        .map(|m| {
            json!({
                "type": "meeting",
                "meeting_id": m.meeting_id,
                "meeting_title": m.meeting_title,
                "start_ms": m.start_ms,
                "end_ms": m.end_ms,
            })
        })
        .collect();
    if !documents.is_empty() {
        context.push(crate::knowledge::prompt_context(documents));
        sources.extend(documents.iter().map(crate::knowledge::source_json));
    }
    (context.join("\n"), sources)
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
    let search_knowledge = filters.scope.knowledge() && db.has_knowledge()?;
    let (meeting_limit, knowledge_limit) = match (filters.scope.meetings(), search_knowledge) {
        (true, true) => (8, 6),
        (true, false) => (10, 0),
        (false, _) => (0, 10),
    };
    let results = if meeting_limit > 0 {
        hybrid_search(db, query_embedding, message, filters, meeting_limit)?
    } else {
        Vec::new()
    };
    let documents = if knowledge_limit > 0 {
        crate::knowledge::search(
            db,
            query_embedding,
            message,
            &filters.tags,
            &[],
            knowledge_limit,
        )?
    } else {
        Vec::new()
    };

    if results.is_empty() && documents.is_empty() {
        return Ok((
            "I couldn't find anything relevant in your meetings or documents. Try adjusting your filters or asking a different question.".into(),
            Vec::new(),
        ));
    }

    let (context, sources) = passages_context(&results, &documents);

    let system_prompt = format!(
        "You are Nootle, an AI assistant that answers questions about the user's meetings \
         and documents.\n\n\
         Below are relevant excerpts from the user's meeting transcripts and documents. Each \
         meeting excerpt includes the meeting title and timestamp; each document excerpt its \
         title and page or section. Use ONLY these excerpts to answer.\n\
         When you reference information, cite the source as [Meeting Title, timestamp] or \
         [Document title, page].\n\n\
         {}\n\
         Answer the user's question based on these excerpts. Be concise.{}",
        context,
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

/// Answers a question from all meetings: in the saved conversation
/// `conversation_id`, in a new saved one with `save`, or else one-off.
/// Returns `{"response", "sources"}`, plus `"conversation_id"` when saved.
#[allow(clippy::too_many_arguments)]
pub async fn ask(
    db: &Database,
    llm: &LlmRegistry,
    query_embedding: &[f32],
    question: &str,
    conversation_id: Option<&str>,
    save: bool,
    provider: &str,
    model: &str,
    filters: &AskFilters,
) -> Result<Value> {
    let conversation_id = match conversation_id {
        Some(id) => db.get_chat_conversation(id)?.id,
        None if save => db.create_chat_conversation()?.id,
        None => {
            let (response, sources) = rag_chat(
                db,
                llm,
                query_embedding,
                question,
                Vec::new(),
                provider,
                model,
                filters,
            )
            .await?;
            return Ok(json!({ "response": response, "sources": sources }));
        }
    };
    let mut result = send_chat_message(
        db,
        llm,
        query_embedding,
        &conversation_id,
        question,
        provider,
        model,
        filters,
    )
    .await?;
    result["conversation_id"] = json!(conversation_id);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::AnnotationKind;

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
        assert!(validate_setting("detection_enabled", "true").is_ok());
        assert!(validate_setting("detection_enabled", "yes").is_err());
        assert!(validate_setting(SUMMARIZATION_PROVIDER_SETTING, "anthropic").is_ok());
        assert!(validate_setting(SUMMARIZATION_PROVIDER_SETTING, "").is_ok());
        assert!(validate_setting("theme", "dark").is_err());
    }

    fn db_with_meeting() -> (Database, String) {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Sync".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        db.create_transcript_segment(crate::db::NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: "Alice".into(),
            text: "We ship cooper netties next week.".into(),
            start_ms: 0,
            end_ms: 3000,
            confidence: 0.9,
        })
        .unwrap();
        (db, meeting.id)
    }

    #[test]
    fn annotations_stay_within_the_meeting() {
        let (db, id) = db_with_meeting();
        // Ended a second after it started, so the 3s transcript is longer.
        let start = db.get_meeting(&id).unwrap().start_time;
        let end = (chrono::DateTime::parse_from_rfc3339(&start).unwrap()
            + chrono::Duration::seconds(1))
        .to_rfc3339();
        db.finalize_meeting(&id, &end, None, "summarized").unwrap();
        let note = |start_ms: i64, end_ms: Option<i64>, kind: AnnotationKind, body: &str| {
            add_annotation(
                &db,
                NewMeetingAnnotation {
                    meeting_id: id.clone(),
                    start_ms,
                    end_ms,
                    kind,
                    body: body.into(),
                    author: " ".into(),
                },
            )
        };

        let pinned = note(
            2_000,
            Some(3_000),
            AnnotationKind::Highlight,
            " Contradicts ADR-12 ",
        )
        .unwrap();
        assert_eq!(pinned.body, "Contradicts ADR-12");
        assert_eq!(pinned.author, "agent");
        let moment = note(1_000, Some(1_000), AnnotationKind::Comment, "Empty range").unwrap();
        assert_eq!(moment.end_ms, None);
        assert!(note(3_001, None, AnnotationKind::Comment, "Past the end").is_err());
        assert!(note(-1, None, AnnotationKind::Comment, "Before the start").is_err());
        assert!(note(2_000, Some(1_000), AnnotationKind::Comment, "Backwards").is_err());
        assert!(note(0, None, AnnotationKind::Flag, "   ").is_err());
        let long = "x".repeat(MAX_ANNOTATION_CHARS + 1);
        assert!(note(0, None, AnnotationKind::Flag, &long).is_err());
        assert!(note(0, None, AnnotationKind::Comment, "At the start").is_ok());
        assert!(add_annotation(
            &db,
            NewMeetingAnnotation {
                meeting_id: "nope".into(),
                start_ms: 0,
                end_ms: None,
                kind: AnnotationKind::Comment,
                body: "No meeting".into(),
                author: "cli".into(),
            }
        )
        .is_err());
        assert_eq!(db.get_meeting_annotations(&id).unwrap().len(), 3);
    }

    #[test]
    fn update_meeting_checks_everything_before_writing() {
        let (db, id) = db_with_meeting();
        let patch = |title: &str, status: &str| MeetingPatch {
            title: Some(title.into()),
            status: Some(status.into()),
            ..Default::default()
        };
        assert!(update_meeting(&db, &id, patch("Renamed", "bogus")).is_err());
        assert_eq!(db.get_meeting(&id).unwrap().title, "Sync");
        assert!(update_meeting(&db, &id, patch("  ", "archived")).is_err());
        let err = update_meeting(
            &db,
            &id,
            MeetingPatch {
                template_id: Some("nope".into()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(err.to_string().contains("Template 'nope' not found"));

        let meeting = update_meeting(&db, &id, patch(" Renamed ", "archived")).unwrap();
        assert_eq!(meeting.title, "Renamed");
        assert_eq!(meeting.status, "archived");
        assert!(update_meeting(&db, "missing", MeetingPatch::default()).is_err());
    }

    #[test]
    fn labels_validate_and_resolve_by_id_or_name() {
        let (db, id) = db_with_meeting();
        assert!(create_label(&db, " ", "#ff0000", None).is_err());
        assert!(create_label(&db, "Customer", "red", None).is_err());
        let label = create_label(&db, " Customer ", "#ff0000", Some("star")).unwrap();
        assert_eq!(label.name, "Customer");

        let updated = update_label(&db, &label.id, None, Some("#00ff00"), Some("")).unwrap();
        assert_eq!(updated.name, "Customer");
        assert_eq!(updated.color, "#00ff00");
        assert!(updated.icon.is_none());
        assert!(update_label(&db, "missing", None, None, None).is_err());

        let labels = db.list_labels().unwrap();
        assert_eq!(find_label(&labels, &label.id).unwrap().id, label.id);
        assert_eq!(find_label(&labels, "customer").unwrap().id, label.id);
        assert!(find_label(&labels, "nope").is_err());
        assert_eq!(
            find_label_ids(&db, &["CUSTOMER".into()]).unwrap(),
            vec![label.id.clone()]
        );

        db.add_meeting_label(&id, &label.id).unwrap();
        assert_eq!(
            db.list_meetings(None, true, Some(&label.id)).unwrap().len(),
            1
        );
        assert!(db
            .list_meetings(None, true, Some("other"))
            .unwrap()
            .is_empty());
        let pairs = db.get_labels_for_meetings(&[id.as_str()]).unwrap();
        assert_eq!(pairs[0].1.name, "Customer");

        db.delete_label(&label.id).unwrap();
        assert!(db.list_labels().unwrap().is_empty());
        assert!(db
            .list_meetings(None, true, Some(&label.id))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn recipes_accept_a_leading_slash() {
        let db = Database::new_in_memory().unwrap();
        let recipe = create_recipe(
            &db,
            NewRecipe {
                name: " Email ".into(),
                description: String::new(),
                slash_command: "/follow-up".into(),
                prompt_template: "Draft an email from {{transcript}}".into(),
                output_format: "markdown".into(),
            },
        )
        .unwrap();
        assert_eq!(recipe.name, "Email");
        assert_eq!(recipe.slash_command, "follow-up");

        let patch = RecipePatch {
            slash_command: Some("/bad command".into()),
            ..Default::default()
        };
        assert!(update_recipe(&db, &recipe.id, patch).is_err());
        let patch = RecipePatch {
            output_format: Some("plain".into()),
            ..Default::default()
        };
        let updated = update_recipe(&db, &recipe.id, patch).unwrap();
        assert_eq!(updated.output_format, "plain");
        assert_eq!(updated.slash_command, "follow-up");
    }

    #[test]
    fn action_items_keep_omitted_fields_and_clear_empty_ones() {
        let (db, id) = db_with_meeting();
        let insight = db
            .create_insight(crate::db::NewInsight {
                meeting_id: id.clone(),
                insight_type: "action_item".into(),
                content: "Write the doc".into(),
                context: None,
                transcript_start_ms: None,
                transcript_end_ms: None,
            })
            .unwrap();
        let item = db
            .create_action_item(crate::db::NewActionItem {
                insight_id: insight.id.clone(),
                assignee: Some("Alice".into()),
                due_date: Some("2026-01-01".into()),
            })
            .unwrap();

        let updated = update_action_item(&db, &item.id, Some("done"), Some("Bob"), None).unwrap();
        assert_eq!(updated.status.as_deref(), Some("done"));
        assert_eq!(updated.assignee.as_deref(), Some("Bob"));
        assert_eq!(updated.due_date.as_deref(), Some("2026-01-01"));
        let updated = update_action_item(&db, &item.id, None, None, Some("")).unwrap();
        assert!(updated.due_date.is_none());
        assert!(update_action_item(&db, &item.id, Some("finished"), None, None).is_err());
        assert_eq!(
            db.get_action_item_id_for_insight(&insight.id).unwrap(),
            Some(item.id)
        );
        assert_eq!(
            db.get_all_insights(Some(&id), None, None, None)
                .unwrap()
                .len(),
            1
        );
        assert!(db
            .get_all_insights(Some("other"), None, None, None)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn dictionary_conversations_and_snapshots() {
        let (db, id) = db_with_meeting();
        let entry = db
            .upsert_dictionary_entry("Kubernetes", &["cooper netties".into()], "manual")
            .unwrap();
        let entry = update_dictionary_entry(&db, &entry.id, Some("Kubernetes"), None).unwrap();
        assert_eq!(entry.misheard, vec!["cooper netties".to_string()]);
        assert!(update_dictionary_entry(&db, "missing", None, None).is_err());
        assert_eq!(apply_dictionary(&db, &id).unwrap(), 1);
        assert!(apply_dictionary(&db, "missing").is_err());

        let conversation = db.create_chat_conversation().unwrap();
        assert!(rename_conversation(&db, &conversation.id, " ").is_err());
        let renamed = rename_conversation(&db, &conversation.id, " Plans ").unwrap();
        assert_eq!(renamed.title, "Plans");
        assert!(rename_conversation(&db, "missing", "Plans").is_err());

        assert!(delete_snapshot(&db, "missing").is_err());
    }

    #[test]
    fn analytics_are_computed_once_then_read_back() {
        let (db, id) = db_with_meeting();
        assert!(db.get_speaker_analytics(&id).unwrap().is_empty());
        let analytics = meeting_analytics(&db, &id).unwrap();
        assert_eq!(analytics["speakers"][0]["speaker_label"], "Alice");
        assert_eq!(db.get_speaker_analytics(&id).unwrap().len(), 1);
        assert!(meeting_analytics(&db, "missing").is_err());
    }

    #[test]
    fn embed_report_collects_failures() {
        let ids = vec!["a".to_string(), "b".to_string()];
        let report = embed_meetings(&ids, |id| match id {
            "a" => Ok(3),
            _ => Err(anyhow!("no transcript")),
        });
        assert_eq!(report.chunks_added, 3);
        assert_eq!(report.failed[0].meeting_id, "b");

        let (db, id) = db_with_meeting();
        assert!(
            meetings_to_index(&db).unwrap().is_empty(),
            "a meeting still recording has no final transcript to index"
        );
        db.update_meeting_status(&id, "summarized").unwrap();
        assert_eq!(meetings_to_index(&db).unwrap(), vec![id]);
    }

    #[test]
    fn catching_up_reads_only_the_recent_minutes() {
        let seg = |start_ms: i64| TranscriptSegment {
            id: start_ms.to_string(),
            meeting_id: "m".into(),
            speaker_label: "A".into(),
            text: "x".into(),
            start_ms,
            end_ms: start_ms + 1_000,
            confidence: 1.0,
        };
        let segments = [seg(0), seg(400_000), seg(590_000)];
        let recent = recent_transcript(&segments, 5);
        assert_eq!(recent.len(), 2);
        assert!(recent_transcript(&[], 5).is_empty());
    }

    #[test]
    fn consent_message_is_free_text_within_a_limit() {
        assert!(validate_setting(CONSENT_MESSAGE_SETTING, "We're recording, OK?").is_ok());
        assert!(validate_setting(CONSENT_MESSAGE_SETTING, &"x".repeat(601)).is_err());
        assert!(validate_setting(CONSENT_REMINDER_SETTING, "maybe").is_err());
        assert!(AGENT_LOCKED_SETTINGS.contains(&crate::llm::LOCAL_ONLY_SETTING));
    }

    #[test]
    fn settings_and_api_keys() {
        let db = Database::new_in_memory().unwrap();
        assert_eq!(
            set_setting(&db, "detection_enabled", " true ").unwrap(),
            "true"
        );
        assert!(set_setting(&db, "detection_enabled", "on").is_err());
        assert!(get_setting(&db, "theme").is_err());
        let settings = settings_map(&db).unwrap();
        assert_eq!(settings["detection_enabled"], "true");
        assert!(settings[SUMMARIZATION_PROVIDER_SETTING].is_null());

        store_api_key(&db, "linear", "lin_123").unwrap();
        store_api_key(&db, "openai", "sk-123").unwrap();
        assert!(store_api_key(&db, "nope", "x").is_err());
        let mut providers = list_api_key_providers(&db).unwrap();
        providers.sort();
        assert_eq!(providers, vec!["linear", "openai"]);
        delete_api_key(&db, "linear").unwrap();
        assert_eq!(list_api_key_providers(&db).unwrap(), vec!["openai"]);
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
