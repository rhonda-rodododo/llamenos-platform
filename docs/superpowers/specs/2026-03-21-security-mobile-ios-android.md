# Security Remediation — Epic 5: iOS & Android Security

**Date**: 2026-03-21
**Audit ref**: `docs/security/SECURITY_AUDIT_2026-03-21.md`
**Findings addressed**: CRIT-H2, CRIT-H3, CRIT-M1, CRIT-M2, CRIT-M3, HIGH-H1, HIGH-H2, HIGH-H3, HIGH-M1, HIGH-M2, HIGH-M3, HIGH-M4 (12 total)
**Dependency order**: CRIT-M3 (remove hardcoded key) is immediate — no dependency. HIGH-M1 (wake key label fix) requires coordination with the Crypto crate and backend. CRIT-H2 and CRIT-H3 depend on the hub key model changes in Epic 3 (Worker).

---

## Context

The iOS and Android clients share several critical vulnerabilities: hardcoded admin key material in source, hub switches that do not tear down the old hub's session state, decrypted push payload logging, and a wake key ECIES label mismatch that causes iOS push notifications for incoming calls to fail silently. The hardcoded admin key (CRIT-M3) is an immediate production risk regardless of all other sequencing — it must be removed and rotated first.

---

## Findings and Fixes

### CRIT-M3 — Admin private key hardcoded in source code and comments — **IMMEDIATE ACTION**

**Files**: `apps/ios/Sources/App/AppState.swift:207-208`; `apps/ios/Sources/Services/CryptoService.swift:337-338`

An admin secret key hex (`f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb`) appears at two locations:

1. `AppState.swift:207-208` — hardcoded in `registerUserIdentity()` as a literal string, passed to `bootstrapAdmin`. This method is inside a `#if DEBUG` / `#endif` block (opened at line 116, enclosing the entire `handleLaunchArguments()` call site and all XCUITest helpers through line 265). It does NOT compile into release binaries.
2. `CryptoService.swift:337-338` — in a doc comment on `setMockIdentity()` that is inside a `#if DEBUG` block (opened at line 330) — also does not compile into release binaries.

**Neither occurrence compiles into release binaries.** The actual risks are:
- Exposure in `.dSYM` symbol files uploaded with debug/TestFlight builds and to crash reporters (Apple and third-party)
- TestFlight distribution — internal testers receive builds with the key present in symbol data
- Git history — the key is permanently accessible to anyone with repository access, past or future

**Fix**:

**Step 1** — Audit git history immediately:
```bash
git log --all -S "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb" --source --all
```
If any commit in history contains this key, the key is permanently compromised. Rotate it (generate a new admin keypair via `bun run bootstrap-admin`) and revoke all sessions in any deployment that used this key.

**Step 2** — Remove the hardcoded key from `AppState.swift`. `registerUserIdentity()` is already inside `#if DEBUG` — no new guard is needed. Within the existing `#if DEBUG` scope, replace the hardcoded string literal with an environment variable lookup:

```swift
// Before (AppState.swift:208):
let adminSecretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"

// After — within the existing #if DEBUG scope:
let adminSecretHex = ProcessInfo.processInfo.environment["XCTEST_ADMIN_SECRET"] ?? ""
guard !adminSecretHex.isEmpty else {
    print("[DEBUG] XCTEST_ADMIN_SECRET not set — skipping admin bootstrap")
    return
}
```

The `XCTEST_ADMIN_SECRET` environment variable is set in the XCUITest scheme's environment, not committed to source. The key is never in source at all.

**Step 3** — The `CryptoService.swift` occurrences (both the comment at line 337-338 and the code literal inside `setMockIdentity()`) are inside a `#if DEBUG` block — they do not compile into release binaries. However, the key value still exists in `.dSYM` symbol files for debug/TestFlight builds and in git history. Remove the key literal from the comment and replace with the environment variable reference:

```swift
/// Set a deterministic test identity for XCUITest automation.
/// Uses the admin secret key configured in the XCTEST_ADMIN_SECRET environment variable.
/// See docs/development/xcuitest-setup.md for configuration.
func setMockIdentity() {
    let secretHex = ProcessInfo.processInfo.environment["XCTEST_ADMIN_SECRET"] ?? ""
    guard !secretHex.isEmpty else { return }
    // ... rest of setMockIdentity
}
```

