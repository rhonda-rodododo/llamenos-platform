# Hardening Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four targeted hardening gaps: hub-notification routing on push (Gap 1), CI codegen:check gate (Gap 2), stale generated TypeScript deletion (Gap 3), server startup env validation (Gap 4), and multi-hub axiom documentation (Gap 5).
**Architecture:** Each gap is independent and can be implemented in parallel. Gap 1 touches iOS/Android push handling; Gap 2 touches CI YAML; Gap 3 touches protocol codegen tooling; Gap 4 adds a new `apps/worker/lib/config.ts` called from `src/server/index.ts`; Gap 5 updates docs. No database migrations, no new routes, no protocol schema changes.
**Tech Stack:** Swift (iOS), Kotlin/Android (PushService), GitHub Actions YAML, TypeScript (worker lib, codegen), CLAUDE.md + PROTOCOL.md docs.

---

## File Structure

### Files to create
- `apps/worker/lib/config.ts` — startup env var validation (Gap 4)

### Files to modify
- `apps/ios/Sources/App/LlamenosApp.swift` — remove `setActiveHub` from background push path (Gap 1)
- `apps/ios/Tests/Unit/PushRoutingTests.swift` — **new test file** for Gap 1 iOS tests
- `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` — remove `setActiveHub` from wake-payload coroutine (Gap 1)
- `apps/android/app/src/test/java/org/llamenos/hotline/service/PushServiceTest.kt` — **new test file** for Gap 1 Android tests
- `.github/workflows/ci.yml` — add `codegen:check` step (Gap 2)
- `packages/protocol/tools/codegen.ts` — verify no `generated/typescript/` output, add no-typescript guard (Gap 3)
- `src/server/index.ts` — call `validateConfig()` before initializing services (Gap 4)
- `CLAUDE.md` — add multi-hub routing axiom (Gap 5)
- `docs/protocol/PROTOCOL.md` — add hub routing note in Section 5 (Gap 5)

### Files to delete
- `packages/protocol/generated/typescript/crypto-labels.ts`
- `packages/protocol/generated/typescript/types.ts`
- `packages/protocol/generated/typescript/` (directory)

---

## Tasks

### Gap 1 — iOS: Fix Hub Context Switch on Background Push

**Context:** `AppDelegate.application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` in `/home/rikki/projects/llamenos/apps/ios/Sources/App/LlamenosApp.swift` lines 276–279 calls `appState.hubContext.setActiveHub(hubId)` unconditionally on every silent push. This switches the UI's browsing context silently in the background. The correct path for context switching is the tap handler (`userNotificationCenter(_:didReceive:)` at line 319), which is already correct and must remain unchanged. The background handler should call `linphoneService.handleVoipPush(callId:hubId:)` for `incoming_call` type notifications and never call `setActiveHub`.

#### Task 1.1 — Write iOS push routing test (test first)

