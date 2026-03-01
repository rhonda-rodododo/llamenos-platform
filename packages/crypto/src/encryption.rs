//! High-level encryption operations: per-note, per-message, per-call-record,
//! draft, export, and PIN-based key storage.
//!
//! All operations use the ECIES envelope pattern from `ecies.rs` with
//! domain-separated labels from `labels.rs`.

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::ecies::{ecies_wrap_key, ecies_unwrap_key, random_bytes_32, KeyEnvelope, RecipientKeyEnvelope};
use crate::errors::CryptoError;
use crate::labels::*;

const PBKDF2_ITERATIONS: u32 = 600_000;

// --- Per-Note Encryption (V2 — forward secrecy) ---

/// Encrypted note with per-note key wrapped for author + each admin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct EncryptedNote {
    /// hex: nonce(24) + ciphertext
    pub encrypted_content: String,
    /// Note key wrapped for the author
    pub author_envelope: KeyEnvelope,
    /// Note key wrapped for each admin
    pub admin_envelopes: Vec<RecipientKeyEnvelope>,
}

/// Encrypt a note with a random per-note key, wrapped for the author and all admins.
///
/// Provides forward secrecy: compromising the identity key doesn't reveal past notes.
pub fn encrypt_note(
    payload_json: &str,
    author_pubkey: &str,
    admin_pubkeys: &[String],
) -> Result<EncryptedNote, CryptoError> {
    // Generate random per-note symmetric key
    let mut note_key = random_bytes_32();
    let nonce_bytes = {
        let mut n = [0u8; 24];
        getrandom::getrandom(&mut n).expect("getrandom failed");
        n
    };

    // Encrypt content with XChaCha20-Poly1305
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&note_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(nonce, payload_json.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Pack: nonce(24) + ciphertext
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    // Wrap note key for author
    let author_envelope = ecies_wrap_key(&note_key, author_pubkey, LABEL_NOTE_KEY)?;

    // Wrap note key for each admin
    let admin_envelopes: Result<Vec<RecipientKeyEnvelope>, CryptoError> = admin_pubkeys
        .iter()
        .map(|pk| {
            let env = ecies_wrap_key(&note_key, pk, LABEL_NOTE_KEY)?;
            Ok(RecipientKeyEnvelope {
                pubkey: pk.clone(),
                wrapped_key: env.wrapped_key,
                ephemeral_pubkey: env.ephemeral_pubkey,
            })
        })
        .collect();

    // Zero out note key
    note_key.zeroize();

    Ok(EncryptedNote {
        encrypted_content: hex::encode(&packed),
        author_envelope,
        admin_envelopes: admin_envelopes?,
    })
}

/// Decrypt a V2 note using the appropriate envelope for the current user.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn decrypt_note(
    encrypted_content: &str,
    envelope: &KeyEnvelope,
    secret_key_hex: &str,
) -> Result<String, CryptoError> {
    // Unwrap the note key
    let mut note_key = ecies_unwrap_key(envelope, secret_key_hex, LABEL_NOTE_KEY)?;

    // Unpack: nonce(24) + ciphertext
    let data = hex::decode(encrypted_content).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&note_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    note_key.zeroize();

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}

// --- Per-Message Encryption (Epic 74) ---

/// Encrypted message with per-message key wrapped for each reader.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct EncryptedMessage {
    /// hex: nonce(24) + ciphertext
    pub encrypted_content: String,
    /// Message key wrapped for each reader (volunteer + admins)
    pub reader_envelopes: Vec<RecipientKeyEnvelope>,
}

/// Encrypt a message for multiple readers using the envelope pattern.
pub fn encrypt_message(
    plaintext: &str,
    reader_pubkeys: &[String],
) -> Result<EncryptedMessage, CryptoError> {
    let mut message_key = random_bytes_32();
    let nonce_bytes = {
        let mut n = [0u8; 24];
        getrandom::getrandom(&mut n).expect("getrandom failed");
        n
    };

    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&message_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    let reader_envelopes: Result<Vec<RecipientKeyEnvelope>, CryptoError> = reader_pubkeys
        .iter()
        .map(|pk| {
            let env = ecies_wrap_key(&message_key, pk, LABEL_MESSAGE)?;
            Ok(RecipientKeyEnvelope {
                pubkey: pk.clone(),
                wrapped_key: env.wrapped_key,
                ephemeral_pubkey: env.ephemeral_pubkey,
            })
        })
        .collect();

    message_key.zeroize();

    Ok(EncryptedMessage {
        encrypted_content: hex::encode(&packed),
        reader_envelopes: reader_envelopes?,
    })
}

