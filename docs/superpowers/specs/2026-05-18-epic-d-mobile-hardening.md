# Epic D — Mobile Platform Hardening

**Date:** 2026-05-18  
**Branch:** `spec-epic-d`  
**Status:** Draft  
**Audits:** iOS security audit 2026-05-18, Android security audit 2026-05-18

---

## Overview

Two security audits found the iOS and Android clients missing several platform-specific hardening measures expected for a crisis response app that protects volunteer and caller identity. The findings range from certificate pinning gaps (CRITICAL) to broken biometric flows (HIGH) to missing screenshot protection on sensitive screens (HIGH).

This spec covers seven findings across both platforms, plus one additional finding from a Claude internal audit. No finding is optional — all must be addressed before store submission.

---

## Scope

| Finding | Platform | Severity | Short description |
|---------|----------|----------|-------------------|
| C05 | iOS | CRITICAL | Certificate pinning disabled — empty hash array |
| H25 | iOS | HIGH | Biometric unlock wired but never called |
| H29 | Android | HIGH | Certificate pinning uses placeholder hashes |
| H30 | Android | HIGH | No FLAG_SECURE on PIN/recovery screens |
| H31 | Android | HIGH | setActiveHub() called in background push handler |
| H33 | Android | HIGH | Deep link scheme allows 0-click navigation |
| Gap 4.0 | iOS | HIGH | #if DEBUG blocks in security-critical paths |
| Gap 3.1 | iOS | MEDIUM | WakeKeyService still uses legacy secp256k1 |

---

## Platform: iOS

### C05 — Certificate Pinning Disabled

**File:** `apps/ios/Sources/Services/APIService.swift:555-567`

#### Current behavior

`CertificatePins.cloudflareHashes` is an empty array. `isEnabled` returns `false`. `CertificatePinningDelegate` falls through to standard TLS on every connection — pinning is structurally correct but entirely bypassed.

```swift
// Current — line 558
static let cloudflareHashes: [String] = [
    // Populate via: bun run cert-pins:inject <domain>
    // See docs/security/CERTIFICATE_PINS.md
]

static var isEnabled: Bool {
    return !cloudflareHashes.isEmpty
}
```

#### Required behavior

- `cloudflareHashes` populated with real Cloudflare intermediate CA SPKI hashes for `app.llamenos.org`.
- Minimum 2 pins: one active, one backup (intermediate CA or next-rotation leaf).
- `#if !DEBUG` assertion that array is non-empty added to `isEnabled` getter — catches accidental empty array in release builds.
- Hard-fail behavior in production (cancel, not allow). Current `CertificatePinningDelegate` already cancels on mismatch; keep this behavior.
- Soft-fail window of 7 days at launch for monitoring (see rollout plan below).

#### How to obtain SPKI hashes

```bash
# Extract leaf certificate hash for app.llamenos.org
openssl s_client -connect app.llamenos.org:443 -servername app.llamenos.org </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | base64

# Extract intermediate CA hash (Cloudflare uses E5/E6/E7/E8 intermediates)
openssl s_client -connect app.llamenos.org:443 -showcerts </dev/null 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' \
  | csplit -z - '/-----BEGIN CERTIFICATE-----/' '{*}' -f cert-
# Run the openssl pubkey pipeline above on cert-01 (the intermediate)
```

Store extracted hashes in `docs/security/CERTIFICATE_PINS.md` (already referenced by code comments). That file is the source of truth; the code references it.

#### Backup pin strategy

Pin two distinct hashes:
1. **Leaf pin** — Current leaf certificate for `app.llamenos.org`. Rotated when cert rotates (Cloudflare auto-renews ~90 days; pin update must precede renewal by at least one app release cycle).
2. **Intermediate CA pin** — One of Cloudflare's active intermediate CAs (`E5`, `E6`, `E7`, or `E8`). These rotate on a multi-year cadence and provide a stable backup.

If the leaf pin fails but the intermediate pin matches, `CertificatePinningDelegate` must still pass. Current loop-and-match logic handles this correctly as long as both hashes are in the array.

#### Rollout plan (avoid false-positive outage)

Do NOT enable pinning in the first release build that contains the hashes without a monitoring window.