- [ ] Create `/home/rikki/projects/llamenos/apps/ios/Tests/Unit/PushRoutingTests.swift` with the following tests:
  - `backgroundPushForHubBDoesNotSwitchActiveHubFromHubA` — set up `HubContext` with Hub A active; simulate a background push for Hub B with `type == "incoming_call"`; assert `hubContext.activeHubId` is still Hub A afterward.
  - `backgroundPushIncomingCallRoutesToLinphoneService` — simulate a background push `{"type":"incoming_call","callId":"call-001","hubId":"hub-B",...}`; assert `linphoneService.pendingCallHubIdForTesting("call-001") == "hub-B"`.
  - `tapHandlerDoesSetActiveHub` — simulate user tapping a delivered notification with `hubId == "hub-B"`; assert `hubContext.activeHubId == "hub-B"` (verifies correct path is preserved).

  ```swift
  import XCTest
  @testable import Llamenos

  final class PushRoutingTests: XCTestCase {

      private var hubContext: HubContext!
      private var linphoneService: LinphoneService!
      private var appState: AppState!
      private var appDelegate: AppDelegate!

      override func setUp() {
          super.setUp()
          hubContext = HubContext()
          hubContext.setActiveHub("hub-A")
          linphoneService = LinphoneService()
          appState = AppState(hubContext: hubContext)
          appState.linphoneService = linphoneService
          appDelegate = AppDelegate()
          appDelegate.appState = appState
      }

      // Background push for Hub B must NOT switch the active hub away from Hub A.
      func testBackgroundPushForHubBDoesNotSwitchActiveHubFromHubA() {
          let userInfo: [AnyHashable: Any] = [
              "encrypted": buildFakeEncryptedPayload(
                  type: "incoming_call",
                  callId: "call-001",
                  hubId: "hub-B"
              )
          ]
          let expectation = XCTestExpectation(description: "completionHandler called")
          appDelegate.application(
              UIApplication.shared,
              didReceiveRemoteNotification: userInfo
          ) { _ in expectation.fulfill() }
          wait(for: [expectation], timeout: 5)
          XCTAssertEqual(
              hubContext.activeHubId, "hub-A",
              "Background push must not switch active hub"
          )
      }

      // Background push with incoming_call type must call handleVoipPush on LinphoneService.
      func testBackgroundPushIncomingCallRoutesToLinphoneService() {
          let callId = "call-test-\(UUID().uuidString)"
          let userInfo: [AnyHashable: Any] = [
              "encrypted": buildFakeEncryptedPayload(
                  type: "incoming_call",
                  callId: callId,
                  hubId: "hub-B"
              )
          ]
          let expectation = XCTestExpectation(description: "completionHandler called")
          appDelegate.application(
              UIApplication.shared,
              didReceiveRemoteNotification: userInfo
          ) { _ in expectation.fulfill() }
          wait(for: [expectation], timeout: 5)
          XCTAssertEqual(
              linphoneService.pendingCallHubIdForTesting(callId), "hub-B",
              "Incoming call push must register hub in LinphoneService"
          )
      }

      // The tap handler MUST still switch the active hub (user explicit intent).
      func testTapHandlerDoesSetActiveHub() {
          let content = UNMutableNotificationContent()
          content.userInfo = ["hubId": "hub-B"]
          let request = UNNotificationRequest(
              identifier: UUID().uuidString,
              content: content,
              trigger: nil
          )
          let notification = UNNotification(request: request)
          // Use default response action (tap)
          let response = UNNotificationResponse(notification: notification, actionIdentifier: UNNotificationDefaultActionIdentifier)
          let expectation = XCTestExpectation(description: "completionHandler called")
          appDelegate.userNotificationCenter(
              UNUserNotificationCenter.current(),
              didReceive: response
          ) { expectation.fulfill() }
          wait(for: [expectation], timeout: 5)
          XCTAssertEqual(
              hubContext.activeHubId, "hub-B",
              "Tapping a notification must switch active hub"
          )
      }

      // MARK: - Helpers

      /// Build a fake (unencryptable) payload string that WakeKeyService will fail to decrypt,
      /// so the test can exercise the routing logic around a nil wakePayload result.
      /// These tests use a mock WakeKeyService that returns a preset decrypted JSON.
      private func buildFakeEncryptedPayload(type: String, callId: String, hubId: String) -> String {
          // In the live app, this is ECIES-encrypted; in tests, WakeKeyService is stubbed.
          // Return a recognizable sentinel that the mock can intercept.
          return "test-sentinel-\(type)-\(callId)-\(hubId)"
      }
  }
  ```

  > **Note:** These tests require `WakeKeyService` to be injectable / stubbable in `AppState` so the `AppDelegate` background push path can be exercised. If `AppState.wakeKeyService` is not already injectable, the fix in Task 1.2 will use a protocol-based abstraction (see implementation note below). Adjust test construction accordingly after reading the current `AppState` init signature.

- [ ] Run the test to confirm it fails (red): `ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing LlamenosTests/PushRoutingTests 2>&1 | tail -30"`

#### Task 1.2 — Fix iOS AppDelegate background push handler

- [ ] Edit `/home/rikki/projects/llamenos/apps/ios/Sources/App/LlamenosApp.swift`:
  - In `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` (line ~276), **remove** the block that calls `appState.hubContext.setActiveHub(hubId)`:
    ```swift
    // REMOVE this block entirely:
    if let hubId = payload["hubId"] as? String {
        Task { @MainActor in
            appState.hubContext.setActiveHub(hubId)
        }
        content.userInfo["hubId"] = hubId
    }
    ```
  - Replace with routing logic that stores `hubId` in `userInfo` for the tap path, and calls `linphoneService.handleVoipPush` for incoming calls:
    ```swift
    if let hubId = payload["hubId"] as? String {
        // Store hubId in notification userInfo so the tap handler can switch context.
        // Do NOT call setActiveHub here — background push must never switch UI context.
        content.userInfo["hubId"] = hubId

        // For incoming calls, register the call→hub mapping in LinphoneService.
        // This ensures hub-specific SIP routing when the call is answered.
        if let type = payload["type"] as? String, type == "incoming_call",
           let callId = payload["callId"] as? String {
            appState.linphoneService.handleVoipPush(callId: callId, hubId: hubId)
        }
    }
    ```
  - Leave the `userNotificationCenter(_:didReceive:)` tap handler (line ~319) **unchanged** — `setActiveHub` there is correct.

- [ ] Run tests (green): `ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing LlamenosTests/PushRoutingTests 2>&1 | tail -30"`
- [ ] Run full iOS unit suite: `ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"`

- [ ] Commit: `git commit -m "fix(ios): remove setActiveHub from background push path (Gap 1 multi-hub routing)"`

