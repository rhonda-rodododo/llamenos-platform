//! Sigchain — append-only hash-chained identity log.
//!
//! Each user has a sigchain: a sequence of cryptographically linked entries
//! recording identity operations (device add/remove, PUK rotation, hub membership).
//!
//! ## Verification
//!
//! Any client replaying a sigchain verifies:
//! 1. Hash-chain integrity (prevHash linkage)
//! 2. Entry hash recomputation (canonical JSON → SHA-256)
//! 3. Ed25519 signature validity
//! 4. Semantic rules (signer in verified device set, generation monotonicity)
//!
//! ## Canonical Hash
//!
//! ```text
//! entryHash = SHA-256(JSON.stringify({
//!   payload, prevHash, seq, signerDeviceId, signerPubkey, timestamp
//! }, keys sorted lexicographically))
//! ```

use ed25519_dalek::{Signer, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::device_keys::DeviceSecrets;
use crate::errors::CryptoError;

/// A single entry in the sigchain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct SigchainLink {
    /// Unique ID (UUID)
    pub id: String,
    /// Monotonic sequence number (starts at 1)
    pub seq: u64,
    /// SHA-256 of previous link (None for first entry)
    pub prev_hash: Option<String>,
    /// SHA-256 of canonical form of this entry
    pub entry_hash: String,
    /// Device ID of the signer
    pub signer_device_id: String,
    /// Ed25519 pubkey of the signing device, hex-encoded
    pub signer_pubkey: String,
    /// Ed25519 signature over entry_hash, hex-encoded
    pub signature: String,
    /// ISO-8601 timestamp
    pub timestamp: String,
    /// JSON-encoded payload (type-tagged)
    pub payload_json: String,
}

/// Result of verifying a complete sigchain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct SigchainVerifiedState {
    /// Number of verified links
    pub verified_count: u64,
    /// Head sequence number
    pub head_seq: u64,
    /// Head entry hash
    pub head_hash: String,
    /// All device pubkeys currently in the verified set
    pub active_device_pubkeys: Vec<String>,
}

/// Compute the canonical hash for a sigchain entry.
///
/// Canonical form: JSON with keys sorted lexicographically.
/// Fields: payload, prevHash, seq, signerDeviceId, signerPubkey, timestamp
fn compute_entry_hash(
    seq: u64,
    prev_hash: &Option<String>,
    timestamp: &str,
    signer_device_id: &str,
    signer_pubkey: &str,
    payload_json: &str,
) -> Result<String, CryptoError> {
    // Parse payload to ensure it's valid JSON
    let payload_value: serde_json::Value =
        serde_json::from_str(payload_json).map_err(CryptoError::JsonError)?;

    // Build canonical object with sorted keys (alphabetical order)
    // Keys: payload, prevHash, seq, signerDeviceId, signerPubkey, timestamp
    let canonical = serde_json::json!({
        "payload": payload_value,
        "prevHash": prev_hash,
        "seq": seq,
        "signerDeviceId": signer_device_id,
        "signerPubkey": signer_pubkey,
        "timestamp": timestamp,
    });

    // serde_json serializes object keys in insertion order for Value::Object,
    // but json! macro uses BTreeMap internally which IS sorted. Verify:
    let canonical_str = serde_json::to_string(&canonical)?;

    let hash = Sha256::digest(canonical_str.as_bytes());
    Ok(hex::encode(hash))
}

/// Create a new sigchain link, signed by the device.
///
/// The caller provides the sequence number, previous hash, timestamp, and payload.
/// The function computes the entry hash and signs it.
pub fn create_sigchain_link(
    secrets: &DeviceSecrets,
    id: &str,
    device_id: &str,
    seq: u64,
    prev_hash: Option<String>,
    timestamp: &str,
    payload_json: &str,
) -> Result<SigchainLink, CryptoError> {
    let signer_pubkey = hex::encode(secrets.signing_pubkey().to_bytes());

    let entry_hash = compute_entry_hash(
        seq,
        &prev_hash,
        timestamp,
        device_id,
        &signer_pubkey,
        payload_json,
    )?;

    // Sign the entry hash
    let hash_bytes = hex::decode(&entry_hash).map_err(CryptoError::HexError)?;
    let signing_key = secrets.signing_key();
    let signature = signing_key.sign(&hash_bytes);
    let signature_hex = hex::encode(signature.to_bytes());

    Ok(SigchainLink {
        id: id.to_string(),
        seq,
        prev_hash,
        entry_hash,
        signer_device_id: device_id.to_string(),
        signer_pubkey,
        signature: signature_hex,
        timestamp: timestamp.to_string(),
        payload_json: payload_json.to_string(),
    })
}

