# Mobile Client Security Audit Report — 2026-06-25 (Wave 3)

**Audit Date**: 2026-06-25
**Scope**: iOS client (`apps/ios/`) and Android client (`apps/android/`)
**Auditor**: Automated security audit (Claude)
**Previous Audits**: 2026-06-09 (IOS_CLIENT_AUDIT_2026-06-09.md), 2026-05-18 (SECURITY_AUDIT_2026-05-18-CLIENTS.md)
**Classification**: CONFIDENTIAL — Restricted to security team

---

## Executive Summary

This wave 3 audit covers both mobile clients following significant security hardening since the last audits. The iOS client had 35 commits since May 18, the Android client had 25+ commits. Many prior findings have been resolved — hub key loading, sigchain verification, SAS enforcement, certificate pinning with real hashes, wake key Keychain attributes, and HTTP relay rejection are all now correctly implemented.

The most significant remaining gap is **WebSocket connections bypassing certificate pinning** on both platforms — REST API traffic is properly pinned but WebSocket relay connections create separate HTTP clients without pinning delegates/configurations.

| Severity | iOS | Android | Total |
|----------|-----|---------|-------|
| CRITICAL | 0 | 0 | **0** |
| HIGH | 1 | 0 | **1** |
| MEDIUM | 4 | 3 | **7** |
| LOW | 4 | 6 | **10** |
| INFO | 0 | 0 | **0** |
| **Total** | **9** | **9** | **18** |

### Prior Audit Finding Status

| Prior Finding | Platform | Status | Details |
|--------------|----------|--------|---------|
| PC-1: `loadAllHubKeys` empty stub | iOS | **RESOLVED** | Implemented in d076a731 — fetches HPKE-wrapped hub key envelopes, unwraps into Rust CryptoState |
| PC-2: No sigchain verification on device links | iOS | **RESOLVED** | d076a731 adds `verifySigchainLink()` + `ed25519Verify()` wrappers |
| MS-1: Non-DEBUG print in RecoveryRequestsView | iOS | **RESOLVED** | d076a731 wraps with `#if DEBUG` |
| DP-2: WipeService skips Documents directory | iOS | **OPEN** | Not yet addressed; no code currently writes to Documents |
| NS-1: No explicit ATS in Info.plist | iOS | **ACCEPTED** | iOS 17+ defaults are secure; absence = strict enforcement |
| NS-2: WebSocket lacks cert pinning | iOS | **OPEN** | Reclassified HIGH — see Finding iOS-1 |
| NS-3: Dead http→ws conversion code | iOS | **OPEN** | Low priority cleanup |
| 3.2: Android certificate pin placeholders | Android | **RESOLVED** | Real ISRG Root X1/X2 hashes in both network_security_config.xml and OkHttp CertificatePinner |
| Android exported receiver | Android | **PARTIALLY RESOLVED** | `autoVerify` removed from custom scheme intent filter (11d8d4ae) |

---

## iOS Findings

### iOS-1 (HIGH): WebSocket relay connection bypasses certificate pinning

**File**: `apps/ios/Sources/Services/WebSocketService.swift:157-161`

**Description**: `WebSocketService` creates a `URLSession(configuration: config)` without the `CertificatePinningDelegate`. The REST API service at `APIService.swift:163` correctly uses `URLSession(configuration: config, delegate: pinningDelegate, delegateQueue: nil)`, but the WebSocket relay connection — which carries auth tokens and encrypted event payloads — bypasses pinning entirely.

**Impact**: A MITM attacker who compromises DNS/routing but not the CA could intercept the relay connection even while API calls would reject the same certificate. This creates an inconsistent security boundary for the most latency-sensitive channel (real-time events, call signaling).

**Recommendation**: Pass the `CertificatePinningDelegate` to the WebSocket `URLSession`. The localhost exemption in the delegate already handles local development.

---

### iOS-2 (MEDIUM): Device link WebSocket also lacks certificate pinning

**File**: `apps/ios/Sources/ViewModels/DeviceLinkViewModel.swift:92-93`

**Description**: The provisioning relay WebSocket in `DeviceLinkViewModel` creates a `URLSession` without the pinning delegate. Device linking exchanges ephemeral ECDH keys and encrypted provisioning data over this connection.

