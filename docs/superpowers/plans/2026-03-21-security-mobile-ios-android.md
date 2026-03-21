# Security Remediation — iOS & Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 open security findings across iOS and Android — removing hardcoded key material, eliminating plaintext logging of decrypted push payloads, fixing wake key ECIES label mismatch, hardening crash reporter fallback, and asserting hub key scope. (5 findings already fixed — see audit note below.)

**Architecture:** iOS uses `AppState` as the root observable container holding all service singletons; Android uses Hilt DI with `@HiltViewModel` ViewModels injecting services through constructor injection. Both platforms share the same Rust crypto via UniFFI (`LlamenosCoreFFI.xcframework` on iOS, JNI `.so` on Android).

**Tech Stack:** Swift/SwiftUI/iOS Keychain (`Security.framework` directly), Kotlin/Jetpack Compose/Hilt, UniFFI Rust crypto (`eciesDecryptContentHex` global function on iOS, `CryptoService` JNI wrapper on Android), APNs/FCM

> **Codebase audit 2026-03-21:** The following findings are **already fixed** in the current codebase (implemented as part of the mobile multi-hub epic) and their plan tasks should be **skipped**:
> - **HIGH-M3** (Task 3): Android `AndroidManifest.xml` delegates to `network_security_config.xml` which already sets `cleartextTrafficPermitted="false"` — cleartext is blocked.
> - **HIGH-M4** (Task 3): iOS has no `NSAllowsArbitraryLoads` override — ATS is active by default. No `Info.plist` change needed.
> - **HIGH-H3** (Task 5): Active hub stored via `HubContext.setActiveHub()`, not `UserDefaults` directly. Keychain migration is already in place.
> - **CRIT-H2** (Task 7): iOS `switchHub` now loads hub key via `cryptoService.loadHubKey` and uses `HubContext` observers to manage relay reconnection — race condition closed.
> - **CRIT-H3** (Task 8): Android `switchHub` delegates to `hubRepository.switchHub(hub.id)` which handles disconnect/reconnect — race condition closed.

---

## Task 1: CRIT-M3 — Remove hardcoded admin key (IMMEDIATE)

**Files:**
- `apps/ios/Sources/App/AppState.swift` (line 208: `let adminSecretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"`)
- `apps/ios/Sources/Services/CryptoService.swift` (line 342: `let secretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"`)

The key `f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb` is the admin nsec used in both XCUITest bootstrap helpers and the mock identity setter — both inside `#if DEBUG` blocks. It does NOT compile to release builds, but it is present in git history, dSYMs, and any TestFlight builds. The fix reads the secret from an environment variable set by the test runner.

**Steps:**

- [ ] Run git history check to understand exposure scope:
  ```bash
  git log --all -S "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb" --source --all --oneline
  ```

- [ ] In `AppState.swift`, update `registerUserIdentity()` (lines 202–213) to read the admin secret from an environment variable instead of hardcoding it:

  Replace the hardcoded assignment at line 208:
  ```swift
  // BEFORE (lines 207–209):
  // Step 1: Bootstrap admin (admin key is hardcoded — same as setMockIdentity)
  let adminSecretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"
  bootstrapAdmin(baseURL: baseURL, adminSecretHex: adminSecretHex)
  ```
  With:
  ```swift
  // Step 1: Bootstrap admin using key injected via XCTEST_ADMIN_SECRET env var
  let adminSecretHex = ProcessInfo.processInfo.environment["XCTEST_ADMIN_SECRET"] ?? ""
  guard !adminSecretHex.isEmpty else {
      print("[DEBUG] XCTEST_ADMIN_SECRET not set — skipping admin bootstrap")
      return
  }
  bootstrapAdmin(baseURL: baseURL, adminSecretHex: adminSecretHex)
  ```

- [ ] In `CryptoService.swift`, update `setMockIdentity()` (lines 340–344) to read from env var, with a runtime fallback only for local ad-hoc use (not committed):

  Replace lines 341–343:
  ```swift
  // BEFORE:
  func setMockIdentity() {
      // Same admin key used in desktop tests — matches ADMIN_PUBKEY in Docker .env
      let secretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"
      setIdentity(secretHex: secretHex)
  }
  ```
  With:
  ```swift
  func setMockIdentity() {
      // Read from XCTEST_ADMIN_SECRET env var — set by test runner from CI secrets.
      // Never hardcode this value in source.
      let secretHex = ProcessInfo.processInfo.environment["XCTEST_ADMIN_SECRET"] ?? ""
      guard !secretHex.isEmpty else {
          print("[DEBUG] XCTEST_ADMIN_SECRET not set — mock identity not loaded")
          return
      }
      setIdentity(secretHex: secretHex)
  }
  ```

  Also update the doc comment on `setMockIdentity()` to remove the line that prints the secret hex verbatim:
  - Remove lines 337–339 (the "Admin nsec ... Secret hex: ... Pubkey: ..." block from the doc comment)
  - Replace with: `/// Uses the admin key from XCTEST_ADMIN_SECRET env var (set by test runner).`

