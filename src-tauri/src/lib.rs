pub mod audio;
pub mod commands;
pub mod db;
pub mod detection;
pub mod diarization;
pub mod error;
pub mod keychain;
pub mod llm;
pub mod mcp;
pub mod transcription;

use commands::RecordingState;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = dirs::data_dir().unwrap().join("Nootle");
    std::fs::create_dir_all(&app_dir).unwrap();
    let db_path = app_dir.join("nootle.db");
    let db = std::sync::Arc::new(db::Database::new(db_path.to_str().unwrap()).unwrap());

    let recording_state: RecordingState = Arc::new(TokioMutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db)
        .manage(recording_state)
        .invoke_handler(tauri::generate_handler![
            commands::create_meeting,
            commands::list_meetings,
            commands::get_meeting,
            commands::delete_meeting,
            commands::update_meeting_status,
            commands::create_category,
            commands::list_categories,
            commands::delete_category,
            commands::get_transcript,
            commands::search_transcripts,
            commands::create_prompt,
            commands::list_prompts,
            commands::delete_prompt,
            commands::create_template,
            commands::list_templates,
            commands::delete_template,
            commands::get_summaries,
            commands::start_recording,
            commands::stop_recording,
            commands::is_recording,
            commands::store_api_key,
            commands::get_api_key,
            commands::delete_api_key,
            commands::list_stored_providers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
