//! WASM bindings for the Llamenos crypto crate.
//!
//! Mirrors `ffi.rs` (UniFFI for mobile) but uses `#[wasm_bindgen]` for browser WASM.
//! Exports a stateful `WasmCryptoState` struct matching the Tauri `CryptoState` pattern
//! in `apps/desktop/src/crypto.rs`.
//!
//! ## Architecture
//!
//! Two categories of exports:
//!
//! 1. **Stateful methods** on `WasmCryptoState` — the secret key lives inside the struct,
//!    never exposed to JS. Mirrors the Tauri IPC stateful commands.
//! 2. **Stateless free functions** — no secret key state needed. Used for encryption,
//!    verification, and key generation.
//!
//! ## Security
//!
//! - Secret key stored in `Zeroizing<Vec<u8>>` — zeroized on drop and on `lock()`
//! - The nsec hex never crosses the WASM boundary except via `get_nsec()` (provisioning only)
//! - All JSON input is parsed inside WASM; all output is serialized before returning

use wasm_bindgen::prelude::*;
use zeroize::{Zeroize, Zeroizing};

use crate::{auth, blind_index, ecies, encryption, keys, labels, nostr, provisioning};

// ── Helpers ──────────────────────────────────────────────────────────

/// Convert any Display error into a JsError.
fn to_js_err(e: impl std::fmt::Display) -> JsError {
    JsError::new(&e.to_string())
}

/// Helper to get the secret key hex from Zeroizing bytes, or return a JsError.
fn sk_hex_from(secret_key: &Option<Zeroizing<Vec<u8>>>) -> Result<String, JsError> {
    secret_key
        .as_ref()
        .map(|sk| hex::encode(sk.as_slice()))
        .ok_or_else(|| JsError::new("Key is locked. Enter PIN to unlock."))
}

/// Convert a bech32 nsec to hex secret key.
fn nsec_to_hex(nsec: &str) -> Result<String, JsError> {
    if nsec.starts_with("nsec1") {
        let (_, data) = bech32::decode(nsec).map_err(|e| JsError::new(&format!("Invalid nsec: {e}")))?;
        Ok(hex::encode(data))
    } else {
        Ok(nsec.to_string())
    }
}

// ── WasmCryptoState ──────────────────────────────────────────────────

/// Stateful crypto context for browser WASM. Holds the decrypted secret key
/// in Rust memory — the nsec never enters JavaScript except during provisioning.
#[wasm_bindgen]
pub struct WasmCryptoState {
    secret_key: Option<Zeroizing<Vec<u8>>>,
    public_key: Option<String>,
    provisioning_token: Option<String>,
}

