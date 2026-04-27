//! Ed25519 signature authentication.
//!
//! Auth token format:
//! ```json
//! {
//!   "pubkey": "<ed25519 verifying key hex>",
//!   "sig": "<ed25519 signature hex>",
//!   "ts": <unix timestamp ms>,
//!   "method": "GET",
//!   "path": "/api/..."
//! }
//! ```
//!
//! Signed message: `SHA-256("llamenos:device-auth:v1:" + timestamp + ":" + method + ":" + path)`

use ed25519_dalek::{Signer, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::device_keys::DeviceSecrets;
use crate::errors::CryptoError;
use crate::labels::LABEL_DEVICE_AUTH;

/// A signed Ed25519 authentication token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct AuthToken {
    pub pubkey: String,
    pub timestamp: u64,
    pub token: String,
}

/// Build the auth message bytes: SHA-256("llamenos:device-auth:v1:" + ts + ":" + method + ":" + path)
fn build_auth_message(timestamp: u64, method: &str, path: &str) -> [u8; 32] {
    let message = format!("{LABEL_DEVICE_AUTH}:{timestamp}:{method}:{path}");
    let hash = Sha256::digest(message.as_bytes());
    let mut out = [0u8; 32];
    out.copy_from_slice(&hash);
    out
}

/// Create an Ed25519 auth token using device secrets.
///
/// The message is bound to the specific request method + path to prevent
/// cross-endpoint replay attacks.
pub fn create_auth_token(
    secrets: &DeviceSecrets,
    timestamp: u64,
    method: &str,
    path: &str,
) -> Result<AuthToken, CryptoError> {
    let signing_key = secrets.signing_key();
    let pubkey_hex = hex::encode(signing_key.verifying_key().to_bytes());

    let message_hash = build_auth_message(timestamp, method, path);
    let signature = signing_key.sign(&message_hash);
    let token_hex = hex::encode(signature.to_bytes());

    Ok(AuthToken {
        pubkey: pubkey_hex,
        timestamp,
        token: token_hex,
    })
}

/// Create an Ed25519 auth token from raw signing key bytes.
///
/// Used by FFI and stateless callers that don't have a DeviceSecrets struct.
pub fn create_auth_token_from_signing_key(
    signing_key_hex: &str,
    timestamp: u64,
    method: &str,
    path: &str,
) -> Result<AuthToken, CryptoError> {
    use zeroize::Zeroizing;

    let sk_bytes = Zeroizing::new(hex::decode(signing_key_hex).map_err(CryptoError::HexError)?);
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let sk_arr = Zeroizing::new(
        <[u8; 32]>::try_from(sk_bytes.as_slice()).map_err(|_| CryptoError::InvalidSecretKey)?,
    );
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&sk_arr);
    let pubkey_hex = hex::encode(signing_key.verifying_key().to_bytes());

    let message_hash = build_auth_message(timestamp, method, path);
    let signature = signing_key.sign(&message_hash);
    let token_hex = hex::encode(signature.to_bytes());

    Ok(AuthToken {
        pubkey: pubkey_hex,
        timestamp,
        token: token_hex,
    })
}

/// Verify an Ed25519 auth token with timestamp-based expiry.
///
/// Rejects tokens older than `max_age_ms` or more than 30s in the future.
/// Use `max_age_ms: 300_000` (5 minutes) for standard API authentication.
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