- [ ] Add a secret detection check to CI. In `.github/workflows/ci.yml` (or a dedicated `security-audit.yml` if it exists), add a step that runs before the build:
  ```yaml
  - name: Check for hardcoded secrets in Swift source
    run: |
      if grep -rE '[0-9a-f]{64}' apps/ios/Sources/ --include="*.swift"; then
        echo "ERROR: Potential hardcoded hex secret found in iOS source"
        exit 1
      fi
  ```

- [ ] Set `XCTEST_ADMIN_SECRET` in the CI environment (GitHub Actions secret or `.env.ci`). The actual value is `f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb`. For local development, document in `apps/ios/README.md` (or project CLAUDE.md) that this must be set in the Xcode scheme environment variables.

- [ ] Verify:
  ```bash
  grep -rn "f5450e96" apps/ios/Sources/
  ```
  Expect: zero results.

---

## Task 2: CRIT-M1 + HIGH-M2 — Remove unsafe print statements

### CRIT-M1: Decrypted push payload print

**File:** `apps/ios/Sources/App/LlamenosApp.swift` (line 244)

The `print("[APNs] Decrypted wake payload: \(decryptedJSON.prefix(80))...")` in `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` logs up to 80 characters of the decrypted JSON — which contains caller PII (phone, location hints, type of incident). This is unconditional even in production builds.

- [ ] Remove line 244 entirely:
  ```swift
  // REMOVE this line:
  print("[APNs] Decrypted wake payload: \(decryptedJSON.prefix(80))...")
  ```

  If debug logging of successful decryption is needed for tracing, replace with an `os_log` call that marks the value as private (redacted in public logs):
  ```swift
  #if DEBUG
  // os_log redacts %{private}@ in release builds and Instruments captures
  import os
  os_log(.debug, "APNs wake payload decrypted successfully")
  #endif
  ```
  Note: The `import os` must go at the top of the file. The simpler approach is just removing the print — no replacement needed since the error path already logs the failure.

- [ ] Verify the error-path print on line 274 (`print("[APNs] Wake payload decryption failed: ...")`) is acceptable — it does NOT log plaintext, only the error description. Keep it as-is.

### HIGH-M2: PIN print in preview

**File:** `apps/ios/Sources/Views/Components/PINPadView.swift` (lines 187–188 and 199–200)

The `#Preview` blocks at lines 183–205 pass `print("PIN entered: \(completed)")` as the `onComplete` callback. While `#Preview` blocks are stripped in production, this is a code quality issue and the pattern should not persist.

- [ ] Replace both preview callbacks to use `{ _ in }` (discard):

  Line 187 block (Preview "PIN Pad - Empty"):
  ```swift
  // BEFORE:
  PINPadView(pin: $pin, maxLength: 4) { completed in
      print("PIN entered: \(completed)")
  }
  // AFTER:
  PINPadView(pin: $pin, maxLength: 4) { _ in }
  ```

  Line 199 block (Preview "PIN Pad - Partial"):
  ```swift
  // BEFORE:
  PINPadView(pin: $pin, maxLength: 6) { completed in
      print("PIN entered: \(completed)")
  }
  // AFTER:
  PINPadView(pin: $pin, maxLength: 6) { _ in }
  ```

- [ ] Verify:
  ```bash
  grep -rn "PIN entered" apps/ios/Sources/
  ```
  Expect: zero results.

---

## Task 3: HIGH-M3 + HIGH-M4 — Network security configuration

> **✅ ALREADY FIXED** — Verified 2026-03-21:
> - **HIGH-M3**: `AndroidManifest.xml` references `network_security_config.xml` which already sets `cleartextTrafficPermitted="false"`. Cleartext is blocked. Skip HIGH-M3.
> - **HIGH-M4**: iOS has no `NSAllowsArbitraryLoads` override — ATS enforces HTTPS by default. No `Info.plist` change needed. Skip HIGH-M4.
>
> **Skip this entire task.** Continue to Task 4.

### HIGH-M3: Android manifest — cleartext redundancy

**File:** `apps/android/app/src/main/AndroidManifest.xml`

The manifest references `android:networkSecurityConfig="@xml/network_security_config"` (line 23), and that XML file already sets `cleartextTrafficPermitted="false"`. However, the `<application>` element does NOT have the `android:usesCleartextTraffic="false"` attribute set explicitly. On Android API < 24, the network security config XML is ignored and only the manifest attribute applies. Adding the attribute provides defence-in-depth and lint compliance.

