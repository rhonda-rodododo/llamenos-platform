//! Device provisioning encryption — X25519 ECDH + HKDF + AES-256-GCM.
//!
//! The signing seed NEVER leaves the Rust process. The primary device performs:
//!   1. X25519(primarySK, ephemeralPK) → shared_secret
//!   2. HKDF(shared_secret, LABEL_DEVICE_PROVISION) → symmetric key
//!   3. AES-256-GCM(seed_bytes, symmetric_key, aad=LABEL_DEVICE_PROVISION) → ciphertext
//!   4. SAS = HKDF(shared_secret, SAS_SALT, SAS_INFO) → 6-digit code
//!
//! The new device performs the inverse using its ephemeral SK and the primary's PK.
//!
//! Wire format: hex(nonce_12 + ciphertext + tag_16)
//! SAS format: "XXX XXX" (6 digits, space-separated)

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519StaticSecret};
use zeroize::{Zeroize, Zeroizing};

use crate::errors::CryptoError;
use crate::labels::{LABEL_DEVICE_PROVISION, LABEL_PROVISIONING_SALT, SAS_INFO, SAS_SALT};

/// Result of encrypting the signing seed for device provisioning.
/// Contains the encrypted payload and the SAS code for verification.
#[derive(Debug, Clone)]
pub struct ProvisioningResult {
    /// hex(nonce_12 + ciphertext + tag_16) — the encrypted seed bytes
    pub encrypted_hex: String,
    /// "XXX XXX" format 6-digit SAS code
    pub sas_code: String,
}

/// Result of decrypting a provisioned signing seed.
/// Contains the raw seed bytes and the SAS code for verification.
#[derive(Debug)]
pub struct DecryptionResult {
    /// The decrypted signing seed (32 raw bytes)
    pub seed: Zeroizing<Vec<u8>>,
    /// "XXX XXX" format 6-digit SAS code
    pub sas_code: String,
}

/// Parse an X25519 public key from hex (32 bytes / 64 hex chars).
fn parse_x25519_pubkey(pubkey_hex: &str) -> Result<X25519PublicKey, CryptoError> {
    let bytes = hex::decode(pubkey_hex).map_err(CryptoError::HexError)?;
    if bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(X25519PublicKey::from(arr))
}

/// Compute X25519 shared secret between our secret key and their public key.
fn compute_shared_secret(sk: &X25519StaticSecret, their_pk: &X25519PublicKey) -> [u8; 32] {
    let shared = sk.diffie_hellman(their_pk);
    *shared.as_bytes()
}

/// Derive the symmetric key for provisioning using HKDF-SHA256.
///
/// Uses PROVISIONING_HKDF_SALT and LABEL_DEVICE_PROVISION as the HKDF info parameter.
pub(crate) fn derive_provisioning_key(shared_secret: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(LABEL_PROVISIONING_SALT.as_bytes()), shared_secret);
    let mut okm = [0u8; 32];
    hk.expand(LABEL_DEVICE_PROVISION.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}

/// Compute a 6-digit SAS code from the shared secret.
///
/// SAS = HKDF(ikm=shared_secret, salt=SAS_SALT, info=SAS_INFO, len=4) → first 4 bytes → mod 1_000_000.
/// Returns formatted "XXX XXX" string.
fn compute_sas(shared_secret: &[u8]) -> String {
    let hk = Hkdf::<Sha256>::new(Some(SAS_SALT.as_bytes()), shared_secret);
    let mut sas_bytes = [0u8; 4];
    hk.expand(SAS_INFO.as_bytes(), &mut sas_bytes)
        .expect("HKDF expand should not fail for 4-byte output");
    let num = (sas_bytes[0] as u32) << 24
        | (sas_bytes[1] as u32) << 16
        | (sas_bytes[2] as u32) << 8
        | sas_bytes[3] as u32;
    let code = format!("{:06}", num % 1_000_000);
    format!("{} {}", &code[..3], &code[3..])
}