/// Verify an Ed25519 auth token.
///
/// Returns true if the signature is valid for the given method + path.
pub fn verify_auth_token(token: &AuthToken, method: &str, path: &str) -> Result<bool, CryptoError> {
    let pubkey_bytes = hex::decode(&token.pubkey).map_err(CryptoError::HexError)?;
    if pubkey_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }

    let pubkey_arr: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| CryptoError::InvalidPublicKey)?;
    let verifying_key =
        VerifyingKey::from_bytes(&pubkey_arr).map_err(|_| CryptoError::InvalidPublicKey)?;

    let message_hash = build_auth_message(token.timestamp, method, path);

    let sig_bytes = hex::decode(&token.token).map_err(CryptoError::HexError)?;
    if sig_bytes.len() != 64 {
        return Err(CryptoError::SignatureVerificationFailed);
    }

    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;
    let signature = ed25519_dalek::Signature::from_bytes(&sig_arr);

    match verifying_key.verify(&message_hash, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Verify a raw Ed25519 signature over a message.
pub fn verify_ed25519(
    message: &[u8],
    signature_hex: &str,
    pubkey_hex: &str,
) -> Result<bool, CryptoError> {
    let pubkey_bytes = hex::decode(pubkey_hex).map_err(CryptoError::HexError)?;
    if pubkey_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }

    let pubkey_arr: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| CryptoError::InvalidPublicKey)?;
    let verifying_key =
        VerifyingKey::from_bytes(&pubkey_arr).map_err(|_| CryptoError::InvalidPublicKey)?;

    let sig_bytes = hex::decode(signature_hex).map_err(CryptoError::HexError)?;
    if sig_bytes.len() != 64 {
        return Err(CryptoError::SignatureVerificationFailed);
    }

    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;
    let signature = ed25519_dalek::Signature::from_bytes(&sig_arr);

    match verifying_key.verify(message, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device_keys::generate_device_keys;
    use crate::device_keys::unlock_device_keys;

    fn test_secrets() -> DeviceSecrets {
        let encrypted = generate_device_keys("test-auth-dev", "123456").unwrap();
        unlock_device_keys(&encrypted, "123456").unwrap()
    }

    #[test]
    fn roundtrip_auth_token() {
        let secrets = test_secrets();
        let timestamp = 1708900000000u64;
        let method = "POST";
        let path = "/api/auth/login";

        let token = create_auth_token(&secrets, timestamp, method, path).unwrap();
        assert_eq!(
            token.pubkey,
            hex::encode(secrets.signing_pubkey().to_bytes())
        );
        assert_eq!(token.timestamp, timestamp);

        let valid = verify_auth_token(&token, method, path).unwrap();
        assert!(valid);
    }

    #[test]
    fn roundtrip_from_signing_key() {
        let secrets = test_secrets();
        let sk_hex = hex::encode(secrets.signing_seed);

        let token =
            create_auth_token_from_signing_key(&sk_hex, 1708900000000, "GET", "/api/test").unwrap();
        let valid = verify_auth_token(&token, "GET", "/api/test").unwrap();
        assert!(valid);
    }

    #[test]
    fn wrong_path_fails() {
        let secrets = test_secrets();
        let token = create_auth_token(&secrets, 1708900000000, "POST", "/api/auth/login").unwrap();
        let valid = verify_auth_token(&token, "POST", "/api/notes").unwrap();
        assert!(!valid);
    }

    #[test]
    fn wrong_method_fails() {
        let secrets = test_secrets();
        let token = create_auth_token(&secrets, 1708900000000, "POST", "/api/auth/login").unwrap();
        let valid = verify_auth_token(&token, "GET", "/api/auth/login").unwrap();
        assert!(!valid);
    }

    #[test]
    fn verify_with_expiry_rejects_old_token() {
        let secrets = test_secrets();
        let old_timestamp = 1000000u64;
        let now = old_timestamp + 400_000;
        let token = create_auth_token(&secrets, old_timestamp, "GET", "/api/test").unwrap();
        let valid =
            verify_auth_token_with_expiry(&token, "GET", "/api/test", now, 300_000).unwrap();
        assert!(!valid);
    }

    #[test]
    fn verify_with_expiry_rejects_future_token() {
        let secrets = test_secrets();
        let future_timestamp = 2000000u64;
        let now = 1000000u64;
        let token = create_auth_token(&secrets, future_timestamp, "GET", "/api/test").unwrap();
        let valid =
            verify_auth_token_with_expiry(&token, "GET", "/api/test", now, 300_000).unwrap();
        assert!(!valid);
    }

    #[test]
    fn verify_with_expiry_accepts_recent_token() {
        let secrets = test_secrets();
        let now = 1708900000000u64;
        let token = create_auth_token(&secrets, now - 60_000, "GET", "/api/test").unwrap();
        let valid =
            verify_auth_token_with_expiry(&token, "GET", "/api/test", now, 300_000).unwrap();
        assert!(valid);
    }

    #[test]
    fn verify_ed25519_raw() {
        let secrets = test_secrets();
        let message = b"raw message to verify";
        let sig = crate::device_keys::sign_bytes(&secrets, message);
        let pubkey_hex = hex::encode(secrets.signing_pubkey().to_bytes());
        let sig_hex = hex::encode(&sig);

        let valid = verify_ed25519(message, &sig_hex, &pubkey_hex).unwrap();
        assert!(valid);

        let valid = verify_ed25519(b"wrong message", &sig_hex, &pubkey_hex).unwrap();
        assert!(!valid);
    }

    #[test]
    fn malformed_token_rejected() {
        let short_token = AuthToken {
            pubkey: "a".repeat(64),
            timestamp: 1708900000000,
            token: "abcd".to_string(),
        };
        let result = verify_auth_token(&short_token, "GET", "/api/notes");
        assert!(result.is_err() || matches!(result, Ok(false)));

        let nonhex_token = AuthToken {
            pubkey: "a".repeat(64),
            timestamp: 1708900000000,
            token: "zzzz".repeat(32),
        };
        let result = verify_auth_token(&nonhex_token, "GET", "/api/notes");
        assert!(result.is_err());
    }
}
