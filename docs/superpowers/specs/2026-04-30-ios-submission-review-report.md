---
date: 2026-05-01
reviewer: ios-full-test-review worker (Claude Opus 4.7, on Mac M4)
branch: ios-full-test-review
inputs:
  - origin/ios-privacy-compliance (b3b0b6eb — Privacy Manifest, code signing, entitlements)
  - origin/ios-voip-callkit-audit (7b4d6c9a — removed `voip` UIBackgroundMode)
  - origin/ios-localization-audit (14f2bdbc — RTL fixes, NSLocalizedString page-info)
status: READY pending Apple Developer team activation
---

# iOS App Store Submission — Final Review Report

This is the final QA pass after the privacy-compliance, voip-callkit-audit, and
localization-audit workers completed their iOS App Store submission prep work.
The reviewer pulled all three branches, did clean Debug + Release builds,
ran the unit-test suite, audited the bundle, and reviewed the diff line-by-line.

The spec file referenced in the task brief
(`docs/superpowers/specs/2026-04-30-ios-app-store-submission.md`) does not
exist on `main` or any of the iOS feature branches. The review followed the
task brief directly.

## Top-line verdict

| Item | Status |
|---|---|
| Debug build (iPhone 17 simulator) | ✅ BUILD SUCCEEDED, 0 errors |
| Release build (generic/iOS, unsigned) | ✅ BUILD SUCCEEDED, 0 errors |
| Unit tests (LlamenosTests) | ✅ 93 tests, 0 failures |
| UI test target compiles | ✅ TEST BUILD SUCCEEDED |
| UI tests end-to-end | ⚠️ Not executed end-to-end (see below) |
| Privacy Manifest in bundle | ✅ Present (4037 bytes), all required entries |
| ITSAppUsesNonExemptEncryption | ✅ true |
| Usage descriptions (Camera/FaceID/Location/Mic/Speech) | ✅ All present, user-friendly |
| `voip` removed from UIBackgroundModes | ✅ Confirmed in compiled Info.plist |
| Per-config entitlements (Debug=development, Release=production APNs) | ✅ |
| App Icon 1024×1024 RGB no-alpha | ✅ |
| 13 locales bundled | ✅ ar, de, en, es, fr, hi, ht, ko, pt-BR, ru, tl, vi, zh-Hans |

**Submission readiness:** App is technically ready to upload to App Store
Connect once the Apple Developer Team ID is filled in and a distribution
certificate + provisioning profile are issued. No code-level work remains.

## Issues found and fixed by this review

### 1. Logo.imageset asset-catalog errors (introduced by privacy-compliance commit) — FIXED

**Severity:** Build-time error, 5 occurrences per build.

The privacy-compliance commit added PNG fallbacks at @1x/@2x/@3x to
`Logo.imageset` while keeping the existing `logo.svg` (which had no scale
specified, i.e. "Any"). Asset Catalog rejects this combination:

```
error: Image set has a child with bitmap content and the "Any" scale.
The image set also has children with specific scales and content.
```

`preserves-vector-representation: true` requires the vector source to be
the only "Any"-scale entry. The PNG fallbacks added ~190 KB of bundle bloat
with no benefit on the iOS 17+ deployment target (which renders SVG natively
in asset catalogs).

**Fix:** Reverted Logo.imageset to SVG-only — matches the pre-PR state.
Commit `8f1946e3`.

### 2. cases_page_info i18n format string mismatch (introduced by localization-audit commit) — FIXED

**Severity:** Runtime garbage / potential crash on every visit to the Cases
list when pagination > 1 page.

The localization-audit commit wired `CaseListView`'s "Page X of Y" to
`NSLocalizedString("cases_page_info")`, but the format strings in all 13
locale files declared `%@` (Objective-C object placeholder) for both
arguments. The Swift call site passes `Int` values
(`vm.currentPage`, `vm.totalPages`):

```swift
Text(String(format: NSLocalizedString("cases_page_info", comment: "..."),
            vm.currentPage, vm.totalPages))
```

Swift `Int` does not bridge to `NSObject` for `%@`. At runtime,
`String(format:)` interprets the 64-bit integer as a pointer and either
prints garbage or crashes. The format strings additionally used the
mixed-style `%@ … %2$@` anti-pattern (sequential then positional), which
breaks when translators reorder arguments (e.g. Korean: `%2$@ 중 %@ 페이지`
rather than `%@ 중 %2$@ 페이지`).

**Fix:** Switched all 13 locales to `%1$d` / `%2$d` (decimal integer with
positional indices). Commit `21ff7807`.

## Pre-existing issues (not from these PRs, not blocking submission)

These were observed during testing but predate the App Store submission
work and should be tracked separately:

