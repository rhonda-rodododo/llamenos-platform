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

use llamenos_core::{auth, ecies, encryption, keys, nostr, provisioning};
use tauri_plugin_store::StoreExt;

// Re-export types for serde bridging with the frontend
pub use llamenos_core::ecies::{KeyEnvelope, RecipientKeyEnvelope};
pub use llamenos_core::encryption::{EncryptedKeyData, EncryptedMessage, EncryptedNote};
pub use llamenos_core::keys::KeyPair;

/// Public-key-only keypair result — secret key NEVER leaves Rust.
#[allow(dead_code)] // Kept for potential future use; IPC uses GenerateAndLoadResult
#[derive(serde::Serialize)]
pub struct PublicKeyPair {
    pub public_key: String,
    pub npub: String,
}

/// Result of generate_keypair_and_load — includes encrypted key blob for persistence.
#[derive(serde::Serialize)]
pub struct GenerateAndLoadResult {
    pub public_key: String,
    pub npub: String,
    pub encrypted_key_data: EncryptedKeyData,
}

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
    /// One-time provisioning token — consumed on use, prevents concurrent provisioning races.
    provisioning_token: Mutex<Option<String>>,
    /// PIN attempt counter — stored in Rust memory only (JS cannot tamper via plugin:store|set).
    /// Resets on process restart, which is acceptable: an attacker who can kill the process
    /// loses their XSS execution context anyway.
    pin_failed_attempts: Mutex<u32>,
    /// PIN lockout expiry — epoch millis. Zero means no lockout.
    pin_lockout_until: Mutex<u64>,
}

