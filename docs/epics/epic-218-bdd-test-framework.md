# Epic 218: Cross-Platform BDD Test Framework

**Status: PENDING**
**Priority**: Critical — foundation for all mobile E2E tests
**Depends on**: None
**Blocks**: Epics 219-222

## Summary

Establish a shared BDD (Behavior-Driven Development) test specification layer using Gherkin `.feature` files that drive E2E test implementations on both Android (Compose UI Test) and iOS (XCUITest). Feature files live in `packages/test-specs/` as the single source of truth for acceptance criteria across all mobile platforms.

## Architecture

```
packages/
  test-specs/                          # Shared BDD specs (platform-agnostic)
    features/
      auth/
        login.feature
        onboarding.feature
        pin-setup.feature
        pin-unlock.feature
        key-import.feature
      dashboard/
        dashboard-display.feature
        shift-status.feature
      notes/
        note-list.feature
        note-create.feature
        note-detail.feature
      conversations/
        conversation-list.feature
        conversation-filters.feature
      shifts/
        shift-list.feature
        clock-in-out.feature
      navigation/
        bottom-navigation.feature
      admin/
        admin-navigation.feature
        admin-tabs.feature
        access-control.feature
      settings/
        settings-display.feature
        device-link.feature
        lock-logout.feature
      crypto/
        keypair-generation.feature
        pin-encryption.feature
        auth-tokens.feature
        crypto-interop.feature         # References test-vectors.json
    test-vectors/                       # Symlink or copy of packages/crypto/tests/fixtures/
      test-vectors.json
    README.md                           # How to add features, step definition conventions

apps/
  android/
    app/src/androidTest/
      java/org/llamenos/hotline/
        e2e/                              # Organized by feature area
          auth/                           # Epic 219: LoginScreenTest, OnboardingFlowTest, etc.
          dashboard/                      # Epic 220: DashboardDisplayTest, etc.
          notes/                          # Epic 220: NoteListTest, NoteCreateTest, etc.
          conversations/                  # Epic 220: ConversationListTest, etc.
          shifts/                         # Epic 220: ShiftListTest, ClockInOutTest
          navigation/                     # Epic 220: BottomNavigationTest
          admin/                          # Epic 221: AdminNavigationTest, AdminTabsTest
          settings/                       # Epic 221: SettingsDisplayTest, LockLogoutTest, etc.
          crypto/                         # Epic 222: KeypairGenerationTest, etc.
        helpers/
          TestNavigationHelper.kt       # Shared auth/nav helper
          ComposeTestExtensions.kt      # Utility extensions for composeRule

  ios/
    Tests/E2E/
      Steps/                            # iOS step definitions (future)
        AuthSteps.swift
        DashboardSteps.swift
        ...
```

## Approach Decision: Cucumber-Android vs Gherkin-as-Spec

### Option A: Cucumber-Android (executable Gherkin)

The `cucumber-android` library runs `.feature` files directly as Android instrumented tests. Step definitions in Kotlin map Gherkin steps to Compose UI actions.

**Pros**: Single source of truth, Gherkin is executable, CI runs feature files directly
**Cons**: Adds a dependency, Cucumber-Android maintenance can lag, step definition boilerplate

### Option B: Gherkin-as-Specification (recommended)

Feature files serve as human-readable specifications. Android and iOS tests implement the scenarios using their native test frameworks (Compose UI Test, XCUITest) with test method names that mirror the Gherkin scenario titles. A CI validation step checks that every Gherkin scenario has a corresponding test method on each platform.

**Pros**: No extra dependency, native test framework performance, easier debugging
**Cons**: Spec-to-test mapping is convention-based (mitigated by CI validation)

### Decision: **Option B** — Gherkin-as-Specification

Reasoning:
1. Cucumber-Android doesn't integrate well with Hilt DI (our tests need `@HiltAndroidTest`)
2. Compose UI Test has excellent APIs that don't need Cucumber's abstraction layer
3. Feature files are still the source of truth — they just drive test writing, not test execution
4. CI validates completeness: a script parses `.feature` files and checks for matching `@Test` methods