/// Decrypt a message using the reader's envelope.
pub fn decrypt_message(
    encrypted_content: &str,
    reader_envelopes: &[RecipientKeyEnvelope],
    secret_key_hex: &str,
    reader_pubkey: &str,
) -> Result<String, CryptoError> {
    // Find the envelope for this reader
    let envelope = reader_envelopes
        .iter()
        .find(|e| e.pubkey == reader_pubkey)
        .ok_or(CryptoError::DecryptionFailed)?;

    let key_envelope = KeyEnvelope {
        wrapped_key: envelope.wrapped_key.clone(),
        ephemeral_pubkey: envelope.ephemeral_pubkey.clone(),
    };

    let mut message_key = ecies_unwrap_key(&key_envelope, secret_key_hex, LABEL_MESSAGE)?;

    let data = hex::decode(encrypted_content).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&message_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    message_key.zeroize();

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}

// --- Call Record Metadata Decryption (Epic 77) ---

/// Decrypt a call record's encrypted metadata.
pub fn decrypt_call_record(
    encrypted_content: &str,
    admin_envelopes: &[RecipientKeyEnvelope],
    secret_key_hex: &str,
    reader_pubkey: &str,
) -> Result<String, CryptoError> {
    let envelope = admin_envelopes
        .iter()
        .find(|e| e.pubkey == reader_pubkey)
        .ok_or(CryptoError::DecryptionFailed)?;

    let key_envelope = KeyEnvelope {
        wrapped_key: envelope.wrapped_key.clone(),
        ephemeral_pubkey: envelope.ephemeral_pubkey.clone(),
    };

    let mut record_key = ecies_unwrap_key(&key_envelope, secret_key_hex, LABEL_CALL_META)?;

    let data = hex::decode(encrypted_content).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&record_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    record_key.zeroize();

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}

// --- Legacy V1 Note Decryption ---
// V1 notes used HKDF-derived key from the secret key (no forward secrecy).
// Kept for backward compatibility with pre-V2 notes.

/// Decrypt a V1 legacy note (HKDF-derived key, not per-note forward secrecy).
///
/// packed_hex = hex(nonce(24) + ciphertext)
pub fn decrypt_legacy_note(
    packed_hex: &str,
    secret_key_hex: &str,
) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&sk_bytes);

    let mut key = derive_encryption_key(&sk, HKDF_CONTEXT_NOTES);

    let data = hex::decode(packed_hex).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    key.zeroize();
    sk.zeroize();

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}

// --- HKDF-based Symmetric Encryption (legacy + drafts/export) ---

/// Derive a symmetric encryption key from a secret key and label using HKDF.
fn derive_encryption_key(secret_key: &[u8; 32], label: &str) -> [u8; 32] {
    let salt = HKDF_SALT.as_bytes();
    let hk = Hkdf::<Sha256>::new(Some(salt), secret_key);
    let mut okm = [0u8; 32];
    hk.expand(label.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}

/// Encrypt a draft (local auto-save) with HKDF-derived key.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn encrypt_draft(plaintext: &str, secret_key_hex: &str) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&sk_bytes);

    let mut key = derive_encryption_key(&sk, HKDF_CONTEXT_DRAFTS);
    let nonce_bytes = {
        let mut n = [0u8; 24];
        getrandom::getrandom(&mut n).expect("getrandom failed");
        n
    };

    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    key.zeroize();
    sk.zeroize();

    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    Ok(hex::encode(&packed))
}

/// Decrypt a draft.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn decrypt_draft(packed_hex: &str, secret_key_hex: &str) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&sk_bytes);

    let mut key = derive_encryption_key(&sk, HKDF_CONTEXT_DRAFTS);

    let data = hex::decode(packed_hex).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    key.zeroize();
    sk.zeroize();

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}

