//! One-click OAuth sign-in for integrations (Slack, Notion, Confluence,
//! GitHub, Linear, Asana).
//!
//! Flow: the app opens the provider's consent page in the browser with a
//! random `state` (and a PKCE challenge where the provider supports it). The
//! provider redirects to [`REDIRECT_URI`], a static page on nootle.ai that
//! forwards the query string to `nootle://oauth/callback`. The deep link lands
//! in [`handle_callback`], which hands the code to the waiting [`connect`]
//! call; that call exchanges the code for tokens and saves the integration.
//! A single HTTPS redirect URI works for every provider, including Slack,
//! which rejects plain-HTTP loopback redirects.
//!
//! Client IDs and secrets are baked in at build time from
//! `NOOTLE_<PROVIDER>_CLIENT_ID` / `NOOTLE_<PROVIDER>_CLIENT_SECRET`, and the
//! same variables at runtime override them for development. A provider with
//! no client ID falls back to pasting a token by hand.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use base64::Engine;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;
use url::Url;

use crate::db::{Database, Integration};

pub const REDIRECT_URI: &str = "https://nootle.ai/oauth/callback";

/// How long to wait for the user to finish in the browser.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Refresh tokens this long before they expire so a request in flight
/// doesn't race the expiry.
const EXPIRY_SLACK_SECS: i64 = 60;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("Failed to build HTTP client")
});

/// Serializes refreshes: Atlassian rotates refresh tokens, so two workflows
/// refreshing the same integration at once would invalidate each other.
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// How a provider's token endpoint wants the client credentials and grant.
#[derive(Clone, Copy)]
enum TokenStyle {
    /// Form-encoded body with client_id/client_secret in the body.
    Form,
    /// JSON body with client_id/client_secret in the body.
    Json,
    /// JSON body with client_id/client_secret as HTTP Basic auth.
    BasicJson,
}

struct Provider {
    kind: &'static str,
    name: &'static str,
    authorize_url: &'static str,
    token_url: &'static str,
    scope: Option<&'static str>,
    extra_params: &'static [(&'static str, &'static str)],
    token_style: TokenStyle,
    pkce: bool,
    builtin_client_id: Option<&'static str>,
    builtin_client_secret: Option<&'static str>,
}

impl Provider {
    fn env(&self, suffix: &str, builtin: Option<&'static str>) -> Option<String> {
        let var = format!("NOOTLE_{}_{suffix}", self.kind.to_ascii_uppercase());
        std::env::var(var)
            .ok()
            .or(builtin.map(String::from))
            .filter(|v| !v.trim().is_empty())
    }

    fn client_id(&self) -> Option<String> {
        self.env("CLIENT_ID", self.builtin_client_id)
    }

    fn client_secret(&self) -> Option<String> {
        self.env("CLIENT_SECRET", self.builtin_client_secret)
    }
}