## Gherkin Convention

### Tags

```gherkin
@android @ios                          # Platform targeting
@smoke                                  # Smoke test subset (run on every PR)
@regression                             # Full regression suite
@requires-camera                        # Requires physical device camera
@requires-network                       # Requires API connectivity
@offline                                # Works without network
@crypto                                 # Crypto verification tests
```

### Naming Convention

- Feature file name: `kebab-case.feature`
- Scenario titles: Human-readable sentences
- Android test method: `fun scenarioTitleInCamelCase()`
- iOS test method: `func testScenarioTitleInCamelCase()`

### Gherkin Tables & Scenario Outlines

Use `Scenario Outline` + `Examples` tables for parameterized tests. This is more efficient than writing separate scenarios for each data point:

```gherkin
Scenario Outline: PIN validation rejects invalid lengths
  Given I have a loaded keypair
  When I attempt to encrypt with PIN "<pin>"
  Then encryption should fail with "<error>"

  Examples:
    | pin     | error          |
    | 123     | PIN too short  |
    | 1234567 | PIN too long   |
    |         | PIN required   |
```

Use `Data Tables` for structured verification (e.g., checking multiple labels/values):

```gherkin
Scenario: Domain separation labels match protocol
  Then the following labels should be defined:
    | label                      | value                      |
    | LABEL_NOTE_KEY             | llamenos:note-key          |
    | LABEL_MESSAGE              | llamenos:message           |
    | LABEL_HUB_KEY_WRAP         | llamenos:hub-key-wrap      |
```

Use `Scenario Outline` for access control and role-based testing:

```gherkin
Scenario Outline: Role-based feature visibility
  Given I am authenticated as "<role>"
  When I navigate to the settings screen
  Then the admin card should be "<visibility>"

  Examples:
    | role      | visibility |
    | admin     | visible    |
    | volunteer | hidden     |
```

### Example Feature File

```gherkin
@android @ios @smoke
Feature: Login Screen
  As a new user
  I want to see the login screen
  So that I can create or import my identity

  Background:
    Given the app is freshly installed
    And no identity exists on the device

  Scenario: Login screen displays all required elements
    When the app launches
    Then I should see the app title
    And I should see the hub URL input field
    And I should see the nsec import input field
    And I should see the "Create New Identity" button
    And I should see the "Import Key" button

  Scenario: Hub URL input accepts text
    When I enter "https://hub.example.com" in the hub URL field
    Then the hub URL field should contain "https://hub.example.com"

  Scenario: Nsec input masks the text
    When I enter "nsec1abc123" in the nsec field
    Then the nsec field should mask the input
```

### Example Android Step Definition

```kotlin
// No Cucumber runner — step definitions are documentation-mapped test helpers
// Tests reference the Gherkin scenario title in their method name

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class LoginScreenTest {
    @get:Rule(order = 0) val hiltRule = HiltAndroidRule(this)
    @get:Rule(order = 1) val composeRule = createAndroidComposeRule<MainActivity>()

    @Before fun setup() { hiltRule.inject() }

    // Feature: Login Screen
    // Scenario: Login screen displays all required elements
    @Test
    fun loginScreenDisplaysAllRequiredElements() {
        composeRule.onNodeWithTag("app-title").assertIsDisplayed()
        composeRule.onNodeWithTag("hub-url-input").assertIsDisplayed()
        composeRule.onNodeWithTag("nsec-input").assertIsDisplayed()
        composeRule.onNodeWithTag("create-identity").assertIsDisplayed()
        composeRule.onNodeWithTag("import-key").assertIsDisplayed()
    }
}
```

## CI Validation Script

`packages/test-specs/tools/validate-coverage.ts` — parses all `.feature` files, extracts scenario titles, and checks that each platform has a corresponding test method.

```bash
bun run test-specs:validate   # Validates Android + iOS test coverage
```