- [ ] Add `android:usesCleartextTraffic="false"` to the `<application>` element (line 17):
  ```xml
  <application
      android:name=".LlamenosApp"
      android:allowBackup="false"
      android:icon="@mipmap/ic_launcher"
      android:label="@string/app_name"
      android:networkSecurityConfig="@xml/network_security_config"
      android:usesCleartextTraffic="false"
      android:supportsRtl="true"
      android:theme="@style/Theme.Llamenos">
  ```

### HIGH-M4: iOS ATS — explicit HTTPS enforcement

**File:** `apps/ios/Sources/App/Info.plist`

The `Info.plist` currently has no `NSAppTransportSecurity` key. The iOS default (ATS enabled) already blocks HTTP, but there is no explicit declaration. Adding an explicit `NSAllowsArbitraryLoads = false` (the default) creates a documented intent and prevents accidental future overrides.

- [ ] Add the ATS key to `Info.plist` after the `NSSpeechRecognitionUsageDescription` entry (before `</dict>`):
  ```xml
  <key>NSAppTransportSecurity</key>
  <dict>
      <key>NSAllowsArbitraryLoads</key>
      <false/>
  </dict>
  ```

  **Note:** Do NOT add `NSAllowsArbitraryLoadsInWebContent` or any exception domains. The app has no embedded WebView that needs HTTP.

- [ ] Add URL scheme validation in `AppState.swift`. In `AuthService.setHubURL` (called at line 133 in the test flow), the scheme should be validated. Add a `HubConfigError` enum and a guard in the `AppState` `handleLaunchArguments` flow. Since `AuthService.setHubURL` is the right place, add validation there — but since we're not reading `AuthService.swift` here, implement a defensive wrapper in `AppState.didCompleteOnboarding()` where `hubURL` is consumed:

  In `AppState.swift`, update `didCompleteOnboarding()` (line 301–313) to validate the scheme before calling `apiService.configure`:
  ```swift
  func didCompleteOnboarding() {
      isLocked = false
      authStatus = .unlocked

      if let hubURL = authService.hubURL {
          #if !DEBUG
          guard hubURL.hasPrefix("https://") else {
              // Refuse to connect over plaintext in production builds
              authStatus = .unauthenticated
              return
          }
          #endif
          try? apiService.configure(hubURLString: hubURL)
      }

      connectWebSocketIfConfigured()
      fetchUserRole()
      offlineQueue.startMonitoring()
  }
  ```

---

