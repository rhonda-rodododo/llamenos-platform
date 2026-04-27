//! Device provisioning encryption — ECDH + HKDF + XChaCha20-Poly1305.
//!
//! The nsec NEVER leaves the Rust process. The primary device performs:
//!   1. ECDH(primarySK, ephemeralPK) → shared_x
//!   2. HKDF(shared_x, LABEL_DEVICE_PROVISION) → symmetric key
//!   3. XChaCha20-Poly1305(nsec, symmetric_key) → ciphertext
//!   4. SAS = HKDF(shared_x, SAS_SALT, SAS_INFO) → 6-digit code
//!
//! The new device performs the inverse using its ephemeral SK and the primary's PK.
//!
//! Wire format: hex(nonce_24 + ciphertext)
//! SAS format: "XXX XXX" (6 digits, space-separated)

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use k256::{PublicKey, SecretKey};
use sha2::Sha256;
use zeroize::{Zeroize, Zeroizing};

use crate::errors::CryptoError;
use crate::labels::{LABEL_DEVICE_PROVISION, LABEL_PROVISIONING_SALT, SAS_INFO, SAS_SALT};

/// Result of encrypting the nsec for device provisioning.
/// Contains the encrypted payload and the SAS code for verification.
#[derive(Debug, Clone)]
pub struct ProvisioningResult {
    /// hex(nonce_24 + ciphertext) — the encrypted nsec bech32 string
    pub encrypted_hex: String,
    /// "XXX XXX" format 6-digit SAS code
    pub sas_code: String,
}

/// Result of decrypting a provisioned nsec.
/// Contains the nsec bech32 string and the SAS code for verification.
#[derive(Debug)]
pub struct DecryptionResult {
    /// The decrypted nsec bech32 string
    pub nsec: Zeroizing<String>,
    /// "XXX XXX" format 6-digit SAS code
    pub sas_code: String,
}

/// Parse a pubkey hex (x-only 32 bytes or compressed 33 bytes) into a k256 PublicKey.
fn parse_pubkey(pubkey_hex: &str) -> Result<PublicKey, CryptoError> {
    let bytes = hex::decode(pubkey_hex).map_err(CryptoError::HexError)?;
    match bytes.len() {
        32 => {
            // x-only: prepend 0x02 for even-y compressed
            let mut compressed = Vec::with_capacity(33);
            compressed.push(0x02);
            compressed.extend_from_slice(&bytes);
            PublicKey::from_sec1_bytes(&compressed).map_err(|_| CryptoError::InvalidPublicKey)
        }
        33 => {
            // already compressed SEC1
            PublicKey::from_sec1_bytes(&bytes).map_err(|_| CryptoError::InvalidPublicKey)
        }
        _ => Err(CryptoError::InvalidPublicKey),
    }
}

/// Compute ECDH shared x-coordinate between our secret key and their public key.
fn compute_shared_x(sk: &SecretKey, their_pk: &PublicKey) -> Result<[u8; 32], CryptoError> {
    use elliptic_curve::ecdh::SharedSecret;
    use k256::Secp256k1;

    let shared: SharedSecret<Secp256k1> =
        k256::ecdh::diffie_hellman(sk.to_nonzero_scalar(), their_pk.as_affine());
    let mut x = [0u8; 32];
    x.copy_from_slice(shared.raw_secret_bytes());
    Ok(x)
}

/// Derive the symmetric key for provisioning using HKDF-SHA256.
///
/// Uses PROVISIONING_HKDF_SALT and LABEL_DEVICE_PROVISION as the HKDF info parameter.
pub(crate) fn derive_provisioning_key(shared_x: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(LABEL_PROVISIONING_SALT.as_bytes()), shared_x);
    let mut okm = [0u8; 32];
    hk.expand(LABEL_DEVICE_PROVISION.as_bytes(), &mut okm)
        .expect("HKDF expand should not fail for 32-byte output");
    okm
}