---

### Gap 1 — Android: Fix Hub Context Switch on Background Push

**Context:** `PushService.onMessageReceived` in `/home/rikki/projects/llamenos/apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` lines 122–125 calls `activeHubState.setActiveHub(wakeHubId)` in the wake-payload coroutine block unconditionally. This runs for all notification types (shift reminders, announcements) and silently switches the UI. The `handleIncomingCall` function's existing `setActiveHub` call (line 231) is intentional (app-unlocked path, context switch is acceptable) and must remain. The fix removes only the wake-payload coroutine's unconditional switch.

#### Task 1.3 — Write Android PushService unit test (test first)

- [ ] Create `/home/rikki/projects/llamenos/apps/android/app/src/test/java/org/llamenos/hotline/service/PushServiceTest.kt`:

  ```kotlin
  package org.llamenos.hotline.service

  import io.mockk.mockk
  import io.mockk.verify
  import kotlinx.coroutines.ExperimentalCoroutinesApi
  import kotlinx.coroutines.test.TestScope
  import kotlinx.coroutines.test.UnconfinedTestDispatcher
  import kotlinx.coroutines.test.runTest
  import org.junit.Test
  import org.llamenos.hotline.crypto.WakeKeyService
  import org.llamenos.hotline.hub.ActiveHubState
  import org.llamenos.hotline.telephony.LinphoneService

  /**
   * Unit tests for PushService push-routing logic (Gap 1: multi-hub routing axiom).
   *
   * These tests exercise the wake-payload handling path to verify:
   * - Non-call notification types (shift_reminder, announcement) never call setActiveHub.
   * - Incoming call notifications call linphoneService.storePendingCallHub with correct args.
   *
   * NOTE: PushService extends FirebaseMessagingService and cannot be instantiated directly
   * in unit tests. These tests exercise the extracted routing helper functions.
   * The production fix must extract wake-payload routing into a testable function.
   */
  @OptIn(ExperimentalCoroutinesApi::class)
  class PushServiceTest {

      private val activeHubState = mockk<ActiveHubState>(relaxed = true)
      private val linphoneService = mockk<LinphoneService>(relaxed = true)
      private val wakeKeyService = mockk<WakeKeyService>(relaxed = true)
      private val testDispatcher = UnconfinedTestDispatcher()
      private val testScope = TestScope(testDispatcher)

      @Test
      fun `shift reminder wake payload does NOT call setActiveHub`() = runTest(testDispatcher) {
          val router = PushNotificationRouter(activeHubState, linphoneService)

          router.routeWakePayload(type = "shift_reminder", hubId = "hub-001", callId = null)

          verify(exactly = 0) { activeHubState.setActiveHub(any()) }
      }

      @Test
      fun `announcement wake payload does NOT call setActiveHub`() = runTest(testDispatcher) {
          val router = PushNotificationRouter(activeHubState, linphoneService)

          router.routeWakePayload(type = "announcement", hubId = "hub-001", callId = null)

          verify(exactly = 0) { activeHubState.setActiveHub(any()) }
      }

      @Test
      fun `incoming call wake payload calls storePendingCallHub with correct hub`() = runTest(testDispatcher) {
          val router = PushNotificationRouter(activeHubState, linphoneService)

          router.routeWakePayload(type = "incoming_call", hubId = "hub-B", callId = "call-xyz")

          verify { linphoneService.storePendingCallHub("call-xyz", "hub-B") }
      }

      @Test
      fun `incoming call wake payload does NOT call setActiveHub`() = runTest(testDispatcher) {
          val router = PushNotificationRouter(activeHubState, linphoneService)

          router.routeWakePayload(type = "incoming_call", hubId = "hub-B", callId = "call-xyz")

          verify(exactly = 0) { activeHubState.setActiveHub(any()) }
      }
  }
  ```

  > **Note:** This test depends on a new `PushNotificationRouter` class (a pure routing helper extracted from `PushService`). This is the pattern to keep the Firebase service testable. The class is created in Task 1.4.

- [ ] Run to confirm red: `cd /home/rikki/projects/llamenos/apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.service.PushServiceTest" 2>&1 | tail -20`

#### Task 1.4 — Extract routing helper and fix Android PushService

