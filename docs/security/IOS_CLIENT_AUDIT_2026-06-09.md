# iOS Client Security & Completeness Audit

**Date:** 2026-06-09
**Auditor:** Security review (static analysis, no build)
**Scope:** `apps/ios/` — all Swift source, configuration, and entitlements
**Branch:** `audit-ios` from `cfd2b00f`

---

## Executive Summary

The iOS client demonstrates a **strong security posture** for a pre-production app. All cryptographic operations are correctly delegated to the Rust UniFFI crate (`packages/crypto`), secrets never enter Swift memory, Keychain attributes are properly configured, and certificate pinning is enforced with hard-fail semantics. Several prior audit findings (HTTP relay acceptance, keychain iCloud sync, SAS verification bypass) have been properly fixed.

**Critical findings:** 0
**High findings:** 2
**Medium findings:** 5
**Low findings:** 6
**Informational / Missing features:** 8

---

## 1. Keychain Security

### Status: GOOD

**Files reviewed:** `KeychainService.swift`, `WakeKeyService.swift`, `AuthService.swift`

| Check | Result |
|-------|--------|
| `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` on all items | ✅ All paths use this attribute |
| `kSecAttrSynchronizable: false` to block iCloud sync | ✅ Explicitly set on store + update |
| Biometric items use `.biometryCurrentSet` | ✅ Re-enrollment invalidates stored PIN |
| Wake key migration from legacy syncable storage | ✅ `migrateWakeKeyIfNeeded()` in WakeKeyService |
| No plaintext key storage | ✅ Device keys encrypted with PIN via Argon2 |
| Wipe clears all keychain items | ✅ `deleteAll()` uses service-scoped query |

**No findings.**

---

## 2. UniFFI Boundary (Swift ↔ Rust FFI)

### Status: GOOD

**Files reviewed:** `CryptoService.swift`, `LlamenosCoreExtensions.swift`

All crypto operations route through UniFFI FFI calls:
- Key generation: `mobileGenerateAndLoad` (Rust)
- Unlock/lock: `mobileUnlock` / `mobileLock` (Rust zeroization)
- HPKE seal/open: `mobileHpkeSeal*` / `mobileHpkeOpen*` (Rust)
- Symmetric encrypt/decrypt: `mobileSymmetricEncrypt` / `mobileSymmetricDecrypt` (Rust)
- Signing: `mobileSign` (Rust Ed25519)
- Hub keys, server event keys: stored exclusively in Rust `CryptoState`

**No pure-Swift crypto for security operations.** The only CryptoKit usage is `SHA256` in `CryptoService.sha256Hex()` for file checksums (non-security-critical). `CommonCrypto.CC_SHA256` is used in `CertificatePinningDelegate` for SPKI hashing — appropriate since it's comparing against known pin values, not performing cryptographic operations on secrets.