**Impact**: The ECDH+SAS protocol provides E2E authentication, so a MITM would be detected via SAS mismatch. However, certificate pinning adds defense-in-depth against traffic analysis and selective relay attacks.

**Recommendation**: Apply the `CertificatePinningDelegate` to this session.

---

### iOS-3 (MEDIUM): Offline queue docstring claims encryption that does not exist

**File**: `apps/ios/Sources/Services/OfflineQueue.swift:44, 260-263`

**Description**: The file docstring (line 44) states "Operations are encrypted at rest using CryptoService" but `saveToDisk()` writes raw JSON via `JSONEncoder().encode(queue)`. The `.completeFileProtection` attribute provides filesystem-level protection, and request bodies are mostly already-encrypted E2EE ciphertexts, but the documentation is misleading.

**Impact**: Metadata (API paths, HTTP methods) could leak via filesystem extraction on a jailbroken/compromised device. The false documentation could mislead future auditors into thinking application-layer encryption is present.

**Recommendation**: Either encrypt the queue file using a device key before writing, or update the docstring to accurately reflect the protection model (`.completeFileProtection` only).

---

### iOS-4 (MEDIUM): CopyableField clipboard has no auto-expiry

**File**: `apps/ios/Sources/Views/Components/CopyableField.swift:25`

**Description**: `UIPasteboard.general.string = value` copies data to the shared system clipboard with no expiry. Clipboard contents persist across app switches and can be read by other apps (with user permission on iOS 16+). The component is used for public keys and device IDs but is generic enough for sensitive data.

**Impact**: For a crisis hotline app, clipboard persistence is a data leakage vector — copied identifiers could be accessed by other apps.

**Recommendation**: Use `UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: value]], options: [.expirationDate: Date().addingTimeInterval(60)])` to auto-expire after 60 seconds (iOS 16+ native support).

---

### iOS-5 (MEDIUM): WipeService still does not clear Documents directory

**File**: `apps/ios/Sources/Services/WipeService.swift:35-88`

**Description**: Carried forward from prior audit (DP-2). `wipeAll()` clears temp, caches, Application Support, but not the Documents directory. No code currently writes to Documents, but a comprehensive wipe should cover all writable directories.

**Recommendation**: Add Documents directory clearing as a one-liner defense-in-depth.

---

### iOS-6 (LOW): Vestigial HubKeyStore holds plaintext key type in Swift memory

**File**: `apps/ios/Sources/Services/HubKeyStore.swift:8-10`

**Description**: `HubKeyStore` has `var currentHubKey: Data?` which could hold decrypted hub key bytes in Swift memory. This contradicts the architectural invariant that hub keys live only in Rust. The class appears unused — `CryptoService` manages hub keys entirely via `ffiMobileSetHubKey`/`ffiMobileHasHubKey`.

**Recommendation**: Delete `HubKeyStore.swift` to prevent future accidental use.

---

### iOS-7 (LOW): Crash reporting uses unpinned URLSession

**File**: `apps/ios/Sources/Services/CrashReportingService.swift:293`

**Description**: `sendToSentry` uses `URLSession.shared` without certificate pinning. Crash reports are explicitly PII-free per design.

**Recommendation**: Accept current risk, or use the pinned session if the Sentry endpoint is on the hub domain.

---

### iOS-8 (LOW): `storeServerEventKey` silently swallows errors

**File**: `apps/ios/Sources/Services/CryptoService.swift:479`

**Description**: `storeServerEventKey` uses `try?` to silently ignore failures from `ffiMobileSetHubKey`. Invalid keys would cause silent decryption failures downstream.

**Recommendation**: Log errors in DEBUG builds at minimum. Consider throwing to caller.

---

### iOS-9 (LOW): Ephemeral ECDH secrets in Swift String memory

**File**: `apps/ios/Sources/ViewModels/DeviceLinkViewModel.swift:67-77`

**Description**: `ephemeralSecret`, `sharedSecret`, and `pendingEncryptedData` are stored as Swift `String?`. Swift strings are heap-allocated and not reliably zeroizable. The `cleanup()` method sets them to nil but previous copies may persist in heap.

**Impact**: Short attack window — these are single-use ephemeral secrets during device linking only.

