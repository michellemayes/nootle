//! Live Assist popped out of the recording view into its own window, so it
//! can sit beside the meeting app while Nootle's main window is out of the way.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LABEL: &str = "live-assist";
/// Tells the main window whether Live Assist is in its own window.
const EVENT: &str = "live-assist-window";

/// The recording the window is assisting with, read by the window as it loads.
#[derive(Default)]
pub struct LiveAssistWindowState(Mutex<Option<String>>);

#[tauri::command]
pub fn open_live_assist_window(app: AppHandle, meeting_id: String) -> Result<(), String> {
    *app.state::<LiveAssistWindowState>().0.lock().unwrap() = Some(meeting_id);
    if let Some(window) = app.get_webview_window(LABEL) {
        return window.set_focus().map_err(|e| e.to_string());
    }
    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("liveassist.html".into()))
        .title("Live Assist")
        .inner_size(380.0, 640.0)
        .min_inner_size(300.0, 360.0)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .build()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            *handle.state::<LiveAssistWindowState>().0.lock().unwrap() = None;
            let _ = handle.emit(EVENT, false);
        }
    });
    app.emit(EVENT, true).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn live_assist_window_meeting(
    state: tauri::State<'_, LiveAssistWindowState>,
) -> Option<String> {
    state.0.lock().unwrap().clone()
}

/// Closes the window, which puts Live Assist back in the recording view.
#[tauri::command]
pub fn close_live_assist_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
}

/// Shows `path` (an app route, like a meeting at a moment) in the main window.
#[tauri::command]
pub fn open_in_main_window(app: AppHandle, path: String) {
    crate::show_main_window(&app);
    let _ = app.emit("open-route", path);
}
