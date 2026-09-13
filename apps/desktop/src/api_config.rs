//! The desktop app's configured backend address (#738) — the ONE value that
//! decides which host the app may reach.
//!
//! It is read and written only here, in Rust, through a fixed store file. The
//! webview never touches the store plugin for it: `capabilities/default.json`
//! grants no `store:*` permission, and tauri-plugin-store 2.x has no per-file
//! scope that could grant one narrowly — any store grant would let the webview
//! read and rewrite every store file in the app data directory. The
//! `api_config_*` commands below are that narrow grant: one file, one key, and
//! every value validated before it is persisted.
//!
//! `net.rs` reads the same value to enforce the network allowlist, so the
//! address the user confirmed and the address traffic is allowed to reach can
//! never diverge.
//!
//! ## Confirmation gate on `api_config_clear` (#788)
//!
//! `api_config_clear` is destructive — it forgets the configured backend and
//! forces the app back to first-run — and every `#[tauri::command]` is
//! reachable from any script running in the webview. Without a gate, a
//! compromised renderer (or a stray click handler wired to the wrong handler)
//! could invoke it directly with zero user involvement.
//!
//! The gate is a one-time token that only `api_config_request_clear` can
//! issue, and it only issues one after the user answers a native OS dialog
//! (`tauri-plugin-dialog`, called from Rust — never exposed to the webview as
//! its own IPC command). That dialog is rendered outside the webview's
//! DOM/JS sandbox: a compromised renderer can call `api_config_request_clear`
//! all day, but it cannot script the resulting native dialog into clicking its
//! own "confirm" button. `api_config_clear` refuses to run without the exact
//! token that dialog answer produced; the token is single-use and expires
//! (`CLEAR_TOKEN_TTL`) so it cannot be hoarded or replayed. See
//! `src/client/lib/platform.ts::clearConfiguredApiBase` for the frontend side
//! of this handshake.

use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rand::RngCore;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_store::StoreExt;
use url::{Host, Url};

/// How long an issued clear-confirmation token remains valid. Short enough
/// that a token can't be hoarded and replayed long after the dialog it came
/// from; long enough that the frontend's immediate follow-up IPC call never
/// races it. Reduced under test so expiry is verifiable without a fake clock.
#[cfg(not(test))]
const CLEAR_TOKEN_TTL: Duration = Duration::from_secs(30);
#[cfg(test)]
const CLEAR_TOKEN_TTL: Duration = Duration::from_millis(20);

struct PendingClear {
    token: String,
    issued_at: Instant,
}

/// Holds at most one outstanding clear-confirmation token, issued by
/// `api_config_request_clear` after a confirmed native dialog and consumed by
/// `api_config_clear` on a successful match (see `consume_clear_token`).
#[derive(Default)]
pub struct ClearConfirmState(Mutex<Option<PendingClear>>);

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Issues a fresh token, discarding whatever was previously pending — only
/// the most recently confirmed dialog answer is ever honored.
fn issue_clear_token(state: &ClearConfirmState) -> String {
    let token = generate_token();
    *state.0.lock().expect("clear-confirm mutex poisoned") = Some(PendingClear {
        token: token.clone(),
        issued_at: Instant::now(),
    });
    token
}

/// Consumes the pending token if `candidate` matches it and it has not
/// expired.
///
/// Single-use on SUCCESS only: a mismatched guess is refused without
/// disturbing whatever token is actually pending. If a wrong guess cleared it
/// instead, anything invoking `api_config_clear` with garbage — an attacker
/// probing, a retried request, a stale client — would silently invalidate a
/// real confirmation the user is about to submit, turning a bad guess into a
/// denial of service against the legitimate flow. An expired token IS cleared
/// on the first access that notices, since nothing can ever consume it
/// successfully again.
fn consume_clear_token(state: &ClearConfirmState, candidate: &str) -> Result<(), String> {
    let mut guard = state.0.lock().expect("clear-confirm mutex poisoned");
    let matches = match guard.as_ref() {
        None => return Err("refused: confirm clearing the server address first".to_string()),
        Some(pending) if pending.issued_at.elapsed() > CLEAR_TOKEN_TTL => {
            *guard = None;
            return Err("refused: confirmation expired — confirm again".to_string());
        }
        Some(pending) => pending.token == candidate,
    };
    if !matches {
        return Err("refused: confirm clearing the server address first".to_string());
    }
    *guard = None;
    Ok(())
}

