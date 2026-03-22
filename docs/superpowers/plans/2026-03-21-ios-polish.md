# iOS Polish — Four Targeted Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four iOS quality issues — silent notification deep-link navigation, main-thread-blocking test bootstrap, hardcoded test keypair in source, and production `print()` calls — to improve test reliability, security hygiene, and production log quality.

**Architecture:** `NavigationBus` (new `@Observable` class) bridges `AppDelegate` to the SwiftUI navigation layer for notification-tap routing; the async/await conversion of the test bootstrap chain eliminates `DispatchSemaphore` main-thread blocking; the remaining two issues are pure in-place replacements with no structural changes.

**Tech Stack:** SwiftUI iOS 17+, `@Observable`, `os.Logger`, `URLSession` async/await, xcodegen `project.yml` for scheme env vars.

---

## Execution Order

Issues are ordered from lowest risk (pure substitutions) to highest (new file + wiring). Run `bun run ios:build && bun run ios:test` after each issue to confirm no regressions before proceeding.

1. **Issue 4** — Replace `print()` with `Logger` (warm-up, zero logic change)
2. **Issue 3** — Remove hardcoded volunteer keypair (pure substitution + scheme config)
3. **Issue 2** — Convert bootstrap semaphores to async/await
4. **Issue 1** — Implement `NavigationBus` and wire into `LlamenosApp`

---

## Issue 4: Replace `print()` with `os.Logger`

### Context

Eleven `print()` calls in non-test source files are not filtered in production builds. They should use `Logger` from the `os` framework for level-aware, subsystem-tagged logging.

**Complete inventory:**

| File | Approx line | Category | Level |
|---|---|---|---|
| `AppState.swift` | 218 | `"test-bootstrap"` | `.debug` |
| `LlamenosApp.swift` | 84 | `"linphone"` | `.error` |
| `LlamenosApp.swift` | 113 | `"push"` | `.error` |
| `LlamenosApp.swift` | 227 | `"push"` | `.info` |
| `LlamenosApp.swift` | 234 | `"push"` | `.error` |
| `LlamenosApp.swift` | 243 | `"push"` | `.error` |
| `LlamenosApp.swift` | 301 | `"push"` | `.error` |
| `HubManagementViewModel.swift` | 81 | `"hub-management"` | `.error` |
| `BiometricPrompt.swift` | 138 | `"auth"` | `.debug` |
| `CryptoService.swift` | 416 | `"test-bootstrap"` | `.debug` |
| `ShiftsViewModel.swift` | 89 | `"linphone"` | `.error` |

Subsystem is `"org.llamenos"` across all files.

### Tasks

- [ ] **4.1** Add `import os` and `private let logger = Logger(subsystem: "org.llamenos", category: "push")` to `LlamenosApp.swift`. Replace all 6 `print()` calls in `LlamenosApp.swift` (lines ~84, ~113, ~227, ~234, ~243, ~301) with the appropriate `logger.debug/info/error(...)` calls.

- [ ] **4.2** Add `import os` and `private let logger = Logger(subsystem: "org.llamenos", category: "test-bootstrap")` inside the `#if DEBUG` block in `AppState.swift`. Replace the `print("[DEBUG] XCTEST_ADMIN_SECRET not set…")` call (line ~218) with `logger.debug(...)`.

- [ ] **4.3** Add `import os` and `private let logger = Logger(subsystem: "org.llamenos", category: "test-bootstrap")` in `CryptoService.swift`. Replace the `print("[DEBUG] XCTEST_ADMIN_SECRET not set…")` call (line ~416) with `logger.debug(...)`.

- [ ] **4.4** Add `import os` and `private let logger = Logger(subsystem: "org.llamenos", category: "hub-management")` in `HubManagementViewModel.swift`. Replace the `print("[HubManagementViewModel] Failed to eager-load key…")` call (line ~81) with `logger.error(...)`.

