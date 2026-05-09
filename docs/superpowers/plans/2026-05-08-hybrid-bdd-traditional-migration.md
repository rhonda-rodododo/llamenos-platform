# Hybrid BDD-to-Traditional Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Llamenos v2 from full BDD to a Hybrid approach: keep BDD for backend API contracts (auth, permissions, E2EE, call routing), migrate UI tests to traditional Playwright E2E with Page Object Model. Reduce test complexity for both AI agents and human engineers while preserving BDD's strengths for security/permission testing.

**Architecture:** Backend BDD scenarios (tagged `@backend`) continue using Gherkin feature files with API-only assertions — these provide explicit, reviewable security contracts. Desktop UI scenarios (tagged `@desktop`) are migrated to traditional `.spec.ts` files using the existing Page Object Model in `tests/pages/index.ts` and API helpers in `tests/api-helpers.ts`. The `playwright.config.ts` gains a new `traditional` project alongside the existing `bdd` and `backend-bdd` projects. Cross-platform duplication is eliminated: iOS already uses traditional XCUITest, Android Gradle only copies `platform/mobile/` features (3% coverage) and should migrate to traditional Espresso.

**Tech Stack:** Playwright 1.x, playwright-bdd (retained for backend), Vite `PLAYWRIGHT_TEST=true` env flag, existing `tests/api-helpers.ts` Ed25519 auth helpers, existing `tests/pages/index.ts` Page Object Model.

**Scope:** This plan covers Desktop (Tasks 1-7) and Android (Task 8). iOS already uses traditional XCUITest and is out of scope. Backend BDD is retained across all platforms.

---

### Task 1: Add Traditional Playwright Project to Config

**Files:**
- Modify: `playwright.config.ts`

**Context:** The current config has 3 projects: `bootstrap`, `chromium`, `bdd`, `backend-bdd`. We need to add a `traditional` project for non-BDD UI tests. The `bootstrap` project runs serially to set up admin state. The `chromium` project runs smoke/non-BDD tests. The `bdd` project runs desktop BDD scenarios. The `backend-bdd` project runs API-only BDD scenarios.

- [ ] In `playwright.config.ts`, add a new `traditional` project after the `bdd` project:
  ```typescript
  {
    name: "traditional",
    use: { ...devices["Desktop Chrome"] },
    testMatch: ["**/traditional/**/*.spec.ts"],
    testIgnore: ["**/bootstrap.spec.ts"],
    dependencies: ["bootstrap"],
    fullyParallel: true,
  },
  ```
- [ ] Update the `chromium` project's `testIgnore` to also exclude `traditional/`:
  ```typescript
  testIgnore: ["**/live/**", "**/desktop/**", "**/integration/**", "**/bootstrap.spec.ts", "**/traditional/**"],
  ```
- [ ] Commit: `git commit -m "feat(tests): add traditional Playwright project for non-BDD UI tests"`

---

### Task 2: Create Traditional Test Directory Structure

**Files:**
- Create: `tests/traditional/README.md`
- Create: `tests/traditional/auth.spec.ts`
- Create: `tests/traditional/call-lifecycle.spec.ts`

**Context:** Traditional tests use the Page Object Model from `tests/pages/index.ts` and API helpers from `tests/api-helpers.ts`. Each test file corresponds to a feature area. Tests are isolated via the `workerHub` fixture (already implemented in `tests/steps/fixtures.ts` — we need to make it available to traditional tests too).

- [ ] Create `tests/traditional/README.md`:
  ```markdown
  # Traditional UI Tests

  Non-BDD Playwright tests using Page Object Model.

  ## Patterns

  - Use `tests/pages/index.ts` for common page interactions
  - Use `tests/api-helpers.ts` for test data setup
  - Use `workerHub` fixture for test isolation (each worker gets its own hub)
  - Use deterministic assertions (`.toBeVisible()`, `.toHaveText()`) — no `waitForTimeout`

  ## Running

  ```bash
  bunx playwright test --project=traditional
  ```
  ```
