//! Key generation and management.
//!
//! Provides secp256k1 keypair generation with Nostr bech32 encoding (nsec/npub).

use bech32::{Bech32, Hrp};
use k256::{elliptic_curve::sec1::ToEncodedPoint, SecretKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::errors::CryptoError;

/// A secp256k1 keypair with Nostr bech32 encodings.
///
/// `secret_key_hex` is wrapped in `Zeroizing<String>` so it is wiped from memory on drop.
/// On the mobile FFI boundary, use `PublicKeyPair` instead — `KeyPair` is never exported
/// to Swift/Kotlin directly.
#[derive(Debug, Clone)]
pub struct KeyPair {
    /// hex-encoded 32-byte secret key (zeroized on drop)
    pub secret_key_hex: Zeroizing<String>,
    /// hex-encoded 32-byte x-only public key
    pub public_key: String,
    /// bech32-encoded secret key (nsec1...)
    pub nsec: String,
    /// bech32-encoded public key (npub1...)
    pub npub: String,
}

/// Mobile-safe keypair type — excludes secret key material.
///
/// Returned by UniFFI-exported keygen functions. The secret key never crosses
/// the FFI boundary; callers use the stateful loadKey/loadKeyFromNsec pattern.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct PublicKeyPair {
    /// hex-encoded 32-byte x-only public key
    pub public_key: String,
    /// bech32-encoded public key (npub1...)
    pub npub: String,
}

/// Internal: generate a new random secp256k1 keypair (full KeyPair with secret material).
pub fn generate_keypair() -> KeyPair {
    let sk = SecretKey::random(&mut OsRng);
    let pk = sk.public_key();

    let sk_bytes = Zeroizing::new(sk.to_bytes()); // zeroized on drop
    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    // x-only = skip the 0x02/0x03 prefix
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = Zeroizing::new(hex::encode(*sk_bytes));
    let public_key = hex::encode(pk_xonly);

    let nsec = bech32::encode::<Bech32>(Hrp::parse("nsec").unwrap(), &sk_bytes)
        .expect("bech32 encode nsec");
    let npub = bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), pk_xonly)
        .expect("bech32 encode npub");

    KeyPair {
        secret_key_hex,
        public_key,
        nsec,
        npub,
    }
}

/// Internal: derive a keypair from an nsec bech32 string.
pub fn keypair_from_nsec(nsec: &str) -> Result<KeyPair, CryptoError> {
    let (hrp, data) = bech32::decode(nsec).map_err(|_| CryptoError::InvalidNsec)?;
    if hrp.as_str() != "nsec" || data.len() != 32 {
        return Err(CryptoError::InvalidNsec);
    }
    let data = Zeroizing::new(data); // zeroize the decoded key bytes on drop

    let sk = SecretKey::from_slice(&data).map_err(|_| CryptoError::InvalidSecretKey)?;
    let pk = sk.public_key();

    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = Zeroizing::new(hex::encode(&data[..]));
    let public_key = hex::encode(pk_xonly);

    let npub = bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), pk_xonly)
        .expect("bech32 encode npub");

    Ok(KeyPair {
        secret_key_hex,
        public_key,
        nsec: nsec.to_string(),
        npub,
    })
}

/// Internal: derive a keypair from a 64-char hex secret key.
pub fn keypair_from_secret_key_hex(secret_key_hex: &str) -> Result<KeyPair, CryptoError> {
    let sk_bytes = Zeroizing::new(hex::decode(secret_key_hex).map_err(CryptoError::HexError)?);
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let sk = SecretKey::from_slice(&sk_bytes).map_err(|_| CryptoError::InvalidSecretKey)?;
    let pk = sk.public_key();

    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = Zeroizing::new(hex::encode(&sk_bytes[..]));
    let public_key = hex::encode(pk_xonly);

    let nsec = bech32::encode::<Bech32>(Hrp::parse("nsec").unwrap(), &sk_bytes)
        .expect("bech32 encode nsec");
    let npub = bech32::encode::<Bech32>(Hrp::parse("npub").unwrap(), pk_xonly)
        .expect("bech32 encode npub");

    Ok(KeyPair {
        secret_key_hex,
        public_key,
        nsec,
        npub,
    })
}

/// Mobile FFI exports — return PublicKeyPair only (no secret material crosses the FFI boundary).
#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn generate_keypair_mobile() -> PublicKeyPair {
    let kp = generate_keypair();
    PublicKeyPair {
        public_key: kp.public_key,
        npub: kp.npub,
    }
}

#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn keypair_from_nsec_mobile(nsec: &str) -> Result<PublicKeyPair, CryptoError> {
    let kp = keypair_from_nsec(nsec)?;
    Ok(PublicKeyPair {
        public_key: kp.public_key,
        npub: kp.npub,
    })
}

#[cfg(feature = "mobile")]
#[uniffi::export]
pub fn keypair_from_secret_key_hex_mobile(
    secret_key_hex: &str,
) -> Result<PublicKeyPair, CryptoError> {
    let kp = keypair_from_secret_key_hex(secret_key_hex)?;
    Ok(PublicKeyPair {
        public_key: kp.public_key,
        npub: kp.npub,
    })
}

/// Get the x-only public key (hex) from a secret key (hex).
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn get_public_key(secret_key_hex: &str) -> Result<String, CryptoError> {
    let sk_bytes = hex::decode(secret_key_hex).map_err(CryptoError::HexError)?;
    if sk_bytes.len() != 32 {
        return Err(CryptoError::InvalidSecretKey);
    }

    let sk = SecretKey::from_slice(&sk_bytes).map_err(|_| CryptoError::InvalidSecretKey)?;
    let pk = sk.public_key();
    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    Ok(hex::encode(pk_xonly))
}

/// Validate an nsec bech32 string.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn is_valid_nsec(nsec: &str) -> bool {
    match bech32::decode(nsec) {
        Ok((hrp, data)) => hrp.as_str() == "nsec" && data.len() == 32,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_and_validate() {
        let kp = generate_keypair();
        assert!(kp.nsec.starts_with("nsec1"));
        assert!(kp.npub.starts_with("npub1"));
        assert_eq!(kp.secret_key_hex.len(), 64);
        assert_eq!(kp.public_key.len(), 64);
        assert!(is_valid_nsec(&kp.nsec));
    }

    #[test]
    fn roundtrip_nsec() {
        let kp = generate_keypair();
        let restored = keypair_from_nsec(&kp.nsec).unwrap();
        assert_eq!(kp.public_key, restored.public_key);
        assert_eq!(kp.secret_key_hex, restored.secret_key_hex);
    }

    #[test]
    fn get_pubkey_from_secret() {
        let kp = generate_keypair();
        let pk = get_public_key(&kp.secret_key_hex).unwrap();
        assert_eq!(pk, kp.public_key);
    }

    #[test]
    fn roundtrip_hex() {
        let kp = generate_keypair();
        let restored = keypair_from_secret_key_hex(&kp.secret_key_hex).unwrap();
        assert_eq!(kp.public_key, restored.public_key);
        assert_eq!(kp.nsec, restored.nsec);
        assert_eq!(kp.npub, restored.npub);
    }

    #[test]
    fn invalid_nsec_rejected() {
        assert!(!is_valid_nsec("not_an_nsec"));
        assert!(!is_valid_nsec("npub1abc"));
    }
}
