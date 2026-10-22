//! A public share link to a meeting's notes.
//!
//! Share links live on nootle.ai and are end-to-end encrypted: the note is
//! encrypted here with a key of its own, only the ciphertext is uploaded, and
//! the key goes in the link's #fragment, which browsers never send to a
//! server. The share page decrypts it in the reader's browser, so nootle.ai
//! (and Vercel, which hosts it) can't read what's shared.
//!
//! The AI connector lets Claude and other cloud AI clients read the shares the
//! user ticks for it, through nootle.ai's MCP server. Its list of those shares,
//! with their keys, is sealed the same way under a key of its own, which only
//! the connector link holds. The AI client sends that link with each request,
//! so nootle.ai can open the notes in memory to answer it, and never stores
//! the key.

use crate::db::{Database, MeetingShare};
use crate::export::meeting_as_markdown;
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key};
use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use base64::Engine;
use std::sync::Arc;

const SHARE_SITE: &str = "https://nootle.ai";
/// The connector's id, key and token, as JSON.
const CONNECTOR_SETTING: &str = "ai_connector";

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

/// A request to nootle.ai's API (`/api/shares…` or `/api/connectors…`),
/// authorized by the share's or connector's token when given.
async fn send_api(
    method: reqwest::Method,
    path: &str,
    token: Option<&str>,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, String> {
    let mut request = crate::http::CLIENT
        .request(method, format!("{SHARE_SITE}/api{path}"))
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

fn api_error(resp: &reqwest::Response, what: &str) -> String {
    format!("nootle.ai couldn't {what} ({}).", resp.status())
}

/// Deletes a share or connector from nootle.ai. Already gone counts as done.
async fn delete_api(path: &str, token: &str, what: &str) -> Result<(), String> {
    let resp = send_api(reqwest::Method::DELETE, path, Some(token), None).await?;
    if resp.status().is_success() || resp.status() == reqwest::StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(api_error(&resp, what))
    }
}

/// Creates the meeting's share link, or brings the existing one up to date
/// with the meeting as it is now, keeping its link.
pub async fn share_meeting(
    db: &Arc<Database>,
    meeting_id: &str,
    include_transcript: bool,
    ai_access: bool,
) -> Result<MeetingShare, String> {
    let (share, was_listed) = save_share(db, meeting_id, include_transcript, ai_access).await?;
    // The connector lists titles, so a listed share may have a new one.
    if was_listed || ai_access {
        sync_connector(db).await?;
    }
    Ok(share)
}

/// Uploads the note and saves its share, saying whether the share was
/// already listed by the connector.
async fn save_share(
    db: &Arc<Database>,
    meeting_id: &str,
    include_transcript: bool,
    ai_access: bool,
) -> Result<(MeetingShare, bool), String> {
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
    let was_listed = existing.as_ref().is_some_and(|s| s.ai_access);

    if let Some(share) = existing {
        let key = BASE64URL
            .decode(&share.key)
            .map_err(|e| format!("Stored share key is corrupt: {e}"))?;
        let body = seal(Key::<Aes256Gcm>::from_slice(&key), &content);
        let path = format!("/shares/{}", share.share_id);
        let resp = send_api(reqwest::Method::PUT, &path, Some(&share.token), Some(body)).await?;
        if resp.status().is_success() {
            let share = db
                .save_meeting_share(MeetingShare {
                    include_transcript,
                    ai_access,
                    ..share
                })
                .map_err(|e| e.to_string())?;
            return Ok((share, was_listed));
        }
        // Gone from nootle.ai since: fall through and make a new link.
        if resp.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(api_error(&resp, "save the share link"));
        }
    }

    let key = Aes256Gcm::generate_key(OsRng);
    let resp = send_api(
        reqwest::Method::POST,
        "/shares",
        None,
        Some(seal(&key, &content)),
    )
    .await?;
    if !resp.status().is_success() {
        return Err(api_error(&resp, "save the share link"));
    }
    let created = created(resp).await?;
    let key = BASE64URL.encode(key);
    let share = db
        .save_meeting_share(MeetingShare {
            meeting_id: meeting_id.to_string(),
            url: format!("{SHARE_SITE}/s/{}#{key}", created.id),
            share_id: created.id,
            key,
            token: created.token,
            include_transcript,
            ai_access,
            updated_at: String::new(),
        })
        .map_err(|e| e.to_string())?;
    Ok((share, was_listed))
}