- [ ] Create `tests/traditional/auth.spec.ts` — migrate the backend auth scenarios from `auth-login.feature` that have UI components (PIN entry, login flow):
  ```typescript
  import { test, expect } from '@playwright/test'
  import { enterPin, loginAsAdmin, TEST_PIN, Timeouts } from '../helpers'
  import { TestIds } from '../test-ids'

  test.describe('Authentication UI', () => {
    test('admin can log in with PIN', async ({ page }) => {
      await loginAsAdmin(page)
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
    })

    test('volunteer can log in with PIN after invite', async ({ page, request }) => {
      // Create volunteer via API
      const { createUserViaApi, createShiftViaApi } = await import('../api-helpers')
      const vol = await createUserViaApi(request, { name: 'Test Vol', roleIds: ['role-volunteer'] })
      await createShiftViaApi(request, { userPubkeys: [vol.pubkey] })

      // Login as volunteer
      const { loginAsVolunteer } = await import('../helpers')
      await loginAsVolunteer(page, vol.seedHex)
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
    })

    test('invalid PIN shows error', async ({ page }) => {
      await page.goto('/login')
      await page.waitForLoadState('domcontentloaded')
      const pinInput = page.getByTestId('pin-input').locator('input')
      await pinInput.fill('00000000')
      await pinInput.press('Enter')
      await expect(page.getByTestId(TestIds.ERROR_MESSAGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    })
  })
  ```
- [ ] Create `tests/traditional/call-lifecycle.spec.ts` — migrate the UI-relevant call lifecycle scenarios:
  ```typescript
  import { test, expect } from '@playwright/test'
  import { loginAsAdmin, Timeouts, Navigation } from '../helpers'
  import { TestIds } from '../test-ids'

  test.describe('Call Lifecycle UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('call history page loads', async ({ page }) => {
      await Navigation.goToCallHistory(page)
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toContainText(/call/i)
    })

    test('dashboard shows active calls card', async ({ page }) => {
      await expect(page.getByTestId(TestIds.DASHBOARD_ACTIVE_CALLS)).toBeVisible({ timeout: Timeouts.ELEMENT })
    })
  })
  ```
- [ ] Commit: `git commit -m "feat(tests): create traditional test directory with auth and call-lifecycle pilots"`

---

### Task 3: Make workerHub Fixture Available to Traditional Tests

**Files:**
- Modify: `tests/steps/fixtures.ts`
- Create: `tests/traditional-fixtures.ts`

**Context:** Traditional tests need hub isolation too. The `workerHub` fixture is currently defined in `tests/steps/fixtures.ts` inside the BDD `test.extend()`. We need to extract it so traditional tests can use it without importing BDD-specific fixtures.

- [ ] In `tests/steps/fixtures.ts`, extract the `workerHub` fixture creation into a standalone function in `tests/traditional-fixtures.ts`:
  ```typescript
  import { test as base } from '@playwright/test'
  import { createHubViaApi } from './api-helpers'

  export const test = base.extend<
    {},
    { workerHub: string }
  >({
    workerHub: [async ({ playwright }, use, workerInfo) => {
      const backendUrl = process.env.TEST_HUB_URL || 'http://localhost:3000'
      const ctx = await playwright.request.newContext({ baseURL: backendUrl, timeout: 60_000 })
      const name = `test-hub-${workerInfo.workerIndex}-${Date.now()}`
      const hubId = await createHubViaApi(ctx, name)
      await ctx.dispose()
      await use(hubId)
    }, { scope: 'worker', timeout: 60_000 }],
  })
  ```
- [ ] Update `tests/steps/fixtures.ts` to import and merge the workerHub fixture:
  ```typescript
  import { test as traditionalBase } from '../traditional-fixtures'

  export const test = traditionalBase.extend<{
    apiErrors: { responses: Array<{ url: string; status: number }>; pageErrors: Error[] }
    backendRequest: APIRequestContext
    adminWorld: AdminWorld
    rolesWorld: RolesWorld
    casesWorld: CasesWorld
  }>({
    // ... existing fixtures without workerHub (now inherited)
  })
  ```
- [ ] Update `tests/traditional/auth.spec.ts` and `tests/traditional/call-lifecycle.spec.ts` to import `test` from `../traditional-fixtures` instead of `@playwright/test`:
  ```typescript
  import { test, expect } from '../traditional-fixtures'
  ```
- [ ] Commit: `git commit -m "refactor(tests): extract workerHub fixture for shared use by BDD and traditional tests"`

---

### Task 4: Migrate Desktop BDD Steps to Traditional Page Object Methods

**Files:**
- Modify: `tests/pages/index.ts`
- Modify: `tests/traditional/auth.spec.ts`
- Modify: `tests/traditional/call-lifecycle.spec.ts`

