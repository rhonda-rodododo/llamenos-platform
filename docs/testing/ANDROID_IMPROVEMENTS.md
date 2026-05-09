# Android Test Infrastructure Improvements

## Status: Analysis Complete — Ready for Implementation

This document identifies pattern-level improvements for the Android traditional Compose UI test infrastructure. These are candidates for a follow-up PR after the hybrid BDD-to-traditional migration is complete.

---

## 1. Add Compose Test Tags to Production UI

**Current Problem:**
Tests reference tags like `"hubs-card"`, `"help-card"`, `"notes-empty"`, `"settings-hub-section"`, `"hubs-empty"` but there's no verification these tags exist in the actual Compose UI. The tests will fail with "node not found" if the UI changes.

**Proposed Solution:**
1. Audit all `testTag` usages in `app/src/main/java/org/llamenos/hotline/ui/**/*.kt`
2. Ensure every tag referenced in tests exists in production code
3. Add missing tags where needed
4. Document the test tag convention

**Effort:** Medium (audit + add missing tags, 2-3 hours)
**Files Affected:** `app/src/main/java/org/llamenos/hotline/ui/**/*.kt`, test files

---

## 2. Create Page Object Pattern for Compose UI Tests

**Current Problem:**
Tests directly use `composeRule.onNodeWithTag("...")` everywhere. This creates duplication and makes tests brittle when UI structure changes.

**Current code:**
```kotlin
composeRule.onNodeWithTag("nav-dashboard").assertIsDisplayed()
composeRule.onNodeWithTag("nav-settings").performClick()
composeRule.onNodeWithTag("settings-hub-section").performScrollTo()
```

**Proposed Solution:**
Create page objects:
```kotlin
// pages/DashboardPage.kt
object DashboardPage {
    fun assertVisible() {
        composeRule.onNodeWithTag("nav-dashboard").assertIsDisplayed()
    }
}

// pages/SettingsPage.kt
object SettingsPage {
    fun openHubSettings() {
        composeRule.onNodeWithTag("nav-settings").performClick()
        composeRule.onNodeWithTag("settings-hub-section").performScrollTo()
        composeRule.onNodeWithTag("settings-hub-section").performClick()
    }
}
```

**Effort:** Medium (create page objects + refactor tests, 3-4 hours)
**Files Affected:** New `app/src/androidTest/java/org/llamenos/hotline/pages/*.kt`, existing test files

---

## 3. Improve Test Isolation with Per-Test Hub Cleanup

**Current Problem:**
`BaseUiTest.createTestHub()` creates a hub in `@Before` but never cleans it up. Stale hubs accumulate in the test database.

**Current code:**
```kotlin
@Before
fun createTestHub() {
    // Creates hub but never deletes it
}
```

**Proposed Solution:**
Add `@After` cleanup:
```kotlin
@After
fun deleteTestHub() {
    if (::testHubId.isInitialized) {
        SimulationClient.deleteHub(testHubId)
    }
}
```

**Effort:** Small (1 hour)
**Files Affected:** `TestHelpers.kt`

---

## 4. Add Retry Logic with Exponential Backoff

**Current Problem:**
`BaseUiTest.createTestHub()` has manual retry with fixed 2s/4s delays. `waitForNode` uses `composeRule.waitUntil` which polls aggressively.

**Proposed Solution:**
1. Extract retry logic into reusable helper
2. Use exponential backoff for API calls
3. Add configurable timeouts

```kotlin
fun <T> retryWithBackoff(
    maxAttempts: Int = 3,
    initialDelayMs: Long = 500,
    block: () -> T
): T {
    var lastError: Exception? = null
    for (attempt in 1..maxAttempts) {
        try {
            return block()
        } catch (e: Exception) {
            lastError = e
            if (attempt < maxAttempts) {
                Thread.sleep(initialDelayMs * (1 shl (attempt - 1)))
            }
        }
    }
    throw lastError!!
}
```

**Effort:** Small (1 hour)
**Files Affected:** `TestHelpers.kt`

---

## 5. Add Hilt Test Integration

**Current Problem:**
Tests use `SimulationClient` for API calls but don't use Hilt's test integration. This means:
- No dependency injection in tests
- Manual object creation instead of using app components
- Can't easily mock services