impl CryptoState {
    pub fn new() -> Self {
        Self {
            secret_key: Mutex::new(None),
            public_key: Mutex::new(None),
            provisioning_token: Mutex::new(None),
            pin_failed_attempts: Mutex::new(0),
            pin_lockout_until: Mutex::new(0),
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
        *self.provisioning_token.lock().unwrap() = None;
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
///
/// PIN attempt tracking is held exclusively in Rust memory (`CryptoState`).
/// This means JS cannot tamper with the counter via `plugin:store|set`
/// (HIGH-D3). The counter resets on process restart, which is acceptable:
/// an attacker who can kill the process loses their XSS execution context.
///
/// Lockout schedule:
///   1-4 failures: no lockout
///   5-6 failures: 30s lockout
///   7-8 failures: 2min lockout
///   9 failures: 10min lockout
///   10+ failures: wipe encrypted keys from store
#[tauri::command]
pub fn unlock_with_pin(
    state: tauri::State<'_, CryptoState>,
    app_handle: tauri::AppHandle,
    data: EncryptedKeyData,
    pin: String,
) -> Result<String, String> {
    // Read PIN counters from tamper-resistant Rust memory (HIGH-D3 fix).
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

    match encryption::decrypt_with_pin(&data, &pin) {
        Ok(nsec) => {
            // Success — reset counters in Rust memory
            *state.pin_failed_attempts.lock().unwrap() = 0;
            *state.pin_lockout_until.lock().unwrap() = 0;

            let sk_hex = nsec_to_hex(&nsec)?;
            let pubkey = keys::get_public_key(&sk_hex).map_err(err_str)?;

            *state.secret_key.lock().unwrap() = Some(sk_hex);
            *state.public_key.lock().unwrap() = Some(pubkey.clone());

            Ok(pubkey)
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
                    // 10+ failures — wipe encrypted keys from Tauri Store and reset counters
                    let store = app_handle
                        .store("keys.json")
                        .map_err(|e: tauri_plugin_store::Error| e.to_string())?;
                    store.delete("llamenos-encrypted-key");
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

/// Decrypt a call record using the key in CryptoState.
#[tauri::command]
pub fn decrypt_call_record_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content: String,
    admin_envelopes: Vec<RecipientKeyEnvelope>,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    let pk = state.get_public_key()?;
    encryption::decrypt_call_record(&encrypted_content, &admin_envelopes, &sk, &pk).map_err(err_str)
}

/// Decrypt a legacy V1 note using the key in CryptoState.
#[tauri::command]
pub fn decrypt_legacy_note_from_state(
    state: tauri::State<'_, CryptoState>,
    packed_hex: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    encryption::decrypt_legacy_note(&packed_hex, &sk).map_err(err_str)
}

/// Decrypt a transcription using ECIES with CryptoState.
#[tauri::command]
pub fn decrypt_transcription_from_state(
    state: tauri::State<'_, CryptoState>,
    packed_hex: String,
    ephemeral_pubkey_hex: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    ecies::ecies_decrypt_content(
        &packed_hex,
        &ephemeral_pubkey_hex,
        &sk,
        llamenos_core::labels::LABEL_TRANSCRIPTION,
    )
    .map_err(err_str)
}

/// Encrypt a draft using the key in CryptoState.
#[tauri::command]
pub fn encrypt_draft_from_state(
    state: tauri::State<'_, CryptoState>,
    plaintext: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    encryption::encrypt_draft(&plaintext, &sk).map_err(err_str)
}

/// Decrypt a draft using the key in CryptoState.
#[tauri::command]
pub fn decrypt_draft_from_state(
    state: tauri::State<'_, CryptoState>,
    packed_hex: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    encryption::decrypt_draft(&packed_hex, &sk).map_err(err_str)
}

/// Encrypt a JSON export using the key in CryptoState. Returns base64.
#[tauri::command]
pub fn encrypt_export_from_state(
    state: tauri::State<'_, CryptoState>,
    json_string: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    encryption::encrypt_export(&json_string, &sk).map_err(err_str)
}

/// Sign a Nostr event using the key in CryptoState.
#[tauri::command]
pub fn sign_nostr_event_from_state(
    state: tauri::State<'_, CryptoState>,
    kind: u32,
    created_at: u64,
    tags: Vec<Vec<String>>,
    content: String,
) -> Result<nostr::SignedNostrEvent, String> {
    let sk = state.get_secret_key()?;
    nostr::finalize_nostr_event(kind, created_at, tags, &content, &sk).map_err(err_str)
}

/// Decrypt ECIES-encrypted file metadata using CryptoState.
#[tauri::command]
pub fn decrypt_file_metadata_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_content_hex: String,
    ephemeral_pubkey_hex: String,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    ecies::ecies_decrypt_content(
        &encrypted_content_hex,
        &ephemeral_pubkey_hex,
        &sk,
        llamenos_core::labels::LABEL_FILE_METADATA,
    )
    .map_err(err_str)
}

/// Unwrap a file key from an ECIES envelope using CryptoState.
#[tauri::command]
pub fn unwrap_file_key_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: KeyEnvelope,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    let key = ecies::ecies_unwrap_key(&envelope, &sk, llamenos_core::labels::LABEL_FILE_KEY)
        .map_err(err_str)?;
    Ok(hex::encode(key))
}

/// Unwrap a hub key from an ECIES envelope using CryptoState.
#[tauri::command]
pub fn unwrap_hub_key_from_state(
    state: tauri::State<'_, CryptoState>,
    envelope: KeyEnvelope,
) -> Result<String, String> {
    let sk = state.get_secret_key()?;
    let key = ecies::ecies_unwrap_key(&envelope, &sk, llamenos_core::labels::LABEL_HUB_KEY_WRAP)
        .map_err(err_str)?;
    Ok(hex::encode(key))
}

/// Rewrap a file key for a new recipient using CryptoState.
/// Unwraps the existing file key with the current user's key, then wraps for the new recipient.
#[tauri::command]
pub fn rewrap_file_key_from_state(
    state: tauri::State<'_, CryptoState>,
    encrypted_file_key_hex: String,
    ephemeral_pubkey_hex: String,
    new_recipient_pubkey_hex: String,
) -> Result<RecipientKeyEnvelope, String> {
    let sk = state.get_secret_key()?;
    // Unwrap with admin key
    let envelope = KeyEnvelope {
        wrapped_key: encrypted_file_key_hex,
        ephemeral_pubkey: ephemeral_pubkey_hex,
    };
    let file_key = ecies::ecies_unwrap_key(&envelope, &sk, llamenos_core::labels::LABEL_FILE_KEY)
        .map_err(err_str)?;
    // Re-wrap for new recipient
    let new_envelope = ecies::ecies_wrap_key(
        &file_key,
        &new_recipient_pubkey_hex,
        llamenos_core::labels::LABEL_FILE_KEY,
    )
    .map_err(err_str)?;
    Ok(RecipientKeyEnvelope {
        pubkey: new_recipient_pubkey_hex,
        wrapped_key: new_envelope.wrapped_key,
        ephemeral_pubkey: new_envelope.ephemeral_pubkey,
    })
}

/// Generate a new keypair, encrypt with PIN, and load into CryptoState atomically.
/// Returns only the public key and encrypted key blob — the secret NEVER leaves Rust.
#[tauri::command]
pub fn generate_keypair_and_load(
    state: tauri::State<'_, CryptoState>,
    pin: String,
) -> Result<GenerateAndLoadResult, String> {
    if !pin.chars().all(|c| c.is_ascii_digit()) || !(6..=8).contains(&pin.len()) {
        return Err("PIN must be 6–8 digits".into());
    }

    let kp = keys::generate_keypair();
    // Dereference Zeroizing<String> to get the inner String
    let sk_hex: String = (*kp.secret_key_hex).clone();
    let npub = kp.npub.clone();
    let pubkey_hex = kp.public_key.clone();

    let encrypted = encryption::encrypt_with_pin(&kp.nsec, &pin, &pubkey_hex).map_err(err_str)?;

    // Drop the full keypair before loading — only store hex fields in CryptoState
    drop(kp);

    *state.secret_key.lock().unwrap() = Some(sk_hex);
    *state.public_key.lock().unwrap() = Some(pubkey_hex.clone());

    Ok(GenerateAndLoadResult {
        public_key: pubkey_hex,
        npub,
        encrypted_key_data: encrypted,
    })
}

/// Derive the x-only public key hex from an nsec. Stateless — does NOT load into CryptoState.
/// Used during sign-in to get pubkey before import_key_to_state.
#[tauri::command]
pub fn pubkey_from_nsec(nsec: String) -> Result<String, String> {
    let sk_hex = nsec_to_hex(&nsec)?;
    keys::get_public_key(&sk_hex).map_err(err_str)
}

/// Generate an encrypted backup blob from the nsec in CryptoState.
/// Performs PIN + recovery key encryption in Rust — nsec NEVER enters JavaScript.
/// Returns a JSON string matching the BackupFile format from backup.ts.
#[tauri::command]
pub fn generate_backup_from_state(
    state: tauri::State<'_, CryptoState>,
    pubkey: String,
    pin: String,
    recovery_key: String,
) -> Result<String, String> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };
    use pbkdf2::pbkdf2_hmac;
    use sha2::{Digest, Sha256};
    use zeroize::Zeroize;

    let sk_hex = state.get_secret_key()?;
    let sk_bytes = hex::decode(&sk_hex).map_err(err_str)?;
    let nsec = bech32::encode::<bech32::Bech32>(bech32::Hrp::parse("nsec").unwrap(), &sk_bytes)
        .map_err(err_str)?;

    // PIN-encrypted block (matches backup.ts createBackup PIN path)
    let pin_block = encryption::encrypt_with_pin(&nsec, &pin, &pubkey).map_err(err_str)?;

    // Recovery-key-encrypted block:
    // Normalize key (strip dashes, uppercase) then PBKDF2-SHA256 — matches JS backup.ts
    let normalized_rk = recovery_key.replace('-', "").to_uppercase();
    // JS backup.ts uses static RECOVERY_SALT label as the PBKDF2 salt (not per-backup random salt)
    const RECOVERY_PBKDF2_SALT: &[u8] = b"llamenos:recovery";
    const RK_ITERATIONS: u32 = 600_000;

    let mut rk_nonce_bytes = [0u8; 24];
    getrandom::getrandom(&mut rk_nonce_bytes).map_err(err_str)?;

    let mut rk_kek = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        normalized_rk.as_bytes(),
        RECOVERY_PBKDF2_SALT,
        RK_ITERATIONS,
        &mut rk_kek,
    );

