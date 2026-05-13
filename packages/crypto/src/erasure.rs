//! Erasure override and device wipe signature operations.
//!
//! ## Erasure Override Co-Approver Signature
//!
//! When a user requests emergency erasure override, a co-approver (a different admin)
//! signs `(targetUserId || timestamp || justification)` with their device Ed25519 key.
//! The label `LABEL_ERASURE_OVERRIDE_SIG` is prepended for domain separation.
//!
//! ## Device Wipe Command Signature
//!
//! The server signs `(targetDevicePubkey || timestamp || reason)` with the server's
//! Ed25519 key using `LABEL_DEVICE_WIPE_SIG` as domain separation. Clients verify
//! this signature before executing a wipe to prevent forged wipe attacks.

use crate::device_keys::{sign_bytes, verify_signature, DeviceSecrets};
use crate::errors::CryptoError;
use crate::labels::{LABEL_DEVICE_WIPE_SIG, LABEL_ERASURE_OVERRIDE_SIG};

/// Build the canonical message for an erasure override co-approver signature.
///
/// Format: `{LABEL_ERASURE_OVERRIDE_SIG}:{target_user_id}:{timestamp_ms}:{justification}`
///
/// All fields are UTF-8 encoded. The label prefix ensures domain separation —
/// this signature cannot be replayed in any other context.
pub fn build_erasure_override_message(
    target_user_id: &str,
    timestamp_ms: u64,
    justification: &str,
) -> Vec<u8> {
    format!(
        "{}:{}:{}:{}",
        LABEL_ERASURE_OVERRIDE_SIG, target_user_id, timestamp_ms, justification
    )
    .into_bytes()
}

/// Sign an erasure override as a co-approver using Ed25519 device secrets.
///
/// Returns the 64-byte Ed25519 signature as a `Vec<u8>`.
pub fn sign_erasure_override(
    secrets: &DeviceSecrets,
    target_user_id: &str,
    timestamp_ms: u64,
    justification: &str,
) -> Vec<u8> {
    let message = build_erasure_override_message(target_user_id, timestamp_ms, justification);
    sign_bytes(secrets, &message)
}

/// Verify an erasure override co-approver signature.
///
/// - `signature_bytes`: the 64-byte Ed25519 signature
/// - `co_approver_pubkey_hex`: the co-approver's Ed25519 verifying key (hex-encoded)
/// - `target_user_id`: the user being erased
/// - `timestamp_ms`: the timestamp in the signed message
/// - `justification`: the justification text in the signed message
/// - `current_timestamp_ms`: current time for staleness check
/// - `max_age_ms`: maximum allowed age of the signature in milliseconds
///
/// Returns `Ok(())` if valid, `Err(CryptoError::InvalidSignature)` if invalid,
/// `Err(CryptoError::StaleTimestamp)` if the signature is too old.
pub fn verify_erasure_override(
    signature_bytes: &[u8],
    co_approver_pubkey_hex: &str,
    target_user_id: &str,
    timestamp_ms: u64,
    justification: &str,
    current_timestamp_ms: u64,
    max_age_ms: u64,
) -> Result<(), CryptoError> {
    if current_timestamp_ms.saturating_sub(timestamp_ms) > max_age_ms {
        return Err(CryptoError::StaleTimestamp);
    }

    let message = build_erasure_override_message(target_user_id, timestamp_ms, justification);
    let valid = verify_signature(&message, signature_bytes, co_approver_pubkey_hex)?;
    if !valid {
        return Err(CryptoError::InvalidSignature);
    }
    Ok(())
}

/// Build the canonical message for a device wipe command signature.
///
/// Format: `{LABEL_DEVICE_WIPE_SIG}:{target_device_pubkey}:{timestamp_ms}:{reason}`
///
/// Signed by the server's Ed25519 key. Clients verify before executing wipe.
pub fn build_device_wipe_message(
    target_device_pubkey: &str,
    timestamp_ms: u64,
    reason: &str,
) -> Vec<u8> {
    format!(
        "{}:{}:{}:{}",
        LABEL_DEVICE_WIPE_SIG, target_device_pubkey, timestamp_ms, reason
    )
    .into_bytes()
}