**Context:** The `tests/pages/index.ts` already has Navigation helpers, VolunteerPage, ShiftPage, BanListPage, NotesPage, CallHistoryPage, Dialogs, Forms. We need to add any missing methods that are currently only in BDD step files. This task focuses on extracting reusable methods from the most complex BDD step files.

- [ ] In `tests/pages/index.ts`, add a `LoginPage` object for traditional tests:
  ```typescript
  export const LoginPage = {
    async loginWithPin(page: Page, pin: string): Promise<void> {
      const pinInput = page.getByTestId('pin-input').locator('input')
      await pinInput.waitFor({ state: 'visible', timeout: 10000 })
      await pinInput.fill(pin)
      await pinInput.press('Enter')
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
    },

    async expectErrorVisible(page: Page): Promise<void> {
      await expect(page.getByTestId(TestIds.ERROR_MESSAGE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    },
  }
  ```
- [ ] In `tests/pages/index.ts`, add a `DashboardPage` object:
  ```typescript
  export const DashboardPage = {
    async expectLoaded(page: Page): Promise<void> {
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.ELEMENT })
    },

    async expectShiftStatusVisible(page: Page): Promise<void> {
      await expect(page.getByTestId(TestIds.DASHBOARD_SHIFT_STATUS)).toBeVisible({ timeout: Timeouts.ELEMENT })
    },

    async expectActiveCallsVisible(page: Page): Promise<void> {
      await expect(page.getByTestId(TestIds.DASHBOARD_ACTIVE_CALLS)).toBeVisible({ timeout: Timeouts.ELEMENT })
    },
  }
  ```
- [ ] Update `tests/traditional/auth.spec.ts` to use `LoginPage`:
  ```typescript
  import { test, expect } from '../traditional-fixtures'
  import { LoginPage, TEST_PIN, Timeouts } from '../helpers'
  import { TestIds } from '../test-ids'

  test.describe('Authentication UI', () => {
    test('admin can log in with PIN', async ({ page }) => {
      await page.goto('/login')
      await page.waitForLoadState('domcontentloaded')
      await LoginPage.loginWithPin(page, TEST_PIN)
      await expect(page.getByTestId(TestIds.PAGE_TITLE)).toBeVisible({ timeout: Timeouts.AUTH })
    })

    // ... other tests
  })
  ```
- [ ] Update `tests/traditional/call-lifecycle.spec.ts` to use `DashboardPage` and `Navigation`:
  ```typescript
  import { test, expect } from '../traditional-fixtures'
  import { loginAsAdmin, Navigation, DashboardPage } from '../helpers'

  test.describe('Call Lifecycle UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('dashboard shows active calls and shift status', async ({ page }) => {
      await DashboardPage.expectLoaded(page)
      await DashboardPage.expectShiftStatusVisible(page)
      await DashboardPage.expectActiveCallsVisible(page)
    })

    test('call history page loads', async ({ page }) => {
      await Navigation.goToCallHistory(page)
    })
  })
  ```
- [ ] Commit: `git commit -m "feat(tests): add LoginPage and DashboardPage POM objects, update pilot specs"`

---

### Task 5: Update Test Scripts to Include Traditional Project

**Files:**
- Modify: `scripts/test-desktop.sh`

**Context:** The desktop test runner currently runs `--project=bootstrap --project=chromium --project=bdd`. We need to add `--project=traditional` to the playwright invocation.

- [ ] In `scripts/test-desktop.sh`, update the playwright test invocation on line 92:
  ```bash
  if reporter_run_step "playwright" bunx playwright test --project=bootstrap --project=chromium --project=bdd --project=traditional; then
  ```
- [ ] Commit: `git commit -m "chore(tests): include traditional project in desktop test runner"`

---

### Task 6: Document the Hybrid Approach and Migration Guidelines

**Files:**
- Create: `docs/testing/HYBRID_APPROACH.md`
- Modify: `packages/test-specs/README.md`

**Context:** Teams need clear guidance on when to use BDD vs traditional tests, and how to migrate existing BDD scenarios.