1. **Phase 1 — monitor (1 week):** Ship hashes with a `UserDefaults` override `com.llamenos.certpin.enforce = false`. `CertificatePinningDelegate` logs pin match/mismatch to crash reporting (`CrashReportingService`) but does not cancel. Watch for unexpected mismatches in production.
2. **Phase 2 — enforce:** Once no unexpected mismatches observed for 7 days, flip `enforce = true` (default). Remove the override key in the following release.
3. **Phase 3 — assertion:** After one full release cycle with enforcement, add the `#if !DEBUG` assertion to `isEnabled`.

#### Specific code changes

1. `apps/ios/Sources/Services/APIService.swift`:
   - Populate `cloudflareHashes` with actual base64-encoded hashes (2 minimum).
   - Add phase-1 soft-fail check reading `UserDefaults` flag before `completionHandler(.cancelAuthenticationChallenge, nil)`.
   - Add `#if !DEBUG` assertion that `cloudflareHashes.count >= 2`.
2. `docs/security/CERTIFICATE_PINS.md`: Document extraction procedure, hash values with their roles (leaf/intermediate), expiry dates, and rotation runbook.
3. CI: Add a lint step that greps `cloudflareHashes` and fails if it finds an empty array literal in a release configuration.

---

### H25 — iOS Biometric Unlock Broken

**File:** `apps/ios/Sources/Views/Auth/PINUnlockView.swift:120-133`

#### Current behavior

`handleBiometricUnlock()` runs biometric authentication but does nothing with a successful result — the comment explicitly says "biometric success is a convenience UX signal" and the PIN still handles actual decryption. `attemptBiometricOnAppear()` does call `handleBiometricUnlock()` on appear, so the prompt does display — but the result is discarded.

The architectural gap is that biometric success does not produce an unlock. To unlock, the PIN must be typed manually even after biometrics succeed.

#### Required behavior

Biometric unlock must actually unlock the app without requiring PIN entry:

1. **Store PIN in Keychain protected by biometric access control.** When a user enables biometrics (`authService.isBiometricEnabled`), the PIN is stored in a new Keychain item with `kSecAccessControlBiometryCurrentSet` access control. This item is only readable after a successful biometric.
2. **On biometric success, retrieve PIN and call through to `PINViewModel`.** The existing PIN entry path handles the actual crypto unlock — biometric merely retrieves the PIN and passes it.
3. **Biometric failure falls back to PIN entry gracefully.** The PIN pad remains visible.
4. **PIN change invalidates the biometric Keychain item** (because `kSecAccessControlBiometryCurrentSet` binds to enrolled biometric set — adding/removing fingers invalidates automatically, but PIN change must manually delete and re-store).

#### Specific code changes

1. `apps/ios/Sources/Services/KeychainService.swift`:
   - Add `storePINForBiometric(pin: String) throws` — stores PIN string with `kSecAccessControlBiometryCurrentSet | kSecAccessControlUserPresence` access control.
   - Add `retrievePINWithBiometric() async throws -> String` — retrieves PIN; triggers system biometric prompt.
   - Add `deleteBiometricPIN()` — called on PIN change and logout.

2. `apps/ios/Sources/Views/Auth/PINUnlockView.swift`:
   - Rewrite `handleBiometricUnlock()` to call `keychainService.retrievePINWithBiometric()` and on success call `pinViewModel.submitPIN(pin)` directly.
   - On `LAError.biometryLockout` or other failure, show descriptive error and fall back to PIN pad (already visible).
   - `attemptBiometricOnAppear()` no longer just calls `handleBiometricUnlock()` — it calls the new async version with proper Task.

3. `apps/ios/Sources/Views/Auth/PINSetView.swift`:
   - After successful PIN set, if biometrics were previously enabled, call `keychainService.storePINForBiometric(pin:)` to update the stored value.
   - On PIN change (PIN set with existing identity), call `keychainService.deleteBiometricPIN()` first.

4. `apps/ios/Sources/Services/AuthService.swift`:
   - Add `enableBiometric(pin: String) throws` — calls `keychainService.storePINForBiometric(pin:)`.
   - Add `disableBiometric()` — calls `keychainService.deleteBiometricPIN()` and sets `isBiometricEnabled = false`.

#### Security invariant

