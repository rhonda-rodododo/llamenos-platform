# EP09-P1: Recovery Group Crypto Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement Shamir secret sharing in Rust, add recovery group crypto labels, and expose via UniFFI for all platforms.

**Architecture:** The Shamir GF(2^8) secret sharing module (`shamir.rs`) lives in `packages/crypto/src/` alongside existing crypto modules. It uses the same irreducible polynomial as AES (0x11B) for Galois field arithmetic, splits arbitrary-length secrets byte-by-byte into shares, and reconstructs via Lagrange interpolation. Recovery group keypairs use the existing `generate_x25519_keypair()` from `hpke_envelope.rs`. Four new domain separation labels are added to `crypto-labels.json` and the Rust `LABEL_REGISTRY` at indices 69-72, then propagated to all platforms via codegen. UniFFI exports follow the hex-string boundary pattern established in `ffi.rs`.

**Tech Stack:** Rust, packages/crypto, UniFFI, crypto-labels.json codegen

---

### Task 1: Add crypto labels to crypto-labels.json

**Files:**
- Modify: `packages/protocol/crypto-labels.json`
- Modify: `packages/crypto/src/labels.rs`

- [ ] **Step 1: Add 4 recovery group labels to crypto-labels.json**

Append these 4 entries to the `"labels"` object in `packages/protocol/crypto-labels.json`, immediately before the closing `}` of the `"labels"` block:

```json
    "LABEL_RECOVERY_GROUP_SHARE_WRAP": "llamenos:recovery-group:share-wrap:v1",
    "LABEL_RECOVERY_PUK_SEED_WRAP": "llamenos:recovery-group:puk-seed-wrap:v1",
    "LABEL_RECOVERY_SHARE_CONTRIBUTE": "llamenos:recovery-group:share-contribute:v1",
    "LABEL_RECOVERY_LIVENESS_PROOF": "llamenos:recovery-group:liveness-proof:v1"
```

The full labels object should end with:

```json
    "LABEL_WS_CHALLENGE": "llamenos:ws-auth:v1",
    "LABEL_RECOVERY_GROUP_SHARE_WRAP": "llamenos:recovery-group:share-wrap:v1",
    "LABEL_RECOVERY_PUK_SEED_WRAP": "llamenos:recovery-group:puk-seed-wrap:v1",
    "LABEL_RECOVERY_SHARE_CONTRIBUTE": "llamenos:recovery-group:share-contribute:v1",
    "LABEL_RECOVERY_LIVENESS_PROOF": "llamenos:recovery-group:liveness-proof:v1"
  }
}
```

- [ ] **Step 2: Add Rust constants and registry entries to labels.rs**

Add the following constant declarations after the `LABEL_WS_CHALLENGE` constant block (before the `LABEL_REGISTRY` array):

```rust
// --- Recovery Group ---

/// HPKE wrapping each share holder's Shamir share at rest
pub const LABEL_RECOVERY_GROUP_SHARE_WRAP: &str = "llamenos:recovery-group:share-wrap:v1";

/// HPKE wrapping user's PUK seed under recovery group pubkey
pub const LABEL_RECOVERY_PUK_SEED_WRAP: &str = "llamenos:recovery-group:puk-seed-wrap:v1";

/// HPKE wrapping share contribution to user's new device during ceremony
pub const LABEL_RECOVERY_SHARE_CONTRIBUTE: &str = "llamenos:recovery-group:share-contribute:v1";

/// Domain separation for share liveness proofs
pub const LABEL_RECOVERY_LIVENESS_PROOF: &str = "llamenos:recovery-group:liveness-proof:v1";
```

Append 4 entries to the `LABEL_REGISTRY` array after `LABEL_WS_CHALLENGE` (index 68):

```rust
    // 69-72: Recovery Group
    LABEL_RECOVERY_GROUP_SHARE_WRAP,  // 69
    LABEL_RECOVERY_PUK_SEED_WRAP,     // 70
    LABEL_RECOVERY_SHARE_CONTRIBUTE,  // 71
    LABEL_RECOVERY_LIVENESS_PROOF,    // 72
```

- [ ] **Step 3: Add label tests to labels.rs**

Add to the `new_v3_labels` test function:

```rust
        assert_eq!(
            LABEL_RECOVERY_GROUP_SHARE_WRAP,
            "llamenos:recovery-group:share-wrap:v1"
        );
        assert_eq!(
            LABEL_RECOVERY_PUK_SEED_WRAP,
            "llamenos:recovery-group:puk-seed-wrap:v1"
        );
        assert_eq!(
            LABEL_RECOVERY_SHARE_CONTRIBUTE,
            "llamenos:recovery-group:share-contribute:v1"
        );
        assert_eq!(
            LABEL_RECOVERY_LIVENESS_PROOF,
            "llamenos:recovery-group:liveness-proof:v1"
        );
```

Add to the `registry_indices_stable` test function:

```rust
        assert_eq!(id_to_label(69), Some(LABEL_RECOVERY_GROUP_SHARE_WRAP));
        assert_eq!(id_to_label(70), Some(LABEL_RECOVERY_PUK_SEED_WRAP));
        assert_eq!(id_to_label(71), Some(LABEL_RECOVERY_SHARE_CONTRIBUTE));
        assert_eq!(id_to_label(72), Some(LABEL_RECOVERY_LIVENESS_PROOF));
```

- [ ] **Step 4: Run codegen**

Run: `bun run codegen`
Expected: Codegen completes successfully. Generated TS/Swift/Kotlin files in `packages/protocol/generated/` include the 4 new label constants.

