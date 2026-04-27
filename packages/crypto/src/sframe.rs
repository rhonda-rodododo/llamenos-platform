//! SFrame (Secure Frame) key derivation for real-time voice E2EE.
//!
//! Derives per-call, per-participant encryption keys from either:
//! - MLS epoch export secret (when MLS is active)
//! - Hub PTK (fallback when MLS is unavailable)
//!
//! Key hierarchy:
//! ```text
//! exporter_secret (from MLS or hub PTK)
//!   └── sframe_base_key = HKDF-Expand(exporter_secret, "llamenos:sframe:" + call_id, 32)
//!         └── send_key = HKDF-Expand(sframe_base_key, participant_index, 32)
//! ```
//!
//! The SFrame format encrypts each audio frame independently using
//! AES-128-CTR + HMAC-SHA256 (per the SFrame spec).

use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::errors::CryptoError;
use crate::labels::{LABEL_SFRAME_BASE_KEY, LABEL_SFRAME_CALL_SECRET};

/// Derive the SFrame base key for a specific call.
///
/// `base_key = HKDF-Expand(exporter_secret, "llamenos:sframe-base-key:v1:" + call_id, 32)`
pub fn derive_sframe_base_key(exporter_secret: &[u8], call_id: &str) -> Zeroizing<[u8; 32]> {
    let info = format!("{LABEL_SFRAME_BASE_KEY}:{call_id}");
    let hk = Hkdf::<Sha256>::new(None, exporter_secret);
    let mut key = Zeroizing::new([0u8; 32]);
    hk.expand(info.as_bytes(), key.as_mut())
        .expect("HKDF expand should not fail for 32 bytes");
    key
}

/// Derive a per-participant send key from the base key.
///
/// `send_key = HKDF-Expand(base_key, participant_index_be32, 32)`
pub fn derive_sframe_send_key(base_key: &[u8; 32], participant_index: u32) -> Zeroizing<[u8; 32]> {
    let hk = Hkdf::<Sha256>::new(None, base_key);
    let mut key = Zeroizing::new([0u8; 32]);
    hk.expand(&participant_index.to_be_bytes(), key.as_mut())
        .expect("HKDF expand should not fail for 32 bytes");
    key
}

/// Derive a call secret from MLS exporter secret.
///
/// This is the top-level derivation when MLS is the key source.
/// `call_secret = HKDF-Expand(mls_export, "llamenos:sframe-call-secret:v1:" + call_id, 32)`
pub fn derive_call_secret_from_mls(mls_export_secret: &[u8], call_id: &str) -> Zeroizing<[u8; 32]> {
    let info = format!("{LABEL_SFRAME_CALL_SECRET}:{call_id}");
    let hk = Hkdf::<Sha256>::new(None, mls_export_secret);
    let mut key = Zeroizing::new([0u8; 32]);
    hk.expand(info.as_bytes(), key.as_mut())
        .expect("HKDF expand should not fail for 32 bytes");
    key
}

/// Derive a call secret from hub PTK (fallback when MLS is unavailable).
///
/// Same derivation as MLS but using hub PTK as the IKM.
pub fn derive_call_secret_from_ptk(hub_ptk: &[u8; 32], call_id: &str) -> Zeroizing<[u8; 32]> {
    derive_call_secret_from_mls(hub_ptk, call_id)
}

/// Full SFrame key derivation: exporter → call secret → base key → send key.
///
/// Convenience function for the complete derivation chain.
pub fn derive_sframe_key(
    exporter_secret: &[u8],
    call_id: &str,
    participant_index: u32,
) -> Result<Zeroizing<[u8; 32]>, CryptoError> {
    if exporter_secret.is_empty() {
        return Err(CryptoError::InvalidInput(
            "exporter_secret must not be empty".into(),
        ));
    }
    let base_key = derive_sframe_base_key(exporter_secret, call_id);
    Ok(derive_sframe_send_key(&base_key, participant_index))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_key_deterministic() {
        let secret = [42u8; 32];
        let k1 = derive_sframe_base_key(&secret, "call-123");
        let k2 = derive_sframe_base_key(&secret, "call-123");
        assert_eq!(k1, k2);
    }

    #[test]
    fn base_key_differs_per_call() {
        let secret = [42u8; 32];
        let k1 = derive_sframe_base_key(&secret, "call-1");
        let k2 = derive_sframe_base_key(&secret, "call-2");
        assert_ne!(k1, k2);
    }

    #[test]
    fn send_key_differs_per_participant() {
        let base = [42u8; 32];
        let k0 = derive_sframe_send_key(&base, 0);
        let k1 = derive_sframe_send_key(&base, 1);
        let k2 = derive_sframe_send_key(&base, 2);
        assert_ne!(k0, k1);
        assert_ne!(k1, k2);
        assert_ne!(k0, k2);
    }

    #[test]
    fn full_derivation_chain() {
        let secret = [99u8; 32];
        let key = derive_sframe_key(&secret, "call-abc", 0).unwrap();
        assert_ne!(*key, [0u8; 32]);
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn different_secrets_different_keys() {
        let s1 = [1u8; 32];
        let s2 = [2u8; 32];
        let k1 = derive_sframe_key(&s1, "call", 0).unwrap();
        let k2 = derive_sframe_key(&s2, "call", 0).unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn call_secret_from_ptk_matches_mls() {
        // Same derivation regardless of key source
        let key = [42u8; 32];
        let from_mls = derive_call_secret_from_mls(&key, "call-1");
        let from_ptk = derive_call_secret_from_ptk(&key, "call-1");
        assert_eq!(from_mls, from_ptk);
    }

    #[test]
    fn empty_secret_rejected() {
        let result = derive_sframe_key(&[], "call", 0);
        assert!(result.is_err());
    }
}
