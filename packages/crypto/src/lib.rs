//! # llamenos-core
//!
//! Shared cryptographic core for the Llamenos project.
//!
//! This crate provides all cryptographic operations used across all platforms:
//! - **Desktop (Tauri v2)**: native Rust dependency
//! - **Mobile (iOS/Android)**: UniFFI-generated Swift/Kotlin bindings
//! - **Web browser**: compiled to WASM via wasm-bindgen
//!
//! ## Crypto Architecture (v3)
//!
//! - **Signing**: Ed25519 (ed25519-dalek)
//! - **Key agreement**: X25519 (x25519-dalek)
//! - **Envelope encryption**: HPKE RFC 9180 (DHKEM(X25519) + HKDF-SHA256 + AES-256-GCM)
//! - **Symmetric**: AES-256-GCM (PIN storage, items_key)
//! - **KDF**: HKDF-SHA256
//! - **Subkey derivation**: HMAC-SHA256
//! - **PIN key derivation**: PBKDF2-SHA256 (600K iterations)
//!
//! ## Security Design
//!
//! - All key material uses `Zeroize` on drop — no GC unpredictability
//! - Domain separation via label registry prevents cross-context key reuse
//! - HPKE provides authenticated encryption with label binding
//! - Label enforcement at decrypt (Albrecht defense) rejects mismatched envelopes

#[cfg(feature = "mobile")]
uniffi::setup_scaffolding!();

// === New v3 modules (Ed25519/X25519 + HPKE) ===
pub mod auth;
pub mod device_keys;
pub mod hpke_envelope;
pub mod labels;
pub mod puk;
pub mod sigchain;

#[cfg(feature = "mls")]
pub mod mls;
pub mod sframe;

// === Stable modules (curve-independent) ===
pub mod blind_index;
pub mod errors;

// === Legacy modules (secp256k1 — kept during transition, removed in Phase 6) ===
pub mod ecies;
pub mod encryption_legacy;
pub mod keys_legacy;
pub mod nostr;
pub mod provisioning;
pub mod auth_legacy;
pub mod legacy;

// Temporarily keep `encryption` and `keys` as pub aliases for existing imports
pub use encryption_legacy as encryption;
pub use keys_legacy as keys;

#[cfg(feature = "mobile")]
mod ffi;
#[cfg(feature = "mobile")]
mod ffi_v3;

#[cfg(feature = "wasm")]
mod wasm;

// Re-export core types (new v3 API)
pub use auth::AuthToken;
pub use device_keys::{DeviceKeyState, EncryptedDeviceKeys};
pub use errors::CryptoError;
pub use hpke_envelope::HpkeEnvelope;
pub use labels::*;
pub use puk::PukState;
pub use sigchain::{SigchainLink, SigchainVerifiedState};

// Re-export legacy types for backward compatibility during transition
pub use ecies::{KeyEnvelope, RecipientKeyEnvelope};
pub use encryption_legacy::{EncryptedKeyData, EncryptedMessage, EncryptedNote};
pub use keys_legacy::KeyPair;
pub use nostr::SignedNostrEvent;
