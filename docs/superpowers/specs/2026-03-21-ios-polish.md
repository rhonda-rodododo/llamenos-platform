# Spec: iOS Polish — Four Targeted Fixes

**Date:** 2026-03-21
**Branch:** desktop (iOS changes go to this branch; no separate iOS branch)
**Priority:** See per-issue priority below
**Scope:** iOS-only. No backend changes. No protocol changes. No other platform changes.

---

## Goal

Fix four distinct iOS quality issues that are small enough not to warrant a dedicated feature epic but real enough that they degrade test reliability, developer trust, or production logging quality. All four are correctable in place — no new architectural subsystems required beyond Issue 1.

---

## Issue 1: Deep Link Navigation from Push Notification Tap (MEDIUM)

### Current State

`apps/ios/Sources/App/LlamenosApp.swift` lines 323–329:

```swift
if let deepLinkType = userInfo["deepLinkType"] as? String,
   let entityId = userInfo["deepLinkEntityId"] as? String {
    Task { @MainActor in
        // TODO: navigate via router — requires router access from AppDelegate.
        // LlamenosApp posts a Notification or uses a shared NavigationBus to bridge this.
        _ = (deepLinkType, entityId)
    }
}
```

The `AppDelegate` already extracts `hubId`, `deepLinkType`, and `entityId` from the notification `userInfo` and already calls `appState?.hubContext.setActiveHub(hubId)` correctly. But navigation never happens — the extracted `deepLinkType` and `entityId` values are silently discarded. Users who tap a push notification land on the dashboard regardless of what the notification was about.

The hub switch already works. The entity navigation is the missing half.

### Root Cause

`AppDelegate` holds a weak reference to `appState` for the hub context switch, but has no reference to `Router`. `Router` is owned by `LlamenosApp` as `@State`, making it inaccessible from `AppDelegate` without a bridge.

### Required Fix

Introduce `NavigationBus` — a simple `@Observable` class that bridges `AppDelegate` to the SwiftUI navigation layer. This is the same pattern the existing code comment already identifies as the solution.

**`NavigationBus` design:**

```swift
// apps/ios/Sources/App/NavigationBus.swift

@Observable
final class NavigationBus {
    struct PendingNavigation {
        let hubId: String?
        let deepLinkType: String
        let entityId: String
    }

    /// Set by AppDelegate when a notification tap delivers a deep link.
    /// Consumed and cleared by the navigation handler in LlamenosApp.
    var pending: PendingNavigation?

    func post(hubId: String?, deepLinkType: String, entityId: String) {
        pending = PendingNavigation(hubId: hubId, deepLinkType: deepLinkType, entityId: entityId)
    }

    func consume() -> PendingNavigation? {
        let p = pending
        pending = nil
        return p
    }
}
```

**Integration points:**

1. Create `NavigationBus` as `@State` in `LlamenosApp`, alongside `Router`. Pass it to `AppDelegate` via `appDelegate.navigationBus = navigationBus` in `onAppear` (same site as `appDelegate.appState = appState`).

2. `AppDelegate` stores a weak reference: `weak var navigationBus: NavigationBus?`. In `userNotificationCenter(_:didReceive:)`, replace the discarded TODO with:
   ```swift
   navigationBus?.post(hubId: hubId, deepLinkType: deepLinkType, entityId: entityId)
   ```
   **Important:** Once `NavigationBus` is in place, remove the direct `appState?.hubContext.setActiveHub(hubId)` call from this same delegate method. The `NavigationBus` `.onChange` handler (step 3 below) becomes the sole place that calls `setActiveHub`. Leaving both in place would call `setActiveHub` twice on every notification tap — once in `AppDelegate` and once in the SwiftUI handler.

3. In `LlamenosApp.body`, add an `.onChange(of: navigationBus.pending)` modifier that:
   - Guards `appState.authStatus == .unlocked` (if locked, store navigation intent and replay after unlock)
   - Calls `navigationBus.consume()`
   - Calls `hubContext.setActiveHub(nav.hubId)` if hubId is present — this is now the **only** call site for hub switching from notification taps (AppDelegate no longer calls it directly)
   - Translates `nav.deepLinkType` to the appropriate `Route` and calls `router.navigate(to:)`

