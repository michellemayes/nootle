//! One-click sign-in for integrations through their vendors' remote MCP
//! servers (Notion, Linear, Confluence).
//!
//! These servers support OAuth dynamic client registration, so Nootle
//! registers itself on first connect: nobody has to create an app or paste a
//! token. Sign-in opens the vendor's consent page in the browser and catches
//! the redirect on a one-off loopback port. Workflows then call the server's
//! MCP tools with the stored token, which `rmcp` refreshes as needed.
//!
//! Credentials are stored as `{"mcp": <rmcp StoredCredentials>}`, which lets
//! executors tell an MCP connection from a pasted token.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use rmcp::model::CallToolRequestParams;
use rmcp::service::RunningService;
use rmcp::transport::auth::{
    AuthError, AuthorizationManager, AuthorizationSession, CredentialStore, StoredCredentials,
};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::StreamableHttpClientTransport;
use rmcp::{RoleClient, ServiceExt};
use serde_json::{json, Map, Value};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, RwLock};
use url::Url;

use crate::db::{Database, Integration};

/// How long to wait for the user to finish in the browser.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Serializes token refreshes: servers that rotate refresh tokens would
/// invalidate a second refresh of the same integration running in parallel.
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub struct Connector {
    pub kind: &'static str,
    pub name: &'static str,
    url: &'static str,
    scopes: &'static [&'static str],
}

static CONNECTORS: &[Connector] = &[
    Connector {
        kind: "notion",
        name: "Notion",
        url: "https://mcp.notion.com/mcp",
        scopes: &[],
    },
    Connector {
        kind: "linear",
        name: "Linear",
        url: "https://mcp.linear.app/mcp",
        scopes: &["read", "write"],
    },
    // Atlassian's v1 server. Its v2 server renames the tools, and v1 clients
    // are due to be moved onto v2 in March 2027.
    Connector {
        kind: "confluence",
        name: "Confluence",
        url: "https://mcp.atlassian.com/v1/mcp",
        scopes: &[],
    },
];

pub fn connector(kind: &str) -> Option<&'static Connector> {
    CONNECTORS.iter().find(|c| c.kind == kind)
}

/// True when the credentials came from an MCP sign-in rather than a pasted
/// token.
pub fn is_mcp(creds: &Value) -> bool {
    creds.get("mcp").is_some()
}

/// Holds one integration's credentials while `rmcp` uses (and refreshes)
/// them; the caller persists them back to the database afterwards.
#[derive(Clone, Default)]
struct MemoryStore(Arc<RwLock<Option<StoredCredentials>>>);

#[async_trait::async_trait]
impl CredentialStore for MemoryStore {
    async fn load(&self) -> Result<Option<StoredCredentials>, AuthError> {
        Ok(self.0.read().await.clone())
    }

    async fn save(&self, credentials: StoredCredentials) -> Result<(), AuthError> {
        *self.0.write().await = Some(credentials);
        Ok(())
    }

    async fn clear(&self) -> Result<(), AuthError> {
        *self.0.write().await = None;
        Ok(())
    }
}

impl MemoryStore {
    async fn credentials_json(&self) -> Result<String, String> {
        let stored = self.0.read().await;
        let stored = stored.as_ref().ok_or("Sign-in returned no credentials")?;
        Ok(json!({ "mcp": stored }).to_string())
    }
}

/// Lets the UI abandon a sign-in in progress.
#[derive(Default)]
pub struct SignInState {
    cancel: Mutex<Option<oneshot::Sender<()>>>,
}

impl SignInState {
    /// Abandons any sign-in in progress; its `connect` call returns `None`.
    pub fn cancel(&self) {
        self.cancel.lock().unwrap_or_else(|e| e.into_inner()).take();
    }
}

fn auth_err(e: AuthError) -> String {
    e.to_string()
}

