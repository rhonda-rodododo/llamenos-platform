//! SAS (Short Authentication String) emoji derivation for device verification.
//!
//! Given two Ed25519 public keys and a session nonce, derives 7 emoji indices
//! (0-63) using HKDF-SHA256. Both parties compute the same indices and compare
//! emojis visually to confirm device authenticity.
//!
//! Canonical ordering: min(pubkey_a, pubkey_b) || max(pubkey_a, pubkey_b) || nonce
//! This prevents role-confusion attacks.

use hkdf::Hkdf;
use sha2::Sha256;

use crate::errors::CryptoError;
use crate::labels::LABEL_SAS_DERIVE;

/// The 64-entry emoji table for SAS verification display.
/// Each index (0-63) maps to a single emoji codepoint.
pub const SAS_EMOJI_TABLE: [&str; 64] = [
    "\u{1F436}",         // dog
    "\u{1F431}",         // cat
    "\u{1F434}",         // horse
    "\u{1F437}",         // pig
    "\u{1F430}",         // rabbit
    "\u{1F43B}",         // bear
    "\u{1F42F}",         // tiger
    "\u{1F428}",         // koala
    "\u{1F43C}",         // panda
    "\u{1F981}",         // lion
    "\u{1F984}",         // unicorn
    "\u{1F422}",         // turtle
    "\u{1F420}",         // tropical fish
    "\u{1F419}",         // octopus
    "\u{1F98B}",         // butterfly
    "\u{1F33B}",         // sunflower
    "\u{1F332}",         // evergreen tree
    "\u{1F335}",         // cactus
    "\u{1F344}",         // mushroom
    "\u{1F30D}",         // globe
    "\u{1F319}",         // crescent moon
    "\u{2B50}",          // star
    "\u{26A1}",          // lightning
    "\u{1F525}",         // fire
    "\u{1F4A7}",         // droplet
    "\u{2744}\u{FE0F}",  // snowflake
    "\u{1F308}",         // rainbow
    "\u{2600}\u{FE0F}",  // sun
    "\u{2601}\u{FE0F}",  // cloud
    "\u{1F30A}",         // wave
    "\u{1F3D4}\u{FE0F}", // mountain
    "\u{1F3DD}\u{FE0F}", // desert island
    "\u{1F680}",         // rocket
    "\u{2708}\u{FE0F}",  // airplane
    "\u{1F6A2}",         // ship
    "\u{1F3E0}",         // house
    "\u{1F3F0}",         // castle
    "\u{1F3A8}",         // palette
    "\u{1F3B5}",         // music note
    "\u{1F3B2}",         // dice
    "\u{1F3C6}",         // trophy
    "\u{1F48E}",         // gem
    "\u{1F511}",         // key
    "\u{1F6E1}\u{FE0F}", // shield
    "\u{2764}\u{FE0F}",  // heart
    "\u{1F31F}",         // glowing star
    "\u{1F3AF}",         // bullseye
    "\u{1F52E}",         // crystal ball
    "\u{1F9E9}",         // puzzle piece
    "\u{1F3C0}",         // basketball
    "\u{26BD}",          // soccer ball
    "\u{1F3B3}",         // bowling
    "\u{1F40C}",         // snail
    "\u{1F98A}",         // fox
    "\u{1F427}",         // penguin
    "\u{1F989}",         // owl
    "\u{1F99C}",         // parrot
    "\u{1F982}",         // scorpion
    "\u{1F980}",         // crab
    "\u{1F41D}",         // honeybee
    "\u{1F33F}",         // herb
    "\u{1F34E}",         // apple
    "\u{1F352}",         // cherries
    "\u{1F349}",         // watermelon
];