**Deep link type → Route mapping** (mirrors the existing `handleDeepLink` URL handler):

| `deepLinkType` | `entityId` presence | Route |
|---|---|---|
| `"case"` | present | `.caseDetail(id: entityId)` |
| `"case"` | absent | `.cases` |
| `"note"` | present | `.noteDetail(id: entityId)` |
| `"note"` | absent | `.notes` |
| `"call"` | present | `.callDetail(id: entityId)` |
| `"call"` | absent | `.callHistory` |
| `"conversation"` | present | `.conversationDetail(id: entityId)` |
| `"conversation"` | absent | `.conversations` |
| `"report"` | present | `.reportDetail(id: entityId)` |
| `"report"` | absent | `.reports` |

**Cross-hub navigation requirement:**

If `nav.hubId` differs from `hubContext.activeHubId`, the hub switch must complete before navigation. Since `setActiveHub` is synchronous and merely writes `UserDefaults`, this is immediately safe — the view layer already reacts to `hubContext.activeHubId` changes via `@Observable`. The hub switch and subsequent `router.navigate` call can happen in the same `@MainActor` block.

**Locked state handling:**

If the app is locked (`appState.authStatus != .unlocked`) when the notification arrives, store the `PendingNavigation` on `NavigationBus` without consuming it. Add an `.onChange(of: appState.authStatus)` observer in `LlamenosApp` that, when transitioning to `.unlocked`, checks `navigationBus.pending` and replays the navigation. This ensures notification taps survive the PIN unlock flow.

### Files to Change

- `apps/ios/Sources/App/NavigationBus.swift` — new file
- `apps/ios/Sources/App/LlamenosApp.swift` — wire NavigationBus into AppDelegate bridge, add `.onChange` handler
- `apps/ios/Sources/App/LlamenosApp.swift` — `AppDelegate` inner class: replace `_ = (deepLinkType, entityId)` with `navigationBus?.post(...)`
- `apps/ios/project.yml` — add `NavigationBus.swift` to Sources (required for xcodegen)

### Verification Gates

- [ ] Tapping a push notification containing `deepLinkType: "case"` + `entityId: <uuid>` navigates to `CaseDetailView`
- [ ] Tapping a push notification for a non-active hub first switches hub context, then navigates to entity
- [ ] Tapping a notification while locked stores intent; after PIN entry, app navigates to entity
- [ ] Tapping a notification containing only `hubId` (no deep link fields) continues to work as before (hub switch only)
- [ ] `handleDeepLink()` (URL scheme) is unaffected

---

## Issue 2: Main Thread Blocking in Test Bootstrap (HIGH for test reliability)

### Current State

`apps/ios/Sources/App/AppState.swift` contains `#if DEBUG` XCUITest bootstrap code with three `DispatchSemaphore` calls that block the main thread:

- Line 204: `_ = sem.wait(timeout: .now() + 5)` — in `registerUserIdentity()` (waiting for APNs token POST)
- Line 247: `_ = sem.wait(timeout: .now() + 5)` — in `bootstrapAdmin()` (waiting for admin bootstrap POST)
- Line 275: `_ = sem.wait(timeout: .now() + 5)` — in `createUser()` (waiting for user creation POST)

These are called from the main thread during XCUITest setup. Blocking the main thread for up to 5 seconds each (15 seconds total, worst case) causes:
- XCUITest framework to report false timeouts and intermittent `XCUIApplicationStateRunningBackground` errors
- Watchdog kills in aggressive CI environments
- Interaction of multiple blocked-main-thread calls with the UIKit run loop producing unexpected UI state

### Root Cause

The bootstrap methods use `URLSession.dataTask` (callback-based) and block with semaphores to simulate synchronous execution on the main thread. This predates the async/await conversion of the rest of the codebase.

### Required Fix

Convert the three private bootstrap methods to `async` and call them from a non-blocking `Task`. The callee chain is:
```
bootstrapForXCUITest() → registerUserIdentity() → bootstrapAdmin() → createUser()
```

