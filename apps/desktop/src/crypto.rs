//! Tauri command wrappers around llamenos-core crypto operations (v3 API).
//!
//! All commands use `DeviceKeyState` which holds Ed25519 + X25519 keypairs
//! exclusively in the Rust process. The webview never receives secret key material.
//!
//! On desktop, the webview calls stateful commands via `platform.ts`.
//! Device keys are decrypted once (unlock_with_pin), stored in DeviceKeyState,
//! and zeroized on lock/quit/sleep.

use std::sync::Mutex;

use llamenos_core::{auth, device_keys, hpke_envelope, puk, sigchain};
use tauri_plugin_store::StoreExt;

fn err_str(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ── CryptoState — device key secrets live ONLY here, never in the webview ──

/// Holds the decrypted device key secrets in Rust memory. Zeroized on lock/quit.
pub struct CryptoState {
    /// Device secrets (Ed25519 signing seed + X25519 encryption seed), or None if locked.
    secrets: Mutex<Option<device_keys::DeviceSecrets>>,
    /// Device key state (public info: device_id, signing pubkey, encryption pubkey).
    device_state: Mutex<Option<device_keys::DeviceKeyState>>,
    /// PIN attempt counter — stored in Rust memory only (JS cannot tamper via plugin:store|set).
    pin_failed_attempts: Mutex<u32>,
    /// PIN lockout expiry — epoch millis. Zero means no lockout.
    pin_lockout_until: Mutex<u64>,
}

impl CryptoState {
    pub fn new() -> Self {
        Self {
            secrets: Mutex::new(None),
            device_state: Mutex::new(None),
            pin_failed_attempts: Mutex::new(0),
            pin_lockout_until: Mutex::new(0),
        }
    }

    /// Zeroize secrets and lock.
    pub fn lock(&self) {
        // DeviceSecrets implements Zeroize on drop
        *self.secrets.lock().unwrap() = None;
        *self.device_state.lock().unwrap() = None;
    }

    fn with_secrets<T>(
        &self,
        f: impl FnOnce(&device_keys::DeviceSecrets) -> Result<T, String>,
    ) -> Result<T, String> {
        let guard = self.secrets.lock().unwrap();
        let secrets = guard
            .as_ref()
            .ok_or_else(|| "Device key is locked. Enter PIN to unlock.".to_string())?;
        f(secrets)
    }

    fn get_device_state(&self) -> Result<device_keys::DeviceKeyState, String> {
        self.device_state
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "Device key is locked. Enter PIN to unlock.".into())
    }

    fn encryption_secret_hex(&self) -> Result<String, String> {
        self.with_secrets(|s| Ok(hex::encode(s.encryption_seed)))
    }
}

// ── Stateful commands (device secrets stay in Rust) ──────────────────

/// Generate a new device keypair, encrypt with PIN, and load into CryptoState.
/// Returns the encrypted key blob and public device state — secrets NEVER leave Rust.
#[tauri::command]
pub fn device_generate_and_load(
    state: tauri::State<'_, CryptoState>,
    pin: String,
    device_id: String,
) -> Result<serde_json::Value, String> {
    let encrypted = device_keys::generate_device_keys(&device_id, &pin).map_err(err_str)?;
    let secrets = device_keys::unlock_device_keys(&encrypted, &pin).map_err(err_str)?;

    let device_state = encrypted.state.clone();
    *state.secrets.lock().unwrap() = Some(secrets);
    *state.device_state.lock().unwrap() = Some(device_state.clone());

    let result = serde_json::to_value(&encrypted).map_err(err_str)?;
    Ok(result)
}

/// Decrypt device keys from PIN-encrypted storage, load into CryptoState.
/// Returns only the device state (public keys) — secrets NEVER leave the Rust process.
///
/// PIN lockout schedule:
///   1-4 failures: no lockout
///   5-6 failures: 30s lockout
///   7-8 failures: 2min lockout
///   9 failures: 10min lockout
///   10+ failures: wipe encrypted keys from store
#[tauri::command]
pub fn unlock_with_pin(
    state: tauri::State<'_, CryptoState>,
    app_handle: tauri::AppHandle,
    data: device_keys::EncryptedDeviceKeys,
    pin: String,
) -> Result<serde_json::Value, String> {
    let attempts: u32 = *state.pin_failed_attempts.lock().unwrap();
    let lockout_until: u64 = *state.pin_lockout_until.lock().unwrap();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    if now < lockout_until {
        let remaining = (lockout_until - now) / 1000;
        return Err(format!("Locked out. Try again in {remaining} seconds"));
    }

    match device_keys::unlock_device_keys(&data, &pin) {
        Ok(secrets) => {
            *state.pin_failed_attempts.lock().unwrap() = 0;
            *state.pin_lockout_until.lock().unwrap() = 0;

            let device_state = data.state.clone();
            *state.secrets.lock().unwrap() = Some(secrets);
            *state.device_state.lock().unwrap() = Some(device_state.clone());

            serde_json::to_value(&device_state).map_err(err_str)
        }
        Err(_) => {
            let new_attempts = attempts + 1;
            *state.pin_failed_attempts.lock().unwrap() = new_attempts;

            let lockout_ms: u64 = match new_attempts {
                1..=4 => 0,
                5..=6 => 30_000,
                7..=8 => 120_000,
                9 => 600_000,
                _ => {
                    let store = app_handle
                        .store("keys.json")
                        .map_err(|e: tauri_plugin_store::Error| e.to_string())?;
                    store.delete("llamenos-encrypted-device-keys");
                    *state.pin_failed_attempts.lock().unwrap() = 0;
                    *state.pin_lockout_until.lock().unwrap() = 0;
                    return Err("Too many failed attempts. Keys wiped.".to_string());
                }
            };
            if lockout_ms > 0 {
                *state.pin_lockout_until.lock().unwrap() = now + lockout_ms;
            }
            Err("Wrong PIN".to_string())
        }
    }
}