// --- Export Encryption ---

/// Encrypt a JSON export blob. Returns base64-encoded ciphertext.
///
/// Uses HKDF-derived key with HKDF_CONTEXT_EXPORT.
/// Returns base64(nonce(24) + ciphertext) — avoids JSON-serializing large byte
/// arrays as number arrays over IPC.
pub fn encrypt_export(json_string: &str, secret_key_hex: &str) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&sk_bytes);

    let mut key = derive_encryption_key(&sk, HKDF_CONTEXT_EXPORT);
    let nonce_bytes = {
        let mut n = [0u8; 24];
        getrandom::getrandom(&mut n).expect("getrandom failed");
        n
    };

    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(nonce, json_string.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    key.zeroize();
    sk.zeroize();

    // Pack: nonce(24) + ciphertext, then base64 encode
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    use base64::{Engine, engine::general_purpose::STANDARD};
    Ok(STANDARD.encode(&packed))
}

// --- PIN-encrypted Key Storage ---

/// Encrypted key data stored on disk (Stronghold on desktop, Keychain on mobile).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct EncryptedKeyData {
    /// hex, 16 bytes
    pub salt: String,
    /// PBKDF2 iteration count (600,000)
    pub iterations: u32,
    /// hex, 24 bytes (XChaCha20 nonce)
    pub nonce: String,
    /// hex, encrypted nsec bech32 string
    pub ciphertext: String,
    /// Truncated SHA-256 hash of pubkey (not plaintext) for identification
    pub pubkey: String,
}

/// Derive a 32-byte KEK from a PIN using PBKDF2-SHA256.
pub fn derive_kek_from_pin(pin: &str, salt: &[u8]) -> [u8; 32] {
    let mut kek = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pin.as_bytes(), salt, PBKDF2_ITERATIONS, &mut kek);
    kek
}

/// Encrypt an nsec bech32 string with a PIN.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn encrypt_with_pin(nsec: &str, pin: &str, pubkey_hex: &str) -> Result<EncryptedKeyData, CryptoError> {
    if !is_valid_pin(pin) {
        return Err(CryptoError::InvalidPin);
    }

    let mut salt = [0u8; 16];
    getrandom::getrandom(&mut salt).expect("getrandom failed");

    let mut kek = derive_kek_from_pin(pin, &salt);

    let nonce_bytes = {
        let mut n = [0u8; 24];
        getrandom::getrandom(&mut n).expect("getrandom failed");
        n
    };

    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&kek)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(nonce, nsec.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Hash pubkey for identification (matches JS: SHA-256(HMAC_KEYID_PREFIX + pubkey)[0..16])
    let hash_input = format!("{}{}", HMAC_KEYID_PREFIX, pubkey_hex);
    let pubkey_hash = {
        let mut hasher = Sha256::new();
        hasher.update(hash_input.as_bytes());
        let full = hasher.finalize();
        hex::encode(&full[..8]) // 16 hex chars = 8 bytes
    };

    kek.zeroize();

    Ok(EncryptedKeyData {
        salt: hex::encode(salt),
        iterations: PBKDF2_ITERATIONS,
        nonce: hex::encode(nonce_bytes),
        ciphertext: hex::encode(ciphertext),
        pubkey: pubkey_hash,
    })
}

/// Decrypt a stored nsec using a PIN. Returns the nsec bech32 string or error.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn decrypt_with_pin(data: &EncryptedKeyData, pin: &str) -> Result<String, CryptoError> {
    let salt = hex::decode(&data.salt).map_err(CryptoError::HexError)?;
    let nonce_bytes = hex::decode(&data.nonce).map_err(CryptoError::HexError)?;
    let ciphertext = hex::decode(&data.ciphertext).map_err(CryptoError::HexError)?;

    if nonce_bytes.len() != 24 {
        return Err(CryptoError::InvalidNonce);
    }

    let mut kek = derive_kek_from_pin(pin, &salt);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let cipher = XChaCha20Poly1305::new_from_slice(&kek)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| CryptoError::WrongPin)?;

    kek.zeroize();

    String::from_utf8(plaintext).map_err(|_| CryptoError::WrongPin)
}