All three must become `async throws` (or `async` with internal error handling). Replace `URLSession.dataTask` + semaphore with `URLSession.data(for:)` (the async variant). Call the root bootstrap function from a detached `Task` so the main thread is never blocked.

**Pattern:**

```swift
// Before
private func bootstrapAdmin(baseURL: URL, adminSecretHex: String) {
    // ...
    let sem = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: request) { _, _, _ in sem.signal() }.resume()
    _ = sem.wait(timeout: .now() + 5)
}

// After
private func bootstrapAdmin(baseURL: URL, adminSecretHex: String) async {
    // ...
    _ = try? await URLSession.shared.data(for: request)
}
```

**Call site in `bootstrapForXCUITest()`** (or wherever the chain originates):

```swift
Task.detached(priority: .userInitiated) {
    await self.registerUserIdentity()
}
```

`Task.detached` is appropriate here because the bootstrap work is explicitly test infrastructure, not app logic, and must not inherit the actor context of the caller.

**`bootstrapForXCUITest()` entry point:** This function itself must also be marked `async`, since it now calls `async` methods in sequence. Its existing call site — inside a `#if DEBUG` block in `applicationDidFinishLaunching` or `application(_:didFinishLaunchingWithOptions:)` (which is synchronous) — must wrap it in a `Task`:

```swift
// In applicationDidFinishLaunching (synchronous context):
#if DEBUG
if ProcessInfo.processInfo.environment["XCUITEST_BOOTSTRAP"] == "1" {
    Task { await appState.bootstrapForXCUITest() }
}
#endif
```

Do not call `await bootstrapForXCUITest()` directly from the synchronous launch method — it will not compile. The `Task { ... }` wrapper is required.

**Timeout handling:** `URLSession.shared.data(for:)` respects `request.timeoutInterval`. The existing `request.timeoutInterval = 5` on each request is sufficient — no additional `withTimeout` wrapper needed. If the request times out, `URLSession` throws `URLError.timedOut`, which the `try?` discards (same behavior as the semaphore timeout).

### Files to Change

- `apps/ios/Sources/App/AppState.swift` — convert `registerUserIdentity`, `bootstrapAdmin`, `createUser` to `async`, replace semaphores with `await URLSession.data(for:)`, wrap call site in `Task.detached`

### Verification Gates

- [ ] `bun run ios:uitest` completes without semaphore-related hangs in CI (3 consecutive green runs)
- [ ] Main thread is not blocked during app startup: Instruments Time Profiler shows no 5-second main thread stalls during XCUITest runs
- [ ] XCUITest bootstrap still registers admin and user correctly (functional test: authenticated routes succeed after bootstrap)
- [ ] No `DispatchSemaphore` remains in `AppState.swift` (grep check)

---

## Issue 3: Hardcoded Test Volunteer Keypair in Source (MEDIUM)

### Current State

`apps/ios/Sources/Services/CryptoService.swift` lines 422–430:

```swift
/// Volunteer nsec hex: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
/// Pubkey:             5877220aaae6e54a6f974602d5995c0fe24a3ea7ddabd8644bec795b9da00743
func setMockVolunteerIdentity() {
    let secretHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    setIdentity(secretHex: secretHex)
}
```

Even though this is inside `#if DEBUG`, having a literal secret key in source is bad practice:
- It appears in `git log` permanently
- It cannot be rotated without a source code change
- It creates a false sense that "debug credentials" are disposable (they may reuse patterns from real keys)
- CI secrets management best practice (already applied to admin key) is inconsistent

Compare with `setMockIdentity()` directly above, which correctly reads from `XCTEST_ADMIN_SECRET`.

### Required Fix

Follow the existing pattern: read from an environment variable `XCTEST_VOLUNTEER_SECRET`, fail clearly if absent.