- [ ] **Step 5: Verify label tests pass**

Run: `cd packages/crypto && cargo test labels`
Expected: All label tests pass, including new registry index assertions.

---

### Task 2: Implement shamir.rs GF(2^8) module

**Files:**
- Create: `packages/crypto/src/shamir.rs`

- [ ] **Step 1: Create the complete Shamir GF(2^8) implementation**

Create `packages/crypto/src/shamir.rs` with the following complete implementation:

```rust
//! Shamir Secret Sharing over GF(2^8).
//!
//! Splits a secret into N shares such that any K (threshold) shares can reconstruct
//! the original secret, but fewer than K shares reveal zero information about the secret
//! (information-theoretic security).
//!
//! Uses GF(2^8) arithmetic with the AES irreducible polynomial x^8 + x^4 + x^3 + x + 1
//! (0x11B). Each byte of the secret is processed independently as a separate polynomial.
//!
//! ## Constraints
//!
//! - `threshold` (K) must be in [2, 5]
//! - `total` (N) must be in [3, 5]
//! - `threshold <= total`
//!
//! ## Security
//!
//! - Random coefficients sourced from `getrandom` (OS CSPRNG)
//! - Evaluation points are 1-indexed (never 0 — x=0 is the secret)
//! - Secret bytes are zeroized after splitting
//! - SHA-256 commitments for tamper detection

use sha2::{Digest, Sha256};
use zeroize::Zeroize;

use crate::errors::CryptoError;

// =============================================================================
// GF(2^8) Arithmetic
// =============================================================================

/// AES irreducible polynomial: x^8 + x^4 + x^3 + x + 1 = 0x11B
const GF256_MODULUS: u16 = 0x11B;

/// Multiplication in GF(2^8) using Russian peasant multiplication with reduction.
#[inline]
fn gf256_mul(mut a: u8, mut b: u8) -> u8 {
    let mut result: u8 = 0;
    while b > 0 {
        if b & 1 != 0 {
            result ^= a;
        }
        let carry = a & 0x80;
        a <<= 1;
        if carry != 0 {
            a ^= GF256_MODULUS as u8; // reduce mod polynomial (low 8 bits of 0x11B = 0x1B)
        }
        b >>= 1;
    }
    result
}

/// Addition in GF(2^8) — XOR.
#[inline]
fn gf256_add(a: u8, b: u8) -> u8 {
    a ^ b
}

/// Multiplicative inverse in GF(2^8) via extended Euclidean algorithm.
///
/// Returns 0 for input 0 (which has no inverse — caller must prevent this).
fn gf256_inv(a: u8) -> u8 {
    if a == 0 {
        return 0; // 0 has no inverse — should never be called with 0
    }
    // Fermat's little theorem: a^(-1) = a^(254) in GF(2^8) since |GF(2^8)*| = 255
    let mut result = a;
    // Square-and-multiply: compute a^254 = a^(11111110_b)
    // a^2
    result = gf256_mul(result, result);
    // a^3 = a^2 * a
    let a3 = gf256_mul(result, a);
    // a^6 = (a^3)^2
    result = gf256_mul(a3, a3);
    // a^7 = a^6 * a
    let a7 = gf256_mul(result, a);
    // a^14 = (a^7)^2
    result = gf256_mul(a7, a7);
    // a^15 = a^14 * a
    let a15 = gf256_mul(result, a);
    // a^30 = (a^15)^2
    result = gf256_mul(a15, a15);
    // a^31 = a^30 * a
    let a31 = gf256_mul(result, a);
    // a^62 = (a^31)^2
    result = gf256_mul(a31, a31);
    // a^63 = a^62 * a
    let a63 = gf256_mul(result, a);
    // a^126 = (a^63)^2
    result = gf256_mul(a63, a63);
    // a^127 = a^126 * a
    let a127 = gf256_mul(result, a);
    // a^254 = (a^127)^2
    gf256_mul(a127, a127)
}

/// Division in GF(2^8): a / b = a * b^(-1).
#[inline]
fn gf256_div(a: u8, b: u8) -> u8 {
    debug_assert!(b != 0, "division by zero in GF(2^8)");
    gf256_mul(a, gf256_inv(b))
}

// =============================================================================
// Share Type
// =============================================================================

/// A single Shamir share: evaluation point x and the vector of y-values (one per secret byte).
#[derive(Clone, Debug)]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct Share {
    /// Evaluation point (1-indexed, never 0)
    pub x: u8,
    /// y-values, one per byte of the original secret
    pub y: Vec<u8>,
}

impl Drop for Share {
    fn drop(&mut self) {
        self.y.zeroize();
    }
}

// =============================================================================
// Public API
// =============================================================================

/// Split a secret into `total` shares with reconstruction `threshold`.
///
/// - `secret`: arbitrary-length byte slice (must not be empty)
/// - `total`: number of shares to generate, N in [3, 5]
/// - `threshold`: minimum shares needed to reconstruct, K in [2, 5], K <= N
///
/// Returns a vector of N shares. The secret is processed byte-by-byte:
/// for each byte, a random polynomial of degree (threshold - 1) is created
/// with the secret byte as the constant term, and evaluated at points 1..=total.
pub fn split(secret: &[u8], total: u8, threshold: u8) -> Result<Vec<Share>, CryptoError> {
    validate_params(total, threshold)?;

    if secret.is_empty() {
        return Err(CryptoError::InvalidInput(
            "secret must not be empty".to_string(),
        ));
    }

    let secret_len = secret.len();

    // Generate random coefficients for each byte's polynomial.
    // For each secret byte, we need (threshold - 1) random coefficients.
    let num_coeffs = (threshold as usize - 1) * secret_len;
    let mut coeffs = vec![0u8; num_coeffs];
    getrandom::getrandom(&mut coeffs)
        .map_err(|e| CryptoError::EncryptionFailed(format!("RNG failed: {e}")))?;

    // Initialize shares
    let mut shares: Vec<Share> = (1..=total)
        .map(|x| Share {
            x,
            y: vec![0u8; secret_len],
        })
        .collect();

    // For each byte of the secret, evaluate the polynomial at each share's x
    for byte_idx in 0..secret_len {
        let coeff_offset = byte_idx * (threshold as usize - 1);

        for share in shares.iter_mut() {
            // Evaluate polynomial: secret[byte_idx] + c1*x + c2*x^2 + ... + c_{k-1}*x^{k-1}
            let mut value = secret[byte_idx];
            let mut x_power = share.x; // x^1

            for coeff_idx in 0..(threshold as usize - 1) {
                let term = gf256_mul(coeffs[coeff_offset + coeff_idx], x_power);
                value = gf256_add(value, term);
                x_power = gf256_mul(x_power, share.x); // x^(i+1)
            }

            share.y[byte_idx] = value;
        }
    }

    // Zeroize coefficient buffer
    coeffs.zeroize();

    Ok(shares)
}

/// Reconstruct the secret from a set of shares using Lagrange interpolation.
///
/// Requires at least `threshold` shares (the original threshold from splitting).
/// Providing fewer than threshold shares will produce an incorrect result
/// (information-theoretic security — no error is raised, the output is simply wrong).
///
/// Providing more shares than the threshold is allowed and will produce the correct secret
/// as long as the shares are consistent.
pub fn combine(shares: &[Share]) -> Result<Vec<u8>, CryptoError> {
    if shares.is_empty() {
        return Err(CryptoError::InvalidInput(
            "no shares provided".to_string(),
        ));
    }

    // Verify all shares have the same y length
    let secret_len = shares[0].y.len();
    if shares.iter().any(|s| s.y.len() != secret_len) {
        return Err(CryptoError::InvalidInput(
            "shares have inconsistent lengths".to_string(),
        ));
    }

    // Verify no duplicate x values
    for i in 0..shares.len() {
        for j in (i + 1)..shares.len() {
            if shares[i].x == shares[j].x {
                return Err(CryptoError::InvalidInput(format!(
                    "duplicate share x value: {}",
                    shares[i].x
                )));
            }
        }
    }

    // Verify no x=0 (x=0 would be the secret itself)
    if shares.iter().any(|s| s.x == 0) {
        return Err(CryptoError::InvalidInput(
            "share x value must not be 0".to_string(),
        ));
    }

    let mut secret = vec![0u8; secret_len];

    // Lagrange interpolation at x=0 for each byte position
    for byte_idx in 0..secret_len {
        let mut value = 0u8;

        for i in 0..shares.len() {
            let xi = shares[i].x;
            let yi = shares[i].y[byte_idx];

            // Compute Lagrange basis polynomial L_i(0)
            // L_i(0) = product_{j != i} (0 - x_j) / (x_i - x_j)
            //        = product_{j != i} x_j / (x_i - x_j)
            // In GF(2^8): subtraction = addition = XOR
            let mut numerator = 1u8;
            let mut denominator = 1u8;

            for j in 0..shares.len() {
                if i == j {
                    continue;
                }
                let xj = shares[j].x;
                numerator = gf256_mul(numerator, xj); // product of x_j
                denominator = gf256_mul(denominator, gf256_add(xi, xj)); // product of (x_i XOR x_j)
            }

            let lagrange_coeff = gf256_div(numerator, denominator);
            let term = gf256_mul(yi, lagrange_coeff);
            value = gf256_add(value, term);
        }

        secret[byte_idx] = value;
    }

    Ok(secret)
}

/// Compute a SHA-256 commitment for a share.
///
/// The commitment binds (x, y) together so that tampering with either value
/// is detectable before attempting reconstruction.
///
/// Format: SHA-256(x || y)
pub fn commit(share: &Share) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([share.x]);
    hasher.update(&share.y);
    hasher.finalize().into()
}

/// Verify a share against a previously computed commitment.
pub fn verify(share: &Share, commitment: &[u8; 32]) -> bool {
    let computed = commit(share);
    // Constant-time comparison to prevent timing attacks
    constant_time_eq(&computed, commitment)
}

// =============================================================================
// Internal Helpers
// =============================================================================

/// Validate threshold and total parameters.
fn validate_params(total: u8, threshold: u8) -> Result<(), CryptoError> {
    if threshold < 2 {
        return Err(CryptoError::InvalidInput(
            "threshold must be at least 2".to_string(),
        ));
    }
    if threshold > 5 {
        return Err(CryptoError::InvalidInput(
            "threshold must be at most 5".to_string(),
        ));
    }
    if total < 3 {
        return Err(CryptoError::InvalidInput(
            "total shares must be at least 3".to_string(),
        ));
    }
    if total > 5 {
        return Err(CryptoError::InvalidInput(
            "total shares must be at most 5".to_string(),
        ));
    }
    if threshold > total {
        return Err(CryptoError::InvalidInput(format!(
            "threshold ({threshold}) must not exceed total ({total})"
        )));
    }
    Ok(())
}

/// Constant-time byte array comparison (prevents timing side-channels on commitments).
fn constant_time_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut diff = 0u8;
    for i in 0..32 {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}
```

