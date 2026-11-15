//! OpenAI-compatible endpoints the user points Nootle at: one for chat
//! (summaries, titles, Ask) and one for transcription. Any server that speaks
//! the OpenAI API works: OpenRouter, Azure, Together, LM Studio, a
//! self-hosted Whisper, and so on.
//!
//! Only the app's settings screen changes them. The CLI and MCP server can't,
//! so an agent can never redirect meeting audio or transcripts to a server of
//! its choosing.

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};

use crate::db::Database;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Chat,
    Transcription,
}

impl Kind {
    /// Its API key's name in the key store; for chat, also the LLM provider's
    /// name.
    pub fn key_name(self) -> &'static str {
        match self {
            Kind::Chat => "custom",
            Kind::Transcription => "custom-transcription",
        }
    }

    fn setting(self) -> &'static str {
        match self {
            Kind::Chat => "custom_chat_endpoint",
            Kind::Transcription => "custom_transcription_endpoint",
        }
    }
}

const MAX_URL_CHARS: usize = 500;
const MAX_CHAT_MODELS: usize = 20;
const MAX_MODEL_CHARS: usize = 200;
/// Paths people paste along with the base URL, copied from a provider's docs.
const OPERATION_PATHS: [&str; 3] = ["/chat/completions", "/audio/transcriptions", "/models"];

#[derive(Debug, Clone, PartialEq)]
pub struct Endpoint {
    pub base_url: String,
    pub models: Vec<String>,
    pub api_key: Option<String>,
}

impl Endpoint {
    /// The first model: a transcription endpoint's only one.
    pub fn model(&self) -> Result<&str> {
        self.models
            .first()
            .map(String::as_str)
            .ok_or_else(|| anyhow!("The endpoint has no model"))
    }

    /// `{base_url}/{path}`.
    pub fn url(&self, path: &str) -> String {
        format!("{}/{path}", self.base_url)
    }

    pub fn authorize(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.api_key {
            Some(key) => request.bearer_auth(key),
            None => request,
        }
    }
}

/// What the settings screen shows: never the key itself.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EndpointView {
    pub base_url: String,
    pub models: Vec<String>,
    pub has_key: bool,
}