/// Runs the whole sign-in: registers Nootle with the server, opens the
/// browser, waits for the redirect, and saves (or replaces) the integration.
/// Returns the integration without its credentials, or `None` if the user
/// cancelled.
pub async fn connect(
    app: &AppHandle,
    db: &Database,
    state: &SignInState,
    kind: &str,
) -> Result<Option<Integration>, String> {
    let c = connector(kind).ok_or_else(|| format!("{kind} doesn't support sign-in"))?;
    let failed = |e: String| format!("{} sign-in failed: {e}", c.name);

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| failed(e.to_string()))?;
    let port = listener
        .local_addr()
        .map_err(|e| failed(e.to_string()))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let store = MemoryStore::default();
    let mut manager = AuthorizationManager::new(c.url)
        .await
        .map_err(|e| failed(auth_err(e)))?;
    let metadata = manager
        .discover_metadata()
        .await
        .map_err(|e| failed(auth_err(e)))?;
    manager.set_metadata(metadata);
    manager.set_credential_store(store.clone());
    let session = AuthorizationSession::new(manager, c.scopes, &redirect_uri, Some("Nootle"), None)
        .await
        .map_err(|e| failed(auth_err(e)))?;

    // One sign-in at a time; starting another abandons the last.
    let (cancel_tx, cancel_rx) = oneshot::channel();
    *state.cancel.lock().unwrap_or_else(|e| e.into_inner()) = Some(cancel_tx);

    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(session.get_authorization_url(), None::<&str>)
        .map_err(|e| format!("Couldn't open the browser: {e}"))?;

    let callback = tokio::select! {
        callback = wait_for_callback(&listener) => callback.map_err(failed)?,
        _ = cancel_rx => return Ok(None),
        _ = tokio::time::sleep(SIGN_IN_TIMEOUT) => {
            return Err("Sign-in timed out; try again".into());
        }
    };
    let param = |key| crate::remote::query_value(&callback, key);
    let (code, csrf) = match (param("code"), param("state"), param("error")) {
        (Some(code), Some(csrf), _) => (code, csrf),
        (_, _, Some(error)) if error == "access_denied" => return Ok(None),
        (_, _, Some(error)) => {
            return Err(failed(param("error_description").unwrap_or(error)));
        }
        _ => return Err(failed("no authorization code returned".into())),
    };

    // Servers that advertise RFC 9207 (Linear does) require the callback's
    // `iss` to match their metadata's issuer.
    session
        .handle_callback_with_issuer(&code, &csrf, param("iss").as_deref())
        .await
        .map_err(|e| failed(auth_err(e)))?;

    let saved = db
        .upsert_integration_by_type(kind, c.name, &store.credentials_json().await?)
        .map_err(|e| e.to_string())?;
    Ok(Some(saved.redacted()))
}

/// Accepts connections on the loopback port until the browser requests
/// `/callback`, answers it with a "you can close this tab" page, and returns
/// the full redirect URL.
async fn wait_for_callback(listener: &TcpListener) -> Result<Url, String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192];
        let mut len = 0;
        while len < buf.len() {
            let n = stream
                .read(&mut buf[len..])
                .await
                .map_err(|e| e.to_string())?;
            len += n;
            if n == 0 || buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
                break;
            }
        }
        let request = String::from_utf8_lossy(&buf[..len]);
        let target = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");
        let Ok(url) = Url::parse(&format!("http://127.0.0.1{target}")) else {
            continue;
        };
        if url.path() != "/callback" {
            let _ = stream
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await;
            continue;
        }
        let body = "<!doctype html><meta charset=utf-8><title>Nootle</title>\
            <body style=\"font-family:system-ui;text-align:center;padding-top:20vh\">\
            <h2>You can close this tab</h2><p>Return to Nootle to finish connecting.</p>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
             Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;
        return Ok(url);
    }
}

/// A live MCP connection to an integration's server.
pub struct Session {
    client: RunningService<RoleClient, ()>,
}

impl Session {
    /// Connects with the integration's stored token, refreshing it first
    /// (and saving the new one) if it has expired.
    pub async fn open(db: &Database, integration: &Integration) -> Result<Self, String> {
        let c = connector(&integration.integration_type)
            .ok_or_else(|| format!("{} can't connect over MCP", integration.name))?;
        let reconnect = |detail: String| {
            format!(
                "{} connection expired ({detail}); reconnect it in Settings > Integrations",
                c.name
            )
        };

        let token = {
            let _guard = REFRESH_LOCK.lock().await;
            // Re-read under the lock in case another run just refreshed.
            let integration = db
                .get_integration(&integration.id)
                .map_err(|e| e.to_string())?;
            let creds: Value = serde_json::from_str(&integration.credentials_json)
                .map_err(|e| format!("Invalid credentials: {e}"))?;
            let stored: StoredCredentials = serde_json::from_value(creds["mcp"].clone())
                .map_err(|e| format!("Invalid credentials: {e}"))?;

            let store = MemoryStore(Arc::new(RwLock::new(Some(stored))));
            let mut manager = AuthorizationManager::new(c.url).await.map_err(auth_err)?;
            manager.set_credential_store(store.clone());
            manager
                .initialize_from_store()
                .await
                .map_err(|e| reconnect(auth_err(e)))?;
            let token = manager
                .get_access_token()
                .await
                .map_err(|e| reconnect(auth_err(e)))?;

            let updated = store.credentials_json().await?;
            if updated != integration.credentials_json {
                db.update_integration(&integration.id, &integration.name, &updated)
                    .map_err(|e| e.to_string())?;
            }
            token
        };

        let transport = StreamableHttpClientTransport::from_config(
            StreamableHttpClientTransportConfig::with_uri(c.url).auth_header(token),
        );
        let client = ()
            .serve(transport)
            .await
            .map_err(|e| format!("Couldn't reach the {} MCP server: {e}", c.name))?;
        Ok(Self { client })
    }

