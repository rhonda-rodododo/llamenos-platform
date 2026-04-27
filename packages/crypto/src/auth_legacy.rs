//! BIP-340 Schnorr signature authentication.
//!
//! Auth token format: `{"pubkey":"hex","timestamp":number,"token":"hex_signature"}`
//! Message format: `llamenos:auth:{pubkey}:{timestamp}:{method}:{path}`
//! Signature: BIP-340 Schnorr over SHA-256(message)

use k256::ecdsa::signature::hazmat::{PrehashSigner, PrehashVerifier};
use k256::schnorr::{SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroize;

use crate::errors::CryptoError;
use crate::labels::AUTH_PREFIX;

/// A signed authentication token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct AuthToken {
    pub pubkey: String,
    pub timestamp: u64,
    pub token: String,
}

/// Create a Schnorr auth token for API authentication.
///
/// The message is bound to the specific request method + path to prevent
/// cross-endpoint replay attacks.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn create_auth_token(
    secret_key_hex: &str,
    timestamp: u64,
    method: &str,
    path: &str,
) -> Result<AuthToken, CryptoError> {
    let mut sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let signing_key =
        SigningKey::from_bytes(sk_bytes.as_slice()).map_err(|_| CryptoError::InvalidSecretKey)?;
    let verifying_key = signing_key.verifying_key();
    let pubkey_hex = hex::encode(verifying_key.to_bytes());

    // Build message: llamenos:auth:{pubkey}:{timestamp}:{method}:{path}
    let message = format!("{AUTH_PREFIX}{pubkey_hex}:{timestamp}:{method}:{path}");
    let message_hash = {
        let mut hasher = Sha256::new();
        hasher.update(message.as_bytes());
        hasher.finalize()
    };

    // Sign pre-hashed message with BIP-340 Schnorr.
    // Using sign_prehash because we already SHA-256'd the message ourselves.
    // The Signer::sign() trait would double-hash (SHA-256 internally), breaking
    // interop with @noble/curves which expects single SHA-256 + BIP-340.
    let signature: k256::schnorr::Signature = signing_key
        .sign_prehash(&message_hash)
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;
    let token_hex = hex::encode(signature.to_bytes());

    sk_bytes.zeroize();

    Ok(AuthToken {
        pubkey: pubkey_hex,
        timestamp,
        token: token_hex,
    })
}

/// Verify a Schnorr auth token with timestamp-based expiry.
///
/// Rejects tokens older than `max_age_ms` or more than 30s in the future.
/// Use `max_age_ms: 300_000` (5 minutes) for standard API authentication.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn verify_auth_token_with_expiry(
    token: &AuthToken,
    method: &str,
    path: &str,
    now_ms: u64,
    max_age_ms: u64,
) -> Result<bool, CryptoError> {
    let age = now_ms.saturating_sub(token.timestamp);
    if age > max_age_ms {
        return Ok(false);
    }
    // Reject tokens from the future (>30s clock skew)
    if token.timestamp > now_ms + 30_000 {
        return Ok(false);
    }
    verify_auth_token(token, method, path)
}

