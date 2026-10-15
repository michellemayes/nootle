//! Takes a meeting outside Nootle on purpose: a public share link to its
//! notes, and a hand-off to Claude to keep talking about it.
//!
//! Share links are secret GitHub Gists in the user's own account: unlisted,
//! readable by anyone with the link, and gone when the link is revoked.
//! Nootle runs no server, so the note lives somewhere the user controls.

use crate::db::{Database, MeetingShare};
use crate::export::meeting_as_markdown;
use std::sync::Arc;

const GISTS_API: &str = "https://api.github.com/gists";

/// Longest prompt put in a Claude link. Percent-encoding can triple it, and
/// links much past ~16 KB get refused before they reach Claude.
const CLAUDE_PROMPT_MAX_CHARS: usize = 5_000;

const NO_TOKEN: &str = "Connect GitHub in Settings → Integrations (or sign in with \
    `gh auth login`) to create share links. They're secret gists in your account.";

/// A token that can write gists: the connected GitHub integration's, or the
/// GitHub CLI's.
async fn github_token(db: &Database) -> Result<String, String> {
    let stored = db
        .get_integration_by_type("github")
        .map_err(|e| e.to_string())?
        .and_then(|i| serde_json::from_str::<serde_json::Value>(&i.credentials_json).ok())
        .and_then(|c| c["token"].as_str().map(str::to_string))
        .filter(|t| !t.is_empty());
    match stored {
        Some(token) => Ok(token),
        None => crate::github_cli::token()
            .await
            .ok_or_else(|| NO_TOKEN.into()),
    }
}

async fn send_gist(
    method: reqwest::Method,
    url: &str,
    token: &str,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, String> {
    let mut request = crate::http::CLIENT
        .request(method, url)
        .bearer_auth(token)
        .header("User-Agent", "Nootle")
        .header("Accept", "application/vnd.github+json");
    if let Some(body) = body {
        request = request.json(&body);
    }
    request
        .send()
        .await
        .map_err(|e| format!("Couldn't reach GitHub: {e}"))
}

/// GitHub's reason, with a hint for the usual cause: a token without `gist`.
async fn gist_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.unwrap_or_default();
    let message = body["message"].as_str().unwrap_or("request failed");
    if matches!(status.as_u16(), 401 | 403 | 404) {
        format!(
            "GitHub refused the share link ({message}). The token needs the `gist` scope: \
             reconnect GitHub in Settings → Integrations, or run `gh auth refresh -s gist`."
        )
    } else {
        format!("GitHub couldn't create the share link: {message}")
    }
}

/// The note people see at the link. The transcript is left out unless asked
/// for: notes are usually what's meant to be shared.
fn shared_markdown(
    db: &Database,
    meeting_id: &str,
    include_transcript: bool,
) -> Result<String, String> {
    let md = meeting_as_markdown(db, meeting_id, include_transcript).map_err(|e| e.to_string())?;
    Ok(format!(
        "{md}\n---\n\n_Shared from [Nootle](https://github.com/michellemayes/nootle)_\n"
    ))
}

