# Epic 350: Wire iOS Server Event Decryption via UniFFI

## Overview

The Rust crypto crate exports `decrypt_server_event_hex` (XChaCha20-Poly1305 decryption of Nostr relay events), and Android already calls it successfully. The iOS UniFFI bindings are stale — generated before this function was added — so `CryptoService.swift` has a stub that always throws. This epic regenerates the bindings and wires the real FFI call.

## Current State

**Rust FFI** (`packages/crypto/src/ffi.rs` lines 274-306):
```rust
#[uniffi::export]
pub fn decrypt_server_event_hex(encrypted_hex: &str, key_hex: &str) -> Result<String, CryptoError>
```
- Takes hex-encoded `nonce_24 + ciphertext` and 64-char hex key
- Returns decrypted UTF-8 JSON string
- Fully tested (3 test cases in `ffi::tests`)

**Android** (`apps/android/.../CryptoService.kt` lines 451-458): Working — calls `org.llamenos.core.decryptServerEventHex` directly.

**iOS** (`apps/ios/Sources/Services/CryptoService.swift` lines 63-66): Stub that throws:
```swift
private func ffiDecryptServerEventHex(encryptedHex: String, keyHex: String) throws -> String {
    // TODO: Wire up UniFFI binding once packages/crypto exports decryptServerEventHex
    throw CryptoServiceError.noKeyLoaded
}
```

**iOS bindings** (`apps/ios/Sources/Generated/LlamenosCore.swift`): Stale — missing `decryptServerEventHex`.

## Implementation Plan

### Phase 1: Regenerate UniFFI Bindings

1. Pull latest code on Mac M4:
   ```bash
   ssh mac 'cd ~/projects/llamenos && git pull'
   ```

2. Rebuild XCFramework + regenerate Swift bindings:
   ```bash
   ssh mac 'cd ~/projects/llamenos/packages/crypto && ./scripts/build-mobile.sh ios'
   ```

3. Copy artifacts to iOS app:
   ```bash
   # Bindings
   scp mac:~/projects/llamenos/packages/crypto/dist/ios/LlamenosCore.swift \
       apps/ios/Sources/Generated/LlamenosCore.swift

   # XCFramework (rsync the directory)
   rsync -a mac:~/projects/llamenos/packages/crypto/dist/ios/LlamenosCoreFFI.xcframework/ \
       apps/ios/LlamenosCoreFFI.xcframework/
   ```

4. Verify `decryptServerEventHex` appears in the regenerated `LlamenosCore.swift`.

### Phase 2: Wire the Real FFI Call

Replace the stub in `apps/ios/Sources/Services/CryptoService.swift`:

```swift
// FROM:
private func ffiDecryptServerEventHex(encryptedHex: String, keyHex: String) throws -> String {
    // TODO: Wire up UniFFI binding once packages/crypto exports decryptServerEventHex
    throw CryptoServiceError.noKeyLoaded
}

// TO:
private func ffiDecryptServerEventHex(encryptedHex: String, keyHex: String) throws -> String {
    try decryptServerEventHex(encryptedHex: encryptedHex, keyHex: keyHex)
}
```

This mirrors the pattern used by every other `ffi*` method in the same file (e.g., `ffiComputeSasCode` at line 59-61).

### Phase 3: Verify

1. Run iOS unit tests:
   ```bash
   bun run ios:test
   ```
   Expect CryptoServiceTests 36/36 pass. (KeychainServiceTests -34018 failures are expected in SPM test runner.)

2. Build iOS app on simulator:
   ```bash
   ssh mac 'cd ~/projects/llamenos/apps/ios && xcodegen generate && \
     xcodebuild build -scheme Llamenos-Package -destination "platform=iOS Simulator,name=iPhone 17" -quiet'
   ```

3. Smoke test: launch on simulator, confirm relay events render (previously they would fail silently due to the thrown error).

## Key Files

| File | Change |
|------|--------|
| `apps/ios/Sources/Services/CryptoService.swift` | Replace stub with real FFI call (1 line) |
| `apps/ios/Sources/Generated/LlamenosCore.swift` | Regenerate from Rust (adds `decryptServerEventHex`) |
| `apps/ios/LlamenosCoreFFI.xcframework/` | Rebuild from Rust on Mac M4 |
| `packages/crypto/src/ffi.rs` | Reference only — no changes needed |

## Risk

- **Low**. The function is fully tested in Rust, Android uses it in production, and the wiring pattern is identical to every other FFI method in `CryptoService.swift`.
- XCFramework rebuild takes ~5-10 minutes on Mac M4.
- Bindings and XCFramework must match (same build) or UniFFI checksum mismatch will crash at runtime.

## Acceptance Criteria

- [ ] `decryptServerEventHex` appears in `apps/ios/Sources/Generated/LlamenosCore.swift`
- [ ] `CryptoService.ffiDecryptServerEventHex` calls real FFI (no stub, no throw)
- [ ] `bun run ios:test` passes (CryptoServiceTests 36/36)
- [ ] iOS app builds and relay events decrypt on simulator
