use crate::audio::RecordingSession;
use crate::db::*;
use crate::keychain;
use crate::llm::{ChatMessage, LlmRegistry};
use crate::summarization;
use crate::transcription;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;

pub type DbState = Arc<Database>;
pub type RecordingState = Arc<TokioMutex<Option<RecordingSession>>>;
pub type LlmState = Arc<tokio::sync::RwLock<LlmRegistry>>;
pub type DetectorState = Arc<std::sync::Mutex<crate::detection::MeetingDetector>>;

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
pub fn get_summaries(
    db: State<'_, DbState>,
    meeting_id: String,
) -> Result<Vec<Summary>, String> {
    db.get_summaries_for_meeting(&meeting_id)
        .map_err(|e| e.to_string())
}

// Recording commands
#[tauri::command]
pub async fn start_recording(
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

    // Create recording session
    let recordings_dir = dirs::data_dir()
        .unwrap()
        .join("Nootle")
        .join("recordings");
    let session = RecordingSession::new(&recordings_dir, &meeting.id, 16000)
        .map_err(|e| e.to_string())?;
    session.start();

    *session_lock = Some(session);

    Ok(meeting)
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

    session.stop();

    // Find the current recording meeting (most recent with status "recording")
    let meetings = db.list_meetings(None, None).map_err(|e| e.to_string())?;
    let meeting = meetings
        .into_iter()
        .find(|m| m.status == "recording")
        .ok_or_else(|| "No active recording found".to_string())?;

    // Update meeting status to transcribing
    db.update_meeting_status(&meeting.id, "transcribing")
        .map_err(|e| e.to_string())?;

    // Return the updated meeting
    db.get_meeting(&meeting.id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn is_recording(recording: State<'_, RecordingState>) -> Result<bool, String> {
    let session = recording.lock().await;
    Ok(session.is_some())
}

// Keychain commands
#[tauri::command]
pub fn store_api_key(provider: String, key: String) -> Result<(), String> {
    keychain::store_api_key(&provider, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    keychain::get_api_key(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    keychain::delete_api_key(&provider).map_err(|e| e.to_string())
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
        &db, &llm, &meeting_id, &message, history, &provider, &model,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_llm_models(llm: State<'_, LlmState>) -> Result<Vec<crate::llm::ModelInfo>, String> {
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