/// Verify a Schnorr auth token.
///
/// Returns true if the signature is valid for the given method + path.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn verify_auth_token(token: &AuthToken, method: &str, path: &str) -> Result<bool, CryptoError> {
    let pubkey_bytes = hex::decode(&token.pubkey).map_err(CryptoError::HexError)?;
    if pubkey_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }

    let verifying_key = VerifyingKey::from_bytes(pubkey_bytes.as_slice())
        .map_err(|_| CryptoError::InvalidPublicKey)?;

    let message = format!(
        "{AUTH_PREFIX}{}:{}:{}:{}",
        token.pubkey, token.timestamp, method, path
    );
    let message_hash = {
        let mut hasher = Sha256::new();
        hasher.update(message.as_bytes());
        hasher.finalize()
    };

    let sig_bytes = hex::decode(&token.token).map_err(CryptoError::HexError)?;
    if sig_bytes.len() != 64 {
        return Err(CryptoError::SignatureVerificationFailed);
    }

    let signature = k256::schnorr::Signature::try_from(sig_bytes.as_slice())
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;

    // Use verify_prehash since we already SHA-256'd the message.
    // Must match sign_prehash used in create_auth_token.
    match verifying_key.verify_prehash(&message_hash, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Verify a raw Schnorr signature over a pre-hashed message.
///
/// The message must be exactly 32 bytes (SHA-256 hash) for BIP-340 compliance.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn verify_schnorr(
    message_hex: &str,
    signature_hex: &str,
    pubkey_hex: &str,
) -> Result<bool, CryptoError> {
    let pubkey_bytes = hex::decode(pubkey_hex).map_err(CryptoError::HexError)?;
    if pubkey_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }

    let verifying_key = VerifyingKey::from_bytes(pubkey_bytes.as_slice())
        .map_err(|_| CryptoError::InvalidPublicKey)?;

    let message = hex::decode(message_hex).map_err(CryptoError::HexError)?;
    if message.len() != 32 {
        return Err(CryptoError::InvalidInput(
            "Schnorr message must be exactly 32 bytes (SHA-256 hash)".into(),
        ));
    }

    let sig_bytes = hex::decode(signature_hex).map_err(CryptoError::HexError)?;

    let signature = k256::schnorr::Signature::try_from(sig_bytes.as_slice())
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;

    match verifying_key.verify_prehash(&message, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    #[test]
    fn roundtrip_auth_token() {
        let kp = generate_keypair();
        let timestamp = 1708900000000u64;
        let method = "POST";
        let path = "/api/auth/login";

        let token = create_auth_token(&kp.secret_key_hex, timestamp, method, path).unwrap();
        assert_eq!(token.pubkey, kp.public_key);
        assert_eq!(token.timestamp, timestamp);

        let valid = verify_auth_token(&token, method, path).unwrap();
        assert!(valid);
    }

    #[test]
    fn wrong_path_fails() {
        let kp = generate_keypair();
        let token = create_auth_token(&kp.secret_key_hex, 1708900000000, "POST", "/api/auth/login")
            .unwrap();

        let valid = verify_auth_token(&token, "POST", "/api/notes").unwrap();
        assert!(!valid);
    }

    #[test]
    fn wrong_method_fails() {
        let kp = generate_keypair();
        let token = create_auth_token(&kp.secret_key_hex, 1708900000000, "POST", "/api/auth/login")
            .unwrap();

        let valid = verify_auth_token(&token, "GET", "/api/auth/login").unwrap();
        assert!(!valid);
    }

    #[test]
    fn verify_with_expiry_rejects_old_token() {
        let kp = generate_keypair();
        let old_timestamp = 1000000u64;
        let now = 1000000u64 + 400_000; // 400 seconds later (> 5 min)
        let token =
            create_auth_token(&kp.secret_key_hex, old_timestamp, "GET", "/api/test").unwrap();

        let valid =
            verify_auth_token_with_expiry(&token, "GET", "/api/test", now, 300_000).unwrap();
        assert!(!valid);
    }

    #[test]
    fn verify_with_expiry_rejects_future_token() {
        let kp = generate_keypair();
        let future_timestamp = 2000000u64;
        let now = 1000000u64; // way before the token
        let token =
            create_auth_token(&kp.secret_key_hex, future_timestamp, "GET", "/api/test").unwrap();

        let valid =
            verify_auth_token_with_expiry(&token, "GET", "/api/test", now, 300_000).unwrap();
        assert!(!valid);
    }

    #[test]
    fn verify_with_expiry_accepts_recent_token() {
        let kp = generate_keypair();
        let now = 1708900000000u64;
        let token =
            create_auth_token(&kp.secret_key_hex, now - 60_000, "GET", "/api/test").unwrap();

        let valid =
            verify_auth_token_with_expiry(&token, "GET", "/api/test", now, 300_000).unwrap();
        assert!(valid);
    }

    #[test]
    fn verify_schnorr_rejects_non_32_byte_message() {
        let kp = generate_keypair();
        // 16 bytes = 32 hex chars (not 32 bytes)
        let short_message = hex::encode(&[0xABu8; 16]);
        let sig = "ff".repeat(64);
        let result = verify_schnorr(&short_message, &sig, &kp.public_key);
        assert!(matches!(result, Err(CryptoError::InvalidInput(_))));
    }

    #[test]
    fn malformed_token_rejected() {
        // Too-short signature
        let short_token = AuthToken {
            pubkey: "a".repeat(64),
            timestamp: 1708900000000,
            token: "abcd".to_string(), // way too short
        };
        let result = verify_auth_token(&short_token, "GET", "/api/notes");
        assert!(result.is_err() || matches!(result, Ok(false)));

        // Non-hex characters
        let nonhex_token = AuthToken {
            pubkey: "a".repeat(64),
            timestamp: 1708900000000,
            token: "zzzz".repeat(32), // not valid hex
        };
        let result = verify_auth_token(&nonhex_token, "GET", "/api/notes");
        assert!(result.is_err());

        // Random 64 bytes (valid format but random signature)
        let random_token = AuthToken {
            pubkey: "a".repeat(64),
            timestamp: 1708900000000,
            token: "ff".repeat(64),
        };
        let result = verify_auth_token(&random_token, "GET", "/api/notes");
        assert!(result.is_err() || matches!(result, Ok(false)));
    }
}