## Task 4: CRIT-M2 — Android crash reporter nullable fallback

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt`

The `prefs` property (lines 48–64) falls back to an unencrypted `SharedPreferences` when `EncryptedSharedPreferences` creation throws. This means the crash reporting consent flag ("user consented to crash reporting") can be stored in plaintext, and the fallback path has no logging — a failure is silently swallowed. For a consent flag, the correct behaviour is to fail safe (default to `false` / no reporting) rather than fall back to unencrypted storage.

The `prefs` field is a `SharedPreferences` (non-nullable) backed by a `lazy` delegate. It must be changed to `SharedPreferences?` (nullable) so that callers can null-check and all `prefs.get/set` calls become null-safe.

- [ ] Change `prefs` to nullable (`SharedPreferences?`). In the `lazy` initialiser, remove the catch fallback — return `null` instead:

  Lines 48–64, replace with:
  ```kotlin
  private val prefs: SharedPreferences? by lazy {
      try {
          val masterKey = androidx.security.crypto.MasterKey.Builder(context)
              .setKeyScheme(androidx.security.crypto.MasterKey.KeyScheme.AES256_GCM)
              .build()
          androidx.security.crypto.EncryptedSharedPreferences.create(
              context,
              PREFS_NAME,
              masterKey,
              androidx.security.crypto.EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
              androidx.security.crypto.EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
          )
      } catch (_: Exception) {
          // Keystore unavailable — fail safe. Do not fall back to plaintext storage.
          // Crash reporting will be disabled until the device Keystore is available.
          null
      }
  }
  ```

- [ ] Update `crashReportingEnabled` getter/setter (lines 70–72) to use null-safe calls:
  ```kotlin
  var crashReportingEnabled: Boolean
      get() = prefs?.getBoolean(KEY_CONSENT, false) ?: false
      set(value) { prefs?.edit()?.putBoolean(KEY_CONSENT, value)?.apply() }
  ```

- [ ] Scan the rest of `CrashReporter.kt` for any other direct `prefs.` usages and convert them to null-safe `prefs?.`. At the time of reading, `crashReportingEnabled` is the only property using `prefs` directly — `getSentryDsn`/`setSentryDsn` use `keystoreService`, not `prefs`. Confirm with:
  ```bash
  grep -n "prefs\." apps/android/app/src/main/java/org/llamenos/hotline/CrashReporter.kt
  ```

  **Verification note**: `uploadPendingCrashLogs()` already gates on `if (!crashReportingEnabled)`. When `prefs` is null, `crashReportingEnabled` returns `false` (via `?: false` in the null-safe getter), so upload is automatically skipped — no additional null guard needed in `uploadPendingCrashLogs()`.

- [ ] Verify Android unit tests still pass:
  ```bash
  cd apps/android && ./gradlew testDebugUnitTest --tests "*CrashReporter*"
  ```

---

## Task 5: HIGH-H3 — Hub slug to iOS Keychain

> **✅ ALREADY FIXED** — Verified 2026-03-21: Active hub is stored via `HubContext.setActiveHub()`, not `UserDefaults` directly. The Keychain migration is already in place. **Skip this task.** Continue to Task 6.

**File:** `apps/ios/Sources/ViewModels/HubManagementViewModel.swift`

The `activeHubSlug` property (lines 20–28) reads/writes to `UserDefaults.standard`. `UserDefaults` is not encrypted and is included in unencrypted backups on non-encrypted devices. The active hub slug identifies which security-sensitive hub the volunteer is connected to — it should be stored in the Keychain.

`KeychainService` already has `storeString(_:key:)` and `retrieveString(key:)` (confirmed by usage in `WakeKeyService.swift` lines 199–203). The ViewModel currently takes only `apiService: APIService` in its init (line 32).

- [ ] Add `keychainService: KeychainService` to the init, add a private constant, and update the `activeHubSlug` property:

  Replace the entire `activeHubSlug` property and init (lines 20–35):
  ```swift
  private let keychainService: KeychainService
  private static let hubSlugKeychainKey = "activeHubSlug"

  /// The currently active hub slug (stored in Keychain).
  var activeHubSlug: String? {
      didSet {
          if let slug = activeHubSlug {
              try? keychainService.storeString(slug, key: Self.hubSlugKeychainKey)
          } else {
              keychainService.delete(key: Self.hubSlugKeychainKey)
          }
      }
  }

  // MARK: - Init

  init(apiService: APIService, keychainService: KeychainService) {
      self.apiService = apiService
      self.keychainService = keychainService
      // Load from Keychain; migrate from UserDefaults if present
      if let migrated = UserDefaults.standard.string(forKey: "activeHubSlug") {
          self.activeHubSlug = migrated
          try? keychainService.storeString(migrated, key: Self.hubSlugKeychainKey)
          UserDefaults.standard.removeObject(forKey: "activeHubSlug")
      } else {
          self.activeHubSlug = try? keychainService.retrieveString(key: Self.hubSlugKeychainKey)
      }
  }
  ```

- [ ] Find all call sites where `HubManagementViewModel(apiService:)` is instantiated and update them to pass `keychainService` as well. Search:
  ```bash
  grep -rn "HubManagementViewModel(" apps/ios/Sources/
  ```
  For each call site, pass the `keychainService` from the surrounding scope (typically available via the environment's `AppState`).

- [ ] Verify migration: after first launch with this change, `UserDefaults.standard.string(forKey: "activeHubSlug")` should return `nil`.

- [ ] Verify that `KeychainService.storeString(_:key:)` uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` as the accessibility attribute. This matches the hub URL policy and excludes iCloud backup and MDM observation. Confirm by checking `apps/ios/Sources/Services/KeychainService.swift`.

  **Confirmed**: `KeychainService` (lines 81 and 110) sets `kSecAttrAccessible` to `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for all non-biometric items. The biometric path (lines 72–73) uses `SecAccessControlCreateWithFlags` with the same `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` base. No change needed — the hub slug stored via `storeString(_:key:)` will automatically receive the correct accessibility attribute.

---

## Task 6: HIGH-M1 — Wake key ECIES label fix

**File:** `apps/ios/Sources/Services/WakeKeyService.swift` (line 245)

The `decryptWakePayload` method uses the HKDF info label `"llamenos:wake-key"` (line 245). The canonical label defined in `packages/protocol/crypto-labels.json` is `LABEL_PUSH_WAKE = "llamenos:push-wake"`. The backend uses `LABEL_PUSH_WAKE` when encrypting push notifications. This mismatch means wake payload decryption will fail silently — `decryptWakePayload` throws `WakeKeyError.decryptionFailed` and the caller (in `LlamenosApp.swift`) shows no notification.

The Swift codegen does NOT currently generate a `CryptoLabels` Swift enum (codegen outputs are for Swift `Codable` structs from JSON schemas, not crypto-labels.json). The constant must be used as a raw string with a comment pointing to the source of truth.

- [ ] In `WakeKeyService.swift`, add a private constant at the top of the file (after the imports):
  ```swift
  // MARK: - Crypto Label Constants
  // Source of truth: packages/protocol/crypto-labels.json (LABEL_PUSH_WAKE)
  private let LABEL_PUSH_WAKE = "llamenos:push-wake"
  ```

- [ ] Update `decryptWakePayload` (line 245) to use the constant instead of the wrong string:
  ```swift
  // BEFORE (line 245):
  label: "llamenos:wake-key"
  // AFTER:
  label: LABEL_PUSH_WAKE
  ```

- [ ] Confirm the Android `WakeKeyService.kt` uses the correct label too:
  ```bash
  grep -n "push-wake\|wake-key" apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt
  ```
  If it uses the wrong label, apply the same fix there using the `CryptoLabels` Kotlin generated constant (if available from codegen) or a private constant with the same source-of-truth comment.

- [ ] **No re-registration required.** The secp256k1 EC keypair stored in Keychain is label-independent. The HKDF label is only used at wrap/unwrap time as an ECIES info parameter. Existing devices will start decrypting correctly as soon as the backend and client labels match.

---

## Task 7: CRIT-H2 — iOS hub switch full sequence

> **✅ ALREADY FIXED** — Verified 2026-03-21: `switchHub` in `HubManagementViewModel.swift` now loads the hub key via `cryptoService.loadHubKey` and delegates relay management to `HubContext` observers. The race condition is closed. **Skip this task.** Continue to Task 8.

**File:** `apps/ios/Sources/ViewModels/HubManagementViewModel.swift`

The current `switchHub(to:)` method (lines 61–64) only sets `activeHubSlug` and fires haptic feedback. It does not:
1. Clear `webSocketService.serverEventKeyHex` (leaving a stale key that decrypts events from the wrong hub)
2. Disconnect the existing WebSocket
3. Re-fetch `/api/auth/me` for the new hub to get the new server event key

This creates a race window where events encrypted with hub A's key arrive on hub B's connection (or vice versa) and may decrypt successfully with a stale key, leaking cross-hub event metadata.

The fix requires `AppState` (which holds `webSocketService` and `authService`) to be available in the ViewModel. The ViewModel currently takes only `apiService`. With Task 5, it also takes `keychainService`. Now add `appState`.

- [ ] Add `appState: AppState` to `HubManagementViewModel`:

  Updated init signature (combine with Task 5 changes):
  ```swift
  init(apiService: APIService, keychainService: KeychainService, appState: AppState) {
      self.apiService = apiService
      self.keychainService = keychainService
      self.appState = appState
      // ... migration logic from Task 5 ...
  }
  private let appState: AppState
  ```

- [ ] Replace `switchHub(to:)` (lines 61–64) with an `async` function that performs the full disconnect/reconnect sequence:
  ```swift
  /// Switch to a different hub.
  ///
  /// Safety contract: serverEventKeyHex is nilled synchronously (before any await)
  /// so no relay events from the previous hub can be decrypted after the switch begins.
  func switchHub(to hub: Hub) async {
      // 1. Nil the key BEFORE any await — prevents stale key use on old connection
      appState.webSocketService.serverEventKeyHex = nil
      // 2. Disconnect old WebSocket
      appState.webSocketService.disconnect()
      // 3. Persist the new active hub (Keychain via Task 5 didSet)
      activeHubSlug = hub.slug

      // 4. Fetch new server event key from /api/auth/me
      // Note: fetchUserRole() in AppState uses apiService.request(method:path:) directly —
      // there is no authService.fetchMe() method. Replicate that pattern here.
      do {
          let response: AuthMeResponse = try await appState.apiService.request(
              method: "GET", path: "/api/auth/me"
          )
          // 5. Set new key and reconnect
          appState.webSocketService.serverEventKeyHex = response.serverEventKeyHex
          // Derive relay URL from authService.hubURL using the same logic as
          // AppState.connectWebSocketIfConfigured() (lines 388–405): convert https:// → wss://,
          // append /relay. Do NOT use response.relayURL — AuthMeResponse has no such field.
          if let hubURL = appState.authService.hubURL {
              var relayURL = hubURL.trimmingCharacters(in: .whitespacesAndNewlines)
              if relayURL.hasPrefix("https://") {
                  relayURL = relayURL.replacingOccurrences(of: "https://", with: "wss://")
              } else if relayURL.hasPrefix("http://") {
                  relayURL = relayURL.replacingOccurrences(of: "http://", with: "ws://")
              } else if !relayURL.hasPrefix("wss://") && !relayURL.hasPrefix("ws://") {
                  relayURL = "wss://\(relayURL)"
              }
              if !relayURL.hasSuffix("/relay") { relayURL += "/relay" }
              await appState.webSocketService.connect(to: relayURL)
          }
      } catch {
          // Stay disconnected — don't reconnect with a nil key
          activeHubSlug = nil
          errorMessage = error.localizedDescription
      }

      UINotificationFeedbackGenerator().notificationOccurred(.success)
  }
  ```

  The relay URL derivation mirrors `AppState.connectWebSocketIfConfigured()` exactly — no new helper needed. `AuthMeResponse` has no `relayURL` field; the relay URL always comes from the stored hub URL in `authService`.

- [ ] Update all `switchHub(to:)` call sites to use `Task { await viewModel.switchHub(to: hub) }` since the function is now `async`.

- [ ] Add unit test `HubSwitchTests.swift` in `apps/ios/Tests/`:
  ```swift
  import XCTest
  @testable import Llamenos

  final class HubSwitchTests: XCTestCase {
      func testSwitchHubClearsKeyBeforeAwait() async throws {
          // Arrange: create mock services
          let mockWS = MockWebSocketService()
          mockWS.serverEventKeyHex = "aabbcc"
          // ... set up ViewModel with mock appState
          // Act
          await viewModel.switchHub(to: testHub)
          // Assert: key was cleared at some point during switch
          // (MockWebSocketService records whether key was nil during disconnect call)
          XCTAssertTrue(mockWS.keyWasNilAtDisconnect)
      }
  }
  ```

---

## Task 8: CRIT-H3 — Android hub switch full sequence

> **✅ ALREADY FIXED** — Verified 2026-03-21: `switchHub` in `HubManagementViewModel.kt` delegates to `hubRepository.switchHub(hub.id)` which handles the full disconnect/reconnect sequence. The race condition is closed. **Skip this task.** Continue to Task 9.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/hubs/HubManagementViewModel.kt`

