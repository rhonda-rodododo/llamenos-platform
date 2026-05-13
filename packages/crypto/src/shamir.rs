// Shamir Secret Sharing over GF(2^8)
//
// Primitive polynomial: x^8 + x^4 + x^3 + x + 1 (0x11b — same as AES).
// Each byte of the secret is split independently.
//
// Share representation:
//   x : u8   — evaluation point (1..=255, never 0)
//   y : Vec<u8> — one y-coordinate per secret byte

use rand::{RngCore, rngs::OsRng};
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};

use crate::errors::CryptoError;

// ── GF(2^8) arithmetic ─────────────────────────────────────────────────────

/// Multiply two elements in GF(2^8) with the AES primitive polynomial (0x11b).
fn gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut result: u8 = 0;
    for _ in 0..8 {
        if b & 1 == 1 {
            result ^= a;
        }
        let high_bit = a & 0x80;
        a = a.wrapping_shl(1);
        if high_bit != 0 {
            a ^= 0x1b; // low byte of 0x11b
        }
        b >>= 1;
    }
    result
}

/// Invert an element in GF(2^8) using Fermat's little theorem: a^(2^8 - 2) = a^254.
/// Panics on zero (no inverse).
fn gf_inv(a: u8) -> u8 {
    assert!(a != 0, "GF(2^8) inverse of zero is undefined");
    // a^254 = a^(2^8 - 2) in GF(2^8)
    let mut result = 1u8;
    let mut base = a;
    let mut exp: u8 = 254;
    while exp > 0 {
        if exp & 1 == 1 {
            result = gf_mul(result, base);
        }
        base = gf_mul(base, base);
        exp >>= 1;
    }
    result
}

// ── Split / combine ────────────────────────────────────────────────────────

/// Evaluate polynomial f(x) = coefficients[0] + coefficients[1]*x + ... at x.
fn eval_poly(coefficients: &[u8], x: u8) -> u8 {
    // Horner's method in GF(2^8)
    let mut result = 0u8;
    for &c in coefficients.iter().rev() {
        result = gf_mul(result, x) ^ c;
    }
    result
}

/// Split `secret` into `total` shares requiring `threshold` to reconstruct.
/// Returns (x_point, y_bytes) pairs where y_bytes has one entry per secret byte.
pub fn split(
    secret: &[u8],
    total: u8,
    threshold: u8,
) -> Result<Vec<(u8, Vec<u8>)>, CryptoError> {
    if threshold < 2 {
        return Err(CryptoError::InvalidInput(
            "threshold must be at least 2".into(),
        ));
    }
    if total < threshold {
        return Err(CryptoError::InvalidInput(
            "total shares must be >= threshold".into(),
        ));
    }
    if total == 0 || threshold == 0 {
        return Err(CryptoError::InvalidInput(
            "total and threshold must be > 0".into(),
        ));
    }
    if secret.is_empty() {
        return Err(CryptoError::InvalidInput("secret must not be empty".into()));
    }

    let mut rng = OsRng;
    let secret_len = secret.len();
    // Build one polynomial per secret byte.
    // f(x) = secret[i] + r_1*x + r_2*x^2 + ... + r_{k-1}*x^{k-1}
    let mut polys: Vec<Vec<u8>> = Vec::with_capacity(secret_len);
    for &s in secret {
        let mut poly = vec![s]; // constant term = secret byte
        for _ in 1..threshold {
            let mut r = [0u8; 1];
            rng.fill_bytes(&mut r);
            poly.push(r[0]);
        }
        polys.push(poly);
    }

    // Evaluate at x = 1, 2, ..., total
    let shares: Vec<(u8, Vec<u8>)> = (1..=total)
        .map(|x| {
            let ys: Vec<u8> = polys.iter().map(|poly| eval_poly(poly, x)).collect();
            (x, ys)
        })
        .collect();

    Ok(shares)
}