**Finding CS-1 (LOW): `sha256Hex` uses CryptoKit, not the Rust crate**
`CryptoService.swift:700` uses `CryptoKit.SHA256` for file checksums. While not a security vulnerability (it's for integrity checking, not secrecy), routing all hash operations through the Rust crate would maintain the single-implementation principle.

---

## 3. Network Security

### Status: GOOD with one medium finding

**Files reviewed:** `APIService.swift`, `WebSocketService.swift`, `Info.plist`, `project.yml`

| Check | Result |
|-------|--------|
| Certificate pinning | ✅ SPKI SHA-256 against Let's Encrypt intermediates, hard-fail on mismatch |
| HTTP rejection for API | ✅ `configure(hubURLString:)` rejects `http://` (except localhost) |
| WebSocket scheme enforcement | ✅ `connect(to:)` only accepts `wss://` and `https://` |
| ATS (App Transport Security) | ⚠️ No explicit `NSAppTransportSecurity` in Info.plist |
| Pin mismatch reporting | ✅ `SecurityEventReporter.reportPinMismatch` + Notification |
| Dynamic pin rotation | ✅ `PinListResponse` structure defined for server-signed updates |
| Localhost exemption for dev | ✅ Pinning delegate skips localhost/127.0.0.1 |

**Finding NS-1 (MEDIUM): No explicit `NSAppTransportSecurity` in Info.plist**
`Info.plist` lacks an explicit `NSAppTransportSecurity` dictionary with `NSAllowsArbitraryLoads = false`. While iOS 17+ enforces HTTPS by default, the absence makes the security posture non-auditable and non-explicit. This was flagged in a prior audit (2026-03-21) and planned but never implemented. Adding the explicit key prevents accidental future overrides and makes App Store review auditable.

**Finding NS-2 (LOW): WebSocket session lacks cert pinning delegate**
`WebSocketService.swift:161` creates its own `URLSession(configuration: config)` without the `CertificatePinningDelegate`. While the scheme enforcement (`wss://` only) prevents cleartext connections, the WebSocket session does not benefit from the SPKI pin checks that the API `URLSession` enforces. An attacker with a valid-but-wrong TLS certificate could intercept WebSocket traffic.

**Finding NS-3 (LOW): `performConnect()` converts `http://` to `ws://`**
`WebSocketService.swift:207-209`: While `connect(to:)` correctly rejects non-`wss://`/`https://` URLs, `performConnect()` has a code path that converts `http://` to `ws://`. This path should be unreachable due to the guard in `connect()`, but the dead code is misleading and fragile.

---

## 4. Deep Link Handling

### Status: GOOD

**Files reviewed:** `LlamenosApp.swift:handleDeepLink`, `DeviceLinkViewModel.swift`

| Check | Result |
|-------|--------|
| Scheme validation | ✅ Only `llamenos://` accepted |
| Auth-gated routes | ✅ Most routes require `authStatus == .unlocked` |
| Device link relay validation | ✅ `isValidRelayHost()` blocks private IPs, localhost, link-local, IPv4-mapped IPv6 |
| Relay domain pinning to hub | ✅ H5b: Relay host must match configured hub host |
| SAS verification before import | ✅ H4: Data held in `pendingEncryptedData` until SAS confirmed |
| SAS state machine enforcement | ✅ `confirmSASCode()` no-op outside `.verifying` state |
| Open redirect prevention | ✅ Deep links only navigate to typed `Route` enum values |
| OAuth callback CSRF | ✅ `csrf_state` parameter forwarded for validation |
| Ephemeral key cleanup | ✅ `cleanup()` zeros all secrets on cancel/complete/deinit |

**No findings.** The device linking flow has been well-hardened since prior audits.

---

## 5. Biometric / PIN Authentication

### Status: GOOD

**Files reviewed:** `PINViewModel.swift`, `BiometricPrompt.swift`, `AuthService.swift`

| Check | Result |
|-------|--------|
| Biometric uses `deviceOwnerAuthenticationWithBiometrics` (not `deviceOwnerAuthentication`) | ✅ No passcode fallback |
| PIN stored behind `.biometryCurrentSet` | ✅ Re-enrollment invalidates |
| Biometric retrieval uses pre-authenticated LAContext | ✅ No double prompt |
| Escalating lockout (H7) | ✅ 0-4: none, 5-6: 30s, 7-8: 2min, 9: 10min, 10+: wipe |
| Lockout state persisted in Keychain | ✅ Survives app restart |
| Key wipe on 10 failed attempts | ✅ `authService.logout()` called |
| Biometric lockout handling | ✅ Falls back to PIN pad |
| Biometric enrollment change detection | ✅ Deletes stored PIN, disables biometric |
| PIN validation (8+ digits or 8+ alphanumeric) | ✅ |

**Finding AUTH-1 (LOW): Biometric auto-enable on device setup**
`PINViewModel.swift:236`: `createNewIdentity` is called with `enableBiometric: BiometricPrompt.isAvailable`. This auto-enables biometric unlock for all devices that support it, without explicit user consent. While convenient, security-sensitive apps should require explicit opt-in for biometric unlock.

---

## 6. Data Persistence

### Status: GOOD

**Files reviewed:** `OfflineQueue.swift`, `CrashReportingService.swift`, `HubContext.swift`, `WipeService.swift`, `TranscriptionService.swift`

| Storage Location | What's Stored | Protection |
|-----------------|---------------|------------|
| Keychain | Encrypted device keys, PIN hash, biometric PIN, hub URL, device ID, lockout state, admin pubkey, wake keys | `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, no iCloud sync |
| Application Support | Offline queue (queued API requests) | `.completeFileProtection` (NSFileProtectionComplete) ✅ |
| Application Support | Crash logs | Stack traces only, no PII ✅ |
| UserDefaults | Active hub ID, transcription preferences, crash reporting consent, Sentry DSN, auto-lock timeout | Non-sensitive preferences only ✅ |
| No Core Data / SQLite / Realm | — | ✅ No local database |

**Finding DP-1 (MEDIUM): Offline queue stores plaintext request bodies**
`OfflineQueue.swift:260-263`: Queued operations are written to `offline-queue.json` with `.completeFileProtection`, which is good. However, the request bodies may contain encrypted note/message payloads that were already HPKE-encrypted at the application layer, so the file protection is defense-in-depth over already-encrypted data. But write operations like `ban:add` or `shift:toggle` may contain unencrypted metadata. The queue does not encrypt its own contents — it relies solely on iOS file protection.

**Finding DP-2 (HIGH): `WipeService.wipeAll()` does not clear Documents directory**
`WipeService.swift:35-88` clears temp, caches, and Application Support directories but does not clear the Documents directory (`FileManager.default.urls(for: .documentDirectory, ...)`). If any feature ever writes to Documents (e.g., file attachments, exported data), a panic wipe would miss it. Currently no code writes to Documents, but this is a defense-in-depth gap.

---

## 7. Protocol Compliance

### Status: PARTIAL — several protocol features not yet implemented

**Files reviewed:** `PROTOCOL.md`, all ViewModels and Services

| Protocol Feature | iOS Status |
|-----------------|------------|
| Ed25519 auth tokens | ✅ Implemented via `mobileCreateAuthToken` |
| HPKE note encryption/decryption | ✅ `CryptoService.encryptNote/decryptNote` |
| HPKE message encryption/decryption | ✅ `CryptoService.encryptMessage/decryptMessage` |
| HPKE contact encryption/decryption | ✅ `CryptoService.encryptContactData/decryptContactData` |
| Hub key unwrap (LABEL_HUB_KEY_WRAP) | ✅ `CryptoService.loadHubKey` |
| Server event decryption (epoch-aware) | ✅ `CryptoService.decryptServerEvent` |
| Sigchain link creation | ✅ `CryptoService.createSigchainLink` |
| PUK creation | ✅ `CryptoService.createInitialPuk` |
| Device linking ECDH | ✅ Full flow with SAS verification |
| WebSocket challenge-response auth | ✅ Ed25519 signed with `LABEL_WS_CHALLENGE` |
| Domain separation labels (Albrecht defense) | ✅ All crypto calls use `CryptoLabels.*` constants |
| File E2EE (LABEL_FILE_KEY, LABEL_FILE_METADATA) | ✅ `CryptoService.encryptFile/decryptFile*` |
| Call metadata E2EE (LABEL_CALL_META) | ✅ `CryptoService.decryptCallMetadata` |
| Draft encryption (hub-key-based) | ✅ `CryptoService.encryptDraft/decryptDraft` |
| Shamir secret sharing | ✅ `CryptoService.shamirSplit/Combine/Commit/Verify` |
| Recovery group operations | ✅ Full API + crypto in `RecoveryRequestsView` |
| Push wake payload decryption | ✅ `WakeKeyService.decryptWakePayload` |

**Finding PC-1 (HIGH): `loadAllHubKeys` is a stub — hub keys not loaded on login**
`AppState.swift:404-406`: `loadAllHubKeys(hubs:)` has an empty body with a comment "Implemented in Task 13". This means after login, hub keys are never fetched from the server and loaded into Rust CryptoState. The `clearHubKeys()` method (line 410-412) only clears the hub context, not the crypto keys. This breaks:
- Hub event decryption (`decryptHubEvent` will fail — no key loaded)
- Draft encryption/decryption (requires hub key in Rust)
- Multi-hub event attribution (`decryptEventWithAttribution`)

Hub key loading appears to happen reactively in individual ViewModels when they need it, but there is no proactive loading on unlock.

**Finding PC-2 (MEDIUM): No sigchain verification on incoming device links**
`DeviceLinkViewModel.swift:425-455`: The `importEncryptedProvisionData` function decrypts the provisioning payload but does not verify that the sending device is authorized in the user's sigchain. The protocol requires verifying the device authorization chain before trusting provisioned key material.

---

## 8. Missing Features (Desktop → iOS Gap)

| Feature | Desktop | iOS |
|---------|---------|-----|
| PUK cascading lazy rotation | ✅ | ❌ Only `createInitialPuk` — no rotation |
| Sigchain verification (on incoming data) | ✅ | ❌ Create-only, no verify |
| SFrame voice E2EE | ✅ | ❌ LinphoneService exists but no SFrame integration |
| VoIP (PushKit/CallKit) | ✅ | ❌ Intentionally deferred (documented in project.yml) |
| Client-side Whisper transcription | ✅ WASM | ✅ Apple Speech (on-device, different implementation) |
| Multi-hub key eager loading | ✅ | ❌ `loadAllHubKeys` is stub |
| MLS group messaging | ✅ (feature flag) | ❌ Not referenced |
| Dynamic cert pin update from server | ✅ | ⚠️ `PinListResponse` defined but no fetch/verify logic |
| Security event server upload | ❌ (TODO) | ❌ (TODO in SecurityEventService) |

---

## 9. Push Notification Security

### Status: GOOD

**Files reviewed:** `LlamenosApp.swift` (AppDelegate), `WakeKeyService.swift`

| Check | Result |
|-------|--------|
| Push token treated as sensitive | ✅ "APNs token is sensitive — never log even a prefix" comment, no logging |
| Wake payload HPKE-encrypted | ✅ Decrypted via `LABEL_PUSH_WAKE` |
| No PII in local notification content | ✅ Title/body from decrypted payload (controlled by server) |
| Background push doesn't switch active hub | ✅ Comment + code: only notification TAP calls `setActiveHub` |
| Push token registration authenticated | ✅ Via `APIService.request` with Ed25519 auth |

**Finding PN-1 (LOW): Push payload decrypted before auth check**
`LlamenosApp.swift:302-365`: `didReceiveRemoteNotification` decrypts the wake payload even if the app is locked (`authStatus == .locked`). This is by design (wake keys are accessible without PIN), but means the decrypted notification content (title, body, hubId, callId) is briefly in memory in the locked state. For incoming calls, this is necessary for the UX. No remediation needed, but worth documenting.

---

## 10. Memory Safety & Logging

### Status: GOOD with one finding

**Files reviewed:** All `print`/`os_log`/`logger` calls across Sources

| Check | Result |
|-------|--------|
| No secrets in logs | ✅ No keys, PINs, tokens logged |
| Debug-only logging | ✅ All `print()` calls are in `#if DEBUG` blocks or preview code |
| Crash reports exclude PII | ✅ Only: error type, stack trace, app version, OS, device model |
| Crash reporting opt-in | ✅ `isEnabled` defaults to `false` |
| Privacy overlay in app switcher | ✅ M28: `PrivacyOverlayView` shown on `.inactive` and `.background` |
| Build safety (DEBUG leak prevention) | ✅ `BuildSafety.verifyProductionIntegrity()` + compile-time `#error` |
| Test launch arg rejection in Release | ✅ `assertionFailure` for dangerous args in non-DEBUG |

**Finding MS-1 (MEDIUM): `RecoveryRequestsView` has non-DEBUG `print` statement**
`RecoveryRequestsView.swift:118`: `print("[Recovery] Failed to load sessions: \(error.localizedDescription)")` is NOT wrapped in `#if DEBUG`. In a Release build, this would log error descriptions to the system console, potentially leaking operational details (e.g., HTTP error codes, server error messages) visible via Console.app or device syslog.

**Finding MS-2 (LOW): Ephemeral secrets in Swift String variables**
`DeviceLinkViewModel.swift:66-77`: Ephemeral ECDH secrets (`ephemeralSecret`, `sharedSecret`) are stored as Swift `String` properties. Swift strings are reference-counted and may be copied by ARC, making guaranteed zeroization impossible. The `cleanup()` method sets them to `nil`, but previous copies may persist in memory. For maximum security, these should be routed through Rust (which does `zeroize`), but the current approach is acceptable for ephemeral session keys used once.

---

## Summary of Findings

### High

| ID | Finding | File | Line |
|----|---------|------|------|
| PC-1 | `loadAllHubKeys` is empty stub — hub keys never loaded on login | `AppState.swift` | 404 |
| DP-2 | `WipeService.wipeAll()` skips Documents directory | `WipeService.swift` | 35 |

### Medium

| ID | Finding | File | Line |
|----|---------|------|------|
| NS-1 | No explicit `NSAppTransportSecurity` in Info.plist | `Info.plist` | — |
| DP-1 | Offline queue stores plaintext metadata (file-protected but not app-encrypted) | `OfflineQueue.swift` | 260 |
| PC-2 | No sigchain verification on incoming device provisioning | `DeviceLinkViewModel.swift` | 425 |
| MS-1 | Non-DEBUG `print` in RecoveryRequestsView | `RecoveryRequestsView.swift` | 118 |
| — | Dynamic cert pin fetch/verify not implemented (structure defined only) | `APIService.swift` | 835 |

### Low

| ID | Finding | File | Line |
|----|---------|------|------|
| CS-1 | File checksum uses CryptoKit SHA256 instead of Rust crate | `CryptoService.swift` | 700 |
| NS-2 | WebSocket session lacks cert pinning delegate | `WebSocketService.swift` | 161 |
| NS-3 | Dead code converts http→ws in performConnect | `WebSocketService.swift` | 207 |
| AUTH-1 | Biometric auto-enabled without explicit user consent | `PINViewModel.swift` | 236 |
| PN-1 | Push payload decrypted in locked state (by design) | `LlamenosApp.swift` | 302 |
| MS-2 | Ephemeral ECDH secrets stored as Swift Strings (not zeroizable) | `DeviceLinkViewModel.swift` | 66 |

---

## Recommendations (Priority Order)

1. **Implement `loadAllHubKeys`** (PC-1) — This is a functional gap. Hub event decryption and draft encryption fail without loaded keys. Fetch hub key envelopes from `/api/hubs/{id}/key` for each hub membership after unlock, call `cryptoService.loadHubKey()`.

2. **Add Documents directory to `WipeService.wipeAll()`** (DP-2) — Add the one-liner to clear `documentDirectory`. Even though nothing currently writes there, the wipe should be exhaustive.

3. **Add explicit `NSAppTransportSecurity`** (NS-1) — Add to `Info.plist`:
   ```xml
   <key>NSAppTransportSecurity</key>
   <dict>
       <key>NSAllowsArbitraryLoads</key>
       <false/>
   </dict>
   ```

4. **Add cert pinning to WebSocket session** (NS-2) — Pass the `CertificatePinningDelegate` to the WebSocket `URLSession`.

5. **Wrap `print` in `#if DEBUG`** (MS-1) — One-line fix in `RecoveryRequestsView.swift:118`.

6. **Remove dead `http→ws` conversion** (NS-3) — Clean up the unreachable code path in `performConnect()`.

7. **Implement dynamic cert pin fetch** — The `PinListResponse` structure exists but no code fetches or verifies it. Implement the `GET /api/config/pins` fetch + Ed25519 signature verification + `CertificatePins.updatePins()` call.

8. **Add sigchain verification to device linking** (PC-2) — When receiving provisioning data, verify the sending device's sigchain link before trusting the payload.