impl From<&Endpoint> for EndpointView {
    fn from(e: &Endpoint) -> Self {
        Self {
            base_url: e.base_url.clone(),
            models: e.models.clone(),
            has_key: e.api_key.is_some(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct Stored {
    base_url: String,
    models: Vec<String>,
}

/// The configured endpoint of `kind`, or `None` when there isn't one.
pub fn load(db: &Database, kind: Kind) -> Option<Endpoint> {
    let raw = db.get_setting(kind.setting()).ok()??;
    let stored: Stored = serde_json::from_str(&raw).ok()?;
    let api_key = db
        .get_api_key(kind.key_name())
        .ok()
        .flatten()
        .filter(|k| !k.is_empty());
    Some(Endpoint {
        base_url: stored.base_url,
        models: stored.models,
        api_key,
    })
}

/// Validates and saves an endpoint. `api_key`: `None` keeps the stored key,
/// `Some("")` removes it (servers on your own network often need none).
pub fn save(
    db: &Database,
    kind: Kind,
    base_url: &str,
    models: &[String],
    api_key: Option<&str>,
) -> Result<Endpoint> {
    let base_url = normalize_base_url(base_url)?;
    let models = normalize_models(kind, models)?;
    let stored = Stored { base_url, models };
    db.set_setting(kind.setting(), &serde_json::to_string(&stored)?)?;
    match api_key.map(str::trim) {
        Some("") => db.delete_api_key(kind.key_name())?,
        Some(key) => db.store_api_key(kind.key_name(), key)?,
        None => {}
    }
    load(db, kind).ok_or_else(|| anyhow!("The endpoint didn't save"))
}

pub fn delete(db: &Database, kind: Kind) -> Result<()> {
    db.delete_setting(kind.setting())?;
    db.delete_api_key(kind.key_name())?;
    Ok(())
}

/// A base URL such as `https://openrouter.ai/api/v1`, without a trailing
/// slash or a pasted operation path.
pub fn normalize_base_url(input: &str) -> Result<String> {
    let mut url = input.trim().trim_end_matches('/').to_string();
    if url.is_empty() {
        bail!("Enter the endpoint's base URL, e.g. https://openrouter.ai/api/v1");
    }
    crate::ops::max_chars("base URL", &url, MAX_URL_CHARS)?;
    for path in OPERATION_PATHS {
        if let Some(stripped) = url.strip_suffix(path) {
            url = stripped.trim_end_matches('/').to_string();
        }
    }
    let parsed = url::Url::parse(&url)
        .map_err(|_| anyhow!("'{input}' isn't a URL, e.g. https://openrouter.ai/api/v1"))?;
    if !matches!(parsed.scheme(), "https" | "http") || parsed.host_str().is_none() {
        bail!("The base URL has to start with https:// or http://");
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        bail!("Leave the query string off the base URL");
    }
    Ok(url)
}

fn normalize_models(kind: Kind, models: &[String]) -> Result<Vec<String>> {
    let mut out: Vec<String> = Vec::new();
    for model in models.iter().map(|m| m.trim()).filter(|m| !m.is_empty()) {
        crate::ops::max_chars("model name", model, MAX_MODEL_CHARS)?;
        if !out.iter().any(|m| m == model) {
            out.push(model.to_string());
        }
    }
    if out.is_empty() {
        bail!("Enter a model name, e.g. openai/gpt-5");
    }
    match kind {
        Kind::Transcription if out.len() > 1 => bail!("Pick one transcription model"),
        Kind::Chat if out.len() > MAX_CHAT_MODELS => {
            bail!("Add at most {MAX_CHAT_MODELS} models")
        }
        _ => Ok(out),
    }
}

/// The error message in an OpenAI-style error body, or the body itself.
pub fn error_message(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v["error"]["message"]
                .as_str()
                .or_else(|| v["error"].as_str())
                .or_else(|| v["message"].as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(300).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_drops_trailing_slash_and_pasted_paths() {
        for input in [
            "https://openrouter.ai/api/v1",
            " https://openrouter.ai/api/v1/ ",
            "https://openrouter.ai/api/v1/chat/completions",
            "https://openrouter.ai/api/v1/audio/transcriptions/",
        ] {
            assert_eq!(
                normalize_base_url(input).unwrap(),
                "https://openrouter.ai/api/v1"
            );
        }
        assert_eq!(
            normalize_base_url("http://localhost:1234/v1").unwrap(),
            "http://localhost:1234/v1"
        );
    }

    #[test]
    fn base_url_must_be_a_web_url() {
        for input in [
            "",
            "openrouter.ai",
            "file:///etc/passwd",
            "https://x.ai/v1?key=1",
        ] {
            assert!(normalize_base_url(input).is_err(), "{input}");
        }
    }

    #[test]
    fn models_are_trimmed_deduped_and_capped() {
        let models = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            normalize_models(Kind::Chat, &models(&[" a ", "", "b", "a"])).unwrap(),
            ["a", "b"]
        );
        assert!(normalize_models(Kind::Chat, &models(&[" "])).is_err());
        assert!(normalize_models(Kind::Transcription, &models(&["a", "b"])).is_err());
    }

    #[test]
    fn saves_loads_and_deletes() {
        let db = Database::new_in_memory().unwrap();
        assert!(load(&db, Kind::Chat).is_none());
        let saved = save(
            &db,
            Kind::Chat,
            "https://openrouter.ai/api/v1/",
            &["openai/gpt-5".into()],
            Some("sk-or-1"),
        )
        .unwrap();
        assert_eq!(saved.base_url, "https://openrouter.ai/api/v1");
        assert_eq!(saved.api_key.as_deref(), Some("sk-or-1"));
        assert!(load(&db, Kind::Transcription).is_none());

        let kept = save(&db, Kind::Chat, &saved.base_url, &saved.models, None).unwrap();
        assert_eq!(kept.api_key.as_deref(), Some("sk-or-1"));
        let keyless = save(&db, Kind::Chat, &saved.base_url, &saved.models, Some("")).unwrap();
        assert_eq!(keyless.api_key, None);

        delete(&db, Kind::Chat).unwrap();
        assert!(load(&db, Kind::Chat).is_none());
    }

    #[test]
    fn error_message_reads_openai_style_bodies() {
        assert_eq!(
            error_message(r#"{"error":{"message":"bad key"}}"#),
            "bad key"
        );
        assert_eq!(error_message(r#"{"error":"nope"}"#), "nope");
        assert_eq!(error_message("Bad Gateway"), "Bad Gateway");
    }
}
