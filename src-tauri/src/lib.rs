pub mod analytics;
pub mod audio;
pub mod automation;
pub mod chunking;
pub mod commands;
pub mod connectors;
pub mod db;
pub mod denoise;
pub mod detection;
pub mod diarization;
pub mod dictionary;
pub mod embedding;
pub mod error;
pub mod extraction;
pub mod github_cli;
pub mod http;
pub mod linear;
pub mod llm;
pub mod mcp;
pub mod meeting_popup;
pub mod model_download;
pub mod model_registry;
pub mod permissions;
pub mod remote;
pub mod sandbox_migration;
pub mod shell_env;
pub mod summarization;
pub mod transcription;
pub mod vad;
pub mod workflows;

use commands::{
    DownloadManagerState, EmbeddingState, LlmState, RecordingState, SentimentJobsState,
};
use detection::MeetingDetector;
use llm::LlmRegistry;
use model_download::DownloadManager;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex as TokioMutex;

/// Show a macOS notification. Goes through the Tauri plugin because the
/// webview's `window.Notification` doesn't work in WKWebView.
pub(crate) fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        tracing::warn!("Failed to show notification: {e}");
    }
}

/// Bring the main window back; closing it only hides it.
pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    shell_env::fix_path();

    let app_dir = dirs::data_dir()
        .expect("Could not determine data directory")
        .join("Nootle");
    std::fs::create_dir_all(&app_dir).unwrap();
    let db_path = app_dir.join("nootle.db");
    let db = std::sync::Arc::new(db::Database::new(db_path.to_str().unwrap()).unwrap());

    // Fix any meetings stuck in "recording" or "transcribing" from a previous crash
    match db.cleanup_stale_recordings() {
        Ok(0) => {}
        Ok(n) => tracing::info!("Cleaned up {n} stale recording(s) from previous session"),
        Err(e) => tracing::warn!("Failed to clean up stale recordings: {e}"),
    }

    let recording_state: RecordingState = Arc::new(TokioMutex::new(None));

    let llm_registry = LlmRegistry::detect(&db);

    let llm_state: LlmState = Arc::new(tokio::sync::RwLock::new(llm_registry));

    let download_manager: DownloadManagerState = Arc::new(TokioMutex::new(DownloadManager::new()));

    let embedding_engine = if crate::embedding::EmbeddingEngine::is_available() {
        match crate::embedding::EmbeddingEngine::load() {
            Ok(e) => Some(e),
            Err(err) => {
                tracing::warn!("Failed to load embedding engine: {err}");
                None
            }
        }
    } else {
        None
    };
    let embedding_state: EmbeddingState = Arc::new(TokioMutex::new(embedding_engine));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
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
                .close_window()
                .build()?;
            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(
                    &MenuItemBuilder::with_id("check-for-updates", "Check for Updates\u{2026}")
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
            // The frontend owns the updater UI, so it can download and install in place.
            if event.id().as_ref() == "check-for-updates" {
                // The window may be hidden; show it so the result is seen.
                show_main_window(app);
                let _ = app.emit("menu-check-for-updates", ());
            }
        })
        .manage(db)
        .manage(recording_state)
        .manage(llm_state)
        .manage(download_manager)
        .manage(embedding_state)
        .manage(SentimentJobsState::default())
        .manage(connectors::SignInState::default())
        .manage(meeting_popup::PopupState::default())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            model_registry::migrate_legacy_files();

            // nootle:// URLs delivered while the app is already running.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let deep_link_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let handle = deep_link_handle.clone();
                        let raw = url.to_string();
                        tauri::async_runtime::spawn(remote::handle_url(handle, raw));
                    }
                });
            }
            // Closing the main window hides it instead of quitting, so
            // recordings, meeting detection and URL control keep running in
            // the background. Clicking the Dock icon brings it back; Cmd+Q
            // still quits.
            if let Some(main) = app.get_webview_window("main") {
                let window = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                });
            }
            let db_for_detection = app.state::<Arc<db::Database>>().inner().clone();

            // Spawn polling task for meeting detection
            tauri::async_runtime::spawn(async move {
                let mut detector = MeetingDetector::default();
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                    let detection_enabled = db_for_detection
                        .get_setting("detection_enabled")
                        .unwrap_or(None)
                        .map(|v| v == "true")
                        .unwrap_or(false);

                    if !detection_enabled {
                        continue;
                    }

                    let Some(meeting) = detector.check() else {
                        continue;
                    };
                    // Already recording it; no need to ask.
                    if remote::is_recording(&app_handle).await {
                        continue;
                    }
                    if let Err(e) = meeting_popup::show(&app_handle, &meeting) {
                        tracing::warn!("Failed to show meeting pop-up: {e}");
                        notify(
                            &app_handle,
                            "Meeting detected",
                            &format!(
                                "{} is using your microphone. Open Nootle to start recording.",
                                meeting.display_name
                            ),
                        );
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_meetings,
            commands::get_meeting,
            commands::delete_meeting,
            commands::update_meeting_status,
            commands::update_meeting_title,
            commands::update_meeting_template,
            commands::create_label,
            commands::list_labels,
            commands::update_label,
            commands::delete_label,
            commands::add_meeting_label,
            commands::remove_meeting_label,
            commands::get_meeting_labels,
            commands::get_all_meeting_labels,
            commands::add_scratch_note,
            commands::get_scratch_notes,
            commands::delete_scratch_note,
            commands::get_transcript,
            commands::rename_speaker,
            commands::search_transcripts,
            commands::update_transcript_segment,
            commands::list_dictionary_entries,
            commands::add_dictionary_entry,
            commands::update_dictionary_entry,
            commands::delete_dictionary_entry,
            commands::apply_dictionary_to_meeting,
            commands::create_recipe,
            commands::list_recipes,
            commands::update_recipe,
            commands::delete_recipe,
            commands::run_recipe,
            commands::create_template,
            commands::list_templates,
            commands::delete_template,
            commands::update_template,
            commands::get_summaries,
            commands::start_recording,
            commands::stop_recording,
            commands::is_recording,
            commands::current_recording,
            commands::get_audio_data,
            commands::store_api_key,
            commands::has_api_key,
            commands::delete_api_key,
            commands::list_stored_providers,
            commands::generate_summary,
            commands::chat_with_meeting,
            commands::list_llm_models,
            commands::list_llm_providers,
            commands::seed_default_prompts,
            commands::list_linear_teams,
            commands::list_linear_projects,
            commands::create_linear_ticket,
            commands::create_ticket_from_action_item,
            commands::get_linear_tickets,
            commands::get_linear_setting,
            commands::set_linear_setting,
            commands::get_available_models,
            commands::get_downloaded_models,
            commands::download_model,
            commands::cancel_download,
            commands::delete_model,
            commands::embed_meeting_cmd,
            commands::embed_all_meetings,
            commands::get_embedding_status,
            commands::list_insight_types,
            commands::create_insight_type,
            commands::update_insight_type,
            commands::delete_insight_type,
            commands::get_insights,
            commands::get_all_insights,
            commands::extract_meeting_insights,
            commands::re_extract_meeting_insights,
            commands::update_action_item_status,
            commands::update_action_item,
            commands::get_exe_path,
            commands::check_permissions,
            commands::request_microphone_permission,
            commands::request_screen_recording_permission,
            commands::request_calendar_permission,
            commands::get_app_setting,
            commands::set_app_setting,
            commands::create_chat_conversation,
            commands::list_chat_conversations,
            commands::delete_chat_conversation,
            commands::list_chat_messages,
            commands::send_chat_message,
            commands::update_chat_conversation_title,
            commands::save_meeting_notes,
            commands::save_enriched_notes,
            commands::enrich_meeting_notes,
            commands::compute_meeting_analytics,
            commands::compute_meeting_sentiment,
            commands::get_meeting_analytics,
            commands::create_integration,
            commands::list_integrations,
            commands::update_integration,
            commands::delete_integration,
            commands::connect_integration_sign_in,
            commands::cancel_integration_sign_in,
            commands::github_cli_available,
            commands::connect_github_cli,
            commands::create_workflow,
            commands::list_workflows,
            commands::update_workflow,
            commands::delete_workflow,
            commands::list_workflow_runs,
            commands::run_workflow,
            meeting_popup::get_popup_meeting,
            meeting_popup::dismiss_meeting_popup,
            meeting_popup::record_from_meeting_popup,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                show_main_window(app);
            }
        });
}
