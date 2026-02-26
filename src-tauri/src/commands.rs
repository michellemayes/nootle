use crate::audio::{run_audio_capture, validate_audio_devices, RecordingSession};
use crate::db::*;
use crate::diarization::DiarizationEngine;
use crate::extraction;
use crate::llm::{ChatMessage, LlmRegistry};
use crate::model_download::{self, DownloadManager};
use crate::model_registry;
use crate::summarization;
use crate::transcription::{self, TranscriptionEngine};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::Mutex as TokioMutex;

pub type DbState = Arc<Database>;
pub type RecordingState = Arc<TokioMutex<Option<RecordingSession>>>;
pub type LlmState = Arc<tokio::sync::RwLock<LlmRegistry>>;
pub type DetectorState = Arc<std::sync::Mutex<crate::detection::MeetingDetector>>;
pub type DownloadManagerState = Arc<TokioMutex<DownloadManager>>;
pub type EmbeddingState = Arc<TokioMutex<Option<crate::embedding::EmbeddingEngine>>>;

const ALLOWED_PROVIDERS: &[&str] = &["openai", "anthropic", "google", "groq", "linear"];

fn validate_provider(provider: &str) -> Result<(), String> {
    if ALLOWED_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!("Invalid provider: {}", provider))
    }
}

// Meeting commands
#[tauri::command]
pub fn create_meeting(
    db: State<'_, DbState>,
    title: String,
    category_id: Option<String>,
    calendar_event_id: Option<String>,
) -> Result<Meeting, String> {
    db.create_meeting(NewMeeting {
        title,
        category_id,
        calendar_event_id,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_meetings(
    db: State<'_, DbState>,
    category_id: Option<String>,
    search: Option<String>,
) -> Result<Vec<Meeting>, String> {
    db.list_meetings(category_id.as_deref(), search.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_meeting(db: State<'_, DbState>, id: String) -> Result<Meeting, String> {
    db.get_meeting(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_meeting(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_meeting(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_meeting_status(
    db: State<'_, DbState>,
    id: String,
    status: String,
) -> Result<(), String> {
    const VALID_STATUSES: &[&str] = &["recording", "transcribing", "summarized", "archived"];
    if !VALID_STATUSES.contains(&status.as_str()) {
        return Err(format!("Invalid meeting status: {}", status));
    }
    db.update_meeting_status(&id, &status)
        .map_err(|e| e.to_string())
}

// Category commands
#[tauri::command]
pub fn create_category(
    db: State<'_, DbState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> Result<Category, String> {
    if let Some(ref c) = color {
        let valid =
            c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
        if !valid {
            return Err(format!("Invalid hex color: {}", c));
        }
    }
    db.create_category(NewCategory { name, color, icon })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_categories(db: State<'_, DbState>) -> Result<Vec<Category>, String> {
    db.list_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_category(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_category(&id).map_err(|e| e.to_string())
}

// Transcript commands
#[tauri::command]
pub fn get_transcript(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<TranscriptSegment>, String> {
    db.get_transcript(&meeting_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_transcripts(
    db: State<'_, DbState>,
    query: String,
) -> Result<Vec<TranscriptSearchResult>, String> {
    db.search_transcripts(&query).map_err(|e| e.to_string())
}

// Prompt commands
#[tauri::command]
pub fn create_prompt(
    db: State<'_, DbState>,
    name: String,
    content: String,
    is_favorite: bool,
    is_auto_run: bool,
) -> Result<Prompt, String> {
    db.create_prompt(NewPrompt {
        name,
        content,
        is_favorite,
        is_auto_run,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_prompts(db: State<'_, DbState>) -> Result<Vec<Prompt>, String> {
    db.list_prompts().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_prompt(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_prompt(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_prompt(
    db: State<'_, DbState>,
    id: String,
    name: String,
    content: String,
    is_favorite: bool,
    is_auto_run: bool,
) -> Result<Prompt, String> {
    db.update_prompt(&id, &name, &content, is_favorite, is_auto_run)
        .map_err(|e| e.to_string())
}

// Template commands
#[tauri::command]
pub fn create_template(
    db: State<'_, DbState>,
    name: String,
    category_id: Option<String>,
    sections: String,
    auto_apply_rules: String,
) -> Result<Template, String> {
    db.create_template(NewTemplate {
        name,
        category_id,
        sections,
        auto_apply_rules,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_templates(db: State<'_, DbState>) -> Result<Vec<Template>, String> {
    db.list_templates().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_template(db: State<'_, DbState>, id: String) -> Result<(), String> {
    db.delete_template(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_template(
    db: State<'_, DbState>,
    id: String,
    name: String,
    category_id: Option<String>,
    sections: String,
    auto_apply_rules: String,
) -> Result<Template, String> {
    db.update_template(
        &id,
        &name,
        category_id.as_deref(),
        &sections,
        &auto_apply_rules,
    )
    .map_err(|e| e.to_string())
}

// Summary commands
#[tauri::command]
pub fn get_summaries(db: State<'_, DbState>, meeting_id: String) -> Result<Vec<Summary>, String> {
    db.get_summaries_for_meeting(&meeting_id)
        .map_err(|e| e.to_string())
}

// Recording commands
#[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    recording: State<'_, RecordingState>,
    embedding_state: State<'_, EmbeddingState>,
    title: String,
    category_id: Option<String>,
    calendar_event_id: Option<String>,
) -> Result<Meeting, String> {
    // Check if already recording
    let mut session_lock = recording.lock().await;
    if session_lock.is_some() {
        return Err("Already recording".to_string());
    }

    // Create meeting in DB
    let meeting = db
        .create_meeting(NewMeeting {
            title,
            category_id,
            calendar_event_id,
        })
        .map_err(|e| e.to_string())?;

    // Create recording session — rollback meeting if this fails
    let recordings_dir = dirs::data_dir().unwrap().join("Nootle").join("recordings");
    let mut session = match RecordingSession::new(&recordings_dir, &meeting.id, 16000) {
        Ok(s) => s,
        Err(e) => {
            let _ = db.delete_meeting(&meeting.id);
            return Err(e.to_string());
        }
    };

    // Initialize audio capture on this thread to fail early if there are permission or device issues
    let audio_tx = match session.take_audio_tx() {
        Some(tx) => tx,
        None => {
            let _ = db.delete_meeting(&meeting.id);
            return Err("Failed to initialize audio channel".to_string());
        }
    };

    if let Err(e) = validate_audio_devices() {
        let _ = db.delete_meeting(&meeting.id);
        return Err(format!("Audio device validation failed: {e}"));
    }

    session.start();

    // Spawn audio capture loop on a dedicated thread
    {
        let is_active = session.is_active_flag();
        let audio_path = session.audio_path().to_path_buf();

        let handle = std::thread::spawn(move || {
            if let Err(e) = run_audio_capture(audio_tx, is_active, audio_path) {
                tracing::error!("Audio capture failed: {e}");
            }
        });
        session.set_capture_handle(handle);
    }

    // Spawn live transcription pipeline if models are available
    if let Some(audio_rx) = session.take_audio_rx() {
        let db_clone = db.inner().clone();
        let embedding_clone = embedding_state.inner().clone();
        let meeting_id = meeting.id.clone();
        let app_handle = app.clone();

        tokio::spawn(async move {
            run_transcription_pipeline(audio_rx, db_clone, embedding_clone, meeting_id, app_handle)
                .await;
        });
    }

    *session_lock = Some(session);

    Ok(meeting)
}

/// Background task: consume audio chunks, transcribe, diarize, persist, and emit events.
async fn run_transcription_pipeline(
    mut audio_rx: tokio::sync::mpsc::Receiver<Vec<f32>>,
    db: Arc<Database>,
    embedding_state: Arc<TokioMutex<Option<crate::embedding::EmbeddingEngine>>>,
    meeting_id: String,
    app: tauri::AppHandle,
) {
    // Try to load transcription engine
    let mut transcription_engine = match TranscriptionEngine::load() {
        Ok(e) => Some(e),
        Err(err) => {
            tracing::info!(
                "Transcription models not available, skipping live transcription: {err}"
            );
            None
        }
    };

    // Try to load diarization engine
    let mut diarization_engine = match DiarizationEngine::load() {
        Ok(e) => Some(e),
        Err(err) => {
            tracing::info!("Diarization models not available, skipping: {err}");
            None
        }
    };

    let mut offset_samples: u64 = 0;
    let sample_rate: u64 = 16000;

    while let Some(chunk) = audio_rx.recv().await {
        let offset_ms = offset_samples * 1000 / sample_rate;
        let chunk_len = chunk.len() as u64;

        // Run transcription
        if let Some(ref mut engine) = transcription_engine {
            match engine.transcribe(&chunk, offset_ms) {
                Ok(segments) => {
                    for seg in &segments {
                        // Run diarization to get speaker label
                        let speaker = if let Some(ref mut diar) = diarization_engine {
                            match diar.diarize(&chunk, offset_ms) {
                                Ok(diar_segs) => diar_segs
                                    .first()
                                    .map(|s| s.speaker_id.clone())
                                    .unwrap_or_else(|| "Speaker".to_string()),
                                Err(_) => "Speaker".to_string(),
                            }
                        } else {
                            "Speaker".to_string()
                        };

                        let _ = db.create_transcript_segment(NewTranscriptSegment {
                            meeting_id: meeting_id.clone(),
                            speaker_label: speaker,
                            text: seg.text.clone(),
                            start_ms: seg.start_ms as i64,
                            end_ms: seg.end_ms as i64,
                            confidence: 0.9,
                        });
                    }

                    // Emit updated transcript to frontend
                    if let Ok(all_segments) = db.get_transcript(&meeting_id) {
                        let _ = app.emit("transcript-update", &all_segments);
                    }
                }
                Err(e) => {
                    tracing::warn!("Transcription failed for chunk: {e}");
                }
            }
        }

        offset_samples += chunk_len;
    }

    // After transcription completes, embed the meeting
    let mut engine_lock = embedding_state.lock().await;
    if let Some(ref mut engine) = *engine_lock {
        match crate::chunking::embed_meeting(&db, engine, &meeting_id) {
            Ok(count) => tracing::info!("Embedded {count} chunks for meeting {meeting_id}"),
            Err(e) => tracing::warn!("Failed to embed meeting {meeting_id}: {e}"),
        }
    }
}

#[tauri::command]
pub async fn stop_recording(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    recording: State<'_, RecordingState>,
) -> Result<Meeting, String> {
    let mut session = {
        let mut session_lock = recording.lock().await;
        session_lock
            .take()
            .ok_or_else(|| "Not recording".to_string())?
    };

    let meeting_id = session.meeting_id().to_string();
    let audio_path = session.audio_path().to_string_lossy().to_string();
    session.stop();

    // Wait for the capture thread to finish writing the WAV file (outside the lock)
    if let Some(handle) = session.take_capture_handle() {
        match tokio::task::spawn_blocking(move || handle.join()).await {
            Ok(Ok(())) => tracing::debug!("Audio capture thread joined cleanly"),
            Ok(Err(_)) => tracing::error!("Audio capture thread panicked"),
            Err(e) => tracing::error!("Failed to join audio capture thread: {e}"),
        }
    }

    // Finalize meeting with end time and audio path
    let end_time = chrono::Utc::now().to_rfc3339();
    db.finalize_meeting(&meeting_id, &end_time, Some(&audio_path), "transcribing")
        .map_err(|e| e.to_string())?;

    // Auto-extract insights if an LLM provider is configured
    {
        let db_clone = db.inner().clone();
        let llm_clone = llm.inner().clone();
        let mid = meeting_id.clone();
        tokio::spawn(async move {
            let registry = llm_clone.read().await;
            let providers = registry.provider_names();
            if let Some(provider_name) = providers.first() {
                let models = registry.all_models();
                let provider_models: Vec<_> = models
                    .iter()
                    .filter(|m| m.provider == *provider_name)
                    .collect();
                if let Some(model) = provider_models.first() {
                    if let Err(e) = crate::extraction::extract_insights(
                        &db_clone,
                        &registry,
                        &mid,
                        provider_name,
                        &model.id,
                    )
                    .await
                    {
                        tracing::warn!("Auto-extraction failed: {e}");
                    }
                }
            }
        });
    }

    // Return the updated meeting
    db.get_meeting(&meeting_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_recording(recording: State<'_, RecordingState>) -> Result<bool, String> {
    let session = recording.lock().await;
    Ok(session.is_some())
}

// Keychain commands
#[tauri::command]
pub async fn store_api_key(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    provider: String,
    key: String,
) -> Result<(), String> {
    validate_provider(&provider)?;
    // Linear keys are stored in the database alongside other Linear settings
    if provider == "linear" {
        db.set_linear_setting("api_key", &key)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    db.store_api_key(&provider, &key)
        .map_err(|e| e.to_string())?;

    // Hot-reload: register the provider in the LLM registry
    let mut registry = llm.write().await;
    registry.unregister(&provider);
    let new_provider: Box<dyn crate::llm::LlmProvider> = match provider.as_str() {
        "openai" => Box::new(crate::llm::OpenAiProvider::new(key)),
        "anthropic" => Box::new(crate::llm::AnthropicProvider::new(key)),
        "google" => Box::new(crate::llm::GoogleProvider::new(key)),
        "groq" => Box::new(crate::llm::GroqProvider::new(key)),
        _ => return Ok(()),
    };
    registry.register(new_provider);

    Ok(())
}

#[tauri::command]
pub fn has_api_key(db: State<'_, DbState>, provider: String) -> Result<bool, String> {
    validate_provider(&provider)?;
    if provider == "linear" {
        return db
            .get_linear_setting("api_key")
            .map(|opt| opt.is_some())
            .map_err(|e| e.to_string());
    }
    db.get_api_key(&provider)
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_api_key(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    provider: String,
) -> Result<(), String> {
    validate_provider(&provider)?;
    if provider == "linear" {
        db.delete_linear_setting("api_key")
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    db.delete_api_key(&provider).map_err(|e| e.to_string())?;

    // Hot-reload: remove the provider from the LLM registry
    let mut registry = llm.write().await;
    registry.unregister(&provider);

    Ok(())
}

#[tauri::command]
pub fn list_stored_providers(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let mut providers = db.list_api_key_providers().map_err(|e| e.to_string())?;
    // Check if Linear API key is stored in the database
    if let Ok(Some(key)) = db.get_linear_setting("api_key") {
        if !key.is_empty() {
            providers.push("linear".to_string());
        }
    }
    Ok(providers)
}

// Summarization commands
#[tauri::command]
pub async fn generate_summary(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    meeting_id: String,
    prompt_id: String,
    provider: String,
    model: String,
) -> Result<Summary, String> {
    let llm = llm.read().await;
    summarization::summarize_meeting(&db, &llm, &meeting_id, &prompt_id, &provider, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chat_with_meeting(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    meeting_id: String,
    message: String,
    history: Vec<ChatMessage>,
    provider: String,
    model: String,
) -> Result<String, String> {
    let llm = llm.read().await;
    summarization::chat_with_transcript(
        &db,
        &llm,
        &meeting_id,
        &message,
        history,
        &provider,
        &model,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_llm_models(
    llm: State<'_, LlmState>,
) -> Result<Vec<crate::llm::ModelInfo>, String> {
    let llm = llm.read().await;
    Ok(llm.all_models())
}

#[tauri::command]
pub async fn list_llm_providers(llm: State<'_, LlmState>) -> Result<Vec<String>, String> {
    let llm = llm.read().await;
    Ok(llm.provider_names())
}

// Meeting detection commands
#[tauri::command]
pub fn get_active_meeting_apps(detector: State<'_, DetectorState>) -> Result<Vec<String>, String> {
    let detector = detector.lock().map_err(|e| e.to_string())?;
    Ok(detector.active_apps())
}

// Transcription commands
#[tauri::command]
pub async fn get_model_status(
    download_mgr: State<'_, DownloadManagerState>,
) -> Result<String, String> {
    let mgr = download_mgr.lock().await;
    let is_downloading = mgr.cancel_token.is_some();
    drop(mgr);

    if is_downloading {
        return serde_json::to_string(&transcription::ModelStatus::Downloading { progress: 0.0 })
            .map_err(|e| e.to_string());
    }

    let status = transcription::TranscriptionEngine::check_status();
    serde_json::to_string(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_diarization_status() -> Result<bool, String> {
    Ok(crate::diarization::DiarizationEngine::models_available())
}

// Permission commands
#[tauri::command]
pub fn check_permissions() -> Result<crate::permissions::PermissionStatus, String> {
    Ok(crate::permissions::check_all())
}

#[tauri::command]
pub async fn request_microphone_permission() -> Result<bool, String> {
    Ok(crate::permissions::request_microphone().await)
}

#[tauri::command]
pub fn request_screen_recording_permission() -> Result<bool, String> {
    Ok(crate::permissions::request_screen_recording())
}

#[tauri::command]
pub async fn request_calendar_permission() -> Result<bool, String> {
    Ok(crate::permissions::request_calendar().await)
}

// Onboarding commands
#[tauri::command]
pub fn seed_default_prompts(db: State<'_, DbState>) -> Result<(), String> {
    let defaults = vec![
        ("Meeting Summary", "Summarize this meeting transcript. Include: key decisions, action items with owners, and main discussion points. Be concise.", true, true),
        ("Action Items", "Extract all action items from this meeting transcript. Format each as: - [Owner]: [Task] (deadline if mentioned).", true, true),
        ("Key Decisions", "List all decisions made during this meeting. For each, note: the decision, who made it, and any context.", true, false),
        ("Follow-up Questions", "Based on this meeting, what open questions remain unanswered? What topics need follow-up?", false, false),
        ("TL;DR", "Give a 2-3 sentence TL;DR of this meeting. What was it about and what was the outcome?", true, false),
    ];

    for (name, content, is_favorite, is_auto_run) in defaults {
        // Skip if a prompt with this name already exists
        let existing = db.list_prompts().map_err(|e| e.to_string())?;
        if existing.iter().any(|p| p.name == name) {
            continue;
        }
        db.create_prompt(NewPrompt {
            name: name.to_string(),
            content: content.to_string(),
            is_favorite,
            is_auto_run,
        })
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// Linear commands
#[tauri::command]
pub async fn list_linear_teams(
    db: State<'_, DbState>,
) -> Result<Vec<crate::linear::LinearTeam>, String> {
    let api_key = db
        .get_linear_setting("api_key")
        .map_err(|e| e.to_string())?
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "Linear API key not configured".to_string())?;
    crate::linear::list_teams(&api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_linear_projects(
    db: State<'_, DbState>,
    team_id: String,
) -> Result<Vec<crate::linear::LinearProject>, String> {
    let api_key = db
        .get_linear_setting("api_key")
        .map_err(|e| e.to_string())?
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "Linear API key not configured".to_string())?;
    crate::linear::list_projects(&api_key, &team_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_linear_ticket(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    summary_id: String,
    team_id: String,
    project_id: Option<String>,
    provider: String,
    model: String,
) -> Result<crate::db::LinearTicket, String> {
    // Fetch summary from DB
    let summary = db.get_summary(&summary_id).map_err(|e| e.to_string())?;
    let meeting = db
        .get_meeting(&summary.meeting_id)
        .map_err(|e| e.to_string())?;

    // Use LLM to generate ticket title and description
    let llm_registry = llm.read().await;
    let llm_provider = llm_registry
        .get_provider(&provider)
        .ok_or_else(|| format!("Provider '{}' not found", provider))?;

    let messages = vec![
        crate::llm::ChatMessage {
            role: "system".into(),
            content: "You are a helpful assistant that creates Linear tickets from meeting summaries. Return valid JSON with exactly two fields: \"title\" (concise, under 80 characters) and \"description\" (markdown-formatted, structured with sections as appropriate). Return ONLY the JSON object, no other text.".into(),
        },
        crate::llm::ChatMessage {
            role: "user".into(),
            content: format!("Meeting: {}\n\nSummary:\n{}", meeting.title, summary.content),
        },
    ];

    let llm_response = llm_provider
        .chat(messages, &model)
        .await
        .map_err(|e| e.to_string())?;

    // Parse LLM response, fallback to raw content
    let (title, description) = match serde_json::from_str::<serde_json::Value>(&llm_response) {
        Ok(json) => {
            let title = json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(&meeting.title)
                .to_string();
            let desc = json
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or(&summary.content)
                .to_string();
            (title, desc)
        }
        Err(_) => (meeting.title.clone(), summary.content.clone()),
    };

    // Get Linear API key and create issue
    let api_key = db
        .get_linear_setting("api_key")
        .map_err(|e| e.to_string())?
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "Linear API key not configured".to_string())?;

    let issue = crate::linear::create_issue(
        &api_key,
        &team_id,
        project_id.as_deref(),
        &title,
        &description,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Store ticket reference in DB
    let ticket = db
        .create_linear_ticket(NewLinearTicket {
            summary_id: &summary_id,
            meeting_id: &summary.meeting_id,
            linear_issue_id: &issue.id,
            linear_issue_url: &issue.url,
            linear_identifier: &issue.identifier,
            title: &issue.title,
            team_id: &team_id,
            project_id: project_id.as_deref(),
        })
        .map_err(|e| e.to_string())?;

    Ok(ticket)
}

#[tauri::command]
pub fn get_linear_tickets(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<crate::db::LinearTicket>, String> {
    db.get_linear_tickets(&meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_linear_setting(db: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    db.get_linear_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_linear_setting(
    db: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    const ALLOWED_KEYS: &[&str] = &["default_team_id", "default_project_id", "api_key"];
    if !ALLOWED_KEYS.contains(&key.as_str()) {
        return Err(format!("Invalid setting key: {}", key));
    }
    db.set_linear_setting(&key, &value)
        .map_err(|e| e.to_string())
}

// Model download commands

#[tauri::command]
pub async fn get_available_models() -> Result<serde_json::Value, String> {
    serde_json::to_value(model_registry::MODEL_REGISTRY).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_downloaded_models() -> Result<Vec<model_download::ModelOnDiskStatus>, String> {
    Ok(model_download::get_all_model_status())
}

#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    download_mgr: State<'_, DownloadManagerState>,
    model_id: String,
    variant_id: String,
) -> Result<(), String> {
    let (model, variant) = model_registry::get_variant(&model_id, &variant_id)
        .ok_or_else(|| format!("Unknown model/variant: {model_id}/{variant_id}"))?;

    let cancel = {
        let mut mgr = download_mgr.lock().await;
        mgr.new_token()
    };

    let result = model_download::download_variant(app, model, variant, cancel).await;

    {
        let mut mgr = download_mgr.lock().await;
        mgr.clear_token();
    }

    result
}

#[tauri::command]
pub async fn cancel_download(download_mgr: State<'_, DownloadManagerState>) -> Result<(), String> {
    let mut mgr = download_mgr.lock().await;
    mgr.cancel();
    Ok(())
}

#[tauri::command]
pub async fn delete_model(model_id: String) -> Result<(), String> {
    let model =
        model_registry::get_model(&model_id).ok_or_else(|| format!("Unknown model: {model_id}"))?;
    model_download::delete_model_files(model)
}

// Global chat commands

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn chat_with_transcripts(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    embedding_state: State<'_, EmbeddingState>,
    message: String,
    history: Vec<ChatMessage>,
    provider: String,
    model: String,
    category_ids: Vec<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<serde_json::Value, String> {
    // Get embedding engine
    let mut engine_lock = embedding_state.lock().await;
    let engine = engine_lock
        .as_mut()
        .ok_or_else(|| "Embedding model not loaded. Please download it first.".to_string())?;

    // Embed the query
    let query_embedding = engine
        .embed(&message)
        .map_err(|e| format!("Failed to embed query: {e}"))?;
    drop(engine_lock);

    // Search for similar chunks
    let results = db
        .search_similar_chunks(
            &query_embedding,
            10,
            &category_ids,
            date_from.as_deref(),
            date_to.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    if results.is_empty() {
        return Ok(serde_json::json!({
            "response": "I couldn't find any relevant transcript passages for your question. Try adjusting your filters or asking a different question.",
            "sources": []
        }));
    }

    // Build context from retrieved chunks
    let mut context_parts = Vec::new();
    let mut sources = Vec::new();
    for result in &results {
        let timestamp = crate::summarization::format_ms(result.start_ms);
        context_parts.push(format!(
            "---\n[Meeting: \"{}\", {}]\n{}\n",
            result.meeting_title, timestamp, result.chunk_text
        ));
        sources.push(serde_json::json!({
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
         Answer the user's question based on these excerpts. Be concise.",
        context_parts.join("\n")
    );

    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: system_prompt,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".into(),
        content: message,
    });

    let llm = llm.read().await;
    let llm_provider = llm
        .get_provider(&provider)
        .ok_or_else(|| format!("Provider '{}' not found", provider))?;
    let response = llm_provider
        .chat(messages, &model)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "response": response,
        "sources": sources
    }))
}

#[tauri::command]
pub async fn embed_meeting_cmd(
    db: State<'_, DbState>,
    embedding_state: State<'_, EmbeddingState>,
    meeting_id: String,
) -> Result<usize, String> {
    let mut engine_lock = embedding_state.lock().await;
    let engine = engine_lock
        .as_mut()
        .ok_or_else(|| "Embedding model not loaded".to_string())?;
    crate::chunking::embed_meeting(&db, engine, &meeting_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn embed_all_meetings(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    embedding_state: State<'_, EmbeddingState>,
) -> Result<(), String> {
    let meetings = db.list_meetings(None, None).map_err(|e| e.to_string())?;
    let total = meetings.len();

    let mut engine_lock = embedding_state.lock().await;
    let engine = engine_lock
        .as_mut()
        .ok_or_else(|| "Embedding model not loaded".to_string())?;

    for (i, meeting) in meetings.iter().enumerate() {
        match crate::chunking::embed_meeting(&db, engine, &meeting.id) {
            Ok(_) => {}
            Err(e) => tracing::warn!("Failed to embed meeting {}: {e}", meeting.id),
        }
        let _ = app.emit(
            "embedding-progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
            }),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn get_embedding_status(
    db: State<'_, DbState>,
    embedding_state: State<'_, EmbeddingState>,
) -> Result<serde_json::Value, String> {
    let (embedded, total) = db.get_embedding_status().map_err(|e| e.to_string())?;
    let engine_lock = embedding_state.lock().await;
    let model_available = engine_lock.is_some();
    Ok(serde_json::json!({
        "embedded": embedded,
        "total": total,
        "model_available": model_available,
    }))
}

// Insight commands
#[tauri::command]
pub fn get_insights(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<crate::db::InsightWithActionItem>, String> {
    db.get_insights_for_meeting(&meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_insights(
    db: State<'_, DbState>,
    insight_type: Option<String>,
    status: Option<String>,
    search: Option<String>,
) -> Result<Vec<crate::db::InsightWithActionItem>, String> {
    db.get_all_insights(
        insight_type.as_deref(),
        status.as_deref(),
        search.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn extract_meeting_insights(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    meeting_id: String,
    provider: String,
    model: String,
) -> Result<(), String> {
    let llm = llm.read().await;
    extraction::extract_insights(&db, &llm, &meeting_id, &provider, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn re_extract_meeting_insights(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    meeting_id: String,
    provider: String,
    model: String,
) -> Result<(), String> {
    let llm = llm.read().await;
    extraction::re_extract_insights(&db, &llm, &meeting_id, &provider, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_action_item_status(
    db: State<'_, DbState>,
    id: String,
    status: String,
) -> Result<(), String> {
    db.update_action_item_status(&id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_action_item(
    db: State<'_, DbState>,
    id: String,
    assignee: Option<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    db.update_action_item(&id, assignee.as_deref(), due_date.as_deref())
        .map_err(|e| e.to_string())
}