/// Lock the crypto state — zeroizes device secrets.
#[tauri::command]
pub fn lock_crypto(state: tauri::State<'_, CryptoState>) {
    state.lock();
}

/// Check if the crypto state is unlocked.
#[tauri::command]
pub fn is_crypto_unlocked(state: tauri::State<'_, CryptoState>) -> bool {
    state.secrets.lock().unwrap().is_some()
}

/// Get the device public keys from CryptoState (no secret key exposure).
#[tauri::command]
pub fn get_device_pubkeys(state: tauri::State<'_, CryptoState>) -> Result<serde_json::Value, String> {
    let ds = state.get_device_state()?;
    serde_json::to_value(&ds).map_err(err_str)
}

// ── Auth tokens (Ed25519) ───────────────────────────────────────────

/// Create an Ed25519 auth token using the device signing key in CryptoState.
#[tauri::command]
pub fn create_auth_token_from_state(
    state: tauri::State<'_, CryptoState>,
    timestamp: u64,
    method: String,
    path: String,
) -> Result<String, String> {
    state.with_secrets(|secrets| {
        let token = auth::create_auth_token(secrets, timestamp, &method, &path).map_err(err_str)?;
        serde_json::to_string(&token).map_err(err_str)
    })
}

// ── Ed25519 signing/verification ────────────────────────────────────

/// Sign a message (hex-encoded) using the device's Ed25519 key.
#[tauri::command]
pub fn ed25519_sign_from_state(
    state: tauri::State<'_, CryptoState>,
    message_hex: String,
) -> Result<String, String> {
    let message = hex::decode(&message_hex).map_err(err_str)?;
    state.with_secrets(|secrets| {
        let sig = device_keys::sign_bytes(secrets, &message);
        Ok(hex::encode(sig))
    })
}

/// Verify an Ed25519 signature (stateless — no secrets needed).
#[tauri::command]
pub fn ed25519_verify(
    message_hex: String,
    signature_hex: String,
    pubkey_hex: String,
) -> Result<bool, String> {
    let message = hex::decode(&message_hex).map_err(err_str)?;
    let signature = hex::decode(&signature_hex).map_err(err_str)?;
    device_keys::verify_signature(&message, &signature, &pubkey_hex).map_err(err_str)
}

// ── HPKE envelope encryption ───────────────────────────────────────

/// HPKE seal: encrypt plaintext for a recipient's X25519 pubkey (stateless).
#[tauri::command]
pub fn hpke_seal(
    plaintext_hex: String,
    recipient_pubkey_hex: String,
    label: String,
    aad_hex: String,
) -> Result<serde_json::Value, String> {
    let plaintext = hex::decode(&plaintext_hex).map_err(err_str)?;
    let aad = hex::decode(&aad_hex).map_err(err_str)?;
    let envelope =
        hpke_envelope::hpke_seal(&plaintext, &recipient_pubkey_hex, &label, &aad).map_err(err_str)?;
    serde_json::to_value(&envelope).map_err(err_str)
}

/// HPKE open: decrypt an envelope using the device's X25519 key from CryptoState.
#[tauri::command]
pub fn hpke_open_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: hpke_envelope::HpkeEnvelope,
    expected_label: String,
    aad_hex: String,
) -> Result<String, String> {
    let aad = hex::decode(&aad_hex).map_err(err_str)?;
    let secret_hex = state.encryption_secret_hex()?;
    let plaintext =
        hpke_envelope::hpke_open(&envelope, &secret_hex, &expected_label, &aad).map_err(err_str)?;
    Ok(hex::encode(plaintext))
}

/// HPKE seal a 32-byte key for a recipient (convenience wrapper).
#[tauri::command]
pub fn hpke_seal_key(
    key_hex: String,
    recipient_pubkey_hex: String,
    label: String,
    aad_hex: String,
) -> Result<serde_json::Value, String> {
    let key_bytes = hex::decode(&key_hex).map_err(err_str)?;
    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let aad = hex::decode(&aad_hex).map_err(err_str)?;
    let envelope =
        hpke_envelope::hpke_seal_key(&key, &recipient_pubkey_hex, &label, &aad).map_err(err_str)?;
    serde_json::to_value(&envelope).map_err(err_str)
}

