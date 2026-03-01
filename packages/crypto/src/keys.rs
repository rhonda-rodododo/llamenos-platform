//! Key generation and management.
//!
//! Provides secp256k1 keypair generation with Nostr bech32 encoding (nsec/npub).

use bech32::{Bech32, Hrp};
use k256::{
    elliptic_curve::sec1::ToEncodedPoint,
    SecretKey,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

use crate::errors::CryptoError;

/// A secp256k1 keypair with Nostr bech32 encodings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "mobile", derive(uniffi::Record))]
pub struct KeyPair {
    /// hex-encoded 32-byte secret key
    pub secret_key_hex: String,
    /// hex-encoded 32-byte x-only public key
    pub public_key: String,
    /// bech32-encoded secret key (nsec1...)
    pub nsec: String,
    /// bech32-encoded public key (npub1...)
    pub npub: String,
}

/// Generate a new random secp256k1 keypair.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn generate_keypair() -> KeyPair {
    let sk = SecretKey::random(&mut OsRng);
    let pk = sk.public_key();

    let sk_bytes = sk.to_bytes();
    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    // x-only = skip the 0x02/0x03 prefix
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = hex::encode(sk_bytes);
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

/// Derive a keypair from an nsec bech32 string.
#[cfg_attr(feature = "mobile", uniffi::export)]
pub fn keypair_from_nsec(nsec: &str) -> Result<KeyPair, CryptoError> {
    let (hrp, data) = bech32::decode(nsec).map_err(|_| CryptoError::InvalidNsec)?;
    if hrp.as_str() != "nsec" || data.len() != 32 {
        return Err(CryptoError::InvalidNsec);
    }

    let sk = SecretKey::from_slice(&data).map_err(|_| CryptoError::InvalidSecretKey)?;
    let pk = sk.public_key();

    let pk_point = pk.to_encoded_point(true);
    let pk_compressed = pk_point.as_bytes();
    let pk_xonly = &pk_compressed[1..];

    let secret_key_hex = hex::encode(&data);
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
    fn invalid_nsec_rejected() {
        assert!(!is_valid_nsec("not_an_nsec"));
        assert!(!is_valid_nsec("npub1abc"));
    }
}
