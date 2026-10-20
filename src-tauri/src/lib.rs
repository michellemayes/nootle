pub mod analytics;
pub mod audio;
pub mod automation;
pub mod calendar;
pub mod call_names;
pub mod chunking;
pub mod coach;
pub mod commands;
pub mod connectors;
pub mod db;
pub mod detection;
pub mod diarization;
pub mod dictionary;
pub mod embedding;
pub mod error;
pub mod export;
pub mod extraction;
pub mod github_cli;
pub mod http;
pub mod import;
pub mod knowledge;
pub mod linear;
pub mod live_assist;
pub mod llm;
pub mod mcp;
pub mod meeting_popup;
pub mod menu_bar;
pub mod model_download;
pub mod model_registry;
pub mod ops;
pub mod permissions;
pub mod pipeline;
pub mod remote;
pub mod room_recap;
pub mod sandbox_migration;
pub mod share;
pub mod shell_env;
pub mod snapshots;
pub mod summarization;
pub mod transcript_import;
pub mod transcription;
pub mod vad;
pub mod voices;
pub mod workflows;

use commands::{
    DownloadManagerState, EmbeddingState, LlmState, RecordingState, SentimentJobsState,
    SummaryJobsState,
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

/// Where Nootle's log file lives: ~/Library/Logs/Nootle on macOS.
pub fn logs_dir() -> std::path::PathBuf {
    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        return home.join("Library/Logs/Nootle");
    }
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Nootle")
        .join("logs")
}

/// Past this size the log is rotated to `nootle.log.1` at launch, so the
/// two files never take more than twice this.
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

/// Logs to stdout and to a file people can attach to a bug report. Meeting
/// content (transcripts, summaries, prompts) is never logged.
fn init_logging() {
    use tracing_subscriber::fmt::writer::MakeWriterExt;
    let dir = logs_dir();
    let file = std::fs::create_dir_all(&dir).ok().and_then(|_| {
        let path = dir.join("nootle.log");
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_LOG_BYTES) {
            let _ = std::fs::rename(&path, dir.join("nootle.log.1"));
        }
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .ok()
    });
    let builder = tracing_subscriber::fmt().with_max_level(tracing::Level::INFO);
    match file {
        Some(file) => builder
            .with_writer(std::io::stdout.and(std::sync::Mutex::new(file)))
            .with_ansi(false)
            .init(),
        None => builder.init(),
    }
}

/// A new GitHub issue with the version and OS filled in. Logs aren't sent
/// anywhere; the template asks people to attach them if they want to.
fn report_problem_url(app: &tauri::AppHandle) -> String {
    let body = format!(
        "**What happened?**\n\n\n**What did you expect?**\n\n\n---\nNootle {} on {} {}\n\n\
         Logs help: Help → Open Logs Folder, then drag `nootle.log` here. They hold \
         timings and errors, never transcripts or summaries.",
        app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
    );
    let mut url =
        url::Url::parse("https://github.com/michellemayes/nootle/issues/new").expect("static URL");
    url.query_pairs_mut().append_pair("body", &body);
    url.into()
}

/// Clicking the Dock icon brings the window back.
#[cfg(target_os = "macos")]
fn handle_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::Reopen {
        has_visible_windows: false,
        ..
    } = event
    {
        show_main_window(app);
    }
}