- [ ] Create `/home/rikki/projects/llamenos/apps/android/app/src/main/java/org/llamenos/hotline/service/PushNotificationRouter.kt`:

  ```kotlin
  package org.llamenos.hotline.service

  import android.util.Log
  import org.llamenos.hotline.hub.ActiveHubState
  import org.llamenos.hotline.telephony.LinphoneService

  /**
   * Pure routing helper for push notification wake payloads.
   *
   * Extracted from PushService to be unit-testable without Firebase.
   *
   * ## Multi-hub routing axiom
   * The active hub context (ActiveHubState) must NEVER be switched from within
   * a background wake-payload handler. Push notifications arrive for any hub
   * the user belongs to, regardless of which hub is active in the UI.
   *
   * The only correct place for setActiveHub is:
   * - When the user explicitly taps a notification (notification tap handler).
   * - When the app is unlocked and the user answers a call (handleIncomingCall path).
   *
   * This class enforces that contract for the wake-payload path.
   */
  class PushNotificationRouter(
      private val activeHubState: ActiveHubState,
      private val linphoneService: LinphoneService,
  ) {
      companion object {
          private const val TAG = "PushNotificationRouter"
      }

      /**
       * Route a decrypted wake payload to the appropriate handler.
       * Never switches the active hub — that is the tap handler's responsibility.
       *
       * @param type  Notification type from decrypted payload (e.g. "incoming_call").
       * @param hubId Hub ID from decrypted payload.
       * @param callId Call ID (present only for incoming_call type).
       */
      fun routeWakePayload(type: String, hubId: String, callId: String?) {
          Log.d(TAG, "routeWakePayload: type=$type hubId=${hubId.take(8)}...")

          when (type) {
              "incoming_call" -> {
                  // Store hub mapping for later — LinphoneService will consume it on SIP receipt.
                  // Active hub is NOT switched here; that happens in handleIncomingCall (app-unlocked)
                  // or when the user taps the notification.
                  if (!callId.isNullOrEmpty() && hubId.isNotEmpty()) {
                      linphoneService.storePendingCallHub(callId, hubId)
                      Log.d(TAG, "Stored pending call hub: callId=$callId hubId=${hubId.take(8)}...")
                  }
              }
              else -> {
                  // shift_reminder, announcement, call_ended, etc.
                  // No routing action needed from the wake payload — the full-tier handler
                  // (dispatchByType) manages these when the app is unlocked.
                  Log.d(TAG, "Non-call wake payload type=$type — no routing action")
              }
          }
      }
  }
  ```

- [ ] Edit `/home/rikki/projects/llamenos/apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt`:
  - Inject `PushNotificationRouter` (construct it with `activeHubState` and `linphoneService` in `onMessageReceived`).
  - In the wake-payload coroutine block (lines ~117–132), **remove** the `setActiveHub` call and replace it with `router.routeWakePayload(...)`:

    Replace:
    ```kotlin
    if (wakeEncrypted != null && wakeEphemeral != null) {
        serviceScope.launch {
            val wakePayload = wakeKeyService.decryptWakePayload(wakeEncrypted, wakeEphemeral)
            if (wakePayload != null) {
                Log.d(TAG, "Wake payload decrypted: type=${wakePayload.type}")
                // Route to the active hub from wake payload when available
                val wakeHubId = wakePayload.hubId
                if (!wakeHubId.isNullOrEmpty()) {
                    activeHubState.setActiveHub(wakeHubId)
                }
                // Use wake payload for notification content when app is locked
                if (!cryptoService.isUnlocked) {
                    showNotificationFromWakePayload(wakePayload.type, wakePayload.message)
                }
            }
        }
    }
    ```

    With:
    ```kotlin
    if (wakeEncrypted != null && wakeEphemeral != null) {
        serviceScope.launch {
            val wakePayload = wakeKeyService.decryptWakePayload(wakeEncrypted, wakeEphemeral)
            if (wakePayload != null) {
                Log.d(TAG, "Wake payload decrypted: type=${wakePayload.type}")
                // Route to hub-specific handler. Does NOT switch active hub context —
                // that is the notification tap handler's responsibility.
                val router = PushNotificationRouter(activeHubState, linphoneService)
                router.routeWakePayload(
                    type = wakePayload.type,
                    hubId = wakePayload.hubId ?: "",
                    callId = wakePayload.callId,
                )
                // Use wake payload for notification content when app is locked
                if (!cryptoService.isUnlocked) {
                    showNotificationFromWakePayload(wakePayload.type, wakePayload.message)
                }
            }
        }
    }
    ```

  - The `handleIncomingCall` function's `setActiveHub` call (line ~231) stays **unchanged** — it is the app-unlocked path and context-switch is acceptable there.
  - Add `callId` extraction in `handleIncomingCall` if not present (it already uses `data["call-id"]` — verify `WakePayload` also exposes a `callId` field and add it to `WakePayload` data class if not present).

- [ ] Check that `WakePayload` in `WakeKeyService.kt` has a `callId` field. If not, add `val callId: String? = null` to the data class.

- [ ] Run tests (green): `cd /home/rikki/projects/llamenos/apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.service.PushServiceTest" 2>&1 | tail -20`
- [ ] Run full Android unit suite: `cd /home/rikki/projects/llamenos/apps/android && ./gradlew testDebugUnitTest 2>&1 | tail -30`
- [ ] Compile E2E test APK: `cd /home/rikki/projects/llamenos/apps/android && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -20`