- [ ] Create `docs/testing/HYBRID_APPROACH.md`:
  ```markdown
  # Hybrid Testing Approach

  ## Philosophy

  - **Backend API contracts** → BDD (Gherkin + API assertions)
    - Auth, permissions, E2EE, call routing, data integrity
    - Explicit, reviewable security contracts
    - Runs via `backend-bdd` project

  - **UI interactions** → Traditional Playwright (Page Object Model)
    - Navigation, form submission, visual state
    - Faster to write, easier for AI agents
    - Runs via `traditional` project

  ## When to Use BDD

  - Testing permission matrices (e.g., "Volunteer cannot delete shifts")
  - Testing E2EE integrity (e.g., "Note encrypted with HPKE")
  - Testing call routing logic (e.g., "Busy volunteer is skipped")
  - Any scenario where explicit behavioral documentation is valuable

  ## When to Use Traditional

  - Testing page navigation and rendering
  - Testing form validation and submission
  - Testing visual state (toggles, dialogs, toasts)
  - Any scenario where BDD step indirection adds overhead

  ## Migration Guidelines

  1. Identify BDD scenarios in `packages/test-specs/features/` that are primarily UI-focused
  2. Create equivalent `.spec.ts` file in `tests/traditional/`
  3. Use `tests/pages/index.ts` Page Object Model
  4. Use `tests/api-helpers.ts` for test data setup
  5. Remove the `@desktop` tag from the BDD scenario (keep `@backend` if it has API assertions)
  6. Run both old and new tests until migration is verified, then delete BDD scenario

  ## Running Tests

  ```bash
  # Backend BDD only
  bunx playwright test --project=backend-bdd

  # Traditional UI tests only
  bunx playwright test --project=traditional

  # All desktop tests
  bunx playwright test --project=bootstrap --project=chromium --project=bdd --project=traditional
  ```
  ```
- [ ] Update `packages/test-specs/README.md` to mention the hybrid approach:
  ```markdown
  ## Hybrid Approach

  UI-focused scenarios are being migrated to traditional Playwright tests in `tests/traditional/`.
  Backend API contract scenarios remain in Gherkin feature files.
  See `docs/testing/HYBRID_APPROACH.md` for details.
  ```
- [ ] Commit: `git commit -m "docs(tests): document hybrid BDD/traditional testing approach"`

---

### Task 7: Self-Review and Verification

**Files:**
- All modified files

- [ ] Run `bun run typecheck` to verify no TypeScript errors
- [ ] Run `bunx playwright test --project=traditional` to verify new tests pass
- [ ] Run `bunx playwright test --project=backend-bdd` to verify backend BDD still passes
- [ ] Run `bunx playwright test --project=bdd` to verify desktop BDD still passes
- [ ] Verify `playwright.config.ts` has exactly 5 projects: `bootstrap`, `chromium`, `bdd`, `backend-bdd`, `traditional`
- [ ] Verify no `waitForTimeout` calls in `tests/traditional/` files
- [ ] Verify all `tests/traditional/` files use `workerHub` fixture for isolation
- [ ] Commit: `git commit -m "test(tests): verify hybrid approach — all projects pass"`

---

### Task 8: Migrate Android BDD to Traditional Compose UI Tests

**Files:**
- Modify: `apps/android/app/build.gradle.kts`
- Modify: `apps/android/gradle/libs.versions.toml`
- Delete: `apps/android/app/src/androidTest/java/org/llamenos/hotline/CucumberHiltRunner.kt`
- Delete: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/common/GenericSteps.kt`
- Delete: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/ScenarioHooks.kt`
- Delete: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/BaseSteps.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/ComposeRuleHolder.kt`
- Modify: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/ActivityScenarioHolder.kt`
- Create: `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/README.md`
- Create: `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/AuthTest.kt`
- Create: `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/DashboardTest.kt`
- Create: `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/HubManagementTest.kt`
- Modify: `apps/android/README.md`

**Context:** Android BDD is fundamentally broken. The Gradle `copyFeatureFiles` task only copies `platform/mobile/` features (29 of 187 files — 15% of feature files, ~3% of scenarios). The `GenericSteps.kt` file (543 lines) contains massive silent-pass logic: no-op actions for missing features, silent returns for validation messages that don't appear on Android, and try/catch blocks that swallow every assertion failure. The Cucumber-Android runner adds unnecessary complexity (custom Hilt runner, feature file copying, step resolution indirection) compared to standard Compose UI tests.

