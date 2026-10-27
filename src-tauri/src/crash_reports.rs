//! Opt-in crash reports: Rust panics and uncaught frontend errors go to
//! Sentry, with nothing about meetings in them. Off unless turned on in
//! Settings → Privacy, never sent in local-only mode, and a build made
//! without `SENTRY_DSN` has no reporting at all.

use crate::db::Database;
use sentry::protocol::{Event, Exception, Frame, Level, Stacktrace};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// On/off setting for sending crash reports. Off unless turned on.
pub const SETTING_KEY: &str = "crash_reports";

/// Where reports go, baked in at build time so a DSN never lives in git.
const DSN: Option<&str> = option_env!("SENTRY_DSN");

/// Longest error message kept, so a message can't carry much text along.
const MAX_MESSAGE_CHARS: usize = 500;

/// The setting for this process, mirrored so a report sent mid-panic never
/// needs a database read.
static ENABLED: AtomicBool = AtomicBool::new(false);

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
}

/// Whether a report may leave this Mac right now.
fn may_send() -> bool {
    ENABLED.load(Ordering::Relaxed) && !crate::llm::local_only()
}

/// Starts reporting when this build has a DSN. The client always starts so
/// turning the setting on works without a restart; `scrub` drops every
/// report while it's off. Keep the guard for the life of the app so queued
/// reports go out on quit.
pub fn init(db: &Database) -> Option<sentry::ClientInitGuard> {
    set_enabled(db.get_bool_setting(SETTING_KEY, false));
    let dsn = DSN.filter(|d| !d.is_empty())?;
    let mut options = sentry::ClientOptions::default();
    options.release = sentry::release_name!();
    // Breadcrumbs would collect log lines; a crash report needs only the crash.
    options.max_breadcrumbs = 0;
    options.before_send = Some(Arc::new(scrub));
    Some(sentry::init((dsn, options)))
}

fn scrub(event: Event<'static>) -> Option<Event<'static>> {
    may_send().then(|| strip(event))
}

/// Strips anything that could identify the person: the Mac's name, their
/// home folder, extras.
fn strip(mut event: Event<'static>) -> Event<'static> {
    let home = dirs::home_dir().map(|h| h.to_string_lossy().into_owned());
    let clean = |text: &str| {
        let text = match &home {
            Some(home) if !home.is_empty() => text.replace(home.as_str(), "~"),
            _ => text.to_string(),
        };
        text.chars().take(MAX_MESSAGE_CHARS).collect::<String>()
    };
    event.server_name = None;
    event.user = None;
    event.request = None;
    event.extra.clear();
    event.message = event.message.as_deref().map(clean);
    if let Some(entry) = event.logentry.as_mut() {
        entry.message = clean(&entry.message);
        entry.params.clear();
    }
    for exception in event.exception.values.iter_mut() {
        exception.value = exception.value.as_deref().map(clean);
        let frames = exception
            .stacktrace
            .iter_mut()
            .flat_map(|s| s.frames.iter_mut());
        for frame in frames {
            frame.abs_path = frame.abs_path.as_deref().map(clean);
            frame.filename = frame.filename.as_deref().map(clean);
            frame.vars.clear();
        }
    }
    event
}

/// Reports an uncaught error from one of the app's windows. `stack` is the
/// error's `stack` text, in WebKit's or Chromium's format.
#[tauri::command(async)]
pub fn report_frontend_error(name: String, message: String, stack: Option<String>) {
    // `scrub` is the privacy gate; this only skips parsing a stack nobody gets.
    if !may_send() {
        return;
    }
    let frames = stack.as_deref().map(parse_js_stack).unwrap_or_default();
    let exception = Exception {
        ty: if name.is_empty() {
            "Error".into()
        } else {
            name
        },
        value: Some(message),
        stacktrace: (!frames.is_empty()).then(|| Stacktrace {
            frames,
            ..Default::default()
        }),
        ..Default::default()
    };
    sentry::capture_event(Event {
        level: Level::Error,
        platform: "javascript".into(),
        exception: vec![exception].into(),
        ..Default::default()
    });
}

/// Frames from a JavaScript stack, oldest call first as Sentry expects.
/// Reads WebKit's `fn@url:line:col` and Chromium's `at fn (url:line:col)`.
fn parse_js_stack(stack: &str) -> Vec<Frame> {
    let mut frames: Vec<Frame> = stack.lines().filter_map(parse_js_frame).collect();
    frames.reverse();
    frames
}

fn parse_js_frame(line: &str) -> Option<Frame> {
    let line = line.trim();
    let (function, location) = if let Some(rest) = line.strip_prefix("at ") {
        match rest.rsplit_once(" (") {
            Some((function, location)) => (Some(function), location.strip_suffix(')')?),
            None => (None, rest),
        }
    } else {
        match line.rsplit_once('@') {
            Some((function, location)) => ((!function.is_empty()).then_some(function), location),
            None => (None, line),
        }
    };
    let (rest, col) = location.rsplit_once(':')?;
    let (path, lineno) = rest.rsplit_once(':')?;
    Some(Frame {
        function: function.map(str::to_string),
        abs_path: Some(path.to_string()),
        lineno: Some(lineno.parse().ok()?),
        colno: Some(col.parse().ok()?),
        in_app: Some(true),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_webkit_and_chromium_stacks_oldest_first() {
        let webkit = "render@tauri://localhost/assets/index.js:10:5\n\
                      tauri://localhost/assets/index.js:20:7\n\
                      [native code]";
        let frames = parse_js_stack(webkit);
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].function, None);
        assert_eq!(frames[0].lineno, Some(20));
        assert_eq!(frames[1].function.as_deref(), Some("render"));
        assert_eq!(
            frames[1].abs_path.as_deref(),
            Some("tauri://localhost/assets/index.js")
        );
        assert_eq!(frames[1].colno, Some(5));

        let chromium = "TypeError: boom\n    at render (http://localhost:1420/src/App.tsx:3:9)\n    at http://localhost:1420/src/main.tsx:8:1";
        let frames = parse_js_stack(chromium);
        assert_eq!(frames.len(), 2);
        assert_eq!(
            frames[0].abs_path.as_deref(),
            Some("http://localhost:1420/src/main.tsx")
        );
        assert_eq!(frames[1].function.as_deref(), Some("render"));
    }

    #[test]
    fn strips_the_home_folder_and_machine_name() {
        let home = dirs::home_dir().unwrap().to_string_lossy().into_owned();
        let event = Event {
            server_name: Some("Michelles-MacBook".into()),
            exception: vec![Exception {
                ty: "panic".into(),
                value: Some(format!("can't open {home}/Library/x.db")),
                ..Default::default()
            }]
            .into(),
            ..Default::default()
        };
        let event = strip(event);
        assert_eq!(event.server_name, None);
        assert_eq!(
            event.exception.values[0].value.as_deref(),
            Some("can't open ~/Library/x.db")
        );
    }
}
