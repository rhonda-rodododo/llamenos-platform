//! Tauri command wrappers around llamenos-core crypto operations.
//!
//! Two categories of commands:
//!
//! 1. **Stateless commands** — secret key passed as argument (kept for isolation
//!    script compatibility and cross-platform testing).
//! 2. **Stateful commands** — use `CryptoState` which holds the nsec exclusively
//!    in the Rust process. The webview never receives the nsec hex string.
//!
//! On desktop, the webview calls stateful commands via `platform.ts`.
//! The nsec is decrypted once (unlock_with_pin), stored in CryptoState, and
//! zeroized on lock/quit/sleep.

use std::sync::Mutex;

use zeroize::Zeroize;

use llamenos_core::{auth, ecies, encryption, keys};

// Re-export types for serde bridging with the frontend
pub use llamenos_core::ecies::{KeyEnvelope, RecipientKeyEnvelope};
pub use llamenos_core::encryption::{EncryptedKeyData, EncryptedMessage, EncryptedNote};
pub use llamenos_core::keys::KeyPair;

fn err_str(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ── CryptoState — secret key lives ONLY here, never in the webview ──

/// Holds the decrypted secret key in Rust memory. Zeroized on lock/quit.
pub struct CryptoState {
    /// The nsec hex string, or None if locked.
    secret_key: Mutex<Option<String>>,
    /// The corresponding x-only public key hex.
    public_key: Mutex<Option<String>>,
}

impl CryptoState {
    pub fn new() -> Self {
        Self {
            secret_key: Mutex::new(None),
            public_key: Mutex::new(None),
        }
    }

    /// Zeroize the secret key and lock.
    pub fn lock(&self) {
        let mut sk = self.secret_key.lock().unwrap();
        if let Some(ref mut key) = *sk {
            key.zeroize();
        }
        *sk = None;
        *self.public_key.lock().unwrap() = None;
    }

    fn get_secret_key(&self) -> Result<String, String> {
        self.secret_key
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "Key is locked. Enter PIN to unlock.".into())
    }

    fn get_public_key(&self) -> Result<String, String> {
        self.public_key
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "Key is locked. Enter PIN to unlock.".into())
    }
}

// ── Stateful commands (nsec stays in Rust) ───────────────────────────

/// Decrypt the nsec from PIN-encrypted storage, store in CryptoState.
/// Returns only the public key — nsec never leaves the Rust process.
#[tauri::command]
pub fn unlock_with_pin(
    state: tauri::State<'_, CryptoState>,
    data: EncryptedKeyData,
    pin: String,
) -> Result<String, String> {
    let nsec = encryption::decrypt_with_pin(&data, &pin).map_err(err_str)?;

    // Derive pubkey from the nsec (bech32) — need to extract the raw hex
    // llamenos-core's decrypt_with_pin returns the bech32 nsec string.
    // We need to convert to hex to call get_public_key.
    let sk_hex = nsec_to_hex(&nsec)?;
    let pubkey = keys::get_public_key(&sk_hex).map_err(err_str)?;

    *state.secret_key.lock().unwrap() = Some(sk_hex);
    *state.public_key.lock().unwrap() = Some(pubkey.clone());

    Ok(pubkey)
}

/// Import a key: encrypt with PIN, store encrypted data, and load into CryptoState.
/// Returns the public key.
#[tauri::command]
pub fn import_key_to_state(
    state: tauri::State<'_, CryptoState>,
    nsec: String,
    pin: String,
    pubkey_hex: String,
) -> Result<EncryptedKeyData, String> {
    let encrypted = encryption::encrypt_with_pin(&nsec, &pin, &pubkey_hex).map_err(err_str)?;

    let sk_hex = nsec_to_hex(&nsec)?;
    *state.secret_key.lock().unwrap() = Some(sk_hex);
    *state.public_key.lock().unwrap() = Some(pubkey_hex);

    Ok(encrypted)
}

/// Lock the crypto state — zeros the secret key.
#[tauri::command]
pub fn lock_crypto(state: tauri::State<'_, CryptoState>) {
    state.lock();
}

/// Check if the crypto state is unlocked.
#[tauri::command]
pub fn is_crypto_unlocked(state: tauri::State<'_, CryptoState>) -> bool {
    state.secret_key.lock().unwrap().is_some()
}

/// Get the public key from CryptoState (no secret key exposure).
#[tauri::command]
pub fn get_public_key_from_state(state: tauri::State<'_, CryptoState>) -> Result<String, String> {
    state.get_public_key()
}

/// Create an auth token using the key in CryptoState.
#[tauri::command]
pub fn create_auth_token_from_state(
    state: tauri::State<'_, CryptoState>,
    timestamp: u64,
    method: String,
    path: String,
) -> Result<String, String> {
    let sk_hex = state.get_secret_key()?;
    let token =
        auth::create_auth_token(&sk_hex, timestamp, &method, &path).map_err(err_str)?;
    serde_json::to_string(&token).map_err(err_str)
}

