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
//! Alongside the origin, this module persists the TLS certificate pins
//! captured for it (#775, `cert_pin.rs`): `apiCertPins`, written atomically
//! with `apiBaseUrl` by `api_config_set` and deleted together with it by
//! `clear()`, so the two can never drift independently.

use std::net::{Ipv4Addr, Ipv6Addr};

use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use url::{Host, Url};

const CONFIG_STORE: &str = "llamenos-api-config.json";
const CONFIG_KEY: &str = "apiBaseUrl";
const CONFIG_PINS_KEY: &str = "apiCertPins";

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

/// The stored certificate pins for the configured backend, or `None` if the
/// key was never written — a corrupt or pre-#775 legacy config, which
/// `net::load_or_reset_pinned_net` treats as invalid and clears. An empty
/// array is valid: it means "no TLS pinning", the only case being the
/// debug-only loopback `http://` backend (see `cert_pin::capture_pins`).
pub fn configured_pins(app: &AppHandle) -> Result<Option<Vec<String>>, String> {
    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    let Some(value) = store.get(CONFIG_PINS_KEY) else {
        return Ok(None);
    };
    let pins: Vec<String> = serde_json::from_value(value)
        .map_err(|e| format!("stored certificate pins are corrupt: {e}"))?;
    for pin in &pins {
        if !is_plausible_spki_pin(pin) {
            return Err(format!(
                "stored certificate pin does not look like a base64 SHA-256 hash: {pin}"
            ));
        }
    }
    Ok(Some(pins))
}

/// A base64 (standard) SHA-256 digest is always 44 characters — 43
/// alphanumeric/`+`/`/` plus one trailing `=` pad. Mirrors
/// `scripts/extract-cert-pins.sh`'s own `validate_pin`.
fn is_plausible_spki_pin(pin: &str) -> bool {
    pin.len() == 44
        && pin.ends_with('=')
        && pin.as_bytes()[..43]
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'+' || *b == b'/')
}

fn clear(app: &AppHandle) -> Result<(), String> {
    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    store.delete(CONFIG_KEY);
    store.delete(CONFIG_PINS_KEY);
    store
        .save()
        .map_err(|e| format!("could not save config store: {e}"))
}

/// Logs `reason` and clears the stored config — the shared fail-closed path
/// for an origin or pin set that no longer validates. Public so `net.rs` can
/// reach it from `load_or_reset_pinned_net` without duplicating the log +
/// clear pattern.
pub(crate) fn warn_and_clear(app: &AppHandle, reason: &str) -> Result<(), String> {
    tauri_plugin_log::log::warn!(
        "{reason}; clearing it so the app returns to first-run configuration"
    );
    clear(app)
}

/// Returns the configured backend origin, or `None` on first run. Delegates
/// to `net::load_or_reset_pinned_net`, which validates both the origin and
/// its pins together and clears the whole config (returning to first-run)
/// if either fails validation — see that function's docs.
#[tauri::command]
pub fn api_config_get(app: AppHandle) -> Result<Option<String>, String> {
    crate::net::load_or_reset_pinned_net(&app)
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
///
/// Also TOFU-pins the backend's TLS certificate (#775): before anything is
/// persisted, `net::capture_and_install_pins` makes one connection, requires
/// a real `2xx` from `/api/health`, and records the certificate's SPKI
/// hash(es). If that fails — unreachable backend, or a plaintext scheme this
/// build refuses — nothing is stored, matching the existing "invalid address"
/// rejection path. Origin and pins are then written together in one
/// `store.save()`, so they can never be observed out of sync.
#[tauri::command]
pub async fn api_config_set(app: AppHandle, url: String) -> Result<String, String> {
    require_unconfigured(stored_address(&app)?.as_deref())?;
    let origin = validate_backend_origin(&url, ALLOW_LOOPBACK_HTTP)?;
    let target = Url::parse(&origin).map_err(|e| format!("invalid backend address: {e}"))?;

    let pins = crate::net::capture_and_install_pins(&app, &target)
        .await
        .map_err(|e| format!("could not verify the backend's certificate: {e}"))?;

    let store = app
        .store(CONFIG_STORE)
        .map_err(|e| format!("could not open config store: {e}"))?;
    store.set(CONFIG_KEY, origin.clone());
    store.set(
        CONFIG_PINS_KEY,
        serde_json::to_value(&pins)
            .map_err(|e| format!("could not serialize certificate pins: {e}"))?,
    );
    store
        .save()
        .map_err(|e| format!("could not save config store: {e}"))?;
    Ok(origin)
}

/// Forgets the backend address (and its pins), returning the app to
/// first-run configuration.
#[tauri::command]
pub fn api_config_clear(app: AppHandle) -> Result<(), String> {
    clear(&app)?;
    app.state::<crate::net::PinnedNet>().clear();
    Ok(())
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
