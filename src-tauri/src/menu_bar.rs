//! Menu bar mode: a menu-bar icon that shows whether Nootle is recording,
//! with a small popover for controlling the recording, jotting a quick note
//! and seeing what's next, so the main window can stay out of the way during
//! calls. Optionally hides the Dock icon.
//!
//! Everything here drives the existing recording commands; nothing records
//! on its own.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::image::Image;
use tauri::menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Rect, WebviewUrl, WebviewWindowBuilder, Wry,
};

use crate::commands::{DbState, RecordingState, RecordingStatus};
use crate::db::Database;

/// Shows the menu-bar icon. Off unless turned on.
pub const SETTING_KEY: &str = "menu_bar";
/// Hides the Dock icon while the menu-bar icon is shown. Off unless turned on.
pub const HIDE_DOCK_SETTING: &str = "menu_bar_hide_dock";

const TRAY_ID: &str = "nootle-menu-bar";
const POPOVER_LABEL: &str = "menu-bar";
const POPOVER_WIDTH: f64 = 340.0;
const POPOVER_HEIGHT: f64 = 460.0;
/// Space between the menu bar and the popover.
const POPOVER_GAP: f64 = 6.0;
/// Clicking the icon while the popover is open first blurs (and hides) it;
/// a click this soon after that hide closes it rather than reopening it.
const REOPEN_GRACE: Duration = Duration::from_millis(300);

const IDLE_ICON: &[u8] = include_bytes!("../icons/tray/idle.png");
const PAUSED_ICON: &[u8] = include_bytes!("../icons/tray/paused.png");
const RECORDING_ICON: &[u8] = include_bytes!("../icons/tray/recording.png");

/// The two menu bar settings as stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MenuBarSettings {
    pub show: bool,
    hide_dock: bool,
}

impl MenuBarSettings {
    pub fn load(db: &Database) -> Self {
        let on = |key| {
            db.get_setting(key)
                .ok()
                .flatten()
                .is_some_and(|v| v == "true")
        };
        Self {
            show: on(SETTING_KEY),
            hide_dock: on(HIDE_DOCK_SETTING),
        }
    }

    /// The Dock icon only goes away while the menu-bar icon is there to open
    /// Nootle from.
    pub fn hides_dock(self) -> bool {
        self.show && self.hide_dock
    }
}

/// What the menu-bar icon shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMode {
    Idle,
    Recording,
    Paused,
}

impl TrayMode {
    pub fn of(status: Option<&RecordingStatus>) -> Self {
        match status {
            None => Self::Idle,
            Some(s) if s.paused => Self::Paused,
            Some(_) => Self::Recording,
        }
    }

    fn icon(self) -> &'static [u8] {
        match self {
            Self::Idle => IDLE_ICON,
            Self::Paused => PAUSED_ICON,
            Self::Recording => RECORDING_ICON,
        }
    }

    /// The red recording dot keeps its color; the others are template
    /// images macOS tints to suit a light or dark menu bar.
    fn is_template(self) -> bool {
        self != Self::Recording
    }
}

