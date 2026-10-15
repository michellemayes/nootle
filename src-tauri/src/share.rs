//! Takes a meeting outside Nootle on purpose: a public share link to its
//! notes, and a hand-off to Claude to keep talking about it.
//!
//! Share links live on nootle.ai and are end-to-end encrypted: the note is
//! encrypted here with a key of its own, only the ciphertext is uploaded, and
//! the key goes in the link's #fragment, which browsers never send to a
//! server. The share page decrypts it in the reader's browser, so nootle.ai
//! (and Vercel, which hosts it) can't read what's shared.

use crate::db::{Database, MeetingShare};
use crate::export::meeting_as_markdown;
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key};
use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use base64::Engine;
use std::sync::Arc;

const SHARE_SITE: &str = "https://nootle.ai";

/// Longest prompt put in a Claude link. Percent-encoding can triple it, and
/// links much past ~16 KB get refused before they reach Claude.
const CLAUDE_PROMPT_MAX_CHARS: usize = 5_000;

/// Encrypts `plaintext` with AES-256-GCM into the `{ iv, ciphertext }` the
/// share page decrypts with WebCrypto (the tag rides at the ciphertext's end).
fn seal(key: &Key<Aes256Gcm>, plaintext: &str) -> serde_json::Value {
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = Aes256Gcm::new(key)
        .encrypt(&nonce, plaintext.as_bytes())
        .expect("AES-GCM encrypts any input that fits in memory");
    serde_json::json!({
        "iv": BASE64URL.encode(nonce),
        "ciphertext": BASE64URL.encode(ciphertext),
    })
}

/// A request to the share API, authorized by the share's token when given.
async fn send_share(
    method: reqwest::Method,
    path: &str,
    token: Option<&str>,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, String> {
    let mut request = crate::http::CLIENT
        .request(method, format!("{SHARE_SITE}/api/shares{path}"))
        .header("User-Agent", "Nootle");
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    request
        .send()
        .await
        .map_err(|e| format!("Couldn't reach nootle.ai: {e}"))
}

fn share_error(resp: &reqwest::Response) -> String {
    format!(
        "nootle.ai couldn't save the share link ({}).",
        resp.status()
    )
}

/// Creates the meeting's share link, or brings the existing one up to date
/// with the meeting as it is now, keeping its link.
pub async fn share_meeting(
    db: &Arc<Database>,
    meeting_id: &str,
    include_transcript: bool,
) -> Result<MeetingShare, String> {
    crate::llm::ensure_may_send(db, "nootle.ai")?;
    let (content, existing) = {
        let (db, id) = (db.clone(), meeting_id.to_string());
        tokio::task::spawn_blocking(move || -> Result<_, String> {
            let content =
                meeting_as_markdown(&db, &id, include_transcript).map_err(|e| e.to_string())?;
            let existing = db.get_meeting_share(&id).map_err(|e| e.to_string())?;
            Ok((content, existing))
        })
        .await
        .map_err(|e| e.to_string())??
    };

    if let Some(share) = existing {
        let key = BASE64URL
            .decode(&share.key)
            .map_err(|e| format!("Stored share key is corrupt: {e}"))?;
        let body = seal(Key::<Aes256Gcm>::from_slice(&key), &content);
        let path = format!("/{}", share.share_id);
        let resp = send_share(reqwest::Method::PUT, &path, Some(&share.token), Some(body)).await?;
        if resp.status().is_success() {
            return db
                .save_meeting_share(MeetingShare {
                    include_transcript,
                    ..share
                })
                .map_err(|e| e.to_string());
        }
        // Gone from nootle.ai since: fall through and make a new link.
        if resp.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(share_error(&resp));
        }
    }

    let key = Aes256Gcm::generate_key(OsRng);
    let resp = send_share(reqwest::Method::POST, "", None, Some(seal(&key, &content))).await?;
    if !resp.status().is_success() {
        return Err(share_error(&resp));
    }
    #[derive(serde::Deserialize)]
    struct Created {
        id: String,
        token: String,
    }
    let created: Created = resp
        .json()
        .await
        .map_err(|e| format!("Unexpected reply from nootle.ai: {e}"))?;
    let key = BASE64URL.encode(key);
    db.save_meeting_share(MeetingShare {
        meeting_id: meeting_id.to_string(),
        url: format!("{SHARE_SITE}/s/{}#{key}", created.id),
        share_id: created.id,
        key,
        token: created.token,
        include_transcript,
        updated_at: String::new(),
    })
    .map_err(|e| e.to_string())
}

