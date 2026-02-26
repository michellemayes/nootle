pub mod audio;
pub mod commands;
pub mod db;
pub mod detection;
pub mod diarization;
pub mod error;
pub mod extraction;
pub mod linear;
pub mod llm;
pub mod mcp;
pub mod model_download;
pub mod model_registry;
pub mod permissions;
pub mod summarization;
pub mod transcription;

use commands::{DetectorState, DownloadManagerState, LlmState, RecordingState};
use detection::MeetingDetector;
use llm::{LlmRegistry, OllamaProvider};
use model_download::DownloadManager;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex as TokioMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = dirs::data_dir().unwrap().join("Nootle");
    std::fs::create_dir_all(&app_dir).unwrap();
    let db_path = app_dir.join("nootle.db");
    let db = std::sync::Arc::new(db::Database::new(db_path.to_str().unwrap()).unwrap());

    let recording_state: RecordingState = Arc::new(TokioMutex::new(None));

    // Initialize LLM registry with available providers
    let mut llm_registry = LlmRegistry::new();

    // Always register Ollama (no API key needed)
    llm_registry.register(Box::new(OllamaProvider::new()));

    // Register providers with stored API keys
    if let Ok(Some(key)) = db.get_api_key("openai") {
        llm_registry.register(Box::new(llm::OpenAiProvider::new(key)));
    }
    if let Ok(Some(key)) = db.get_api_key("anthropic") {
        llm_registry.register(Box::new(llm::AnthropicProvider::new(key)));
    }
    if let Ok(Some(key)) = db.get_api_key("google") {
        llm_registry.register(Box::new(llm::GoogleProvider::new(key)));
    }
    if let Ok(Some(key)) = db.get_api_key("groq") {
        llm_registry.register(Box::new(llm::GroqProvider::new(key)));
    }

    let llm_state: LlmState = Arc::new(tokio::sync::RwLock::new(llm_registry));

    let detector = Arc::new(std::sync::Mutex::new(MeetingDetector::new()));
    let detector_state: DetectorState = detector.clone();
    let download_manager: DownloadManagerState = Arc::new(TokioMutex::new(DownloadManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .menu(|handle| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
            let app_menu = SubmenuBuilder::new(handle, "Nootle")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .build()?;
            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(
                    &MenuItemBuilder::with_id(
                        "check-for-updates",
                        "Check for Updates\u{2026}",
                    )
                    .build(handle)?,
                )
                .build()?;
            MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "check-for-updates" {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_dialog::DialogExt;
                    use tauri_plugin_updater::UpdaterExt;

                    let updater = match handle.updater() {
                        Ok(u) => u,
                        Err(e) => {
                            log::warn!("Failed to initialize updater: {e}");
                            handle
                                .dialog()
                                .message("Could not check for updates.")
                                .title("Update Error")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                                .blocking_show();
                            return;
                        }
                    };

                    match updater.check().await {
                        Ok(Some(update)) => {
                            let msg = format!("Version {} is available.", update.version);
                            let should_open = handle
                                .dialog()
                                .message(msg)
                                .title("Update Available")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                                    "Download".to_string(),
                                    "Later".to_string(),
                                ))
                                .blocking_show();
                            if should_open {
                                use tauri_plugin_opener::OpenerExt;
                                if let Err(e) = handle.opener().open_url(
                                    "https://github.com/michellemayes/nootle/releases/latest",
                                    None::<&str>,
                                ) {
                                    log::warn!("Failed to open releases URL: {e}");
                                }
                            }
                        }
                        Ok(None) => {
                            handle
                                .dialog()
                                .message("You're running the latest version.")
                                .title("No Updates Available")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                                .blocking_show();
                        }
                        Err(e) => {
                            log::warn!("Update check failed: {e}");
                            handle
                                .dialog()
                                .message("Could not check for updates. Please check your internet connection.")
                                .title("Update Error")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                                .blocking_show();
                        }
                    }
                });
            }
        })
        .manage(db)
        .manage(recording_state)
        .manage(llm_state)
        .manage(detector_state)
        .manage(download_manager)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let update_handle = app_handle.clone();
            let detector = detector.clone();

            // Spawn polling task for meeting detection
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    let detected = {
                        let mut d = detector.lock().unwrap();
                        d.check()
                    };
                    for meeting in detected {
                        let _ = app_handle.emit("meeting-detected", &meeting);
                    }
                }
            });

            // Background update check
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                if let Ok(updater) = update_handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        let _ = update_handle.emit("update-available", &update.version);
                    }
                }
            });

            Ok(())
        })
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
            commands::update_prompt,
            commands::create_template,
            commands::list_templates,
            commands::delete_template,
            commands::update_template,
            commands::get_summaries,
            commands::start_recording,
            commands::stop_recording,
            commands::is_recording,
            commands::store_api_key,
            commands::has_api_key,
            commands::delete_api_key,
            commands::list_stored_providers,
            commands::generate_summary,
            commands::chat_with_meeting,
            commands::list_llm_models,
            commands::list_llm_providers,
            commands::get_active_meeting_apps,
            commands::seed_default_prompts,
            commands::get_model_status,
            commands::get_diarization_status,
            commands::list_linear_teams,
            commands::list_linear_projects,
            commands::create_linear_ticket,
            commands::get_linear_tickets,
            commands::get_linear_setting,
            commands::set_linear_setting,
            commands::get_available_models,
            commands::get_downloaded_models,
            commands::download_model,
            commands::cancel_download,
            commands::delete_model,
            commands::get_insights,
            commands::get_all_insights,
            commands::extract_meeting_insights,
            commands::re_extract_meeting_insights,
            commands::update_action_item_status,
            commands::update_action_item,
            commands::check_permissions,
            commands::request_microphone_permission,
            commands::request_screen_recording_permission,
            commands::request_calendar_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