/// Validate PIN format: 4-6 digits.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn is_valid_pin(pin: &str) -> bool {
    let len = pin.len();
    (4..=6).contains(&len) && pin.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    #[test]
    fn roundtrip_note_encryption() {
        let author = generate_keypair();
        let admin1 = generate_keypair();
        let admin2 = generate_keypair();

        let payload = r#"{"text":"Test note content","customFields":{}}"#;
        let admin_pubkeys = vec![admin1.public_key.clone(), admin2.public_key.clone()];

        let encrypted = encrypt_note(payload, &author.public_key, &admin_pubkeys).unwrap();

        // Author can decrypt
        let decrypted = decrypt_note(
            &encrypted.encrypted_content,
            &encrypted.author_envelope,
            &author.secret_key_hex,
        ).unwrap();
        assert_eq!(decrypted, payload);

        // Admin1 can decrypt
        let admin1_env = &encrypted.admin_envelopes[0];
        let admin1_envelope = KeyEnvelope {
            wrapped_key: admin1_env.wrapped_key.clone(),
            ephemeral_pubkey: admin1_env.ephemeral_pubkey.clone(),
        };
        let decrypted = decrypt_note(
            &encrypted.encrypted_content,
            &admin1_envelope,
            &admin1.secret_key_hex,
        ).unwrap();
        assert_eq!(decrypted, payload);
    }

    #[test]
    fn roundtrip_message_encryption() {
        let reader1 = generate_keypair();
        let reader2 = generate_keypair();

        let plaintext = "Hello from the crisis line";
        let reader_pubkeys = vec![reader1.public_key.clone(), reader2.public_key.clone()];

        let encrypted = encrypt_message(plaintext, &reader_pubkeys).unwrap();

        let decrypted = decrypt_message(
            &encrypted.encrypted_content,
            &encrypted.reader_envelopes,
            &reader1.secret_key_hex,
            &reader1.public_key,
        ).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn roundtrip_draft_encryption() {
        let kp = generate_keypair();
        let plaintext = "Draft note content";

        let encrypted = encrypt_draft(plaintext, &kp.secret_key_hex).unwrap();
        let decrypted = decrypt_draft(&encrypted, &kp.secret_key_hex).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn roundtrip_pin_encryption() {
        let nsec = "nsec1test1234567890abcdef";
        let pin = "1234";
        let pubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

        let encrypted = encrypt_with_pin(nsec, pin, pubkey).unwrap();
        let decrypted = decrypt_with_pin(&encrypted, pin).unwrap();
        assert_eq!(decrypted, nsec);
    }

    #[test]
    fn wrong_pin_fails() {
        let nsec = "nsec1test1234567890abcdef";
        let pin = "1234";
        let pubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

        let encrypted = encrypt_with_pin(nsec, pin, pubkey).unwrap();
        let result = decrypt_with_pin(&encrypted, "9999");
        assert!(result.is_err());
    }

    #[test]
    fn invalid_pin_rejected() {
        assert!(!is_valid_pin("123"));     // too short
        assert!(!is_valid_pin("1234567")); // too long
        assert!(!is_valid_pin("abcd"));    // not digits
        assert!(is_valid_pin("1234"));     // valid
        assert!(is_valid_pin("123456"));   // valid
    }

    #[test]
    fn note_wrong_admin_key_fails() {
        let author = generate_keypair();
        let admin = generate_keypair();
        let wrong_admin = generate_keypair();

        let payload = r#"{"text":"Secret note"}"#;
        let encrypted = encrypt_note(payload, &author.public_key, &[admin.public_key.clone()]).unwrap();

        // Use admin's envelope but wrong admin's secret key
        let admin_envelope = KeyEnvelope {
            wrapped_key: encrypted.admin_envelopes[0].wrapped_key.clone(),
            ephemeral_pubkey: encrypted.admin_envelopes[0].ephemeral_pubkey.clone(),
        };
        let result = decrypt_note(
            &encrypted.encrypted_content,
            &admin_envelope,
            &wrong_admin.secret_key_hex,
        );
        assert!(result.is_err());
    }

    #[test]
    fn note_tampered_content_fails() {
        let author = generate_keypair();
        let admin = generate_keypair();

        let payload = r#"{"text":"Tamper test"}"#;
        let encrypted = encrypt_note(payload, &author.public_key, &[admin.public_key.clone()]).unwrap();

        // Flip a bit in the encrypted content (after nonce)
        let mut content_bytes = hex::decode(&encrypted.encrypted_content).unwrap();
        if content_bytes.len() > 25 {
            content_bytes[25] ^= 0x01;
        }
        let tampered = hex::encode(&content_bytes);

        let result = decrypt_note(
            &tampered,
            &encrypted.author_envelope,
            &author.secret_key_hex,
        );
        assert!(result.is_err());
    }

    #[test]
    fn message_wrong_reader_fails() {
        let reader1 = generate_keypair();
        let reader2 = generate_keypair();
        let wrong_reader = generate_keypair();

        let encrypted = encrypt_message(
            "Secret message",
            &[reader1.public_key.clone(), reader2.public_key.clone()],
        ).unwrap();

        // Wrong reader's key won't match any envelope
        let result = decrypt_message(
            &encrypted.encrypted_content,
            &encrypted.reader_envelopes,
            &wrong_reader.secret_key_hex,
            &wrong_reader.public_key,
        );
        assert!(result.is_err());
    }

    #[test]
    fn draft_wrong_key_fails() {
        let author = generate_keypair();
        let wrong_key = generate_keypair();

        let encrypted = encrypt_draft("Draft content", &author.secret_key_hex).unwrap();
        let result = decrypt_draft(&encrypted, &wrong_key.secret_key_hex);
        assert!(result.is_err());
    }

    #[test]
    fn roundtrip_legacy_note() {
        let kp = generate_keypair();
        let payload = r#"{"text":"Legacy note content","customFields":{}}"#;

        // Encrypt with HKDF_CONTEXT_NOTES directly (simulating V1 encrypt)
        let sk_bytes = hex::decode(&kp.secret_key_hex).unwrap();
        let mut sk = [0u8; 32];
        sk.copy_from_slice(&sk_bytes);
        let key = derive_encryption_key(&sk, HKDF_CONTEXT_NOTES);
        let nonce_bytes = {
            let mut n = [0u8; 24];
            getrandom::getrandom(&mut n).expect("getrandom failed");
            n
        };
        let nonce = XNonce::from_slice(&nonce_bytes);
        let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
        let ciphertext = cipher.encrypt(nonce, payload.as_bytes()).unwrap();
        let mut packed = Vec::with_capacity(24 + ciphertext.len());
        packed.extend_from_slice(&nonce_bytes);
        packed.extend_from_slice(&ciphertext);
        let packed_hex = hex::encode(&packed);

        // Decrypt with the new function
        let decrypted = decrypt_legacy_note(&packed_hex, &kp.secret_key_hex).unwrap();
        assert_eq!(decrypted, payload);
    }

    #[test]
    fn roundtrip_export_encryption() {
        let kp = generate_keypair();
        let json = r#"{"notes":[{"id":"1","text":"test"}],"exportedAt":"2024-01-01"}"#;

        let encrypted = encrypt_export(json, &kp.secret_key_hex).unwrap();

        // Verify it's valid base64
        use base64::{Engine, engine::general_purpose::STANDARD};
        let decoded = STANDARD.decode(&encrypted).unwrap();
        assert!(decoded.len() > 24); // nonce + ciphertext

        // Decrypt manually to verify correctness
        let sk_bytes = hex::decode(&kp.secret_key_hex).unwrap();
        let mut sk = [0u8; 32];
        sk.copy_from_slice(&sk_bytes);
        let key = derive_encryption_key(&sk, HKDF_CONTEXT_EXPORT);
        let nonce = XNonce::from_slice(&decoded[..24]);
        let ciphertext = &decoded[24..];
        let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
        let plaintext = cipher.decrypt(nonce, ciphertext).unwrap();
        assert_eq!(String::from_utf8(plaintext).unwrap(), json);
    }
}