The current `switchHub(hubId: String)` (lines 120–122) only updates `_uiState.activeHubId` in-memory. It does not:
1. Set `webSocketService.serverEventKeyHex = null` (stale key persists)
2. Call `webSocketService.disconnect()`
3. Fetch `/api/auth/me` for the new hub to get the correct server event key
4. Persist the selection (it is lost on process death)

The Android `WebSocketService` (line 85) exposes `var serverEventKeyHex: String? = null` directly, and `fun disconnect()` at line 141. The service is `@Singleton` and injectable.

`ApiService` already has `inline suspend fun <reified T> request(method: String, path: String, body: Any? = null): T`. The `MeResponse` typealias points to `org.llamenos.protocol.MeResponse` which should have `serverEventKeyHex` and `relayUrl` fields from codegen.

- [ ] Inject `WebSocketService` and `ApiService` via Hilt constructor injection:
  ```kotlin
  @HiltViewModel
  class HubManagementViewModel @Inject constructor(
      private val apiService: ApiService,
      private val webSocketService: WebSocketService,
      private val sessionState: SessionState,
  ) : ViewModel() {
  ```
  (`SessionState` is already a `@Singleton` — inject it to update `adminDecryptionPubkey` after the hub switch.)

- [ ] Replace `switchHub` (lines 120–122) with the full sequence:
  ```kotlin
  fun switchHub(hubId: String) {
      viewModelScope.launch {
          // 1. Null the server event key synchronously before any suspend point
          webSocketService.serverEventKeyHex = null
          // 2. Disconnect old WebSocket
          webSocketService.disconnect()
          // 3. Update state (persistence is handled by keystoreService in a real impl)
          _uiState.update { it.copy(activeHubId = hubId, isSwitching = true, error = null) }
          try {
              // 4. Fetch new server event key from /api/auth/me
              val me = apiService.request<org.llamenos.protocol.MeResponse>("GET", "/api/auth/me")
              // 5. Update session state with new admin pubkey
              sessionState.adminDecryptionPubkey = me.adminDecryptionPubkey
              // 6. Apply new server event key and reconnect
              webSocketService.serverEventKeyHex = me.serverEventKeyHex
              webSocketService.connect()
              _uiState.update { it.copy(isSwitching = false) }
          } catch (e: Exception) {
              // Stay disconnected — don't reconnect with a null key
              _uiState.update {
                  it.copy(
                      activeHubId = null,
                      isSwitching = false,
                      error = e.message ?: "Hub switch failed",
                  )
              }
          }
      }
  }
  ```

  Note: `webSocketService.connect()` (line 96 of `WebSocketService.kt`) reads the hub URL from `keystoreService.retrieve(KeystoreService.KEY_HUB_URL)`. If switching hubs requires updating the stored URL, that must happen before calling `connect()`. Check whether `HubListState.activeHubId` corresponds to a URL that needs to be stored. If so, add `keystoreService.store(KeystoreService.KEY_HUB_URL, selectedHubUrl)` before `connect()`.