static PROVIDERS: &[Provider] = &[
    Provider {
        kind: "slack",
        name: "Slack",
        authorize_url: "https://slack.com/oauth/v2/authorize",
        token_url: "https://slack.com/api/oauth.v2.access",
        scope: Some("chat:write,chat:write.public"),
        extra_params: &[],
        token_style: TokenStyle::Form,
        pkce: false,
        builtin_client_id: option_env!("NOOTLE_SLACK_CLIENT_ID"),
        builtin_client_secret: option_env!("NOOTLE_SLACK_CLIENT_SECRET"),
    },
    Provider {
        kind: "notion",
        name: "Notion",
        authorize_url: "https://api.notion.com/v1/oauth/authorize",
        token_url: "https://api.notion.com/v1/oauth/token",
        scope: None,
        extra_params: &[("owner", "user")],
        token_style: TokenStyle::BasicJson,
        pkce: false,
        builtin_client_id: option_env!("NOOTLE_NOTION_CLIENT_ID"),
        builtin_client_secret: option_env!("NOOTLE_NOTION_CLIENT_SECRET"),
    },
    Provider {
        kind: "confluence",
        name: "Confluence",
        authorize_url: "https://auth.atlassian.com/authorize",
        token_url: "https://auth.atlassian.com/oauth/token",
        scope: Some("write:page:confluence read:space:confluence offline_access"),
        extra_params: &[("audience", "api.atlassian.com"), ("prompt", "consent")],
        token_style: TokenStyle::Json,
        pkce: false,
        builtin_client_id: option_env!("NOOTLE_CONFLUENCE_CLIENT_ID"),
        builtin_client_secret: option_env!("NOOTLE_CONFLUENCE_CLIENT_SECRET"),
    },
    Provider {
        kind: "github",
        name: "GitHub",
        authorize_url: "https://github.com/login/oauth/authorize",
        token_url: "https://github.com/login/oauth/access_token",
        scope: Some("repo"),
        extra_params: &[],
        token_style: TokenStyle::Form,
        pkce: true,
        builtin_client_id: option_env!("NOOTLE_GITHUB_CLIENT_ID"),
        builtin_client_secret: option_env!("NOOTLE_GITHUB_CLIENT_SECRET"),
    },
    Provider {
        kind: "linear",
        name: "Linear",
        authorize_url: "https://linear.app/oauth/authorize",
        token_url: "https://api.linear.app/oauth/token",
        scope: Some("read,write"),
        extra_params: &[],
        token_style: TokenStyle::Form,
        pkce: true,
        builtin_client_id: option_env!("NOOTLE_LINEAR_CLIENT_ID"),
        builtin_client_secret: option_env!("NOOTLE_LINEAR_CLIENT_SECRET"),
    },
    Provider {
        kind: "asana",
        name: "Asana",
        authorize_url: "https://app.asana.com/-/oauth_authorize",
        token_url: "https://app.asana.com/-/oauth_token",
        scope: Some("default"),
        extra_params: &[],
        token_style: TokenStyle::Form,
        pkce: true,
        builtin_client_id: option_env!("NOOTLE_ASANA_CLIENT_ID"),
        builtin_client_secret: option_env!("NOOTLE_ASANA_CLIENT_SECRET"),
    },
];

fn provider(kind: &str) -> Option<&'static Provider> {
    PROVIDERS.iter().find(|p| p.kind == kind)
}

/// Integration types that can sign in with OAuth in this build.
pub fn configured_providers() -> Vec<String> {
    PROVIDERS
        .iter()
        .filter(|p| p.client_id().is_some())
        .map(|p| p.kind.to_string())
        .collect()
}

/// True when the credentials came from an OAuth sign-in rather than a pasted
/// token.
pub fn is_oauth(creds: &Value) -> bool {
    creds["auth"].as_str() == Some("oauth")
}

/// Sign-ins waiting for their browser redirect, keyed by `state`.
#[derive(Default)]
pub struct OAuthState {
    pending: Mutex<HashMap<String, oneshot::Sender<Result<String, String>>>>,
}

impl OAuthState {
    /// Abandons any sign-in in progress; its `connect` call returns an error.
    pub fn cancel(&self) {
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
    }
}

fn random_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn pkce_challenge(verifier: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn authorize_url(
    p: &Provider,
    client_id: &str,
    state: &str,
    challenge: Option<&str>,
) -> Result<Url, String> {
    let mut url = Url::parse(p.authorize_url).map_err(|e| e.to_string())?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", client_id)
            .append_pair("redirect_uri", REDIRECT_URI)
            .append_pair("response_type", "code")
            .append_pair("state", state);
        if let Some(scope) = p.scope {
            q.append_pair("scope", scope);
        }
        if let Some(challenge) = challenge {
            q.append_pair("code_challenge", challenge)
                .append_pair("code_challenge_method", "S256");
        }
        for (k, v) in p.extra_params {
            q.append_pair(k, v);
        }
    }
    Ok(url)
}