- [ ] **4.5** Add `import os` and `private let logger = Logger(subsystem: "org.llamenos", category: "auth")` in `BiometricPrompt.swift`. Replace the `print("Authenticated!")` call (line ~138) with `logger.debug("Biometric authentication succeeded.")`.

- [ ] **4.6** Add `import os` and `private let logger = Logger(subsystem: "org.llamenos", category: "linphone")` in `ShiftsViewModel.swift`. Replace the `print("[LinphoneService] Failed to register SIP…")` call (line ~89) with `logger.error(...)`.

- [ ] **4.7** Verify: `grep -r "^[[:space:]]*print(" apps/ios/Sources/ --include="*.swift"` returns zero results. Run `bun run ios:build` on mac; confirm no warnings introduced.

### Files Changed
- `apps/ios/Sources/App/LlamenosApp.swift`
- `apps/ios/Sources/App/AppState.swift`
- `apps/ios/Sources/Services/CryptoService.swift`
- `apps/ios/Sources/ViewModels/HubManagementViewModel.swift`
- `apps/ios/Sources/Views/Auth/BiometricPrompt.swift`
- `apps/ios/Sources/ViewModels/ShiftsViewModel.swift`

---

## Issue 3: Remove Hardcoded Volunteer Keypair

### Context

`CryptoService.swift` lines ~422–430 contain a literal 64-hex-char secret key in source. The existing `setMockIdentity()` method (directly above) already shows the correct pattern: read from `ProcessInfo.processInfo.environment["XCTEST_ADMIN_SECRET"]` and fail loudly if absent. `setMockVolunteerIdentity()` must follow the same pattern using `XCTEST_VOLUNTEER_SECRET`.

The `project.yml` currently has no `environmentVariables` section on any target — `XCTEST_ADMIN_SECRET` is passed by the xcodebuild caller, not declared in `project.yml`. The same approach applies to `XCTEST_VOLUNTEER_SECRET`: it is passed via the test runner environment (shell env → `xcodebuild`), not stored in `project.yml`. Do NOT add the secret value to `project.yml`.

The `scripts/ios-build.sh` `cmd_uitest` already forwards `TEST_HUB_URL` as an env prefix before the `xcodebuild` call. `XCTEST_ADMIN_SECRET` and `XCTEST_VOLUNTEER_SECRET` must be forwarded the same way.

### Tasks

- [ ] **3.1** In `CryptoService.swift`, replace the `setMockVolunteerIdentity()` body:
  - Remove the doc-comment lines that embed the nsec hex and pubkey
  - Replace `let secretHex = "a1b2c3d4..."` with `let secretHex = ProcessInfo.processInfo.environment["XCTEST_VOLUNTEER_SECRET"] ?? ""`
  - Add guard with `assertionFailure("[DEBUG] XCTEST_VOLUNTEER_SECRET not set — volunteer mock identity not loaded. Set this env var in the test scheme.")` and `return`

- [ ] **3.2** In `scripts/ios-build.sh` `cmd_uitest`, forward `XCTEST_ADMIN_SECRET` and `XCTEST_VOLUNTEER_SECRET` alongside `TEST_HUB_URL` as env var prefixes before the `xcodebuild test` call. Pattern:
  ```bash
  TEST_HUB_URL="${TEST_HUB_URL:-http://localhost:3000}" \
  XCTEST_ADMIN_SECRET="${XCTEST_ADMIN_SECRET:-}" \
  XCTEST_VOLUNTEER_SECRET="${XCTEST_VOLUNTEER_SECRET:-}" \
  xcodebuild test \
    ...
  ```
  Also forward the same two vars in `cmd_test` for unit tests.

- [ ] **3.3** Verify: `grep -r "a1b2c3d4e5f6" apps/ios/` returns zero results. Run `bun run ios:build` to confirm build succeeds.

