---
name: multi-platform-test-recovery
description: >
  Diagnose and fix test failures across Desktop (Playwright), iOS (XCUITest), and Android
  (Cucumber/Compose) in the Llamenos monorepo. Use this skill when tests are failing, when
  the user mentions "test failure", "tests broken", "fix tests", "XCUITest", "Playwright",
  "BDD", "E2E", "test recovery", "tests timing out", "element not found", "test flaky", or
  when `bun run test:all` or `bun run test:changed` reports failures. Also use proactively
  after UI changes, navigation restructures, or component refactors that are likely to break
  existing tests — even before running them. If the user says tests "started failing" after
  a code change, or describes specific test errors (selector not found, timeout, state
  interference), this skill applies. Distinct from test-orchestration which handles
  infrastructure — this skill diagnoses why test logic fails and provides platform-specific
  fixes. Encodes patterns learned from 133+ test-related commits and 8 major recovery efforts.
---

# Multi-Platform Test Recovery for Llamenos

Test failures in this monorepo have well-understood root causes. The project has 600+ tests
across 4 platforms, and 28% of all commits historically are test fixes. This skill provides
a systematic approach to diagnosing and fixing failures efficiently.

## First: Identify What's Failing

```bash
# Run only tests for platforms affected by your changes
bun run test:changed

# Or run everything
bun run test:all

# Or target a specific platform
bun run test:desktop    # Playwright BDD
bun run test:ios        # XCUITest + unit tests
bun run test:android    # Gradle unit + lint + androidTest
bun run test:crypto     # cargo test + clippy
bun run test:worker     # Worker integration tests
```

Read the output carefully — the unified test runner shows platform-by-platform results.

## Root Cause Taxonomy

Test failures fall into 5 categories. Diagnose before fixing:

| Category | Frequency | Symptoms |
|----------|-----------|----------|
| **Selector fragility** | 30% | "Element not found", "strict mode violation", multiple matches |
| **State interference** | 20% | Test passes alone, fails in parallel; wrong data appears |
| **Auth/crypto mismatch** | 15% | Login fails, PIN entry hangs, crypto operations throw |
| **Async timing** | 10% | Intermittent failures, "timeout waiting for", works locally |
| **UI restructure** | 25% | Tests broke after navigation/layout changes |

## Platform: Desktop (Playwright)

### Key Files
- `tests/helpers.ts` — Login helpers, PIN entry, common utilities
- `tests/test-ids.ts` — 250+ centralized `data-testid` constants
- `tests/pages/` — Page Object pattern for navigation and CRUD
- `tests/steps/` — 54 BDD step definition files by domain
- `playwright.config.ts` — Config: 3 workers, 30s timeout, 1 retry

### Selector Rules

**ALWAYS use `data-testid`** — never fragile selectors like `getByRole('button', { name: /close/i })`:

```typescript
// BAD — matches multiple elements, breaks on text changes
await page.getByText('Close').click()

// GOOD — unique, stable identifier
await page.getByTestId('close-report').click()
```

When adding new UI elements, always add `data-testid` to the component.

### Common Failures & Fixes

**"strict mode violation: getByText resolved to N elements"**
- Cause: Multiple elements share the same text (visible + sr-only)
- Fix: Use `data-testid` or `getByText('text', { exact: true }).first()`

**"Element not found" after navigation change**
- Cause: Route/component restructure changed the DOM
- Fix: Update page objects in `tests/pages/`, verify `data-testid` still exists

**Parallel test interference**
- Cause: Two tests creating resources with the same name
- Fix: Use `Date.now()` suffix in resource names: `\`Volunteer ${Date.now()}\``
- NEVER use `resetTestState()` in individual test files — only in `tests/global-setup.ts`

**Login/PIN failures**
- Cause: Platform abstraction layer (`platform.ts`) uses Tauri IPC mock in tests
- Fix: Ensure `PLAYWRIGHT_TEST=true` triggers correct mock path. PIN timing: 100ms between digits, 500ms after last digit for onComplete callback

**Empty state assertions failing**
- Cause: Parallel tests created resources, so "empty state" message doesn't appear
- Fix: Assert "content OR empty state": `await expect(page.getByTestId('list').or(page.getByTestId('empty-state'))).toBeVisible()`

**Timeout on crypto operations**
- Cause: PBKDF2 is slow in test builds
- Fix: Increase timeout to 45s for flows involving key derivation

### Waiting Patterns

```typescript
// BAD — arbitrary wait
await page.waitForTimeout(2000)

// GOOD — wait for specific signal
await page.waitForResponse(resp => resp.url().includes('/api/notes') && resp.status() === 200)

// GOOD — wait for navigation to settle
await page.waitForURL('**/dashboard')

// GOOD — wait for element
await page.getByTestId('note-card').waitFor({ state: 'visible', timeout: 10000 })
```

### BDD Step Definition Pattern

Steps live in `tests/steps/{domain}.ts`. When a feature file step doesn't match:

```typescript
// Feature: Given I am logged in as an admin
// Step definition must match exactly:
Given('I am logged in as an admin', async ({ page }) => {
  await loginAsAdmin(page)  // Use helper from tests/helpers.ts
})
```

## Platform: iOS (XCUITest)

### Key Files
- `apps/ios/Tests/UI/Helpers/BaseUITest.swift` — BDD helpers, launch config, navigation
- `apps/ios/Tests/UI/` — 16 UI test files
- `apps/ios/Tests/Unit/` — Unit tests (CryptoService, etc.)

