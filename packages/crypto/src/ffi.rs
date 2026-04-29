//! FFI wrapper functions for UniFFI export.
//!
//! Provides hex-string boundaries for functions that use byte arrays (`[u8; 32]`),
//! and `Vec<T>` parameters for functions that use slices (`&[T]`).
//!
//! These are the only versions visible to Swift/Kotlin via UniFFI bindings.
//! The original functions remain available for direct Rust consumers (Tauri, WASM).

use crate::ecies::{
    ecies_decrypt_content, ecies_encrypt_content, ecies_unwrap_key, ecies_wrap_key,
    random_bytes_32, KeyEnvelope, RecipientKeyEnvelope,
};
use crate::encryption::{
    decrypt_call_record, decrypt_message, derive_kek_from_pin, encrypt_message, encrypt_note,
    EncryptedMessage, EncryptedNote,
};
use crate::errors::CryptoError;
use crate::labels::{SAS_INFO, SAS_SALT};
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
    decrypt_message(
        encrypted_content,
        &reader_envelopes,
        secret_key_hex,
        reader_pubkey,
    )
}

/// Decrypt a call record's encrypted metadata using the admin's envelope.
#[uniffi::export]
pub fn decrypt_call_record_for_reader(
    encrypted_content: &str,
    admin_envelopes: Vec<RecipientKeyEnvelope>,
    secret_key_hex: &str,
    reader_pubkey: &str,
) -> Result<String, CryptoError> {
    decrypt_call_record(
        encrypted_content,
        &admin_envelopes,
        secret_key_hex,
        reader_pubkey,
    )
}

/// Derive a 32-byte KEK from a PIN using PBKDF2-SHA256, returned as hex.
///
/// `salt_hex` is a hex-encoded salt (typically 16 bytes / 32 hex chars).
#[allow(dead_code)]
pub(crate) fn derive_kek_hex(pin: &str, salt_hex: &str) -> Result<String, CryptoError> {
    let salt = hex::decode(salt_hex).map_err(CryptoError::HexError)?;
    let mut kek = derive_kek_from_pin(pin, &salt);
    let hex = hex::encode(kek);
    kek.zeroize();
    Ok(hex)
}

/// Compute the ECDH shared x-coordinate for device provisioning.
///
/// `our_secret_hex`: 64-char hex secret key
/// `their_pubkey_hex`: 64-char hex x-only pubkey (or 66-char compressed)
///
/// Returns the 32-byte shared x-coordinate as hex, which can be used
/// for `decrypt_with_shared_key_hex` and `compute_sas_code`.
#[uniffi::export]
pub fn compute_shared_x_hex(
    our_secret_hex: &str,
    their_pubkey_hex: &str,
) -> Result<String, CryptoError> {
    use k256::{PublicKey, SecretKey};

    let sk_bytes = hex::decode(our_secret_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    let secret_key = SecretKey::from_slice(&sk_bytes).map_err(|_| CryptoError::InvalidSecretKey)?;

    // Accept x-only (32 bytes / 64 hex) or compressed (33 bytes / 66 hex)
    let compressed = if their_pubkey_hex.len() == 64 {
        let mut c = Vec::with_capacity(33);
        c.push(0x02);
        c.extend_from_slice(&hex::decode(their_pubkey_hex).map_err(CryptoError::HexError)?);
        c
    } else {
        hex::decode(their_pubkey_hex).map_err(CryptoError::HexError)?
    };

    let public_key =
        PublicKey::from_sec1_bytes(&compressed).map_err(|_| CryptoError::InvalidPublicKey)?;

    let shared_point: elliptic_curve::ecdh::SharedSecret<k256::Secp256k1> =
        k256::ecdh::diffie_hellman(secret_key.to_nonzero_scalar(), public_key.as_affine());
    let mut shared_x = [0u8; 32];
    shared_x.copy_from_slice(shared_point.raw_secret_bytes());
    let hex_out = hex::encode(shared_x);
    shared_x.zeroize();
    Ok(hex_out)
}

/// Decrypt data that was encrypted with a provisioning shared key.
///
/// `ciphertext_hex`: hex(nonce_24 + ciphertext) — XChaCha20-Poly1305
/// `shared_x_hex`: 64-char hex shared x-coordinate from `compute_shared_x_hex`
///
/// Derives the symmetric key via HKDF (matches provisioning.rs — CRIT-C3 fix).
#[uniffi::export]
pub fn decrypt_with_shared_key_hex(
    ciphertext_hex: &str,
    shared_x_hex: &str,
) -> Result<String, CryptoError> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };

    let shared_x = hex::decode(shared_x_hex).map_err(CryptoError::HexError)?;
    if shared_x.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    // Derive symmetric key via HKDF (matches provisioning.rs — CRIT-C3 fix)
    let mut symmetric_key = crate::provisioning::derive_provisioning_key(&shared_x);

    let data = hex::decode(ciphertext_hex).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&symmetric_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    symmetric_key.zeroize();
    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
}