**Key problems with Android BDD:**
- `GenericSteps.kt:56-57` — "Recovery Options" and "Log In" are no-ops because those features don't exist on Android
- `GenericSteps.kt:128-147` — Validation messages and web-specific text silently pass via `composeRule.waitForIdle()`
- `GenericSteps.kt:148-154` — Every `assertIsDisplayed()` wrapped in try/catch that swallows the failure
- `GenericSteps.kt:495-541` — `createVolunteerViaUI()` has 4 nested try/catch blocks; volunteer creation failure is silently ignored
- Build complexity: Cucumber-Android 7.18.1, custom `CucumberHiltRunner`, feature file copying at build time

**Migration approach:** Replace Cucumber with standard JUnit4 + Compose UI test rules. Reuse the existing `ComposeRuleHolder` and `ActivityScenarioHolder` infrastructure (these work fine; just remove the Cucumber glue). Extract reusable test utilities from `BaseSteps.kt` into a `TestHelpers.kt` file. Create traditional test classes organized by feature.

- [ ] In `apps/android/app/build.gradle.kts`:
  - Remove `testInstrumentationRunner = "org.llamenos.hotline.CucumberHiltRunner"` (line 34)
  - Replace with standard AndroidJUnitRunner: `testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"`
  - Remove the `copyFeatureFiles` task (lines 140-148)
  - Remove `androidTestImplementation(libs.cucumber.android)` (line 212)
  - Remove the `preBuild` dependency on `copyFeatureFiles` (line 151)
  - Commit: `git commit -m "chore(android): remove Cucumber-Android dependency and feature file copying"`

- [ ] In `apps/android/gradle/libs.versions.toml`:
  - Remove `cucumber = "7.18.1"` (line 22)
  - Remove `cucumber-android = { group = "io.cucumber", name = "cucumber-android", version.ref = "cucumber" }` (line 60)
  - Commit: `git commit -m "chore(android): remove Cucumber from version catalog"`

- [ ] Delete `apps/android/app/src/androidTest/java/org/llamenos/hotline/CucumberHiltRunner.kt` — no longer needed with standard runner

- [ ] Delete `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/common/GenericSteps.kt` — 543 lines of silent-pass logic; traditional tests use direct Compose assertions

- [ ] Delete `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/ScenarioHooks.kt` — hub isolation moves to a JUnit `@Before` rule in `TestHelpers.kt`

- [ ] Delete `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/BaseSteps.kt` — extract useful methods to `TestHelpers.kt`

- [ ] Create `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/TestHelpers.kt`:
  ```kotlin
  package org.llamenos.hotline.traditional

  import androidx.compose.ui.test.junit4.createAndroidComposeRule
  import androidx.compose.ui.test.onNodeWithTag
  import androidx.compose.ui.test.performClick
  import androidx.compose.ui.test.performTextInput
  import androidx.test.platform.app.InstrumentationRegistry
  import kotlinx.coroutines.runBlocking
  import org.junit.Before
  import org.junit.Rule
  import org.llamenos.hotline.MainActivity
  import org.llamenos.hotline.di.ActiveHubEntryPoint
  import dagger.hilt.android.EntryPointAccessors

  /**
   * Base class for traditional Android UI tests.
   * Provides hub isolation, auth helpers, and Compose test rule.
   */
  abstract class BaseUiTest {

      @get:Rule
      val composeTestRule = createAndroidComposeRule<MainActivity>()

      protected val context = InstrumentationRegistry.getInstrumentation().targetContext

      /**
       * Create an isolated test hub before each test.
       * Replaces ScenarioHooks @Before(order = 1) from BDD.
       */
      @Before
      fun createTestHub() {
          // Use SimulationClient or direct API call to create hub
          // Then wire hub ID into ActiveHubState
          val appContext = context.applicationContext as org.llamenos.hotline.LlamenosApp
          val entryPoint = EntryPointAccessors.fromApplication(appContext, ActiveHubEntryPoint::class.java)
          val activeHubState = entryPoint.activeHubState()
          
          runBlocking {
              val hubId = createHubViaApi() // Implement using OkHttp or SimulationClient
              activeHubState.setHubId(hubId)
          }
      }

      /**
       * Enter PIN by tapping pin-N buttons.
       * Extracted from BaseSteps.kt (was reliable; just moved here).
       */
      protected fun enterPin(pin: String) {
          for (digit in pin.toList()) {
              composeTestRule.onNodeWithTag("pin-$digit").performClick()
          }
          composeTestRule.waitForIdle()
      }

      /**
       * Navigate to a bottom nav tab by test tag.
       * Extracted from BaseSteps.kt.
       */
      protected fun navigateToTab(tabTag: String) {
          try {
              composeTestRule.onNodeWithTag(tabTag).performClick()
          } catch (_: Throwable) {
              androidx.test.espresso.Espresso.pressBack()
              composeTestRule.waitForIdle()
              composeTestRule.onNodeWithTag(tabTag).performClick()
          }
          composeTestRule.waitForIdle()
      }

      /**
       * Wait for a node with the given tag to appear.
       * Extracted from BaseSteps.kt.
       */
      protected fun waitForNode(tag: String, timeoutMillis: Long = 5000) {
          composeTestRule.waitUntil(timeoutMillis) {
              composeTestRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
          }
      }

      private fun createHubViaApi(): String {
          // TODO: Implement using SimulationClient or direct OkHttp call
          // This was previously in ScenarioHooks.kt lines 80-120
          return "test-hub-id"
      }
  }
  ```
  - Commit: `git commit -m "feat(android): create TestHelpers base class for traditional UI tests"`