### Running Tests

```bash
cd /Users/rhonda/projects/llamenos/apps/ios && \
xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | \
  tee /tmp/uitest-output.log | \
  grep --line-buffered -E '(Test Case|Executed|error:)'
```

**ALWAYS use `tee`** to capture full output AND filter. Check `/tmp/uitest-output.log` for details.

### Common Failures & Fixes

**"Failed to find element" — SwiftUI List lazy rendering**
- Cause: `List(.insetGrouped)` only renders visible cells. Off-screen items are NOT in the accessibility hierarchy
- Fix: Keep testable elements above the fold, or use `ScrollView` instead of `List` for test-critical views
- Workaround: `app.swipeUp()` before element query (unreliable for deep lists)

**Navigation restructure breaks**
- Cause: Settings split into sub-pages, new navigation paths
- Fix: Update `BaseUITest` navigation helpers:
  ```swift
  func navigateToAccountSettings() {
      app.buttons["settings-tab"].tap()
      app.buttons["account-settings-link"].tap()
  }
  ```

**PanicWipe friction gate**
- The PanicWipe test must: tap button → type "WIPE" in TextField → confirm alert
- If the flow changed, update the test to match the new friction gate steps

**Hub URL validation in auth flow**
- Tests use `--test-skip-hub-validation` launch arg to bypass async connectivity check
- If auth flow changes, ensure this flag is still checked in AuthViewModel

**Keychain errors (-34018)**
- Cause: SPM test runner doesn't have keychain entitlements
- Expected: KeychainServiceTests fail in CI. This is a known limitation, not a bug

**Mirror + @Observable**
- Swift's `@Observable` macro rewrites stored properties — `Mirror` cannot access them by name
- Don't use Mirror-based assertions on @Observable ViewModels

### Serial Test Dependencies

```swift
test.describe.configure({ mode: 'serial' })
```

Serial tests share state. If test 2 fails, test 3 may be corrupted. Check:
- Is the section already expanded? (persisted in sessionStorage)
- Is the resource already created? (from a previous retry)
- Use `isVisible().catch(() => false)` pattern for conditional setup

### XCUITest Element Finding

```swift
// Universal pattern — works for any element type
app.descendants(matching: .any)["accessibility-identifier"]

// Specific type
app.buttons["settings-tab"]
app.textFields["hub-url-field"]
app.staticTexts["welcome-title"]

// Wait for existence
let element = app.buttons["my-button"]
XCTAssertTrue(element.waitForExistence(timeout: 5))
```

## Platform: Android (Cucumber/Compose)

### Key Files
- `apps/android/app/src/test/` — Unit tests (CryptoService, AuthViewModel, etc.)
- `apps/android/app/src/androidTest/` — Cucumber BDD E2E tests
- `build.gradle.kts` — Build config (AGP 9.1, Kotlin 2.3, KSP)

### Environment Setup

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
```

### Common Failures & Fixes

**CryptoService hard-fail without native lib**
- This is INTENTIONAL: `CryptoServiceTest` verifies the app crashes if native Rust lib isn't loaded
- If this fails, it means the security invariant is broken — investigate, don't suppress

**ComposeTimeoutException**
- Cause: Compose node not found within timeout
- Fix: Use defensive assertions with `try/catch(Throwable)` (not just Exception)
- Add `composeTestRule.waitForIdle()` before assertions

**Android emulator BROKEN on macOS 26 Tahoe**
- Known issue: HVF hardware virtualization fails with `mprotect: Permission denied`
- Android E2E tests must run on Linux machine (192.168.50.95) or real device
- Unit tests and lint run fine locally without emulator

**R.string.* reference mismatch**
- Cause: Codegen output changed but Kotlin code wasn't updated
- Fix: `bun run i18n:validate:android` to find mismatches, then rename refs
- See the `i18n-string-workflow` skill for the full procedure

**Build failures after dependency upgrade**
- Check `JAVA_HOME` is set to JDK 21
- Check Gradle wrapper version matches `gradle/wrapper/gradle-wrapper.properties`
- AGP 9 removed `kotlin-android` plugin — don't re-add it
- KSP replaced kapt — use `ksp()` not `kapt()` for annotation processors

## Platform: Crypto (Rust)

### Running

```bash
bun run crypto:test         # cargo test
bun run crypto:test:mobile  # cargo test --features mobile (FFI tests)
bun run crypto:clippy       # Linting
bun run crypto:fmt          # Format check
```

### Common Failures

**FFI symbol missing**
- Cause: `--features mobile` not passed, so UniFFI scaffolding wasn't compiled
- Fix: Use `bun run crypto:test:mobile` for FFI tests

**Cross-platform interop failure**
- Cause: Wire format changed in Rust but not updated in TS/Swift/Kotlin
- Fix: Check `packages/crypto/tests/test_vectors.json`, ensure all platforms use same vectors

## General Recovery Workflow

1. **Run `bun run test:changed`** to see what's broken
2. **Read the error messages** — categorize by root cause taxonomy
3. **Check recent git changes**: `git log --oneline -10` — did a UI restructure just happen?
4. **Fix in dependency order**: codegen → backend → desktop → iOS → Android
5. **Re-run affected platform**: `bun run test:{platform}`
6. **Run full suite**: `bun run test:all` before committing

## Pre-Commit Verification

Before committing any code change:

```bash
bun run test:changed   # Fast: only affected platforms
# OR
bun run test:all       # Thorough: everything
```

Both commands run the codegen guard first (ensures generated files are up-to-date).