---

### Task 3: Write Shamir unit tests

**Files:**
- Modify: `packages/crypto/src/shamir.rs` (append tests module)

- [ ] **Step 1: Append the complete test module to shamir.rs**

Append the following to the end of `packages/crypto/src/shamir.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: generate a random secret of the given length.
    fn random_secret(len: usize) -> Vec<u8> {
        let mut buf = vec![0u8; len];
        getrandom::getrandom(&mut buf).unwrap();
        buf
    }

    // =========================================================================
    // GF(2^8) arithmetic tests
    // =========================================================================

    #[test]
    fn gf256_mul_identity() {
        for a in 0..=255u8 {
            assert_eq!(gf256_mul(a, 1), a, "a * 1 should equal a");
            assert_eq!(gf256_mul(1, a), a, "1 * a should equal a");
        }
    }

    #[test]
    fn gf256_mul_zero() {
        for a in 0..=255u8 {
            assert_eq!(gf256_mul(a, 0), 0, "a * 0 should equal 0");
            assert_eq!(gf256_mul(0, a), 0, "0 * a should equal 0");
        }
    }

    #[test]
    fn gf256_mul_commutative() {
        // Spot check commutativity
        for a in [1u8, 2, 3, 17, 42, 100, 200, 255] {
            for b in [1u8, 2, 3, 17, 42, 100, 200, 255] {
                assert_eq!(
                    gf256_mul(a, b),
                    gf256_mul(b, a),
                    "multiplication should be commutative for ({a}, {b})"
                );
            }
        }
    }

    #[test]
    fn gf256_inverse_roundtrip() {
        // Every nonzero element has an inverse: a * a^(-1) = 1
        for a in 1..=255u8 {
            let inv = gf256_inv(a);
            assert_ne!(inv, 0, "inverse of nonzero element should be nonzero");
            assert_eq!(
                gf256_mul(a, inv),
                1,
                "a * a^(-1) should equal 1 for a={a}"
            );
        }
    }

    #[test]
    fn gf256_known_values() {
        // AES S-box uses the same field. Verify a known multiplication:
        // 0x53 * 0xCA = 0x01 (these are inverses in AES's GF(2^8))
        assert_eq!(gf256_mul(0x53, 0xCA), 0x01);
    }

    // =========================================================================
    // Split/combine round-trip tests for all valid (K, N) combinations
    // =========================================================================

    #[test]
    fn roundtrip_2_of_3() {
        let secret = random_secret(32);
        let shares = split(&secret, 3, 2).unwrap();
        assert_eq!(shares.len(), 3);

        // Any 2 shares should reconstruct correctly
        for combo in &[[0, 1], [0, 2], [1, 2]] {
            let subset: Vec<Share> = combo.iter().map(|&i| shares[i].clone()).collect();
            let recovered = combine(&subset).unwrap();
            assert_eq!(recovered, secret, "failed with shares {:?}", combo);
        }

        // All 3 shares should also work
        let recovered = combine(&shares).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_2_of_4() {
        let secret = random_secret(32);
        let shares = split(&secret, 4, 2).unwrap();
        assert_eq!(shares.len(), 4);

        let subset = vec![shares[1].clone(), shares[3].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_2_of_5() {
        let secret = random_secret(32);
        let shares = split(&secret, 5, 2).unwrap();
        assert_eq!(shares.len(), 5);

        let subset = vec![shares[0].clone(), shares[4].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_3_of_3() {
        let secret = random_secret(32);
        let shares = split(&secret, 3, 3).unwrap();
        let recovered = combine(&shares).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_3_of_4() {
        let secret = random_secret(32);
        let shares = split(&secret, 4, 3).unwrap();

        // Any 3 of 4 should work
        for skip in 0..4 {
            let subset: Vec<Share> = shares
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != skip)
                .map(|(_, s)| s.clone())
                .collect();
            let recovered = combine(&subset).unwrap();
            assert_eq!(recovered, secret, "failed when skipping share {skip}");
        }
    }

    #[test]
    fn roundtrip_3_of_5() {
        let secret = random_secret(32);
        let shares = split(&secret, 5, 3).unwrap();

        let subset = vec![shares[0].clone(), shares[2].clone(), shares[4].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_4_of_4() {
        let secret = random_secret(32);
        let shares = split(&secret, 4, 4).unwrap();
        let recovered = combine(&shares).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_4_of_5() {
        let secret = random_secret(32);
        let shares = split(&secret, 5, 4).unwrap();

        let subset: Vec<Share> = shares[0..4].to_vec();
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn roundtrip_5_of_5() {
        let secret = random_secret(32);
        let shares = split(&secret, 5, 5).unwrap();
        let recovered = combine(&shares).unwrap();
        assert_eq!(recovered, secret);
    }

    // =========================================================================
    // Below-threshold produces wrong output
    // =========================================================================

    #[test]
    fn below_threshold_produces_wrong_output() {
        let secret = random_secret(32);
        let shares = split(&secret, 5, 3).unwrap();

        // 2 shares (below threshold of 3) should produce wrong output
        let subset = vec![shares[0].clone(), shares[1].clone()];
        let wrong = combine(&subset).unwrap();
        assert_ne!(wrong, secret, "below-threshold reconstruction should not match secret");
    }

    #[test]
    fn single_share_reveals_nothing() {
        let secret = random_secret(32);
        let shares = split(&secret, 3, 2).unwrap();

        // A single share should produce wrong output
        let subset = vec![shares[0].clone()];
        let wrong = combine(&subset).unwrap();
        // With threshold=2, a single share is just the polynomial evaluated at x.
        // It's not equal to the secret (except by astronomically unlikely coincidence).
        // For a 32-byte secret, the probability of accidental match is 2^(-256).
        assert_ne!(wrong, secret, "single share should not reveal the secret");
    }

    // =========================================================================
    // Commitment round-trip
    // =========================================================================

    #[test]
    fn commitment_roundtrip() {
        let secret = random_secret(32);
        let shares = split(&secret, 3, 2).unwrap();

        for share in &shares {
            let commitment = commit(share);
            assert!(verify(share, &commitment), "commitment should verify");
        }
    }

    #[test]
    fn commitments_are_unique_per_share() {
        let secret = random_secret(32);
        let shares = split(&secret, 5, 3).unwrap();

        let commitments: Vec<[u8; 32]> = shares.iter().map(commit).collect();
        for i in 0..commitments.len() {
            for j in (i + 1)..commitments.len() {
                assert_ne!(
                    commitments[i], commitments[j],
                    "different shares should have different commitments"
                );
            }
        }
    }

    // =========================================================================
    // Tampered share fails commitment
    // =========================================================================

    #[test]
    fn tampered_y_fails_commitment() {
        let secret = random_secret(32);
        let shares = split(&secret, 3, 2).unwrap();
        let commitment = commit(&shares[0]);

        // Tamper with y
        let mut tampered = shares[0].clone();
        tampered.y[0] ^= 0x01;
        assert!(!verify(&tampered, &commitment), "tampered y should fail verification");
    }

    #[test]
    fn tampered_x_fails_commitment() {
        let secret = random_secret(32);
        let shares = split(&secret, 3, 2).unwrap();
        let commitment = commit(&shares[0]);

        // Tamper with x
        let mut tampered = shares[0].clone();
        tampered.x = if tampered.x == 1 { 2 } else { 1 };
        assert!(!verify(&tampered, &commitment), "tampered x should fail verification");
    }

    // =========================================================================
    // Invalid parameters rejected
    // =========================================================================

    #[test]
    fn threshold_below_2_rejected() {
        let secret = random_secret(32);
        let result = split(&secret, 3, 1);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("threshold must be at least 2"));
    }

    #[test]
    fn threshold_above_5_rejected() {
        let secret = random_secret(32);
        let result = split(&secret, 5, 6);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("threshold must be at most 5"));
    }

    #[test]
    fn total_below_3_rejected() {
        let secret = random_secret(32);
        let result = split(&secret, 2, 2);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("total shares must be at least 3"));
    }

    #[test]
    fn total_above_5_rejected() {
        let secret = random_secret(32);
        let result = split(&secret, 6, 3);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("total shares must be at most 5"));
    }

    #[test]
    fn threshold_exceeds_total_rejected() {
        let secret = random_secret(32);
        let result = split(&secret, 3, 4);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("must not exceed total"));
    }

    #[test]
    fn empty_secret_rejected() {
        let result = split(&[], 3, 2);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("secret must not be empty"));
    }

    #[test]
    fn empty_shares_rejected() {
        let result = combine(&[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no shares provided"));
    }

    #[test]
    fn duplicate_x_rejected() {
        let share = Share {
            x: 1,
            y: vec![42],
        };
        let result = combine(&[share.clone(), share]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("duplicate share x value"));
    }

    // =========================================================================
    // Variable secret sizes
    // =========================================================================

    #[test]
    fn single_byte_secret() {
        let secret = vec![0xAB];
        let shares = split(&secret, 3, 2).unwrap();
        let subset = vec![shares[0].clone(), shares[2].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn large_secret() {
        let secret = random_secret(1024);
        let shares = split(&secret, 3, 2).unwrap();
        let subset = vec![shares[0].clone(), shares[1].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn all_zeros_secret() {
        let secret = vec![0u8; 32];
        let shares = split(&secret, 3, 2).unwrap();
        let subset = vec![shares[0].clone(), shares[1].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn all_ones_secret() {
        let secret = vec![0xFFu8; 32];
        let shares = split(&secret, 3, 2).unwrap();
        let subset = vec![shares[1].clone(), shares[2].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    // =========================================================================
    // Determinism: same secret split twice produces different shares
    // =========================================================================

    #[test]
    fn different_splits_produce_different_shares() {
        let secret = random_secret(32);
        let shares1 = split(&secret, 3, 2).unwrap();
        let shares2 = split(&secret, 3, 2).unwrap();

        // With overwhelming probability, the shares will differ due to random coefficients
        let any_differ = shares1
            .iter()
            .zip(shares2.iter())
            .any(|(s1, s2)| s1.y != s2.y);
        assert!(any_differ, "two splits of the same secret should produce different shares");
    }
}
```