    let rk_nonce = XNonce::from_slice(&rk_nonce_bytes);
    let rk_cipher = XChaCha20Poly1305::new_from_slice(&rk_kek)
        .map_err(|e| e.to_string())?;
    let rk_ciphertext = rk_cipher
        .encrypt(rk_nonce, nsec.as_bytes())
        .map_err(|e| e.to_string())?;
    rk_kek.zeroize();

    // Truncated SHA-256(pubkey) — first 6 hex chars (matches backup.ts)
    let pubkey_bytes = hex::decode(&pubkey).unwrap_or_default();
    let hash = Sha256::digest(&pubkey_bytes);
    let id = hex::encode(&hash[..3]);

    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(err_str)?
        .as_secs();
    let t_rounded = (t / 3600) * 3600;

    let backup = serde_json::json!({
        "v": 1,
        "id": id,
        "t": t_rounded,
        "d": {
            "s": pin_block.salt,
            "i": pin_block.iterations,
            "n": pin_block.nonce,
            "c": pin_block.ciphertext,
        },
        "r": {
            // JS backup.ts uses static salt for recovery key PBKDF2; we encode it for compat.
            // The "s" field is not actually used during decryption (static salt is known).
            "s": hex::encode(RECOVERY_PBKDF2_SALT),
            "i": RK_ITERATIONS,
            "n": hex::encode(rk_nonce_bytes),
            "c": hex::encode(rk_ciphertext),
        },
    });