/// HPKE open a 32-byte key from an envelope using CryptoState.
#[tauri::command]
pub fn hpke_open_key_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: hpke_envelope::HpkeEnvelope,
    expected_label: String,
    aad_hex: String,
) -> Result<String, String> {
    let aad = hex::decode(&aad_hex).map_err(err_str)?;
    let secret_hex = state.encryption_secret_hex()?;
    let key =
        hpke_envelope::hpke_open_key(&envelope, &secret_hex, &expected_label, &aad)
            .map_err(err_str)?;
    Ok(hex::encode(key))
}

// ── PUK (Per-User Key) ─────────────────────────────────────────────

/// Create the initial PUK (generation 1), wrapped to the device's X25519 pubkey.
#[tauri::command]
pub fn puk_create_from_state(
    state: tauri::State<'_, CryptoState>,
) -> Result<serde_json::Value, String> {
    let ds = state.get_device_state()?;
    let (puk_state, seed, envelope) =
        puk::create_initial_puk(&ds.encryption_pubkey_hex, &ds.device_id).map_err(err_str)?;

    Ok(serde_json::json!({
        "pukState": serde_json::to_value(&puk_state).map_err(err_str)?,
        "seedHex": hex::encode(seed),
        "envelope": serde_json::to_value(&envelope).map_err(err_str)?,
    }))
}

/// Rotate the PUK to a new generation.
#[tauri::command]
pub fn puk_rotate(
    old_seed_hex: String,
    old_gen: u32,
    remaining_devices_json: String,
) -> Result<serde_json::Value, String> {
    let old_seed_bytes = hex::decode(&old_seed_hex).map_err(err_str)?;
    if old_seed_bytes.len() != 32 {
        return Err("PUK seed must be 32 bytes".into());
    }
    let mut old_seed = [0u8; 32];
    old_seed.copy_from_slice(&old_seed_bytes);

    let remaining_devices: Vec<(String, String)> =
        serde_json::from_str(&remaining_devices_json).map_err(err_str)?;

    let result = puk::rotate_puk(&old_seed, old_gen, &remaining_devices).map_err(err_str)?;
    serde_json::to_value(&result).map_err(err_str)
}

/// Unwrap a PUK seed from an HPKE envelope using CryptoState.
#[tauri::command]
pub fn puk_unwrap_seed_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: hpke_envelope::HpkeEnvelope,
    expected_label: String,
    aad_hex: String,
) -> Result<String, String> {
    let aad = hex::decode(&aad_hex).map_err(err_str)?;
    let secret_hex = state.encryption_secret_hex()?;
    let seed =
        hpke_envelope::hpke_open_key(&envelope, &secret_hex, &expected_label, &aad)
            .map_err(err_str)?;
    Ok(hex::encode(seed))
}

// ── Sigchain ────────────────────────────────────────────────────────

/// Sign a new sigchain link using the device's Ed25519 key from CryptoState.
#[tauri::command]
pub fn sigchain_create_link_from_state(
    state: tauri::State<'_, CryptoState>,
    id: String,
    seq: u64,
    prev_hash: Option<String>,
    timestamp: String,
    payload_json: String,
) -> Result<serde_json::Value, String> {
    let ds = state.get_device_state()?;
    state.with_secrets(|secrets| {
        let link = sigchain::create_sigchain_link(
            secrets,
            &id,
            &ds.device_id,
            seq,
            prev_hash.clone(),
            &timestamp,
            &payload_json,
        )
        .map_err(err_str)?;
        serde_json::to_value(&link).map_err(err_str)
    })
}

/// Verify a sigchain (stateless — no secrets needed).
#[tauri::command]
pub fn sigchain_verify(links_json: String) -> Result<serde_json::Value, String> {
    let links: Vec<sigchain::SigchainLink> = serde_json::from_str(&links_json).map_err(err_str)?;
    let result = sigchain::verify_sigchain(&links).map_err(err_str)?;
    serde_json::to_value(&result).map_err(err_str)
}

/// Verify a single sigchain link (stateless).
#[tauri::command]
pub fn sigchain_verify_link(
    link_json: String,
    expected_signer_pubkey: String,
) -> Result<bool, String> {
    let link: sigchain::SigchainLink = serde_json::from_str(&link_json).map_err(err_str)?;
    sigchain::verify_sigchain_link(&link, &expected_signer_pubkey).map_err(err_str)
}

// ── SFrame key derivation ───────────────────────────────────────────

/// Derive an SFrame key for a call participant (stateless).
#[tauri::command]
pub fn sframe_derive_key(
    exporter_secret_hex: String,
    call_id: String,
    participant_index: u32,
) -> Result<String, String> {
    let exporter_secret = hex::decode(&exporter_secret_hex).map_err(err_str)?;
    let key = llamenos_core::sframe::derive_sframe_key(&exporter_secret, &call_id, participant_index)
        .map_err(err_str)?;
    Ok(hex::encode(key))
}
