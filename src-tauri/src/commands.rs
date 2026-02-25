use crate::db::*;
use std::sync::Arc;
use tauri::State;

pub type DbState = Arc<Database>;

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