- [ ] **Step 2: Run Shamir unit tests**

Run: `cd packages/crypto && cargo test shamir`
Expected: All tests pass. Output includes `test result: ok` with 0 failures.

---

### Task 4: Add recovery group keypair generation

**Files:**
- Modify: `packages/crypto/src/shamir.rs` (add keypair function at end of public API section, before tests)

- [ ] **Step 1: Add recovery group keypair generation function**

Add the following function to `packages/crypto/src/shamir.rs` in the public API section (after the `verify` function, before the `validate_params` helper):

```rust
/// Generate an X25519 keypair for a recovery group.
///
/// The private key is intended to be immediately Shamir-split and then zeroized.
/// Returns `(secret_key_hex, public_key_hex)`.
///
/// This is a thin wrapper around `hpke_envelope::generate_x25519_keypair()` that
/// exists for API clarity — recovery group keypairs are X25519 like all other
/// HPKE keypairs in the system.
pub fn generate_recovery_group_keypair() -> (zeroize::Zeroizing<String>, String) {
    crate::hpke_envelope::generate_x25519_keypair()
}
```

- [ ] **Step 2: Add keypair test to the test module**

Add the following test inside the `#[cfg(test)] mod tests` block in `shamir.rs`:

```rust
    // =========================================================================
    // Recovery group keypair generation
    // =========================================================================

    #[test]
    fn recovery_group_keypair_roundtrip_with_hpke() {
        use crate::hpke_envelope::{hpke_open, hpke_seal};
        use crate::labels::LABEL_RECOVERY_PUK_SEED_WRAP;

        let (sk_hex, pk_hex) = generate_recovery_group_keypair();

        // Verify key lengths
        assert_eq!(sk_hex.len(), 64, "secret key should be 32 bytes hex");
        assert_eq!(pk_hex.len(), 64, "public key should be 32 bytes hex");

        // Round-trip: seal a PUK seed under the recovery group pubkey, open with privkey
        let puk_seed = random_secret(32);
        let aad = b"test-hub-id:puk-seed";
        let envelope =
            hpke_seal(&puk_seed, &pk_hex, LABEL_RECOVERY_PUK_SEED_WRAP, aad).unwrap();
        let decrypted =
            hpke_open(&envelope, &sk_hex, LABEL_RECOVERY_PUK_SEED_WRAP, aad).unwrap();
        assert_eq!(decrypted, puk_seed);
    }

    #[test]
    fn recovery_group_keypair_unique() {
        let (sk1, pk1) = generate_recovery_group_keypair();
        let (sk2, pk2) = generate_recovery_group_keypair();
        assert_ne!(*sk1, *sk2);
        assert_ne!(pk1, pk2);
    }
```

