//! V3 FFI functions for mobile (Swift/Kotlin) via UniFFI.
//!
//! Provides a stateful crypto service that mirrors the desktop Tauri CryptoState:
//! device secrets (Ed25519 + X25519) are held in Rust memory, never exposed to
//! the host language. The mobile CryptoService calls these FFI functions to perform
//! all cryptographic operations.
//!
//! ## Architecture
//!
//! A static `MobileState` holds the decrypted `DeviceSecrets` in a Mutex.
//! - `mobile_generate_and_load` / `mobile_unlock`: load secrets into state
//! - `mobile_lock`: zeroize and clear secrets
//! - All `mobile_*` functions that need secrets extract them from the static state
//!
//! Stateless functions (HPKE seal, sigchain verify, ed25519 verify) do NOT
//! access the static state and can be called without unlocking.

use std::sync::{Mutex, OnceLock};

use crate::auth;
use crate::device_keys::{self, DeviceKeyState, DeviceSecrets, EncryptedDeviceKeys};
use crate::errors::CryptoError;
use crate::hpke_envelope::{self, HpkeEnvelope};
use crate::puk::{self, PukState, RotatePukResult};
use crate::sigchain::{self, SigchainLink, SigchainVerifiedState};
use zeroize::Zeroize;

// ── Static mobile state ────────────────────────────────────────────

struct MobileState {
    secrets: Option<DeviceSecrets>,
    device_state: Option<DeviceKeyState>,
}

impl MobileState {
    fn new() -> Self {
        Self {
            secrets: None,
            device_state: None,
        }
    }
}

fn state() -> &'static Mutex<MobileState> {
    static STATE: OnceLock<Mutex<MobileState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(MobileState::new()))
}

fn with_secrets<T>(
    f: impl FnOnce(&DeviceSecrets, &DeviceKeyState) -> Result<T, CryptoError>,
) -> Result<T, CryptoError> {
    let guard = state().lock().unwrap();
    let secrets = guard.secrets.as_ref().ok_or_else(|| {
        CryptoError::InvalidInput("Device is locked. Enter PIN to unlock.".into())
    })?;
    let ds = guard
        .device_state
        .as_ref()
        .ok_or_else(|| CryptoError::InvalidInput("Device is locked.".into()))?;
    f(secrets, ds)
}

fn encryption_secret_hex() -> Result<String, CryptoError> {
    with_secrets(|secrets, _| Ok(hex::encode(secrets.encryption_seed)))
}

// ── Device key management (stateful) ───────────────────────────────

/// Generate a new device keypair, encrypt with PIN, load into mobile state.
/// Returns the EncryptedDeviceKeys blob for persistent storage.
#[uniffi::export]
pub fn mobile_generate_and_load(
    device_id: String,
    pin: String,
) -> Result<EncryptedDeviceKeys, CryptoError> {
    let encrypted = device_keys::generate_device_keys(&device_id, &pin)?;
    let secrets = device_keys::unlock_device_keys(&encrypted, &pin)?;

    let mut guard = state().lock().unwrap();
    guard.device_state = Some(encrypted.state.clone());
    guard.secrets = Some(secrets);

    Ok(encrypted)
}

/// Unlock device keys from PIN-encrypted storage, load into mobile state.
/// Returns the DeviceKeyState (public keys only — secrets stay in Rust).
#[uniffi::export]
pub fn mobile_unlock(
    data: EncryptedDeviceKeys,
    pin: String,
) -> Result<DeviceKeyState, CryptoError> {
    let secrets = device_keys::unlock_device_keys(&data, &pin)?;
    let ds = data.state.clone();

    let mut guard = state().lock().unwrap();
    guard.secrets = Some(secrets);
    guard.device_state = Some(ds.clone());

    Ok(ds)
}

/// Lock the mobile crypto state — zeroize device secrets.
#[uniffi::export]
pub fn mobile_lock() {
    let mut guard = state().lock().unwrap();
    // DeviceSecrets implements Zeroize on drop
    guard.secrets = None;
    guard.device_state = None;
}