/// POSTs a grant to the provider's token endpoint and returns the token JSON.
async fn token_request(p: &Provider, grant: &[(&str, &str)]) -> Result<Value, String> {
    let client_id = p
        .client_id()
        .ok_or_else(|| format!("{} sign-in isn't configured in this build", p.name))?;
    let secret = p.client_secret();

    let mut params: Map<String, Value> = grant
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    let req = CLIENT
        .post(p.token_url)
        .header("Accept", "application/json");
    let req = match p.token_style {
        TokenStyle::BasicJson => req.basic_auth(&client_id, secret).json(&params),
        style => {
            params.insert("client_id".into(), json!(client_id));
            if let Some(secret) = secret {
                params.insert("client_secret".into(), json!(secret));
            }
            if matches!(style, TokenStyle::Json) {
                req.json(&params)
            } else {
                req.form(&params)
            }
        }
    };

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    // GitHub reports errors with a 200 and an `error` field; Slack with
    // `ok: false`.
    let failed = !status.is_success() || body["error"].is_string() || body["ok"] == json!(false);
    if failed || body["access_token"].as_str().is_none() {
        let detail = body["error_description"]
            .as_str()
            .or(body["error"].as_str())
            .or(body["message"].as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(detail);
    }
    Ok(body)
}

/// Copies the tokens from a token response into stored credentials. Keeps an
/// existing refresh token when the provider doesn't rotate it.
fn merge_tokens(creds: &mut Map<String, Value>, token: &Value) {
    creds.insert("auth".into(), json!("oauth"));
    creds.insert("access_token".into(), token["access_token"].clone());
    if let Some(refresh) = token["refresh_token"].as_str() {
        creds.insert("refresh_token".into(), json!(refresh));
    }
    match token["expires_in"].as_i64() {
        Some(secs) => {
            creds.insert(
                "expires_at".into(),
                json!(chrono::Utc::now().timestamp() + secs),
            );
        }
        None => {
            creds.remove("expires_at");
        }
    }
}

/// Provider-specific details needed after sign-in, plus a label for the
/// account (workspace or site name) when the provider reports one.
async fn account_details(
    p: &Provider,
    token: &Value,
    creds: &mut Map<String, Value>,
) -> Result<Option<String>, String> {
    match p.kind {
        "slack" => Ok(token["team"]["name"].as_str().map(String::from)),
        "notion" => Ok(token["workspace_name"].as_str().map(String::from)),
        "confluence" => {
            // API calls go through api.atlassian.com and need the site's
            // cloud ID.
            let access = token["access_token"].as_str().unwrap_or_default();
            let sites: Vec<Value> = CLIENT
                .get("https://api.atlassian.com/oauth/token/accessible-resources")
                .bearer_auth(access)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            let site = sites
                .iter()
                .find(|s| {
                    s["scopes"]
                        .as_array()
                        .is_some_and(|sc| sc.iter().any(|x| x == "write:page:confluence"))
                })
                .or(sites.first())
                .ok_or("This Atlassian account has no Confluence site")?;
            creds.insert("cloud_id".into(), site["id"].clone());
            creds.insert("base_url".into(), site["url"].clone());
            Ok(site["name"].as_str().map(String::from))
        }
        _ => Ok(None),
    }
}

/// Runs the whole sign-in: opens the browser, waits for the redirect, trades
/// the code for tokens, and saves (or replaces) the integration. Returns the
/// integration without its credentials.
pub async fn connect(
    app: &AppHandle,
    db: &Database,
    state: &OAuthState,
    kind: &str,
) -> Result<Integration, String> {
    let p = provider(kind).ok_or_else(|| format!("{kind} doesn't support sign-in"))?;
    let client_id = p.client_id().ok_or_else(|| {
        format!(
            "{} sign-in isn't configured in this build; paste a token instead",
            p.name
        )
    })?;

    let csrf = random_token();
    let verifier = format!("{}{}", random_token(), random_token());
    let challenge = p.pkce.then(|| pkce_challenge(&verifier));
    let url = authorize_url(p, &client_id, &csrf, challenge.as_deref())?;

    let (tx, rx) = oneshot::channel();
    {
        let mut pending = state.pending.lock().unwrap_or_else(|e| e.into_inner());
        // One sign-in at a time; starting another abandons the last.
        pending.clear();
        pending.insert(csrf.clone(), tx);
    }

    use tauri_plugin_opener::OpenerExt;
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        state.cancel();
        return Err(format!("Couldn't open the browser: {e}"));
    }

    let code = match tokio::time::timeout(SIGN_IN_TIMEOUT, rx).await {
        Ok(Ok(result)) => result?,
        Ok(Err(_)) => return Err("Sign-in was cancelled".into()),
        Err(_) => {
            state
                .pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&csrf);
            return Err("Sign-in timed out; try again".into());
        }
    };

    let mut grant = vec![
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", REDIRECT_URI),
    ];
    if p.pkce {
        grant.push(("code_verifier", verifier.as_str()));
    }
    let token = token_request(p, &grant)
        .await
        .map_err(|e| format!("{} sign-in failed: {e}", p.name))?;

    let mut creds = Map::new();
    merge_tokens(&mut creds, &token);
    let account = account_details(p, &token, &mut creds)
        .await
        .map_err(|e| format!("{} sign-in failed: {e}", p.name))?;
    let name = match account {
        Some(account) => format!("{} ({account})", p.name),
        None => p.name.to_string(),
    };
    let creds_json = Value::Object(creds).to_string();

    let existing = db
        .get_integration_by_type(kind)
        .map_err(|e| e.to_string())?;
    let saved = match existing {
        Some(existing) => db.update_integration(&existing.id, &name, &creds_json),
        None => db.create_integration(kind, &name, &creds_json),
    }
    .map_err(|e| e.to_string())?;
    Ok(saved.redacted())
}