/// Compute a 6-digit SAS code from the ECDH shared secret.
///
/// SAS = HKDF(ikm=shared_x, salt=SAS_SALT, info=SAS_INFO, len=4) → first 4 bytes → mod 1_000_000.
/// Returns formatted "XXX XXX" string.
fn compute_sas(shared_x: &[u8]) -> String {
    let hk = Hkdf::<Sha256>::new(Some(SAS_SALT.as_bytes()), shared_x);
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

/// Encrypt the nsec for a provisioning room. The nsec never leaves Rust.
///
/// Performs:
///   1. ECDH(primarySK, ephemeralPK) → shared_x
///   2. HKDF(shared_x, info=LABEL_DEVICE_PROVISION) → symmetric key
///   3. XChaCha20-Poly1305(nsec_bech32, symmetric_key) → ciphertext
///   4. SAS from shared_x
///
/// Returns (encrypted_hex, sas_code).
pub fn encrypt_nsec_for_provisioning(
    sk_bytes: &[u8],
    ephemeral_pubkey_hex: &str,
) -> Result<ProvisioningResult, CryptoError> {
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let secret_key =
        SecretKey::from_slice(sk_bytes).map_err(|_| CryptoError::InvalidSecretKey)?;
    let ephemeral_pk = parse_pubkey(ephemeral_pubkey_hex)?;

    // ECDH
    let mut shared_x = compute_shared_x(&secret_key, &ephemeral_pk)?;

    // Derive symmetric key using HKDF (not legacy SHA-256 concat)
    let mut symmetric_key = derive_provisioning_key(&shared_x);

    // Compute SAS before zeroing shared_x
    let sas_code = compute_sas(&shared_x);

    // Get the nsec bech32 from the secret key bytes
    let nsec = bech32::encode::<bech32::Bech32>(
        bech32::Hrp::parse("nsec").unwrap(),
        sk_bytes,
    )
    .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Encrypt nsec
    let mut nonce_bytes = [0u8; 24];
    getrandom::getrandom(&mut nonce_bytes).expect("getrandom failed");
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new_from_slice(&symmetric_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(nonce, nsec.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    // Zero sensitive material
    symmetric_key.zeroize();
    shared_x.zeroize();

    // Pack: nonce(24) + ciphertext
    let mut packed = Vec::with_capacity(24 + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    Ok(ProvisioningResult {
        encrypted_hex: hex::encode(&packed),
        sas_code,
    })
}

/// Decrypt a provisioned nsec received from the primary device.
///
/// Performs:
///   1. ECDH(ephemeralSK, primaryPK) → shared_x
///   2. HKDF(shared_x, info=LABEL_DEVICE_PROVISION) → symmetric key
///   3. Decrypt XChaCha20-Poly1305 → nsec bech32
///   4. SAS from shared_x (for verification display)
///
/// Returns (nsec_bech32, sas_code).
pub fn decrypt_provisioned_nsec(
    encrypted_hex: &str,
    primary_pubkey_hex: &str,
    ephemeral_sk_bytes: &[u8],
) -> Result<DecryptionResult, CryptoError> {
    if ephemeral_sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let ephemeral_sk =
        SecretKey::from_slice(ephemeral_sk_bytes).map_err(|_| CryptoError::InvalidSecretKey)?;
    let primary_pk = parse_pubkey(primary_pubkey_hex)?;

    // ECDH
    let mut shared_x = compute_shared_x(&ephemeral_sk, &primary_pk)?;

    // Derive symmetric key using HKDF
    let mut symmetric_key = derive_provisioning_key(&shared_x);

    // Compute SAS before zeroing shared_x
    let sas_code = compute_sas(&shared_x);

    // Decrypt
    let data = hex::decode(encrypted_hex).map_err(CryptoError::HexError)?;
    if data.len() < 24 {
        symmetric_key.zeroize();
        shared_x.zeroize();
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce = XNonce::from_slice(&data[..24]);
    let ciphertext = &data[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(&symmetric_key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    // Zero sensitive material
    symmetric_key.zeroize();
    shared_x.zeroize();

    let nsec =
        String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)?;

    Ok(DecryptionResult {
        nsec: Zeroizing::new(nsec),
        sas_code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    use rand::rngs::OsRng;

    /// CRIT-C3 integration test: encrypt_nsec_for_provisioning → decrypt_provisioned_nsec
    /// Both paths use the same HKDF KDF (derive_provisioning_key with PROVISIONING_HKDF_SALT).
    #[test]
    fn provisioning_round_trip_unified_kdf() {
        let primary_sk = SecretKey::random(&mut OsRng);
        let primary_pk = primary_sk.public_key();
        let primary_pk_encoded = primary_pk.to_encoded_point(true);
        let primary_pk_xonly = hex::encode(&primary_pk_encoded.as_bytes()[1..]);

        // New device generates ephemeral keypair
        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        // Primary encrypts nsec for provisioning
        let result = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();

        // New device decrypts using same HKDF path
        let decrypted = decrypt_provisioned_nsec(
            &result.encrypted_hex,
            &primary_pk_xonly,
            ephemeral_sk.to_bytes().as_slice(),
        )
        .unwrap();

        // Verify the nsec round-trips
        let expected_nsec = bech32::encode::<bech32::Bech32>(
            bech32::Hrp::parse("nsec").unwrap(),
            primary_sk.to_bytes().as_slice(),
        )
        .unwrap();
        assert_eq!(*decrypted.nsec, expected_nsec, "Recovered nsec must match original");
    }

    /// Negative: HKDF-encrypted ciphertext must not decrypt with SHA-256 concat KDF
    #[test]
    fn provisioning_kdf_mismatch_fails() {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };
        use sha2::{Digest, Sha256};

        let primary_sk = SecretKey::random(&mut OsRng);
        let primary_pk = primary_sk.public_key();

        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        // Encrypt using provisioning HKDF
        let result = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();

        // Compute shared_x the mobile way (ephemeral SK × primary PK)
        let shared_x = compute_shared_x(&ephemeral_sk, &primary_pk).unwrap();

        // Derive key with SHA-256 concat (wrong KDF)
        let mut hasher = Sha256::new();
        hasher.update(LABEL_DEVICE_PROVISION.as_bytes());
        hasher.update(&shared_x);
        let wrong_key: [u8; 32] = hasher.finalize().into();

        let data = hex::decode(&result.encrypted_hex).unwrap();
        let nonce = XNonce::from_slice(&data[..24]);
        let cipher = XChaCha20Poly1305::new_from_slice(&wrong_key).unwrap();
        let decrypt_result = cipher.decrypt(nonce, &data[24..]);
        assert!(
            decrypt_result.is_err(),
            "SHA-256 KDF must NOT decrypt HKDF-encrypted ciphertext"
        );
    }

    #[test]
    fn roundtrip_provisioning_encryption() {
        // Primary device has a persistent keypair
        let primary_sk = SecretKey::random(&mut OsRng);
        let primary_pk = primary_sk.public_key();
        let primary_pk_encoded = primary_pk.to_encoded_point(true);
        // x-only pubkey (32 bytes, 64 hex chars)
        let primary_pk_xonly = hex::encode(&primary_pk_encoded.as_bytes()[1..]);

        // New device generates an ephemeral keypair
        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        // Compressed pubkey (33 bytes, 66 hex chars)
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        // Primary encrypts its nsec for the new device
        let result = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();

        // New device decrypts
        let decrypted = decrypt_provisioned_nsec(
            &result.encrypted_hex,
            &primary_pk_xonly,
            ephemeral_sk.to_bytes().as_slice(),
        )
        .unwrap();

        // Verify the nsec round-trips
        let expected_nsec = bech32::encode::<bech32::Bech32>(
            bech32::Hrp::parse("nsec").unwrap(),
            primary_sk.to_bytes().as_slice(),
        )
        .unwrap();
        assert_eq!(*decrypted.nsec, expected_nsec);

        // SAS codes must match
        assert_eq!(result.sas_code, decrypted.sas_code);
        // SAS code format: "XXX XXX"
        assert_eq!(decrypted.sas_code.len(), 7);
        assert_eq!(&decrypted.sas_code[3..4], " ");
    }

    #[test]
    fn wrong_ephemeral_key_fails() {
        let primary_sk = SecretKey::random(&mut OsRng);

        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        let result = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();

        // Try decrypting with a different ephemeral key
        let wrong_sk = SecretKey::random(&mut OsRng);
        let primary_pk = primary_sk.public_key();
        let primary_pk_encoded = primary_pk.to_encoded_point(true);
        let primary_pk_xonly = hex::encode(&primary_pk_encoded.as_bytes()[1..]);

        let decrypted = decrypt_provisioned_nsec(
            &result.encrypted_hex,
            &primary_pk_xonly,
            wrong_sk.to_bytes().as_slice(),
        );
        assert!(decrypted.is_err());
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let primary_sk = SecretKey::random(&mut OsRng);
        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        let result = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();

        // Tamper with the ciphertext
        let mut bytes = hex::decode(&result.encrypted_hex).unwrap();
        if bytes.len() > 25 {
            bytes[25] ^= 0x01;
        }
        let tampered = hex::encode(&bytes);

        let primary_pk = primary_sk.public_key();
        let primary_pk_encoded = primary_pk.to_encoded_point(true);
        let primary_pk_xonly = hex::encode(&primary_pk_encoded.as_bytes()[1..]);

        let decrypted = decrypt_provisioned_nsec(
            &tampered,
            &primary_pk_xonly,
            ephemeral_sk.to_bytes().as_slice(),
        );
        assert!(decrypted.is_err());
    }

    #[test]
    fn x_only_pubkey_works() {
        let primary_sk = SecretKey::random(&mut OsRng);
        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        // Use x-only (32 bytes) instead of compressed (33 bytes)
        let ephemeral_pk_xonly = hex::encode(&ephemeral_pk_encoded.as_bytes()[1..]);

        let result = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_xonly,
        )
        .unwrap();

        let primary_pk = primary_sk.public_key();
        let primary_pk_encoded = primary_pk.to_encoded_point(true);
        let primary_pk_xonly = hex::encode(&primary_pk_encoded.as_bytes()[1..]);

        let decrypted = decrypt_provisioned_nsec(
            &result.encrypted_hex,
            &primary_pk_xonly,
            ephemeral_sk.to_bytes().as_slice(),
        )
        .unwrap();

        let expected_nsec = bech32::encode::<bech32::Bech32>(
            bech32::Hrp::parse("nsec").unwrap(),
            primary_sk.to_bytes().as_slice(),
        )
        .unwrap();
        assert_eq!(*decrypted.nsec, expected_nsec);
        assert_eq!(result.sas_code, decrypted.sas_code);
    }

    #[test]
    fn sas_is_deterministic() {
        let primary_sk = SecretKey::random(&mut OsRng);
        let ephemeral_sk = SecretKey::random(&mut OsRng);
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_encoded = ephemeral_pk.to_encoded_point(true);
        let ephemeral_pk_hex = hex::encode(ephemeral_pk_encoded.as_bytes());

        // Encrypt twice — SAS should be the same (deterministic from ECDH)
        let r1 = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();
        let r2 = encrypt_nsec_for_provisioning(
            primary_sk.to_bytes().as_slice(),
            &ephemeral_pk_hex,
        )
        .unwrap();

        assert_eq!(r1.sas_code, r2.sas_code);
        // But encrypted payloads differ (different random nonces)
        assert_ne!(r1.encrypted_hex, r2.encrypted_hex);
    }
}