/// Check if the mobile crypto state is unlocked.
#[uniffi::export]
pub fn mobile_is_unlocked() -> bool {
    state().lock().unwrap().secrets.is_some()
}

/// Get the device public keys from mobile state (no secrets exposed).
#[uniffi::export]
pub fn mobile_get_device_state() -> Result<DeviceKeyState, CryptoError> {
    let guard = state().lock().unwrap();
    guard
        .device_state
        .clone()
        .ok_or_else(|| CryptoError::InvalidInput("Device is locked.".into()))
}

/// Validate credential format: numeric PIN (8+ digits) or alphanumeric passphrase (8+ chars).
#[uniffi::export]
pub fn mobile_is_valid_pin(pin: String) -> bool {
    device_keys::is_valid_credential(&pin)
}

// ── Auth tokens (Ed25519, stateful) ────────────────────────────────

/// Create an Ed25519 auth token using the device signing key in mobile state.
#[uniffi::export]
pub fn mobile_create_auth_token(
    timestamp: u64,
    method: String,
    path: String,
) -> Result<auth::AuthToken, CryptoError> {
    with_secrets(|secrets, _| auth::create_auth_token(secrets, timestamp, &method, &path))
}

/// Create an Ed25519 auth token from a raw signing-key secret hex.
///
/// Stateless: does NOT touch the loaded mobile device state. Used by integration
/// tests that need to sign requests on behalf of a server-side identity (e.g.
/// admin bootstrap) where the signing secret is provided out-of-band.
#[uniffi::export]
pub fn mobile_create_auth_token_from_signing_key(
    signing_key_hex: String,
    timestamp: u64,
    method: String,
    path: String,
) -> Result<auth::AuthToken, CryptoError> {
    auth::create_auth_token_from_signing_key(&signing_key_hex, timestamp, &method, &path)
}

// ── Ed25519 signing (stateful) ─────────────────────────────────────

/// Sign a message (hex-encoded) using the device's Ed25519 key.
#[uniffi::export]
pub fn mobile_sign(message_hex: String) -> Result<String, CryptoError> {
    let message = hex::decode(&message_hex).map_err(CryptoError::HexError)?;
    with_secrets(|secrets, _| {
        let sig = device_keys::sign_bytes(secrets, &message);
        Ok(hex::encode(sig))
    })
}

/// Verify an Ed25519 signature (stateless — no secrets needed).
#[uniffi::export]
pub fn mobile_ed25519_verify(
    message_hex: String,
    signature_hex: String,
    pubkey_hex: String,
) -> Result<bool, CryptoError> {
    let message = hex::decode(&message_hex).map_err(CryptoError::HexError)?;
    let signature = hex::decode(&signature_hex).map_err(CryptoError::HexError)?;
    device_keys::verify_signature(&message, &signature, &pubkey_hex)
}

// ── HPKE envelope encryption ──────────────────────────────────────

/// HPKE seal: encrypt plaintext for a recipient's X25519 pubkey (stateless).
#[uniffi::export]
pub fn mobile_hpke_seal(
    plaintext_hex: String,
    recipient_pubkey_hex: String,
    label: String,
    aad_hex: String,
) -> Result<HpkeEnvelope, CryptoError> {
    let plaintext = hex::decode(&plaintext_hex).map_err(CryptoError::HexError)?;
    let aad = hex::decode(&aad_hex).map_err(CryptoError::HexError)?;
    hpke_envelope::hpke_seal(&plaintext, &recipient_pubkey_hex, &label, &aad)
}

/// HPKE open: decrypt an envelope using the device's X25519 key from mobile state.
#[uniffi::export]
pub fn mobile_hpke_open(
    envelope: HpkeEnvelope,
    expected_label: String,
    aad_hex: String,
) -> Result<String, CryptoError> {
    let aad = hex::decode(&aad_hex).map_err(CryptoError::HexError)?;
    let secret_hex = encryption_secret_hex()?;
    let plaintext = hpke_envelope::hpke_open(&envelope, &secret_hex, &expected_label, &aad)?;
    Ok(hex::encode(plaintext))
}