- [ ] Add unit test `HubSwitchViewModelTest.kt` in `apps/android/app/src/test/`:
  ```kotlin
  @OptIn(ExperimentalCoroutinesApi::class)
  class HubSwitchViewModelTest {

      private val testDispatcher = UnconfinedTestDispatcher()

      @get:Rule
      val rule = InstantTaskExecutorRule()

      @Test
      fun `switchHub clears serverEventKeyHex before disconnect`() = runTest(testDispatcher) {
          // Arrange
          val mockWebSocketService = mock(WebSocketService::class.java)
          var keyAtDisconnect: String? = "SENTINEL"
          whenever(mockWebSocketService.disconnect()).thenAnswer {
              keyAtDisconnect = mockWebSocketService.serverEventKeyHex
          }
          // ... set up ViewModel with mocked dependencies
          // Act
          viewModel.switchHub("hub-b")
          advanceUntilIdle()
          // Assert
          assertNull("serverEventKeyHex must be null at disconnect", keyAtDisconnect)
      }
  }
  ```

---

## Task 9: HIGH-H1 + HIGH-H2 — Hub key scope assertion + push hub attribution

### HIGH-H1: iOS auth/me hub scope assertion

**File:** `apps/ios/Sources/App/AppState.swift`

The `fetchUserRole()` method (lines 356–381) calls `GET /api/auth/me` and sets `webSocketService.serverEventKeyHex` from the response without verifying the response is scoped to the currently active hub. If the active hub changes between the request being made and the response arriving, the wrong key is applied.