#[cfg(not(target_os = "macos"))]
fn handle_run_event(_app: &tauri::AppHandle, _event: tauri::RunEvent) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    shell_env::fix_path();

    let app_dir = dirs::data_dir()
        .expect("Could not determine data directory")
        .join("Nootle");
    std::fs::create_dir_all(&app_dir).unwrap();
    let db_path = app_dir.join("nootle.db");
    let db = std::sync::Arc::new(db::Database::new(db_path.to_str().unwrap()).unwrap());

    let recording_state: RecordingState = Arc::new(TokioMutex::new(None));

    let llm_registry = LlmRegistry::detect(&db);

    let llm_state: LlmState = Arc::new(tokio::sync::RwLock::new(llm_registry));

    let download_manager: DownloadManagerState = Arc::new(TokioMutex::new(DownloadManager::new()));

    // Loading the embedding model (CoreML compile included) can take seconds,
    // so it happens in the background instead of delaying the window.
    let embedding_state: EmbeddingState = Arc::new(TokioMutex::new(None));
    if crate::embedding::EmbeddingEngine::is_available() {
        let embedding_state = embedding_state.clone();
        let db = db.clone();
        // Holding the lock while loading makes early callers wait for this
        // load rather than starting a second one.
        std::thread::spawn(move || {
            {
                let mut slot = embedding_state.blocking_lock();
                if let Err(err) = crate::ops::loaded_embedding_engine(&mut slot) {
                    tracing::warn!("Failed to load embedding engine: {err}");
                    return;
                }
            }
            // Catch up on meetings that aren't searchable yet (recorded while
            // the model was missing, or dropped by a search-index migration),
            // one at a time so Ask never waits long for the engine.
            let ids = crate::ops::meetings_to_index(&db).unwrap_or_default();
            let report = crate::ops::embed_meetings(&ids, |id| {
                let mut slot = embedding_state.blocking_lock();
                let engine = slot
                    .as_mut()
                    .ok_or_else(|| anyhow::anyhow!("search model unloaded"))?;
                crate::chunking::embed_meeting(&db, engine, id)
            });
            for failure in report.failed {
                tracing::warn!(
                    "Failed to index meeting {}: {}",
                    failure.meeting_id,
                    failure.error
                );
            }
        });
    }

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
                .separator()
                .item(
                    &MenuItemBuilder::with_id("report-problem", "Report a Problem\u{2026}")
                        .build(handle)?,
                )
                .item(&MenuItemBuilder::with_id("open-logs", "Open Logs Folder").build(handle)?)
                .build()?;
            MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()
        })
        .on_menu_event(|app, event| {
            use tauri_plugin_opener::OpenerExt;
            match event.id().as_ref() {
                // The frontend owns the updater UI, so it can download and install in place.
                "check-for-updates" => {
                    // The window may be hidden; show it so the result is seen.
                    show_main_window(app);
                    let _ = app.emit("menu-check-for-updates", ());
                }
                "open-logs" => {
                    let _ = app
                        .opener()
                        .open_path(logs_dir().to_string_lossy(), None::<&str>);
                }
                "report-problem" => {
                    let _ = app.opener().open_url(report_problem_url(app), None::<&str>);
                }
                _ => {}
            }
        })
        .manage(db)
        .manage(recording_state)
        .manage(llm_state)
        .manage(download_manager)
        .manage(embedding_state)
        .manage(SentimentJobsState::default())
        .manage(SummaryJobsState::default())
        .manage(connectors::SignInState::default())
        .manage(meeting_popup::PopupState::default())
        .manage(menu_bar::MenuBarState::default())
        .manage(live_assist::LatestCard::default())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            model_registry::migrate_legacy_files();

            // Meetings a crash or quit cut short are transcribed again from
            // the audio on disk instead of being shown as done.
            tauri::async_runtime::spawn(commands::recover_interrupted_meetings(app_handle.clone()));

            // The speech detector joined the transcription download after
            // some people had already installed it; fetch the missing file
            // (only that file) for them.
            if matches!(
                crate::transcription::TranscriptionEngine::check_status(),
                crate::transcription::ModelStatus::Ready
            ) && !crate::vad::SileroVad::is_available()
            {
                let handle = app_handle.clone();
                let variant = if crate::transcription::TranscriptionEngine::model_dir()
                    .join("encoder-model.onnx.data")
                    .exists()
                {
                    "full"
                } else {
                    "int8"
                };
                tauri::async_runtime::spawn(async move {
                    if let Some((model, variant)) =
                        model_registry::get_variant("parakeet-tdt-0.6b-v3", variant)
                    {
                        let cancel = tokio_util::sync::CancellationToken::new();
                        if let Err(e) =
                            model_download::download_variant(handle, model, variant, cancel).await
                        {
                            tracing::warn!("Couldn't download the speech detector: {e}");
                        }
                    }
                });
            }

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
            menu_bar::start(&app_handle);
            // Keep the knowledge base current: a pass shortly after launch,
            // then every half hour, reading only files that changed.
            {
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    loop {
                        commands::refresh_knowledge(&handle);
                        tokio::time::sleep(std::time::Duration::from_secs(30 * 60)).await;
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
            commands::list_meeting_annotations,
            commands::resolve_meeting_annotation,
            commands::delete_meeting_annotation,
            commands::get_transcript,
            commands::list_snapshots,
            commands::delete_snapshot,
            commands::rename_speaker,
            commands::search_transcripts,
            commands::update_transcript_segment,
            commands::list_dictionary_entries,
            commands::add_dictionary_entry,
            commands::update_dictionary_entry,
            commands::delete_dictionary_entry,
            commands::import_voiceink_dictionary,
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
            commands::recording_status,
            commands::set_recording_paused,
            commands::import_extensions,
            commands::import_recording,
            commands::export_meeting,
            commands::get_meeting_share,
            commands::share_meeting,
            commands::unshare_meeting,
            commands::open_in_claude,
            commands::list_upcoming_events,
            commands::store_api_key,
            commands::has_api_key,
            commands::delete_api_key,
            commands::list_stored_providers,
            commands::generate_summary,
            commands::cancel_summary,
            commands::chat_with_meeting,
            commands::get_audio_recap,
            commands::generate_audio_recap,
            commands::ask_the_room,
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
            commands::get_mcp_command,
            commands::check_permissions,
            commands::request_microphone_permission,
            commands::request_screen_recording_permission,
            commands::request_calendar_permission,
            commands::get_app_setting,
            commands::set_app_setting,
            commands::get_remote_control_token,
            commands::catch_up,
            commands::list_people,
            commands::get_person,
            commands::export_all_meetings,
            commands::get_consent_reminder,
            commands::note_consent,
            commands::get_call_names,
            commands::list_voice_profiles,
            commands::delete_voice_profile,
            commands::forget_all_voices,
            commands::create_chat_conversation,
            commands::list_chat_conversations,
            commands::delete_chat_conversation,
            commands::list_chat_messages,
            commands::send_chat_message,
            commands::update_chat_conversation_title,
            commands::save_meeting_notes,
            commands::save_enriched_notes,
            commands::enrich_meeting_notes,
            commands::list_knowledge_sources,
            commands::add_knowledge_source,
            commands::remove_knowledge_source,
            commands::update_knowledge_source_tags,
            commands::reindex_knowledge,
            commands::list_knowledge_documents,
            commands::list_knowledge_tags,
            commands::search_knowledge,
            commands::open_knowledge_document,
            commands::live_assist,
            commands::compute_meeting_analytics,
            commands::compute_meeting_sentiment,
            commands::get_meeting_analytics,
            commands::get_meeting_coach,
            commands::get_coach_trends,
            commands::suggest_coach_tip,
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
            menu_bar::menu_bar_status,
            menu_bar::menu_bar_open_main,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(handle_run_event);
}