const CONFIG_STORE: &str = "llamenos-api-config.json";
const CONFIG_KEY: &str = "apiBaseUrl";

/// Plain `http://` to a loopback host is permitted only in debug builds
/// (`tauri:dev` against a local backend). A release build accepts `https://` only.
pub const ALLOW_LOOPBACK_HTTP: bool = cfg!(debug_assertions);

/// `localhost`, `127.0.0.1` or `[::1]` — exactly those, nothing "local-looking".
pub fn is_loopback_host(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(d) => d.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(ip) => *ip == Ipv4Addr::LOCALHOST,
        Host::Ipv6(ip) => *ip == Ipv6Addr::LOCALHOST,
    }
}

/// Checks the scheme/host/credentials rules shared by every backend-address
/// consumer: `https://`, or `http://` to a loopback host when
/// `allow_loopback_http` is set; a host is required; no userinfo.
pub fn check_backend_url(url: &Url, allow_loopback_http: bool) -> Result<(), String> {
    let host = url
        .host()
        .ok_or_else(|| "backend address has no host".to_string())?;
    match url.scheme() {
        "https" => {}
        "http" if allow_loopback_http && is_loopback_host(&host) => {}
        "http" => return Err("backend address must use https://".to_string()),
        other => {
            return Err(format!(
                "unsupported scheme {other}:// — backend address must use https://"
            ));
        }
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("backend address must not contain credentials".to_string());
    }
    Ok(())
}

/// Validates a backend address and returns its canonical origin
/// (`https://host[:port]`). The stored value is always an origin: a path,
/// query or fragment is rejected rather than silently dropped, so what is
/// persisted is exactly what the user confirmed.
pub fn validate_backend_origin(raw: &str, allow_loopback_http: bool) -> Result<String, String> {
    let url = Url::parse(raw.trim()).map_err(|e| format!("invalid backend address: {e}"))?;
    check_backend_url(&url, allow_loopback_http)?;
    if !matches!(url.path(), "" | "/") || url.query().is_some() || url.fragment().is_some() {
        return Err(
            "backend address must be an origin only (no path, query or fragment)".to_string(),
        );
    }
    Ok(url.origin().ascii_serialization())
}

/// The raw stored address, valid or not — `None` only on first run.
pub fn stored_address(app: &AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    Ok(store
        .get(CONFIG_KEY)
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.is_empty()))
}

/// The configured backend origin, or `None` if the user has not configured one.
/// A stored value that no longer validates (e.g. `http://` written by a debug
/// build, read by a release build) is an error — callers enforcing the
/// allowlist fail closed on it.
pub fn configured_origin(app: &AppHandle) -> Result<Option<Url>, String> {
    match stored_address(app)? {
        None => Ok(None),
        Some(raw) => {
            let origin = validate_backend_origin(&raw, ALLOW_LOOPBACK_HTTP)
                .map_err(|e| format!("configured backend address is invalid: {e}"))?;
            Url::parse(&origin)
                .map(Some)
                .map_err(|e| format!("configured backend address is invalid: {e}"))
        }
    }
}

fn clear(app: &AppHandle) -> Result<(), String> {
    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    store.delete(CONFIG_KEY);
    store
        .save()
        .map_err(|e| format!("could not save config store: {e}"))
}