- [ ] Commit: `git commit -m "fix(android): remove setActiveHub from wake-payload coroutine (Gap 1 multi-hub routing)"`

---

### Gap 2 — CI: Add codegen:check Gate

**Context:** `.github/workflows/ci.yml` runs `bun run codegen` at line 85 but never runs `bun run codegen:check`. Schema drift is undetectable until a mobile build breaks. The fix adds a `codegen:check` step immediately after `codegen` in the `build` job.

#### Task 2.1 — Add codegen:check to CI

- [ ] Edit `/home/rikki/projects/llamenos/.github/workflows/ci.yml`. After the step at line 85 (`run: bun run codegen`), add:

  ```yaml
      - name: Verify codegen output is up to date
        run: bun run codegen:check
  ```

  The surrounding context for the insertion (to verify correct placement):
  ```yaml
      - name: Run codegen
        run: bun run codegen

      - name: Verify codegen output is up to date
        run: bun run codegen:check

      - name: Validate i18n strings
        run: bun run i18n:validate:all
  ```

- [ ] Verify the codegen:check script exists in `package.json`: `grep -n "codegen:check" /home/rikki/projects/llamenos/package.json`
- [ ] Verify locally: `cd /home/rikki/projects/llamenos && bun run codegen && bun run codegen:check` — must exit 0.

- [ ] Commit: `git commit -m "ci: add codegen:check gate after codegen step (Gap 2)"`

---

### Gap 3 — Delete Stale generated/typescript/ Directory

**Context:** `packages/protocol/generated/typescript/` contains `crypto-labels.ts` and `types.ts` — stale artifacts from when TypeScript codegen was removed. The project now uses `z.infer<>` directly. These files create confusion and are not imported anywhere.

#### Task 3.1 — Verify codegen does not write typescript output

- [ ] Check `packages/protocol/tools/codegen.ts` for any reference to `'typescript'` or `generated/typescript`:
  ```bash
  grep -n "typescript\|TYPESCRIPT" /home/rikki/projects/llamenos/packages/protocol/tools/codegen.ts
  ```
- [ ] If any TypeScript output target exists, remove it from `codegen.ts` before deleting the directory.

#### Task 3.2 — Delete stale directory

- [ ] Delete the stale files:
  ```bash
  rm -rf /home/rikki/projects/llamenos/packages/protocol/generated/typescript/
  ```
- [ ] Verify deletion: `ls /home/rikki/projects/llamenos/packages/protocol/generated/` — should only show `swift/` and `kotlin/` subdirectories.
- [ ] Verify `codegen` does not recreate it: `cd /home/rikki/projects/llamenos && bun run codegen && ls packages/protocol/generated/` — `typescript/` must not reappear.
- [ ] Verify `codegen:check` passes: `cd /home/rikki/projects/llamenos && bun run codegen:check`
- [ ] Check that the stale files are not imported anywhere:
  ```bash
  grep -r "generated/typescript\|from.*protocol.*generated.*typescript" /home/rikki/projects/llamenos/src /home/rikki/projects/llamenos/apps/worker 2>/dev/null
  ```

#### Task 3.3 — Verify .gitignore coverage

- [ ] Check that `packages/protocol/generated/` is already gitignored:
  ```bash
  grep -n "generated" /home/rikki/projects/llamenos/packages/protocol/.gitignore 2>/dev/null || grep -n "packages/protocol/generated" /home/rikki/projects/llamenos/.gitignore
  ```
- [ ] Confirm `git status` does not show the deleted files as tracked (they should be gitignored, meaning deletion has no git diff). If they were tracked, `git rm -r packages/protocol/generated/typescript/` is needed instead.

- [ ] Commit (only if files were tracked by git): `git commit -m "chore(protocol): delete stale generated/typescript/ artifacts (Gap 3)"`

---

### Gap 4 — Worker: Startup Env Var Validation

**Context:** `src/server/index.ts` is the Bun entry point (runs via `bun --watch src/server/index.ts`). It uses `process.env.DATABASE_URL || 'postgresql://...'` fallback patterns that silently fail in misconfigured deployments. The fix adds a `validateConfig()` function in a new `apps/worker/lib/config.ts`, called at the top of `src/server/index.ts` before any service initialization.

#### Task 4.1 — Write validation tests (test first, BDD-style)

The existing BDD backend tests (`bun run test:backend:bdd`) serve as the integration test: if `validateConfig()` incorrectly rejects the test environment config, BDD tests will fail to start. Add one focused unit test for the validation logic itself in a new file.