**Step 4** — Add a CI check that scans for 64-character hex strings in Swift source files:

```yaml
- name: Check for hardcoded secrets in Swift source
  run: |
    if grep -rE '[0-9a-f]{64}' apps/ios/Sources/ --include="*.swift"; then
      echo "ERROR: Potential hardcoded hex secret found in iOS source"
      exit 1
    fi
```

**Verification**: `grep -r "f5450e96" apps/ios/` returns no results. CI secret scan passes. Any deployment that used this key has been rotated.

---

### CRIT-M1 — Decrypted push payload logged in plaintext with no `#if DEBUG` guard

**File**: `apps/ios/Sources/App/LlamenosApp.swift:244`

```swift
print("[APNs] Decrypted wake payload: \(decryptedJSON.prefix(80))...")
```

This runs in production builds. The decrypted payload contains `callId`, `shiftId`, `type`, and `message` — operational data about incoming crisis calls. The iOS system console is readable via `idevicesyslog` with USB access.

**Fix**: Remove the `print` statement entirely. The wake payload handling already proceeds correctly without it. If debug visibility is needed during development:

```swift
#if DEBUG
os_log(.debug, log: .default, "APNs wake payload prefix: %{private}@",
       String(decryptedJSON.prefix(80)))
#endif
```

Using `os_log` at `.debug` level with `%{private}` ensures the value is redacted in captured logs and only visible in Xcode with an attached debugger on a development device.

**Verification**: Build a release scheme. Connect a device via USB, run `idevicesyslog | grep APNs`. Trigger a test push. Confirm no decrypted payload appears in the log stream.

---

### CRIT-H2 — iOS hub switch does not invalidate relay connection or clear hub key

**File**: `apps/ios/Sources/ViewModels/HubManagementViewModel.swift:60-64`

```swift
func switchHub(to hub: Hub) {
    activeHubSlug = hub.slug
    UINotificationFeedbackGenerator().notificationOccurred(.success)
}
```

`switchHub(to:)` sets the slug and does nothing else. `webSocketService.serverEventKeyHex` remains set to the previous hub's key (cleared only in `didLogout()`). The WebSocket remains connected to the previous hub's relay URL.

**Fix**:

```swift
func switchHub(to hub: Hub, appState: AppState) async {
    // 1. Nil the hub key before any await to prevent race-window use
    appState.webSocketService.serverEventKeyHex = nil
    // 2. Disconnect from old hub relay
    appState.webSocketService.disconnect()
    // 3. Update active hub
    activeHubSlug = hub.slug
    // 4. Re-authenticate to get new hub's key and relay URL
    do {
        let response = try await appState.authService.fetchMe()
        appState.webSocketService.serverEventKeyHex = response.serverEventKeyHex
        // 5. Reconnect to new hub relay
        appState.webSocketService.connect(to: response.relayURL)
    } catch {
        // If re-auth fails, remain disconnected — do not restore old hub key
        activeHubSlug = nil
    }
    UINotificationFeedbackGenerator().notificationOccurred(.success)
}
```

Key requirements:
- `serverEventKeyHex` must be set to `nil` before any awaits (prevents race window where old key is used).
- Failure to re-authenticate must leave the client disconnected, not restore the old hub connection.
- `AppState` is injected into `HubManagementViewModel` at init — the simplest option, consistent with SwiftUI patterns where the parent view passes dependencies down. The updated init signature:

```swift
init(apiService: APIService, appState: AppState) {
    self.apiService = apiService
    self.appState = appState
    self.activeHubSlug = UserDefaults.standard.string(forKey: "activeHubSlug")
}
```

The call site passes the same `AppState` instance that owns `webSocketService` and `authService`. The `switchHub(to:)` method no longer needs `appState` as a parameter — it accesses it via `self.appState`.
- Add a unit test (`HubScopedSwitchTests.swift`) that asserts `serverEventKeyHex` is nil during the switch and that the mock WebSocket disconnect was called.

**Verification**: In XCUITest, switch hubs. Assert the WebSocket mock received a `disconnect()` call followed by a `connect(to:)` call with the new hub's relay URL. Assert `serverEventKeyHex` is nil at the point of disconnect.

---