- [ ] **3.4** Generate a fresh random 32-byte hex volunteer secret for CI. Add `XCTEST_VOLUNTEER_SECRET` to the GitHub Actions repository secrets (out of band — this step is a human action, not a file change). Document the requirement alongside `XCTEST_ADMIN_SECRET` in `apps/ios/README.md` if that file exists, otherwise in a comment at the top of `scripts/ios-build.sh`.

### Files Changed
- `apps/ios/Sources/Services/CryptoService.swift`
- `scripts/ios-build.sh`

---

## Issue 2: Convert Test Bootstrap Semaphores to async/await

### Context

`AppState.swift` has four methods in `#if DEBUG` that use `DispatchSemaphore` to block the main thread:
- `bootstrapTestIdentity()` — lines ~179–205 (1 semaphore)
- `registerUserIdentity()` — calls two methods that block
- `bootstrapAdmin(baseURL:adminSecretHex:)` — lines ~227–248 (1 semaphore)
- `createUser(baseURL:adminSecretHex:userPubkey:)` — lines ~250–276 (1 semaphore)

The call chain from `handleLaunchArguments()`:
```
handleLaunchArguments()  [synchronous, called from AppState.init #if DEBUG]
  → bootstrapTestIdentity()  [admin path]
  → registerUserIdentity()   [volunteer path]
      → bootstrapAdmin(...)
      → createUser(...)
```

All four methods must become `async`. The two entry points (`bootstrapTestIdentity` and `registerUserIdentity`) are called from `handleLaunchArguments()`, which is synchronous and called from `init`. The call sites must be wrapped in `Task.detached`.

`request.timeoutInterval = 5` is already set on each request, so `URLSession.data(for:)` will throw `URLError.timedOut` after 5 seconds — same behavior as the semaphore timeout. Use `try?` to discard errors silently (matching existing behavior).

### Tasks

- [ ] **2.1** Convert `bootstrapTestIdentity()` to `async`:
  - Change signature to `private func bootstrapTestIdentity() async`
  - Replace `URLSession.shared.dataTask(...) { sem.signal() }.resume()` + `sem.wait` with `_ = try? await URLSession.shared.data(for: request)`
  - Remove `DispatchSemaphore` usage entirely

- [ ] **2.2** Convert `bootstrapAdmin(baseURL:adminSecretHex:)` to `async`:
  - Change signature to `private func bootstrapAdmin(baseURL: URL, adminSecretHex: String) async`
  - Replace `URLSession.shared.dataTask` + semaphore with `_ = try? await URLSession.shared.data(for: request)`

- [ ] **2.3** Convert `createUser(baseURL:adminSecretHex:userPubkey:)` to `async`:
  - Change signature to `private func createUser(baseURL: URL, adminSecretHex: String, userPubkey: String) async`
  - Replace `URLSession.shared.dataTask` + semaphore with `_ = try? await URLSession.shared.data(for: request)`

- [ ] **2.4** Convert `registerUserIdentity()` to `async`:
  - Change signature to `private func registerUserIdentity() async`
  - Update the two internal calls: `await bootstrapAdmin(...)` and `await createUser(...)`
  - The `guard !adminSecretHex.isEmpty else { ... }` check is a synchronous guard before the async work — that remains unchanged, but replace the `print(...)` inside that guard with `logger.debug(...)` (already done in Issue 4 task 4.2)

- [ ] **2.5** Update `handleLaunchArguments()` call sites — replace both synchronous calls with `Task.detached`:
  ```swift
  // Admin path:
  Task.detached(priority: .userInitiated) { [weak self] in
      await self?.bootstrapTestIdentity()
  }

  // Volunteer path:
  Task.detached(priority: .userInitiated) { [weak self] in
      await self?.registerUserIdentity()
  }
  ```
  Note: `[weak self]` capture is appropriate since `AppState` is a reference type and could theoretically be released before the task completes (unlikely, but correct).