/// Handles `nootle://oauth/callback?code=…&state=…` (or `?error=…`). Ignores
/// callbacks whose `state` doesn't match a sign-in in progress, so a stray
/// link can't inject a code.
pub fn handle_callback(app: &AppHandle, url: &Url) {
    let param = |key: &str| {
        url.query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    };
    let Some(csrf) = param("state") else {
        tracing::warn!("oauth: callback without state");
        return;
    };
    let Some(tx) = app
        .state::<OAuthState>()
        .pending
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&csrf)
    else {
        tracing::warn!("oauth: callback for unknown or expired sign-in");
        return;
    };

    let result = match (param("code"), param("error")) {
        (Some(code), _) => Ok(code),
        (None, Some(error)) => Err(match param("error_description") {
            Some(desc) => format!("Sign-in failed: {desc}"),
            None if error == "access_denied" => "Sign-in was cancelled".to_string(),
            None => format!("Sign-in failed: {error}"),
        }),
        (None, None) => Err("Sign-in failed: no authorization code returned".to_string()),
    };
    let _ = tx.send(result);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

/// Returns the integration with a usable access token, refreshing and saving
/// it first if an OAuth token has expired. Pasted tokens pass through
/// untouched.
pub async fn refresh_if_needed(
    db: &Database,
    integration: Integration,
) -> Result<Integration, String> {
    if !needs_refresh(&integration) {
        return Ok(integration);
    }

    let _guard = REFRESH_LOCK.lock().await;
    // Another caller may have refreshed while we waited.
    let integration = db
        .get_integration(&integration.id)
        .map_err(|e| e.to_string())?;
    if !needs_refresh(&integration) {
        return Ok(integration);
    }

    let reconnect = |detail: &str| {
        format!(
            "{} sign-in expired ({detail}); reconnect it in Settings > Integrations",
            integration.name
        )
    };
    let mut creds: Map<String, Value> =
        serde_json::from_str(&integration.credentials_json).map_err(|e| e.to_string())?;
    let refresh_token = creds["refresh_token"]
        .as_str()
        .ok_or_else(|| reconnect("no refresh token"))?
        .to_string();
    let p = provider(&integration.integration_type).ok_or_else(|| reconnect("unknown provider"))?;

    let token = token_request(
        p,
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
        ],
    )
    .await
    .map_err(|e| reconnect(&e))?;
    merge_tokens(&mut creds, &token);

    db.update_integration(
        &integration.id,
        &integration.name,
        &Value::Object(creds).to_string(),
    )
    .map_err(|e| e.to_string())
}