#[derive(serde::Deserialize)]
struct Created {
    id: String,
    token: String,
}

/// The id and token nootle.ai gives a new share or connector.
async fn created(resp: reqwest::Response) -> Result<Created, String> {
    resp.json()
        .await
        .map_err(|e| format!("Unexpected reply from nootle.ai: {e}"))
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
        .map_err(|e| e.to_string())?;
    if share.ai_access {
        sync_connector(db).await?;
    }
    Ok(())
}

async fn delete_share(share: &MeetingShare) -> Result<(), String> {
    let path = format!("/shares/{}", share.share_id);
    delete_api(&path, &share.token, "delete the share link").await
}

/// Revokes a deleted meeting's share link in the background, so deleting a
/// meeting never leaves its notes readable at an old link. Call before the
/// meeting (and its share row) is deleted.
pub fn revoke_after_delete(db: &Arc<Database>, meeting_id: &str) {
    let Ok(Some(share)) = db.get_meeting_share(meeting_id) else {
        return;
    };
    // The row goes with the meeting anyway; dropping it now keeps it out of
    // the connector's list.
    if let Err(e) = db.delete_meeting_share(meeting_id) {
        tracing::warn!("Couldn't forget share link {}: {e}", share.share_id);
    }
    let db = db.clone();
    tauri::async_runtime::spawn(async move {
        let sync = async {
            if share.ai_access {
                sync_connector(&db).await
            } else {
                Ok(())
            }
        };
        let (revoked, synced) = tokio::join!(delete_share(&share), sync);
        if let Err(e) = revoked {
            tracing::warn!("Couldn't revoke share link {}: {e}", share.share_id);
        }
        if let Err(e) = synced {
            tracing::warn!("Couldn't update the AI connector: {e}");
        }
    });
}

// --- AI connector ---

#[derive(serde::Serialize, serde::Deserialize)]
struct Connector {
    id: String,
    /// Opens the connector's list of shares, base64url. Only the link holds it.
    key: String,
    /// Lets this Mac update or delete the connector.
    token: String,
}

impl Connector {
    fn url(&self) -> String {
        format!("{SHARE_SITE}/mcp/{}.{}", self.id, self.key)
    }

    fn path(&self) -> String {
        format!("/connectors/{}", self.id)
    }
}

fn connector(db: &Database) -> Result<Option<Connector>, String> {
    let Some(json) = db
        .get_setting(CONNECTOR_SETTING)
        .map_err(|e| e.to_string())?
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };
    serde_json::from_str(&json)
        .map(Some)
        .map_err(|e| format!("Stored AI connector is corrupt: {e}"))
}