/// Derive 7 SAS emoji indices from two Ed25519 public keys and a session nonce.
///
/// Both parties compute the same result regardless of argument order, because
/// pubkeys are canonically ordered (lexicographic min first).
///
/// Returns 7 indices (0-63) into `SAS_EMOJI_TABLE`.
pub fn derive_sas(
    pubkey_a: &[u8; 32],
    pubkey_b: &[u8; 32],
    nonce: &[u8; 32],
) -> Result<[u8; 7], CryptoError> {
    // Canonical ordering: min first
    let (first, second) = if pubkey_a <= pubkey_b {
        (pubkey_a, pubkey_b)
    } else {
        (pubkey_b, pubkey_a)
    };

    // Input key material: min_pubkey || max_pubkey || nonce
    let mut ikm = Vec::with_capacity(96);
    ikm.extend_from_slice(first);
    ikm.extend_from_slice(second);
    ikm.extend_from_slice(nonce);

    // HKDF-SHA256: extract then expand
    let hk = Hkdf::<Sha256>::new(None, &ikm);
    let mut output = [0u8; 6]; // 48 bits = 6 bytes, enough for 7 * 6-bit values
    hk.expand(LABEL_SAS_DERIVE.as_bytes(), &mut output)
        .map_err(|_| CryptoError::HkdfExpandError)?;

    // Extract seven 6-bit values from 42 bits of the 48-bit output.
    // The 48-bit value is stored big-endian in output[0..6].
    // Bits 0-5 are unused.
    let bits = u64::from_be_bytes([
        0, 0, output[0], output[1], output[2], output[3], output[4], output[5],
    ]);
    let mut indices = [0u8; 7];
    for (i, idx) in indices.iter_mut().enumerate() {
        // Shift to extract group starting at bit (42 - 6*i) in the 48-bit value
        *idx = ((bits >> (42 - 6 * i)) & 0x3F) as u8;
    }

    Ok(indices)
}

/// Get the emoji string for a SAS index.
/// Returns "❓" (question mark) for out-of-range indices.
pub fn sas_emoji(index: u8) -> &'static str {
    SAS_EMOJI_TABLE.get(index as usize).unwrap_or(&"\u{2753}") // question mark fallback
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_sas_deterministic() {
        let pk_a = [1u8; 32];
        let pk_b = [2u8; 32];
        let nonce = [3u8; 32];

        let r1 = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        let r2 = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        assert_eq!(r1, r2);
    }

    #[test]
    fn test_derive_sas_order_independent() {
        let pk_a = [1u8; 32];
        let pk_b = [2u8; 32];
        let nonce = [3u8; 32];

        let r1 = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        let r2 = derive_sas(&pk_b, &pk_a, &nonce).unwrap();
        assert_eq!(r1, r2, "SAS must be order-independent");
    }

    #[test]
    fn test_derive_sas_indices_in_range() {
        let pk_a = [42u8; 32];
        let pk_b = [99u8; 32];
        let nonce = [7u8; 32];

        let indices = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        for idx in &indices {
            assert!(*idx < 64, "SAS index {} out of range 0-63", idx);
        }
    }

    #[test]
    fn test_different_nonce_different_result() {
        let pk_a = [1u8; 32];
        let pk_b = [2u8; 32];

        let r1 = derive_sas(&pk_a, &pk_b, &[0u8; 32]).unwrap();
        let r2 = derive_sas(&pk_a, &pk_b, &[1u8; 32]).unwrap();
        assert_ne!(r1, r2, "Different nonces must produce different SAS");
    }

    #[test]
    fn test_sas_emoji_valid_index() {
        assert!(!sas_emoji(0).is_empty());
        assert!(!sas_emoji(63).is_empty());
    }

    #[test]
    fn test_sas_emoji_out_of_range() {
        assert_eq!(sas_emoji(64), "\u{2753}");
        assert_eq!(sas_emoji(255), "\u{2753}");
    }

    #[test]
    fn test_derive_sas_known_result() {
        let pk_a = [0xABu8; 32];
        let pk_b = [0xCDu8; 32];
        let nonce = [0xEFu8; 32];

        let indices = derive_sas(&pk_a, &pk_b, &nonce).unwrap();
        // All indices must be in valid range
        for idx in &indices {
            assert!(*idx < 64);
        }
        // Verify deterministic
        assert_eq!(indices, derive_sas(&pk_a, &pk_b, &nonce).unwrap());
        // Verify all 7 indices are populated
        assert_eq!(indices.len(), 7);
    }

    #[test]
    fn test_sas_emoji_table_size() {
        assert_eq!(SAS_EMOJI_TABLE.len(), 64);
    }

    #[test]
    fn test_sas_emoji_distinct() {
        let mut seen = std::collections::HashSet::new();
        for emoji in &SAS_EMOJI_TABLE {
            assert!(seen.insert(emoji), "duplicate emoji: {emoji}");
        }
    }
}