- [ ] In `fetchUserRole()`, add a hub scope guard after receiving the response (inside `await MainActor.run`, around line 363). First, find where the active hub slug is stored after Task 5 is applied. The source will be `HubManagementViewModel.activeHubSlug` or equivalent in `AppState`. If `AppState` does not hold the active hub slug directly, it can be read from the Keychain via `keychainService.retrieveString(key: "activeHubSlug")`.

  Update the `MainActor.run` block (lines 363–373) to add the guard:
  ```swift
  await MainActor.run {
      let isAdmin = response.roles.contains { $0.contains("admin") }
      self.userRole = isAdmin ? .admin : .volunteer
      self.adminDecryptionPubkey = response.adminDecryptionPubkey

      // Hub scope assertion: only apply the server event key if the response
      // is for the currently active hub. If hub was switched mid-flight, discard.
      let currentSlug = try? self.keychainService.retrieveString(key: "activeHubSlug")
      if let responseHubId = response.hubId, !responseHubId.isEmpty {
          guard responseHubId == currentSlug else {
              // Stale response — do not apply key from a different hub
              self.webSocketService.serverEventKeyHex = nil
              self.webSocketService.disconnect()
              return
          }
      }
      self.webSocketService.serverEventKeyHex = response.serverEventKeyHex
  }
  ```

  Note: `AuthMeResponse` (line 411 of `AppState.swift`) does NOT currently have a `hubId` field. Add it:
  ```swift
  struct AuthMeResponse: Decodable {
      let pubkey: String
      let roles: [String]
      let name: String?
      let profileCompleted: Bool?
      let onBreak: Bool?
      let adminDecryptionPubkey: String?
      let serverEventKeyHex: String?
      let hubId: String?  // ADD: hub scope for server event key validation
  }
  ```
  The backend should already return `hubId` in the me response (or this is a backend task — coordinate with Epic 3). If it is not yet returned by the backend, the guard can use an optional check: when `response.hubId` is nil/empty, skip the scope check (fail open until backend sends it).

  **Phase 2 (deferred)**: After Epic 3 (Worker) migrates to per-hub ECIES envelope delivery, implement client-side ECIES unwrap: call `GET /api/hubs/:hubId/key` to retrieve the per-user ECIES envelope, unwrap using `CryptoService.eciesUnwrapKey()`, and compare to `serverEventKeyHex`. This is tracked as a follow-up to Epic 3.