```swift
func setMockVolunteerIdentity() {
    let secretHex = ProcessInfo.processInfo.environment["XCTEST_VOLUNTEER_SECRET"] ?? ""
    guard !secretHex.isEmpty else {
        // Fail loudly during test runs — missing env var is a test configuration error
        assertionFailure("[DEBUG] XCTEST_VOLUNTEER_SECRET not set — volunteer mock identity not loaded. Set this env var in the test scheme.")
        return
    }
    setIdentity(secretHex: secretHex)
}
```

Remove the hardcoded key from source entirely, including the doc comment lines that embed the pubkey and nsec hex.

**CI configuration:** Add `XCTEST_VOLUNTEER_SECRET` to the GitHub Actions secrets store alongside `XCTEST_ADMIN_SECRET`. Set it in the Xcode test scheme environment variables (same location as `XCTEST_ADMIN_SECRET`). The value should be a randomly generated 32-byte hex string generated during project setup, not reused from the old hardcoded value.

**Scheme configuration:** `XCTEST_VOLUNTEER_SECRET` must be added to `project.yml` under the test scheme's `environmentVariables` section — the same location where `XCTEST_ADMIN_SECRET` is already configured. Do NOT add it by hand in Xcode's scheme editor, because `xcodegen generate` overwrites hand-edited schemes and the change would be lost. The value in `project.yml` should reference a CI-injected environment variable (e.g., `$(XCTEST_VOLUNTEER_SECRET)`) rather than a literal hex string. Generate the actual secret value as a fresh random 32-byte hex string (64 hex chars) — do NOT reuse or derive it from the old hardcoded `a1b2c3d4...` value being replaced. The old value is now considered compromised since it was committed to source history.

**Local development:** Document in `apps/ios/README.md` or the Xcode scheme's environment variables UI that both `XCTEST_ADMIN_SECRET` and `XCTEST_VOLUNTEER_SECRET` are required for XCUITest runs. The `bun run ios:uitest` command should pass these through from the shell environment.

### Files to Change

- `apps/ios/Sources/Services/CryptoService.swift` — replace hardcoded key with env var read, remove key material from doc comment
- CI secrets: add `XCTEST_VOLUNTEER_SECRET` (out of band, not a file change)
- Xcode scheme environment variable configuration (in `project.yml` or scheme file)

### Verification Gates

- [ ] No hex key material appears in `git diff` after this change
- [ ] `grep -r "a1b2c3d4e5f6" apps/ios/` returns zero results
- [ ] `setMockVolunteerIdentity()` fails with an `assertionFailure` message when env var is absent (verified in unit test)
- [ ] XCUITest volunteer-identity tests continue to pass when `XCTEST_VOLUNTEER_SECRET` is set correctly

---

## Issue 4: `print()` Calls in Production Code (LOW)

### Current State

Eleven `print()` calls exist in non-test iOS source files. `print()` is not filtered in production builds, appears in device console logs visible to anyone with a device attached, and cannot be configured by log level. These should be `Logger` calls (from the `os` framework) with appropriate subsystem, category, and level.

**Complete inventory:**

| File | Line approx | Current call | Category | Level |
|---|---|---|---|---|
| `AppState.swift` | 218 | `print("[DEBUG] XCTEST_ADMIN_SECRET not set…")` | `"test-bootstrap"` | `.debug` |
| `LlamenosApp.swift` | 84 | `print("[Linphone] Core initialization failed…")` | `"linphone"` | `.error` |
| `LlamenosApp.swift` | 113 | `print("[APNs] Authorization error…")` | `"push"` | `.error` |
| `LlamenosApp.swift` | 227 | `print("[APNs] Device token registered…")` | `"push"` | `.info` |
| `LlamenosApp.swift` | 234 | `print("[APNs] Device registration failed…")` | `"push"` | `.error` |
| `LlamenosApp.swift` | 243 | `print("[APNs] Registration failed…")` | `"push"` | `.error` |
| `LlamenosApp.swift` | 301 | `print("[APNs] Wake payload decryption failed…")` | `"push"` | `.error` |
| `HubManagementViewModel.swift` | 81 | `print("[HubManagementViewModel] Failed to eager-load key…")` | `"hub-management"` | `.error` |
| `BiometricPrompt.swift` | 138 | `print("Authenticated!")` | `"auth"` | `.debug` |
| `CryptoService.swift` | 416 | `print("[DEBUG] XCTEST_ADMIN_SECRET not set…")` | `"test-bootstrap"` | `.debug` |
| `ShiftsViewModel.swift` | 89 | `print("[LinphoneService] Failed to register SIP…")` | `"linphone"` | `.error` |

