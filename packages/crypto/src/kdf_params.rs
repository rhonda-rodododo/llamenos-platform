//! Shared Argon2id KDF parameters.
//!
//! Centralized to ensure device_keys and encryption modules use identical
//! parameters. The `test-kdf` feature gates fast parameters for test/debug builds.

/// KDF version byte stored in encrypted key material for future-proofing.
/// v2 = Argon2id (64MB, 3 iterations, 4 parallelism).
pub const KDF_VERSION: u8 = 2;

/// Argon2id parameters — tuned for GPU/ASIC resistance.
/// The `test-kdf` feature uses minimal params so emulator tests finish in seconds.
#[cfg(not(feature = "test-kdf"))]
pub const ARGON2_M_COST_KIB: u32 = 65_536; // 64 MB
#[cfg(not(feature = "test-kdf"))]
pub const ARGON2_T_COST: u32 = 3; // 3 iterations
#[cfg(not(feature = "test-kdf"))]
pub const ARGON2_P_COST: u32 = 4; // 4 lanes

#[cfg(feature = "test-kdf")]
pub const ARGON2_M_COST_KIB: u32 = 1_024; // 1 MB
#[cfg(feature = "test-kdf")]
pub const ARGON2_T_COST: u32 = 1;
#[cfg(feature = "test-kdf")]
pub const ARGON2_P_COST: u32 = 1;