### HIGH-H2: Android push hub attribution

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt`

The `onMessageReceived` handler (line 89) does not check whether an incoming push belongs to the currently active hub. A push for hub A received while the volunteer has switched to hub B should be ignored or queued — not acted upon.

First, find the `WakePayload` data class that `wakeKeyService.decryptWakePayload` returns. It currently returns a type with `type` and `message` fields (line 104). It needs a `hubId` field.

- [ ] Find the `WakePayload` definition:
  ```bash
  grep -rn "data class WakePayload\|class WakePayload" apps/android/
  grep -rn "WakePayload" apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt
  ```

- [ ] Add `val hubId: String?` to the `WakePayload` data class (wherever it is defined). Make it nullable so existing payloads without `hubId` don't break deserialization.

- [ ] In `PushService.onMessageReceived` (line 89), after decrypting the wake payload (line 104–106), add a hub mismatch guard. The active hub ID needs to be accessible from `PushService`. Since `SessionState` holds runtime session info, and the active hub ID after Task 8 is stored via the keystore, inject `KeystoreService` (already injected for FCM token storage) to retrieve it:

  After line 106 (`Log.d(TAG, "Wake payload decrypted: type=${wakePayload.type}")`), add:
  ```kotlin
  // Hub attribution check: ignore pushes for non-active hubs (defensive — backend must
  // also include hubId in push payloads as part of Epic 3 backend changes)
  val activeHubId = keystoreService.retrieve(KeystoreService.KEY_ACTIVE_HUB_ID)
  if (wakePayload.hubId != null && activeHubId != null &&
      wakePayload.hubId != activeHubId) {
      Log.w(TAG, "Push notification hub mismatch — ignoring for inactive hub")
      return@launch
  }
  ```

  This requires defining `KeystoreService.KEY_ACTIVE_HUB_ID` — add the constant to `KeystoreService` companion object. The value is written during hub switch (Task 8).

- [ ] **Note:** This client-side check is defensive. The backend (Epic 3) must also include `hubId` in the encrypted wake payload. Until the backend sends it, `wakePayload.hubId` will be `null` and the guard will be skipped (fail open).

---

## Verification Checklist

Run all of these before marking this plan complete:

```bash
# Secrets removed
grep -rn "f5450e96" apps/ios/Sources/
# Expected: zero results

# Print statements removed
grep -rn "APNs.*Decrypted wake\|Decrypted wake payload" apps/ios/Sources/
# Expected: zero results

grep -rn "PIN entered" apps/ios/Sources/
# Expected: zero results

# Android lint (checks usesCleartextTraffic + network security config)
cd apps/android && ./gradlew lintDebug

# Wake key label
grep -n "wake-key\|push-wake" apps/ios/Sources/Services/WakeKeyService.swift
# Expected: only "push-wake" appears, no "wake-key"

# UserDefaults hub slug gone after migration
# (verified by running the app once and checking UserDefaults)

# Android unit tests
cd apps/android && ./gradlew testDebugUnitTest

# Android E2E compile check (always required)
cd apps/android && ./gradlew compileDebugAndroidTestKotlin

# iOS unit tests (on Mac)
ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"

# Desktop typecheck
bun run typecheck

# Backend BDD (confirms backend still compatible)
bun run test:backend:bdd
```

---

## Test Commands Reference

```bash
# iOS unit tests (requires Mac)
ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"

# Android unit tests
cd apps/android && ./gradlew testDebugUnitTest

# Android lint
cd apps/android && ./gradlew lintDebug

# Android E2E test compilation (ALWAYS check this — frequently catches ViewModel signature breaks)
cd apps/android && ./gradlew compileDebugAndroidTestKotlin

# Rust crypto tests (wake key label is in Rust — verify LABEL_PUSH_WAKE matches)
cargo test --manifest-path packages/crypto/Cargo.toml --features mobile

# Backend BDD
bun run test:backend:bdd

# Desktop typecheck
bun run typecheck && bun run build
```

---

## Implementation Notes

- **Task ordering:** Tasks 1 and 2 are immediate (pure deletions/replacements, no dependencies). Task 6 (label fix) is also standalone. Tasks 5, 7, and 8 interact (hub slug storage, WebSocket disconnect/reconnect) — implement Task 5 before Task 7. Task 9 HIGH-H1 depends on `AuthMeResponse.hubId` which may require a backend change — implement the client guard defensively with nil-check.

- **No backend changes in scope for this plan.** Epic 3 (backend) must add `hubId` to `GET /api/auth/me` response and to wake push payloads. Until it does, the guard in Tasks 9 HIGH-H1 and HIGH-H2 fail open (skip the check when `hubId` is nil/empty).

- **CryptoLabels codegen:** The Swift codegen does not generate crypto label constants. Use a private file-level constant with a source-of-truth comment for all three label references in Swift (LABEL_PUSH_WAKE). If Kotlin codegen does generate `CryptoLabels`, use it — otherwise use the same private constant pattern.

- **Android WebSocketService.connect() URL source:** The current `connect()` reads hub URL from keystore. After Task 8, hub switching must update `KeystoreService.KEY_HUB_URL` to the new hub's base URL before calling `connect()`. This requires the Hub model to carry a `baseUrl` field that is written to the keystore during `switchHub`.