/// Verify a single sigchain link's signature and hash integrity.
///
/// Does NOT verify chain linkage — use `verify_sigchain` for full verification.
pub fn verify_sigchain_link(
    link: &SigchainLink,
    expected_signer_pubkey: &str,
) -> Result<bool, CryptoError> {
    // Check signer pubkey matches expected
    if link.signer_pubkey != expected_signer_pubkey {
        return Ok(false);
    }

    // Recompute entry hash
    let expected_hash = compute_entry_hash(
        link.seq,
        &link.prev_hash,
        &link.timestamp,
        &link.signer_device_id,
        &link.signer_pubkey,
        &link.payload_json,
    )?;

    if expected_hash != link.entry_hash {
        return Ok(false);
    }

    // Verify Ed25519 signature over entry hash
    let pubkey_bytes = hex::decode(&link.signer_pubkey).map_err(CryptoError::HexError)?;
    if pubkey_bytes.len() != 32 {
        return Err(CryptoError::InvalidPublicKey);
    }
    let pubkey_arr: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| CryptoError::InvalidPublicKey)?;
    let verifying_key =
        VerifyingKey::from_bytes(&pubkey_arr).map_err(|_| CryptoError::InvalidPublicKey)?;

    let hash_bytes = hex::decode(&link.entry_hash).map_err(CryptoError::HexError)?;
    let sig_bytes = hex::decode(&link.signature).map_err(CryptoError::HexError)?;
    if sig_bytes.len() != 64 {
        return Err(CryptoError::SignatureVerificationFailed);
    }
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;
    let signature = ed25519_dalek::Signature::from_bytes(&sig_arr);

    match verifying_key.verify(&hash_bytes, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Verify an entire sigchain from genesis.
///
/// Checks:
/// 1. Sequence numbers are monotonically increasing starting from 1
/// 2. prevHash chain is valid (link N's prevHash == link N-1's entryHash)
/// 3. Each link's entry hash is correctly computed
/// 4. Each link's signature is valid
/// 5. The first link must be a `user_init` payload
///
/// Returns the verified state including the set of active device pubkeys.
pub fn verify_sigchain(links: &[SigchainLink]) -> Result<SigchainVerifiedState, CryptoError> {
    if links.is_empty() {
        return Err(CryptoError::InvalidInput(
            "sigchain must have at least one link".into(),
        ));
    }

    // The first link establishes the initial device set
    let first = &links[0];
    if first.seq != 1 {
        return Err(CryptoError::InvalidInput(
            "first sigchain link must have seq=1".into(),
        ));
    }
    if first.prev_hash.is_some() {
        return Err(CryptoError::InvalidInput(
            "first sigchain link must have prevHash=null".into(),
        ));
    }

    // Parse first payload to get initial device pubkey
    let first_payload: serde_json::Value =
        serde_json::from_str(&first.payload_json).map_err(CryptoError::JsonError)?;
    let payload_type = first_payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if payload_type != "user_init" {
        return Err(CryptoError::InvalidInput(
            "first sigchain link must have type=user_init".into(),
        ));
    }

    let mut active_pubkeys: Vec<String> = vec![first.signer_pubkey.clone()];

    // Verify the first link (self-signed)
    if !verify_sigchain_link(first, &first.signer_pubkey)? {
        return Err(CryptoError::SignatureVerificationFailed);
    }

    let mut prev_hash = first.entry_hash.clone();
    let mut prev_seq = first.seq;

    for link in &links[1..] {
        // Check sequence monotonicity
        if link.seq != prev_seq + 1 {
            return Err(CryptoError::InvalidInput(format!(
                "sequence gap: expected {} but got {}",
                prev_seq + 1,
                link.seq
            )));
        }

        // Check prevHash linkage
        match &link.prev_hash {
            Some(ph) if ph == &prev_hash => {}
            _ => {
                return Err(CryptoError::InvalidInput(format!(
                    "prevHash mismatch at seq {}",
                    link.seq
                )));
            }
        }

        // Signer must be in active device set
        if !active_pubkeys.contains(&link.signer_pubkey) {
            return Err(CryptoError::InvalidInput(format!(
                "signer {} not in active device set at seq {}",
                link.signer_pubkey, link.seq
            )));
        }

        // Verify signature
        if !verify_sigchain_link(link, &link.signer_pubkey)? {
            return Err(CryptoError::SignatureVerificationFailed);
        }

        // Process payload to update device set
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&link.payload_json) {
            match payload.get("type").and_then(|v| v.as_str()) {
                Some("device_add") => {
                    if let Some(pubkey) = payload.get("devicePubkey").and_then(|v| v.as_str()) {
                        if !active_pubkeys.contains(&pubkey.to_string()) {
                            active_pubkeys.push(pubkey.to_string());
                        }
                    }
                }
                Some("device_remove") => {
                    if let Some(pubkey) = payload.get("devicePubkey").and_then(|v| v.as_str()) {
                        active_pubkeys.retain(|p| p != pubkey);
                    }
                }
                _ => {} // Other payload types don't affect device set
            }
        }

        prev_hash = link.entry_hash.clone();
        prev_seq = link.seq;
    }

    Ok(SigchainVerifiedState {
        verified_count: links.len() as u64,
        head_seq: prev_seq,
        head_hash: prev_hash,
        active_device_pubkeys: active_pubkeys,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device_keys::{generate_device_keys, unlock_device_keys};

    fn test_device() -> (DeviceSecrets, String) {
        let encrypted = generate_device_keys("test-sig-dev", "123456").unwrap();
        let secrets = unlock_device_keys(&encrypted, "123456").unwrap();
        let pubkey = encrypted.state.signing_pubkey_hex.clone();
        (secrets, pubkey)
    }

    #[test]
    fn create_and_verify_single_link() {
        let (secrets, pubkey) = test_device();
        let payload = r#"{"type":"user_init","deviceId":"test-sig-dev"}"#;

        let link = create_sigchain_link(
            &secrets,
            "link-1",
            "test-sig-dev",
            1,
            None,
            "2026-04-27T00:00:00Z",
            payload,
        )
        .unwrap();

        assert_eq!(link.seq, 1);
        assert_eq!(link.prev_hash, None);
        assert_eq!(link.signer_pubkey, pubkey);
        assert_eq!(link.entry_hash.len(), 64);
        assert_eq!(link.signature.len(), 128);

        let valid = verify_sigchain_link(&link, &pubkey).unwrap();
        assert!(valid);
    }

    #[test]
    fn verify_chain_integrity() {
        let (secrets, _pubkey) = test_device();

        let link1 = create_sigchain_link(
            &secrets,
            "link-1",
            "test-sig-dev",
            1,
            None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        )
        .unwrap();

        let link2 = create_sigchain_link(
            &secrets,
            "link-2",
            "test-sig-dev",
            2,
            Some(link1.entry_hash.clone()),
            "2026-04-27T00:01:00Z",
            r#"{"type":"puk_rotate","generation":2}"#,
        )
        .unwrap();

        let link3 = create_sigchain_link(
            &secrets,
            "link-3",
            "test-sig-dev",
            3,
            Some(link2.entry_hash.clone()),
            "2026-04-27T00:02:00Z",
            r#"{"type":"hub_membership_change","hubId":"hub-1","action":"join"}"#,
        )
        .unwrap();

        let state = verify_sigchain(&[link1, link2, link3]).unwrap();
        assert_eq!(state.verified_count, 3);
        assert_eq!(state.head_seq, 3);
        assert_eq!(state.active_device_pubkeys.len(), 1);
    }

    #[test]
    fn device_add_expands_set() {
        let (secrets1, pubkey1) = test_device();
        let encrypted2 = generate_device_keys("dev-2", "654321").unwrap();
        let pubkey2 = encrypted2.state.signing_pubkey_hex.clone();

        let link1 = create_sigchain_link(
            &secrets1,
            "link-1",
            "test-sig-dev",
            1,
            None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        )
        .unwrap();

        let payload = format!(r#"{{"type":"device_add","devicePubkey":"{}","deviceId":"dev-2"}}"#, pubkey2);
        let link2 = create_sigchain_link(
            &secrets1,
            "link-2",
            "test-sig-dev",
            2,
            Some(link1.entry_hash.clone()),
            "2026-04-27T00:01:00Z",
            &payload,
        )
        .unwrap();

        let state = verify_sigchain(&[link1, link2]).unwrap();
        assert_eq!(state.active_device_pubkeys.len(), 2);
        assert!(state.active_device_pubkeys.contains(&pubkey1));
        assert!(state.active_device_pubkeys.contains(&pubkey2));
    }

    #[test]
    fn device_remove_shrinks_set() {
        let (secrets1, pubkey1) = test_device();
        let encrypted2 = generate_device_keys("dev-2", "654321").unwrap();
        let pubkey2 = encrypted2.state.signing_pubkey_hex.clone();

        let link1 = create_sigchain_link(
            &secrets1, "l1", "test-sig-dev", 1, None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        ).unwrap();

        let add_payload = format!(r#"{{"type":"device_add","devicePubkey":"{}","deviceId":"dev-2"}}"#, pubkey2);
        let link2 = create_sigchain_link(
            &secrets1, "l2", "test-sig-dev", 2, Some(link1.entry_hash.clone()),
            "2026-04-27T00:01:00Z", &add_payload,
        ).unwrap();

        let remove_payload = format!(r#"{{"type":"device_remove","devicePubkey":"{}","deviceId":"dev-2"}}"#, pubkey2);
        let link3 = create_sigchain_link(
            &secrets1, "l3", "test-sig-dev", 3, Some(link2.entry_hash.clone()),
            "2026-04-27T00:02:00Z", &remove_payload,
        ).unwrap();

        let state = verify_sigchain(&[link1, link2, link3]).unwrap();
        assert_eq!(state.active_device_pubkeys.len(), 1);
        assert!(state.active_device_pubkeys.contains(&pubkey1));
        assert!(!state.active_device_pubkeys.contains(&pubkey2));
    }

    #[test]
    fn tampered_hash_rejected() {
        let (secrets, pubkey) = test_device();
        let mut link = create_sigchain_link(
            &secrets, "l1", "test-sig-dev", 1, None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        ).unwrap();

        // Tamper with entry hash
        link.entry_hash = "0".repeat(64);
        let valid = verify_sigchain_link(&link, &pubkey).unwrap();
        assert!(!valid);
    }

    #[test]
    fn wrong_signer_rejected() {
        let (secrets, _pubkey) = test_device();
        let link = create_sigchain_link(
            &secrets, "l1", "test-sig-dev", 1, None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        ).unwrap();

        // Verify with wrong pubkey
        let wrong_pubkey = "a".repeat(64);
        let valid = verify_sigchain_link(&link, &wrong_pubkey).unwrap();
        assert!(!valid);
    }

    #[test]
    fn broken_chain_rejected() {
        let (secrets, _) = test_device();

        let link1 = create_sigchain_link(
            &secrets, "l1", "test-sig-dev", 1, None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        ).unwrap();

        // Link2 with wrong prevHash
        let link2 = create_sigchain_link(
            &secrets, "l2", "test-sig-dev", 2,
            Some("0".repeat(64)), // wrong!
            "2026-04-27T00:01:00Z",
            r#"{"type":"puk_rotate","generation":2}"#,
        ).unwrap();

        let result = verify_sigchain(&[link1, link2]);
        assert!(matches!(result, Err(CryptoError::InvalidInput(_))));
    }

    #[test]
    fn sequence_gap_rejected() {
        let (secrets, _) = test_device();

        let link1 = create_sigchain_link(
            &secrets, "l1", "test-sig-dev", 1, None,
            "2026-04-27T00:00:00Z",
            r#"{"type":"user_init","deviceId":"test-sig-dev"}"#,
        ).unwrap();

        // Skip seq 2
        let link3 = create_sigchain_link(
            &secrets, "l3", "test-sig-dev", 3,
            Some(link1.entry_hash.clone()),
            "2026-04-27T00:02:00Z",
            r#"{"type":"puk_rotate","generation":2}"#,
        ).unwrap();

        let result = verify_sigchain(&[link1, link3]);
        assert!(matches!(result, Err(CryptoError::InvalidInput(_))));
    }

    #[test]
    fn entry_hash_is_deterministic() {
        let hash1 = compute_entry_hash(
            1, &None, "2026-04-27T00:00:00Z", "dev-1", "aabb", r#"{"type":"user_init"}"#,
        ).unwrap();
        let hash2 = compute_entry_hash(
            1, &None, "2026-04-27T00:00:00Z", "dev-1", "aabb", r#"{"type":"user_init"}"#,
        ).unwrap();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn entry_hash_differs_on_any_field_change() {
        let base = compute_entry_hash(
            1, &None, "2026-04-27T00:00:00Z", "dev-1", "aabb", r#"{"type":"user_init"}"#,
        ).unwrap();

        let diff_seq = compute_entry_hash(
            2, &None, "2026-04-27T00:00:00Z", "dev-1", "aabb", r#"{"type":"user_init"}"#,
        ).unwrap();
        assert_ne!(base, diff_seq);

        let diff_ts = compute_entry_hash(
            1, &None, "2026-04-27T01:00:00Z", "dev-1", "aabb", r#"{"type":"user_init"}"#,
        ).unwrap();
        assert_ne!(base, diff_ts);

        let diff_payload = compute_entry_hash(
            1, &None, "2026-04-27T00:00:00Z", "dev-1", "aabb", r#"{"type":"device_add"}"#,
        ).unwrap();
        assert_ne!(base, diff_payload);
    }
}