/// ECIES unwrap using the key in CryptoState.
#[tauri::command]
pub fn ecies_unwrap_key_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: KeyEnvelope,
    label: String,
) -> Result<String, String> {
    let sk_hex = state.get_secret_key()?;
    let key = ecies::ecies_unwrap_key(&envelope, &sk_hex, &label).map_err(err_str)?;
    Ok(hex::encode(key))
}

/// Decrypt a note using the key in CryptoState.
#[tauri::command]
pub fn decrypt_note_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content: String,
    envelope: KeyEnvelope,
) -> Result<String, String> {
    let sk_hex = state.get_secret_key()?;
    encryption::decrypt_note(&encrypted_content, &envelope, &sk_hex).map_err(err_str)
}

/// Decrypt a message using the key in CryptoState.
#[tauri::command]
pub fn decrypt_message_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content: String,
    reader_envelopes: Vec<RecipientKeyEnvelope>,
) -> Result<String, String> {
    let sk_hex = state.get_secret_key()?;
    let pk_hex = state.get_public_key()?;
    encryption::decrypt_message(&encrypted_content, &reader_envelopes, &sk_hex, &pk_hex)
        .map_err(err_str)
}

// ── Stateless commands (original, kept for compatibility) ────────────

#[tauri::command]
pub fn ecies_wrap_key(
    key_hex: String,
    recipient_pubkey: String,
    label: String,
) -> Result<KeyEnvelope, String> {
    let key_bytes = hex::decode(&key_hex).map_err(|e| err_str(e))?;
    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    ecies::ecies_wrap_key(&key, &recipient_pubkey, &label).map_err(err_str)
}

#[tauri::command]
pub fn ecies_unwrap_key(
    envelope: KeyEnvelope,
    secret_key_hex: String,
    label: String,
) -> Result<String, String> {
    let key = ecies::ecies_unwrap_key(&envelope, &secret_key_hex, &label).map_err(err_str)?;
    Ok(hex::encode(key))
}

#[tauri::command]
pub fn encrypt_note(
    payload_json: String,
    author_pubkey: String,
    admin_pubkeys: Vec<String>,
) -> Result<EncryptedNote, String> {
    encryption::encrypt_note(&payload_json, &author_pubkey, &admin_pubkeys).map_err(err_str)
}

#[tauri::command]
pub fn decrypt_note(
    encrypted_content: String,
    envelope: KeyEnvelope,
    secret_key_hex: String,
) -> Result<String, String> {
    encryption::decrypt_note(&encrypted_content, &envelope, &secret_key_hex).map_err(err_str)
}

#[tauri::command]
pub fn encrypt_message(
    plaintext: String,
    reader_pubkeys: Vec<String>,
) -> Result<EncryptedMessage, String> {
    encryption::encrypt_message(&plaintext, &reader_pubkeys).map_err(err_str)
}

#[tauri::command]
pub fn decrypt_message(
    encrypted_content: String,
    reader_envelopes: Vec<RecipientKeyEnvelope>,
    secret_key_hex: String,
    reader_pubkey: String,
) -> Result<String, String> {
    encryption::decrypt_message(
        &encrypted_content,
        &reader_envelopes,
        &secret_key_hex,
        &reader_pubkey,
    )
    .map_err(err_str)
}

#[tauri::command]
pub fn create_auth_token(
    secret_key_hex: String,
    timestamp: u64,
    method: String,
    path: String,
) -> Result<String, String> {
    let token = auth::create_auth_token(&secret_key_hex, timestamp, &method, &path)
        .map_err(err_str)?;
    serde_json::to_string(&token).map_err(err_str)
}

#[tauri::command]
pub fn encrypt_with_pin(
    nsec: String,
    pin: String,
    pubkey_hex: String,
) -> Result<EncryptedKeyData, String> {
    encryption::encrypt_with_pin(&nsec, &pin, &pubkey_hex).map_err(err_str)
}

#[tauri::command]
pub fn decrypt_with_pin(data: EncryptedKeyData, pin: String) -> Result<String, String> {
    encryption::decrypt_with_pin(&data, &pin).map_err(err_str)
}

#[tauri::command]
pub fn generate_keypair() -> Result<KeyPair, String> {
    Ok(keys::generate_keypair())
}

#[tauri::command]
pub fn get_public_key(secret_key_hex: String) -> Result<String, String> {
    keys::get_public_key(&secret_key_hex).map_err(err_str)
}

#[tauri::command]
pub fn verify_schnorr(
    message_hex: String,
    signature_hex: String,
    pubkey_hex: String,
) -> Result<bool, String> {
    auth::verify_schnorr(&message_hex, &signature_hex, &pubkey_hex).map_err(err_str)
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Convert a bech32 nsec to hex secret key.
fn nsec_to_hex(nsec: &str) -> Result<String, String> {
    // nsec1... is bech32-encoded. Extract the raw 32 bytes.
    if nsec.starts_with("nsec1") {
        // Use bech32 decoding: nsec1 prefix = "nsec" HRP
        let (_, data) = bech32::decode(nsec).map_err(|e| format!("Invalid nsec: {e}"))?;
        Ok(hex::encode(data))
    } else {
        // Assume it's already hex
        Ok(nsec.to_string())
    }
}