    serde_json::to_string(&backup).map_err(err_str)
}

/// Generate an ephemeral keypair for admin-initiated user creation.
/// Returns the nsec ONE TIME for display — NOT loaded into CryptoState.
#[tauri::command]
pub fn generate_ephemeral_keypair() -> Result<serde_json::Value, String> {
    let kp = keys::generate_keypair();
    let pk_bytes = hex::decode(&kp.public_key).map_err(err_str)?;
    let npub = bech32::encode::<bech32::Bech32>(
        bech32::Hrp::parse("npub").unwrap(),
        &pk_bytes,
    )
    .map_err(err_str)?;
    Ok(serde_json::json!({
        "publicKey": kp.public_key,
        "npub": npub,
        "nsec": kp.nsec,
    }))
}

/// Request a one-time provisioning token. Deregistered from IPC — kept for unit tests only.
///
/// Returns a random 32-char hex token stored in CryptoState. Each call replaces
/// any existing token — only the latest token is valid.
#[allow(dead_code)] // Deregistered from IPC — kept for unit tests
pub fn request_provisioning_token(
    state: tauri::State<'_, CryptoState>,
) -> Result<String, String> {
    let bytes: [u8; 16] = rand::random();
    let token = hex::encode(bytes);
    *state.provisioning_token.lock().unwrap() = Some(token.clone());
    Ok(token)
}

/// Get the nsec from CryptoState. Deregistered from IPC — nsec must never leave Rust process.
///
/// Requires a one-time provisioning token (from `request_provisioning_token`).
/// The token is consumed on use — calling again without a new token will fail.
/// This prevents concurrent provisioning races and limits nsec exposure.
#[allow(dead_code)] // Deregistered from IPC — nsec must never leave Rust process
pub fn get_nsec_from_state(
    token: String,
    state: tauri::State<'_, CryptoState>,
) -> Result<String, String> {
    // Consume the provisioning token (one-time use via .take())
    match state.provisioning_token.lock().unwrap().take() {
        Some(expected) if expected == token => {}
        _ => return Err("Invalid or expired provisioning token".to_string()),
    }

    let sk_hex = state.get_secret_key()?;
    let sk_bytes = hex::decode(&sk_hex).map_err(err_str)?;
    let nsec = bech32::encode::<bech32::Bech32>(bech32::Hrp::parse("nsec").unwrap(), &sk_bytes)
        .map_err(err_str)?;
    Ok(nsec)
}