- [ ] Create `/home/rikki/projects/llamenos/apps/worker/lib/config.test.ts`:

  ```typescript
  import { describe, it, expect } from 'bun:test'
  import { validateConfig } from './config'

  describe('validateConfig', () => {
    const validEnv = {
      DATABASE_URL: 'postgresql://llamenos:dev@localhost:5432/llamenos',
      HMAC_SECRET: 'a'.repeat(64),
      SERVER_NOSTR_SECRET: 'b'.repeat(64),
      ADMIN_PUBKEY: 'c'.repeat(64),
      HOTLINE_NAME: 'Test Hotline',
      ENVIRONMENT: 'test',
    }

    it('passes with all required vars present', () => {
      expect(() => validateConfig(validEnv)).not.toThrow()
    })

    it('throws if DATABASE_URL is missing', () => {
      expect(() => validateConfig({ ...validEnv, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
    })

    it('throws if DATABASE_URL does not start with postgres', () => {
      expect(() => validateConfig({ ...validEnv, DATABASE_URL: 'mysql://bad' })).toThrow(/DATABASE_URL/)
    })

    it('throws if HMAC_SECRET is missing', () => {
      expect(() => validateConfig({ ...validEnv, HMAC_SECRET: '' })).toThrow(/HMAC_SECRET/)
    })

    it('throws if HMAC_SECRET is wrong length (32 chars)', () => {
      expect(() => validateConfig({ ...validEnv, HMAC_SECRET: 'a'.repeat(32) })).toThrow(/HMAC_SECRET/)
    })

    it('throws if HMAC_SECRET contains non-hex chars', () => {
      expect(() => validateConfig({ ...validEnv, HMAC_SECRET: 'z'.repeat(64) })).toThrow(/HMAC_SECRET/)
    })

    it('throws if SERVER_NOSTR_SECRET is missing', () => {
      expect(() => validateConfig({ ...validEnv, SERVER_NOSTR_SECRET: '' })).toThrow(/SERVER_NOSTR_SECRET/)
    })

    it('throws if SERVER_NOSTR_SECRET is wrong length', () => {
      expect(() => validateConfig({ ...validEnv, SERVER_NOSTR_SECRET: 'a'.repeat(63) })).toThrow(/SERVER_NOSTR_SECRET/)
    })

    it('throws if ADMIN_PUBKEY is missing', () => {
      expect(() => validateConfig({ ...validEnv, ADMIN_PUBKEY: '' })).toThrow(/ADMIN_PUBKEY/)
    })

    it('throws if ADMIN_PUBKEY is wrong length', () => {
      expect(() => validateConfig({ ...validEnv, ADMIN_PUBKEY: 'a'.repeat(32) })).toThrow(/ADMIN_PUBKEY/)
    })

    it('throws if HOTLINE_NAME is missing', () => {
      expect(() => validateConfig({ ...validEnv, HOTLINE_NAME: '' })).toThrow(/HOTLINE_NAME/)
    })

    it('throws if ENVIRONMENT is missing', () => {
      expect(() => validateConfig({ ...validEnv, ENVIRONMENT: '' })).toThrow(/ENVIRONMENT/)
    })

    it('does not throw if optional vars are absent', () => {
      // NOSTR_RELAY_URL, FCM_SERVICE_ACCOUNT_KEY, APNS_* are optional
      expect(() => validateConfig(validEnv)).not.toThrow()
    })
  })
  ```

- [ ] Run to confirm red (file does not exist yet): `cd /home/rikki/projects/llamenos && bun test apps/worker/lib/config.test.ts 2>&1 | tail -20`

#### Task 4.2 — Create apps/worker/lib/config.ts