    /// Calls a tool and returns its result: the structured content when the
    /// server sends it, else the text content parsed as JSON if possible,
    /// else the text itself.
    pub async fn call(&self, tool: &str, arguments: Value) -> Result<Value, String> {
        let Value::Object(arguments) = arguments else {
            return Err("Tool arguments must be a JSON object".into());
        };
        let result = self
            .client
            .call_tool(CallToolRequestParams::new(tool.to_string()).with_arguments(arguments))
            .await
            .map_err(|e| format!("{tool} failed: {e}"))?;

        let text = result
            .content
            .iter()
            .filter_map(|c| c.as_text().map(|t| t.text.as_str()))
            .collect::<Vec<_>>()
            .join("\n");
        if result.is_error == Some(true) {
            return Err(format!("{tool} failed: {text}"));
        }
        Ok(result
            .structured_content
            .unwrap_or_else(|| serde_json::from_str(&text).unwrap_or(Value::String(text))))
    }
}

/// Every object nested anywhere in `value` that has all of `keys`, outermost
/// first. MCP tools return loosely specified JSON, so callers look records up
/// by shape rather than by path.
pub fn find_records<'a>(value: &'a Value, keys: &[&str]) -> Vec<&'a Map<String, Value>> {
    let mut found = Vec::new();
    let mut stack = vec![value];
    while let Some(v) = stack.pop() {
        match v {
            Value::Object(map) if keys.iter().all(|k| map.contains_key(*k)) => found.push(map),
            Value::Object(map) => stack.extend(map.values().rev()),
            Value::Array(items) => stack.extend(items.iter().rev()),
            _ => {}
        }
    }
    found
}

/// The first string field named `key` anywhere in `value`.
pub fn find_str(value: &Value, key: &str) -> Option<String> {
    find_records(value, &[key])
        .into_iter()
        .find_map(|m| m[key].as_str().map(String::from))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_mcp_connector_is_in_the_catalog() {
        for c in CONNECTORS {
            assert!(
                crate::automation::CATALOG
                    .iter()
                    .any(|s| s.integration_type == c.kind),
                "{}",
                c.kind
            );
        }
    }

    #[tokio::test]
    async fn callback_listener_ignores_other_paths() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let browser = tokio::spawn(async move {
            for path in ["/favicon.ico", "/callback?code=c&state=s"] {
                let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port))
                    .await
                    .unwrap();
                s.write_all(format!("GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
                    .await
                    .unwrap();
                let mut out = String::new();
                s.read_to_string(&mut out).await.unwrap();
            }
        });
        let url = wait_for_callback(&listener).await.unwrap();
        browser.await.unwrap();
        assert_eq!(
            crate::remote::query_value(&url, "code").as_deref(),
            Some("c")
        );
        assert_eq!(
            crate::remote::query_value(&url, "state").as_deref(),
            Some("s")
        );
    }

    #[test]
    fn find_records_matches_by_shape_at_any_depth() {
        let v = json!({"teams": {"nodes": [
            {"id": "1", "name": "Eng", "key": "ENG"},
            {"id": "2", "name": "Ops"},
            {"note": "no id"}
        ]}});
        let ids: Vec<_> = find_records(&v, &["id", "name"])
            .iter()
            .map(|m| m["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["1", "2"]);
        assert_eq!(find_str(&v, "key").as_deref(), Some("ENG"));
        assert_eq!(find_str(&v, "missing"), None);
    }

    #[tokio::test]
    async fn memory_store_serializes_under_mcp_key() {
        let store = MemoryStore::default();
        store
            .save(StoredCredentials::new("cid".into(), None, vec![], None))
            .await
            .unwrap();
        let json: Value = serde_json::from_str(&store.credentials_json().await.unwrap()).unwrap();
        assert!(is_mcp(&json));
        assert_eq!(json["mcp"]["client_id"], "cid");
    }
}