/// Recorded time as the menu bar shows it: "4:05", or "1:02:09" past an hour.
pub fn format_elapsed(ms: u64) -> String {
    let secs = ms / 1000;
    let (h, m, s) = (secs / 3600, secs / 60 % 60, secs % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

/// Text beside the icon: the recorded time while a recording is running or
/// paused, nothing when idle.
pub fn tray_title(status: Option<&RecordingStatus>) -> Option<String> {
    status.map(|s| format_elapsed(s.elapsed_ms))
}

/// Where the popover's top-left corner goes, in physical pixels: centered
/// under the icon and kept inside the screen. `icon` and `screen` are
/// (x, y, width, height); `size` is the popover's (width, height).
pub fn popover_origin(
    icon: (f64, f64, f64, f64),
    size: (f64, f64),
    screen: (f64, f64, f64, f64),
    gap: f64,
) -> (f64, f64) {
    let (ix, iy, iw, ih) = icon;
    let (sx, sy, sw, _) = screen;
    let x = (ix + iw / 2.0 - size.0 / 2.0).clamp(sx, (sx + sw - size.0).max(sx));
    let y = (iy + ih + gap).max(sy);
    (x, y)
}

/// The menu-bar icon's menu item that changes with the recording, and when
/// the popover last hid itself.
#[derive(Default)]
pub struct MenuBarState {
    record_item: Mutex<Option<MenuItem<Wry>>>,
    shown: Mutex<Option<(TrayMode, Option<String>)>>,
    popover_hidden_at: Mutex<Option<Instant>>,
}

/// Applies the settings at launch, then keeps the icon and its timer
/// current while it's shown.
pub fn start(app: &AppHandle) {
    apply(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if app.tray_by_id(TRAY_ID).is_some() {
                refresh(&app).await;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

/// Shows or removes the menu-bar icon and the Dock icon to match the
/// settings. Called at launch and whenever either setting changes.
pub fn apply(app: &AppHandle) {
    let settings = MenuBarSettings::load(&app.state::<DbState>());
    let existing = app.tray_by_id(TRAY_ID);
    if settings.show && existing.is_none() {
        if let Err(e) = build_tray(app) {
            tracing::warn!("Failed to show the menu bar icon: {e}");
        }
    } else if !settings.show && existing.is_some() {
        app.remove_tray_by_id(TRAY_ID);
        if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
            let _ = popover.close();
        }
        let state = app.state::<MenuBarState>();
        *state.record_item.lock().unwrap() = None;
        *state.shown.lock().unwrap() = None;
    }

    #[cfg(target_os = "macos")]
    {
        let policy = if settings.hides_dock() {
            tauri::ActivationPolicy::Accessory
        } else {
            tauri::ActivationPolicy::Regular
        };
        if let Err(e) = app.set_activation_policy(policy) {
            tracing::warn!("Failed to change the Dock icon: {e}");
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let record_item = MenuItemBuilder::with_id("tray-record", "Start Recording").build(app)?;
    let menu: Menu<Wry> = MenuBuilder::new(app)
        .item(&record_item)
        .separator()
        .item(&MenuItemBuilder::with_id("tray-open", "Open Nootle").build(app)?)
        .item(&MenuItemBuilder::with_id("tray-settings", "Settings\u{2026}").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("tray-quit", "Quit Nootle").build(app)?)
        .build()?;
    *app.state::<MenuBarState>().record_item.lock().unwrap() = Some(record_item);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(IDLE_ICON)?)
        .icon_as_template(true)
        .tooltip("Nootle")
        .menu(&menu)
        // Left click opens the popover; the menu is for right click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-record" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let outcome = if crate::remote::is_recording(&app).await {
                        crate::remote::do_stop(&app).await
                    } else {
                        crate::remote::do_start(&app, None).await
                    };
                    if !outcome.ok {
                        crate::notify(&app, "Nootle", &outcome.message);
                    }
                });
            }
            "tray-open" => open_main(app),
            "tray-settings" => {
                hide_popover(app);
                crate::show_main_window(app);
                let _ = app.emit("open-settings", ());
            }
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                if let Err(e) = toggle_popover(tray.app_handle(), rect) {
                    tracing::warn!("Failed to open the menu bar popover: {e}");
                }
            }
        })
        .build(app)
}

