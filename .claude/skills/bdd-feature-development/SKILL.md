---
name: bdd-feature-development
description: >
  Guide BDD-driven feature development in the Llamenos monorepo. Use this skill when
  implementing features using the phased workflow (API+specs -> parallel clients -> integration),
  writing shared Gherkin specs, creating backend BDD step definitions, debugging test failures
  in the BDD pipeline, or when the user mentions "BDD", "feature file", "Gherkin", "step
  definition", "shared spec", "backend BDD", "test:backend:bdd", "phased implementation",
  "behavioral test", or describes wanting to write tests before implementation. Also use
  when tests fail after feature implementation -- this replaces multi-platform-test-recovery
  with a proactive, test-first approach. Use when the user says "tests broke", "fix tests",
  "write tests first", "add test coverage", or "E2E testing".
---

# BDD-Driven Feature Development for Llamenos

Features are developed in 3 phases. Shared BDD specs are the behavioral contract
between phases. Tests are written BEFORE implementation, not after.

## The 3-Phase Workflow

### Phase 1: API + Locales + Shared BDD Specs (single agent)

**Touches:** `apps/worker/`, `packages/i18n/`, `packages/test-specs/`, `tests/steps/backend/`
**Does NOT touch:** `src/client/`, `apps/ios/`, `apps/android/`

1. Implement backend routes/DO methods
2. Add i18n strings (all 13 locales)
3. Write shared .feature files in `packages/test-specs/features/`
4. Write backend step definitions in `tests/steps/backend/`
5. **Gate**: `bun run test:backend:bdd` passes

### Phase 2: Client Implementation (parallel agents)

**Each agent touches ONLY its platform directory:**
- Desktop: `src/client/`, `tests/steps/` (NOT `tests/steps/backend/`)
- iOS: `apps/ios/`
- Android: `apps/android/`

Each agent:
1. Implements UI to support the feature
2. Writes platform step definitions for the shared .feature scenarios
3. **Gate**: Platform BDD passes

### Phase 3: Integration Gate

```bash
bun run test:all
```

All green -> merge. Red -> fix in the failing platform only.

## Writing Shared BDD Specs

### Directory Structure

```
packages/test-specs/features/
  core/           # Shared across all platforms + backend
  admin/          # Admin operations
  security/       # Security-specific
  platform/       # Platform-specific ONLY (desktop/, ios/, android/)
```

### Tagging Rules

```gherkin
@backend                    # API-level test (no UI)
@desktop @ios @android      # Runs on all client platforms
@desktop                    # Desktop-only
@smoke                      # Fast CI subset
@regression                 # Full suite
```

- Scenarios in `core/` and `admin/` MUST have `@backend` + platform tags
- Scenarios in `platform/` have only their platform tag
- Backend scenarios are the minimum bar -- if backend BDD passes, the API is correct

### Scenario Quality Rules

**Test BEHAVIOR, not UI elements:**

```gherkin
# BAD -- tests UI existence
Then I should see the "calls-today" element
Then I should see the "Save" button

# GOOD -- tests behavior
Then the calls today count shows "3"
Then the note is saved with text "Crisis report filed"
Then the call status changes to "in-progress"
```

**Include error paths:**

```gherkin
Scenario: Expired auth token is rejected
  Given I have an auth token from 10 minutes ago
  When I call GET /api/calls/active
  Then the response status is 401

Scenario: Non-admin cannot access audit log
  Given I am logged in as a volunteer
  When I call GET /api/audit
  Then the response status is 403
```

**Use Scenario Outline for parametrized tests:**

```gherkin
Scenario Outline: Message arrives via <channel>
  When a <channel> message arrives from "+15551234567" with body "Help"
  Then a conversation is created
  And the conversation channel is "<channel>"

  Examples:
    | channel   |
    | sms       |
    | whatsapp  |
    | signal    |
```

## Backend Step Definitions

Backend steps use the simulation framework + API helpers. No browser, no UI.

**Key imports:**
```typescript
import { simulateIncomingCall, simulateAnswerCall, ... } from '../../simulation-helpers'
import { apiGet, apiPost, createVolunteerViaApi, ... } from '../../api-helpers'
```

**Pattern:**
- `Given` steps set up server state (create volunteers, shifts, bans)
- `When` steps trigger actions (simulate calls, API requests)
- `Then` steps verify state via API (GET endpoints, check responses)

