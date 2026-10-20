//! The pre-meeting brief's floating window, and the loop that opens it a few
//! minutes before each calendar meeting. Modelled on the meeting pop-up: its
//! own window in the top-right corner, over other apps.

use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::brief::MeetingBrief;
use crate::commands::{DbState, EmbeddingState, LlmState, RecordingState};

const LABEL: &str = "meeting-brief";
const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 560.0;
const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(30);

/// The brief the window is showing, read by the window when it loads.
#[derive(Default)]
pub struct BriefPopupState(Mutex<Option<MeetingBrief>>);

/// Show the window for `brief`, reusing it if it's already open.
pub fn show(app: &AppHandle, brief: &MeetingBrief) -> tauri::Result<()> {
    *app.state::<BriefPopupState>().0.lock().unwrap() = Some(brief.clone());

    // An open window picks the new brief up from this event.
    if let Some(window) = app.get_webview_window(LABEL) {
        window.emit("meeting-brief-update", brief)?;
    }
    crate::meeting_popup::show_corner_window(
        app,
        LABEL,
        "brief.html",
        "Meeting brief",
        WIDTH,
        HEIGHT,
    )
}

fn close(app: &AppHandle) {
    *app.state::<BriefPopupState>().0.lock().unwrap() = None;
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
}

/// Checks the calendar every half minute and opens the brief for a meeting
/// starting within the lead time, once per occurrence.
pub fn spawn_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut shown: HashSet<String> = HashSet::new();
        loop {
            tokio::time::sleep(CHECK_EVERY).await;
            let db = app.state::<DbState>().inner().clone();
            if !db.get_bool_setting(crate::brief::SETTING_KEY, false) {
                continue;
            }
            let Ok(upcoming) = tokio::task::spawn_blocking(|| crate::calendar::upcoming(1)).await
            else {
                continue;
            };
            let now = chrono::Utc::now();
            let lead = crate::brief::lead_minutes(&db);
            let due: Vec<_> = crate::brief::due_events(&upcoming.events, now, lead, &shown)
                .into_iter()
                .cloned()
                .collect();
            // The soonest gets the window; the rest are still marked shown so
            // back-to-back invites don't stack up.
            shown.extend(due.iter().map(crate::brief::occurrence_key));
            let Some(event) = due.into_iter().next() else {
                continue;
            };
            match build(&app, event).await {
                Ok(brief) if brief.worth_showing() => {
                    if let Err(e) = show(&app, &brief) {
                        tracing::warn!("Failed to show the meeting brief: {e}");
                    }
                }
                Ok(_) => {}
                Err(e) => tracing::warn!("Failed to build a meeting brief: {e}"),
            }
        }
    });
}

/// The brief for `event`. Documents are searched by meaning when the search
/// model is loaded, by keyword otherwise, so a brief never waits on loading it.
pub async fn build(
    app: &AppHandle,
    event: crate::calendar::CalendarEvent,
) -> anyhow::Result<MeetingBrief> {
    let db = app.state::<DbState>().inner().clone();
    let engine = app.state::<EmbeddingState>().inner().clone();
    tokio::task::spawn_blocking(move || {
        crate::brief::build(&db, event, |query| {
            let mut slot = engine.try_lock().ok()?;
            slot.as_mut()?.embed(query).ok()
        })
    })
    .await?
}

/// The brief for a calendar event, for the Meetings page.
#[tauri::command]
pub async fn get_meeting_brief(app: AppHandle, event_id: String) -> Result<MeetingBrief, String> {
    let event = tokio::task::spawn_blocking(move || crate::calendar::event_by_id(&event_id))
        .await
        .map_err(|e| e.to_string())?
        .ok_or("That event is no longer in your calendar")?;
    build(&app, event).await.map_err(|e| e.to_string())
}

/// A few sentences on what to cover; `None` without an AI model.
#[tauri::command]
pub async fn synthesize_meeting_brief(
    db: tauri::State<'_, DbState>,
    llm: tauri::State<'_, LlmState>,
    brief: MeetingBrief,
) -> Result<Option<String>, String> {
    let llm = llm.read().await;
    crate::brief::synthesize(&db, &llm, &brief)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_brief_popup(state: tauri::State<'_, BriefPopupState>) -> Option<MeetingBrief> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn dismiss_brief_popup(app: AppHandle) {
    close(&app);
}

/// Start recording the brief's meeting and bring Nootle forward to show it.
#[tauri::command]
pub async fn record_from_brief_popup(
    app: AppHandle,
    title: String,
    calendar_event_id: String,
) -> Result<(), String> {
    close(&app);
    crate::commands::start_recording(
        app.clone(),
        app.state::<DbState>(),
        app.state::<RecordingState>(),
        title,
        Some(calendar_event_id),
        None,
    )
    .await?;
    crate::show_main_window(&app);
    let _ = app.emit("open-recording", ());
    Ok(())
}

/// Open a past meeting's notes in the main window.
#[tauri::command]
pub fn open_meeting_from_brief(app: AppHandle, meeting_id: String) {
    crate::show_main_window(&app);
    let _ = app.emit("open-meeting", meeting_id);
}