/// Encrypt the nsec for device provisioning. The nsec NEVER leaves the Rust process.
///
/// Performs ECDH + HKDF + XChaCha20-Poly1305 entirely in Rust using the nsec
/// from CryptoState. Returns { encryptedHex, sasCode }.
#[tauri::command]
pub fn encrypt_nsec_for_provisioning(
    state: tauri::State<'_, CryptoState>,
    ephemeral_pubkey_hex: String,
) -> Result<serde_json::Value, String> {
    let sk_hex = state.get_secret_key()?;
    let sk_bytes = hex::decode(&sk_hex).map_err(err_str)?;

    let result = provisioning::encrypt_nsec_for_provisioning(&sk_bytes, &ephemeral_pubkey_hex)
        .map_err(err_str)?;

    Ok(serde_json::json!({
        "encryptedHex": result.encrypted_hex,
        "sasCode": result.sas_code,
    }))
}

/// Decrypt a provisioned nsec from the primary device.
///
/// This is for the NEW device side — the ephemeral SK is passed in hex because
/// it was generated before CryptoState existed on this device.
/// Returns { nsec, sasCode }.
#[tauri::command]
pub fn decrypt_provisioned_nsec(
    encrypted_hex: String,
    primary_pubkey_hex: String,
    ephemeral_sk_hex: String,
) -> Result<serde_json::Value, String> {
    let sk_bytes = hex::decode(&ephemeral_sk_hex).map_err(err_str)?;

    let result = provisioning::decrypt_provisioned_nsec(
        &encrypted_hex,
        &primary_pubkey_hex,
        &sk_bytes,
    )
    .map_err(err_str)?;

    Ok(serde_json::json!({
        "nsec": *result.nsec,
        "sasCode": result.sas_code,
    }))
}

// ── Stateless commands ───────────────────────────────────────────────
// Commands that do NOT accept `secret_key_hex` remain registered as IPC handlers
// (ecies_wrap_key, encrypt_note, encrypt_message, generate_keypair, verify_schnorr,
// is_valid_nsec, key_pair_from_nsec) plus create_auth_token (sign-in flow only).
//
// Commands that accept `secret_key_hex` are deregistered from IPC (Epic 257 C4)
// but kept here for unit testing. They are marked #[allow(dead_code)].

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
#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
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
#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
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
#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
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

#[allow(dead_code)] // Deregistered from IPC — secret_key_hex must not cross IPC boundary
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
#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
pub fn encrypt_with_pin(
    nsec: String,
    pin: String,
    pubkey_hex: String,
) -> Result<EncryptedKeyData, String> {
    encryption::encrypt_with_pin(&nsec, &pin, &pubkey_hex).map_err(err_str)
}

#[tauri::command]
#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
pub fn decrypt_with_pin(data: EncryptedKeyData, pin: String) -> Result<String, String> {
    encryption::decrypt_with_pin(&data, &pin).map_err(err_str)
}

#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
pub fn generate_keypair() -> Result<KeyPair, String> {
    Ok(keys::generate_keypair())
}

#[tauri::command]
#[allow(dead_code)] // Deregistered from IPC (Epic 257 C4) — kept for unit tests
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

/// Validate an nsec bech32 string without loading it into CryptoState.
/// Used during onboarding before CryptoState is initialized.
#[tauri::command]
pub fn is_valid_nsec(nsec: String) -> bool {
    keys::is_valid_nsec(&nsec)
}

/// Derive a keypair from an nsec. Stateless — for onboarding flows.
/// Deregistered from IPC (Epic 257 C4) — use pubkey_from_nsec instead (nsec must not cross IPC).
#[allow(dead_code)]
pub fn key_pair_from_nsec(nsec: String) -> Result<KeyPair, String> {
    keys::keypair_from_nsec(&nsec).map_err(err_str)
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
