//! Runtime-enforced network egress for the desktop webview (#739).
//!
//! A packaged Tauri build's CSP `connect-src` allows only `ipc: http://ipc.localhost`
//! (see `apps/desktop/tauri.conf.json`) — the webview cannot open a raw `fetch` or
//! `WebSocket` to any remote host. All HTTP and WebSocket traffic to the configured
//! backend is instead proxied through the commands in this module, which re-check
//! the target origin against the SAME persisted `apiBaseUrl` that
//! `src/client/lib/api-config.ts` reads and writes (via the Tauri Store,
//! `llamenos-api-config.json`). This makes "which hosts can this app reach" a
//! runtime decision driven by the user's own configuration rather than a
//! build-time CSP allowlist — see #739 for the security rationale and the
//! rejected alternatives (widening the CSP allowlist at build time, or shipping
//! a separate relaxed-CSP internal build).
//!
//! Two distinct trust levels:
//!   - `net_fetch` / `net_ws_connect` enforce the allowlist: the target must be
//!     the CONFIRMED, persisted backend (or a same-parent-domain sibling host,
//!     for a WS relay on a different subdomain than the API).
//!   - `net_probe_health` intentionally skips the allowlist — it exists to test
//!     a CANDIDATE address before the user confirms it, so there is nothing
//!     persisted yet to check against. It is restricted instead: fixed GET,
//!     fixed `/api/health` path, no body, no caller-supplied headers, so an
//!     untrusted/malicious host can only ever receive a harmless, credential-free
//!     GET request.

use std::collections::HashMap;
use std::time::Duration;

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex as AsyncMutex;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use url::Url;

const CONFIG_STORE: &str = "llamenos-api-config.json";
const CONFIG_KEY: &str = "apiBaseUrl";
const REQUEST_TIMEOUT_SECS: u64 = 20;

/// Reads the user-configured backend origin from the same Tauri Store that
/// `api-config.ts` writes to. `apiBaseUrl` there is an ORIGIN only
/// (`https://host:port`, no path) — see the comment at the top of
/// `api-config.ts` for why the `/api` prefix is never part of the stored value.
fn configured_origin(app: &AppHandle) -> Result<Url, String> {
    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    let raw = store
        .get(CONFIG_KEY)
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "no backend server configured".to_string())?;
    Url::parse(&raw).map_err(|e| format!("configured backend address is invalid: {e}"))
}

/// True if `candidate` is exactly `configured`, or shares the same parent
/// domain (last two DNS labels — e.g. `relay.example.org` and `app.example.org`
/// both match `example.org`). This lets one configured backend host authorize a
/// same-organization WS relay host without widening the allowlist to arbitrary
/// domains. Deliberately simple (no public-suffix-list): a two-label match is
/// sufficient to block unrelated attacker domains, which is the property this
/// check exists for.
fn same_or_sibling_host(configured: &str, candidate: &str) -> bool {
    if configured.eq_ignore_ascii_case(candidate) {
        return true;
    }
    fn parent_domain(host: &str) -> Option<String> {
        let labels: Vec<&str> = host.split('.').collect();
        if labels.len() < 2 {
            return None;
        }
        Some(labels[labels.len() - 2..].join("."))
    }
    match (parent_domain(configured), parent_domain(candidate)) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(&b),
        _ => false,
    }
}

fn check_http_allowed(app: &AppHandle, target: &Url) -> Result<(), String> {
    let configured = configured_origin(app)?;
    let same_scheme = target.scheme() == configured.scheme();
    let same_host = configured
        .host_str()
        .zip(target.host_str())
        .map(|(a, b)| a.eq_ignore_ascii_case(b))
        .unwrap_or(false);
    let same_port = target.port_or_known_default() == configured.port_or_known_default();
    if same_scheme && same_host && same_port {
        Ok(())
    } else {
        Err(format!(
            "blocked: {} is not the configured backend ({})",
            target.origin().ascii_serialization(),
            configured.origin().ascii_serialization(),
        ))
    }
}

fn check_ws_allowed(app: &AppHandle, target: &Url) -> Result<(), String> {
    let configured = configured_origin(app)?;
    let expected_scheme = match configured.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => other,
    };
    if target.scheme() != expected_scheme {
        return Err(format!(
            "blocked: expected {expected_scheme}:// for the configured backend, got {}://",
            target.scheme()
        ));
    }
    let target_host = target.host_str().ok_or("blocked: target URL has no host")?;
    let configured_host = configured
        .host_str()
        .ok_or("configured backend URL has no host")?;
    if !same_or_sibling_host(configured_host, target_host) {
        return Err(format!(
            "blocked: {target_host} is not the configured backend or a sibling host of it"
        ));
    }
    Ok(())
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .expect("reqwest client builds with static config")
}

fn base64_encode(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("invalid base64 request body: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    /// Base64-encoded response body — binary-safe (call recordings, file
    /// downloads/uploads all pass through this same command). Serialized as
    /// `bodyBase64` — must match the field name `src/client/lib/net.ts` reads.
    pub body_base64: String,
}

/// Proxy an HTTP request to the configured backend. Rejects any target whose
/// origin does not exactly match the persisted `apiBaseUrl`.
#[tauri::command]
pub async fn net_fetch(
    app: AppHandle,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body_base64: Option<String>,
) -> Result<NetResponse, String> {
    let target = Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    check_http_allowed(&app, &target)?;

    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("invalid HTTP method: {e}"))?;
    let mut req = http_client().request(method, target);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b64) = body_base64 {
        req = req.body(base64_decode(&b64)?);
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    let status = res.status().as_u16();
    let mut out_headers = HashMap::new();
    for (name, value) in res.headers().iter() {
        if let Ok(v) = value.to_str() {
            out_headers.insert(name.to_string(), v.to_string());
        }
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("network error reading response body: {e}"))?;

    Ok(NetResponse {
        status,
        headers: out_headers,
        body_base64: base64_encode(&bytes),
    })
}