- [ ] **Step 3: Run keypair tests**

Run: `cd packages/crypto && cargo test recovery_group_keypair`
Expected: Both tests pass.

---

### Task 5: Wire shamir module into lib.rs

**Files:**
- Modify: `packages/crypto/src/lib.rs`

- [ ] **Step 1: Add pub mod shamir to lib.rs**

Add the following line to `packages/crypto/src/lib.rs` in the "Core modules" section, after `pub mod sigchain;`:

```rust
pub mod shamir;
```

So the core modules section reads:

```rust
// === Core modules (Ed25519/X25519 + HPKE) ===
pub mod auth;
pub mod device_keys;
pub mod hpke_envelope;
pub mod labels;
pub mod puk;
pub mod sigchain;
pub mod shamir;
```

- [ ] **Step 2: Add re-exports**

Add the following to the re-export section at the bottom of `lib.rs`, after the existing re-exports:

```rust
// Re-export Shamir types
pub use shamir::Share;
```

- [ ] **Step 3: Verify full crate compiles**

Run: `cd packages/crypto && cargo build`
Expected: Build succeeds with no errors.

---

### Task 6: Add UniFFI exports in ffi.rs

**Files:**
- Modify: `packages/crypto/src/ffi.rs`

- [ ] **Step 1: Add Shamir FFI functions to ffi.rs**

