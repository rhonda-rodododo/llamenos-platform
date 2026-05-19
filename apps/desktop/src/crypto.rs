//! Tauri command wrappers around llamenos-core crypto operations (v3 API).
//!
//! All commands use `DeviceKeyState` which holds Ed25519 + X25519 keypairs
//! exclusively in the Rust process. The webview never receives secret key material.
//!
//! On desktop, the webview calls stateful commands via `platform.ts`.
//! Device keys are decrypted once (unlock_with_pin), stored in DeviceKeyState,
//! and zeroized on lock/quit/sleep.
//!
//! Encrypted device key blobs are persisted in Tauri Stronghold (encrypted vault
//! with PBKDF2 key derivation) via the frontend — see `platform.ts`. This module
//! does not access storage directly; it only manages in-memory crypto state.

use std::sync::Mutex;

use llamenos_core::{auth, device_keys, hpke_envelope, puk, sas, sigchain};

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};

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
    /// Hub symmetric key — 32 bytes for AES-256-GCM hub event decryption.
    /// Stored in Rust to prevent webview JS from accessing it (H2 hardening).
    hub_key: Mutex<Option<Vec<u8>>>,
    /// Server event key(s) — epoch-scoped symmetric keys for relay event decryption.
    /// Current + previous epoch for rolling window (H5 hardening).
    server_event_keys: Mutex<Vec<(u64, Vec<u8>)>>,
}

impl CryptoState {
    pub fn new() -> Self {
        Self {
            secrets: Mutex::new(None),
            device_state: Mutex::new(None),
            pin_failed_attempts: Mutex::new(0),
            pin_lockout_until: Mutex::new(0),
            hub_key: Mutex::new(None),
            server_event_keys: Mutex::new(Vec::new()),
        }
    }