/// Updates the icon, the recorded time beside it and the menu's record item
/// when the recording changes.
async fn refresh(app: &AppHandle) {
    let status = crate::commands::recording_status(app.state::<RecordingState>())
        .await
        .ok()
        .flatten();
    let mode = TrayMode::of(status.as_ref());
    let title = tray_title(status.as_ref());
    let state = app.state::<MenuBarState>();
    let previous = state.shown.lock().unwrap().replace((mode, title.clone()));
    if previous.as_ref() == Some(&(mode, title.clone())) {
        return;
    }
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let _ = tray.set_title(title.as_deref());
    // Most ticks only move the timer.
    if previous.is_some_and(|(m, _)| m == mode) {
        return;
    }
    if let Ok(icon) = Image::from_bytes(mode.icon()) {
        let _ = tray.set_icon(Some(icon));
        let _ = tray.set_icon_as_template(mode.is_template());
    }
    let _ = tray.set_tooltip(Some(match mode {
        TrayMode::Idle => "Nootle",
        TrayMode::Recording => "Nootle: recording",
        TrayMode::Paused => "Nootle: paused",
    }));
    if let Some(item) = state.record_item.lock().unwrap().as_ref() {
        let _ = item.set_text(if mode == TrayMode::Idle {
            "Start Recording"
        } else {
            "Stop Recording"
        });
    };
}

fn toggle_popover(app: &AppHandle, icon: Rect) -> tauri::Result<()> {
    let state = app.state::<MenuBarState>();
    let just_hidden = state
        .popover_hidden_at
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < REOPEN_GRACE);
    if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
        if popover.is_visible()? {
            return popover.hide();
        }
        if just_hidden {
            return Ok(());
        }
    }

    let popover = match app.get_webview_window(POPOVER_LABEL) {
        Some(popover) => popover,
        None => {
            let popover = WebviewWindowBuilder::new(
                app,
                POPOVER_LABEL,
                WebviewUrl::App("menubar.html".into()),
            )
            .title("Nootle")
            .inner_size(POPOVER_WIDTH, POPOVER_HEIGHT)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .skip_taskbar(true)
            .visible(false)
            .build()?;
            // Like a menu, it goes away when you click elsewhere.
            let handle = app.clone();
            popover.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    hide_popover(&handle);
                }
            });
            popover
        }
    };

    let scale = popover.scale_factor()?;
    let icon_pos = icon.position.to_physical::<f64>(scale);
    let icon_size = icon.size.to_physical::<f64>(scale);
    let monitor = app
        .monitor_from_point(icon_pos.x, icon_pos.y)?
        .or(app.primary_monitor()?);
    let screen = monitor.map_or((0.0, 0.0, f64::MAX, f64::MAX), |m| {
        let (pos, size) = (m.position(), m.size());
        (
            pos.x as f64,
            pos.y as f64,
            size.width as f64,
            size.height as f64,
        )
    });
    let (x, y) = popover_origin(
        (icon_pos.x, icon_pos.y, icon_size.width, icon_size.height),
        (POPOVER_WIDTH * scale, POPOVER_HEIGHT * scale),
        screen,
        POPOVER_GAP * scale,
    );
    popover.set_position(PhysicalPosition::new(x, y))?;
    popover.show()?;
    popover.set_focus()?;
    // Tells an already-loaded popover to fetch what changed while it was hidden.
    popover.emit("menu-bar-shown", ())
}

fn hide_popover(app: &AppHandle) {
    if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
        if popover.is_visible().unwrap_or(false) {
            *app.state::<MenuBarState>()
                .popover_hidden_at
                .lock()
                .unwrap() = Some(Instant::now());
            let _ = popover.hide();
        }
    }
}

/// Brings the main window forward, on the recording when there is one.
fn open_main(app: &AppHandle) {
    hide_popover(app);
    crate::show_main_window(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if crate::remote::is_recording(&app).await {
            let _ = app.emit("open-recording", ());
        }
    });
}

/// What the popover shows about the recording.
#[derive(Serialize)]
pub struct MenuBarStatus {
    pub recording: Option<RecordingStatus>,
    /// The recorded meeting's title.
    pub title: Option<String>,
    /// The newest Live Assist card for the recorded meeting.
    pub live_assist: Option<crate::live_assist::LiveAssistCard>,
}