/// Reconstruct secret using Lagrange interpolation over GF(2^8).
/// `shares` is a slice of (x, y) pairs (y has one entry per secret byte).
pub fn combine(shares: &[(u8, Vec<u8>)]) -> Result<Vec<u8>, CryptoError> {
    if shares.is_empty() {
        return Err(CryptoError::InvalidInput("no shares provided".into()));
    }
    let secret_len = shares[0].1.len();
    if shares.iter().any(|(_, y)| y.len() != secret_len) {
        return Err(CryptoError::InvalidInput(
            "shares have inconsistent y lengths".into(),
        ));
    }

    let mut secret = vec![0u8; secret_len];
    for byte_idx in 0..secret_len {
        let mut value = 0u8;
        for (i, &(xi, ref yi)) in shares.iter().enumerate() {
            // Lagrange basis polynomial numerator and denominator at x=0
            let mut num = 1u8;
            let mut den = 1u8;
            for (j, &(xj, _)) in shares.iter().enumerate() {
                if i != j {
                    // numerator: product of (0 - x_j) = x_j (since -1 = 1 in GF(2))
                    num = gf_mul(num, xj);
                    // denominator: product of (x_i - x_j) = x_i ^ x_j (XOR in GF)
                    den = gf_mul(den, xi ^ xj);
                }
            }
            let lagrange = gf_mul(num, gf_inv(den));
            value ^= gf_mul(yi[byte_idx], lagrange);
        }
        secret[byte_idx] = value;
    }

    Ok(secret)
}

// ── Commitment ─────────────────────────────────────────────────────────────

/// JSON wire format for a Shamir share (matches the Kotlin ShamirShare data class).
#[derive(Serialize, Deserialize)]
pub struct ShamirShareJson {
    pub x: u8,
    pub y: String, // hex
}

/// Compute SHA-256 commitment over x || y_bytes.
pub fn commit(x: u8, y_bytes: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update([x]);
    hasher.update(y_bytes);
    hasher.finalize().to_vec()
}

/// Verify that SHA-256(x || y_bytes) == commitment_bytes.
pub fn verify(x: u8, y_bytes: &[u8], commitment_bytes: &[u8]) -> bool {
    let expected = commit(x, y_bytes);
    expected == commitment_bytes
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gf_mul_identity() {
        for a in 1..=255u8 {
            assert_eq!(gf_mul(a, 1), a);
            assert_eq!(gf_mul(1, a), a);
        }
    }

    #[test]
    fn gf_mul_commutative() {
        for a in 0..=15u8 {
            for b in 0..=15u8 {
                assert_eq!(gf_mul(a, b), gf_mul(b, a));
            }
        }
    }

    #[test]
    fn gf_inv_roundtrip() {
        for a in 1..=255u8 {
            assert_eq!(gf_mul(a, gf_inv(a)), 1);
        }
    }

    #[test]
    fn split_combine_32_byte_secret() {
        let secret: Vec<u8> = (0..32).collect();
        let shares = split(&secret, 5, 3).unwrap();
        assert_eq!(shares.len(), 5);

        // Combine any 3 shares
        let subset = vec![shares[0].clone(), shares[2].clone(), shares[4].clone()];
        let recovered = combine(&subset).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn split_combine_threshold_exact() {
        let secret = b"this is a 32-byte secret value!!".to_vec();
        assert_eq!(secret.len(), 32);
        let shares = split(&secret, 3, 3).unwrap();
        let recovered = combine(&shares).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn wrong_shares_produce_garbage() {
        let secret: Vec<u8> = (0..32).collect();
        let shares = split(&secret, 5, 3).unwrap();

        // Only 2 of 3 required — should not recover correctly
        let subset = vec![shares[0].clone(), shares[1].clone()];
        let bad = combine(&subset).unwrap();
        assert_ne!(bad, secret);
    }

    #[test]
    fn commitment_roundtrip() {
        let x = 2u8;
        let y = vec![0xaau8; 32];
        let c = commit(x, &y);
        assert!(verify(x, &y, &c));
        assert!(!verify(x, &vec![0xbb; 32], &c));
        assert!(!verify(3, &y, &c));
    }
}