/// Creates the meeting's share link, or brings the existing one up to date
/// with the meeting as it is now.
pub async fn share_meeting(
    db: &Arc<Database>,
    meeting_id: &str,
    include_transcript: bool,
) -> Result<MeetingShare, String> {
    crate::llm::ensure_may_send_to_integrations(db)?;
    // Before rendering the meeting, so a missing token fails fast.
    let token = github_token(db).await?;
    let (title, content, existing) = {
        let (db, id) = (db.clone(), meeting_id.to_string());
        tokio::task::spawn_blocking(move || -> Result<_, String> {
            let title = db.get_meeting(&id).map_err(|e| e.to_string())?.title;
            let content = shared_markdown(&db, &id, include_transcript)?;
            let existing = db.get_meeting_share(&id).map_err(|e| e.to_string())?;
            Ok((title, content, existing))
        })
        .await
        .map_err(|e| e.to_string())??
    };
    let file_name = format!("{}.md", crate::workflows::sanitize_filename(&title));

    // Rename the old file rather than adding a second one beside it.
    if let Some(share) = &existing {
        let body = serde_json::json!({
            "description": title,
            "files": { share.file_name.as_str(): { "filename": file_name, "content": content } },
        });
        let url = format!("{GISTS_API}/{}", share.gist_id);
        let resp = send_gist(reqwest::Method::PATCH, &url, &token, Some(body)).await?;
        if resp.status().is_success() {
            return db
                .save_meeting_share(
                    meeting_id,
                    &share.gist_id,
                    &share.url,
                    &file_name,
                    include_transcript,
                )
                .map_err(|e| e.to_string());
        }
        // Deleted on GitHub since: fall through and make a new one.
        if resp.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(gist_error(resp).await);
        }
    }

    let body = serde_json::json!({
        "description": title,
        "public": false,
        "files": { file_name.as_str(): { "content": content } },
    });
    let resp = send_gist(reqwest::Method::POST, GISTS_API, &token, Some(body)).await?;
    if !resp.status().is_success() {
        return Err(gist_error(resp).await);
    }
    let gist: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Unexpected reply from GitHub: {e}"))?;
    let (Some(id), Some(url)) = (gist["id"].as_str(), gist["html_url"].as_str()) else {
        return Err("Unexpected reply from GitHub: no gist link".into());
    };
    db.save_meeting_share(meeting_id, id, url, &file_name, include_transcript)
        .map_err(|e| e.to_string())
}

/// Deletes the share link's gist, so the link stops working.
pub async fn unshare_meeting(db: &Database, meeting_id: &str) -> Result<(), String> {
    let Some(share) = db
        .get_meeting_share(meeting_id)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    delete_gist(&github_token(db).await?, &share.gist_id).await?;
    db.delete_meeting_share(meeting_id)
        .map_err(|e| e.to_string())
}

async fn delete_gist(token: &str, gist_id: &str) -> Result<(), String> {
    let url = format!("{GISTS_API}/{gist_id}");
    let resp = send_gist(reqwest::Method::DELETE, &url, token, None).await?;
    // Already deleted on GitHub counts as done.
    if resp.status().is_success() || resp.status() == reqwest::StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(gist_error(resp).await)
    }
}

/// Revokes a deleted meeting's share link in the background, so deleting a
/// meeting never leaves its notes readable at an old link. Call before the
/// meeting (and its share row) is deleted.
pub fn revoke_after_delete(db: &Arc<Database>, meeting_id: &str) {
    let Ok(Some(share)) = db.get_meeting_share(meeting_id) else {
        return;
    };
    let db = db.clone();
    tauri::async_runtime::spawn(async move {
        let result = async { delete_gist(&github_token(&db).await?, &share.gist_id).await }.await;
        if let Err(e) = result {
            tracing::warn!("Couldn't revoke share link {}: {e}", share.url);
        }
    });
}

/// A first message for Claude about this meeting: its notes, plus as much of
/// the transcript as fits in a link. `rest` is the whole meeting when any of
/// it was left out, so the caller can offer it another way.
#[derive(Debug)]
pub struct ClaudePrompt {
    pub prompt: String,
    pub rest: Option<String>,
}

pub fn claude_prompt(db: &Database, meeting_id: &str) -> Result<ClaudePrompt, String> {
    crate::llm::ensure_may_send(db, "Claude")?;
    let markdown = |include_transcript| {
        meeting_as_markdown(db, meeting_id, include_transcript).map_err(|e| e.to_string())
    };
    let link = db
        .get_meeting_share(meeting_id)
        .ok()
        .flatten()
        .filter(|s| s.include_transcript)
        .map(|s| format!("The full notes and transcript are at {}\n\n", s.url))
        .unwrap_or_default();
    build_claude_prompt(&link, markdown(true)?, || markdown(false))
}

fn build_claude_prompt(
    link: &str,
    full: String,
    notes: impl FnOnce() -> Result<String, String>,
) -> Result<ClaudePrompt, String> {
    let intro = "I'd like to keep discussing this meeting. Here are my notes from Nootle:\n\n";
    let outro = "\n\nRead them, then let's talk it through.";
    let budget = CLAUDE_PROMPT_MAX_CHARS
        .saturating_sub(intro.chars().count() + link.chars().count() + outro.chars().count());
    if full.chars().nth(budget).is_none() {
        return Ok(ClaudePrompt {
            prompt: format!("{intro}{link}{}{outro}", full.trim()),
            rest: None,
        });
    }
    let trimmed = "\n\n…(trimmed)";
    let room = budget.saturating_sub(trimmed.chars().count());
    let body = crate::ops::truncate_at_word_boundary(&notes()?, room, trimmed);
    Ok(ClaudePrompt {
        prompt: format!("{intro}{link}{body}{outro}"),
        rest: Some(full),
    })
}