**Recommendation**: Accept current risk. Swift lacks reliable memory zeroization. The ECDH secrets are single-use and SAS provides authentication.

---

## Android Findings

### AND-1 (MEDIUM): WebSocket client lacks certificate pinning

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt:104-107`

**Description**: `WebSocketService` creates its own `OkHttpClient` without a `CertificatePinner`:

```kotlin
private val client = OkHttpClient.Builder()
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .pingInterval(30, TimeUnit.SECONDS)
    .build()
```

The REST `ApiService` properly configures `certificatePinner` via `configurePinning()`, but the WebSocket client is a separate instance that bypasses this entirely.

**Impact**: Same as iOS-1 — inconsistent pinning boundary between API and WebSocket channels.

**Recommendation**: Reuse the pinned `OkHttpClient` from `ApiService` (or inject via Hilt), or apply the same `CertificatePinner`.

---

### AND-2 (MEDIUM): WebSocket connection sends no auth credentials

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt:135-138`

**Description**: The WebSocket `connect()` builds a plain `Request` with no `Authorization` header:

```kotlin
val request = Request.Builder()
    .url(relayUrl)
    .build()
```

Any party who knows the relay URL can connect and observe encrypted event metadata (timing, frequency, event kinds, tags). The REST API uses `AuthInterceptor` for every request but the WebSocket bypasses this.

**Recommendation**: Include an Ed25519-signed auth token in the WebSocket upgrade request, or implement a challenge-response handshake after connection (as the iOS client does per commit 9cebf012).

---

### AND-3 (MEDIUM): DeviceLinkViewModel holds shared secret as JVM String

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/settings/DeviceLinkViewModel.kt:67`

**Description**: The ECDH shared secret is stored as `private var sharedSecret: String? = null`. JVM strings are immutable and GC-managed — the original String object persists in the GC heap after `cancel()` sets it to null.

**Impact**: Same category as iOS-9 but slightly higher severity on Android because the GC is less predictable than iOS ARC for short-lived objects.

**Recommendation**: Store as `ByteArray` and explicitly zeroize after use (same pattern as `EphemeralKeypair.close()`), or hold in Rust via FFI.

---

### AND-4 (LOW): PushService receiver exported without permission restriction

**File**: `apps/android/app/src/main/AndroidManifest.xml:77-86`

**Description**: The `PushService` BroadcastReceiver is exported with no `android:permission` attribute. Any app on the device can send crafted intents with `org.unifiedpush.android.connector.MESSAGE` action. Impact is limited — encrypted payloads would fail decryption.

**Recommendation**: Add `android:permission="org.unifiedpush.android.connector.SEND_MESSAGE"` to restrict senders.

---

### AND-5 (LOW): Announcement notification may display plaintext body from push data

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:378`

**Description**: `handleAnnouncement` reads `data["body"]` directly from the push payload and displays it as notification text. If the push payload includes a plaintext body (server misconfiguration or local intent injection via AND-4), it would display without decryption validation.

**Recommendation**: Never display raw push payload fields. All user-visible content should come from decrypted wake-tier or full-tier payloads only.

---

### AND-6 (LOW): Debug network security config hardcodes specific LAN IP

**File**: `apps/android/app/src/debug/res/xml/network_security_config.xml:22`

**Description**: Debug config allows cleartext to `192.168.50.95` with `includeSubdomains="true"` (meaningless on IP). Debug-only, not a production risk.

**Recommendation**: Minor cleanup — use `includeSubdomains="false"` for IP addresses.

---

### AND-7 (LOW): CrashReporter sends without certificate pinning

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt:301-305`

**Description**: Same pattern as iOS-7 — crash reporter creates a new `OkHttpClient` without pinning. Reports are PII-free and opt-in.

**Recommendation**: Accept current risk, or apply CertificatePinner if endpoint is on hub domain.

---

### AND-8 (LOW): Stale Firebase proguard rules

**File**: `apps/android/app/proguard-rules.pro:76-78`

**Description**: Firebase was replaced by UnifiedPush (commit c40b8a56) but proguard still has Firebase keep rules. Not a vulnerability but stale configuration that could confuse auditors.

**Recommendation**: Remove Firebase proguard rules.

---

### AND-9 (LOW): Static OAuth state with potential race

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/DeepLinkActivity.kt:172-180`