#[tauri::command]
pub async fn menu_bar_status(
    db: tauri::State<'_, DbState>,
    recording: tauri::State<'_, RecordingState>,
    cards: tauri::State<'_, crate::live_assist::LatestCard>,
) -> Result<MenuBarStatus, String> {
    let Some(status) = crate::commands::recording_status(recording).await? else {
        return Ok(MenuBarStatus {
            recording: None,
            title: None,
            live_assist: None,
        });
    };
    let title = db.get_meeting(&status.meeting_id).ok().map(|m| m.title);
    let live_assist = cards.for_meeting(&status.meeting_id);
    Ok(MenuBarStatus {
        recording: Some(status),
        title,
        live_assist,
    })
}

#[tauri::command]
pub fn menu_bar_open_main(app: AppHandle) {
    open_main(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(paused: bool, elapsed_ms: u64) -> RecordingStatus {
        RecordingStatus {
            meeting_id: "m".into(),
            paused,
            elapsed_ms,
            mic_level: 0.0,
            system_level: None,
        }
    }

    #[test]
    fn mode_follows_the_recording() {
        assert_eq!(TrayMode::of(None), TrayMode::Idle);
        assert_eq!(TrayMode::of(Some(&status(false, 0))), TrayMode::Recording);
        assert_eq!(TrayMode::of(Some(&status(true, 0))), TrayMode::Paused);
        assert!(!TrayMode::Recording.is_template(), "the red dot stays red");
        assert!(TrayMode::Idle.is_template() && TrayMode::Paused.is_template());
    }

    #[test]
    fn elapsed_time_reads_like_a_clock() {
        assert_eq!(format_elapsed(0), "0:00");
        assert_eq!(format_elapsed(65_400), "1:05");
        assert_eq!(format_elapsed(59 * 60_000 + 59_999), "59:59");
        assert_eq!(format_elapsed(3_600_000 + 2 * 60_000 + 9_000), "1:02:09");
    }

    #[test]
    fn title_shows_time_only_while_recording() {
        assert_eq!(tray_title(None), None);
        assert_eq!(
            tray_title(Some(&status(false, 754_000))).as_deref(),
            Some("12:34")
        );
        assert_eq!(
            tray_title(Some(&status(true, 754_000))).as_deref(),
            Some("12:34")
        );
    }

    #[test]
    fn dock_icon_only_hides_with_the_menu_bar_icon() {
        let db = Database::new_in_memory().unwrap();
        assert_eq!(
            MenuBarSettings::load(&db),
            MenuBarSettings {
                show: false,
                hide_dock: false
            },
            "both off by default"
        );
        db.set_setting(HIDE_DOCK_SETTING, "true").unwrap();
        assert!(!MenuBarSettings::load(&db).hides_dock());
        db.set_setting(SETTING_KEY, "true").unwrap();
        assert!(MenuBarSettings::load(&db).hides_dock());
        db.set_setting(HIDE_DOCK_SETTING, "false").unwrap();
        assert!(!MenuBarSettings::load(&db).hides_dock());
    }

    #[test]
    fn popover_centers_under_the_icon() {
        let screen = (0.0, 0.0, 2880.0, 1800.0);
        let (x, y) = popover_origin((1000.0, 0.0, 44.0, 48.0), (680.0, 920.0), screen, 12.0);
        assert_eq!((x, y), (1022.0 - 340.0, 60.0));
    }

    #[test]
    fn popover_stays_on_screen() {
        let screen = (0.0, 0.0, 2880.0, 1800.0);
        let (x, _) = popover_origin((2840.0, 0.0, 40.0, 48.0), (680.0, 920.0), screen, 12.0);
        assert_eq!(x, 2880.0 - 680.0, "kept off the right edge");
        let (x, _) = popover_origin((4.0, 0.0, 40.0, 48.0), (680.0, 920.0), screen, 12.0);
        assert_eq!(x, 0.0, "kept off the left edge");
        // A second display to the left of the main one has negative x.
        let left = (-1920.0, 0.0, 1920.0, 1080.0);
        let (x, _) = popover_origin((-60.0, 0.0, 40.0, 48.0), (680.0, 920.0), left, 12.0);
        assert_eq!(x, -680.0);
    }
}