- [ ] **2.6** Verify: `grep -n "DispatchSemaphore" apps/ios/Sources/App/AppState.swift` returns zero results. Run `bun run ios:build && bun run ios:test` on mac.

### Files Changed
- `apps/ios/Sources/App/AppState.swift`

---

## Issue 1: NavigationBus — Deep Link Navigation from Push Notification Tap

### Context

`AppDelegate.userNotificationCenter(_:didReceive:)` already extracts `hubId`, `deepLinkType`, and `entityId` from notification `userInfo`, but navigation is silently discarded. `AppDelegate` cannot access `Router` directly because `Router` is `@State` in `LlamenosApp`.

The existing TODO comment in `LlamenosApp.swift` (lines ~326–328) already identifies `NavigationBus` as the correct solution.

Key constraint: once `NavigationBus` is in place, `AppDelegate` must NOT call `appState?.hubContext.setActiveHub(hubId)` directly — that call must move exclusively to the `NavigationBus` `.onChange` handler in `LlamenosApp`. Calling it from both places would double-invoke `setActiveHub` on every notification tap.

The `Router` already has all required routes: `.caseDetail(id:)`, `.noteDetail(id:)`, `.callDetail(id:)`, `.conversationDetail(id:)`, `.reportDetail(id:)`, `.cases`, `.notes`, `.callHistory`, `.conversations`, `.reports`.

The `handleDeepLink(_ url: URL)` function shows the exact switch-case pattern to follow for mapping string keys to `Route` values.

**Locked state:** If `appState.authStatus != .unlocked` when the notification arrives, the `NavigationBus.pending` is set but not consumed. An `.onChange(of: appState.authStatus)` observer in `LlamenosApp` replays pending navigation after unlock.

### Tasks

- [ ] **1.1** Create `apps/ios/Sources/App/NavigationBus.swift`:
  ```swift
  import Foundation

  @Observable
  final class NavigationBus {
      struct PendingNavigation {
          let hubId: String?
          let deepLinkType: String
          let entityId: String?
      }

      var pending: PendingNavigation?

      func post(hubId: String?, deepLinkType: String, entityId: String?) {
          pending = PendingNavigation(hubId: hubId, deepLinkType: deepLinkType, entityId: entityId)
      }

      func consume() -> PendingNavigation? {
          let p = pending
          pending = nil
          return p
      }
  }
  ```
  Note: `entityId` is `String?` — the spec table includes absent-entity cases (e.g., `deepLinkType: "case"` with no `entityId`). The `AppDelegate` passes `entityId` as `nil` when `userInfo["deepLinkEntityId"]` is absent.

- [ ] **1.2** In `AppDelegate` (in `LlamenosApp.swift`):
  - Add `weak var navigationBus: NavigationBus?` property alongside `weak var appState: AppState?`
    (Note: `@Observable` classes are reference types; `weak` is correct here.)
  - In `userNotificationCenter(_:didReceive:withCompletionHandler:)`:
    - Extract `hubId`, `deepLinkType`, and `entityId` from `userInfo`
    - Replace the entire `if let hubId` block and the discarded `_ = (deepLinkType, entityId)` block with a single call:
      ```swift
      let hubId = userInfo["hubId"] as? String
      let deepLinkType = userInfo["deepLinkType"] as? String
      let entityId = userInfo["deepLinkEntityId"] as? String
      if let deepLinkType {
          navigationBus?.post(hubId: hubId, deepLinkType: deepLinkType, entityId: entityId)
      } else if let hubId {
          // Hub switch without deep link — still handled via NavigationBus
          navigationBus?.post(hubId: hubId, deepLinkType: "", entityId: nil)
      }
      ```
    - Remove the now-redundant `appState?.hubContext.setActiveHub(hubId)` direct call.

- [ ] **1.3** In `LlamenosApp`:
  - Add `@State private var navigationBus = NavigationBus()` alongside `@State private var router = Router()`
  - In the `.onAppear` block, after `appDelegate.appState = appState`, add:
    ```swift
    appDelegate.navigationBus = navigationBus
    ```