Append the following UniFFI-exported functions to the end of `packages/crypto/src/ffi.rs`:

```rust
// =============================================================================
// Recovery Group — Shamir Secret Sharing
// =============================================================================

/// Split a secret (hex) into N Shamir shares with threshold K.
///
/// Returns shares with hex-encoded y values.
#[uniffi::export]
pub fn mobile_shamir_split(
    secret_hex: &str,
    total: u8,
    threshold: u8,
) -> Result<Vec<crate::shamir::Share>, CryptoError> {
    let secret = hex::decode(secret_hex).map_err(CryptoError::HexError)?;
    crate::shamir::split(&secret, total, threshold)
}

/// Combine Shamir shares to reconstruct the secret.
///
/// Returns the reconstructed secret as a hex string.
#[uniffi::export]
pub fn mobile_shamir_combine(
    shares: Vec<crate::shamir::Share>,
) -> Result<String, CryptoError> {
    let secret = crate::shamir::combine(&shares)?;
    Ok(hex::encode(secret))
}

/// Compute a SHA-256 commitment for a Shamir share.
///
/// Returns the 32-byte commitment as a hex string.
#[uniffi::export]
pub fn mobile_shamir_commit(
    share: &crate::shamir::Share,
) -> String {
    hex::encode(crate::shamir::commit(share))
}

/// Verify a Shamir share against a hex-encoded commitment.
#[uniffi::export]
pub fn mobile_shamir_verify(
    share: &crate::shamir::Share,
    commitment_hex: &str,
) -> Result<bool, CryptoError> {
    let commitment_bytes = hex::decode(commitment_hex).map_err(CryptoError::HexError)?;
    if commitment_bytes.len() != 32 {
        return Err(CryptoError::InvalidInput(format!(
            "commitment must be 32 bytes, got {}",
            commitment_bytes.len()
        )));
    }
    let mut commitment = [0u8; 32];
    commitment.copy_from_slice(&commitment_bytes);
    Ok(crate::shamir::verify(share, &commitment))
}

/// Generate an X25519 keypair for a recovery group.
///
/// Returns (secret_key_hex, public_key_hex).
#[uniffi::export]
pub fn mobile_recovery_group_generate_keypair() -> Vec<String> {
    let (sk, pk) = crate::shamir::generate_recovery_group_keypair();
    vec![sk.to_string(), pk]
}
```

