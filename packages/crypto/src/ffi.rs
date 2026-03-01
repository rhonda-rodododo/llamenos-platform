//! FFI wrapper functions for UniFFI export.
//!
//! Provides hex-string boundaries for functions that use byte arrays (`[u8; 32]`),
//! and `Vec<T>` parameters for functions that use slices (`&[T]`).
//!
//! These are the only versions visible to Swift/Kotlin via UniFFI bindings.
//! The original functions remain available for direct Rust consumers (Tauri, WASM).

use crate::ecies::{ecies_unwrap_key, ecies_wrap_key, random_bytes_32, KeyEnvelope, RecipientKeyEnvelope};
use crate::encryption::{
    decrypt_call_record, decrypt_message, derive_kek_from_pin, encrypt_message, encrypt_note,
    EncryptedMessage, EncryptedNote,
};
use crate::errors::CryptoError;
use zeroize::Zeroize;

/// Generate 32 random bytes, returned as a hex string.
#[uniffi::export]
pub fn random_bytes_hex() -> String {
    hex::encode(random_bytes_32())
}

/// Wrap a 32-byte symmetric key (hex) for a recipient using ECIES.
///
/// The `key_hex` parameter is a 64-char hex string encoding 32 bytes.
#[uniffi::export]
pub fn ecies_wrap_key_hex(
    key_hex: &str,
    recipient_pubkey_hex: &str,
    label: &str,
) -> Result<KeyEnvelope, CryptoError> {
    let key_bytes = hex::decode(key_hex).map_err(CryptoError::HexError)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let result = ecies_wrap_key(&key, recipient_pubkey_hex, label);
    key.zeroize();
    result
}

/// Unwrap a 32-byte symmetric key from an ECIES envelope, returned as hex.
#[uniffi::export]
pub fn ecies_unwrap_key_hex(
    envelope: &KeyEnvelope,
    secret_key_hex: &str,
    label: &str,
) -> Result<String, CryptoError> {
    let mut key = ecies_unwrap_key(envelope, secret_key_hex, label)?;
    let hex = hex::encode(key);
    key.zeroize();
    Ok(hex)
}

/// Encrypt a note with a random per-note key, wrapped for the author and all admins.
#[uniffi::export]
pub fn encrypt_note_for_recipients(
    payload_json: &str,
    author_pubkey: &str,
    admin_pubkeys: Vec<String>,
) -> Result<EncryptedNote, CryptoError> {
    encrypt_note(payload_json, author_pubkey, &admin_pubkeys)
}

/// Encrypt a message for multiple readers using the envelope pattern.
#[uniffi::export]
pub fn encrypt_message_for_readers(
    plaintext: &str,
    reader_pubkeys: Vec<String>,
) -> Result<EncryptedMessage, CryptoError> {
    encrypt_message(plaintext, &reader_pubkeys)
}

/// Decrypt a message using the reader's envelope from the list.
#[uniffi::export]
pub fn decrypt_message_for_reader(
    encrypted_content: &str,
    reader_envelopes: Vec<RecipientKeyEnvelope>,
    secret_key_hex: &str,
    reader_pubkey: &str,
) -> Result<String, CryptoError> {
    decrypt_message(encrypted_content, &reader_envelopes, secret_key_hex, reader_pubkey)
}

/// Decrypt a call record's encrypted metadata using the admin's envelope.
#[uniffi::export]
pub fn decrypt_call_record_for_reader(
    encrypted_content: &str,
    admin_envelopes: Vec<RecipientKeyEnvelope>,
    secret_key_hex: &str,
    reader_pubkey: &str,
) -> Result<String, CryptoError> {
    decrypt_call_record(encrypted_content, &admin_envelopes, secret_key_hex, reader_pubkey)
}

/// Derive a 32-byte KEK from a PIN using PBKDF2-SHA256, returned as hex.
///
/// `salt_hex` is a hex-encoded salt (typically 16 bytes / 32 hex chars).
#[uniffi::export]
pub fn derive_kek_hex(pin: &str, salt_hex: &str) -> Result<String, CryptoError> {
    let salt = hex::decode(salt_hex).map_err(CryptoError::HexError)?;
    let mut kek = derive_kek_from_pin(pin, &salt);
    let hex = hex::encode(kek);
    kek.zeroize();
    Ok(hex)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;
    use crate::labels::LABEL_NOTE_KEY;

    #[test]
    fn roundtrip_ecies_hex() {
        let kp = generate_keypair();
        let key_hex = random_bytes_hex();
        assert_eq!(key_hex.len(), 64);

        let envelope = ecies_wrap_key_hex(&key_hex, &kp.public_key, LABEL_NOTE_KEY).unwrap();
        let recovered = ecies_unwrap_key_hex(&envelope, &kp.secret_key_hex, LABEL_NOTE_KEY).unwrap();
        assert_eq!(key_hex, recovered);
    }

    #[test]
    fn encrypt_note_via_ffi() {
        let author = generate_keypair();
        let admin = generate_keypair();
        let payload = r#"{"text":"FFI test note"}"#;

        let encrypted = encrypt_note_for_recipients(
            payload,
            &author.public_key,
            vec![admin.public_key.clone()],
        )
        .unwrap();

        // Author can decrypt
        let decrypted = crate::encryption::decrypt_note(
            &encrypted.encrypted_content,
            &encrypted.author_envelope,
            &author.secret_key_hex,
        )
        .unwrap();
        assert_eq!(decrypted, payload);
    }

    #[test]
    fn encrypt_message_via_ffi() {
        let reader1 = generate_keypair();
        let reader2 = generate_keypair();
        let plaintext = "FFI message test";

        let encrypted = encrypt_message_for_readers(
            plaintext,
            vec![reader1.public_key.clone(), reader2.public_key.clone()],
        )
        .unwrap();

        let decrypted = decrypt_message_for_reader(
            &encrypted.encrypted_content,
            encrypted.reader_envelopes,
            &reader1.secret_key_hex,
            &reader1.public_key,
        )
        .unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn derive_kek_via_ffi() {
        let salt_hex = hex::encode([0xABu8; 16]);
        let result = derive_kek_hex("1234", &salt_hex).unwrap();
        assert_eq!(result.len(), 64); // 32 bytes = 64 hex chars

        // Same input should produce same output (deterministic)
        let result2 = derive_kek_hex("1234", &salt_hex).unwrap();
        assert_eq!(result, result2);

        // Different PIN should produce different output
        let result3 = derive_kek_hex("5678", &salt_hex).unwrap();
        assert_ne!(result, result3);
    }

    #[test]
    fn random_bytes_unique() {
        let a = random_bytes_hex();
        let b = random_bytes_hex();
        assert_ne!(a, b);
        assert_eq!(a.len(), 64);
    }
}