/// Returns the configured backend origin, or `None` on first run. A stored
/// value that fails validation is removed (and logged), returning the app to
/// the first-run screen instead of leaving it wedged on an address it will
/// refuse to contact.
#[tauri::command]
pub fn api_config_get(app: AppHandle) -> Result<Option<String>, String> {
    match configured_origin(&app) {
        Ok(origin) => Ok(origin.map(|u| u.origin().ascii_serialization())),
        Err(e) => {
            tauri_plugin_log::log::warn!(
                "{e}; clearing it so the app returns to first-run configuration"
            );
            clear(&app)?;
            Ok(None)
        }
    }
}

/// First-run gate shared by `api_config_set` and `net_probe_health`: both are
/// permitted only while NO address is stored. An invalid stored value counts as
/// configured (fail closed); `api_config_get` clears such a value at boot.
pub fn require_unconfigured(stored: Option<&str>) -> Result<(), String> {
    match stored {
        None => Ok(()),
        Some(_) => {
            Err("refused: a backend server is already configured — clear it first".to_string())
        }
    }
}

/// Persists the backend address. Only permitted while none is configured —
/// changing servers means `api_config_clear` first (which the frontend pairs
/// with ending the session), so an address can never be swapped underneath a
/// live session.
#[tauri::command]
pub fn api_config_set(app: AppHandle, url: String) -> Result<String, String> {
    require_unconfigured(stored_address(&app)?.as_deref())?;
    let origin = validate_backend_origin(&url, ALLOW_LOOPBACK_HTTP)?;
    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    store.set(CONFIG_KEY, origin.clone());
    store
        .save()
        .map_err(|e| format!("could not save config store: {e}"))?;
    Ok(origin)
}

/// Shows a native (Rust-owned) confirmation dialog and, only if the user
/// confirms, issues a one-time token that `api_config_clear` will accept. See
/// the module doc comment for why this gate exists and what makes it
/// resistant to a compromised webview.
#[tauri::command]
pub fn api_config_request_clear(
    app: AppHandle,
    state: tauri::State<ClearConfirmState>,
) -> Result<String, String> {
    let confirmed = app
        .dialog()
        .message(
            "This forgets the configured server address and returns to first-run setup. \
             You will need to re-enter it to reconnect.",
        )
        .title("Forget server address?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Forget server".to_string(),
            "Cancel".to_string(),
        ))
        .blocking_show();
    if !confirmed {
        return Err("cancelled: server address was not cleared".to_string());
    }
    Ok(issue_clear_token(&state))
}