/// Whether the Claude desktop app is installed, so a hand-off can open it
/// instead of claude.ai in the browser.
pub fn claude_desktop_installed() -> bool {
    let user_apps = dirs::home_dir().map(|h| h.join("Applications/Claude.app"));
    std::iter::once(std::path::PathBuf::from("/Applications/Claude.app"))
        .chain(user_apps)
        .any(|p| p.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unused_notes() -> Result<String, String> {
        panic!("notes are only built when the meeting doesn't fit")
    }

    #[test]
    fn claude_prompt_keeps_a_short_meeting_whole() {
        let full = "# Sync\n\n## Transcript\n\nhi\n".to_string();
        let p = build_claude_prompt("", full, unused_notes).unwrap();
        assert!(p.rest.is_none());
        assert!(p.prompt.contains("## Transcript"), "{}", p.prompt);
        assert!(p
            .prompt
            .starts_with("I'd like to keep discussing this meeting"));
    }

    #[test]
    fn claude_prompt_drops_a_long_transcript_and_fits_the_link() {
        let full = format!("# Sync\n\n## Transcript\n\n{}", "word ".repeat(5_000));
        let notes = format!("# Sync\n\n## Notes\n\n{}", "note ".repeat(5_000));
        let p = build_claude_prompt("", full.clone(), || Ok(notes)).unwrap();
        assert_eq!(p.rest, Some(full));
        assert!(!p.prompt.contains("## Transcript"));
        assert!(p.prompt.contains("…(trimmed)"));
        assert!(p.prompt.chars().count() <= CLAUDE_PROMPT_MAX_CHARS);
    }

    #[test]
    fn shared_note_leaves_out_the_transcript_unless_asked() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "Launch sync".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        db.create_transcript_segment(crate::db::NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: "Sam".into(),
            text: "Secret aside".into(),
            start_ms: 0,
            end_ms: 1_000,
            confidence: 0.9,
        })
        .unwrap();
        let notes = shared_markdown(&db, &meeting.id, false).unwrap();
        assert!(notes.starts_with("# Launch sync"), "{notes}");
        assert!(!notes.contains("Secret aside"), "{notes}");
        assert!(notes.contains("Shared from [Nootle]"), "{notes}");
        assert!(shared_markdown(&db, &meeting.id, true)
            .unwrap()
            .contains("Secret aside"));
    }

    #[tokio::test]
    async fn sharing_is_refused_in_local_only_mode() {
        let db = Arc::new(Database::new_in_memory().unwrap());
        db.set_setting(crate::llm::LOCAL_ONLY_SETTING, "true")
            .unwrap();
        assert!(share_meeting(&db, "m", false).await.is_err());
        assert!(claude_prompt(&db, "m").is_err());
    }

    #[test]
    fn share_rows_follow_their_meeting() {
        let db = Database::new_in_memory().unwrap();
        let meeting = db
            .create_meeting(crate::db::NewMeeting {
                title: "T".into(),
                calendar_event_id: None,
                template_id: None,
            })
            .unwrap();
        assert!(db.get_meeting_share(&meeting.id).unwrap().is_none());
        db.save_meeting_share(
            &meeting.id,
            "g1",
            "https://gist.github.com/g1",
            "T.md",
            false,
        )
        .unwrap();
        let share = db
            .save_meeting_share(
                &meeting.id,
                "g1",
                "https://gist.github.com/g1",
                "T2.md",
                true,
            )
            .unwrap();
        assert_eq!(share.file_name, "T2.md");
        assert!(share.include_transcript);
        db.delete_meeting(&meeting.id).unwrap();
        assert!(db.get_meeting_share(&meeting.id).unwrap().is_none());
    }
}