Output:
```
Feature: Login Screen (auth/login.feature)
  ✓ Login screen displays all required elements
    Android: LoginScreenTest.loginScreenDisplaysAllRequiredElements
    iOS: LoginScreenTests.testLoginScreenDisplaysAllRequiredElements
  ✗ Hub URL input accepts text
    Android: MISSING
    iOS: MISSING
```

## Dependencies

### Android (already in place)
- `compose-ui-test-junit4` (1.7.6) — Compose UI testing
- `hilt-android` (testing) — DI in tests
- `test-runner`, `test-rules` — AndroidX test infrastructure
- `espresso` (3.6.1) — Android test support

### iOS (future epic)
- XCUITest (built into Xcode) — no additional dependencies

### Validation Script
- `bun` — already in workspace
- Parse `.feature` files with regex (no Gherkin parser library needed)

## Shared Test Helper: `TestNavigationHelper.kt`

Extract the `navigateToMainScreen()` helper that's duplicated across all 5 existing test files:

```kotlin
object TestNavigationHelper {
    /**
     * Complete the auth flow: create identity → confirm backup → PIN 1234 → confirm PIN 1234.
     * After this, the app is on the dashboard (main screen).
     */
    fun navigateToMainScreen(composeRule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>) {
        composeRule.onNodeWithTag("create-identity").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("confirm-backup").performClick()
        composeRule.waitForIdle()
        // Enter PIN: 1234
        for (digit in listOf("1", "2", "3", "4")) {
            composeRule.onNodeWithTag("pin-$digit").performClick()
        }
        composeRule.waitForIdle()
        // Confirm PIN: 1234
        for (digit in listOf("1", "2", "3", "4")) {
            composeRule.onNodeWithTag("pin-$digit").performClick()
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    /**
     * Navigate to a specific bottom nav tab from the main screen.
     */
    fun navigateToTab(
        composeRule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
        tabTag: String,
    ) {
        composeRule.onNodeWithTag(tabTag).performClick()
        composeRule.waitForIdle()
    }
}
```

## Future: Playwright BDD Refactoring

The 361 existing Playwright desktop E2E tests (Epic 216) will be refactored to BDD in a future epic. Desktop BDD specs will have different criteria than mobile, focusing on:

- **Access control**: Role-based feature visibility, permission guards, admin-only routes
- **Provider testing**: Telephony provider configuration/testing across Twilio, SignalWire, Vonage, Plivo, Asterisk
- **E2EE flows**: Note encryption/decryption roundtrips, multi-admin envelopes, hub key rotation
- **Multi-hub**: Hub switching, per-hub isolation, hub-scoped roles
- **Messaging channels**: SMS, WhatsApp, Signal adapter testing across providers
- **Conversation threading**: Multi-message threads, filters, E2EE message roundtrips
- **Setup wizard**: First-time admin configuration flow, provider onboarding

These specs would live alongside mobile specs in `packages/test-specs/features/` with `@desktop` tags, and the CI validation script would check Playwright test coverage alongside mobile.

## Deliverables

1. `packages/test-specs/` directory with initial `.feature` files (auth features only — others in subsequent epics)
2. `packages/test-specs/README.md` with conventions
3. `packages/test-specs/tools/validate-coverage.ts` — CI validation script
4. `apps/android/app/src/androidTest/.../helpers/TestNavigationHelper.kt` — extracted helper
5. `apps/android/app/src/androidTest/.../helpers/ComposeTestExtensions.kt` — utility extensions
6. Refactor existing 5 test files to use `TestNavigationHelper`
7. `package.json` script: `"test-specs:validate": "bun packages/test-specs/tools/validate-coverage.ts"`

## Verification

```bash
# Feature file parsing
bun run test-specs:validate

# Existing Android tests still pass after refactor
cd apps/android && ./gradlew connectedDebugAndroidTest

# No lint regressions
cd apps/android && ./gradlew lintDebug
```