### CRIT-H3 — Android hub switch is local-state-only — WebSocket and key not invalidated

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/ui/hubs/HubManagementViewModel.kt:120-122`

```kotlin
fun switchHub(hubId: String) {
    _uiState.update { it.copy(activeHubId = hubId) }
}
```

Identical issue to CRIT-H2 on Android. The singleton `WebSocketService` retains the previous hub's key and connection.

**Fix**:

```kotlin
fun switchHub(hubId: String) {
    viewModelScope.launch {
        // 1. Clear hub key before any suspension point
        webSocketService.serverEventKeyHex = null
        // 2. Disconnect from previous hub relay
        webSocketService.disconnect()
        // 3. Update active hub ID
        _uiState.update { it.copy(activeHubId = hubId) }
        // 4. Re-authenticate to get new hub's relay key and URL
        try {
            val meResponse = authRepository.fetchMe()
            webSocketService.serverEventKeyHex = meResponse.serverEventKeyHex
            webSocketService.connect(meResponse.relayUrl)
        } catch (e: Exception) {
            // Remain disconnected on auth failure — do not restore old hub key
            _uiState.update { it.copy(activeHubId = null, error = e.message) }
        }
    }
}
```

Add a unit test (`HubSwitchViewModelTest.kt`) using `advanceUntilIdle()` that asserts:
1. `webSocketService.serverEventKeyHex` is null during the switch
2. `webSocketService.disconnect()` was called before `connect()`
3. After successful re-auth, `serverEventKeyHex` is set to the new value

**Verification**: Android unit test with `MockWebSocketService` confirms disconnect-then-reconnect sequence and key rotation. E2E Cucumber test switches hub and asserts the next event received is from the new hub.

---

### CRIT-M2 — Android crash reporter silently falls back to plaintext `SharedPreferences`

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt:60-63`

```kotlin
} catch (_: Exception) {
    // Fallback to unencrypted if Keystore unavailable (rare)
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
```

When `EncryptedSharedPreferences` initialization fails, crash reporting config (including the Sentry DSN) is stored in plaintext on disk.

**Fix**: Remove the fallback entirely. If `EncryptedSharedPreferences` is unavailable, disable crash reporting for the session:

```kotlin
private val prefs: SharedPreferences? by lazy {
    try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        Log.e(TAG, "EncryptedSharedPreferences unavailable — crash reporting disabled for this session")
        null  // Crash reporting silently disabled; no fallback to plaintext
    }
}
```

Update all `prefs.get/set` call sites to handle `prefs == null` gracefully (no-op when null). In particular, the `crashReportingEnabled` property getter and setter (lines 70-72) currently call `prefs.getBoolean(...)` and `prefs.edit()...` directly on the non-nullable `prefs` type. After the change to `SharedPreferences?`, replace them with null-safe access:

```kotlin
var crashReportingEnabled: Boolean
    get() = prefs?.getBoolean(KEY_CONSENT, false) ?: false
    set(value) { prefs?.edit()?.putBoolean(KEY_CONSENT, value)?.apply() }
```

When `prefs` is null (Keystore unavailable), `crashReportingEnabled` returns `false` (opt-in default preserved) and the setter is a no-op. `uploadPendingCrashLogs()` already gates on `if (!crashReportingEnabled)` — when prefs is null, `crashReportingEnabled` returns false, so upload is skipped automatically. The plan should enumerate all remaining `prefs.` call sites in the file to confirm all are converted to null-safe access.

**Verification**: Mock `EncryptedSharedPreferences` initialization to throw. Assert that the resulting `prefs` is null and that no `SharedPreferences` file is created. Assert crash reporting is disabled gracefully.

---

### HIGH-H1 — Hub key ECIES unwrap absent on iOS — no client-side verification

**File**: `apps/ios/Sources/App/AppState.swift:370-373`

```swift
// Pass server event encryption key to WebSocket for relay event decryption
self.webSocketService.serverEventKeyHex = response.serverEventKeyHex
```

iOS accepts `serverEventKeyHex` directly from the `/api/auth/me` response without any client-side ECIES unwrap. The zero-knowledge guarantee requires the client to independently verify key material. The platform's design intends hub keys to be ECIES-wrapped per member and unwrapped client-side.

**Investigation result**: The `/api/auth/me` endpoint currently returns `serverEventKeyHex` as a plaintext symmetric key derived from `SERVER_NOSTR_SECRET`. This is a Worker finding (HIGH-W1) — a global key for all hubs delivered to all users. Until Epic 3 (Worker) migrates to per-hub ECIES envelopes, iOS cannot perform independent ECIES unwrap because the server does not yet produce envelopes.