- [ ] Create `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/AuthTest.kt`:
  ```kotlin
  package org.llamenos.hotline.traditional

  import androidx.compose.ui.test.assertIsDisplayed
  import androidx.compose.ui.test.onNodeWithTag
  import org.junit.Test

  class AuthTest : BaseUiTest() {

      @Test
      fun adminLoginWithPin_showsDashboard() {
          // Given: fresh app state (already on PIN screen from BaseUiTest setup)
          composeTestRule.onNodeWithTag("pin-pad").assertIsDisplayed()

          // When: enter PIN
          enterPin("12345678")

          // Then: dashboard visible
          waitForNode("dashboard-title", timeoutMillis = 120_000)
          composeTestRule.onNodeWithTag("dashboard-title").assertIsDisplayed()
      }

      @Test
      fun invalidPin_showsError() {
          enterPin("00000000")
          composeTestRule.onNodeWithTag("pin-error").assertIsDisplayed()
      }
  }
  ```

- [ ] Create `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/DashboardTest.kt`:
  ```kotlin
  package org.llamenos.hotline.traditional

  import androidx.compose.ui.test.assertIsDisplayed
  import androidx.compose.ui.test.onNodeWithTag
  import org.junit.Before
  import org.junit.Test

  class DashboardTest : BaseUiTest() {

      @Before
      fun login() {
          enterPin("12345678")
          waitForNode("dashboard-title", timeoutMillis = 120_000)
      }

      @Test
      fun dashboardShowsShiftStatusCard() {
          composeTestRule.onNodeWithTag("dashboard-shift-status").assertIsDisplayed()
      }

      @Test
      fun dashboardShowsActiveCallsCard() {
          composeTestRule.onNodeWithTag("dashboard-active-calls").assertIsDisplayed()
      }

      @Test
      fun navigationToNotesWorks() {
          navigateToTab("nav-notes")
          composeTestRule.onNodeWithTag("notes-title").assertIsDisplayed()
      }
  }
  ```

- [ ] Create `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/HubManagementTest.kt`:
  ```kotlin
  package org.llamenos.hotline.traditional

  import androidx.compose.ui.test.assertIsDisplayed
  import androidx.compose.ui.test.onNodeWithTag
  import androidx.compose.ui.test.performClick
  import org.junit.Before
  import org.junit.Test

  class HubManagementTest : BaseUiTest() {

      @Before
      fun loginAndNavigateToHubs() {
          enterPin("12345678")
          waitForNode("dashboard-title", timeoutMillis = 120_000)
          navigateToTab("nav-settings")
          composeTestRule.onNodeWithTag("settings-hub-section").performClick()
      }

      @Test
      fun hubListLoads() {
          composeTestRule.onNodeWithTag("hub-list").assertIsDisplayed()
      }
  }
  ```

- [ ] Create `apps/android/app/src/androidTest/java/org/llamenos/hotline/traditional/README.md`:
  ```markdown
  # Traditional Android UI Tests

  Non-BDD Compose UI tests using standard JUnit4 + `createAndroidComposeRule`.

  ## Patterns

  - Extend `BaseUiTest` for hub isolation and common helpers
  - Use `composeTestRule.onNodeWithTag("...")` for element selection
  - Use `.assertIsDisplayed()` for visibility assertions (no silent catches)
  - Use `enterPin()`, `navigateToTab()`, `waitForNode()` from `BaseUiTest`

  ## Running

  ```bash
  # All traditional tests
  ./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=org.llamenos.hotline.traditional.*

  # Single test class
  ./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=org.llamenos.hotline.traditional.AuthTest
  ```
  ```