#[wasm_bindgen]
impl WasmCryptoState {
    /// Create a new locked crypto state.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            secret_key: None,
            public_key: None,
            provisioning_token: None,
        }
    }

    /// Decrypt the nsec from PIN-encrypted storage, store in state.
    /// Returns the public key hex — nsec never leaves the WASM module.
    #[wasm_bindgen(js_name = "unlockWithPin")]
    pub fn unlock_with_pin(
        &mut self,
        encrypted_data_json: &str,
        pin: &str,
    ) -> Result<String, JsError> {
        let data: encryption::EncryptedKeyData =
            serde_json::from_str(encrypted_data_json).map_err(to_js_err)?;
        let nsec = encryption::decrypt_with_pin(&data, pin).map_err(to_js_err)?;
        let sk_hex = nsec_to_hex(&nsec)?;
        let pubkey = keys::get_public_key(&sk_hex).map_err(to_js_err)?;

        let sk_bytes = hex::decode(&sk_hex).map_err(to_js_err)?;
        self.secret_key = Some(Zeroizing::new(sk_bytes));
        self.public_key = Some(pubkey.clone());

        Ok(pubkey)
    }

    /// Import a key (nsec or hex), encrypt with PIN, store in state.
    /// Returns JSON: the EncryptedKeyData + pubkey.
    #[wasm_bindgen(js_name = "importKey")]
    pub fn import_key(
        &mut self,
        nsec_or_hex: &str,
        pin: &str,
    ) -> Result<JsValue, JsError> {
        let sk_hex = nsec_to_hex(nsec_or_hex)?;
        let pubkey = keys::get_public_key(&sk_hex).map_err(to_js_err)?;

        // We need the nsec bech32 for encrypt_with_pin
        let nsec = if nsec_or_hex.starts_with("nsec1") {
            nsec_or_hex.to_string()
        } else {
            let sk_bytes = hex::decode(&sk_hex).map_err(to_js_err)?;
            bech32::encode::<bech32::Bech32>(bech32::Hrp::parse("nsec").unwrap(), &sk_bytes)
                .map_err(to_js_err)?
        };

        let encrypted = encryption::encrypt_with_pin(&nsec, pin, &pubkey).map_err(to_js_err)?;

        let sk_bytes = hex::decode(&sk_hex).map_err(to_js_err)?;
        self.secret_key = Some(Zeroizing::new(sk_bytes));
        self.public_key = Some(pubkey.clone());

        let result = serde_json::json!({
            "encryptedKeyData": encrypted,
            "pubkey": pubkey,
        });
        // Use json_compatible serializer so serde_json::Value::Object becomes a plain JS object
        // (not a JS Map). JSON.stringify on a JS Map gives {}, breaking localStorage persistence.
        use serde::Serialize as _;
        result
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(to_js_err)
    }

    /// Lock the crypto state — zeroize the secret key.
    #[wasm_bindgen(js_name = "lock")]
    pub fn lock(&mut self) {
        self.secret_key = None; // Zeroizing<Vec<u8>> zeroizes on drop
        self.public_key = None;
        self.provisioning_token = None;
    }

    /// Check if the crypto state is unlocked.
    #[wasm_bindgen(js_name = "isUnlocked")]
    pub fn is_unlocked(&self) -> bool {
        self.secret_key.is_some()
    }

    /// Get the public key from state (no secret key exposure).
    #[wasm_bindgen(js_name = "getPublicKey")]
    pub fn get_public_key(&self) -> Result<String, JsError> {
        self.public_key
            .clone()
            .ok_or_else(|| JsError::new("Key is locked. Enter PIN to unlock."))
    }

    /// Create an auth token using the key in state.
    #[wasm_bindgen(js_name = "createAuthToken")]
    pub fn create_auth_token(
        &self,
        method: &str,
        path: &str,
    ) -> Result<JsValue, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let now = js_sys::Date::now() as u64;
        let token = auth::create_auth_token(&sk_hex, now, method, path).map_err(to_js_err)?;
        serde_wasm_bindgen::to_value(&token).map_err(to_js_err)
    }

    /// ECIES unwrap a symmetric key using the key in state.
    #[wasm_bindgen(js_name = "eciesUnwrapKey")]
    pub fn ecies_unwrap_key(
        &self,
        envelope_json: &str,
        label: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let envelope: ecies::KeyEnvelope =
            serde_json::from_str(envelope_json).map_err(to_js_err)?;
        let key = ecies::ecies_unwrap_key(&envelope, &sk_hex, label).map_err(to_js_err)?;
        Ok(hex::encode(key))
    }

    /// Encrypt a note with a random per-note key, wrapped for author and admins.
    #[wasm_bindgen(js_name = "encryptNote")]
    pub fn encrypt_note(
        &self,
        payload_json: &str,
        author_pubkey: &str,
        admin_pubkeys_json: &str,
    ) -> Result<JsValue, JsError> {
        let admin_pubkeys: Vec<String> =
            serde_json::from_str(admin_pubkeys_json).map_err(to_js_err)?;
        let encrypted =
            encryption::encrypt_note(payload_json, author_pubkey, &admin_pubkeys)
                .map_err(to_js_err)?;
        serde_wasm_bindgen::to_value(&encrypted).map_err(to_js_err)
    }

    /// Decrypt a note using the key in state.
    #[wasm_bindgen(js_name = "decryptNote")]
    pub fn decrypt_note(
        &self,
        encrypted_content: &str,
        envelope_json: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let envelope: ecies::KeyEnvelope =
            serde_json::from_str(envelope_json).map_err(to_js_err)?;
        encryption::decrypt_note(encrypted_content, &envelope, &sk_hex).map_err(to_js_err)
    }

    /// Encrypt a message for multiple readers.
    #[wasm_bindgen(js_name = "encryptMessage")]
    pub fn encrypt_message(
        &self,
        plaintext: &str,
        reader_pubkeys_json: &str,
    ) -> Result<JsValue, JsError> {
        let reader_pubkeys: Vec<String> =
            serde_json::from_str(reader_pubkeys_json).map_err(to_js_err)?;
        let encrypted =
            encryption::encrypt_message(plaintext, &reader_pubkeys).map_err(to_js_err)?;
        serde_wasm_bindgen::to_value(&encrypted).map_err(to_js_err)
    }

    /// Decrypt a message using the reader's envelope from the list.
    #[wasm_bindgen(js_name = "decryptMessage")]
    pub fn decrypt_message(
        &self,
        encrypted_content: &str,
        reader_envelopes_json: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let pk_hex = self.get_public_key()?;
        let reader_envelopes: Vec<ecies::RecipientKeyEnvelope> =
            serde_json::from_str(reader_envelopes_json).map_err(to_js_err)?;
        encryption::decrypt_message(encrypted_content, &reader_envelopes, &sk_hex, &pk_hex)
            .map_err(to_js_err)
    }

    /// Decrypt a call record's encrypted metadata.
    #[wasm_bindgen(js_name = "decryptCallRecord")]
    pub fn decrypt_call_record(
        &self,
        encrypted_content: &str,
        admin_envelopes_json: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let pk_hex = self.get_public_key()?;
        let admin_envelopes: Vec<ecies::RecipientKeyEnvelope> =
            serde_json::from_str(admin_envelopes_json).map_err(to_js_err)?;
        encryption::decrypt_call_record(encrypted_content, &admin_envelopes, &sk_hex, &pk_hex)
            .map_err(to_js_err)
    }

    /// Decrypt a legacy V1 note (HKDF-derived key, no forward secrecy).
    #[wasm_bindgen(js_name = "decryptLegacyNote")]
    pub fn decrypt_legacy_note(
        &self,
        encrypted_content: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        encryption::decrypt_legacy_note(encrypted_content, &sk_hex).map_err(to_js_err)
    }

    /// Decrypt a transcription using ECIES.
    #[wasm_bindgen(js_name = "decryptTranscription")]
    pub fn decrypt_transcription(
        &self,
        encrypted_content: &str,
        ephemeral_pubkey_hex: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        ecies::ecies_decrypt_content(
            encrypted_content,
            ephemeral_pubkey_hex,
            &sk_hex,
            labels::LABEL_TRANSCRIPTION,
        )
        .map_err(to_js_err)
    }

    /// Encrypt a draft (local auto-save) with HKDF-derived key.
    #[wasm_bindgen(js_name = "encryptDraft")]
    pub fn encrypt_draft(&self, plaintext: &str) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        encryption::encrypt_draft(plaintext, &sk_hex).map_err(to_js_err)
    }

    /// Decrypt a draft.
    #[wasm_bindgen(js_name = "decryptDraft")]
    pub fn decrypt_draft(&self, encrypted_hex: &str) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        encryption::decrypt_draft(encrypted_hex, &sk_hex).map_err(to_js_err)
    }

    /// Encrypt a JSON export blob. Returns base64.
    #[wasm_bindgen(js_name = "encryptExport")]
    pub fn encrypt_export(&self, json_string: &str) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        encryption::encrypt_export(json_string, &sk_hex).map_err(to_js_err)
    }

    /// Sign a Nostr event using the key in state.
    #[wasm_bindgen(js_name = "signNostrEvent")]
    pub fn sign_nostr_event(&self, event_json: &str) -> Result<JsValue, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;

        #[derive(serde::Deserialize)]
        struct EventTemplate {
            kind: u32,
            #[serde(rename = "createdAt", alias = "created_at")]
            created_at: u64,
            tags: Vec<Vec<String>>,
            content: String,
        }

        let template: EventTemplate =
            serde_json::from_str(event_json).map_err(to_js_err)?;
        let signed = nostr::finalize_nostr_event(
            template.kind,
            template.created_at,
            template.tags,
            &template.content,
            &sk_hex,
        )
        .map_err(to_js_err)?;
        serde_wasm_bindgen::to_value(&signed).map_err(to_js_err)
    }

    /// Decrypt ECIES-encrypted file metadata.
    #[wasm_bindgen(js_name = "decryptFileMetadata")]
    pub fn decrypt_file_metadata(
        &self,
        encrypted_content: &str,
        envelope_json: &str,
    ) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;

        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ContentEnvelope {
            encrypted_content_hex: String,
            ephemeral_pubkey_hex: String,
        }

        // Support both a full envelope JSON or just an ephemeral pubkey
        // Try parsing as content envelope first, fall back to just ephemeral pubkey
        if let Ok(env) = serde_json::from_str::<ContentEnvelope>(envelope_json) {
            ecies::ecies_decrypt_content(
                &env.encrypted_content_hex,
                &env.ephemeral_pubkey_hex,
                &sk_hex,
                labels::LABEL_FILE_METADATA,
            )
            .map_err(to_js_err)
        } else {
            // envelope_json is just the ephemeral pubkey hex string
            let ephemeral: String = serde_json::from_str(envelope_json)
                .unwrap_or_else(|_| envelope_json.trim_matches('"').to_string());
            ecies::ecies_decrypt_content(
                encrypted_content,
                &ephemeral,
                &sk_hex,
                labels::LABEL_FILE_METADATA,
            )
            .map_err(to_js_err)
        }
    }

    /// Unwrap a file key from an ECIES envelope.
    #[wasm_bindgen(js_name = "unwrapFileKey")]
    pub fn unwrap_file_key(&self, envelope_json: &str) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let envelope: ecies::KeyEnvelope =
            serde_json::from_str(envelope_json).map_err(to_js_err)?;
        let key = ecies::ecies_unwrap_key(&envelope, &sk_hex, labels::LABEL_FILE_KEY)
            .map_err(to_js_err)?;
        Ok(hex::encode(key))
    }

    /// Unwrap a hub key from an ECIES envelope.
    #[wasm_bindgen(js_name = "unwrapHubKey")]
    pub fn unwrap_hub_key(&self, envelope_json: &str) -> Result<String, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let envelope: ecies::KeyEnvelope =
            serde_json::from_str(envelope_json).map_err(to_js_err)?;
        let key =
            ecies::ecies_unwrap_key(&envelope, &sk_hex, labels::LABEL_HUB_KEY_WRAP)
                .map_err(to_js_err)?;
        Ok(hex::encode(key))
    }

    /// Rewrap a file key for a new recipient.
    /// Unwraps the existing key with the current user's key, then wraps for the new recipient.
    #[wasm_bindgen(js_name = "rewrapFileKey")]
    pub fn rewrap_file_key(
        &self,
        envelope_json: &str,
        recipient_pubkey: &str,
    ) -> Result<JsValue, JsError> {
        let sk_hex = sk_hex_from(&self.secret_key)?;
        let envelope: ecies::KeyEnvelope =
            serde_json::from_str(envelope_json).map_err(to_js_err)?;

        // Unwrap with current user's key
        let file_key =
            ecies::ecies_unwrap_key(&envelope, &sk_hex, labels::LABEL_FILE_KEY)
                .map_err(to_js_err)?;

        // Re-wrap for new recipient
        let new_envelope =
            ecies::ecies_wrap_key(&file_key, recipient_pubkey, labels::LABEL_FILE_KEY)
                .map_err(to_js_err)?;

        let result = ecies::RecipientKeyEnvelope {
            pubkey: recipient_pubkey.to_string(),
            wrapped_key: new_envelope.wrapped_key,
            ephemeral_pubkey: new_envelope.ephemeral_pubkey,
        };
        serde_wasm_bindgen::to_value(&result).map_err(to_js_err)
    }

    /// Encrypt the nsec for device provisioning. The nsec NEVER leaves WASM.
    ///
    /// Performs ECDH with the ephemeral pubkey, derives a key via HKDF,
    /// encrypts the nsec, and computes a SAS code — all inside WASM.
    ///
    /// Returns JSON: { encryptedHex, sasCode }
    #[wasm_bindgen(js_name = "encryptNsecForProvisioning")]
    pub fn encrypt_nsec_for_provisioning(
        &self,
        ephemeral_pubkey_hex: &str,
    ) -> Result<JsValue, JsError> {
        let sk_bytes = self.secret_key
            .as_ref()
            .ok_or_else(|| JsError::new("Key is locked. Enter PIN to unlock."))?;

        let result = provisioning::encrypt_nsec_for_provisioning(sk_bytes.as_slice(), ephemeral_pubkey_hex)
            .map_err(to_js_err)?;

        let json = serde_json::json!({
            "encryptedHex": result.encrypted_hex,
            "sasCode": result.sas_code,
        });
        serde_wasm_bindgen::to_value(&json).map_err(to_js_err)
    }

    /// Decrypt a provisioned nsec from the primary device.
    ///
    /// Takes the ephemeral secret key bytes (hex), the encrypted payload, and
    /// the primary device's pubkey. Returns JSON: { nsec, sasCode }
    ///
    /// NOTE: This is for the NEW device side — the ephemeral SK is passed in
    /// because it was generated before CryptoState existed on this device.
    #[wasm_bindgen(js_name = "decryptProvisionedNsec")]
    pub fn decrypt_provisioned_nsec(
        &self,
        encrypted_hex: &str,
        primary_pubkey_hex: &str,
        ephemeral_sk_hex: &str,
    ) -> Result<JsValue, JsError> {
        let sk_bytes = hex::decode(ephemeral_sk_hex).map_err(to_js_err)?;

        let result = provisioning::decrypt_provisioned_nsec(
            encrypted_hex,
            primary_pubkey_hex,
            &sk_bytes,
        )
        .map_err(to_js_err)?;

        let json = serde_json::json!({
            "nsec": *result.nsec,
            "sasCode": result.sas_code,
        });
        serde_wasm_bindgen::to_value(&json).map_err(to_js_err)
    }

    /// Request a one-time provisioning token. Must be called before `getNsec`.
    /// Returns a random hex token stored in state. Each call replaces any existing token.
    #[wasm_bindgen(js_name = "requestProvisioningToken")]
    pub fn request_provisioning_token(&mut self) -> Result<String, JsError> {
        let mut bytes = [0u8; 16];
        getrandom::getrandom(&mut bytes).map_err(|e| JsError::new(&e.to_string()))?;
        let token = hex::encode(bytes);
        self.provisioning_token = Some(token.clone());
        Ok(token)
    }

    /// Get the nsec from state. Used ONLY for device provisioning and backup.
    /// Requires a one-time provisioning token (from `requestProvisioningToken`).
    /// The token is consumed on use.
    #[wasm_bindgen(js_name = "getNsec")]
    pub fn get_nsec(&mut self, token: &str) -> Result<String, JsError> {
        // Consume the provisioning token (one-time use via .take())
        match self.provisioning_token.take() {
            Some(expected) if expected == token => {}
            _ => return Err(JsError::new("Invalid or expired provisioning token")),
        }

        let sk_hex = sk_hex_from(&self.secret_key)?;
        let sk_bytes = hex::decode(&sk_hex).map_err(to_js_err)?;
        let nsec =
            bech32::encode::<bech32::Bech32>(bech32::Hrp::parse("nsec").unwrap(), &sk_bytes)
                .map_err(to_js_err)?;
        Ok(nsec)
    }
}