/// Encrypt the signing seed for a provisioning room. The seed never leaves Rust.
///
/// Performs:
///   1. X25519(primarySK, ephemeralPK) → shared_secret
///   2. HKDF(shared_secret, info=LABEL_DEVICE_PROVISION) → symmetric key
///   3. AES-256-GCM(seed_bytes, symmetric_key, aad=LABEL_DEVICE_PROVISION) → ciphertext
///   4. SAS from shared_secret
///
/// Returns (encrypted_hex, sas_code).
pub fn encrypt_seed_for_provisioning(
    sk_bytes: &[u8],
    ephemeral_pubkey_hex: &str,
) -> Result<ProvisioningResult, CryptoError> {
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let mut sk_arr = [0u8; 32];
    sk_arr.copy_from_slice(sk_bytes);
    let secret = X25519StaticSecret::from(sk_arr);
    let ephemeral_pk = parse_x25519_pubkey(ephemeral_pubkey_hex)?;

    // X25519 shared secret
    let mut shared = compute_shared_secret(&secret, &ephemeral_pk);

    // Derive symmetric key using HKDF
    let mut symmetric_key = derive_provisioning_key(&shared);

    // Compute SAS before zeroing shared secret
    let sas_code = compute_sas(&shared);

    // Encrypt raw seed bytes with AES-256-GCM
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).expect("getrandom failed");
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(&symmetric_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: sk_bytes,
                aad: LABEL_DEVICE_PROVISION.as_bytes(),
            },
        )
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Zero sensitive material
    symmetric_key.zeroize();
    shared.zeroize();
    sk_arr.zeroize();

    // Pack: nonce(12) + ciphertext + tag(16)
    let mut packed = Vec::with_capacity(12 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    Ok(ProvisioningResult {
        encrypted_hex: hex::encode(&packed),
        sas_code,
    })
}

