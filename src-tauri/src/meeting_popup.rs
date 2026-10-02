//! The small always-on-top card that offers to record a detected meeting.
//!
//! It is its own window rather than a card inside the app, so it shows over
//! the meeting app even while Nootle's window is hidden or behind others.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::detection::DetectedMeeting;

const LABEL: &str = "meeting-popup";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 84.0;
/// Gap from the top-right corner of the screen's usable area.
const MARGIN: f64 = 16.0;

/// The meeting the pop-up is showing, read by the pop-up when it loads.
#[derive(Default)]
pub struct PopupState(Mutex<Option<DetectedMeeting>>);

/// Show the pop-up for `meeting`, reusing it if it's already open.
pub fn show(app: &AppHandle, meeting: &DetectedMeeting) -> tauri::Result<()> {
    *app.state::<PopupState>().0.lock().unwrap() = Some(meeting.clone());

    let window = match app.get_webview_window(LABEL) {
        // An open pop-up picks the new meeting up from this event.
        Some(window) => {
            window.emit("meeting-popup-update", meeting)?;
            window
        }
        None => WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("popup.html".into()))
            .title("Meeting detected")
            .inner_size(WIDTH, HEIGHT)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .skip_taskbar(true)
            // Don't pull focus away from the meeting app, but still take a
            // click on the first try.
            .focused(false)
            .focusable(false)
            .accept_first_mouse(true)
            .visible(false)
            .build()?,
    };

    if let Some(monitor) = app.primary_monitor()? {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let x = area.position.x + area.size.width as i32 - ((WIDTH + MARGIN) * scale) as i32;
        let y = area.position.y + (MARGIN * scale) as i32;
        window.set_position(PhysicalPosition::new(x, y))?;
    }
    window.show()
}

fn close(app: &AppHandle) {
    *app.state::<PopupState>().0.lock().unwrap() = None;
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
}

#[tauri::command]
pub fn get_popup_meeting(state: tauri::State<'_, PopupState>) -> Option<DetectedMeeting> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn dismiss_meeting_popup(app: AppHandle) {
    close(&app);
}

/// Start recording from the pop-up and bring Nootle forward to show it.
#[tauri::command]
pub async fn record_from_meeting_popup(app: AppHandle) -> Result<(), String> {
    close(&app);
    let outcome = crate::remote::do_start(&app, None).await;
    if !outcome.ok {
        return Err(outcome.message);
    }
    crate::show_main_window(&app);
    let _ = app.emit("open-recording", ());
    Ok(())
}