// ── Stateless free functions ─────────────────────────────────────────

/// Generate a new random secp256k1 keypair.
/// Returns JSON: { skHex, pubkeyHex, nsec, npub }
#[wasm_bindgen(js_name = "generateKeypair")]
pub fn generate_keypair() -> Result<JsValue, JsError> {
    let kp = keys::generate_keypair();
    let result = serde_json::json!({
        "skHex": kp.secret_key_hex,
        "pubkeyHex": kp.public_key,
        "nsec": kp.nsec,
        "npub": kp.npub,
    });
    serde_wasm_bindgen::to_value(&result).map_err(to_js_err)
}

/// Get the x-only public key hex from a secret key hex.
#[wasm_bindgen(js_name = "getPublicKeyFromSecret")]
pub fn get_public_key_from_secret(sk_hex: &str) -> Result<String, JsError> {
    keys::get_public_key(sk_hex).map_err(to_js_err)
}

/// Validate an nsec bech32 string.
#[wasm_bindgen(js_name = "isValidNsec")]
pub fn is_valid_nsec(nsec: &str) -> bool {
    keys::is_valid_nsec(nsec)
}

/// Derive a keypair from an nsec bech32 string.
/// Returns JSON: { skHex, pubkeyHex, nsec, npub }
#[wasm_bindgen(js_name = "keyPairFromNsec")]
pub fn key_pair_from_nsec(nsec: &str) -> Result<JsValue, JsError> {
    let kp = keys::keypair_from_nsec(nsec).map_err(to_js_err)?;
    let result = serde_json::json!({
        "skHex": kp.secret_key_hex,
        "pubkeyHex": kp.public_key,
        "nsec": kp.nsec,
        "npub": kp.npub,
    });
    serde_wasm_bindgen::to_value(&result).map_err(to_js_err)
}