**Fix (two-phase)**:

**Phase 1 (immediate)** — Add hub-scope assertion: After receiving `serverEventKeyHex` from `/api/auth/me`, verify the response includes a `hubId` field matching the active hub slug. If there is a mismatch, refuse to set the key and disconnect:

```swift
guard response.hubId == activeHubSlug else {
    webSocketService.serverEventKeyHex = nil
    webSocketService.disconnect()
    return
}
self.webSocketService.serverEventKeyHex = response.serverEventKeyHex
```

**Phase 2 (after Epic 3 migrates to ECIES envelopes)** — Call `GET /api/hubs/:hubId/key` to retrieve the per-user ECIES envelope, unwrap it using `CryptoService.eciesUnwrapKey()`, and compare the unwrapped key to `serverEventKeyHex`. Log a security alert and disconnect if they differ.

**Verification**: Unit test that mocks `/api/auth/me` returning a mismatched `hubId` asserts the WebSocket key is not set.

---

### HIGH-H2 — Android push notifications carry no hub attribution

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:89-134`

Push notifications are dispatched on plaintext `data["type"]` with no hub-scope check. The wake payload decryption produces a `WakePayload` with no `hubId` field. A volunteer receiving calls from multiple hubs cannot distinguish which hub a push notification belongs to.

**Fix**:

**Backend coordination required**: Include `hubId` in the encrypted wake payload when the backend dispatches push notifications. The encrypted payload structure should include `{ type, callId, shiftId, message, hubId }`.

**iOS/Android client changes**:

After wake payload decryption, verify `hubId` before surfacing the call:

```kotlin
val wakePayload = wakeKeyService.decryptWakePayload(wakeEncrypted, wakeEphemeral)
if (wakePayload != null) {
    val activeHubId = hubRepository.getActiveHubId()
    if (wakePayload.hubId != null && wakePayload.hubId != activeHubId) {
        Log.w(TAG, "Push notification hub mismatch — ignoring for inactive hub")
        return
    }
    // Proceed with notification display
    showNotificationFromWakePayload(wakePayload.type, wakePayload.message, wakePayload.hubId)
}
```

Update `WakePayload` data class:

```kotlin
data class WakePayload(
    val type: String,
    val callId: String?,
    val message: String?,
    val hubId: String?,  // Added
)
```

**Verification**: Send a push notification for Hub A while Hub B is active. Assert no notification is surfaced. Send for the active hub and confirm notification appears with correct hub attribution.

---

### HIGH-H3 — Active hub slug stored in `UserDefaults` instead of Keychain

**File**: `apps/ios/Sources/ViewModels/HubManagementViewModel.swift:19-27`

```swift
var activeHubSlug: String? {
    didSet {
        if let slug = activeHubSlug {
            UserDefaults.standard.set(slug, forKey: "activeHubSlug")
        } else {
            UserDefaults.standard.removeObject(forKey: "activeHubSlug")
        }
    }
}
```

`UserDefaults` is stored as a plaintext plist, observable by MDM profiles, and included in unencrypted iCloud backups. The hub slug identifies which crisis organization a volunteer works with — sensitive metadata under the adversarial threat model.

**Fix**: Migrate to `KeychainService` using the actual API (`storeString(_:key:)`, `retrieveString(key:)`, `delete(key:)`):

```swift
var activeHubSlug: String? {
    didSet {
        if let slug = activeHubSlug {
            try? keychainService.storeString(slug, key: "activeHubSlug")
        } else {
            keychainService.delete(key: "activeHubSlug")
        }
    }
}
```

Initialize from Keychain on app launch:

```swift
// In init or loadFromPersistence:
activeHubSlug = try? keychainService.retrieveString(key: "activeHubSlug")
```

Note: `HubManagementViewModel` does not currently hold a `keychainService` dependency. Inject it via the initializer, consistent with how `DeviceLinkViewModel` and `PINViewModel` receive `KeychainService`. The updated init signature:

```swift
init(apiService: APIService, keychainService: KeychainService) {
    self.apiService = apiService
    self.keychainService = keychainService
    self.activeHubSlug = try? keychainService.retrieveString(key: "activeHubSlug")
}
```

The call site (wherever `HubManagementViewModel` is instantiated, typically in `AppState` or the root view) passes the same `KeychainService` instance used by other ViewModels.

Migrate any existing UserDefaults value on first launch:

```swift
if let existing = UserDefaults.standard.string(forKey: "activeHubSlug") {
    try? keychainService.storeString(existing, key: "activeHubSlug")
    UserDefaults.standard.removeObject(forKey: "activeHubSlug")
}
```

The accessibility attribute used by `KeychainService` is `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — this matches the hub URL policy and excludes iCloud backup and MDM observation.