fn needs_refresh(integration: &Integration) -> bool {
    let Ok(creds) = serde_json::from_str::<Value>(&integration.credentials_json) else {
        return false;
    };
    is_oauth(&creds)
        && creds["expires_at"]
            .as_i64()
            .is_some_and(|at| at - EXPIRY_SLACK_SECS <= chrono::Utc::now().timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn integration(creds: Value) -> Integration {
        Integration {
            id: "i".into(),
            integration_type: "asana".into(),
            name: "Asana".into(),
            credentials_json: creds.to_string(),
            created_at: String::new(),
        }
    }

    #[test]
    fn pkce_challenge_is_unpadded_base64url_sha256() {
        // SHA-256("abc") = ba7816bf…15ad, which base64url-encodes with a
        // '-' and '_' and would end in '=' if padded.
        assert_eq!(
            pkce_challenge("abc"),
            "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"
        );
    }

    #[test]
    fn authorize_url_carries_state_scope_and_pkce() {
        let p = provider("linear").unwrap();
        let url = authorize_url(p, "cid", "st", Some("ch")).unwrap();
        let q: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "cid");
        assert_eq!(q["state"], "st");
        assert_eq!(q["redirect_uri"], REDIRECT_URI);
        assert_eq!(q["scope"], "read,write");
        assert_eq!(q["code_challenge"], "ch");
        assert_eq!(q["code_challenge_method"], "S256");
    }

    #[test]
    fn authorize_url_includes_provider_extras() {
        let p = provider("confluence").unwrap();
        let url = authorize_url(p, "cid", "st", None).unwrap();
        let q: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["audience"], "api.atlassian.com");
        assert!(!q.contains_key("code_challenge"));
    }

    #[test]
    fn merge_tokens_keeps_refresh_token_when_not_rotated() {
        let mut creds = Map::new();
        merge_tokens(
            &mut creds,
            &json!({"access_token": "a1", "refresh_token": "r1", "expires_in": 3600}),
        );
        merge_tokens(&mut creds, &json!({"access_token": "a2"}));
        assert_eq!(creds["access_token"], "a2");
        assert_eq!(creds["refresh_token"], "r1");
        assert!(!creds.contains_key("expires_at"));
        assert!(is_oauth(&Value::Object(creds)));
    }

    #[test]
    fn needs_refresh_only_for_expiring_oauth_tokens() {
        let now = chrono::Utc::now().timestamp();
        assert!(needs_refresh(&integration(
            json!({"auth": "oauth", "access_token": "a", "expires_at": now - 1})
        )));
        assert!(!needs_refresh(&integration(
            json!({"auth": "oauth", "access_token": "a", "expires_at": now + 3600})
        )));
        assert!(!needs_refresh(&integration(
            json!({"auth": "oauth", "access_token": "a"})
        )));
        assert!(!needs_refresh(&integration(json!({"token": "pasted"}))));
    }

    #[test]
    fn every_remote_integration_has_a_provider() {
        for kind in ["slack", "notion", "confluence", "github", "linear", "asana"] {
            assert!(provider(kind).is_some(), "{kind}");
        }
    }
}