/// Verify a raw Schnorr signature over a pre-hashed message.
#[wasm_bindgen(js_name = "verifySchnorr")]
pub fn verify_schnorr(
    msg_hash_hex: &str,
    sig_hex: &str,
    pubkey_hex: &str,
) -> Result<bool, JsError> {
    auth::verify_schnorr(msg_hash_hex, sig_hex, pubkey_hex).map_err(to_js_err)
}

/// Wrap a 32-byte symmetric key for a recipient using ECIES.
/// Returns JSON: { wrappedKey, ephemeralPubkey }
#[wasm_bindgen(js_name = "eciesWrapKey")]
pub fn ecies_wrap_key(
    key_hex: &str,
    recipient_pubkey_hex: &str,
    label: &str,
) -> Result<JsValue, JsError> {
    let key_bytes = hex::decode(key_hex).map_err(to_js_err)?;
    if key_bytes.len() != 32 {
        return Err(JsError::new("Key must be 32 bytes"));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let envelope =
        ecies::ecies_wrap_key(&key, recipient_pubkey_hex, label).map_err(to_js_err)?;
    key.zeroize();
    serde_wasm_bindgen::to_value(&envelope).map_err(to_js_err)
}

/// Create an auth token (stateless — secret key passed as argument).
/// Returns JSON: { pubkey, timestamp, token }
#[wasm_bindgen(js_name = "createAuthTokenStateless")]
pub fn create_auth_token_stateless(
    sk_hex: &str,
    method: &str,
    path: &str,
) -> Result<JsValue, JsError> {
    let now = js_sys::Date::now() as u64;
    let token = auth::create_auth_token(sk_hex, now, method, path).map_err(to_js_err)?;
    serde_wasm_bindgen::to_value(&token).map_err(to_js_err)
}

/// Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
/// Input: hex(nonce_24 + ciphertext), 32-byte key as hex.
/// Output: decrypted UTF-8 string (JSON).
#[wasm_bindgen(js_name = "decryptServerEventHex")]
pub fn decrypt_server_event_hex(
    encrypted_hex: &str,
    key_hex: &str,
) -> Result<String, JsError> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };

    let data = hex::decode(encrypted_hex).map_err(to_js_err)?;
    let key_bytes = hex::decode(key_hex).map_err(to_js_err)?;
    if key_bytes.len() != 32 {
        return Err(JsError::new("Key must be 32 bytes"));
    }
    if data.len() < 40 {
        return Err(JsError::new("Ciphertext too short"));
    }

    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];
    let cipher =
        XChaCha20Poly1305::new_from_slice(&key_bytes).map_err(to_js_err)?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| JsError::new("Decryption failed"))?;

    String::from_utf8(plaintext).map_err(to_js_err)
}

