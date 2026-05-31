//! BIP-340 Schnorr signature operations for secp256k1.
//!
//! Implements `bip340_sign_prehash` and `bip340_verify_prehash` per the BIP-340
//! specification using the `k256` crate (RustCrypto).
//!
//! BIP-340 reference: <https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki>
//!
//! ## Key formats
//! - Secret key: 32-byte big-endian scalar
//! - Public key: 32-byte x-only representation (BIP-340 §Public key encoding)
//! - Signature: 64 bytes — first 32 bytes are the R x-coordinate, next 32 are s
//! - Message: 32-byte prehash (caller must hash the message before passing it)

use k256::schnorr::{Signature, SigningKey, VerifyingKey};

use crate::errors::CryptoError;

// ── Signing ───────────────────────────────────────────────────────────────────

/// Sign a prehashed 32-byte message with a BIP-340 Schnorr signature.
///
/// Uses deterministic nonce generation per BIP-340 §Signing with `aux_rand`
/// set to 32 zero bytes (safe for non-interactive use, but callers that want
/// hedged randomness should use [`bip340_sign_prehash_with_aux_rand`]).
///
/// Returns the 64-byte BIP-340 signature `(r ‖ s)`.
pub fn bip340_sign_prehash(secret_key: &[u8; 32], msg: &[u8; 32]) -> Result<[u8; 64], CryptoError> {
    let aux_rand = [0u8; 32];
    bip340_sign_prehash_with_aux_rand(secret_key, msg, &aux_rand)
}

/// Sign a prehashed 32-byte message using BIP-340 Schnorr with explicit `aux_rand`.
///
/// The `aux_rand` parameter provides additional entropy to the nonce derivation
/// function (BIP-340 §Signing step 6).  Pass `[0u8; 32]` for deterministic
/// (reproducible) signing; pass fresh random bytes for hedged signing.
///
/// Returns the 64-byte BIP-340 signature `(r ‖ s)`.
pub fn bip340_sign_prehash_with_aux_rand(
    secret_key: &[u8; 32],
    msg: &[u8; 32],
    aux_rand: &[u8; 32],
) -> Result<[u8; 64], CryptoError> {
    let signing_key =
        SigningKey::from_bytes(secret_key).map_err(|_| CryptoError::InvalidSecretKey)?;

    let sig = signing_key
        .sign_prehash_with_aux_rand(msg, aux_rand)
        .map_err(|_| CryptoError::SignatureVerificationFailed)?;

    Ok(sig.to_bytes())
}

// ── Verification ──────────────────────────────────────────────────────────────

/// Verify a BIP-340 Schnorr signature over a prehashed 32-byte message.
///
/// * `pubkey`  — 32-byte x-only BIP-340 public key
/// * `msg`     — 32-byte prehash that was signed
/// * `sig`     — 64-byte BIP-340 Schnorr signature `(r ‖ s)`
///
/// Returns `Ok(true)` for a valid signature, `Ok(false)` for an invalid one.
/// Returns `Err` only if `pubkey` or `sig` are structurally malformed in a way
/// that makes verification impossible (e.g., pubkey point not on the curve).
///
/// # Edge cases handled per BIP-340
/// - `R` with odd y-coordinate → invalid (returns `Ok(false)`)
/// - `s ≥ n` (order overflow) → invalid (returns `Ok(false)`)
/// - Point-at-infinity result from `s·G − e·P` → invalid (returns `Ok(false)`)
/// - All-zero message or all-`0xff` message → verified normally (no special-casing)
/// - Public key not on curve or exceeding field size → `Ok(false)`
pub fn bip340_verify_prehash(
    pubkey: &[u8; 32],
    msg: &[u8; 32],
    sig: &[u8; 64],
) -> Result<bool, CryptoError> {
    // An invalid pubkey encoding means the signature cannot be valid.
    let verifying_key = match VerifyingKey::from_bytes(pubkey) {
        Ok(k) => k,
        Err(_) => return Ok(false),
    };

    // A structurally invalid signature cannot be valid.
    let signature = match Signature::try_from(sig.as_slice()) {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };

    // verify_raw implements BIP-340 §Verification directly.
    Ok(verifying_key.verify_raw(msg, &signature).is_ok())
}