- [ ] **1.4** In `LlamenosApp.body`, add a navigation handler. Add two `.onChange` modifiers to the `WindowGroup` content (alongside the existing `.onChange(of: appState.authStatus)` and `.onChange(of: scenePhase)` modifiers):

  ```swift
  // Handle pending navigation from push notification taps
  .onChange(of: navigationBus.pending) { _, pending in
      guard pending != nil else { return }
      if appState.authStatus == .unlocked {
          applyPendingNavigation()
      }
      // If locked: leave pending on bus; authStatus onChange below will replay it
  }
  .onChange(of: appState.authStatus) { _, newStatus in
      router.resetForAuthStatus(newStatus)
      // Replay any pending navigation after unlock
      if newStatus == .unlocked, navigationBus.pending != nil {
          applyPendingNavigation()
      }
  }
  ```

  Note: The existing `.onChange(of: appState.authStatus)` that calls `router.resetForAuthStatus(newStatus)` must be extended (not replaced) to also check for pending navigation. Consolidate both into a single `.onChange(of: appState.authStatus)` handler.

- [ ] **1.5** Add `private func applyPendingNavigation()` to `LlamenosApp`:
  ```swift
  private func applyPendingNavigation() {
      guard let nav = navigationBus.consume() else { return }
      // Switch hub first if needed
      if let hubId = nav.hubId {
          hubContext.setActiveHub(hubId)
      }
      // Translate deepLinkType to Route
      let entityId = nav.entityId ?? ""
      switch nav.deepLinkType {
      case "case":
          router.navigate(to: entityId.isEmpty ? .cases : .caseDetail(id: entityId))
      case "note":
          router.navigate(to: entityId.isEmpty ? .notes : .noteDetail(id: entityId))
      case "call":
          router.navigate(to: entityId.isEmpty ? .callHistory : .callDetail(id: entityId))
      case "conversation":
          router.navigate(to: entityId.isEmpty ? .conversations : .conversationDetail(id: entityId))
      case "report":
          router.navigate(to: entityId.isEmpty ? .reports : .reportDetail(id: entityId))
      case "":
          break  // Hub-switch-only notification, no navigation
      default:
          break
      }
  }
  ```

- [ ] **1.6** Add `NavigationBus.swift` to `apps/ios/project.yml`. The `Llamenos` target uses `sources: - path: Sources` which recursively includes all `.swift` files in the `Sources/` directory tree — **no explicit file listing is needed**. Since `NavigationBus.swift` is placed in `Sources/App/`, it is automatically picked up. Verify by running `xcodegen generate` and confirming the file appears in the generated project.

- [ ] **1.7** Run `xcodegen generate` (via `ssh mac`) to regenerate `Llamenos.xcodeproj`. Run `bun run ios:build && bun run ios:test && bun run ios:uitest` to confirm all tests pass.

### Files Changed
- `apps/ios/Sources/App/NavigationBus.swift` — new file
- `apps/ios/Sources/App/LlamenosApp.swift` — AppDelegate: add `navigationBus` weak ref, replace TODO block; LlamenosApp: add `@State navigationBus`, wire in onAppear, add/update onChange handlers, add `applyPendingNavigation()`

---

## Final Verification

- [ ] `grep -r "^[[:space:]]*print(" apps/ios/Sources/ --include="*.swift"` → zero results
- [ ] `grep -r "a1b2c3d4e5f6" apps/ios/` → zero results
- [ ] `grep -n "DispatchSemaphore" apps/ios/Sources/App/AppState.swift` → zero results
- [ ] `bun run ios:build` green (via `ssh mac`)
- [ ] `bun run ios:test` green (via `ssh mac`)
- [ ] `bun run ios:uitest` green, no main-thread stall warnings (via `ssh mac`)
- [ ] Git diff contains no secret key material