/// Compute a blind index token for exact-match server-side filtering.
/// Returns the hex-encoded HMAC-SHA256 token.
#[wasm_bindgen(js_name = "computeBlindIndex")]
pub fn compute_blind_index(
    value: &str,
    key_hex: &str,
    index_type: &str,
) -> Result<String, JsError> {
    let key_bytes = hex::decode(key_hex).map_err(to_js_err)?;
    if key_bytes.len() != 32 {
        return Err(JsError::new("Hub key must be 32 bytes"));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let result = blind_index::blind_index(&key, index_type, value);
    key.zeroize();
    Ok(result)
}

/// Compute date-bucketed blind indexes (day/week/month).
/// Returns JSON: [{ key, hash }, ...]
#[wasm_bindgen(js_name = "computeDateBucket")]
pub fn compute_date_bucket(
    date_str: &str,
    key_hex: &str,
) -> Result<JsValue, JsError> {
    let key_bytes = hex::decode(key_hex).map_err(to_js_err)?;
    if key_bytes.len() != 32 {
        return Err(JsError::new("Hub key must be 32 bytes"));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let indexes = blind_index::date_blind_indexes(&key, "created", date_str);
    key.zeroize();

    let result: Vec<serde_json::Value> = indexes
        .into_iter()
        .map(|(k, h)| serde_json::json!({ "key": k, "hash": h }))
        .collect();
    serde_wasm_bindgen::to_value(&result).map_err(to_js_err)
}