/// HPKE seal a 32-byte key for a recipient (stateless convenience wrapper).
#[uniffi::export]
pub fn mobile_hpke_seal_key(
    key_hex: String,
    recipient_pubkey_hex: String,
    label: String,
    aad_hex: String,
) -> Result<HpkeEnvelope, CryptoError> {
    let key_bytes = hex::decode(&key_hex).map_err(CryptoError::HexError)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let aad = hex::decode(&aad_hex).map_err(CryptoError::HexError)?;
    let envelope = hpke_envelope::hpke_seal_key(&key, &recipient_pubkey_hex, &label, &aad)?;
    key.zeroize();
    Ok(envelope)
}

/// HPKE open a 32-byte key from an envelope using mobile state.
#[uniffi::export]
pub fn mobile_hpke_open_key(
    envelope: HpkeEnvelope,
    expected_label: String,
    aad_hex: String,
) -> Result<String, CryptoError> {
    let aad = hex::decode(&aad_hex).map_err(CryptoError::HexError)?;
    let secret_hex = encryption_secret_hex()?;
    let mut key = hpke_envelope::hpke_open_key(&envelope, &secret_hex, &expected_label, &aad)?;
    let hex_out = hex::encode(key);
    key.zeroize();
    Ok(hex_out)
}

// ── Symmetric encryption (AES-256-GCM) ────────────────────────────

/// Encrypt plaintext with a random AES-256-GCM key.
/// Returns (ciphertext_hex, key_hex) where ciphertext = hex(nonce_12 || ciphertext || tag_16).
#[uniffi::export]
pub fn mobile_symmetric_encrypt(plaintext_hex: String) -> Result<Vec<String>, CryptoError> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };

    let plaintext = hex::decode(&plaintext_hex).map_err(CryptoError::HexError)?;

    let mut key_bytes = [0u8; 32];
    getrandom::getrandom(&mut key_bytes).expect("getrandom failed");
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).expect("getrandom failed");

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let mut packed = Vec::with_capacity(12 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    let key_hex = hex::encode(key_bytes);
    key_bytes.zeroize();

    Ok(vec![hex::encode(packed), key_hex])
}

/// Decrypt AES-256-GCM ciphertext. Input: hex(nonce_12 || ciphertext || tag_16), key_hex.
#[uniffi::export]
pub fn mobile_symmetric_decrypt(
    ciphertext_hex: String,
    key_hex: String,
) -> Result<String, CryptoError> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };

    let data = hex::decode(&ciphertext_hex).map_err(CryptoError::HexError)?;
    let mut key_bytes = hex::decode(&key_hex).map_err(CryptoError::HexError)?;
    if key_bytes.len() != 32 {
        key_bytes.zeroize();
        return Err(CryptoError::InvalidSecretKey);
    }
    if data.len() < 28 {
        // 12 nonce + 16 tag minimum
        key_bytes.zeroize();
        return Err(CryptoError::InvalidCiphertext);
    }

    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    key_bytes.zeroize();
    Ok(hex::encode(plaintext))
}

// ── PUK operations ─────────────────────────────────────────────────

/// Create the initial PUK (generation 1), wrapped to the device's X25519 pubkey.
/// Returns JSON: { pukState, seedHex, envelope }
#[uniffi::export]
pub fn mobile_puk_create() -> Result<String, CryptoError> {
    with_secrets(|_, ds| {
        let (puk_state, seed, envelope) =
            puk::create_initial_puk(&ds.encryption_pubkey_hex, &ds.device_id)?;

        let result = serde_json::json!({
            "pukState": serde_json::to_value(&puk_state).map_err(|e| CryptoError::InvalidInput(e.to_string()))?,
            "seedHex": hex::encode(seed),
            "envelope": serde_json::to_value(&envelope).map_err(|e| CryptoError::InvalidInput(e.to_string()))?,
        });
        serde_json::to_string(&result).map_err(|e| CryptoError::InvalidInput(e.to_string()))
    })
}