/// Sign a device wipe command using the server's Ed25519 key.
///
/// - `server_secrets`: the server's Ed25519 device secrets (signing key)
/// - `target_device_pubkey`: the target device's Ed25519 pubkey (hex)
/// - `timestamp_ms`: current timestamp in milliseconds
/// - `reason`: wipe reason (`"user-erasure"`, `"device-revocation"`, `"admin-erasure"`)
///
/// Returns the 64-byte Ed25519 signature as a `Vec<u8>`.
pub fn sign_device_wipe(
    server_secrets: &DeviceSecrets,
    target_device_pubkey: &str,
    timestamp_ms: u64,
    reason: &str,
) -> Vec<u8> {
    let message = build_device_wipe_message(target_device_pubkey, timestamp_ms, reason);
    sign_bytes(server_secrets, &message)
}

/// Verify a device wipe command signature from the server.
///
/// - `signature_bytes`: the 64-byte Ed25519 signature
/// - `server_pubkey_hex`: the server's Ed25519 verifying key (hex-encoded)
/// - `target_device_pubkey`: the target device's pubkey (hex)
/// - `timestamp_ms`: timestamp from the wipe command
/// - `reason`: reason from the wipe command
///
/// Returns `Ok(())` if valid, `Err(CryptoError::InvalidSignature)` if invalid.
pub fn verify_device_wipe(
    signature_bytes: &[u8],
    server_pubkey_hex: &str,
    target_device_pubkey: &str,
    timestamp_ms: u64,
    reason: &str,
) -> Result<(), CryptoError> {
    let message = build_device_wipe_message(target_device_pubkey, timestamp_ms, reason);
    let valid = verify_signature(&message, signature_bytes, server_pubkey_hex)?;
    if !valid {
        return Err(CryptoError::InvalidSignature);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device_keys::{generate_device_keys, unlock_device_keys};

    fn test_secrets(device_id: &str) -> (DeviceSecrets, String) {
        let encrypted = generate_device_keys(device_id, "12345678").unwrap();
        let pubkey = encrypted.state.signing_pubkey_hex.clone();
        let secrets = unlock_device_keys(&encrypted, "12345678").unwrap();
        (secrets, pubkey)
    }

    const FRESH_TS: u64 = 1708900000000;
    const MAX_AGE: u64 = 300_000; // 5 minutes

    // --- Erasure Override Tests ---

    #[test]
    fn erasure_override_sign_verify_roundtrip() {
        let (secrets, pubkey) = test_secrets("co-approver-1");
        let target = "user-to-erase-abc";
        let justification = "User requested emergency erasure due to safety concern";

        let sig = sign_erasure_override(&secrets, target, FRESH_TS, justification);
        assert_eq!(sig.len(), 64);

        verify_erasure_override(
            &sig,
            &pubkey,
            target,
            FRESH_TS,
            justification,
            FRESH_TS,
            MAX_AGE,
        )
        .unwrap();
    }

    #[test]
    fn erasure_override_wrong_target_fails() {
        let (secrets, pubkey) = test_secrets("co-approver-2");
        let justification = "Safety concern";

        let sig = sign_erasure_override(&secrets, "user-A", FRESH_TS, justification);

        let result = verify_erasure_override(
            &sig,
            &pubkey,
            "user-B",
            FRESH_TS,
            justification,
            FRESH_TS,
            MAX_AGE,
        );
        assert!(
            matches!(result, Err(CryptoError::InvalidSignature)),
            "different target must fail verification"
        );
    }

    #[test]
    fn erasure_override_wrong_timestamp_fails() {
        let (secrets, pubkey) = test_secrets("co-approver-3");
        let target = "user-X";
        let justification = "Reason";

        let sig = sign_erasure_override(&secrets, target, 1000, justification);

        let result =
            verify_erasure_override(&sig, &pubkey, target, 2000, justification, 2000, MAX_AGE);
        assert!(
            matches!(result, Err(CryptoError::InvalidSignature)),
            "different timestamp must fail verification"
        );
    }

    #[test]
    fn erasure_override_wrong_justification_fails() {
        let (secrets, pubkey) = test_secrets("co-approver-4");
        let target = "user-Y";

        let sig = sign_erasure_override(&secrets, target, FRESH_TS, "original reason");

        let result = verify_erasure_override(
            &sig,
            &pubkey,
            target,
            FRESH_TS,
            "tampered reason",
            FRESH_TS,
            MAX_AGE,
        );
        assert!(
            matches!(result, Err(CryptoError::InvalidSignature)),
            "different justification must fail verification"
        );
    }

    #[test]
    fn erasure_override_wrong_pubkey_fails() {
        let (secrets, _pubkey) = test_secrets("co-approver-5");
        let (_, other_pubkey) = test_secrets("other-admin");
        let target = "user-Z";
        let justification = "Reason";

        let sig = sign_erasure_override(&secrets, target, FRESH_TS, justification);

        let result = verify_erasure_override(
            &sig,
            &other_pubkey,
            target,
            FRESH_TS,
            justification,
            FRESH_TS,
            MAX_AGE,
        );
        assert!(
            matches!(result, Err(CryptoError::InvalidSignature)),
            "wrong co-approver pubkey must fail verification"
        );
    }

    #[test]
    fn erasure_override_tampered_signature_fails() {
        let (secrets, pubkey) = test_secrets("co-approver-6");
        let target = "user-W";
        let justification = "Reason";

        let mut sig = sign_erasure_override(&secrets, target, FRESH_TS, justification);
        sig[0] ^= 0x01; // flip one bit

        let result = verify_erasure_override(
            &sig,
            &pubkey,
            target,
            FRESH_TS,
            justification,
            FRESH_TS,
            MAX_AGE,
        );
        assert!(
            matches!(result, Err(CryptoError::InvalidSignature)),
            "tampered signature must fail verification"
        );
    }

    #[test]
    fn erasure_override_message_format() {
        let msg = build_erasure_override_message("user-123", 1708900000000, "safety concern");
        let expected = format!(
            "{}:user-123:1708900000000:safety concern",
            LABEL_ERASURE_OVERRIDE_SIG
        );
        assert_eq!(msg, expected.as_bytes());
    }

    #[test]
    fn erasure_override_stale_timestamp_rejected() {
        let (secrets, pubkey) = test_secrets("co-approver-stale");
        let target = "user-stale";
        let justification = "Reason";
        let old_ts = 1000;
        let now = old_ts + MAX_AGE + 1; // just past max age

        let sig = sign_erasure_override(&secrets, target, old_ts, justification);

        let result =
            verify_erasure_override(&sig, &pubkey, target, old_ts, justification, now, MAX_AGE);
        assert!(
            matches!(result, Err(CryptoError::StaleTimestamp)),
            "stale timestamp must be rejected"
        );
    }

    #[test]
    fn erasure_override_at_max_age_boundary_accepted() {
        let (secrets, pubkey) = test_secrets("co-approver-boundary");
        let target = "user-boundary";
        let justification = "Reason";
        let old_ts = 1000;
        let now = old_ts + MAX_AGE; // exactly at max age

        let sig = sign_erasure_override(&secrets, target, old_ts, justification);

        verify_erasure_override(&sig, &pubkey, target, old_ts, justification, now, MAX_AGE)
            .unwrap();
    }

    // --- Device Wipe Tests ---

    #[test]
    fn device_wipe_sign_verify_roundtrip() {
        let (server_secrets, server_pubkey) = test_secrets("server-key");
        let target_device = "aa".repeat(32); // 64 hex chars
        let reason = "user-erasure";

        let sig = sign_device_wipe(&server_secrets, &target_device, FRESH_TS, reason);
        assert_eq!(sig.len(), 64);

        verify_device_wipe(&sig, &server_pubkey, &target_device, FRESH_TS, reason).unwrap();
    }

    #[test]
    fn device_wipe_wrong_target_fails() {
        let (server_secrets, server_pubkey) = test_secrets("server-key-2");
        let reason = "admin-erasure";

        let sig = sign_device_wipe(&server_secrets, &"aa".repeat(32), FRESH_TS, reason);

        let result = verify_device_wipe(&sig, &server_pubkey, &"bb".repeat(32), FRESH_TS, reason);
        assert!(matches!(result, Err(CryptoError::InvalidSignature)));
    }

    #[test]
    fn device_wipe_wrong_reason_fails() {
        let (server_secrets, server_pubkey) = test_secrets("server-key-3");
        let target = "cc".repeat(32);

        let sig = sign_device_wipe(&server_secrets, &target, FRESH_TS, "user-erasure");

        let result =
            verify_device_wipe(&sig, &server_pubkey, &target, FRESH_TS, "device-revocation");
        assert!(matches!(result, Err(CryptoError::InvalidSignature)));
    }

    #[test]
    fn device_wipe_wrong_timestamp_fails() {
        let (server_secrets, server_pubkey) = test_secrets("server-key-4");
        let target = "dd".repeat(32);
        let reason = "user-erasure";

        let sig = sign_device_wipe(&server_secrets, &target, 1000, reason);

        let result = verify_device_wipe(&sig, &server_pubkey, &target, 2000, reason);
        assert!(matches!(result, Err(CryptoError::InvalidSignature)));
    }

    #[test]
    fn device_wipe_wrong_server_key_fails() {
        let (server_secrets, _server_pubkey) = test_secrets("server-key-5");
        let (_, other_pubkey) = test_secrets("impersonator");
        let target = "ee".repeat(32);
        let reason = "admin-erasure";

        let sig = sign_device_wipe(&server_secrets, &target, FRESH_TS, reason);

        let result = verify_device_wipe(&sig, &other_pubkey, &target, FRESH_TS, reason);
        assert!(
            matches!(result, Err(CryptoError::InvalidSignature)),
            "wrong server key must fail — prevents forged wipe attacks"
        );
    }

    #[test]
    fn device_wipe_message_format() {
        let msg = build_device_wipe_message("deadbeef", 1708900000000, "device-revocation");
        let expected = format!(
            "{}:deadbeef:1708900000000:device-revocation",
            LABEL_DEVICE_WIPE_SIG
        );
        assert_eq!(msg, expected.as_bytes());
    }

    #[test]
    fn device_wipe_all_three_reasons() {
        let (server_secrets, server_pubkey) = test_secrets("server-key-6");
        let target = "ff".repeat(32);

        for reason in &["user-erasure", "device-revocation", "admin-erasure"] {
            let sig = sign_device_wipe(&server_secrets, &target, FRESH_TS, reason);
            verify_device_wipe(&sig, &server_pubkey, &target, FRESH_TS, reason)
                .unwrap_or_else(|_| panic!("reason '{reason}' should verify"));
        }
    }

    #[test]
    fn device_wipe_tampered_signature_fails() {
        let (server_secrets, server_pubkey) = test_secrets("server-key-7");
        let target = "ab".repeat(32);
        let reason = "user-erasure";

        let mut sig = sign_device_wipe(&server_secrets, &target, FRESH_TS, reason);
        sig[31] ^= 0xFF;

        let result = verify_device_wipe(&sig, &server_pubkey, &target, FRESH_TS, reason);
        assert!(matches!(result, Err(CryptoError::InvalidSignature)));
    }
}