- [ ] Create `/home/rikki/projects/llamenos/apps/worker/lib/config.ts`:

  ```typescript
  /**
   * Startup configuration validation for the Llamenos worker server.
   *
   * Call validateConfig() at Bun startup (before any service initialization)
   * to catch misconfigured deployments immediately with a clear error message.
   *
   * Required vars are asserted to be non-empty and well-formed.
   * Optional vars log a warning when absent — they disable specific features
   * (push, relay) without failing startup.
   *
   * This is the canonical validation implementation. See spec:
   * docs/superpowers/specs/2026-03-21-hardening-final.md Gap 4.
   */

  const HEX_RE = /^[0-9a-f]+$/i

  type ConfigInput = Partial<Record<string, string | undefined>>

  function assertNonEmpty(env: ConfigInput, key: string): void {
    const val = env[key]
    if (!val || val.trim() === '') {
      throw new Error(
        `[llamenos] Required environment variable ${key} is missing or empty. ` +
        `Set it before starting the server.`
      )
    }
  }

  function assertHex64(env: ConfigInput, key: string): void {
    assertNonEmpty(env, key)
    const val = env[key]!.trim()
    if (val.length !== 64 || !HEX_RE.test(val)) {
      throw new Error(
        `[llamenos] ${key} must be exactly 64 lowercase hex characters (got length ${val.length}). ` +
        `Generate with: openssl rand -hex 32`
      )
    }
  }

  function assertDatabaseUrl(env: ConfigInput): void {
    assertNonEmpty(env, 'DATABASE_URL')
    const val = env['DATABASE_URL']!.trim()
    if (!val.startsWith('postgres://') && !val.startsWith('postgresql://')) {
      throw new Error(
        `[llamenos] DATABASE_URL must start with postgres:// or postgresql:// (got: ${val.slice(0, 20)}...)`
      )
    }
  }

  function warnIfAbsent(env: ConfigInput, key: string, featureNote: string): void {
    if (!env[key]) {
      console.warn(`[llamenos] Optional ${key} not set — ${featureNote}`)
    }
  }

  /**
   * Validate all required environment variables for the Llamenos worker server.
   * Throws a descriptive Error for any missing or malformed required var.
   * Logs warnings for absent optional vars.
   *
   * @param env - Environment object to validate (defaults to process.env).
   */
  export function validateConfig(env: ConfigInput = process.env): void {
    // --- Required vars ---
    assertDatabaseUrl(env)
    assertHex64(env, 'HMAC_SECRET')
    assertHex64(env, 'SERVER_NOSTR_SECRET')

    // ADMIN_PUBKEY: 64 hex chars (Nostr pubkey, x-only compressed)
    assertNonEmpty(env, 'ADMIN_PUBKEY')
    const adminPubkey = env['ADMIN_PUBKEY']!.trim()
    if (adminPubkey.length !== 64 || !HEX_RE.test(adminPubkey)) {
      throw new Error(
        `[llamenos] ADMIN_PUBKEY must be exactly 64 hex characters (Nostr x-only pubkey). ` +
        `Generate with: bun run bootstrap-admin`
      )
    }

    assertNonEmpty(env, 'HOTLINE_NAME')
    assertNonEmpty(env, 'ENVIRONMENT')

    // --- Optional vars (warn when absent, do not fail) ---
    warnIfAbsent(env, 'NOSTR_RELAY_URL', 'real-time relay disabled')
    warnIfAbsent(env, 'FCM_SERVICE_ACCOUNT_KEY', 'Android push notifications disabled')
    warnIfAbsent(env, 'APNS_KEY_P8', 'iOS push notifications disabled')
    warnIfAbsent(env, 'APNS_KEY_ID', 'iOS push notifications disabled')
    warnIfAbsent(env, 'APNS_TEAM_ID', 'iOS push notifications disabled')
  }
  ```

- [ ] Run tests (green): `cd /home/rikki/projects/llamenos && bun test apps/worker/lib/config.test.ts 2>&1 | tail -20`

#### Task 4.3 — Call validateConfig from server entry point

- [ ] Edit `/home/rikki/projects/llamenos/src/server/index.ts`. Add the following at the top of the file, immediately after the imports and before the `console.log('[llamenos] Starting...')` line:

  ```typescript
  import { validateConfig } from '../../apps/worker/lib/config'

  // Validate required env vars before initializing any services.
  // Exits immediately with a clear error if misconfigured.
  validateConfig()
  ```

  The `validateConfig()` call must appear **before** the `createDatabase(databaseUrl)` call so that a missing `DATABASE_URL` is caught before attempting a connection.

  Also update the existing `DATABASE_URL` line to use the validated value directly (remove the hardcoded fallback — `validateConfig` ensures it exists):

  ```typescript
  // Before (line ~32):
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://llamenos:dev@localhost:5432/llamenos'
  // After:
  const databaseUrl = process.env.DATABASE_URL!
  ```

  > **Note on Bun vs CF Workers guard:** The spec says wrap in `if (typeof Bun !== 'undefined')` — but `src/server/index.ts` is already Bun-only (it is not imported by `apps/worker/index.ts` which is the CF Workers entry). No guard is needed here. `apps/worker/app.ts` does not call `validateConfig` and never should.

- [ ] Verify typecheck passes: `cd /home/rikki/projects/llamenos && bun run typecheck 2>&1 | tail -20`
- [ ] Verify BDD backend tests still pass: `cd /home/rikki/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -30`

- [ ] Commit: `git commit -m "feat(worker): startup env var validation in config.ts (Gap 4)"`

---

### Gap 5 — Documentation: Multi-Hub Routing Axiom

**Context:** The multi-hub routing axiom is not documented in either `CLAUDE.md` or `docs/protocol/PROTOCOL.md`. It must appear in both so future contributors cannot accidentally introduce active-hub gating.

#### Task 5.1 — Add axiom to CLAUDE.md

- [ ] Edit `/home/rikki/projects/llamenos/CLAUDE.md`. Find the "Key Technical Patterns" section (the large bulleted list with `TelephonyAdapter`, `MessagingAdapter`, etc.). Add the following as the **first** bullet in that section:

  ```markdown
  - **Multi-hub routing axiom**: Any authenticated user — regardless of role — can be a member of multiple hubs simultaneously. The app must receive calls, push notifications, and relay events from ALL member hubs regardless of which hub is currently active in the UI. The active hub controls browsing context only. **Never gate incoming call or notification handling on active hub state.** Background push handlers must never call `setActiveHub` — only explicit user tap actions or the app-unlocked call answer path may switch the active hub.
  ```

- [ ] Verify the text is searchable as "multi-hub routing axiom": `grep -n "multi-hub routing axiom" /home/rikki/projects/llamenos/CLAUDE.md`

#### Task 5.2 — Add hub routing section to PROTOCOL.md

- [ ] Edit `/home/rikki/projects/llamenos/docs/protocol/PROTOCOL.md`. Find Section 5 (`## 5. Push Notification Protocol`). After the existing `### 5.4 VoIP Push (iOS)` section (around line 1960) and before `---`, add a new subsection:

  ```markdown
  ### 5.5 Hub Routing for Push Notifications

  The `hubId` field in a decrypted wake payload identifies which hub the notification belongs to. Clients must dispatch the notification to the correct hub handler regardless of which hub is currently active in the UI.

  **Routing rules:**
  - `incoming_call`: Call `linphoneService.handleVoipPush(callId, hubId)` (iOS) or `linphoneService.storePendingCallHub(callId, hubId)` (Android) to register the call→hub mapping. Do NOT switch the active hub context.
  - All other types (`shift_reminder`, `announcement`, `call_ended`): Store `hubId` in notification extras for navigation on tap. Do NOT switch the active hub context.

  **Active hub switching is permitted only when:**
  1. The user explicitly taps a delivered notification (notification tap callback).
  2. The app is unlocked and the user initiates answering a call (the `handleIncomingCall` app-unlocked path).

  This constraint preserves the multi-hub axiom: a user browsing Hub A must not have their context silently switched to Hub B by a background notification.
  ```