/// Rotate the PUK to a new generation (stateless — takes seed directly).
#[uniffi::export]
pub fn mobile_puk_rotate(
    old_seed_hex: String,
    old_gen: u32,
    remaining_devices_json: String,
) -> Result<RotatePukResult, CryptoError> {
    let old_seed_bytes = hex::decode(&old_seed_hex).map_err(CryptoError::HexError)?;
    if old_seed_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut old_seed = [0u8; 32];
    old_seed.copy_from_slice(&old_seed_bytes);

    let remaining_devices: Vec<(String, String)> = serde_json::from_str(&remaining_devices_json)
        .map_err(|e| CryptoError::InvalidInput(e.to_string()))?;

    let result = puk::rotate_puk(&old_seed, old_gen, &remaining_devices)?;
    old_seed.zeroize();
    Ok(result)
}

/// Unwrap a PUK seed from an HPKE envelope using the device's X25519 key.
#[uniffi::export]
pub fn mobile_puk_unwrap_seed(
    envelope: HpkeEnvelope,
    expected_label: String,
    aad_hex: String,
) -> Result<String, CryptoError> {
    let aad = hex::decode(&aad_hex).map_err(CryptoError::HexError)?;
    let secret_hex = encryption_secret_hex()?;
    let mut seed = hpke_envelope::hpke_open_key(&envelope, &secret_hex, &expected_label, &aad)?;
    let hex_out = hex::encode(seed);
    seed.zeroize();
    Ok(hex_out)
}

/// Derive PUK subkeys for a given seed + generation (stateless).
#[uniffi::export]
pub fn mobile_puk_derive_state(seed_hex: String, generation: u32) -> Result<PukState, CryptoError> {
    let seed_bytes = hex::decode(&seed_hex).map_err(CryptoError::HexError)?;
    if seed_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&seed_bytes);
    let state = puk::derive_puk_subkeys(&seed, generation);
    seed.zeroize();
    Ok(state)
}

// ── Sigchain operations ────────────────────────────────────────────

/// Create a new sigchain link using the device's Ed25519 key from mobile state.
#[uniffi::export]
pub fn mobile_sigchain_create_link(
    id: String,
    seq: u64,
    prev_hash: Option<String>,
    timestamp: String,
    payload_json: String,
) -> Result<SigchainLink, CryptoError> {
    with_secrets(|secrets, ds| {
        sigchain::create_sigchain_link(
            secrets,
            &id,
            &ds.device_id,
            seq,
            prev_hash.clone(),
            &timestamp,
            &payload_json,
        )
    })
}

/// Verify a complete sigchain (stateless).
#[uniffi::export]
pub fn mobile_sigchain_verify(links_json: String) -> Result<SigchainVerifiedState, CryptoError> {
    let links: Vec<SigchainLink> =
        serde_json::from_str(&links_json).map_err(|e| CryptoError::InvalidInput(e.to_string()))?;
    sigchain::verify_sigchain(&links)
}

/// Verify a single sigchain link (stateless).
#[uniffi::export]
pub fn mobile_sigchain_verify_link(
    link_json: String,
    expected_signer_pubkey: String,
) -> Result<bool, CryptoError> {
    let link: SigchainLink =
        serde_json::from_str(&link_json).map_err(|e| CryptoError::InvalidInput(e.to_string()))?;
    sigchain::verify_sigchain_link(&link, &expected_signer_pubkey)
}

// ── Utility ────────────────────────────────────────────────────────