**Verification**: After setting an active hub, verify `UserDefaults.standard.string(forKey: "activeHubSlug")` returns nil. Verify the Keychain entry exists and is accessible.

---

### HIGH-M1 — Wake key ECIES label mismatch — iOS push notifications broken

**Files**: `apps/ios/Sources/Services/WakeKeyService.swift:245`; `apps/android/.../crypto/WakeKeyService.kt:140`; `packages/protocol/crypto-labels.json:33`

iOS uses `"llamenos:wake-key"` as the HKDF info label for wake key ECIES derivation. Android and the backend use `"llamenos:push-wake"` (defined as `LABEL_PUSH_WAKE` in `crypto-labels.json`). This mismatch means iOS wake key decryption fails AEAD authentication for every incoming call.

**Fix**:

In `apps/ios/Sources/Services/WakeKeyService.swift:245`:

```swift
// Before:
label: "llamenos:wake-key"

// After:
label: "llamenos:push-wake"  // LABEL_PUSH_WAKE — matches backend and Android
```

**Verify codegen before referencing a constant**: Confirm whether `bun run codegen` currently generates Swift crypto label constants (the TS output is being removed but Swift generation may not yet include label constants). If `CryptoLabels.LABEL_PUSH_WAKE` is not available from codegen, use the raw string `"llamenos:push-wake"` with a comment citing `packages/protocol/crypto-labels.json` as the source of truth. Add the Swift constant generation to codegen if it is missing.

**After deploying the fix — no re-registration required**: The fix is transparent to the backend and requires no key material migration.

The ECIES label is used only during the ECIES wrap/unwrap operation (HKDF info parameter). It is NOT baked into the key material stored in Keychain or registered on the server. The private key in Keychain and the public key registered with the server are raw EC keys — they are unaffected by the label string.

Before the fix: iOS tried to unwrap server-encrypted payloads using label `"llamenos:wake-key"` → AEAD failure. After the fix: iOS uses label `"llamenos:push-wake"` matching what the server used during encryption → decryption succeeds.

The existing keys remain valid. No action needed on the server or in Keychain.

> **Note — contradiction with the audit report**: The security audit (`SECURITY_AUDIT_2026-03-21.md`) recommends "re-register all iOS device wake key pairs" after the label fix. This recommendation is incorrect. The EC private key stored in Keychain and the EC public key registered with the server are raw EC keys — they are completely independent of the ECIES label string. The label is only used during the HKDF derivation step at wrap/unwrap time, as an HKDF info parameter. It is not mixed into or derived from the key material itself. Existing registered key pairs remain valid after the label fix; re-registration is unnecessary.

**Verification**: After the fix, an iOS device receives a test push. Confirm the decrypted wake payload is non-nil and contains the expected call data. Confirm the HKDF info parameter in the ECIES derivation matches `"llamenos:push-wake"`.

---

### HIGH-M2 — PIN logged in plaintext in debug preview callbacks

**File**: `apps/ios/Sources/Views/Components/PINPadView.swift:188-189`

```swift
PINPadView(pin: $pin, maxLength: 4) { completed in
    print("PIN entered: \(completed)")
}
```

Both `print("PIN entered:")` calls are inside `#if DEBUG` / `#Preview` blocks and do not execute in production release builds. The risk is narrower than the original audit characterized: CI log artifacts from simulator runs (which compile DEBUG builds) could capture the PIN if physical device tests run with log capture enabled.

**Fix**: Remove the print statements — no logging is needed in preview callbacks:

```swift
PINPadView(pin: $pin, maxLength: 4) { _ in
    // Preview-only: no logging needed
}
```

**Verification**: `grep -r "PIN entered" apps/ios/Sources/` returns no results.

---

### HIGH-M3 — Android missing explicit `android:usesCleartextTraffic="false"`

**File**: `apps/android/app/src/main/AndroidManifest.xml`