/// Derive the BIP-340 x-only public key (32 bytes) from a 32-byte secret key.
pub fn bip340_pubkey_from_secret(secret_key: &[u8; 32]) -> Result<[u8; 32], CryptoError> {
    let signing_key =
        SigningKey::from_bytes(secret_key).map_err(|_| CryptoError::InvalidSecretKey)?;
    Ok(signing_key.verifying_key().to_bytes().into())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn from_hex32(s: &str) -> [u8; 32] {
        let v = hex::decode(s).unwrap_or_else(|_| panic!("bad hex32: {s}"));
        v.try_into().unwrap_or_else(|_| panic!("not 32 bytes: {s}"))
    }

    fn from_hex64(s: &str) -> [u8; 64] {
        let v = hex::decode(s).unwrap_or_else(|_| panic!("bad hex64: {s}"));
        v.try_into().unwrap_or_else(|_| panic!("not 64 bytes: {s}"))
    }

    // ── Official BIP-340 test vectors (sign + verify) ─────────────────────────
    //
    // Source: https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv
    // These vectors cover secret key → public key derivation, deterministic
    // signing with a specific aux_rand, and signature verification.

    struct SignVector {
        sk_hex: &'static str,
        public_key: &'static str,
        aux_rand: &'static str,
        msg: &'static str,
        signature: &'static str,
    }

    const SIGN_VECTORS: &[SignVector] = &[
        // index 0 — all-zero message, all-zero aux_rand
        SignVector {
            sk_hex: "0000000000000000000000000000000000000000000000000000000000000003",
            public_key: "F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9",
            aux_rand:   "0000000000000000000000000000000000000000000000000000000000000000",
            msg:        "0000000000000000000000000000000000000000000000000000000000000000",
            signature:  "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0",
        },
        // index 1 — non-trivial key and message
        SignVector {
            sk_hex: "B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF",
            public_key: "DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659",
            aux_rand:   "0000000000000000000000000000000000000000000000000000000000000001",
            msg:        "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
            signature:  "6896BD60EEAE296DB48A229FF71DFE071BDE413E6D43F917DC8DCF8C78DE33418906D11AC976ABCCB20B091292BFF4EA897EFCB639EA871CFA95F6DE339E4B0A",
        },
        // index 2 — Pi/e-digit derived constants; confirms aux_rand mixing is correct
        SignVector {
            sk_hex: "C90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B14E5C9",
            public_key: "DD308AFEC5777E13121FA72B9CC1B7CC0139715309B086C960E18FD969774EB8",
            aux_rand:   "C87AA53824B4D7AE2EB035A2B5BBBCCC080E76CDC6D1692C4B0B62D798E6D906",
            msg:        "7E2D58D8B3BCDF1ABADEC7829054F90DDA9805AAB56C77333024B9D0A508B75C",
            signature:  "5831AAEED7B44BB74E5EAB94BA9D4294C49BCF2A60728D8B4C200F50DD313C1BAB745879A5AD954A72C45A91C3A51D3C7ADEA98D82F8481E0E1E03674A6F3FB7",
        },
        // index 3 — all-0xff message, all-0xff aux_rand (max-value scalars, boundary case)
        SignVector {
            sk_hex: "0B432B2677937381AEF05BB02A66ECD012773062CF3FA2549E44F58ED2401710",
            public_key: "25D1DFF95105F5253C4022F628A996AD3A0D95FBF21D468A1B33F8C160D8F517",
            aux_rand:   "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
            msg:        "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
            signature:  "7EB0509757E246F19449885651611CB965ECC1A187DD51B64FDA1EDC9637D5EC97582B9CB13DB3933705B32BA982AF5AF25FD78881EBB32771FC5922EFC66EA3",
        },
    ];

    #[test]
    fn bip340_pubkey_derivation() {
        for (i, v) in SIGN_VECTORS.iter().enumerate() {
            let sk = from_hex32(v.sk_hex);
            let expected_pk = from_hex32(v.public_key);
            let got_pk = bip340_pubkey_from_secret(&sk)
                .unwrap_or_else(|e| panic!("vector {i}: pubkey derivation failed: {e}"));
            assert_eq!(got_pk, expected_pk, "vector {i}: public key mismatch");
        }
    }

    #[test]
    fn bip340_sign_official_vectors() {
        for (i, v) in SIGN_VECTORS.iter().enumerate() {
            let sk = from_hex32(v.sk_hex);
            let msg = from_hex32(v.msg);
            let aux = from_hex32(v.aux_rand);
            let expected_sig = from_hex64(v.signature);

            let sig = bip340_sign_prehash_with_aux_rand(&sk, &msg, &aux)
                .unwrap_or_else(|e| panic!("vector {i}: sign failed: {e}"));
            assert_eq!(sig, expected_sig, "vector {i}: signature mismatch");
        }
    }

    #[test]
    fn bip340_verify_official_vectors() {
        for (i, v) in SIGN_VECTORS.iter().enumerate() {
            let pk = from_hex32(v.public_key);
            let msg = from_hex32(v.msg);
            let sig = from_hex64(v.signature);

            let ok = bip340_verify_prehash(&pk, &msg, &sig)
                .unwrap_or_else(|e| panic!("vector {i}: verify error: {e}"));
            assert!(ok, "vector {i}: expected valid signature to verify");
        }
    }

    // ── Round-trip tests ──────────────────────────────────────────────────────

    #[test]
    fn bip340_roundtrip_all_zero_message() {
        let sk = from_hex32("0000000000000000000000000000000000000000000000000000000000000003");
        let msg = [0u8; 32];
        let pk = bip340_pubkey_from_secret(&sk).unwrap();
        let sig = bip340_sign_prehash(&sk, &msg).unwrap();
        let ok = bip340_verify_prehash(&pk, &msg, &sig).unwrap();
        assert!(ok, "all-zero message round-trip must verify");
    }

    #[test]
    fn bip340_roundtrip_all_ff_message() {
        let sk = from_hex32("0B432B2677937381AEF05BB02A66ECD012773062CF3FA2549E44F58ED2401710");
        let msg = [0xffu8; 32];
        let pk = bip340_pubkey_from_secret(&sk).unwrap();
        let sig = bip340_sign_prehash(&sk, &msg).unwrap();
        let ok = bip340_verify_prehash(&pk, &msg, &sig).unwrap();
        assert!(ok, "all-0xff message round-trip must verify");
    }

    // ── Invalid signature tests ───────────────────────────────────────────────

    #[test]
    fn bip340_wrong_message_fails() {
        let sk = from_hex32("0000000000000000000000000000000000000000000000000000000000000003");
        let pk = bip340_pubkey_from_secret(&sk).unwrap();
        let msg = [0u8; 32];
        let sig = bip340_sign_prehash(&sk, &msg).unwrap();

        let mut wrong_msg = msg;
        wrong_msg[0] ^= 0x01;

        let ok = bip340_verify_prehash(&pk, &wrong_msg, &sig).unwrap();
        assert!(!ok, "verification with wrong message must fail");
    }

    #[test]
    fn bip340_wrong_pubkey_fails() {
        let sk = from_hex32("0000000000000000000000000000000000000000000000000000000000000003");
        let pk = bip340_pubkey_from_secret(&sk).unwrap();
        let msg = [0u8; 32];
        let sig = bip340_sign_prehash(&sk, &msg).unwrap();

        // Use a different valid pubkey (from vector 1)
        let wrong_pk =
            from_hex32("DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659");
        let ok = bip340_verify_prehash(&wrong_pk, &msg, &sig).unwrap();
        assert!(!ok, "verification with wrong pubkey must fail");
    }

    #[test]
    fn bip340_tampered_signature_fails() {
        let sk = from_hex32("B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF");
        let pk = bip340_pubkey_from_secret(&sk).unwrap();
        let msg = from_hex32("243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89");
        let sig = bip340_sign_prehash(&sk, &msg).unwrap();

        let mut bad_sig = sig;
        bad_sig[63] ^= 0x01; // flip last bit of s

        let ok = bip340_verify_prehash(&pk, &msg, &bad_sig).unwrap();
        assert!(!ok, "verification with tampered signature must fail");
    }

    #[test]
    fn bip340_all_zero_signature_fails() {
        let pk = from_hex32("DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659");
        let msg = from_hex32("243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89");
        let zero_sig = [0u8; 64];

        // r=0 is not a valid x-coordinate on the curve.  Must be rejected.
        let result = bip340_verify_prehash(&pk, &msg, &zero_sig);
        match result {
            Ok(ok) => assert!(!ok, "all-zero signature must not verify"),
            Err(_) => {} // rejected as malformed — also correct
        }
    }

    // ── BIP-340 official FALSE vectors (verify-only) ──────────────────────────
    //
    // Source: https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv
    // These are the "result=FALSE" rows (indices 5-14).
    // Each must be rejected by bip340_verify_prehash — either Ok(false) or Err.

    struct VerifyVector {
        pubkey: &'static str,
        msg: &'static str,
        signature: &'static str,
        comment: &'static str,
    }

    const FALSE_VECTORS: &[VerifyVector] = &[
        // index 5 — public key not on the curve
        VerifyVector {
            pubkey:    "EEFDEA4CDB677750A420FEE807EACF21EB9898AE79B9768766E4FAA04A2D4A34",
            msg:       "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
            signature: "6CFF5C3BA86C69EA4B7376F31A9BCB4F74C1976089B2D9963DA2E5543E17776969E89B4C5564D00349106B8497785DD7D1D713A8AE82B32FA79D5F7FC407D39B",
            comment:   "public key not on the curve",
        },
        // index 6 — has_even_y(R) is false
        VerifyVector {
            pubkey:    "DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659",
            msg:       "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
            signature: "FFF97BD5755EEEA420453A14355235D382F6472F8568A18B2F057A14602975563CC27944640AC607CD107AE10923D9EF7A73C643E166BE5EBEAFA34B1AC553E2",
            comment:   "has_even_y(R) is false",
        },
        // index 8 — negated s value
        VerifyVector {
            pubkey:    "DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659",
            msg:       "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
            signature: "6CFF5C3BA86C69EA4B7376F31A9BCB4F74C1976089B2D9963DA2E5543E177769961764B3AA9B2FFCB6EF947B6887A226E8D7C93E00C5ED0C1834FF0D0C2E6DA6",
            comment:   "negated s value",
        },
        // index 13 — s == curve order (out-of-range scalar)
        VerifyVector {
            pubkey:    "DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659",
            msg:       "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
            signature: "6CFF5C3BA86C69EA4B7376F31A9BCB4F74C1976089B2D9963DA2E5543E177769FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
            comment:   "sig[32:64] is equal to curve order",
        },
        // index 14 — public key x exceeds field size
        VerifyVector {
            pubkey:    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC30",
            msg:       "243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89",
            signature: "6CFF5C3BA86C69EA4B7376F31A9BCB4F74C1976089B2D9963DA2E5543E17776969E89B4C5564D00349106B8497785DD7D1D713A8AE82B32FA79D5F7FC407D39B",
            comment:   "public key exceeds field size",
        },
    ];

    #[test]
    fn bip340_false_vectors_rejected() {
        for v in FALSE_VECTORS {
            let pk = from_hex32(v.pubkey);
            let msg = from_hex32(v.msg);
            let sig = from_hex64(v.signature);

            let result = bip340_verify_prehash(&pk, &msg, &sig);
            match result {
                Ok(ok) => assert!(!ok, "FALSE vector '{}' must not verify", v.comment),
                Err(_) => {} // rejected as malformed — also correct
            }
        }
    }

    // ── Key boundary tests ────────────────────────────────────────────────────

    #[test]
    fn bip340_invalid_secret_key_rejected() {
        // Secret key = 0 is invalid for secp256k1
        let sk = [0u8; 32];
        let result = bip340_sign_prehash(&sk, &[0u8; 32]);
        assert!(result.is_err(), "zero secret key must be rejected");
    }

    #[test]
    fn bip340_different_aux_rand_produces_different_signatures() {
        let sk = from_hex32("B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF");
        let msg = from_hex32("243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89");
        let aux0 = [0u8; 32];
        let aux1 = [1u8; 32];

        let sig0 = bip340_sign_prehash_with_aux_rand(&sk, &msg, &aux0).unwrap();
        let sig1 = bip340_sign_prehash_with_aux_rand(&sk, &msg, &aux1).unwrap();

        // Different aux_rand → different nonce → different R → different signature
        assert_ne!(
            sig0, sig1,
            "different aux_rand must produce different signatures"
        );

        // Both must still verify
        let pk = bip340_pubkey_from_secret(&sk).unwrap();
        assert!(bip340_verify_prehash(&pk, &msg, &sig0).unwrap());
        assert!(bip340_verify_prehash(&pk, &msg, &sig1).unwrap());
    }
}