/// Derive a 6-digit SAS (Short Authentication String) code from an ECDH shared secret.
///
/// `shared_x_hex`: 64-char hex shared x-coordinate from `compute_shared_x_hex`
///
/// Returns a "XXX XXX" formatted 6-digit code. Both devices compute this
/// independently — matching codes prove no MITM is present.
///
/// Uses the `hkdf` crate for proper HKDF (M25 — replaces manual HMAC HKDF).
#[uniffi::export]
pub fn compute_sas_code(shared_x_hex: &str) -> Result<String, CryptoError> {
    use hkdf::Hkdf;
    use sha2::Sha256;

    let shared_x = hex::decode(shared_x_hex).map_err(CryptoError::HexError)?;
    if shared_x.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    // HKDF-SHA256(ikm=shared_x, salt=SAS_SALT, info=SAS_INFO, length=4)
    let hk = Hkdf::<Sha256>::new(Some(SAS_SALT.as_bytes()), &shared_x);
    let mut okm = [0u8; 4];
    hk.expand(SAS_INFO.as_bytes(), &mut okm)
        .expect("HKDF 4-byte expand should not fail");

    let num =
        ((okm[0] as u32) << 24 | (okm[1] as u32) << 16 | (okm[2] as u32) << 8 | (okm[3] as u32))
            % 1_000_000;
    let code = format!("{:06}", num);
    Ok(format!("{} {}", &code[..3], &code[3..]))
}

/// Encrypt arbitrary content via ECIES for a recipient.
///
/// Returns `(packed_hex, ephemeral_pubkey_hex)`.
#[uniffi::export]
pub fn ecies_encrypt_content_hex(
    plaintext: &str,
    recipient_pubkey_hex: &str,
    label: &str,
) -> Result<Vec<String>, CryptoError> {
    let (packed_hex, ephemeral_hex) =
        ecies_encrypt_content(plaintext.as_bytes(), recipient_pubkey_hex, label)?;
    Ok(vec![packed_hex, ephemeral_hex])
}

/// Decrypt an ECIES-encrypted payload (arbitrary length content).
///
/// Supports both v2 (HKDF, version byte prefix) and v1 (legacy SHA-256) formats.
/// `packed_hex`: hex(version_byte? + nonce_24 + ciphertext)
/// `ephemeral_pubkey_hex`: compressed SEC1 (33 bytes / 66 hex chars)
/// `secret_key_hex`: recipient's secret key
/// `label`: domain separation label (e.g., LABEL_PUSH_WAKE)
#[uniffi::export]
pub fn ecies_decrypt_content_hex(
    packed_hex: &str,
    ephemeral_pubkey_hex: &str,
    secret_key_hex: &str,
    label: &str,
) -> Result<String, CryptoError> {
    ecies_decrypt_content(packed_hex, ephemeral_pubkey_hex, secret_key_hex, label)
}

/// Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
///
/// Input: hex(nonce_24 + ciphertext), 32-byte key as hex.
/// Output: decrypted UTF-8 string (JSON).
///
/// Used by mobile platforms to decrypt Nostr relay events encrypted
/// with the server event key (from GET /api/auth/me serverEventKeyHex).
#[uniffi::export]
pub fn decrypt_server_event_hex(encrypted_hex: &str, key_hex: &str) -> Result<String, CryptoError> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };

    let data = hex::decode(encrypted_hex).map_err(CryptoError::HexError)?;
    let key_bytes = hex::decode(key_hex).map_err(CryptoError::HexError)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }
    if data.len() < 40 {
        return Err(CryptoError::InvalidCiphertext);
    }

    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];
    let cipher = XChaCha20Poly1305::new_from_slice(&key_bytes)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
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
        let recovered =
            ecies_unwrap_key_hex(&envelope, &kp.secret_key_hex, LABEL_NOTE_KEY).unwrap();
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

    #[test]
    fn compute_shared_x_roundtrip() {
        let alice = generate_keypair();
        let bob = generate_keypair();

        let shared_ab = compute_shared_x_hex(&alice.secret_key_hex, &bob.public_key).unwrap();
        let shared_ba = compute_shared_x_hex(&bob.secret_key_hex, &alice.public_key).unwrap();
        assert_eq!(shared_ab, shared_ba);
        assert_eq!(shared_ab.len(), 64);
    }

    #[test]
    fn provisioning_encrypt_decrypt_roundtrip() {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };

        let alice = generate_keypair();
        let bob = generate_keypair();

        let shared_x_hex = compute_shared_x_hex(&alice.secret_key_hex, &bob.public_key).unwrap();
        let shared_x = hex::decode(&shared_x_hex).unwrap();

        // Encrypt with the shared key via HKDF (CRIT-C3: matches provisioning.rs)
        let symmetric_key = crate::provisioning::derive_provisioning_key(&shared_x);

        let plaintext = "this is the nsec to transfer";
        let mut nonce_bytes = [0u8; 24];
        getrandom::getrandom(&mut nonce_bytes).unwrap();
        let nonce = XNonce::from_slice(&nonce_bytes);
        let cipher = XChaCha20Poly1305::new_from_slice(&symmetric_key).unwrap();
        let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

        let mut packed = Vec::with_capacity(24 + ciphertext.len());
        packed.extend_from_slice(&nonce_bytes);
        packed.extend_from_slice(&ciphertext);
        let ciphertext_hex = hex::encode(&packed);

        // Decrypt with the other side's shared key
        let shared_x_bob = compute_shared_x_hex(&bob.secret_key_hex, &alice.public_key).unwrap();
        let decrypted = decrypt_with_shared_key_hex(&ciphertext_hex, &shared_x_bob).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn sas_code_format() {
        let alice = generate_keypair();
        let bob = generate_keypair();

        let shared_x = compute_shared_x_hex(&alice.secret_key_hex, &bob.public_key).unwrap();
        let sas = compute_sas_code(&shared_x).unwrap();

        // Should be "XXX XXX" format
        assert_eq!(sas.len(), 7);
        assert_eq!(&sas[3..4], " ");
        assert!(sas[..3].chars().all(|c| c.is_ascii_digit()));
        assert!(sas[4..].chars().all(|c| c.is_ascii_digit()));

        // Same input produces same output
        let sas2 = compute_sas_code(&shared_x).unwrap();
        assert_eq!(sas, sas2);

        // Both sides derive the same code
        let shared_x_bob = compute_shared_x_hex(&bob.secret_key_hex, &alice.public_key).unwrap();
        let sas_bob = compute_sas_code(&shared_x_bob).unwrap();
        assert_eq!(sas, sas_bob);
    }

    #[test]
    fn ecies_decrypt_content_via_ffi_v1_hard_fails() {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };
        use k256::{ecdh::EphemeralSecret, elliptic_curve::sec1::ToEncodedPoint};
        use rand::rngs::OsRng;
        use sha2::{Digest, Sha256};

        let recipient = generate_keypair();
        let label = crate::labels::LABEL_PUSH_WAKE;
        let content = r#"{"type":"call","callId":"abc123"}"#;

        // Construct v1-style ciphertext (no version byte) using SHA-256 KDF
        let ephemeral = EphemeralSecret::random(&mut OsRng);
        let ephemeral_pub = ephemeral.public_key();
        let compressed = {
            let mut c = vec![0x02u8];
            c.extend_from_slice(&hex::decode(&recipient.public_key).unwrap());
            c
        };
        let recipient_pk = k256::PublicKey::from_sec1_bytes(&compressed).unwrap();
        let shared_point = ephemeral.diffie_hellman(&recipient_pk);
        let mut shared_x = [0u8; 32];
        shared_x.copy_from_slice(shared_point.raw_secret_bytes());

        // v1 KDF: SHA-256(label || shared_x)
        let mut hasher = Sha256::new();
        hasher.update(label.as_bytes());
        hasher.update(&shared_x);
        let sym_key: [u8; 32] = hasher.finalize().into();

        let mut nonce_bytes = [0u8; 24];
        getrandom::getrandom(&mut nonce_bytes).unwrap();
        // Ensure first byte != 0x02 (ECIES_VERSION_V2) so the version
        // check fires deterministically instead of falling through to
        // decryption failure when the random nonce happens to start with 0x02.
        if nonce_bytes[0] == 0x02 {
            nonce_bytes[0] = 0x01;
        }
        let nonce = XNonce::from_slice(&nonce_bytes);
        let cipher = XChaCha20Poly1305::new_from_slice(&sym_key).unwrap();
        let ct = cipher.encrypt(nonce, content.as_bytes()).unwrap();

        // Pack WITHOUT version byte (v1 format)
        let mut packed = Vec::with_capacity(24 + ct.len());
        packed.extend_from_slice(&nonce_bytes);
        packed.extend_from_slice(&ct);
        let packed_hex = hex::encode(&packed);

        let eph_encoded = ephemeral_pub.to_encoded_point(true);
        let eph_hex = hex::encode(eph_encoded.as_bytes());

        let result =
            ecies_decrypt_content_hex(&packed_hex, &eph_hex, &recipient.secret_key_hex, label);
        assert!(
            matches!(result, Err(CryptoError::InvalidFormat(_))),
            "Expected v1 FFI content to hard-fail, got: {:?}",
            result
        );
    }

    #[test]
    fn ecies_decrypt_content_via_ffi_v2_roundtrip() {
        use crate::ecies::ecies_encrypt_content;
        use k256::SecretKey;
        use rand::rngs::OsRng;

        use k256::elliptic_curve::sec1::ToEncodedPoint;
        let sk = SecretKey::random(&mut OsRng);
        let pk = sk.public_key();
        let pk_encoded = pk.to_encoded_point(true);
        let xonly_hex = hex::encode(&pk_encoded.as_bytes()[1..]);
        let sk_hex = hex::encode(sk.to_bytes());

        let label = crate::labels::LABEL_PUSH_WAKE;
        let content = r#"{"type":"call","callId":"abc123"}"#;

        let (packed_hex, eph_hex) =
            ecies_encrypt_content(content.as_bytes(), &xonly_hex, label).unwrap();
        let decrypted = ecies_decrypt_content_hex(&packed_hex, &eph_hex, &sk_hex, label).unwrap();
        assert_eq!(decrypted, content);
    }

    #[test]
    fn roundtrip_server_event_decrypt() {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };

        let key = random_bytes_32();
        let key_hex = hex::encode(&key);

        let plaintext = r#"{"type":"call:ring","callId":"abc123"}"#;
        let mut nonce_bytes = [0u8; 24];
        getrandom::getrandom(&mut nonce_bytes).unwrap();
        let nonce = XNonce::from_slice(&nonce_bytes);
        let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
        let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

        let mut packed = Vec::with_capacity(24 + ciphertext.len());
        packed.extend_from_slice(&nonce_bytes);
        packed.extend_from_slice(&ciphertext);
        let encrypted_hex = hex::encode(&packed);

        let decrypted = decrypt_server_event_hex(&encrypted_hex, &key_hex).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn server_event_decrypt_wrong_key_fails() {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };

        let key = random_bytes_32();
        let wrong_key = random_bytes_32();

        let plaintext = r#"{"type":"call:ring"}"#;
        let mut nonce_bytes = [0u8; 24];
        getrandom::getrandom(&mut nonce_bytes).unwrap();
        let nonce = XNonce::from_slice(&nonce_bytes);
        let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
        let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

        let mut packed = Vec::with_capacity(24 + ciphertext.len());
        packed.extend_from_slice(&nonce_bytes);
        packed.extend_from_slice(&ciphertext);
        let encrypted_hex = hex::encode(&packed);

        let result = decrypt_server_event_hex(&encrypted_hex, &hex::encode(wrong_key));
        assert!(result.is_err());
    }

    #[test]
    fn server_event_decrypt_too_short_fails() {
        let key_hex = hex::encode(random_bytes_32());
        let short_hex = hex::encode([0u8; 30]);
        let result = decrypt_server_event_hex(&short_hex, &key_hex);
        assert!(result.is_err());
    }
}