The `<application>` element references `android:networkSecurityConfig="@xml/network_security_config"` which correctly sets `cleartextTrafficPermitted="false"`. However, the manifest lacks the explicit `android:usesCleartextTraffic="false"` attribute. If the network security config XML is missing (resource merge conflict, misconfigured reference), cleartext traffic falls back to permitted.

**Fix**: Add the explicit attribute to the `<application>` element:

```xml
<application
    android:name=".LlamenosApp"
    android:allowBackup="false"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:networkSecurityConfig="@xml/network_security_config"
    android:supportsRtl="true"
    android:theme="@style/Theme.Llamenos"
    android:usesCleartextTraffic="false">
```

**Verification**: Run Android lint (`./gradlew lintDebug`). Assert no cleartext traffic warnings. Attempt an HTTP connection in a release build and confirm it is blocked.

---

### HIGH-M4 — iOS lacks explicit ATS configuration

**File**: `apps/ios/Sources/App/Info.plist`

No `NSAppTransportSecurity` key is present. ATS is enabled by default on iOS 9+, but the absence of explicit configuration makes the security posture non-auditable. `AppState.swift` processes user-entered hub URLs and constructs WebSocket URLs from them — if a user provides `http://`, the behavior depends on ATS defaults.

**Fix**: Add an explicit ATS configuration to `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

Additionally, validate the hub URL scheme at the point of user input in `AppState.swift`. Reject `http://` hub URLs with a user-visible error message in production builds:

```swift
func setHubURL(_ urlString: String) throws {
    guard let url = URL(string: urlString), url.scheme == "https" else {
        throw HubConfigError.insecureScheme
    }
    hubURL = urlString
}
```

In `#if DEBUG`, allow `http://` for local development servers.

**Verification**: App Store review accepts `NSAllowsArbitraryLoads: false`. In a release build, entering an `http://` hub URL displays an error. HTTPS hub URLs connect successfully.

---

## Implementation Sequence

CRIT-M3 is immediate — no dependencies, no coordination required.

1. **CRIT-M3** (remove hardcoded key) — execute first, independently of all other work
2. **CRIT-M1** (remove APNs print) — independent, one-line fix
3. **HIGH-M2** (remove PIN print) — independent, one-line fix
4. **HIGH-M3** (add usesCleartextTraffic) — independent, one-line fix
5. **HIGH-M4** (explicit ATS config + URL validation) — independent
6. **CRIT-M2** (remove Android crash reporter fallback) — independent
7. **HIGH-H3** (hub slug to Keychain) — independent iOS change
8. **HIGH-M1** (wake key label fix — requires codegen + backend coordination; no re-registration needed)
9. **CRIT-H2** (iOS hub switch full sequence — requires Epic 3 Worker hub key model)
10. **CRIT-H3** (Android hub switch full sequence — same dependency)
11. **HIGH-H1** (iOS hub key ECIES verification — Phase 1 immediately; Phase 2 after Epic 3)
12. **HIGH-H2** (Android push hub attribution — requires backend wake payload change)

---

## Verification Checklist

- [ ] `grep -r "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb" apps/ios/` returns no results
- [ ] `git log --all -S "f5450e96"` — key not in git history (or if found, rotation is confirmed)
- [ ] `grep -r "APNs.*wake\|Decrypted wake" apps/ios/Sources/` returns no results outside `#if DEBUG`
- [ ] `grep -r "PIN entered" apps/ios/Sources/` returns no results
- [ ] iOS release build: `idevicesyslog` shows no decrypted push payload during incoming call
- [ ] Android Keystore failure path: crash reporter disables gracefully, no plaintext SharedPreferences file created
- [ ] iOS hub switch: mock WebSocket asserts disconnect → serverEventKeyHex = nil → connect sequence
- [ ] Android hub switch: unit test confirms disconnect-then-reconnect and key rotation
- [ ] iOS wake payload decryption succeeds using `"llamenos:push-wake"` label
- [ ] Android Manifest: lint confirms `android:usesCleartextTraffic="false"` present
- [ ] iOS Info.plist: `NSAppTransportSecurity` key present with `NSAllowsArbitraryLoads = false`
- [ ] `activeHubSlug` stored in Keychain — `UserDefaults.standard.string(forKey: "activeHubSlug")` returns nil
- [ ] Push notification for inactive hub is silently ignored (no UI shown)
- [ ] CI secret scan (64-char hex grep) passes on iOS source
