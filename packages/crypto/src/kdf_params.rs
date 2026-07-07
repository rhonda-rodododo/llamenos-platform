//! Shared Argon2id KDF parameters.
//!
//! Centralized to ensure device_keys and encryption modules use identical
//! parameters. The `test-kdf` feature gates fast parameters for test/debug builds.

// C-M3: Prevent test-kdf from being compiled into binaries that ship to real
// devices. The Android build (see scripts/build-mobile.sh) always builds its
// x86_64-only, test-kdf, emulator-debug variant with the `--release` Cargo
// profile for speed — so `debug_assertions` cannot distinguish it from a real
// release build. Production binaries only ever target aarch64/arm (Android
// arm64-v8a/armeabi-v7a, iOS aarch64-apple-ios) or wasm32 (browser); test-kdf
// must never reach those targets.
#[cfg(all(
    feature = "test-kdf",
    any(target_arch = "aarch64", target_arch = "arm", target_arch = "wasm32")
))]
compile_error!(
    "The `test-kdf` feature MUST NOT be enabled for aarch64/arm/wasm32 targets. \
     It reduces Argon2id KDF resistance from ~seconds to ~microseconds per guess, \
     making brute-force of device PIN encryption trivially fast. test-kdf is only \
     for the x86_64 Android emulator build."
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