### Required Fix

Replace all `print()` calls with `Logger` from `import os`. Use a consistent subsystem of `"org.llamenos"` across all files.

**Standard header pattern** (add to each file that needs it):

```swift
import os
private let logger = Logger(subsystem: "org.llamenos", category: "push")
```

Then replace each `print(...)` with the appropriate level:
- `logger.debug("...")`
- `logger.info("...")`
- `logger.error("...")`

In `AppState.swift` and `CryptoService.swift`, the `#if DEBUG` print calls for missing test env vars should use `.debug` level — they are only meaningful in test builds and will be compiled out of release builds via `#if DEBUG`. Note: replacing a `#if DEBUG print()` with a `#if DEBUG Logger.debug()` call is low-value on its own — the output goes to the same place in debug builds. The primary benefit is consistency with the rest of the Logger migration and ensuring these events would reach any future log backend (crash reporters, log aggregation). If there is no plan to wire `Logger` to a crash reporter or aggregation pipeline in debug builds, this specific substitution can be deferred until that wiring is in place; prioritize the production-build `print()` calls (all the non-`#if DEBUG` ones in the inventory above) first.

For the `BiometricPrompt.swift` `print("Authenticated!")` — this is a vestigial debug statement. Replace with `logger.debug("Biometric authentication succeeded.")` and use category `"auth"`.

**Note on `Logger` availability:** `Logger` with string interpolation requires iOS 14+. The project's `minDeploymentTarget` is iOS 17, so there are no compatibility concerns.

### Files to Change

- `apps/ios/Sources/App/AppState.swift`
- `apps/ios/Sources/App/LlamenosApp.swift`
- `apps/ios/Sources/ViewModels/HubManagementViewModel.swift`
- `apps/ios/Sources/Views/Auth/BiometricPrompt.swift`
- `apps/ios/Sources/Services/CryptoService.swift`
- `apps/ios/Sources/ViewModels/ShiftsViewModel.swift`

### Verification Gates

- [ ] `grep -r "^[[:space:]]*print(" apps/ios/Sources/ --include="*.swift"` returns zero results (excluding test files)
- [ ] `import os` and `Logger` appear in each modified file
- [ ] Log messages are visible in Console.app / `xcrun simctl diagnose` with correct subsystem `org.llamenos`
- [ ] `bun run ios:build` succeeds with no warnings introduced by this change
- [ ] `bun run ios:test` and `bun run ios:uitest` remain green

---

## File Map Summary

| File | Issues |
|---|---|
| `apps/ios/Sources/App/NavigationBus.swift` | New — Issue 1 |
| `apps/ios/Sources/App/LlamenosApp.swift` | Issues 1, 4 |
| `apps/ios/Sources/App/AppState.swift` | Issues 2, 4 |
| `apps/ios/Sources/Services/CryptoService.swift` | Issues 3, 4 |
| `apps/ios/Sources/ViewModels/HubManagementViewModel.swift` | Issue 4 |
| `apps/ios/Sources/Views/Auth/BiometricPrompt.swift` | Issue 4 |
| `apps/ios/Sources/ViewModels/ShiftsViewModel.swift` | Issue 4 |
| `apps/ios/project.yml` | Issue 1 (add NavigationBus.swift to Sources) |

---

## Execution Order

Issues 4 (print → Logger) and 3 (hardcoded key) are pure replacements with no interdependencies — do them first as warm-up. Issue 2 (semaphore → async) requires understanding the bootstrap call chain before touching it. Issue 1 (NavigationBus) is the only new-file addition and should be done last after the simpler changes validate the build stays green.

Run `bun run ios:build && bun run ios:test && bun run ios:uitest` after each issue to confirm no regressions before moving to the next.
