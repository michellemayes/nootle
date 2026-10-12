//! Remote control via the `nootle://` URL scheme, so tools outside the app
//! (e.g. an external meeting detector) can start and stop recordings.
//!
//! Off by default: any web page can open a `nootle://` link, so actions only run
//! once the user enables `remote_control_enabled` in Settings, and only for
//! links carrying this install's secret `token` (the CLI adds it; Settings
//! shows it for scripts). Every outcome is
//! emitted as `remote-control-result`, and the user gets a system notification
//! for anything worth interrupting them for.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use url::Url;

use crate::commands::{self, DbState, RecordingState};

pub const ENABLED_SETTING: &str = "remote_control_enabled";
/// Secret every link must carry, so a web page can't drive recording just by
/// opening a link. Never exposed to MCP agents.
pub const TOKEN_SETTING: &str = "remote_control_token";

/// This install's URL-control token, created on first use.
pub fn token(db: &crate::db::Database) -> crate::error::Result<String> {
    if let Some(token) = db.get_setting(TOKEN_SETTING)?.filter(|t| !t.is_empty()) {
        return Ok(token);
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    db.set_setting(TOKEN_SETTING, &token)?;
    Ok(token)
}

/// Whether `url` carries the right token, compared in constant time.
fn has_valid_token(db: &crate::db::Database, url: &Url) -> bool {
    let (Some(given), Ok(expected)) = (query_value(url, "token"), token(db)) else {
        return false;
    };
    given.len() == expected.len()
        && given
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

#[derive(Debug, Clone, Serialize)]
pub struct RemoteResult {
    pub action: String,
    pub ok: bool,
    pub message: String,
    /// Present when the action started or stopped a meeting.
    pub meeting_id: Option<String>,
}

/// Outcome of an action, before it is tagged with the action name.
pub(crate) struct Outcome {
    pub(crate) ok: bool,
    pub(crate) message: String,
    meeting_id: Option<String>,
}

impl Outcome {
    fn ok(message: impl Into<String>) -> Self {
        Self {
            ok: true,
            message: message.into(),
            meeting_id: None,
        }
    }

    fn err(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            message: message.into(),
            meeting_id: None,
        }
    }

    fn from_meeting(result: Result<crate::db::Meeting, String>, message: String) -> Self {
        match result {
            Ok(meeting) => Self {
                ok: true,
                message,
                meeting_id: Some(meeting.id),
            },
            Err(e) => Self::err(e),
        }
    }
}

pub(crate) fn query_value(url: &Url, key: &str) -> Option<String> {
    url.query_pairs()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
        .filter(|v| !v.trim().is_empty())
}

/// The action part of the URL, tolerating both `nootle://record/start` (host
/// "record", path "/start") and `nootle:///record/start` (empty host).
fn action_of(url: &Url) -> String {
    let path = url.path().trim_matches('/');
    match url.host_str().filter(|h| !h.is_empty()) {
        Some(host) if !path.is_empty() => format!("{host}/{path}"),
        Some(host) => host.to_string(),
        None => path.to_string(),
    }
}

pub(crate) async fn is_recording(app: &AppHandle) -> bool {
    commands::is_recording(app.state::<RecordingState>())
        .await
        .unwrap_or(false)
}

pub(crate) async fn do_start(app: &AppHandle, title: Option<String>) -> Outcome {
    // A detector that fires twice must not disturb a meeting in progress.
    if is_recording(app).await {
        return Outcome::ok("Already recording");
    }
    // Without a title, start_recording names it after the calendar event
    // happening now, or failing that, the time.
    let result = commands::start_recording(
        app.clone(),
        app.state::<DbState>(),
        app.state::<RecordingState>(),
        title.unwrap_or_default(),
        None,
        None,
    )
    .await;
    match result {
        Ok(meeting) => Outcome {
            ok: true,
            message: format!("Recording '{}'", meeting.title),
            meeting_id: Some(meeting.id),
        },
        Err(e) => Outcome::err(e),
    }
}

async fn do_stop(app: &AppHandle) -> Outcome {
    if !is_recording(app).await {
        return Outcome::ok("Not recording");
    }
    let result =
        commands::stop_recording(app.state::<DbState>(), app.state::<RecordingState>()).await;
    Outcome::from_meeting(result, "Recording stopped".into())
}

async fn run_action(app: &AppHandle, action: &str, title: Option<String>) -> Outcome {
    match action {
        "record/start" => do_start(app, title).await,
        "record/stop" => do_stop(app).await,
        "record/toggle" => {
            if is_recording(app).await {
                do_stop(app).await
            } else {
                do_start(app, title).await
            }
        }
        "record/status" => Outcome::ok(if is_recording(app).await {
            "Recording"
        } else {
            "Idle"
        }),
        // macOS only lists an app under Privacy > Screen Recording once it has
        // asked, so without this there is nothing for the user to enable.
        "permissions/screen" => Outcome::ok(if crate::permissions::request_screen_recording() {
            "Screen recording granted"
        } else {
            "Screen recording not granted; enable Nootle under \
             Privacy & Security > Screen Recording, then restart it"
        }),
        "permissions/status" => Outcome::ok(format!(
            "microphone={} screen_recording={}",
            crate::permissions::check_microphone(),
            crate::permissions::check_screen_recording()
        )),
        other => Outcome::err(format!("Unknown action: {other}")),
    }
}

/// Handle one `nootle://` URL. Never panics; unknown actions are reported, not
/// acted on.
pub async fn handle_url(app: AppHandle, raw: String) {
    let url = match Url::parse(&raw) {
        Ok(u) if u.scheme() == "nootle" => u,
        _ => {
            tracing::warn!("remote: ignoring url {raw:?}");
            return;
        }
    };

    let action = action_of(&url);
    let db = app.state::<DbState>();
    let enabled = db
        .get_setting(ENABLED_SETTING)
        .ok()
        .flatten()
        .is_some_and(|v| v == "true");

    let outcome = if !enabled {
        Outcome::err("URL control is disabled; enable it in Nootle Settings > Recording")
    } else if !has_valid_token(&db, &url) {
        Outcome::err(
            "This nootle:// link is missing Nootle's URL-control token. Copy a link from \
             Settings > Recording, or use nootle-cli record.",
        )
    } else {
        run_action(&app, &action, query_value(&url, "title")).await
    };

    if outcome.ok {
        tracing::info!("remote: {action}: {}", outcome.message);
    } else {
        tracing::warn!("remote: {action} failed: {}", outcome.message);
    }
    // Only a started/stopped meeting or a failure is worth interrupting for.
    if !outcome.ok || outcome.meeting_id.is_some() {
        let title = if outcome.ok {
            "Nootle"
        } else {
            "Nootle: URL action failed"
        };
        crate::notify(&app, title, &outcome.message);
    }
    let result = RemoteResult {
        action,
        ok: outcome.ok,
        message: outcome.message,
        meeting_id: outcome.meeting_id,
    };
    let _ = app.emit("remote-control-result", &result);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Url {
        Url::parse(raw).expect("valid url")
    }

    #[test]
    fn action_from_host_and_path() {
        assert_eq!(action_of(&parse("nootle://record/start")), "record/start");
        assert_eq!(action_of(&parse("nootle://record/stop")), "record/stop");
        assert_eq!(action_of(&parse("nootle://record")), "record");
    }

    #[test]
    fn action_tolerates_triple_slash() {
        // `open` and some launchers normalise nootle://record/start into
        // nootle:///record/start, which puts everything in the path.
        assert_eq!(action_of(&parse("nootle:///record/start")), "record/start");
        assert_eq!(action_of(&parse("nootle:///record/stop")), "record/stop");
    }

    #[test]
    fn title_is_decoded() {
        let url = parse("nootle://record/start?title=Staff%20sync");
        assert_eq!(query_value(&url, "title").as_deref(), Some("Staff sync"));
    }

    #[test]
    fn blank_title_is_treated_as_absent() {
        assert_eq!(
            query_value(&parse("nootle://record/start?title="), "title"),
            None
        );
        assert_eq!(
            query_value(&parse("nootle://record/start?title=%20%20"), "title"),
            None
        );
    }

    #[test]
    fn links_need_this_installs_token() {
        let db = crate::db::Database::new_in_memory().unwrap();
        let token = token(&db).unwrap();
        assert_eq!(token.len(), 32);
        assert_eq!(super::token(&db).unwrap(), token, "stable once created");
        let with = |t: &str| parse(&format!("nootle://record/start?token={t}"));
        assert!(has_valid_token(&db, &with(&token)));
        assert!(!has_valid_token(&db, &with("guess")));
        assert!(!has_valid_token(&db, &parse("nootle://record/start")));
        assert!(
            !crate::ops::settings_map(&db)
                .unwrap()
                .contains_key(TOKEN_SETTING),
            "agents can't read the token"
        );
    }

    #[test]
    fn missing_title_is_absent() {
        assert_eq!(query_value(&parse("nootle://record/start"), "title"), None);
    }
}
