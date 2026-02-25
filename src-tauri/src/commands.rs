use crate::audio::RecordingSession;
use crate::db::*;
use crate::diarization::DiarizationEngine;
use crate::keychain;
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
    session.start();

    // Spawn live transcription pipeline if models are available
    if let Some(audio_rx) = session.take_audio_rx() {
        let db_clone = db.inner().clone();
        let meeting_id = meeting.id.clone();
        let app_handle = app.clone();

        tokio::spawn(async move {
            run_transcription_pipeline(audio_rx, db_clone, meeting_id, app_handle).await;
        });
    }

    *session_lock = Some(session);

    Ok(meeting)
}

/// Background task: consume audio chunks, transcribe, diarize, persist, and emit events.
async fn run_transcription_pipeline(
    mut audio_rx: tokio::sync::mpsc::Receiver<Vec<f32>>,
    db: Arc<Database>,
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
}

#[tauri::command]
pub async fn stop_recording(
    db: State<'_, DbState>,
    recording: State<'_, RecordingState>,
) -> Result<Meeting, String> {
    let mut session_lock = recording.lock().await;
    let session = session_lock
        .take()
        .ok_or_else(|| "Not recording".to_string())?;

    let meeting_id = session.meeting_id().to_string();
    let audio_path = session.audio_path().to_string_lossy().to_string();
    session.stop();

    // Finalize meeting with end time and audio path
    let end_time = chrono::Utc::now().to_rfc3339();
    db.finalize_meeting(&meeting_id, &end_time, Some(&audio_path), "transcribing")
        .map_err(|e| e.to_string())?;

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
    llm: State<'_, LlmState>,
    provider: String,
    key: String,
) -> Result<(), String> {
    keychain::store_api_key(&provider, &key).map_err(|e| e.to_string())?;

    // Hot-reload: register the provider in the LLM registry
    let mut registry = llm.write().await;
    registry.unregister(&provider);
    let new_provider: Box<dyn crate::llm::LlmProvider> = match provider.as_str() {
        "openai" => Box::new(crate::llm::OpenAiProvider::new(key)),
        "anthropic" => Box::new(crate::llm::AnthropicProvider::new(key)),
        "google" => Box::new(crate::llm::GoogleProvider::new(key)),
        "groq" => Box::new(crate::llm::GroqProvider::new(key)),
        _ => return Ok(()), // Unknown provider — key stored but no runtime registration
    };
    registry.register(new_provider);

    Ok(())
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    keychain::get_api_key(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_api_key(llm: State<'_, LlmState>, provider: String) -> Result<(), String> {
    keychain::delete_api_key(&provider).map_err(|e| e.to_string())?;

    // Hot-reload: remove the provider from the LLM registry
    let mut registry = llm.write().await;
    registry.unregister(&provider);

    Ok(())
}

#[tauri::command]
pub fn list_stored_providers() -> Result<Vec<String>, String> {
    Ok(keychain::list_stored_providers())
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
pub fn get_model_status() -> Result<String, String> {
    let status = transcription::TranscriptionEngine::check_status();
    serde_json::to_string(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_diarization_status() -> Result<bool, String> {
    Ok(crate::diarization::DiarizationEngine::models_available())
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
pub async fn cancel_download(
    download_mgr: State<'_, DownloadManagerState>,
) -> Result<(), String> {
    let mut mgr = download_mgr.lock().await;
    mgr.cancel();
    Ok(())
}

#[tauri::command]
pub async fn delete_model(model_id: String) -> Result<(), String> {
    let model = model_registry::get_model(&model_id)
        .ok_or_else(|| format!("Unknown model: {model_id}"))?;
    model_download::delete_model_files(model)
}