fn save_connector(db: &Database, connector: Option<&Connector>) -> Result<(), String> {
    let json = connector.map_or(Ok(String::new()), serde_json::to_string);
    db.set_setting(CONNECTOR_SETTING, &json.map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

/// The list of shares the connector may read, sealed with its `key`.
fn sealed_connector_list(db: &Database, key: &str) -> Result<serde_json::Value, String> {
    let meetings = db.list_connector_meetings().map_err(|e| e.to_string())?;
    let key = BASE64URL
        .decode(key)
        .map_err(|e| format!("Stored connector key is corrupt: {e}"))?;
    let list = serde_json::json!({ "meetings": meetings }).to_string();
    Ok(seal(Key::<Aes256Gcm>::from_slice(&key), &list))
}

/// The connector link to paste into an AI client, if the connector is on.
pub fn connector_url(db: &Database) -> Result<Option<String>, String> {
    Ok(connector(db)?.map(|c| c.url()))
}

/// Turns the connector on with a new link, replacing (and so revoking) any
/// earlier one. Returns the link.
pub async fn create_connector(db: &Arc<Database>) -> Result<String, String> {
    crate::llm::ensure_may_send(db, "nootle.ai")?;
    let key = BASE64URL.encode(Aes256Gcm::generate_key(OsRng));
    let body = sealed_connector_list(db, &key)?;
    let resp = send_api(reqwest::Method::POST, "/connectors", None, Some(body)).await?;
    if !resp.status().is_success() {
        return Err(api_error(&resp, "create the connector"));
    }
    let created = created(resp).await?;
    let old = connector(db)?;
    let connector = Connector {
        id: created.id,
        key,
        token: created.token,
    };
    save_connector(db, Some(&connector))?;
    if let Some(old) = old {
        delete_api(&old.path(), &old.token, "revoke the old connector link").await?;
    }
    Ok(connector.url())
}

/// Turns the connector off: its link stops working.
pub async fn delete_connector(db: &Database) -> Result<(), String> {
    let Some(connector) = connector(db)? else {
        return Ok(());
    };
    delete_api(
        &connector.path(),
        &connector.token,
        "turn the connector off",
    )
    .await?;
    save_connector(db, None)
}

/// Brings the connector's list up to date with the shares, if it's on.
async fn sync_connector(db: &Database) -> Result<(), String> {
    let Some(connector) = connector(db)? else {
        return Ok(());
    };
    let body = sealed_connector_list(db, &connector.key)?;
    let resp = send_api(
        reqwest::Method::PUT,
        &connector.path(),
        Some(&connector.token),
        Some(body),
    )
    .await?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        save_connector(db, None)?;
        return Err(
            "The AI connector is gone from nootle.ai. Set it up again in Settings → Integrations."
                .into(),
        );
    }
    if !resp.status().is_success() {
        return Err(api_error(&resp, "update the AI connector"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(sealed: &serde_json::Value, field: &str) -> Vec<u8> {
        BASE64URL.decode(sealed[field].as_str().unwrap()).unwrap()
    }

    /// Opens what `seal` sealed, as the share page and nootle.ai's MCP server do.
    fn unseal(key: &Key<Aes256Gcm>, sealed: &serde_json::Value) -> aes_gcm::aead::Result<Vec<u8>> {
        Aes256Gcm::new(key).decrypt(
            aes_gcm::Nonce::from_slice(&decode(sealed, "iv")),
            decode(sealed, "ciphertext").as_slice(),
        )
    }

    #[test]
    fn sealed_notes_open_with_their_key_only() {
        let key = Aes256Gcm::generate_key(OsRng);
        let sealed = seal(&key, "# Launch sync");
        // The share page expects a 12-byte nonce and the 16-byte tag appended.
        assert_eq!(decode(&sealed, "iv").len(), 12);
        assert_eq!(
            decode(&sealed, "ciphertext").len(),
            "# Launch sync".len() + 16
        );
        assert_eq!(unseal(&key, &sealed).unwrap(), b"# Launch sync");
        let other = Aes256Gcm::generate_key(OsRng);
        assert!(unseal(&other, &sealed).is_err());
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
        assert!(share_meeting(&db, "m", false, false).await.is_err());
        assert!(create_connector(&db).await.is_err());
    }

    #[test]
    fn connector_lists_only_the_shares_ticked_for_it() {
        let db = Database::new_in_memory().unwrap();
        let share = |title: &str, ai_access: bool| {
            let meeting = db
                .create_meeting(crate::db::NewMeeting {
                    title: title.into(),
                    calendar_event_id: None,
                    template_id: None,
                })
                .unwrap();
            db.save_meeting_share(MeetingShare {
                meeting_id: meeting.id,
                share_id: format!("share-{title}"),
                url: String::new(),
                key: format!("key-{title}"),
                token: "t".into(),
                include_transcript: false,
                ai_access,
                updated_at: String::new(),
            })
            .unwrap();
        };
        share("Standup", true);
        share("Offsite", true);
        share("1:1", false);

        let key = Aes256Gcm::generate_key(OsRng);
        let sealed = sealed_connector_list(&db, &BASE64URL.encode(key)).unwrap();
        #[derive(serde::Deserialize)]
        struct List {
            meetings: Vec<crate::db::ConnectorMeeting>,
        }
        let list: List = serde_json::from_slice(&unseal(&key, &sealed).unwrap()).unwrap();
        let mut titles: Vec<_> = list.meetings.iter().map(|m| m.title.as_str()).collect();
        titles.sort();
        assert_eq!(titles, ["Offsite", "Standup"]);
        let standup = list.meetings.iter().find(|m| m.title == "Standup").unwrap();
        assert_eq!(
            (standup.id.as_str(), standup.key.as_str()),
            ("share-Standup", "key-Standup")
        );
        assert!(!standup.date.is_empty());
    }

    #[test]
    fn connector_link_carries_its_id_and_key() {
        let connector = Connector {
            id: "c".into(),
            key: "k".into(),
            token: "t".into(),
        };
        assert_eq!(connector.url(), "https://nootle.ai/mcp/c.k");
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
            ai_access: false,
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