/// Decrypt a provisioned signing seed received from the primary device.
///
/// Performs:
///   1. X25519(ephemeralSK, primaryPK) → shared_secret
///   2. HKDF(shared_secret, info=LABEL_DEVICE_PROVISION) → symmetric key
///   3. Decrypt AES-256-GCM → raw seed bytes
///   4. SAS from shared_secret (for verification display)
///
/// Returns (seed_bytes, sas_code).
pub fn decrypt_provisioned_seed(
    encrypted_hex: &str,
    primary_pubkey_hex: &str,
    ephemeral_sk_bytes: &[u8],
) -> Result<DecryptionResult, CryptoError> {
    if ephemeral_sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let mut sk_arr = [0u8; 32];
    sk_arr.copy_from_slice(ephemeral_sk_bytes);
    let ephemeral_secret = X25519StaticSecret::from(sk_arr);
    let primary_pk = parse_x25519_pubkey(primary_pubkey_hex)?;

    // X25519 shared secret
    let mut shared = compute_shared_secret(&ephemeral_secret, &primary_pk);

    // Derive symmetric key using HKDF
    let mut symmetric_key = derive_provisioning_key(&shared);

    // Compute SAS before zeroing shared secret
    let sas_code = compute_sas(&shared);

    // Decrypt
    let data = hex::decode(encrypted_hex).map_err(CryptoError::HexError)?;
    if data.len() < 28 {
        // 12 nonce + 16 tag minimum
        symmetric_key.zeroize();
        shared.zeroize();
        sk_arr.zeroize();
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = Nonce::from_slice(&data[..12]);

    let cipher = Aes256Gcm::new_from_slice(&symmetric_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(
            nonce,
            Payload {
                msg: &data[12..],
                aad: LABEL_DEVICE_PROVISION.as_bytes(),
            },
        )
        .map_err(|_| CryptoError::DecryptionFailed)?;

    // Zero sensitive material
    symmetric_key.zeroize();
    shared.zeroize();
    sk_arr.zeroize();

    if plaintext.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    Ok(DecryptionResult {
        seed: Zeroizing::new(plaintext),
        sas_code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hpke_envelope::generate_x25519_keypair;

    #[test]
    fn provisioning_round_trip() {
        let (primary_sk, primary_pk) = generate_x25519_keypair();
        let (ephemeral_sk, ephemeral_pk) = generate_x25519_keypair();

        let primary_sk_bytes = hex::decode(primary_sk.as_str()).unwrap();

        // Primary encrypts seed for provisioning
        let result = encrypt_seed_for_provisioning(&primary_sk_bytes, &ephemeral_pk).unwrap();

        // New device decrypts
        let ephemeral_sk_bytes = hex::decode(ephemeral_sk.as_str()).unwrap();
        let decrypted =
            decrypt_provisioned_seed(&result.encrypted_hex, &primary_pk, &ephemeral_sk_bytes)
                .unwrap();

        // Verify the raw seed bytes round-trip
        assert_eq!(
            decrypted.seed.as_slice(),
            primary_sk_bytes.as_slice(),
            "Recovered seed must match original"
        );

        // SAS codes must match
        assert_eq!(result.sas_code, decrypted.sas_code);
        // SAS code format: "XXX XXX"
        assert_eq!(decrypted.sas_code.len(), 7);
        assert_eq!(&decrypted.sas_code[3..4], " ");
    }

    #[test]
    fn wrong_ephemeral_key_fails() {
        let (primary_sk, _primary_pk) = generate_x25519_keypair();
        let (_ephemeral_sk, ephemeral_pk) = generate_x25519_keypair();
        let (wrong_sk, _wrong_pk) = generate_x25519_keypair();

        let primary_sk_bytes = hex::decode(primary_sk.as_str()).unwrap();
        let result = encrypt_seed_for_provisioning(&primary_sk_bytes, &ephemeral_pk).unwrap();

        // Derive primary pubkey for the decrypt side
        let primary_secret =
            X25519StaticSecret::from(<[u8; 32]>::try_from(primary_sk_bytes.as_slice()).unwrap());
        let primary_pubkey = X25519PublicKey::from(&primary_secret);
        let primary_pk_hex = hex::encode(primary_pubkey.as_bytes());

        // Try decrypting with wrong ephemeral key
        let wrong_sk_bytes = hex::decode(wrong_sk.as_str()).unwrap();
        let decrypted =
            decrypt_provisioned_seed(&result.encrypted_hex, &primary_pk_hex, &wrong_sk_bytes);
        assert!(decrypted.is_err());
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let (primary_sk, _primary_pk) = generate_x25519_keypair();
        let (ephemeral_sk, ephemeral_pk) = generate_x25519_keypair();

        let primary_sk_bytes = hex::decode(primary_sk.as_str()).unwrap();
        let result = encrypt_seed_for_provisioning(&primary_sk_bytes, &ephemeral_pk).unwrap();

        // Tamper with the ciphertext
        let mut bytes = hex::decode(&result.encrypted_hex).unwrap();
        if bytes.len() > 13 {
            bytes[13] ^= 0x01;
        }
        let tampered = hex::encode(&bytes);

        let primary_secret =
            X25519StaticSecret::from(<[u8; 32]>::try_from(primary_sk_bytes.as_slice()).unwrap());
        let primary_pubkey = X25519PublicKey::from(&primary_secret);
        let primary_pk_hex = hex::encode(primary_pubkey.as_bytes());

        let ephemeral_sk_bytes = hex::decode(ephemeral_sk.as_str()).unwrap();
        let decrypted = decrypt_provisioned_seed(&tampered, &primary_pk_hex, &ephemeral_sk_bytes);
        assert!(decrypted.is_err());
    }

    #[test]
    fn sas_is_deterministic() {
        let (primary_sk, _primary_pk) = generate_x25519_keypair();
        let (_ephemeral_sk, ephemeral_pk) = generate_x25519_keypair();

        let primary_sk_bytes = hex::decode(primary_sk.as_str()).unwrap();

        // Encrypt twice — SAS should be the same (deterministic from X25519)
        let r1 = encrypt_seed_for_provisioning(&primary_sk_bytes, &ephemeral_pk).unwrap();
        let r2 = encrypt_seed_for_provisioning(&primary_sk_bytes, &ephemeral_pk).unwrap();

        assert_eq!(r1.sas_code, r2.sas_code);
        // But encrypted payloads differ (different random nonces)
        assert_ne!(r1.encrypted_hex, r2.encrypted_hex);
    }
}
