//! Error types for llamenos-core cryptographic operations.

use thiserror::Error;

#[derive(Error, Debug)]
#[cfg_attr(feature = "mobile", derive(uniffi::Error))]
#[cfg_attr(feature = "mobile", uniffi(flat_error))]
pub enum CryptoError {
    #[error("Invalid secret key: must be 32 bytes hex")]
    InvalidSecretKey,

    #[error("Invalid public key: must be 32 bytes x-only hex")]
    InvalidPublicKey,

    #[error("Invalid ephemeral public key")]
    InvalidEphemeralKey,

    #[error("ECDH shared secret computation failed")]
    EcdhFailed,

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: authentication tag mismatch")]
    DecryptionFailed,

    #[error("Invalid hex encoding: {0}")]
    HexError(#[from] hex::FromHexError),

    #[error("Invalid nonce length: expected 24 bytes")]
    InvalidNonce,

    #[error("Invalid ciphertext: too short")]
    InvalidCiphertext,

    #[error("Key derivation failed: {0}")]
    KeyDerivationFailed(String),

    #[error("Signature verification failed")]
    SignatureVerificationFailed,

    #[error("Invalid nsec bech32 encoding")]
    InvalidNsec,

    #[error("Invalid npub bech32 encoding")]
    InvalidNpub,

    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Wrong PIN or corrupted data")]
    WrongPin,

    #[error("Invalid PIN: must be 4-6 digits")]
    InvalidPin,
}
