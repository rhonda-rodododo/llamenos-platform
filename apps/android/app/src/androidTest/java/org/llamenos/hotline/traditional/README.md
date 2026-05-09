# Traditional Compose UI Tests

This directory contains standard JUnit4 + Compose UI tests for the Android app.
These replace the previous Cucumber-Android BDD tests.

## Structure

- `TestHelpers.kt` — BaseUiTest with shared infrastructure (Compose rule, hub creation, PIN entry, navigation)
- `AuthTest.kt` — Authentication flow tests
- `DashboardTest.kt` — Dashboard and navigation tests
- `HubManagementTest.kt` — Hub settings tests

## Running Tests

From the `apps/android/` directory:

```bash
./gradlew connectedDebugAndroidTest
```

Or run a specific test class:

```bash
adb shell am instrument -w -e class org.llamenos.hotline.traditional.AuthTest org.llamenos.hotline.test/androidx.test.runner.AndroidJUnitRunner
```

## Test Infrastructure

### Hub Isolation

Each test gets its own isolated hub via `SimulationClient.createTestHub()` in the `@Before` method. This ensures tests do not share data.

### Auth Flow

`BaseUiTest.navigateToMainScreen()` handles both fresh-install and returning-user flows:

- Fresh install: enters hub URL, creates identity, sets PIN, reaches dashboard
- Returning user: enters PIN on unlock screen, reaches dashboard

### Assertions

All assertions use `.assertIsDisplayed()` directly. There are no try/catch wrappers swallowing failures.

## Writing New Tests

```kotlin
class MyFeatureTest : BaseUiTest() {

    @Test
    fun myFeatureWorks() {
        navigateToMainScreen()
        navigateToTab("nav-settings")
        composeRule.onNodeWithTag("some-tag").assertIsDisplayed()
    }
}
```

## Requirements

- Backend running at the URL specified by `testHubUrl` instrumentation argument
- `X-Test-Secret` header matching the `testSecret` argument (default: "test-reset-secret")