- [ ] Verify: `grep -n "5.5 Hub Routing" /home/rikki/projects/llamenos/docs/protocol/PROTOCOL.md`

- [ ] Commit: `git commit -m "docs: add multi-hub routing axiom to CLAUDE.md and PROTOCOL.md (Gap 5)"`

---

## Verification Gates

Run these after all tasks are complete.

### Gap 1 iOS
- [ ] `ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing LlamenosTests/PushRoutingTests 2>&1 | tail -20"` — all 3 new tests green
- [ ] `ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | grep -E 'passed|failed'"` — full suite green, no regressions

### Gap 1 Android
- [ ] `cd /home/rikki/projects/llamenos/apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.service.PushServiceTest" 2>&1 | tail -10` — 4 new tests green
- [ ] `cd /home/rikki/projects/llamenos/apps/android && ./gradlew testDebugUnitTest 2>&1 | tail -10` — full suite green, no regressions
- [ ] `cd /home/rikki/projects/llamenos/apps/android && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -10` — compiles without errors

### Gap 2 CI
- [ ] `grep -A1 "Run codegen" /home/rikki/projects/llamenos/.github/workflows/ci.yml` — shows `bun run codegen:check` immediately after
- [ ] `cd /home/rikki/projects/llamenos && bun run codegen && bun run codegen:check` — exits 0

### Gap 3 Protocol
- [ ] `ls /home/rikki/projects/llamenos/packages/protocol/generated/` — no `typescript/` subdirectory
- [ ] `cd /home/rikki/projects/llamenos && bun run codegen && ls packages/protocol/generated/` — `typescript/` does not reappear
- [ ] `cd /home/rikki/projects/llamenos && bun run codegen:check` — exits 0

### Gap 4 Worker
- [ ] `cd /home/rikki/projects/llamenos && bun test apps/worker/lib/config.test.ts` — all unit tests green
- [ ] `cd /home/rikki/projects/llamenos && bun run typecheck && bun run build` — no type errors
- [ ] `cd /home/rikki/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -10` — BDD tests pass (startup validation accepts test env)

### Gap 5 Docs
- [ ] `grep -n "multi-hub routing axiom" /home/rikki/projects/llamenos/CLAUDE.md` — match found
- [ ] `grep -n "5.5 Hub Routing" /home/rikki/projects/llamenos/docs/protocol/PROTOCOL.md` — match found

### Full regression check
- [ ] `cd /home/rikki/projects/llamenos && bun run typecheck && bun run build` — passes
- [ ] `cd /home/rikki/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -10` — backend BDD green
- [ ] `cd /home/rikki/projects/llamenos/apps/android && ./gradlew testDebugUnitTest lintDebug 2>&1 | tail -10` — Android clean