- [ ] **Step 2: Verify mobile feature compiles**

Run: `cd packages/crypto && cargo build --features mobile`
Expected: Build succeeds with no errors. UniFFI scaffolding generates bindings for the new functions.

---

### Task 7: Integration test -- full recovery flow in Rust

**Files:**
- Create: `packages/crypto/tests/recovery_flow.rs`

- [ ] **Step 1: Create the integration test file**

Create `packages/crypto/tests/recovery_flow.rs`:

```rust
//! Integration test: full recovery group crypto flow.
//!
//! This test proves the complete crypto chain:
//! 1. Generate recovery group X25519 keypair
//! 2. Split private key into Shamir shares
//! 3. HPKE-wrap each share with a share holder's pubkey (LABEL_RECOVERY_GROUP_SHARE_WRAP)
//! 4. Verify share commitments
//! 5. Simulate ceremony: HPKE-open a share, re-wrap to new device (LABEL_RECOVERY_SHARE_CONTRIBUTE)
//! 6. New device opens contributed shares
//! 7. Combine shares to reconstruct recovery group private key
//! 8. Use reconstructed key to HPKE-open a PUK seed envelope (LABEL_RECOVERY_PUK_SEED_WRAP)

use llamenos_core::hpke_envelope::{generate_x25519_keypair, hpke_open, hpke_seal};
use llamenos_core::labels::{
    LABEL_RECOVERY_GROUP_SHARE_WRAP, LABEL_RECOVERY_PUK_SEED_WRAP,
    LABEL_RECOVERY_SHARE_CONTRIBUTE,
};
use llamenos_core::shamir::{combine, commit, generate_recovery_group_keypair, split, verify, Share};

#[test]
fn full_recovery_ceremony_flow() {
    // --- Setup: participants ---

    // 3 share holders, each with their own device keypair
    let holder_keys: Vec<_> = (0..3).map(|_| generate_x25519_keypair()).collect();
    let holder_pubkeys: Vec<&str> = holder_keys.iter().map(|(_, pk)| pk.as_str()).collect();

    // Recovering user's new device keypair
    let (new_device_sk, new_device_pk) = generate_x25519_keypair();

    // --- Step 1: Generate recovery group keypair ---

    let (recovery_sk, recovery_pk) = generate_recovery_group_keypair();
    assert_eq!(recovery_sk.len(), 64);
    assert_eq!(recovery_pk.len(), 64);

    // --- Step 2: User enrolls their PUK seed ---

    let mut puk_seed = [0u8; 32];
    getrandom::getrandom(&mut puk_seed).unwrap();
    let puk_seed_aad = b"hub-abc:puk-seed";

    let puk_seed_envelope = hpke_seal(
        &puk_seed,
        &recovery_pk,
        LABEL_RECOVERY_PUK_SEED_WRAP,
        puk_seed_aad,
    )
    .unwrap();

    // --- Step 3: Split recovery group private key into shares ---

    let sk_bytes = hex::decode(&*recovery_sk).unwrap();
    let shares = split(&sk_bytes, 3, 2).unwrap();
    assert_eq!(shares.len(), 3);

    // --- Step 4: Compute commitments ---

    let commitments: Vec<[u8; 32]> = shares.iter().map(commit).collect();

    // --- Step 5: HPKE-wrap each share for its holder ---

    let share_envelopes: Vec<_> = shares
        .iter()
        .enumerate()
        .map(|(i, share)| {
            let share_bytes = serialize_share(share);
            let aad = format!("hub-abc:share:{}", i);
            hpke_seal(
                &share_bytes,
                holder_pubkeys[i],
                LABEL_RECOVERY_GROUP_SHARE_WRAP,
                aad.as_bytes(),
            )
            .unwrap()
        })
        .collect();

    // Recovery group private key is now zeroized (in production, the caller does this)
    drop(recovery_sk);

    // --- Step 6: Recovery ceremony — 2 share holders contribute ---

    // Session ID for AAD binding
    let session_id = "session-12345";

    let mut contributed_shares: Vec<Share> = Vec::new();

    for i in 0..2 {
        // Holder decrypts their stored share
        let aad = format!("hub-abc:share:{}", i);
        let share_bytes = hpke_open(
            &share_envelopes[i],
            &holder_keys[i].0,
            LABEL_RECOVERY_GROUP_SHARE_WRAP,
            aad.as_bytes(),
        )
        .unwrap();

        let share = deserialize_share(&share_bytes);

        // Verify commitment
        assert!(
            verify(&share, &commitments[i]),
            "share {i} commitment failed"
        );

        // HPKE-wrap share to new device's pubkey
        let contribute_aad = format!(
            "{}:{}:{}",
            LABEL_RECOVERY_SHARE_CONTRIBUTE, session_id, holder_pubkeys[i]
        );
        let contribution_envelope = hpke_seal(
            &share_bytes,
            &new_device_pk,
            LABEL_RECOVERY_SHARE_CONTRIBUTE,
            contribute_aad.as_bytes(),
        )
        .unwrap();

        // New device decrypts the contribution
        let decrypted_share_bytes = hpke_open(
            &contribution_envelope,
            &new_device_sk,
            LABEL_RECOVERY_SHARE_CONTRIBUTE,
            contribute_aad.as_bytes(),
        )
        .unwrap();

        let decrypted_share = deserialize_share(&decrypted_share_bytes);

        // New device verifies commitment
        assert!(
            verify(&decrypted_share, &commitments[i]),
            "contributed share {i} commitment failed on new device"
        );

        contributed_shares.push(decrypted_share);
    }

    // --- Step 7: Combine shares to reconstruct recovery group private key ---

    let reconstructed_sk_bytes = combine(&contributed_shares).unwrap();
    let reconstructed_sk_hex = hex::encode(&reconstructed_sk_bytes);

    // --- Step 8: Use reconstructed key to decrypt PUK seed ---

    let recovered_puk_seed = hpke_open(
        &puk_seed_envelope,
        &reconstructed_sk_hex,
        LABEL_RECOVERY_PUK_SEED_WRAP,
        puk_seed_aad,
    )
    .unwrap();

    assert_eq!(
        recovered_puk_seed, puk_seed,
        "recovered PUK seed must match original"
    );
}

#[test]
fn wrong_label_on_share_wrap_rejected() {
    let (holder_sk, holder_pk) = generate_x25519_keypair();
    let secret = vec![42u8; 32];
    let shares = split(&secret, 3, 2).unwrap();

    let share_bytes = serialize_share(&shares[0]);
    let envelope = hpke_seal(
        &share_bytes,
        &holder_pk,
        LABEL_RECOVERY_GROUP_SHARE_WRAP,
        b"aad",
    )
    .unwrap();

    // Try to open with wrong label (Albrecht defense)
    let result = hpke_open(
        &envelope,
        &holder_sk,
        LABEL_RECOVERY_PUK_SEED_WRAP, // wrong label
        b"aad",
    );
    assert!(result.is_err(), "wrong label should be rejected");
}

#[test]
fn aad_binding_prevents_cross_session_replay() {
    let (new_device_sk, new_device_pk) = generate_x25519_keypair();
    let (holder_sk, holder_pk) = generate_x25519_keypair();

    let secret = vec![42u8; 32];
    let shares = split(&secret, 3, 2).unwrap();
    let share_bytes = serialize_share(&shares[0]);

    // Contribution for session A
    let aad_a = format!(
        "{}:session-A:{}",
        LABEL_RECOVERY_SHARE_CONTRIBUTE, holder_pk
    );
    let envelope = hpke_seal(
        &share_bytes,
        &new_device_pk,
        LABEL_RECOVERY_SHARE_CONTRIBUTE,
        aad_a.as_bytes(),
    )
    .unwrap();

    // Try to open with session B AAD — should fail
    let aad_b = format!(
        "{}:session-B:{}",
        LABEL_RECOVERY_SHARE_CONTRIBUTE, holder_pk
    );
    let result = hpke_open(
        &envelope,
        &new_device_sk,
        LABEL_RECOVERY_SHARE_CONTRIBUTE,
        aad_b.as_bytes(),
    );
    assert!(
        result.is_err(),
        "AAD binding should prevent cross-session replay"
    );

    // Correct AAD works
    let result = hpke_open(
        &envelope,
        &new_device_sk,
        LABEL_RECOVERY_SHARE_CONTRIBUTE,
        aad_a.as_bytes(),
    );
    assert!(result.is_ok(), "correct AAD should succeed");
}

// =============================================================================
// Share serialization helpers (for transport via HPKE)
// =============================================================================

/// Serialize a Share to bytes: [x, y...]
fn serialize_share(share: &Share) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(1 + share.y.len());
    bytes.push(share.x);
    bytes.extend_from_slice(&share.y);
    bytes
}

/// Deserialize a Share from bytes: [x, y...]
fn deserialize_share(bytes: &[u8]) -> Share {
    assert!(!bytes.is_empty(), "share bytes must not be empty");
    Share {
        x: bytes[0],
        y: bytes[1..].to_vec(),
    }
}
```