**Proposed Solution:**
1. Add `hilt-android-testing` dependency
2. Create `CustomTestRunner` with Hilt support
3. Use `@HiltAndroidTest` annotation
4. Inject `SimulationClient` or API service instead of static calls

**Effort:** Medium (setup + refactor, 3-4 hours)
**Files Affected:** `build.gradle.kts`, `TestHelpers.kt`, test files

---

## 6. Add Screenshot Capture on Test Failure

**Current Problem:**
When a Compose UI test fails, there's no visual record of what the screen looked like at failure time.

**Proposed Solution:**
Add test rule that captures screenshots on failure:
```kotlin
@get:Rule
val screenshotRule = ScreenshotTestRule()

class ScreenshotTestRule : TestWatcher() {
    override fun failed(e: Throwable?, description: Description?) {
        val screenshot = composeRule.onRoot().captureToImage()
        // Save to file
    }
}
```

**Effort:** Small (1-2 hours)
**Files Affected:** New file, `TestHelpers.kt`

---

## 7. Parallel Test Execution

**Current Problem:**
Tests likely run sequentially. With proper isolation (per-test hubs), they could run in parallel.

**Proposed Solution:**
1. Ensure each test is fully isolated (hub + auth state)
2. Configure Gradle for parallel test execution:
```gradle
testOptions {
    execution "ANDROIDX_TEST_ORCHESTRATOR"
}
```

**Effort:** Small-Medium (configuration, 1-2 hours)
**Files Affected:** `build.gradle.kts`

---

## 8. Add Accessibility Testing

**Current Problem:**
Tests verify visual elements but don't check accessibility (content descriptions, touch target sizes, screen reader compatibility).

**Proposed Solution:**
Add Compose UI accessibility assertions:
```kotlin
composeRule.onNodeWithTag("login-button")
    .assertHasClickAction()
    .assertContentDescriptionEquals("Log in to your account")
```

**Effort:** Medium (audit + add assertions, 2-3 hours)
**Files Affected:** Test files, possibly production UI for missing descriptions

---

## 9. Create Test Data Builders

**Current Problem:**
Tests hardcode values like `"Test Volunteer ${Date.now()}"` and pin `"123456"`. No centralized test data management.

**Proposed Solution:**
Create test data builders/factories:
```kotlin
object TestData {
    fun randomName(prefix: String = "Test") = "$prefix ${System.currentTimeMillis()}"
    const val DEFAULT_PIN = "123456"
    const val INVALID_PIN = "000000"
    
    fun volunteerRequest() = CreateUserRequest(
        name = randomName("Volunteer"),
        roleIds = listOf("role-volunteer")
    )
}
```

**Effort:** Small (1 hour)
**Files Affected:** New `TestData.kt`, existing test files

---

## 10. Add Network Interception/Mocking

**Current Problem:**
Tests require a running backend. This makes them slower and flakier due to network issues.

**Proposed Solution:**
1. Use MockWebServer for API mocking
2. Create reusable mock responses
3. Run tests in "offline" mode for faster execution

**Effort:** Large (setup + create mocks, 5-8 hours)
**Files Affected:** New mocking infrastructure, test files

---

## Priority Ranking

| Priority | Improvement | Effort | Impact |
|----------|-------------|--------|--------|
| P1 | Add Compose test tags to UI | Medium | High — tests won't fail on missing tags |
| P1 | Create Page Object pattern | Medium | High — maintainability |
| P2 | Add per-test hub cleanup | Small | Medium — prevents stale data |
| P2 | Add Hilt test integration | Medium | Medium — proper DI |
| P2 | Screenshot capture on failure | Small | Medium — debugging |
| P3 | Retry logic with backoff | Small | Low — reliability |
| P3 | Parallel test execution | Small | Medium — faster CI |
| P3 | Test data builders | Small | Low — consistency |
| P4 | Accessibility testing | Medium | Medium — a11y compliance |
| P4 | Network mocking | Large | High — speed + reliability |

---

## Recommended Next Steps

1. **Immediate (this week):** Implement P1 items (add test tags, create page objects)
2. **Short-term (next sprint):** Implement P2 items (hub cleanup, Hilt, screenshots)
3. **Medium-term:** P3 items (parallel execution, data builders)
4. **Backlog:** P4 items (accessibility, network mocking)