**Description**: OAuth state stored in a static `@Volatile` companion property. Multiple concurrent OAuth flows would overwrite each other's state. Low risk given single-hub OAuth is serial.

**Recommendation**: Accept current risk. Consider atomic reference or concurrent map if multi-hub OAuth becomes concurrent.

---

## Cross-Platform Positive Findings

Both platforms demonstrate strong security posture in critical areas:

| Security Control | iOS | Android |
|-----------------|-----|---------|
| **Key isolation** — device private key never leaves Rust FFI | PASS | PASS |
| **HPKE domain separation** — all ops use `CryptoLabels.*` constants (Albrecht defense) | PASS | PASS |
| **Certificate pinning** — real ISRG Root X1/X2 hashes, hard-fail on mismatch | PASS (API only) | PASS (API only) |
| **PIN brute-force** — escalating lockout (30s→2m→10m), wipe at 10 attempts | PASS | PASS |
| **Deep link validation** — auth-gated routes, relay URL SSRF protection | PASS | PASS |
| **Push notification security** — encrypted payloads, no PII in raw push data | PASS | PASS |
| **Privacy overlay / FLAG_SECURE** — app switcher screenshot protection | PASS | PASS |
| **Keychain/Keystore** — device-only, non-syncable, biometric invalidation | PASS | PASS (StrongBox) |
| **Data wipe** — comprehensive multi-location wipe on panic/logout | PASS | PASS |
| **No debug logging of secrets** | PASS | PASS |
| **Build safety** — debug/release configuration separation | PASS | PASS |
| **SAS state machine** — enforced, no bypass | PASS | PASS |
| **Hub key management** — stored/used only in Rust CryptoState | PASS | PASS |

---

## Recommendations (Priority Order)

### Priority 1: WebSocket Certificate Pinning (iOS-1, AND-1)

Both platforms have the same gap: WebSocket relay connections bypass the certificate pinning that protects REST API traffic. This is the highest-impact finding across both clients.

**iOS fix**: Pass `CertificatePinningDelegate` to the WebSocket `URLSession` in `WebSocketService.swift:161` and `DeviceLinkViewModel.swift:93`.

**Android fix**: Inject the pinned `OkHttpClient` from `ApiService` into `WebSocketService` via Hilt, or configure a `CertificatePinner` on the WebSocket client at `WebSocketService.kt:104`.

### Priority 2: Android WebSocket Authentication (AND-2)

The Android WebSocket sends no auth credentials. The iOS client already implements challenge-response authentication (commit 9cebf012). Port this pattern to Android.

### Priority 3: Clipboard Auto-Expiry (iOS-4)

Add 60-second expiry to clipboard copies in `CopyableField`. One-line fix using iOS 16+ native API.

### Priority 4: Plaintext Push Body Fallback (AND-5)

Remove `data["body"]` fallback in `PushService.handleAnnouncement`. All user-visible notification content should come from decrypted payloads only.

### Priority 5: Offline Queue Documentation (iOS-3)

Fix the misleading docstring in `OfflineQueue.swift` that claims encryption. Either add encryption or correct the documentation.

### Priority 6: Memory Zeroization (AND-3, iOS-9)

Store ECDH shared secrets as `ByteArray`/`Data` instead of `String` and explicitly zeroize. Higher priority on Android where GC behavior is less predictable.

### Priority 7: Cleanup

- Delete vestigial `HubKeyStore.swift` (iOS-6)
- Remove stale Firebase proguard rules (AND-8)
- Add Documents directory to iOS `WipeService` (iOS-5)
- Add UnifiedPush sender permission to `PushService` receiver (AND-4)

---

## Methodology

- Static analysis of all Swift/Kotlin source files in `apps/ios/Sources/` and `apps/android/app/src/main/`
- Git log analysis of 60+ commits since 2026-05-18
- Cross-reference with prior audit findings (2026-05-18, 2026-06-09)
- Configuration review: Info.plist, project.yml, AndroidManifest.xml, network_security_config.xml, proguard-rules.pro, build.gradle
- No dynamic analysis (no build/runtime testing in this wave)