1. **4 AuthFlowUITests failures** — `testLoginScreenShowsRequiredElements`,
   `testOnboardingFlowCreateIdentity`, `testImportKeyFlow`,
   `testDashboardShowsIdentityAndLockButton` look for accessibility identifiers
   `import-key`, `nsec-display`, `npub-display` that no longer exist after the
   v3 device-key crypto migration. `OnboardingView.swift:4` documents this:
   *"In the v3 device key model, there is no nsec to display for backup."*
   The tests need to be updated to match the new identity model. PINPad and
   lock/unlock tests in the same file pass — the harness works.

2. **23 of 24 UI test suites require backend infra** — every test class that
   inherits `BaseUITest` calls `createTestHub()` in `setUp()`, which posts to
   `${TEST_HUB_URL:-http://localhost:3000}/api/test-create-hub`. End-to-end UI
   testing requires `docker compose -f docker-compose.yml -f
   docker-compose.test.yml up`. This was out of scope for the review (no
   `.env` populated on this Mac). The UI test **target builds cleanly**, which
   is the meaningful code-review check.

3. **Swift 6 concurrency warnings** in pre-existing viewmodels (NotesViewModel,
   ReportsViewModel, ShiftsViewModel) — `UIImpactFeedbackGenerator(style:)` and
   `notificationOccurred()` called from non-main-actor contexts. Will become
   errors in Swift 6 mode. Not blocking on Swift 5.9.

4. **Swift 6 Sendable warnings** in `packages/protocol/generated/swift/Types.swift`
   — codegen produces `JSONAny` non-Sendable inside `Sendable`-conforming
   structs (e.g. `AuditEntryResponse.details`). Fix belongs in
   `packages/protocol/tools/codegen.ts`'s Swift post-processor.

5. **`'kSecUseOperationPrompt' was deprecated in iOS 14.0`** in
   `KeychainService.swift:204` — should be migrated to `kSecUseAuthenticationContext`
   + `LAContext.localizedReason`. Pre-existing.

6. **12 `print()` statements in production code** (e.g.
   `apps/ios/Sources/App/LlamenosApp.swift:234`,
   `HubManagementViewModel.swift:81`). Diagnostic only — none print secrets
   (the APNs token print is truncated to first 12 chars, which is a public
   identifier). Should be guarded by `#if DEBUG` or replaced with `os_log`
   before production but not blocking v1.

## Pending human action (App Store blockers)

These cannot be done by Claude — they require the Apple Developer account.

1. **`DEVELOPMENT_TEAM` is empty in `apps/ios/project.yml:17`.**
   Once the Apple Developer account is activated, fill in the 10-character
   Team ID (e.g. `AB12CD34EF`).

2. **`teamID` is empty and `provisioningProfiles` dict missing in
   `apps/ios/ExportOptions.plist`.** The TODO comment in the file documents
   exactly what to fill in. Note the inconsistency below.

3. **App can't be code-signed for a real device or App Store** until items 1
   and 2 are done. The Release build I produced uses
   `CODE_SIGNING_ALLOWED=NO` because no team is set.

## Recommended follow-up (non-blocking)

1. **Reconcile signing-style mismatch.** `project.yml` sets
   `CODE_SIGN_STYLE: Automatic`, but `ExportOptions.plist` has
   `signingStyle: manual`. The export step (`xcodebuild -exportArchive`)
   will require the `provisioningProfiles` dict to be populated. Either
   change ExportOptions to `signingStyle: automatic` (only `teamID` needed)
   or keep manual and add the explicit profile mapping.

2. **Declare `UISupportedInterfaceOrientations`.** Xcode validation warns
   *"All interface orientations must be supported unless the app requires
   full screen."* The screenshots in `site/public/screenshots/ios/` are all
   portrait, so the natural choice is portrait-only on iPhone, all four on
   iPad. Add to `apps/ios/project.yml`'s `info.properties`:

   ```yaml
   UISupportedInterfaceOrientations:
     - UIInterfaceOrientationPortrait
   "UISupportedInterfaceOrientations~ipad":
     - UIInterfaceOrientationPortrait
     - UIInterfaceOrientationPortraitUpsideDown
     - UIInterfaceOrientationLandscapeLeft
     - UIInterfaceOrientationLandscapeRight
   ```

3. **Add `TEST_HUB_URL` setup script for the Mac.** Once the dev compose is
   running on the Mac (or pointing at a remote test hub), the `bun run
   ios:uitest` script handles the rest. Consider adding a `mac:test:setup`
   make target so a single command brings up dev compose + sets env vars
   for the UI tests.

4. **Migrate `kSecUseOperationPrompt` → `kSecUseAuthenticationContext`** in
   `KeychainService.swift`. Tracked but not for v1.

5. **Update v3 AuthFlowUITests** to test the actual current onboarding flow
   ("Create New Identity" / "Link Device" buttons) rather than the legacy
   nsec/import-key UI.