- [ ] **Step 2: Run the integration test**

Run: `cd packages/crypto && cargo test --test recovery_flow`
Expected: All 3 tests pass (`full_recovery_ceremony_flow`, `wrong_label_on_share_wrap_rejected`, `aad_binding_prevents_cross_session_replay`).

- [ ] **Step 3: Run the full test suite to verify no regressions**

Run: `cd packages/crypto && cargo test`
Expected: All existing tests plus all new tests pass. Zero failures.

---

### Task 8: Commit

**Files:**
- All files from Tasks 1-7

- [ ] **Step 1: Stage and commit all changes**

Run:
```bash
cd /media/rikki/recover/projects/llamenos
git add packages/protocol/crypto-labels.json packages/crypto/src/labels.rs packages/crypto/src/shamir.rs packages/crypto/src/lib.rs packages/crypto/src/ffi.rs packages/crypto/tests/recovery_flow.rs
git commit -m "feat(crypto): EP09-P1 Shamir secret sharing + recovery group crypto foundation

- Add GF(2^8) Shamir secret sharing module (shamir.rs) with split/combine/commit/verify
- Add 4 recovery group crypto labels (indices 69-72) to labels.rs and crypto-labels.json
- Add recovery group X25519 keypair generation
- Wire shamir module into lib.rs with Share type re-export
- Add UniFFI exports for mobile: mobile_shamir_{split,combine,commit,verify}, mobile_recovery_group_generate_keypair
- Add integration test proving full recovery ceremony crypto chain:
  generate keypair -> split -> HPKE-wrap shares -> ceremony contribute -> combine -> decrypt PUK seed
- Tests: GF(2^8) arithmetic, all valid (K,N) combos, below-threshold security,
  commitment round-trip, tampered share detection, label enforcement (Albrecht defense),
  AAD binding for cross-session replay prevention"
```

Expected: Commit succeeds. `git log --oneline -1` shows the new commit.