Biometric never replaces the PIN for crypto operations. The PIN is the key-stretching input to the KDF that decrypts the device key. Biometric is a retrieval mechanism for that PIN value, stored in hardware-backed Keychain. This preserves the security model: biometric compromise only exposes the PIN (which the attacker already has via biometric access to the device), not the raw key material.

---

### Gap 4.0 — iOS #if DEBUG Blocks in Security-Critical Paths

**Files:** `apps/ios/Sources/App/AppState.swift`, `apps/ios/Sources/Services/CryptoService.swift`, `apps/ios/Sources/Services/LinphoneService.swift`, + 40+ view files

#### Current behavior audit

After grepping all `#if DEBUG` blocks across `apps/ios/Sources/`:

| File | Block | Classification |
|------|-------|----------------|
| `App/AppState.swift:110-114` | `handleLaunchArguments()` — calls `--reset-keychain`, `--test-hub-url`, `--test-authenticated`, `--test-admin`, `--test-register` | **DANGEROUS** — bypasses auth; injects mock identity |
| `App/AppState.swift:130-179` | `handleLaunchArguments()` body — configures API, sets mock identity, sets userRole = .admin | **DANGEROUS** — auth bypass, role escalation |
| `Services/CryptoService.swift:430-450` | `storeHubKeyForTesting()`, `setMockIdentity()`, `setMockVolunteerIdentity()` | **DANGEROUS** — injects arbitrary crypto identity |
| `Services/LinphoneService.swift:178-182` | `pendingCallHubIdForTesting()` — read-only accessor | **SAFE** — no auth bypass, read-only state |
| All `Views/**/*View.swift` (40+ files) | `#Preview(...)` macro wrappers | **SAFE** — Xcode preview only, no runtime auth paths |
| `Views/Auth/BiometricPrompt.swift:134-141` | `#Preview(...)` | **SAFE** — preview only |

**Critical danger pattern:** `AppState.init()` calls `handleLaunchArguments()` unconditionally inside `#if DEBUG`. If a release build accidentally includes the `DEBUG` preprocessor flag (via misconfigured build scheme, CI override, or Xcode configuration error), the `--test-authenticated` launch argument bypasses all authentication and injects admin identity.

`CryptoService.setMockIdentity()` generates real (but well-known test) device keys — the PIN is hardcoded as `"12345678"` or read from `XCTEST_MOCK_PIN`. An adversary who can set launch arguments (via ADB-equivalent or MDM profile) can trivially unlock the app.

#### Required behavior

1. **Move all dangerous `#if DEBUG` test support to a separate test target/scheme**, not compiled into the main app target ever.
2. **The main app target must never compile `handleLaunchArguments()`, `setMockIdentity()`, or `storeHubKeyForTesting()`** — not even in debug builds of the main target.
3. **CI must hard-fail** if a release build contains any of these symbols.

#### Specific code changes

1. **Create `apps/ios/Tests/UITestSupport/` source group** (or use existing `Tests/` target):
   - Move `handleLaunchArguments()`, `bootstrapTestIdentity()`, `registerUserIdentity()` out of `AppState.swift` into an extension in `UITestSupport/AppStateTestExtensions.swift`, compiled only by the `LlamenosUITests` target.
   - In `AppState.init()`, remove the `#if DEBUG handleLaunchArguments() #endif` block entirely.

2. **Move `CryptoService` test methods** (`storeHubKeyForTesting`, `setMockIdentity`, `setMockVolunteerIdentity`) out of `CryptoService.swift` into `UITestSupport/CryptoServiceTestExtensions.swift`, compiled only by the UI test target.

