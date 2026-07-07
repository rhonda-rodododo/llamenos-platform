//! Shared Argon2id KDF parameters.
//!
//! Centralized to ensure device_keys and encryption modules use identical
//! parameters. The `test-kdf` feature gates fast parameters for test/debug builds.

// C-M3: Prevent test-kdf from being compiled into release builds.
// debug_assertions is disabled in --release; this fires before any other code compiles.
// The Android emulator build (scripts/build-mobile.sh, CI android-e2e job) uses the
// `emulator` Cargo profile instead of `--release` for exactly this reason — it inherits
// release's optimizations but keeps debug_assertions on, so it passes this guard while
// a real `--release` build (shipped to production devices/browsers) still fails.
#[cfg(all(feature = "test-kdf", not(debug_assertions)))]
compile_error!(
    "The `test-kdf` feature MUST NOT be enabled in release builds. \
     It reduces Argon2id KDF resistance from ~seconds to ~microseconds per guess, \
     making brute-force of device PIN encryption trivially fast."
);

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