    /// Zeroize secrets and lock.
    pub fn lock(&self) {
        // DeviceSecrets implements Zeroize on drop
        *self.secrets.lock().unwrap() = None;
        *self.device_state.lock().unwrap() = None;
        *self.hub_key.lock().unwrap() = None;
        self.server_event_keys.lock().unwrap().clear();
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
///   10+ failures: signal frontend to wipe encrypted keys from Stronghold
#[tauri::command]
pub fn unlock_with_pin(
    state: tauri::State<'_, CryptoState>,
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
                    // Signal the frontend to wipe the encrypted keys from Stronghold.
                    // The frontend handles storage — Rust only manages in-memory state.
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

// ── SAS emoji verification ─────────────────────────────────────────

/// Derive 7 SAS emoji indices from two Ed25519 public keys and a random nonce.
/// Both parties compute the same result regardless of argument order.
/// Returns an array of 7 indices (0-63) and the corresponding emoji strings.
#[tauri::command]
pub fn derive_sas(
    pubkey_a_hex: String,
    pubkey_b_hex: String,
    nonce_hex: String,
) -> Result<serde_json::Value, String> {
    let pk_a_bytes = hex::decode(&pubkey_a_hex).map_err(err_str)?;
    let pk_b_bytes = hex::decode(&pubkey_b_hex).map_err(err_str)?;
    let nonce_bytes = hex::decode(&nonce_hex).map_err(err_str)?;

    if pk_a_bytes.len() != 32 {
        return Err(format!("pubkey_a must be 32 bytes, got {}", pk_a_bytes.len()));
    }
    if pk_b_bytes.len() != 32 {
        return Err(format!("pubkey_b must be 32 bytes, got {}", pk_b_bytes.len()));
    }
    if nonce_bytes.len() != 32 {
        return Err(format!("nonce must be 32 bytes, got {}", nonce_bytes.len()));
    }

    let mut pk_a = [0u8; 32];
    let mut pk_b = [0u8; 32];
    let mut nonce = [0u8; 32];
    pk_a.copy_from_slice(&pk_a_bytes);
    pk_b.copy_from_slice(&pk_b_bytes);
    nonce.copy_from_slice(&nonce_bytes);

    let indices = sas::derive_sas(&pk_a, &pk_b, &nonce).map_err(err_str)?;
    let emojis: Vec<&str> = indices.iter().map(|&i| sas::sas_emoji(i)).collect();

    Ok(serde_json::json!({
        "indices": indices,
        "emojis": emojis,
    }))
}

// ── Hub event decryption (H2 hardening — symmetric key stays in Rust) ──

/// Store a hub symmetric key in CryptoState. Called after unwrapping from HPKE envelope.
/// The key NEVER enters JavaScript — it goes directly from HPKE open to this state.
#[tauri::command]
pub fn set_hub_key(state: tauri::State<'_, CryptoState>, hub_key_hex: String) -> Result<(), String> {
    let key_bytes = hex::decode(&hub_key_hex).map_err(err_str)?;
    if key_bytes.len() != 32 {
        return Err(format!("Hub key must be 32 bytes, got {}", key_bytes.len()));
    }
    *state.hub_key.lock().unwrap() = Some(key_bytes);
    Ok(())
}

/// Store server event keys (current + previous epoch) in CryptoState.
/// Called from JS after receiving keys from /api/auth/me.
#[tauri::command]
pub fn set_server_event_keys(
    state: tauri::State<'_, CryptoState>,
    keys: Vec<(u64, String)>,
) -> Result<(), String> {
    let mut decoded = Vec::with_capacity(keys.len());
    for (epoch, hex_key) in keys {
        let key_bytes = hex::decode(&hex_key).map_err(err_str)?;
        if key_bytes.len() != 32 {
            return Err(format!("Event key must be 32 bytes, got {}", key_bytes.len()));
        }
        decoded.push((epoch, key_bytes));
    }
    *state.server_event_keys.lock().unwrap() = decoded;
    Ok(())
}

/// Decrypt hub event content using the hub key stored in CryptoState.
/// Input: hex-encoded nonce(12) + ciphertext (AES-256-GCM).
/// AAD: LABEL_HUB_EVENT bytes for domain separation.
/// Returns the decrypted plaintext string.
#[tauri::command]
pub fn decrypt_hub_event(
    state: tauri::State<'_, CryptoState>,
    ciphertext_hex: String,
) -> Result<String, String> {
    let hub_key = state.hub_key.lock().unwrap();
    let key = hub_key.as_ref().ok_or("Hub key not loaded")?;

    let data = hex::decode(&ciphertext_hex).map_err(err_str)?;
    if data.len() < 28 {
        return Err("Ciphertext too short (need at least 12-byte nonce + 16-byte tag)".into());
    }

    let nonce = Nonce::from_slice(&data[..12]);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid hub key: {e}"))?;
    let plaintext = cipher.decrypt(nonce, Payload {
        msg: &data[12..],
        aad: llamenos_core::LABEL_HUB_EVENT.as_bytes(),
    })
        .map_err(|_| "Hub event decryption failed (wrong key or corrupted data)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in decrypted content: {e}"))
}

/// Encrypt a plaintext string with the hub key using an arbitrary label as AAD.
/// Input: plaintext string, AAD label string.
/// Output: hex-encoded nonce(12) + ciphertext (AES-256-GCM).
/// Used for team/tag field encryption with domain-separated labels.
#[tauri::command]
pub fn encrypt_hub_field(
    state: tauri::State<'_, CryptoState>,
    plaintext: String,
    label: String,
) -> Result<String, String> {
    // Validate label against registry — reject unknown labels
    if llamenos_core::labels::label_to_id(&label).is_none() {
        return Err(format!("Unknown crypto label: {label}. Labels must be registered in the label registry."));
    }

    let hub_key = state.hub_key.lock().unwrap();
    let key = hub_key.as_ref().ok_or("Hub key not loaded")?;

    let mut nonce_bytes = [0u8; 12];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid hub key: {e}"))?;
    let ciphertext = cipher.encrypt(nonce, Payload {
        msg: plaintext.as_bytes(),
        aad: label.as_bytes(),
    })
        .map_err(|e| format!("Encryption failed: {e}"))?;

    let mut packed = Vec::with_capacity(12 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    Ok(hex::encode(packed))
}

/// Decrypt a hub-encrypted field using an arbitrary label as AAD.
/// Input: hex-encoded nonce(12) + ciphertext (AES-256-GCM), AAD label string.
/// Used for team/tag field decryption with domain-separated labels.
#[tauri::command]
pub fn decrypt_hub_field(
    state: tauri::State<'_, CryptoState>,
    ciphertext_hex: String,
    label: String,
) -> Result<String, String> {
    // Validate label against registry — reject unknown labels
    if llamenos_core::labels::label_to_id(&label).is_none() {
        return Err(format!("Unknown crypto label: {label}. Labels must be registered in the label registry."));
    }

    let hub_key = state.hub_key.lock().unwrap();
    let key = hub_key.as_ref().ok_or("Hub key not loaded")?;

    let data = hex::decode(&ciphertext_hex).map_err(err_str)?;
    if data.len() < 28 {
        return Err("Ciphertext too short (need at least 12-byte nonce + 16-byte tag)".into());
    }

    let nonce = Nonce::from_slice(&data[..12]);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid hub key: {e}"))?;
    let plaintext = cipher.decrypt(nonce, Payload {
        msg: &data[12..],
        aad: label.as_bytes(),
    })
        .map_err(|_| "Hub field decryption failed (wrong key, label, or corrupted data)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in decrypted content: {e}"))
}

// ── Shamir Secret Sharing (GF(2^8)) ────────────────────────────────

/// GF(2^8) multiply using irreducible polynomial x^8 + x^4 + x^3 + x + 1.
fn gf256_mul(a: u8, b: u8) -> u8 {
    let mut result: u8 = 0;
    let mut aa = a;
    let mut bb = b;
    for _ in 0..8 {
        if bb & 1 != 0 {
            result ^= aa;
        }
        let carry = aa & 0x80;
        aa = aa.wrapping_shl(1);
        if carry != 0 {
            aa ^= 0x1b;
        }
        bb >>= 1;
    }
    result
}

/// GF(2^8) modular inverse via Fermat's little theorem: a^254 in GF(2^8).
fn gf256_inv(a: u8) -> u8 {
    assert!(a != 0, "Cannot invert zero in GF(256)");
    let mut result = a;
    for _ in 0..6 {
        result = gf256_mul(result, result);
        result = gf256_mul(result, a);
    }
    result = gf256_mul(result, result);
    result
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ShamirShareJson {
    pub x: u8,
    pub y: String, // hex
}

#[derive(serde::Serialize)]
pub struct ShamirSplitResult {
    pub shares: Vec<ShamirShareJson>,
    pub commitments: Vec<String>, // SHA-256 hex
}

/// Shamir split: split a hex-encoded secret into N shares with threshold K.
/// Returns Vec of {x, y_hex} share objects and Vec of SHA-256 commitment hex strings.
#[tauri::command]
pub fn shamir_split(
    secret_hex: String,
    total: u8,
    threshold: u8,
) -> Result<ShamirSplitResult, String> {
    if threshold < 2 || threshold > 5 {
        return Err("Threshold must be 2-5".into());
    }
    if total < 3 || total > 5 {
        return Err("Total must be 3-5".into());
    }
    if threshold > total {
        return Err("Threshold cannot exceed total".into());
    }

    let secret = hex::decode(&secret_hex).map_err(|e| e.to_string())?;
    let secret_len = secret.len();

    // Random polynomial coefficients for each byte (degree = threshold - 1)
    // coefficients[i] are the non-constant-term coefficients for the i-th degree
    let mut coefficients: Vec<Vec<u8>> = Vec::new();
    for _ in 0..threshold - 1 {
        let mut coeff = vec![0u8; secret_len];
        rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut coeff);
        coefficients.push(coeff);
    }

    let mut shares = Vec::new();
    for i in 1..=total {
        let mut y = vec![0u8; secret_len];
        for byte_idx in 0..secret_len {
            let mut val = secret[byte_idx];
            let mut x_pow = i;
            for coeff in &coefficients {
                val ^= gf256_mul(coeff[byte_idx], x_pow);
                x_pow = gf256_mul(x_pow, i);
            }
            y[byte_idx] = val;
        }
        shares.push(ShamirShareJson { x: i, y: hex::encode(&y) });
    }

    // SHA-256 commitments: hash(x || y)
    use sha2::Digest;
    let commitments: Vec<String> = shares.iter().map(|s| {
        let y_bytes = hex::decode(&s.y).unwrap_or_default();
        let mut hasher = sha2::Sha256::new();
        hasher.update([s.x]);
        hasher.update(&y_bytes);
        hex::encode(hasher.finalize())
    }).collect();

    Ok(ShamirSplitResult { shares, commitments })
}

/// Shamir combine: reconstruct the secret from >= threshold shares.
#[tauri::command]
pub fn shamir_combine(shares_json: String) -> Result<String, String> {
    let share_objs: Vec<ShamirShareJson> =
        serde_json::from_str(&shares_json).map_err(|e| e.to_string())?;
    if share_objs.len() < 2 {
        return Err("Need at least 2 shares".into());
    }

    let shares: Vec<(u8, Vec<u8>)> = share_objs.iter().map(|s| {
        let y = hex::decode(&s.y).unwrap_or_default();
        (s.x, y)
    }).collect();

    let secret_len = shares[0].1.len();
    let mut result = vec![0u8; secret_len];

    for byte_idx in 0..secret_len {
        let mut val: u8 = 0;
        for i in 0..shares.len() {
            let yi = shares[i].1[byte_idx];
            let xi = shares[i].0;
            let mut lagrange: u8 = 1;
            for j in 0..shares.len() {
                if i == j {
                    continue;
                }
                let xj = shares[j].0;
                let num = xj;
                let den = xi ^ xj;
                if den == 0 {
                    return Err("Duplicate share x values".into());
                }
                lagrange = gf256_mul(lagrange, gf256_mul(num, gf256_inv(den)));
            }
            val ^= gf256_mul(yi, lagrange);
        }
        result[byte_idx] = val;
    }

    Ok(hex::encode(result))
}

/// Shamir commit: compute SHA-256 commitment for a share.
#[tauri::command]
pub fn shamir_commit(x: u8, y_hex: String) -> Result<String, String> {
    use sha2::Digest;
    let y = hex::decode(&y_hex).map_err(|e| e.to_string())?;
    let mut hasher = sha2::Sha256::new();
    hasher.update([x]);
    hasher.update(&y);
    Ok(hex::encode(hasher.finalize()))
}

/// Shamir verify: check a share against its SHA-256 commitment.
#[tauri::command]
pub fn shamir_verify(x: u8, y_hex: String, commitment_hex: String) -> Result<bool, String> {
    let computed = shamir_commit(x, y_hex)?;
    Ok(computed == commitment_hex)
}

/// Generate an X25519 recovery group keypair. Returns {publicKeyHex, privateKeyHex}.
/// The caller MUST split the private key with shamir_split and zeroize it immediately.
#[tauri::command]
pub fn recovery_group_generate_keypair() -> Result<serde_json::Value, String> {
    use x25519_dalek::{PublicKey, StaticSecret};
    let secret = StaticSecret::random_from_rng(rand::rngs::OsRng);
    let public = PublicKey::from(&secret);
    Ok(serde_json::json!({
        "publicKeyHex": hex::encode(public.as_bytes()),
        "privateKeyHex": hex::encode(secret.as_bytes()),
    }))
}

/// Decrypt a server-published relay event using the epoch-keyed server event key.
/// Input: hex-encoded nonce(12) + ciphertext + epoch number.
/// AAD: "{LABEL_HUB_EVENT_EPOCH}:{epoch}" for domain separation.
/// Returns the decrypted plaintext string.
#[tauri::command]
pub fn decrypt_server_event(
    state: tauri::State<'_, CryptoState>,
    ciphertext_hex: String,
    epoch: u64,
) -> Result<String, String> {
    let keys = state.server_event_keys.lock().unwrap();
    let key = keys.iter()
        .find(|(e, _)| *e == epoch)
        .map(|(_, k)| k)
        .ok_or_else(|| format!("No server event key for epoch {epoch}"))?;

    let data = hex::decode(&ciphertext_hex).map_err(err_str)?;
    if data.len() < 28 {
        return Err("Ciphertext too short (need at least 12-byte nonce + 16-byte tag)".into());
    }

    let aad = format!("{}:{}", llamenos_core::LABEL_HUB_EVENT, epoch);
    let nonce = Nonce::from_slice(&data[..12]);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid server event key: {e}"))?;
    let plaintext = cipher.decrypt(nonce, Payload {
        msg: &data[12..],
        aad: aad.as_bytes(),
    })
        .map_err(|_| "Server event decryption failed (wrong key or corrupted data)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in decrypted content: {e}"))
}
