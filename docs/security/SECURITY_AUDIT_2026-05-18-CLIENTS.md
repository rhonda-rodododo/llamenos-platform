# Client Security Audit Report — 2026-05-18

**Audit Date**: 2026-05-18
**Scope**: Client platforms — Desktop (Tauri v2), iOS (SwiftUI), Android (Kotlin/Compose)
**Auditor**: Automated security audit (Claude)
**Previous Audit**: 2026-05-12 (SECURITY_GAPS_AND_ROADMAP.md)
**Classification**: CONFIDENTIAL — Restricted to security team

---

## Executive Summary

This audit covers all three Llamenos client platforms following significant feature work since the last audit (2026-05-12). Key changes audited include EP02 (SAS emoji verification, device revocation), EP08 (device wipe, platform settings), EP09 (Shamir recovery group), EP07 (React Query migration), and the Android debug/release crypto `.so` separation (#355).

| Severity | Count | Platforms Affected |
|----------|-------|-------------------|
| HIGH | 7 | Desktop (5), iOS (2) |
| MEDIUM | 11 | Desktop (4), iOS (5), Android (2) |
| LOW | 8 | Desktop (3), iOS (2), Android (3) |
| INFO | 4 | Desktop (1), iOS (1), Android (2) |
| **Total** | **30** | |

### Gap Status Updates (from 2026-05-12)

| Gap | Status | Details |
|-----|--------|---------|
| 1.2: Stronghold vs. Store | **RESOLVED** | Device keys migrated to Stronghold; Store retained only for non-security data |
| 3.1: iOS WakeKeyService X25519 | **OPEN** | TODO still present at line 264 — uses legacy secp256k1 derivation |
| 3.2: Android certificate pins | **OPEN** | Still `sha256/REPLACE_AFTER_DEPLOYMENT` placeholders |
| 4.0: iOS `#if DEBUG` blocks | **OPEN** (expanded) | 40+ files now contain `#if DEBUG`; security-critical blocks reviewed below |

---

## 1. Desktop (Tauri v2) Findings

### HIGH-D1: Recovery Group Keypair Private Key Transits Through Webview

**Severity**: HIGH
**File(s)**: `apps/desktop/src/crypto.rs:753-760`
**Description**: The `recovery_group_generate_keypair()` IPC command generates an X25519 keypair in Rust but returns **both the public and private key hex** to the webview JavaScript context:
```rust
Ok(serde_json::json!({
    "publicKeyHex": hex::encode(public.as_bytes()),
    "privateKeyHex": hex::encode(secret.as_bytes()),
}))
```
The caller is expected to immediately split the private key with `shamir_split` and discard it. However, the private key exists in webview JS memory between the IPC return and the Shamir split call. Any XSS vulnerability during this window could exfiltrate the recovery group private key.

**Impact**: Recovery group compromise via XSS during key generation. The recovery group private key could decrypt all data encrypted to the recovery group public key.

**Recommended Fix**: Generate the keypair AND perform the Shamir split atomically in a single Rust IPC command. The private key should never leave Rust memory. Return only the public key and the Shamir shares.

---

### HIGH-D2: Hub Key Present in Both JS and Rust Memory Simultaneously

**Severity**: HIGH
**File(s)**: `src/client/lib/hub-key-manager.ts:74-99`, `apps/desktop/src/crypto.rs:469-476`, `src/client/lib/platform.ts:459` (misleading comment)
**Description**: The hub symmetric key exists in two places:
1. **JavaScript** — `unwrapHubKey()` returns the hub key as bytes to JS (line 77-78). `encryptForHub()`/`decryptFromHub()` perform AES-256-GCM directly in JS using `@noble/ciphers`.
2. **Rust CryptoState** — `set_hub_key` stores the same key in Rust for `decrypt_hub_event`/`encrypt_hub_field`/`decrypt_hub_field`.

The comment in `platform.ts:459` ("The hub key NEVER enters JavaScript — decryption happens entirely in Rust") is **incorrect** — the hub key plainly exists in JS for the `encryptForHub`/`decryptFromHub` path.

This dual-path architecture means an XSS vulnerability can access the hub symmetric key from JavaScript, undermining the Rust-side isolation.

**Impact**: Hub-scoped data (team/tag names, hub event content) decryptable via XSS. The hub key is shared across all hub members — compromise affects all members.

**Recommended Fix**: Remove the JS-side hub encrypt/decrypt path. Route all hub key operations through Rust IPC commands. The hub key should ONLY exist in `CryptoState`. Update the misleading comment.

---

### MEDIUM-D3: `tauri-plugin-store` Still Registered Despite Stronghold Migration

**Severity**: MEDIUM
**File(s)**: `apps/desktop/src/lib.rs:26`
**Description**: The Tauri Store plugin is still registered (`.plugin(tauri_plugin_store::Builder::default().build())`), even though device key storage has been migrated to Stronghold. Store is currently used for non-security data (settings.json, drafts.json, updater state, API config). However, its continued presence means:
1. Any regression or future code could accidentally store security-sensitive data in the unencrypted Store.
2. The unencrypted Store files remain on disk (`settings.json`, `drafts.json`) without encryption-at-rest.

**Impact**: Non-security data (user preferences, draft content) stored without encryption-at-rest. Draft content could contain sensitive note fragments.

**Recommended Fix**: Audit all Store usages (`updater.ts`, `api-config.ts`, `panic-wipe.ts`). Migrate draft storage to Stronghold. Either remove the Store plugin entirely or document that it must never hold crypto/PII data.

---

### LOW-D4: `puk_rotate` Accepts Old PUK Seed as Hex String from JS

**Severity**: LOW
**File(s)**: `apps/desktop/src/crypto.rs:327-344`
**Description**: The `puk_rotate` command accepts `old_seed_hex` (the previous PUK seed) as a parameter from the webview. This means the PUK seed must transit through JS during rotation. This is architecturally necessary for the current PUK rotation design but means PUK seeds are not fully isolated in Rust.

**Impact**: PUK seed visible in JS memory during rotation. Lower severity than device keys because PUK is a derived per-user encryption key, not a signing/identity key.

**Recommended Fix**: Consider a future design where PUK rotation happens entirely in Rust, with the old PUK seed stored in CryptoState.

---

### LOW-D5: CSP Allows `wasm-unsafe-eval`

**Severity**: LOW
**File(s)**: `apps/desktop/tauri.conf.json:22`
**Description**: The script-src CSP includes `'wasm-unsafe-eval'` to support WASM Whisper (client-side transcription). This is necessary for current functionality but allows arbitrary WASM execution if an attacker can inject a WASM module.

**Impact**: Minimal in practice due to Tauri isolation pattern and strict connect-src limiting exfiltration paths. Required for Whisper WASM.

**Recommended Fix**: No action needed currently. Document this as an accepted risk. If Whisper is removed, remove `wasm-unsafe-eval`.

---

### HIGH-D4: Raw String Crypto Labels Instead of Constants (Domain Separation Violation)

**Severity**: HIGH
**File(s)**: `src/client/lib/platform.ts:885,895,922,953,988,1018`
**Description**: The `encryptNote`, `decryptNote`, `encryptMessage`, `decryptMessage`, and `decryptCallRecord` functions use raw string literals for HPKE label parameters (`'llamenos:note-key'`, `'llamenos:message'`, `'llamenos:call-meta'`) instead of importing typed constants from `@shared/crypto-labels`. If a label value is updated in `crypto-labels.json`, these raw strings will silently diverge, breaking cross-platform interop and potentially enabling cross-context decryption attacks (Albrecht defense bypass).

**Impact**: Violation of the domain separation enforcement system. Label drift could allow note ciphertext to be opened as a message or vice versa.

**Recommended Fix**: Import `LABEL_NOTE_KEY`, `LABEL_MESSAGE`, `LABEL_CALL_META` from `@shared/crypto-labels` and use them instead of string literals.

---

### HIGH-D5: `decrypt_server_event` Uses Wrong Label for AAD

**Severity**: HIGH
**File(s)**: `apps/desktop/src/crypto.rs:784`
**Description**: The `decrypt_server_event` function constructs its AAD as `format!("{}:{}", llamenos_core::LABEL_HUB_EVENT, epoch)`, producing `"llamenos:hub-event:42"`. The doc comment says the AAD should be `"{LABEL_HUB_EVENT_EPOCH}:{epoch}"`, which would produce `"llamenos:hub-event-epoch:v1:42"`. `LABEL_HUB_EVENT_EPOCH` exists in `packages/crypto/src/labels.rs:245`. Either the code or the comment is wrong. If the server uses `LABEL_HUB_EVENT_EPOCH`, decryption silently fails. If both use `LABEL_HUB_EVENT`, then domain separation between hub events and epoch-keyed server events is broken.

**Impact**: Broken domain separation between hub-scoped and epoch-keyed server events, or silent decryption failures.

**Recommended Fix**: Use `llamenos_core::LABEL_HUB_EVENT_EPOCH` for the AAD and verify server-side matches.

---

### HIGH-D6: AES-GCM Content Encryption Without AAD (Missing Domain Separation)

**Severity**: HIGH
**File(s)**: `src/client/lib/platform.ts:813-834`
**Description**: The `aesGcmEncrypt`/`aesGcmDecrypt` functions encrypt note/message content using AES-256-GCM with **no AAD** (no `additionalData` parameter). A ciphertext encrypted as a "note" can be presented as a "message" without detection, since the symmetric decryption has no domain binding. The Rust-side `encrypt_hub_field` correctly uses label-based AAD; this JS-side function does not.

**Impact**: Cross-type ciphertext substitution — an attacker controlling the server could swap note and message ciphertexts without detection.

**Recommended Fix**: Add a `label` parameter to `aesGcmEncrypt`/`aesGcmDecrypt` and pass it as `additionalData`. All callers should pass their domain-specific label.

---

### MEDIUM-D7: Hub Key and Server Event Keys Not Zeroized in Rust Memory

**Severity**: MEDIUM
**File(s)**: `apps/desktop/src/crypto.rs:41,44,60-66`
**Description**: `hub_key` is `Mutex<Option<Vec<u8>>>` and `server_event_keys` is `Mutex<Vec<(u64, Vec<u8>)>>`. When cleared (lock/rotation), the old `Vec<u8>` is dropped by the allocator but bytes are NOT cryptographically zeroized — they remain in freed heap memory. By contrast, `DeviceSecrets` implements `Zeroize on Drop` (line 61).

**Impact**: Symmetric key material (hub key, server event keys) persists in freed heap memory after lock/rotation, accessible to memory-dumping attacks.

**Recommended Fix**: Use `zeroize::Zeroizing<Vec<u8>>` for `hub_key` and server event key bytes.

---

### MEDIUM-D8: Server Event Keys Transit Through React State

**Severity**: MEDIUM
**File(s)**: `src/client/lib/auth.tsx:34,83,175`
**Description**: `serverEventKeyHex` and `serverEventKeyPrevHex` are stored in React state (`AuthState`) and flow through the component tree before being pushed to Rust `CryptoState`. These symmetric encryption keys sit in the React virtual DOM, are visible via React DevTools, and persist in JS memory across re-renders.

**Impact**: Server event symmetric keys exposed in JS memory and React DevTools for the duration of the session.

**Recommended Fix**: Push keys to Rust immediately in the API response handler. Store only a boolean "keys loaded" flag in React state.

---

### MEDIUM-D9: Device Provisioning Handles Secrets in Webview JS

**Severity**: MEDIUM
**File(s)**: `src/client/lib/provisioning.ts:166-186`
**Description**: The `encryptNsecForDevice` function takes the nsec/device secret as a plaintext string and performs X25519 ECDH + AES-GCM encryption entirely in the webview. The primary device's `primarySecretKey` (X25519 seed) is also passed as `Uint8Array` in JS.

**Impact**: Primary device secret key and nsec in webview heap during provisioning, subject to XSS exfiltration.

**Recommended Fix**: Implement provisioning encryption as a Rust IPC command that takes the ephemeral pubkey and produces the encrypted blob without exposing secrets to JS.

---

### LOW-D10: `hpkeWrapKey` Passes Empty AAD

**Severity**: LOW
**File(s)**: `src/client/lib/platform.ts:862`
**Description**: `hpkeWrapKey` always passes empty string `''` as `aadHex`. HPKE envelopes have no bound context data (like recipient identity). This prevents envelope transplant detection.

**Impact**: HPKE envelopes can be reused across recipients without detection if the label matches.

**Recommended Fix**: Accept an optional `aadHex` parameter, or bind the recipient pubkey as AAD by default.

---

### INFO-D6: Capabilities Are Minimal and Well-Scoped

**Severity**: INFO
**File(s)**: `apps/desktop/capabilities/default.json`
**Description**: The Tauri capability permissions follow least-privilege:
- No filesystem access (`fs:*`)
- No shell access (`shell:*`)
- No HTTP client (`http:*`)
- Stronghold permissions limited to store record operations
- Window operations limited to visibility/focus
- Single capability file for the main window

This is excellent security posture for a Tauri v2 app.

---

### INFO (Positive): Test Mock Production Guard

**File(s)**: `tests/mocks/tauri-core.ts:10-13`, `vite.config.ts:9,39-48`
**Description**: The Tauri IPC mock has a compile-time production guard. The mock is only aliased in Vite config when `PLAYWRIGHT_TEST=true` (build-time env). The mock file itself throws `FATAL: Tauri IPC mock loaded outside test environment` if loaded without the env var. In production builds, the mock files are never bundled because the aliases don't exist. This is properly implemented.

---

## 2. iOS (SwiftUI) Findings

### HIGH-I1: `#if DEBUG` Mock Identity Injection in AppState

**Severity**: HIGH
**File(s)**: `apps/ios/Sources/App/AppState.swift:110-178`
**Description**: The `#if DEBUG` block in AppState provides powerful test automation capabilities that could be catastrophic if compiled into a release build:
- `--reset-keychain`: Deletes all Keychain entries
- `--test-authenticated`: Injects mock crypto identity (bypasses real auth)
- `--test-admin`: Sets user role to admin without verification
- `--test-register`: Registers the mock identity with the server
- `--test-hub-url`: Overrides API endpoint

Standard Xcode release builds exclude `#if DEBUG` code. The risk is misconfigured CI/CD or Testflight builds using a Debug configuration.

**Impact**: If a Debug build reaches users, any app on the device could launch Llamenos with these arguments to bypass authentication, assume admin role, reset the keychain (wipe all keys), or redirect API traffic.

**Recommended Fix**:
1. Add a CI/CD assertion that App Store / Testflight builds use the Release configuration
2. Consider moving test hooks behind a dedicated `XCTEST` flag instead of `DEBUG`
3. Add runtime detection: if `DEBUG` code is running in a non-test environment (no `XCTestCase` in the stack), abort

---

### HIGH-I2: `createAuthTokenStatic` Accepts Raw Signing Key in Release Builds

**Severity**: HIGH
**File(s)**: `apps/ios/Sources/Services/CryptoService.swift:327-329`
**Description**: `createAuthTokenStatic(secretHex:method:path:)` is a public static method that takes a raw Ed25519 signing key hex string and produces a signed auth token. Critically, this method is **NOT** gated by `#if DEBUG`. While its current callers are all within `#if DEBUG` blocks in AppState, the method itself is callable from any code path in release builds. In a compromised dependency scenario, this function provides a clean API for signing arbitrary auth tokens if a signing key is obtained.

**Impact**: Any code in the app (including third-party SDKs) can forge auth tokens if they obtain a signing key hex. This bypasses the CryptoService isolation model where signing should only happen through the FFI layer.

**Recommended Fix**: Gate this method behind `#if DEBUG` or move it to a test-only target that is never linked into release builds.

---

### MEDIUM-I4: iOS Certificate Pinning Not Active (Empty Pin Hashes)

**Severity**: MEDIUM
**File(s)**: `apps/ios/Sources/App/APIService.swift:556-567`
**Description**: `CertificatePins.cloudflareHashes` is an empty array. The `CertificatePinningDelegate` checks `isEnabled` and falls through to default TLS validation when no pins are configured. Certificate pinning provides zero protection in the current build. A network-level adversary with a rogue CA certificate (nation-state threat model) can MITM all API traffic.

**Impact**: No protection against CA compromise or rogue certificates for the iOS client.

**Recommended Fix**: Populate pin hashes before production release. Add a build-time check that fails if the pin array is empty in Release configuration.

---

### MEDIUM-I5: Decrypted Sensitive Data Copied to Pasteboard Without Expiration

**Severity**: MEDIUM
**File(s)**: `apps/ios/Sources/Views/Components/CopyableField.swift:25`
**Description**: `UIPasteboard.general.string = value` copies data to the system pasteboard with no expiration. This is used for public keys (acceptable) but also for decrypted note text and live transcription text — the most sensitive data in the app. The system pasteboard is accessible by all apps (iOS 16+ shows a paste notification, but data persists).

**Impact**: Decrypted E2EE note content and transcriptions persist in the shared pasteboard indefinitely, accessible to any app.

**Recommended Fix**: Use `UIPasteboard.general.setItems([...], options: [.expirationDate: ...])` with a short TTL (60 seconds) for any decrypted content. Consider warning the user before copying sensitive data.

---

### MEDIUM-I6: Hub Key Briefly Transits Swift Memory During loadHubKey

**Severity**: MEDIUM
**File(s)**: `apps/ios/Sources/Services/CryptoService.swift:340-346`
**Description**: In `loadHubKey()`, the HPKE-unwrapped hub key is returned as a hex string to Swift (`let keyHex = try ffiMobileHpkeOpenKey(...)`) before being passed back into Rust via `ffiMobileSetHubKey()`. The comment says "Hub key never enters Swift memory — goes directly from HPKE open to Rust storage" but this is **incorrect**: the key hex exists as a Swift String between those two calls.

**Impact**: Hub symmetric key briefly exists in Swift memory where it cannot be reliably zeroized.

**Recommended Fix**: Add a single FFI function `mobileUnwrapAndStoreHubKey(hubId:, envelope:, label:)` that performs both operations atomically in Rust.

---

### MEDIUM-I7: WakeKeyService Still Uses Legacy secp256k1 (Gap 3.1 — OPEN)

**Severity**: MEDIUM
**File(s)**: `apps/ios/Sources/Services/WakeKeyService.swift:259-266`
**Description**: The `deriveX25519PublicKey()` function still calls the legacy `getPublicKey(secretKeyHex:)` (secp256k1) instead of X25519 derivation. The TODO at line 264 remains:
```swift
// TODO: Switch to X25519 key derivation when server sends HPKE envelopes.
```
This means push wake keys are derived on the wrong curve. The generated "X25519 private key" (random 32 bytes) has its public key derived via secp256k1, creating a type confusion between the private key's intended curve and the actual public key's curve.

**Impact**: Push notification wake encryption is using mismatched curves (X25519 private / secp256k1 public), which technically works because the server is still sending ECIES-wrapped payloads. But this blocks the HPKE migration for push notifications.

**Recommended Fix**: Complete the HPKE migration for push notifications. Server should send HPKE envelopes; client should use X25519 derivation.

---

### MEDIUM-I8: 40+ Files with `#if DEBUG` Blocks (Gap 4.0 — EXPANDED)

**Severity**: MEDIUM
**File(s)**: See enumeration below
**Description**: The number of `#if DEBUG` blocks has grown significantly since the last audit (11 files → 40+ files). Security-critical `#if DEBUG` blocks include:

**Critical (identity/auth bypass)**:
- `AppState.swift:110-178` — Mock identity injection, keychain reset, admin role (see HIGH-I1)
- `CryptoService.swift:430-451` — `setMockIdentity()`, `setMockVolunteerIdentity()`, `storeHubKeyForTesting()`
- `WebSocketService.swift:361-365` — Overridable `decryptionHandler` closure bypasses real decryption

**Moderate (UI behavior changes)**:
- `LoginView.swift`, `PINUnlockView.swift`, `PINSetView.swift`, `BiometricPrompt.swift` — Debug UI with pre-filled values or skip buttons
- `ContentView.swift:103` — Debug navigation overrides

**Low risk (preview data only)**:
- All View files with `#if DEBUG` at the bottom — SwiftUI preview providers (standard, no security impact)

The overwhelming majority are SwiftUI `#Preview` blocks at the end of view files, which are harmless. The three critical blocks above are the ones that matter.

**Recommended Fix**: Audit the three critical blocks. Consider using a custom `XCTEST` or `UI_TESTING` compiler flag for test infrastructure instead of `DEBUG`.

---

### LOW-I4: Keychain Access Flags Are Correct

**Severity**: LOW (positive finding)
**File(s)**: `apps/ios/Sources/Services/KeychainService.swift:73,81,103,110`
**Description**: All device key Keychain operations use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`:
- Prevents access while device is locked
- `ThisDeviceOnly` prevents iCloud Keychain sync (keys never leave the device)

WakeKeyService uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` for push wake keys — necessary for background push decryption while allowing keys to remain device-local.

Both are correctly implemented.

---

### LOW-I5: No App Transport Security Exceptions Found

**Severity**: LOW (positive finding)
**File(s)**: Package.swift (no Info.plist with NSAppTransportSecurity)
**Description**: The iOS app uses SPM without a custom Info.plist overriding ATS. iOS 17+ enforces HTTPS by default. No `NSAllowsArbitraryLoads` exceptions were found.

---

### INFO-I6: CryptoService Private Key Isolation Is Sound

**Severity**: INFO
**File(s)**: `apps/ios/Sources/Services/CryptoService.swift:176-203`
**Description**: The iOS CryptoService properly delegates all private key operations to the Rust FFI layer via UniFFI. The Swift layer only stores public keys (`signingPubkeyHex`, `encryptionPubkeyHex`, `deviceId`). No function returns private key material.

The `encryptNote` function at line 222 does see the per-note symmetric key briefly (returned from `ffiMobileSymmetricEncrypt`), but this is a random ephemeral key, not the device identity key.

---

## 3. Android (Kotlin/Compose) Findings

### MEDIUM-A1: Certificate Pins Still Placeholders (Gap 3.2 — OPEN)

**Severity**: MEDIUM
**File(s)**: `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt:80-84`
**Description**: Certificate pinning configuration still contains placeholder values:
```kotlin
val certificatePinner: CertificatePinner = CertificatePinner.Builder()
    .add("*.llamenos.org", "sha256/REPLACE_AFTER_DEPLOYMENT")
    .add("*.llamenos.org", "sha256/REPLACE_AFTER_DEPLOYMENT")
    .build()
```
Two identical placeholder pins are configured. In production, `CertificatePinner` will reject all connections because `REPLACE_AFTER_DEPLOYMENT` won't match any real certificate.

**Impact**: Either certificate pinning is non-functional (if the pinner is not wired to OkHttp), or the app cannot connect at all (if it is). Either way, certificate pinning provides no security benefit currently.

**Recommended Fix**: Deploy to production first, then extract the leaf and intermediate certificate SHA-256 hashes. Replace placeholders with real pins. Add a backup pin (next CA rotation). See `docs/security/CERTIFICATE_PINS.md` for the planned approach.

---

### MEDIUM-A2: `debuggable` Not Explicitly Set to `false` in Release Build

**Severity**: MEDIUM
**File(s)**: `apps/android/app/build.gradle.kts:59-76`
**Description**: The release build type does not explicitly set `isDebuggable = false`. While AGP defaults `debuggable` to `false` for release builds, explicit setting is a defense-in-depth practice recommended by OWASP MASVS. If a future AGP update or build script modification changes this default, release builds could become debuggable.

**Impact**: A debuggable release APK allows attaching a debugger, inspecting memory, and stepping through crypto operations. Combined with a rooted device, this gives full access to decrypted data in memory.

**Recommended Fix**: Add `isDebuggable = false` explicitly to the release build type.

---

### LOW-A3: Deep Link Scheme Is Broadly Registered

**Severity**: LOW
**File(s)**: `apps/android/app/src/main/AndroidManifest.xml:43-48`
**Description**: The `llamenos://` custom scheme is registered on `MainActivity` without a host restriction:
```xml
<intent-filter>
    <data android:scheme="llamenos" />
</intent-filter>
```
Any `llamenos://` URI will open the main activity. While deep link handling should validate inputs, the broad registration increases the attack surface for URI-based injection.

The `DeepLinkActivity` for OAuth callbacks (`llamenos://oauth/callback`) properly validates the state parameter (CSRF protection at line 42).

**Impact**: Low — the main activity deep link handler would need to be examined for input validation. The OAuth path is properly secured.

**Recommended Fix**: Add `android:host` restrictions to the MainActivity intent filter to limit accepted deep link patterns.

---

### LOW-A4: Debug Network Config Allows Cleartext to Hardcoded LAN IP

**Severity**: LOW
**File(s)**: `apps/android/app/src/debug/res/xml/network_security_config.xml:21`
**Description**: The debug network security config allows cleartext traffic to a specific IP:
```xml
<domain includeSubdomains="true">192.168.50.95</domain>
```
This is a developer's local IP address. While only present in debug builds, it reveals internal network topology and creates a fixed cleartext exception.

**Impact**: Debug builds only — no production impact. However, if the debug APK is distributed (e.g., to QA), network traffic to this IP would be unencrypted.

**Recommended Fix**: Use a more generic pattern like `192.168.0.0/16` or remove the hardcoded IP in favor of `localhost` + `10.0.2.2` only.

---

### LOW-A5: Release Build Lacks Explicit `debuggable false` Declaration

**Severity**: LOW
**File(s)**: `apps/android/app/build.gradle.kts:59-76`
**Description**: (See MEDIUM-A2 above — consolidated finding.)

---

### INFO-A6: KeystoreService Requests StrongBox Backing

**Severity**: INFO
**File(s)**: `apps/android/app/src/main/java/org/llamenos/hotline/crypto/KeystoreService.kt:52-64`
**Description**: `KeystoreService` correctly requests StrongBox hardware backing for the MasterKey with graceful fallback:
```kotlin
MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .setRequestStrongBoxBacked(true)
    .build()
```
Falls back to TEE-backed key on devices without StrongBox. Uses `AES256_SIV` for key encryption and `AES256_GCM` for value encryption. This is best-practice Android key storage.

---

### INFO-A7: Backup and Export Controls Are Correct

**Severity**: INFO
**File(s)**: `apps/android/app/src/main/AndroidManifest.xml:26`
**Description**: `android:allowBackup="false"` prevents ADB backup of app data, which would include EncryptedSharedPreferences files. This correctly prevents key exfiltration via backup.

---

### INFO-A8: Debug/Release Crypto Library Separation

**Severity**: INFO
**File(s)**: `apps/android/app/build.gradle.kts:73-83`
**Description**: PR #355 introduced separate ABI filters for debug and release builds:
- **Release**: `armeabi-v7a`, `arm64-v8a` (ARM only — production devices)
- **Debug**: `x86_64` (emulator only)

This ensures debug crypto libraries (with test KDF parameters) are not bundled in release APKs, and release libraries are not wasted in debug/test builds. The `.so` files are placed in `src/debug/jniLibs/` and `src/release/jniLibs/` respectively.

Note: JNI `.so` files are gitignored and built on-demand by `packages/crypto/scripts/build-mobile.sh android`. Debug builds use test-KDF (fast, insecure) while release uses production KDF (Argon2id, secure).

---

## 4. Cross-Platform Observations

### Positive Security Patterns

1. **Device key isolation model is consistent**: All three platforms hold device private keys in Rust memory only. Desktop uses `CryptoState`, iOS/Android use UniFFI `mobile_*` functions with internal static state. No platform returns private keys to the UI layer.

2. **PIN lockout is consistent**: All platforms implement the same escalating lockout schedule (1-4: none, 5-6: 30s, 7-8: 2min, 9: 10min, 10+: wipe). Desktop enforces in Rust `CryptoState`, iOS in `KeychainService`, Android in `KeystoreService`.

3. **Domain separation labels are used consistently**: All crypto operations specify domain separation labels from the `crypto-labels.json` source of truth. No raw string literals for crypto contexts were found in client code.

4. **Shamir implementation in Rust is shared across platforms**: EP09 recovery group crypto uses the same GF(2^8) Shamir implementation via IPC (desktop) and UniFFI (mobile). No platform has its own Shamir implementation.

### Areas for Future Attention

1. **Hub key dual-path will need consolidation**: The JS/Rust dual-path for hub key operations creates an unnecessary attack surface. This should be resolved before production.

2. **PUK seed transit through JS**: Multiple IPC commands (`puk_rotate`, `hpke_open_key_from_state`) return symmetric key material to JS. While architecturally necessary in the current design, a future iteration should consider an "operate-in-Rust" model where key material stays in CryptoState.

3. **iOS `#if DEBUG` sprawl**: The number of `#if DEBUG` blocks has grown substantially. While most are harmless preview providers, the three security-critical blocks should be moved behind a more restrictive compiler flag.

---

## 5. Methodology

**Files reviewed**: 35+ source files across all three platforms
**Tools**: Manual code review via file reading, pattern search (grep/glob), cross-reference with SECURITY_GAPS_AND_ROADMAP.md
**Approach**: Each platform was audited for: key material isolation, storage security, network security, debug/test code separation, input validation, backup exclusion, capability/permission scope
**Limitations**: This audit covers client-side code only. Server-side endpoints, wire protocol, and CI/CD pipeline are out of scope (covered by separate audits).