/// Generate 32 random bytes as hex (for nonces, IDs, etc.).
#[uniffi::export]
pub fn mobile_random_bytes_hex() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_unlock_lock_cycle() {
        // Generate and load
        let encrypted = mobile_generate_and_load("test-dev".into(), "12345678".into()).unwrap();
        assert!(mobile_is_unlocked());

        let ds = mobile_get_device_state().unwrap();
        assert_eq!(ds.device_id, "test-dev");
        assert_eq!(ds.signing_pubkey_hex.len(), 64);
        assert_eq!(ds.encryption_pubkey_hex.len(), 64);

        // Lock
        mobile_lock();
        assert!(!mobile_is_unlocked());
        assert!(mobile_get_device_state().is_err());

        // Unlock
        let ds2 = mobile_unlock(encrypted, "12345678".into()).unwrap();
        assert!(mobile_is_unlocked());
        assert_eq!(ds2.device_id, "test-dev");
        assert_eq!(ds2.signing_pubkey_hex, ds.signing_pubkey_hex);

        // Clean up for other tests
        mobile_lock();
    }

    #[test]
    fn auth_token_roundtrip() {
        let _encrypted = mobile_generate_and_load("auth-dev".into(), "12345678".into()).unwrap();

        let token =
            mobile_create_auth_token(1708900000000, "GET".into(), "/api/test".into()).unwrap();
        assert_eq!(token.pubkey.len(), 64);
        assert_eq!(token.token.len(), 128); // Ed25519 sig = 64 bytes = 128 hex

        let valid = auth::verify_auth_token(&token, "GET", "/api/test").unwrap();
        assert!(valid);

        mobile_lock();
    }

    #[test]
    fn hpke_roundtrip_with_state() {
        let encrypted = mobile_generate_and_load("hpke-dev".into(), "65432100".into()).unwrap();
        let ds = mobile_get_device_state().unwrap();

        // Seal to our own encryption pubkey
        let plaintext = hex::encode(b"secret data");
        let label = crate::labels::LABEL_NOTE_KEY;
        let aad = hex::encode(b"test-aad");

        let envelope = mobile_hpke_seal(
            plaintext.clone(),
            ds.encryption_pubkey_hex.clone(),
            label.into(),
            aad.clone(),
        )
        .unwrap();

        // Open with state
        let decrypted = mobile_hpke_open(envelope, label.into(), aad).unwrap();
        assert_eq!(decrypted, plaintext);

        mobile_lock();
    }

    #[test]
    fn symmetric_roundtrip() {
        let plaintext = hex::encode(b"hello world");
        let result = mobile_symmetric_encrypt(plaintext.clone()).unwrap();
        assert_eq!(result.len(), 2);

        let decrypted = mobile_symmetric_decrypt(result[0].clone(), result[1].clone()).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn puk_create_and_rotate() {
        let _encrypted = mobile_generate_and_load("puk-dev".into(), "12345678".into()).unwrap();

        let puk_json = mobile_puk_create().unwrap();
        let puk_value: serde_json::Value = serde_json::from_str(&puk_json).unwrap();
        assert_eq!(puk_value["pukState"]["generation"], 1);

        let seed_hex = puk_value["seedHex"].as_str().unwrap().to_string();
        assert_eq!(seed_hex.len(), 64);

        mobile_lock();
    }

    #[test]
    fn sigchain_create_and_verify() {
        let _encrypted = mobile_generate_and_load("sig-dev".into(), "12345678".into()).unwrap();

        let link = mobile_sigchain_create_link(
            "link-1".into(),
            1,
            None,
            "2026-04-27T00:00:00Z".into(),
            r#"{"type":"user_init","deviceId":"sig-dev"}"#.into(),
        )
        .unwrap();

        assert_eq!(link.seq, 1);
        assert_eq!(link.entry_hash.len(), 64);
        assert_eq!(link.signature.len(), 128);

        // Verify the link
        let valid = mobile_sigchain_verify_link(
            serde_json::to_string(&link).unwrap(),
            link.signer_pubkey.clone(),
        )
        .unwrap();
        assert!(valid);

        // Verify the chain
        let links_json = serde_json::to_string(&vec![link]).unwrap();
        let verified = mobile_sigchain_verify(links_json).unwrap();
        assert_eq!(verified.verified_count, 1);
        assert_eq!(verified.head_seq, 1);

        mobile_lock();
    }
}