/// Test a CANDIDATE server address before it is confirmed/persisted — used by
/// the first-run and settings "Server address" screens. See the module-level
/// doc comment for why this intentionally does not check the allowlist.
#[tauri::command]
pub async fn net_probe_health(url: String) -> Result<NetResponse, String> {
    let mut target = Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    if target.scheme() != "http" && target.scheme() != "https" {
        return Err("only http/https addresses are supported".to_string());
    }
    target.set_path("/api/health");
    target.set_query(None);

    let res = http_client()
        .get(target)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    let status = res.status().as_u16();
    let bytes = res.bytes().await.unwrap_or_default();

    Ok(NetResponse {
        status,
        headers: HashMap::new(),
        body_base64: base64_encode(&bytes),
    })
}

// ---------------------------------------------------------------------------
// WebSocket relay proxy
// ---------------------------------------------------------------------------
// The frontend never opens a raw `WebSocket` to a remote host in a packaged
// build with a configured backend — it calls `net_ws_connect`, which validates
// the target (see `check_ws_allowed`) and then runs the actual connection here
// in Rust, forwarding frames to the webview as `net-ws:<id>` Tauri events. The
// JS-side shim (`src/client/lib/net.ts`'s `TauriRelaySocket`) presents this as
// a plain `WebSocket`-compatible object to `RelayConnection`.

type WsSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
type WsWriter = futures_util::stream::SplitSink<WsSocket, WsMessage>;

#[derive(Default)]
pub struct WsRegistry(AsyncMutex<HashMap<String, WsWriter>>);

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
enum WsEvent {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "message")]
    Message { data: String },
    #[serde(rename = "close")]
    Close { code: u16, reason: String },
    #[serde(rename = "error")]
    Error { message: String },
}

fn ws_channel(id: &str) -> String {
    format!("net-ws:{id}")
}

/// Open a WebSocket connection to the configured backend (or a sibling relay
/// host on the same parent domain) and start forwarding frames to the webview.
#[tauri::command]
pub async fn net_ws_connect(
    app: AppHandle,
    registry: State<'_, WsRegistry>,
    id: String,
    url: String,
) -> Result<(), String> {
    let target = Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    check_ws_allowed(&app, &target)?;

    let (ws_stream, _response) = tokio_tungstenite::connect_async(target.as_str())
        .await
        .map_err(|e| format!("websocket connect failed: {e}"))?;
    let (write, mut read) = ws_stream.split();

    registry.0.lock().await.insert(id.clone(), write);

    let app_handle = app.clone();
    let conn_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let channel = ws_channel(&conn_id);
        let _ = app_handle.emit(&channel, WsEvent::Open);

        while let Some(msg) = read.next().await {
            match msg {
                Ok(WsMessage::Text(text)) => {
                    let _ = app_handle.emit(
                        &channel,
                        WsEvent::Message {
                            data: text.to_string(),
                        },
                    );
                }
                Ok(WsMessage::Binary(_)) => {
                    // The relay protocol (packages/protocol/schemas/ws-messages.ts) is
                    // JSON-text-only — no binary frames are expected.
                }
                Ok(WsMessage::Close(frame)) => {
                    let (code, reason) = frame
                        .map(|f| (u16::from(f.code), f.reason.to_string()))
                        .unwrap_or((1000, String::new()));
                    let _ = app_handle.emit(&channel, WsEvent::Close { code, reason });
                    break;
                }
                Ok(_) => {
                    // Ping/Pong/Frame — tungstenite handles ping/pong internally.
                }
                Err(e) => {
                    let _ = app_handle.emit(
                        &channel,
                        WsEvent::Error {
                            message: e.to_string(),
                        },
                    );
                    break;
                }
            }
        }

        if let Some(state) = app_handle.try_state::<WsRegistry>() {
            state.0.lock().await.remove(&conn_id);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn net_ws_send(
    registry: State<'_, WsRegistry>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut map = registry.0.lock().await;
    let writer = map.get_mut(&id).ok_or("no such WebSocket connection")?;
    writer
        .send(WsMessage::Text(data))
        .await
        .map_err(|e| format!("websocket send failed: {e}"))
}

#[tauri::command]
pub async fn net_ws_close(registry: State<'_, WsRegistry>, id: String) -> Result<(), String> {
    let mut map = registry.0.lock().await;
    if let Some(mut writer) = map.remove(&id) {
        let _ = writer.close().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sibling_host_matches_same_parent_domain() {
        assert!(same_or_sibling_host(
            "app.llamenos.org",
            "relay.llamenos.org"
        ));
        assert!(same_or_sibling_host("app.llamenos.org", "app.llamenos.org"));
        assert!(same_or_sibling_host("llamenos.org", "llamenos.org"));
    }

    #[test]
    fn sibling_host_rejects_unrelated_domains() {
        assert!(!same_or_sibling_host(
            "app.llamenos.org",
            "attacker.example.com"
        ));
        assert!(!same_or_sibling_host(
            "app.llamenos.org",
            "llamenos.org.attacker.com"
        ));
        assert!(!same_or_sibling_host("localhost", "attacker.com"));
    }
}