3. **Remove `LinphoneService.pendingCallHubIdForTesting`** from the `#if DEBUG` block — if it's only used in tests, move to `UITestSupport/`; if it's used in production code (it shouldn't be), the call site needs to be refactored.

4. **Retain all `#Preview` macros in Views** — these are safe (compile to Xcode preview stubs only, not runtime paths) and removing them degrades DX with no security benefit.

5. **CI check (new GitHub Actions step):**
   ```yaml
   - name: Check no DEBUG test injection in release archive
     run: |
       # Fail if any of these symbols appear in the release IPA binary
       symbols=("handleLaunchArguments" "setMockIdentity" "setMockVolunteerIdentity" "storeHubKeyForTesting")
       ipa_path="build/ios/Release/*.ipa"
       for sym in "${symbols[@]}"; do
         if unzip -p $ipa_path Payload/Llamenos.app/Llamenos | strings | grep -q "$sym"; then
           echo "FAIL: Security-sensitive debug symbol '$sym' found in release binary"
           exit 1
         fi
       done
   ```

6. **BuildSafety.swift** (file already exists: `apps/ios/Sources/App/BuildSafety.swift`): Add runtime assertion that validates `ProcessInfo.processInfo.arguments` does not contain any `--test-*` arguments in release builds. This is a defense-in-depth check in case the CI step is bypassed.

---

### Gap 3.1 — WakeKeyService X25519 Migration

**File:** `apps/ios/Sources/Services/WakeKeyService.swift:264`

#### Current behavior

```swift
// For wake keys, we still use the legacy secp256k1 derivation until the server
// migrates to X25519. The server sends ECIES-wrapped payloads keyed to this pubkey.
// TODO: Switch to X25519 key derivation when server sends HPKE envelopes.
try getPublicKey(secretKeyHex: privateKeyHex)
```

Wake keys are secp256k1 keypairs. Push notifications are ECIES-encrypted to this pubkey. The architecture document and HPKE migration design (`2026-05-05-hpke-envelope-encryption-design.md`) specify that all key-wrapping must migrate to X25519/HPKE.

#### Required behavior

1. **Generate X25519 keypairs** for wake keys instead of secp256k1. Store private key in Keychain under a new account name (e.g., `wake-x25519-private`) to avoid collision with legacy keys.
2. **Publish X25519 pubkey** to server on device registration (`/api/devices/register`). The server must be updated to accept the `wakeKeyAlgorithm: "x25519-hpke"` field alongside the pubkey.
3. **Decrypt incoming push payloads with HPKE** (RFC 9180, X25519-HKDF-SHA256-AES256-GCM). The existing `decryptWakePayload` method switches from ECIES to HPKE decryption.
4. **Migration path:** Generate a new X25519 wake key on first launch after update. Re-register with server. The server must support both ECIES (legacy) and HPKE (new) for a two-release transition window.
5. **Domain separation label:** Use `LABEL_WAKE_KEY_WRAP` from `packages/protocol/crypto-labels.json`. This label must be added to the crypto-labels source if not already present.

#### Coordination required

This change requires a coordinated server-side update to:
- Accept `wakeKeyAlgorithm` field on device registration.
- Send HPKE-wrapped push payloads when the registered device has `wakeKeyAlgorithm: "x25519-hpke"`.
- Continue sending ECIES payloads to legacy devices for one release cycle.

This is a **coordinated protocol change** — it must be planned alongside the worker update, not shipped unilaterally.

#### Specific code changes

1. `packages/protocol/crypto-labels.json`: Add `LABEL_WAKE_KEY_WRAP` if not present.
2. `apps/ios/Sources/Services/WakeKeyService.swift`:
   - Replace `deriveX25519PublicKey(from:)` to call the Rust FFI X25519 keygen (`ffiMobileGenerateX25519Keypair()` or equivalent).
   - Update `ensureKeypairExists()` to generate X25519 keys under new Keychain account.
   - Update `decryptWakePayload(envelope:)` to use HPKE via FFI.
   - Add migration check: if old secp256k1 key exists but no X25519 key, generate X25519 and re-register.

---

## Platform: Android

### H29 — Certificate Pinning Placeholder Hashes

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt:80-85`

#### Current behavior

```kotlin
val certificatePinner: CertificatePinner = CertificatePinner.Builder()
    .add("*.llamenos.org", "sha256/REPLACE_AFTER_DEPLOYMENT")
    .add("*.llamenos.org", "sha256/REPLACE_AFTER_DEPLOYMENT")
    .build()
```

Two placeholder pins with identical values that don't match any real certificate. OkHttp will reject every HTTPS connection to `*.llamenos.org` because the SHA-256 fingerprint will never match `REPLACE_AFTER_DEPLOYMENT`. This means either: (a) pinning is silently disabled by some other mechanism, or (b) the app cannot make any API calls in production (which would be caught immediately). The code is live but the hashes are wrong.

#### Required behavior

Same hash extraction and backup pin strategy as iOS (see C05 above). Both platforms share the same server certificate — the hashes are identical.

- At minimum two distinct hashes: leaf pin + intermediate CA pin.
- Hashes sourced from `docs/security/CERTIFICATE_PINS.md` (single source of truth).
- Same phased rollout: soft-fail monitoring for 7 days via a `BuildConfig` flag, then enforce.
- No `sha256/REPLACE_AFTER_DEPLOYMENT` in any committed file.

#### Specific code changes

1. `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt`:
   - Replace both placeholder strings with actual base64-encoded SHA-256 SPKI hashes.
   - Add a `BuildConfig.CERT_PIN_ENFORCE` flag (set to `false` in the initial release, `true` after monitoring).
   - In the OkHttp builder, conditionally apply `certificatePinner` only when `BuildConfig.CERT_PIN_ENFORCE` is `true`. When `false`, log the pin match result to the crash reporter without blocking.

2. `apps/android/app/build.gradle.kts`:
   - Add `buildConfigField("boolean", "CERT_PIN_ENFORCE", "false")` in `release` build type initially.
   - Flip to `"true"` after monitoring phase.

3. CI: Add a Gradle lint rule or shell check that fails if `REPLACE_AFTER_DEPLOYMENT` appears in any committed Kotlin source in the `release` build type context.

---

### H30 — No FLAG_SECURE on PIN/Recovery Screens

**Files:**
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/PINUnlockScreen.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/PINSetScreen.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/auth/AccountRecoveryScreen.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/RecoveryRequestsScreen.kt`

#### Current behavior

`FLAG_SECURE` exists only in `SecureText.kt` (used for nsec display during onboarding), applied as a `DisposableEffect` scoped to that composable's lifecycle. All PIN entry screens, PIN set screens, account recovery screens, and admin recovery request screens allow screenshots and screen recording.

#### FLAG_SECURE inventory — all screens requiring protection

| Screen | File | Sensitive content |
|--------|------|-------------------|
| `PINUnlockScreen` | `ui/auth/PINUnlockScreen.kt` | PIN entry, identity fingerprint |
| `PINSetScreen` | `ui/auth/PINSetScreen.kt` | PIN entry, PIN confirmation |
| `AccountRecoveryScreen` | `ui/auth/AccountRecoveryScreen.kt` | Identifier, Signal verification code, recovery PIN set |
| `RecoveryRequestsScreen` | `ui/admin/RecoveryRequestsScreen.kt` | Emergency override controls, requestor identity |
| `RecoveryTeamConfigScreen` | `ui/admin/RecoveryTeamConfigScreen.kt` | Share holder pubkeys, threshold config |
| `SecureText` (existing) | `ui/components/SecureText.kt` | nsec display — already protected |

#### Required behavior

All screens listed above must apply `FLAG_SECURE` while active. The approach mirrors the existing `SecureText.kt` pattern using `DisposableEffect`.

#### Specific code changes

1. **Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/SecureScreen.kt`:**

```kotlin
/**
 * Applies FLAG_SECURE to the current activity window while this composable is in the composition.
 * Prevents screenshots, screen recording, and display on non-secure displays.
 * Must be called at the top level of any composable that displays sensitive content.
 */
@Composable
fun SecureScreen() {
    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = (view.context as? Activity)?.window
        window?.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
```

2. **Add `SecureScreen()` as the first statement in each composable body** for all screens listed above:
   - `PINUnlockScreen.kt` — top of `PINUnlockScreen()` composable body
   - `PINSetScreen.kt` — top of `PINSetScreen()` composable body
   - `AccountRecoveryScreen.kt` — top of `AccountRecoveryScreen()` composable body
   - `RecoveryRequestsScreen.kt` — top of `RecoveryRequestsScreen()` composable body
   - `RecoveryTeamConfigScreen.kt` — top of `RecoveryTeamConfigScreen()` composable body

3. **Refactor `SecureText.kt`** to delegate to `SecureScreen()` rather than duplicating the flag logic. (Or keep as-is if the per-composable text scoping is intentional — acceptable either way.)

#### Note on biometric screens

The Android biometric prompt is a system-owned dialog — FLAG_SECURE cannot and should not be applied to it. The system handles screenshot protection for biometric prompts natively.

---

### H31 — Multi-Hub Routing Axiom Violation in Push Handler

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:229-231`

#### Current behavior

```kotlin
// line 229-231
if (hubId.isNotEmpty()) {
    serviceScope.launch { activeHubState.setActiveHub(hubId) }
}
```

This is in `handleIncomingCall()`, called from `onMessageReceived()` which is a Firebase background message handler. The comment in the code claims "This is distinct from the wake-payload coroutine above" and calls this an "App-unlocked path" — but `onMessageReceived` is called by the FCM SDK regardless of whether the app is in the foreground. A background push for a call on hub B will switch the user's active hub away from hub A, violating the multi-hub routing axiom.

The multi-hub routing axiom (CLAUDE.md): **Background push handlers must never call `setActiveHub` — only explicit user tap actions or the app-unlocked call answer path may switch hubs.**

#### Required behavior

- **Remove `setActiveHub()` call** from `handleIncomingCall()` entirely.
- `linphoneService.storePendingCallHub(callId, hubId)` is **correct and must be retained** — it associates an incoming call with its hub without switching the active context.
- When the user **taps the call notification**, the notification's `PendingIntent` leads to `MainActivity` or a call answer screen. That is the correct place for `setActiveHub()` — the user has made an explicit choice.
- The hub switch on notification tap must be implemented in the `ContentIntent` or `FullScreenIntent` of the call notification, not in the message handler.

#### Specific code changes

1. `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt`:
   - Delete lines 229-231 (the `if (hubId.isNotEmpty()) { serviceScope.launch { ... } }` block).
   - Add `hubId` as an extra to the call notification's `PendingIntent`:
     ```kotlin
     val answerIntent = Intent(this, MainActivity::class.java).apply {
         putExtra("call_hub_id", hubId)
         putExtra("call_id", callId)
         flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
     }
     ```
   - The `MainActivity` (or call screen's `LaunchedEffect`) reads `"call_hub_id"` from the intent and calls `setActiveHub()` after user tap.

2. `apps/android/app/src/main/java/org/llamenos/hotline/MainActivity.kt` (or equivalent entry point):
   - On `onNewIntent(intent)`, if `intent.hasExtra("call_hub_id")`, call `activeHubState.setActiveHub(intent.getStringExtra("call_hub_id"))` and then navigate to the call screen.
   - This preserves the active hub during background push and only switches on explicit user tap.

---

### H33 — Deep Link 0-Click Navigation

**File:** `apps/android/app/src/main/AndroidManifest.xml:43-48`

#### Current behavior

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="llamenos" />
</intent-filter>
```

The `llamenos://` custom scheme has no host or path restriction — any external app can send `llamenos://any/path?param=value` and trigger navigation inside the app. There is no validation of the destination before acting on it.

The `DeepLinkActivity` handles `llamenos://oauth/callback` specifically, but `MainActivity` accepts all `llamenos://` URIs without restriction.

#### Required behavior

1. **Allowlist of valid deep link targets** enforced in `MainActivity.onNewIntent()` / `onStart()`.
2. **User confirmation required** for deep links that navigate to sensitive destinations (settings, recovery, admin screens).
3. **`android:autoVerify="true"` with App Links** for paths that must not be interceptable by other apps.

#### Valid deep link allowlist

| URI pattern | Requires confirmation | Description |
|-------------|----------------------|-------------|
| `llamenos://oauth/callback?*` | No | OAuth callback (already on DeepLinkActivity) |
| `llamenos://invite?code=*` | Yes — "Join hub [name]?" | Hub join invitation |
| `llamenos://call/answer?call_id=*&hub_id=*` | No (time-sensitive) | Incoming call answer (from notification tap only) |

All other URIs must be rejected. Navigation to admin screens, recovery screens, settings, or arbitrary routes via deep link is disallowed.

#### App Links (android:autoVerify)

Add `android:autoVerify="true"` to the `llamenos://oauth/callback` intent filter in `DeepLinkActivity`. This prevents other apps from intercepting OAuth callbacks on Android 12+.

For this to work, publish `assetlinks.json` at `https://llamenos.org/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "org.llamenos.hotline",
    "sha256_cert_fingerprints": ["<release signing cert fingerprint>"]
  }
}]
```

The release signing cert fingerprint must be extracted from the keystore used for Play Store signing.

#### Specific code changes

1. `apps/android/app/src/main/AndroidManifest.xml`:
   - Narrow `MainActivity` intent filter from `android:scheme="llamenos"` to specific host+path combinations (or remove it — MainActivity doesn't need to be a deep link entry point if DeepLinkActivity handles all routing).
   - Add `android:autoVerify="true"` to `DeepLinkActivity` intent filter.

2. **Create `apps/android/app/src/main/java/org/llamenos/hotline/DeepLinkValidator.kt`:**

```kotlin
object DeepLinkValidator {
    private val ALLOWED_PATTERNS = listOf(
        Regex("""^llamenos://oauth/callback\?.*$"""),
        Regex("""^llamenos://invite\?code=[A-Za-z0-9_-]+$"""),
        Regex("""^llamenos://call/answer\?call_id=[A-Za-z0-9_-]+&hub_id=[A-Za-z0-9_-]+$"""),
    )

    private val CONFIRMATION_REQUIRED = listOf(
        Regex("""^llamenos://invite\?.*$"""),
    )

    fun isAllowed(uri: Uri): Boolean = ALLOWED_PATTERNS.any { it.matches(uri.toString()) }
    fun requiresConfirmation(uri: Uri): Boolean = CONFIRMATION_REQUIRED.any { it.matches(uri.toString()) }
}
```

3. `apps/android/app/src/main/java/org/llamenos/hotline/MainActivity.kt`:
   - In `onNewIntent(intent)` and `onCreate(savedInstanceState)`, extract `intent.data`.
   - If not null, run `DeepLinkValidator.isAllowed(uri)`. If false, log and drop.
   - If `requiresConfirmation(uri)`, show `AlertDialog` before navigating.
   - If allowed and confirmed, navigate.

4. Publish `assetlinks.json` to the production domain as part of the deployment checklist.

---

## Certificate Pinning: Cross-Platform Rollout Plan

Because both iOS and Android share the same server (`app.llamenos.org`), the certificate hashes are identical. Manage them in a single source file:

**`docs/security/CERTIFICATE_PINS.md`** (already referenced in code comments):

```markdown
# Certificate Pins for llamenos.org

## Extraction date: YYYY-MM-DD
## Next review: YYYY-MM-DD (90 days before cert expiry)

## app.llamenos.org

### Leaf certificate (primary pin)
sha256/BASE64==
Expiry: YYYY-MM-DD
Role: Leaf — Cloudflare-issued TLS certificate for app.llamenos.org

### Cloudflare intermediate CA (backup pin)
sha256/BASE64==
CA: Cloudflare E6 (or E5/E7/E8)
Role: Backup — remains valid across leaf certificate rotation

## Rotation procedure
1. Extract new leaf hash 30 days before expiry
2. Add new hash to CERTIFICATE_PINS.md as "next leaf"
3. Submit app update with both old leaf + new leaf + intermediate in the array
4. After update reaches >95% of users, remove old leaf hash
5. Update CERTIFICATE_PINS.md to reflect only active pins
```

### Monitoring

During the soft-fail phase:
- iOS: Log pin match/fail to `CrashReportingService` (existing service).
- Android: Log to Crashlytics or equivalent with tag `[cert-pin]`.
- Alert if unexpected mismatches appear (would indicate MITM attempt or misconfigured pin).

---

## Test Plan

### C05 / H29 — Certificate Pinning

- **Unit test (iOS):** `CertificatePinningDelegate` test with a mock `URLAuthenticationChallenge` providing a certificate whose SPKI hash is in `cloudflareHashes` — expect `.useCredential`. Same test with a different hash — expect `.cancelAuthenticationChallenge`.
- **Unit test (Android):** OkHttp `MockWebServer` test with a self-signed cert — expect `SSLHandshakeException` when pinning is enforced.
- **Integration test (staging):** Point app at staging server. Confirm API calls succeed. Then introduce a wrong pin hash — confirm API calls fail.
- **Soft-fail monitoring test:** Set `enforce = false`, connect to server with correct and incorrect certs — confirm both cases log but neither blocks.

### H25 — iOS Biometric Unlock

- **Unit test:** Mock `LAContext`. Inject mock `KeychainService` that returns a stored PIN on `retrievePINWithBiometric()`. Confirm `PINViewModel.submitPIN(_:)` is called with the correct PIN.
- **UI test (XCUITest):** On simulator with biometric enrollment, tap biometric button → `XCUIDevice.shared.siriService` (or Simulator menu → Hardware → Touch ID → Matching Touch) → confirm app transitions to unlocked state without PIN entry.
- **Fallback test:** Biometric failure → confirm PIN pad remains visible and operable.

### H30 — FLAG_SECURE

- **Manual test:** On a physical device, navigate to each secured screen. Attempt screenshot via hardware buttons — screenshot must be blank/black.
- **Automated test:** Use Compose UI test to verify `FLAG_SECURE` flag is set on the window when `PINUnlockScreen` is in composition (inspect `window.attributes.flags`).
- **Transition test:** Navigate away from PIN screen → confirm flag is cleared (screenshot on next screen is normal).

### H31 — Multi-Hub Axiom

- **Unit test:** Construct a `PushService` instance with a mock `ActiveHubState`. Call `onMessageReceived()` with an `incoming_call` payload containing a `hub-id`. Assert `setActiveHub()` is **never** called on `ActiveHubState`.
- **Integration test:** BDD scenario — "Background push for hub B does not switch active hub from hub A."

### H33 — Deep Link Validation

- **Unit test:** `DeepLinkValidator` with allowlisted URIs → `isAllowed = true`. With arbitrary URIs → `isAllowed = false`.
- **Android Instrumented test:** Send `Intent` with `llamenos://evil/path` to `MainActivity` — confirm no navigation occurs.
- **App Link verification:** `adb shell pm get-app-link org.llamenos.hotline` — confirm verified status after `assetlinks.json` is published.

### Gap 4.0 — DEBUG Symbol Audit

- **CI check (release build):** Automated symbol scan of release IPA/APK for `handleLaunchArguments`, `setMockIdentity`, `storeHubKeyForTesting`. Fail build if found.
- **Manual test:** Build with `DEBUG` configuration → confirm UI tests work. Build with `RELEASE` configuration → confirm debug launch arguments are rejected / not processed.

### Gap 3.1 — WakeKeyService X25519

- **Unit test:** Generate X25519 keypair via WakeKeyService. Confirm pubkey registered with mock server contains `wakeKeyAlgorithm: "x25519-hpke"`.
- **Decryption test:** Construct an HPKE envelope to the X25519 pubkey. Call `decryptWakePayload`. Confirm correct plaintext.
- **Migration test:** Simulate device with existing secp256k1 wake key → confirm new X25519 key generated and re-registration triggered.

---

## Implementation sequence

Work can proceed in parallel across platforms. Within each platform:

**iOS (order):**
1. Gap 4.0 — #if DEBUG audit and test target extraction (unblocks safe builds for all other changes)
2. C05 — Certificate pinning hashes (requires production domain to be provisioned)
3. H25 — Biometric unlock (requires KeychainService changes)
4. Gap 3.1 — WakeKeyService X25519 (requires coordinated server update — plan separately)

**Android (order):**
1. H31 — Remove setActiveHub from push handler (lowest risk, highest axiom criticality)
2. H30 — FLAG_SECURE on sensitive screens (self-contained)
3. H33 — Deep link validation (self-contained)
4. H29 — Certificate pinning hashes (requires production domain to be provisioned)

---

## Non-negotiable constraints

- The multi-hub axiom violation (H31) **must be fixed before any production traffic.** Background push handlers calling `setActiveHub()` corrupts active hub state for users on multiple hubs.
- Certificate pinning (C05, H29) requires the production domain to be provisioned and Cloudflare intermediate CA hashes to be extracted. Do not enable enforcement until hashes are verified against the live production server.
- The `#if DEBUG` audit (Gap 4.0) must be completed before any release build is signed. Debug identity injection reachable from production binary is a critical auth bypass.
- Deep link validation (H33) must be shipped before any marketing campaign that uses deep links — otherwise any third-party app can navigate the user to arbitrary screens.