/// Forgets the backend address, returning the app to first-run configuration.
/// Requires `token` from a just-confirmed `api_config_request_clear` call —
/// see the module doc comment.
#[tauri::command]
pub fn api_config_clear(
    app: AppHandle,
    state: tauri::State<ClearConfirmState>,
    token: String,
) -> Result<(), String> {
    consume_clear_token(&state, &token)?;
    clear(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_run_gate_refuses_once_any_address_is_stored() {
        assert!(require_unconfigured(None).is_ok());
        for stored in ["https://app.example.org", "http://10.0.0.5", "not a url"] {
            let err = require_unconfigured(Some(stored)).unwrap_err();
            assert!(err.contains("already configured"), "{err}");
        }
    }

    #[test]
    fn https_origins_are_accepted_and_canonicalised() {
        assert_eq!(
            validate_backend_origin("https://App.Example.org", false).unwrap(),
            "https://app.example.org"
        );
        assert_eq!(
            validate_backend_origin("https://app.example.org/", false).unwrap(),
            "https://app.example.org"
        );
        assert_eq!(
            validate_backend_origin("https://app.example.org:443", false).unwrap(),
            "https://app.example.org"
        );
        assert_eq!(
            validate_backend_origin("https://10.0.0.5:8443", false).unwrap(),
            "https://10.0.0.5:8443"
        );
        assert_eq!(
            validate_backend_origin("https://[2001:db8::1]", false).unwrap(),
            "https://[2001:db8::1]"
        );
    }

    #[test]
    fn plain_http_is_rejected_without_the_dev_flag() {
        for addr in [
            "http://app.example.org",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://[::1]:3000",
        ] {
            assert!(
                validate_backend_origin(addr, false).is_err(),
                "{addr} must be rejected in a release build"
            );
        }
    }

    #[test]
    fn loopback_http_is_accepted_only_with_the_dev_flag() {
        assert_eq!(
            validate_backend_origin("http://localhost:3000", true).unwrap(),
            "http://localhost:3000"
        );
        assert_eq!(
            validate_backend_origin("http://127.0.0.1:3000", true).unwrap(),
            "http://127.0.0.1:3000"
        );
        assert_eq!(
            validate_backend_origin("http://[::1]:3000", true).unwrap(),
            "http://[::1]:3000"
        );
        // Not loopback — private ranges and look-alikes stay https-only even in dev.
        for addr in [
            "http://10.0.0.5",
            "http://192.168.1.10",
            "http://127.0.0.2",
            "http://localhost.attacker.com",
            "http://app.example.org",
        ] {
            assert!(
                validate_backend_origin(addr, true).is_err(),
                "{addr} must be rejected even with the dev flag"
            );
        }
    }

    #[test]
    fn clear_is_refused_without_ever_requesting_a_token() {
        let state = ClearConfirmState::default();
        let err = consume_clear_token(&state, "anything").unwrap_err();
        assert!(err.contains("confirm"), "{err}");
    }

    #[test]
    fn clear_is_refused_with_a_mismatched_token() {
        let state = ClearConfirmState::default();
        let real = issue_clear_token(&state);
        let err = consume_clear_token(&state, &format!("{real}-wrong")).unwrap_err();
        assert!(err.contains("confirm"), "{err}");
    }

    #[test]
    fn a_mismatched_guess_does_not_invalidate_the_real_pending_token() {
        // A wrong guess must not be able to DoS a confirmation the user is
        // about to submit — see consume_clear_token's doc comment.
        let state = ClearConfirmState::default();
        let real = issue_clear_token(&state);
        assert!(consume_clear_token(&state, "not-it").is_err());
        assert!(consume_clear_token(&state, &real).is_ok());
    }

    #[test]
    fn a_valid_token_is_single_use() {
        let state = ClearConfirmState::default();
        let token = issue_clear_token(&state);
        assert!(consume_clear_token(&state, &token).is_ok());
        let err = consume_clear_token(&state, &token).unwrap_err();
        assert!(err.contains("confirm"), "{err}");
    }

    #[test]
    fn issuing_a_new_token_invalidates_the_previous_one() {
        let state = ClearConfirmState::default();
        let first = issue_clear_token(&state);
        let second = issue_clear_token(&state);
        assert_ne!(first, second);
        let err = consume_clear_token(&state, &first).unwrap_err();
        assert!(err.contains("confirm"), "{err}");
        assert!(consume_clear_token(&state, &second).is_ok());
    }

    #[test]
    fn a_token_expires() {
        let state = ClearConfirmState::default();
        let token = issue_clear_token(&state);
        std::thread::sleep(CLEAR_TOKEN_TTL + Duration::from_millis(20));
        let err = consume_clear_token(&state, &token).unwrap_err();
        assert!(err.contains("expired"), "{err}");
    }

    #[test]
    fn non_origin_and_credentialed_addresses_are_rejected() {
        for addr in [
            "https://app.example.org/api",
            "https://app.example.org/?x=1",
            "https://app.example.org/#frag",
            "https://user:pass@app.example.org",
            "wss://app.example.org",
            "file:///etc/passwd",
            "app.example.org",
            "",
        ] {
            assert!(
                validate_backend_origin(addr, true).is_err(),
                "{addr} must be rejected"
            );
        }
    }
}