**Shared scenario state:**
Each step file maintains a `scenarioState` object for passing data between steps
(callId, conversationId, volunteer pubkeys, etc.).

## Platform Step Definitions

### Desktop (Playwright)

Step files: `tests/steps/{domain}.steps.ts`

```typescript
Then('the calls today count shows {string}', async ({ page }, expected) => {
  const count = page.getByTestId('calls-today-count')
  await expect(count).toHaveText(expected, { timeout: 10_000 })
})
```

**Key rules:**
- **ALWAYS use `data-testid`** -- never fragile selectors like `getByRole('button', { name: /close/i })`
- Use `Date.now()` suffix in resource names for parallel safety
- Wait for specific signals, not arbitrary timeouts
- PIN timing: 100ms between digits, 500ms after last digit for onComplete

**Common failures:**
- "strict mode violation" -- multiple elements match. Use `data-testid` or `.first()`
- "Element not found" after nav change -- update page objects in `tests/pages/`
- Parallel interference -- ensure unique resource names
- Crypto timeout -- increase to 45s for PBKDF2 flows

### iOS (XCUITest)

Test methods mirror Gherkin scenario titles:
```swift
func testDashboardReflectsActualCallCount() {
  given("3 calls were completed today") {
    simulateIncomingCall(callerNumber: uniqueNumber())
    // ... answer and end 3 calls
  }
  then("the calls today count shows 3") {
    let count = find("calls-today-count")
    XCTAssertEqual(count.label, "3")
  }
}
```

**Common failures:**
- "Failed to find element" -- SwiftUI `List` lazy rendering hides off-screen cells
- Navigation restructure -- update `BaseUITest` navigation helpers
- Keychain errors (-34018) -- expected in SPM test runner (no entitlement)
- `@Observable` + Mirror -- don't use Mirror on @Observable ViewModels

**Running:**
```bash
cd /Users/rhonda/projects/llamenos/apps/ios && \
xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | \
  tee /tmp/uitest-output.log | \
  grep --line-buffered -E '(Test Case|Executed|error:)'
```

### Android (Cucumber)

Step files: `apps/android/app/src/androidTest/java/.../steps/{domain}/`

```kotlin
@Then("the calls today count shows {string}")
fun callsCountShows(expected: String) {
  onNodeWithTag("calls-today-count")
    .assertTextEquals(expected)
}
```

**Common failures:**
- CryptoService hard-fail without native lib -- INTENTIONAL security invariant
- ComposeTimeoutException -- add `composeTestRule.waitForIdle()` before assertions
- R.string.* mismatch -- run `bun run i18n:validate:android`
- Build failures -- check `JAVA_HOME` (JDK 21), Gradle wrapper version
- Emulator broken on macOS 26 -- run E2E on Linux (192.168.50.95) or real device

### Crypto (Rust)

```bash
bun run crypto:test         # cargo test
bun run crypto:test:mobile  # cargo test --features mobile (FFI tests)
bun run crypto:clippy       # Linting
```

- FFI symbol missing -> use `--features mobile`
- Cross-platform interop failure -> check `packages/crypto/tests/test_vectors.json`

## When Tests Fail

### During Phase 1 (backend BDD)
- The API implementation is wrong -> fix the backend code
- The test scenario is wrong -> fix the scenario (update AC in epic too)

### During Phase 2 (client implementation)
- Step definition has wrong selector -> update the selector
- UI doesn't support the scenario -> implement the missing UI behavior
- Scenario is platform-incompatible -> add platform-specific tag

### After Merge (regression)
1. Identify which phase the failure belongs to (backend vs client)
2. Check if the scenario is still valid (does the AC still apply?)
3. If scenario valid -> fix implementation or step definition
4. If scenario obsolete -> update scenario AND the AC it maps to
5. NEVER delete a scenario without updating the corresponding AC

## General Recovery Workflow

1. **Run `bun run test:changed`** to see what's broken
2. **Read the error messages** -- categorize by root cause
3. **Check recent git changes**: `git log --oneline -10`
4. **Fix in dependency order**: codegen -> backend -> desktop -> iOS -> Android
5. **Re-run affected platform**: `bun run test:{platform}`
6. **Run full suite**: `bun run test:all` before committing

## Running Tests

```bash
# Backend BDD only (fast, no UI)
bun run test:backend:bdd

# Desktop BDD
PLAYWRIGHT_TEST=true bunx playwright test --project=bdd

# All platforms
bun run test:all

# Only affected platforms
bun run test:changed
```
