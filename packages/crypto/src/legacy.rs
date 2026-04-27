//! Legacy secp256k1 / Nostr / XChaCha20-Poly1305 modules.
//!
//! These are retained during the transition from secp256k1 to Ed25519/X25519.
//! They will be deleted in Phase 6 (backend + cleanup) once all consumers
//! have migrated to the new HPKE-based primitives.
//!
//! DO NOT add new features to these modules. All new crypto work uses:
//! - `device_keys.rs` (Ed25519 + X25519 keypairs)
//! - `hpke_envelope.rs` (HPKE seal/open)
//! - `auth.rs` (Ed25519 auth tokens)

// Re-export legacy modules for existing consumers
pub mod keys {
    pub use crate::keys_legacy::*;
}

pub mod ecies {
    pub use crate::ecies::*;
}

pub mod nostr {
    pub use crate::nostr::*;
}

pub mod provisioning {
    pub use crate::provisioning::*;
}

pub mod encryption {
    pub use crate::encryption_legacy::*;
}

/// Legacy BIP-340 Schnorr auth token (for backward compatibility during transition).
pub mod auth_schnorr {
    pub use crate::auth_legacy::*;
}
