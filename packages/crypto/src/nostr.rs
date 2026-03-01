//! Nostr event signing — produces events compatible with nostr-tools/pure::finalizeEvent.
//!
//! Implements NIP-01 canonical JSON serialization and BIP-340 Schnorr signing.
//!
//! Canonical JSON format: `[0, <pubkey>, <created_at>, <kind>, <tags>, <content>]`
//! Event ID: SHA-256 of the canonical JSON string (UTF-8 encoded)
//! Signature: BIP-340 Schnorr over the 32-byte event ID hash

use k256::schnorr::SigningKey;
use k256::ecdsa::signature::hazmat::PrehashSigner;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroize;

use crate::errors::CryptoError;

/// A signed Nostr event (NIP-01 compliant).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedNostrEvent {
    /// 64-char hex (SHA-256 of canonical JSON)
    pub id: String,
    /// 32-byte x-only pubkey hex
    pub pubkey: String,
    /// Unix seconds
    pub created_at: u64,
    pub kind: u32,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    /// 64-byte BIP-340 signature hex
    pub sig: String,
}

/// Sign a Nostr event template. Computes the event ID (SHA-256 of canonical
/// serialization per NIP-01) and signs with BIP-340 Schnorr.
///
/// The canonical JSON is: `[0, pubkey, created_at, kind, tags, content]`
pub fn finalize_nostr_event(
    kind: u32,
    created_at: u64,
    tags: Vec<Vec<String>>,
    content: &str,
    secret_key_hex: &str,
) -> Result<SignedNostrEvent, CryptoError> {
    let mut sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let signing_key = SigningKey::from_bytes(sk_bytes.as_slice())
        .map_err(|_| CryptoError::InvalidSecretKey)?;
    let pubkey = hex::encode(signing_key.verifying_key().to_bytes());

    // Canonical serialization per NIP-01:
    // [0, <pubkey>, <created_at>, <kind>, <tags>, <content>]
    let canonical = serde_json::to_string(&serde_json::json!([
        0,
        &pubkey,
        created_at,
        kind,
        &tags,
        content,
    ]))?;

    // Event ID = SHA-256(canonical JSON UTF-8)
    let id_hash = Sha256::digest(canonical.as_bytes());
    let id = hex::encode(id_hash);

    // Sign the pre-hashed 32-byte event ID with BIP-340 Schnorr.
    // Using sign_prehash because id_hash is already SHA-256'd.
    // Signer::sign() would double-hash, breaking interop with @noble/curves.
    let signature: k256::schnorr::Signature = signing_key
        .sign_prehash(&id_hash)
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;
    let sig = hex::encode(signature.to_bytes());

    sk_bytes.zeroize();

    Ok(SignedNostrEvent {
        id,
        pubkey,
        created_at,
        kind,
        tags,
        content: content.to_string(),
        sig,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use k256::schnorr::VerifyingKey;
    use k256::ecdsa::signature::hazmat::PrehashVerifier;

    #[test]
    fn test_nostr_event_signing_nip01() {
        // Known test key
        let sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let event = finalize_nostr_event(
            20001,
            1700000000,
            vec![
                vec!["d".into(), "test-hub".into()],
                vec!["t".into(), "llamenos:event".into()],
            ],
            "encrypted-content-here",
            sk,
        )
        .unwrap();

        assert_eq!(event.kind, 20001);
        assert_eq!(event.created_at, 1700000000);
        assert_eq!(event.content, "encrypted-content-here");
        assert_eq!(event.id.len(), 64); // hex SHA-256
        assert_eq!(event.sig.len(), 128); // hex BIP-340 (64 bytes)

        // Verify the event ID is the SHA-256 of the canonical JSON
        let canonical = serde_json::to_string(&serde_json::json!([
            0,
            &event.pubkey,
            event.created_at,
            event.kind,
            &event.tags,
            &event.content,
        ]))
        .unwrap();
        let expected_id = hex::encode(Sha256::digest(canonical.as_bytes()));
        assert_eq!(event.id, expected_id);

        // Verify signature with the public key
        let pk_bytes = hex::decode(&event.pubkey).unwrap();
        let verifying_key =
            VerifyingKey::from_bytes(pk_bytes.as_slice().try_into().unwrap()).unwrap();
        let sig_bytes = hex::decode(&event.sig).unwrap();
        let signature = k256::schnorr::Signature::try_from(sig_bytes.as_slice()).unwrap();
        let id_bytes = hex::decode(&event.id).unwrap();
        verifying_key.verify_prehash(&id_bytes, &signature).unwrap();
    }

    #[test]
    fn test_canonical_json_format() {
        // Verify the canonical JSON matches NIP-01 spec exactly
        let canonical = serde_json::to_string(&serde_json::json!([
            0,
            "abc123",
            1700000000u64,
            20001u32,
            [["d", "hub"], ["t", "llamenos:event"]],
            "content",
        ]))
        .unwrap();
        // Must be compact JSON (serde_json::to_string, not to_string_pretty)
        assert_eq!(
            canonical,
            r#"[0,"abc123",1700000000,20001,[["d","hub"],["t","llamenos:event"]],"content"]"#
        );
    }

    #[test]
    fn test_deterministic_event_id() {
        // Same inputs must produce same event ID (signature may differ due to randomized nonce)
        let sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let event1 = finalize_nostr_event(1, 1000, vec![], "test", sk).unwrap();
        let event2 = finalize_nostr_event(1, 1000, vec![], "test", sk).unwrap();
        assert_eq!(event1.id, event2.id);
        assert_eq!(event1.pubkey, event2.pubkey);
    }

    #[test]
    fn test_different_content_different_id() {
        let sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let event1 = finalize_nostr_event(1, 1000, vec![], "test1", sk).unwrap();
        let event2 = finalize_nostr_event(1, 1000, vec![], "test2", sk).unwrap();
        assert_ne!(event1.id, event2.id);
    }

    #[test]
    fn tampered_content_invalidates_id() {
        let sk = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let event = finalize_nostr_event(20001, 1700000000, vec![], "original content", sk).unwrap();

        // Tamper the content and recompute canonical JSON
        let tampered_canonical = serde_json::to_string(&serde_json::json!([
            0,
            &event.pubkey,
            event.created_at,
            event.kind,
            &event.tags,
            "tampered content",
        ])).unwrap();
        let tampered_id = hex::encode(Sha256::digest(tampered_canonical.as_bytes()));

        // Tampered ID must differ from original
        assert_ne!(tampered_id, event.id);
    }

    #[test]
    fn wrong_key_signature_fails() {
        let sk_a = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let sk_b = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

        let event = finalize_nostr_event(20001, 1700000000, vec![], "test", sk_a).unwrap();

        // Get pubkey for key B
        let sk_b_bytes = hex::decode(sk_b).unwrap();
        let sk_b_arr: [u8; 32] = sk_b_bytes.try_into().unwrap();
        let sk_b_signing = k256::schnorr::SigningKey::from_bytes(&sk_b_arr).unwrap();
        let pubkey_b = hex::encode(sk_b_signing.verifying_key().to_bytes());

        // Verify event signed by A against B's pubkey
        let pk_bytes = hex::decode(&pubkey_b).unwrap();
        let vk = VerifyingKey::from_bytes(pk_bytes.as_slice().try_into().unwrap()).unwrap();
        let sig_bytes = hex::decode(&event.sig).unwrap();
        let signature = k256::schnorr::Signature::try_from(sig_bytes.as_slice()).unwrap();
        let id_bytes = hex::decode(&event.id).unwrap();

        // Verification must fail
        assert!(vk.verify_prehash(&id_bytes, &signature).is_err());
    }
}