/// Deletes the shared note from nootle.ai, so the link stops working.
pub async fn unshare_meeting(db: &Database, meeting_id: &str) -> Result<(), String> {
    let Some(share) = db
        .get_meeting_share(meeting_id)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    delete_share(&share).await?;
    db.delete_meeting_share(meeting_id)
        .map_err(|e| e.to_string())
}

async fn delete_share(share: &MeetingShare) -> Result<(), String> {
    let path = format!("/{}", share.share_id);
    let resp = send_share(reqwest::Method::DELETE, &path, Some(&share.token), None).await?;
    // Already gone counts as done.
    if resp.status().is_success() || resp.status() == reqwest::StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(format!(
            "nootle.ai couldn't delete the share link ({}).",
            resp.status()
        ))
    }
}

/// Revokes a deleted meeting's share link in the background, so deleting a
/// meeting never leaves its notes readable at an old link. Call before the
/// meeting (and its share row) is deleted.
pub fn revoke_after_delete(db: &Database, meeting_id: &str) {
    let Ok(Some(share)) = db.get_meeting_share(meeting_id) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        if let Err(e) = delete_share(&share).await {
            tracing::warn!("Couldn't revoke share link {}: {e}", share.share_id);
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
    build_claude_prompt(markdown(true)?, || markdown(false))
}

fn build_claude_prompt(
    full: String,
    notes: impl FnOnce() -> Result<String, String>,
) -> Result<ClaudePrompt, String> {
    let intro = "I'd like to keep discussing this meeting. Here are my notes from Nootle:\n\n";
    let outro = "\n\nRead them, then let's talk it through.";
    let budget =
        CLAUDE_PROMPT_MAX_CHARS.saturating_sub(intro.chars().count() + outro.chars().count());
    if full.chars().nth(budget).is_none() {
        return Ok(ClaudePrompt {
            prompt: format!("{intro}{}{outro}", full.trim()),
            rest: None,
        });
    }
    let trimmed = "\n\n…(trimmed)";
    let room = budget.saturating_sub(trimmed.chars().count());
    let body = crate::ops::truncate_at_word_boundary(&notes()?, room, trimmed);
    Ok(ClaudePrompt {
        prompt: format!("{intro}{body}{outro}"),
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
        let p = build_claude_prompt(full, unused_notes).unwrap();
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
        let p = build_claude_prompt(full.clone(), || Ok(notes)).unwrap();
        assert_eq!(p.rest, Some(full));
        assert!(!p.prompt.contains("## Transcript"));
        assert!(p.prompt.contains("…(trimmed)"));
        assert!(p.prompt.chars().count() <= CLAUDE_PROMPT_MAX_CHARS);
    }

    #[test]
    fn sealed_notes_open_with_their_key_only() {
        let key = Aes256Gcm::generate_key(OsRng);
        let sealed = seal(&key, "# Launch sync");
        let decode = |field: &str| BASE64URL.decode(sealed[field].as_str().unwrap()).unwrap();
        let (iv, ciphertext) = (decode("iv"), decode("ciphertext"));
        // The share page expects a 12-byte nonce and the 16-byte tag appended.
        assert_eq!(iv.len(), 12);
        assert_eq!(ciphertext.len(), "# Launch sync".len() + 16);
        let nonce = aes_gcm::Nonce::from_slice(&iv);
        let opened = Aes256Gcm::new(&key)
            .decrypt(nonce, ciphertext.as_slice())
            .unwrap();
        assert_eq!(opened, b"# Launch sync");
        let other = Aes256Gcm::generate_key(OsRng);
        assert!(Aes256Gcm::new(&other)
            .decrypt(nonce, ciphertext.as_slice())
            .is_err());
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
        let notes = meeting_as_markdown(&db, &meeting.id, false).unwrap();
        assert!(notes.starts_with("# Launch sync"), "{notes}");
        assert!(!notes.contains("Secret aside"), "{notes}");
        assert!(meeting_as_markdown(&db, &meeting.id, true)
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
        let share = MeetingShare {
            meeting_id: meeting.id.clone(),
            share_id: "s1".into(),
            url: "https://nootle.ai/s/s1#k".into(),
            key: "k".into(),
            token: "t".into(),
            include_transcript: false,
            updated_at: String::new(),
        };
        db.save_meeting_share(share.clone()).unwrap();
        let saved = db
            .save_meeting_share(MeetingShare {
                include_transcript: true,
                ..share
            })
            .unwrap();
        assert!(saved.include_transcript);
        assert!(!saved.updated_at.is_empty());
        assert_eq!(
            db.get_meeting_share(&meeting.id).unwrap().unwrap().token,
            "t"
        );
        db.delete_meeting(&meeting.id).unwrap();
        assert!(db.get_meeting_share(&meeting.id).unwrap().is_none());
    }
}
