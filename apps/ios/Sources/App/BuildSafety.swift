import Foundation

// MARK: - Build Safety: DEBUG Flag Leak Prevention
//
// This file ensures that DEBUG-only code paths (mock crypto injection, auth bypass,
// keychain reset, test identity registration) cannot accidentally ship in Release builds.
//
// Standard Xcode behavior: Release configuration does NOT define DEBUG.
// This file adds a defense-in-depth runtime assertion that catches misconfigured
// custom build configurations or CI pipelines that accidentally set DEBUG in Release.

/// Namespace for production build integrity checks.
enum BuildSafety {

    /// Call once at app launch (from LlamenosApp.init or .onAppear) in Release builds.
    /// Verifies that no DEBUG-only code paths are active by checking for indicators
    /// that would only be present if DEBUG were incorrectly defined.
    ///
    /// In a correctly configured Release build, this function does nothing.
    /// If DEBUG code somehow leaked into a Release binary, the assertions
    /// below would have caught it at compile time via #if RELEASE_HARDENED && DEBUG.
    static func verifyProductionIntegrity() {
        #if !DEBUG
        // Runtime belt-and-suspenders: verify no test launch arguments are being
        // injected into what should be a production binary.
        let dangerousArgs = [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
            "--test-register",
            "--test-volunteer-identity"
        ]
        for arg in dangerousArgs {
            if ProcessInfo.processInfo.arguments.contains(arg) {
                // In production, test launch arguments should never be present.
                // If they are, something is seriously wrong with the build or launch config.
                assertionFailure("[BuildSafety] Test launch argument \(arg) detected in non-DEBUG build")
            }
        }
        #endif
    }
}

// MARK: - Compile-Time Safety Net
//
// If a custom Xcode configuration (e.g. "Staging") accidentally defines BOTH
// the RELEASE_HARDENED and DEBUG flags, this #error stops the build cold.
// To use: add RELEASE_HARDENED=1 to Swift Active Compilation Conditions
// in your Release (and any Release-derived) build configurations.
//
// Standard Release builds: DEBUG is absent, RELEASE_HARDENED is present -> OK
// Standard Debug builds: DEBUG is present, RELEASE_HARDENED is absent -> OK
// Misconfigured build: both present -> compile error

#if RELEASE_HARDENED && DEBUG
#error("RELEASE_HARDENED and DEBUG are both defined. This build would ship debug code paths (mock crypto, auth bypass, keychain reset) in a hardened binary. Fix the build configuration.")
#endif