## Privacy Manifest review (`PrivacyInfo.xcprivacy`)

The manifest is comprehensive. Audited each declared category against actual
iOS source code usage:

| Declared category | Source code evidence | Verdict |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` (CA92.1) | 21 UserDefaults usages (consent flag, hub ID, auto-lock timeout) | ✅ |
| `OtherUserContent` (linked) | Note bodies, message content | ✅ |
| `DeviceID` (linked) | Per-device pubkey persisted to keychain | ✅ |
| `UserID` (linked) | User pubkey, sigchain identity | ✅ |
| `ProductInteraction` (linked) | Analytics-style events (M26 metrics) | ✅ |
| `CrashData` (not linked) | `CrashReportingService` writes to local dir | ✅ |
| `PerformanceData` (not linked) | Same service, perf metrics | ✅ |
| `PreciseLocation` (linked) | Location autofill in reports | ✅ |
| `AudioData` (linked) | VoIP calls + Whisper voice-to-text | ✅ |
| `PhoneNumber` (linked) | Caller numbers in conversations | ✅ |

**APIs checked but NOT triggering Required Reason categories:**
- File timestamps (`creationDate`, `modificationDate`, `attributesOfItem`) — not used
- System boot time / `systemUptime` — not used
- Disk space (volume free space / total) — not used
- Active keyboards — not used

`NSPrivacyTracking: false` is correct — no third-party trackers, no IDFA.
`NSPrivacyTrackingDomains: []` is correct.

## VoIP / CallKit decision review

The voip-callkit-audit commit's reasoning is sound and well-documented. iOS 13+
will terminate apps that declare `voip` in `UIBackgroundModes` if they don't
register PKPushRegistry and immediately invoke `CXProvider.reportNewIncomingCall`
on every push. None of those preconditions are met:

- No `PKPushRegistry` registration anywhere in `apps/ios/Sources/`.
- No `PKPushRegistryDelegate` implementation.
- `LinphoneService.handleVoipPush` is misnamed — it's invoked from the
  standard APNs `didReceiveRemoteNotification` handler, not from PushKit.
- `apps/ios/Frameworks/linphone-sdk.xcframework` is not committed (only a
  `LINPHONE_VERSION` marker exists). `core.callKitEnabled = true` inside
  `#if canImport(linphonesw)` is dead code until the framework is added.
- Server-side `apps/worker/lib/voip-push.ts` is ready, but iOS never calls
  `/api/devices/voip-token`, so `getVoipTokens()` returns no iOS devices.

For v1, the standard APNs path (`remote-notification` mode +
`UNUserNotification`) is the only working flow. Re-add `voip` once PushKit
+ CallKit are wired and verified end-to-end on a real device.

## Confidence assessment

**App Store submission readiness: HIGH** for the code itself.

- Build pipeline is green (Debug + Release).
- Privacy Manifest, usage descriptions, encryption declaration, and
  background modes all match what the app actually does.
- No regressions introduced by the three feature branches that I could find.
- Two real bugs in the merged work were caught and fixed (asset catalog,
  i18n format string).

The only thing standing between this branch and an actual upload is the
Apple Developer team activation. Once `DEVELOPMENT_TEAM` is filled in,
`bun run ios:build` should produce a signable Release archive, and
`fastlane beta` (or Transporter) will upload it.

## Build commands used (for reproduction)

```bash
# Pre-reqs
bun install
bun run codegen                          # Generates packages/protocol/generated/swift/
cd packages/crypto && bash scripts/build-mobile.sh ios
cp -R packages/crypto/dist/ios/LlamenosCoreFFI.xcframework apps/ios/
cp packages/crypto/dist/ios/LlamenosCore.swift apps/ios/Sources/Generated/
cd apps/ios && xcodegen generate

# Builds (both succeeded with 0 errors)
xcodebuild clean build -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "platform=iOS Simulator,name=iPhone 17" -configuration Debug
xcodebuild clean build -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "generic/platform=iOS" -configuration Release \
  CODE_SIGNING_ALLOWED=NO

# Tests
xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosTests
# Result: Executed 93 tests, with 0 failures (0 unexpected) in 5.041s
```

## Logs (kept on Mac for inspection)

- `/tmp/ios-debug-build.log` (Debug build, post-fixes)
- `/tmp/ios-release-build.log` (Release build, unsigned)
- `/tmp/ios-unit-tests.log` (93 unit tests)
- `/tmp/ios-uitest-build.log` (UI test target build)
- `/tmp/ios-uitest-auth.log` (AuthFlow UI tests, 5 passed / 4 pre-existing-fail)

## Commits added by this review

1. `8f1946e3` — fix(ios): revert Logo.imageset to SVG-only to clear asset catalog errors
2. `21ff7807` — fix(ios): use %d (not %@) for Int args in cases_page_info