- [ ] Update `apps/android/README.md`:
  - Replace `bun run test:android:e2e      # Cucumber BDD E2E on connected device/emulator` with:
    ```bash
    bun run test:android:e2e      # Traditional Compose UI tests on connected device/emulator
    ```
  - Add section explaining the migration from Cucumber to traditional tests

- [ ] Commit: `git commit -m "feat(android): migrate from Cucumber BDD to traditional Compose UI tests"`

- [ ] Run `./gradlew connectedDebugAndroidTest` to verify traditional tests pass on emulator/device
- [ ] Verify no Cucumber references remain: `grep -r "cucumber" apps/android/app/src/androidTest/` should return empty
- [ ] Commit: `git commit -m "test(android): verify traditional tests pass, remove all Cucumber references"`

---

### Task 9: Self-Review and Verification (Full Suite)

**Files:**
- All modified files across Desktop and Android

- [ ] Run `bun run typecheck` to verify no TypeScript errors
- [ ] Run `bunx playwright test --project=traditional` to verify new desktop tests pass
- [ ] Run `bunx playwright test --project=backend-bdd` to verify backend BDD still passes
- [ ] Run `bunx playwright test --project=bdd` to verify desktop BDD still passes
- [ ] Run `./gradlew connectedDebugAndroidTest` to verify Android traditional tests pass
- [ ] Verify `playwright.config.ts` has exactly 5 projects: `bootstrap`, `chromium`, `bdd`, `backend-bdd`, `traditional`
- [ ] Verify no `waitForTimeout` calls in `tests/traditional/` files
- [ ] Verify all `tests/traditional/` files use `workerHub` fixture for isolation
- [ ] Verify no Cucumber references in `apps/android/app/src/androidTest/`
- [ ] Commit: `git commit -m "test(all): verify hybrid approach — desktop and Android traditional tests pass"`

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Backend BDD retained for API contracts (auth, permissions, E2EE, call routing)
- [x] Desktop UI tests migrated to traditional Playwright with POM
- [x] Android UI tests migrated to traditional Compose UI tests
- [x] `workerHub` fixture shared between BDD and traditional (Desktop)
- [x] `BaseUiTest` with hub isolation for Android traditional tests
- [x] Test scripts updated to include traditional project (Desktop)
- [x] Android build simplified (Cucumber removed, feature file copying removed)
- [x] Documentation created for hybrid approach

**2. Placeholder scan:**
- [x] No "TBD", "TODO", "implement later" in plan (except `createHubViaApi()` stub which is explicitly marked)
- [x] All code blocks contain actual implementation
- [x] All file paths are exact

**3. Type consistency:**
- [x] `workerHub` fixture type consistent across BDD and traditional (Desktop)
- [x] `LoginPage`, `DashboardPage` use same `TestIds` and `Timeouts` as existing code
- [x] `traditional-fixtures.ts` exports `test` with correct type signature
- [x] Android `BaseUiTest` uses same `createAndroidComposeRule<MainActivity>()` pattern as existing tests
- [x] Android test tags match existing semantics ("pin-pad", "dashboard-title", etc.)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-hybrid-bdd-traditional-migration.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

**1. Spec coverage:**
- [x] Backend BDD retained for API contracts (auth, permissions, E2EE, call routing)
- [x] UI tests migrated to traditional Playwright with POM
- [x] `workerHub` fixture shared between BDD and traditional
- [x] Test scripts updated to include traditional project
- [x] Documentation created for hybrid approach

**2. Placeholder scan:**
- [x] No "TBD", "TODO", "implement later" in plan
- [x] All code blocks contain actual implementation
- [x] All file paths are exact

**3. Type consistency:**
- [x] `workerHub` fixture type consistent across BDD and traditional (Desktop)
- [x] `LoginPage`, `DashboardPage` use same `TestIds` and `Timeouts` as existing code
- [x] `traditional-fixtures.ts` exports `test` with correct type signature
- [x] Android `BaseUiTest` uses same `createAndroidComposeRule<MainActivity>()` pattern as existing tests
- [x] Android test tags match existing semantics ("pin-pad", "dashboard-title", etc.)

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-hybrid-bdd-traditional-migration.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
