# Epic 221: Admin, Settings & Device Link BDD Specs

**Status: PENDING**
**Priority**: Medium — admin and settings features
**Depends on**: Epic 219 (auth flow — tests need to reach main screen)
**Blocks**: None

## Summary

Write Gherkin feature files and Android Compose UI E2E tests for the Settings screen (identity display, lock/logout, hub connection), Admin panel (4 tabs with CRUD), and Device Link flow (QR scan state machine). These are lower-frequency features but critical for admin workflows and multi-device support.

## Feature Files

### `packages/test-specs/features/settings/settings-display.feature`

```gherkin
@android @ios @smoke
Feature: Settings Screen
  As an authenticated user
  I want to access my settings
  So that I can view my identity, manage my session, and access admin features

  Background:
    Given I am authenticated and on the main screen

  Scenario: Settings tab displays identity card
    When I tap the "Settings" tab
    Then I should see the identity card
    And I should see my npub in monospace text
    And I should see the copy npub button

  Scenario: Settings shows hub connection info
    When I tap the "Settings" tab
    Then I should see the hub connection card
    And the connection status should be displayed

  Scenario: Settings shows device link card
    When I tap the "Settings" tab
    Then I should see the device link card (may need scroll)
    And the device link card should be tappable

  Scenario: Settings shows admin card
    When I tap the "Settings" tab
    Then I should see the admin card (may need scroll)
    And the admin card should be tappable

  Scenario: Settings shows lock and logout buttons
    When I tap the "Settings" tab
    Then I should see the "Lock App" button
    And I should see the "Log Out" button

  Scenario: Settings shows version text
    When I tap the "Settings" tab
    Then I should see the version text
```

### `packages/test-specs/features/settings/lock-logout.feature`

```gherkin
@android @ios @regression
Feature: Lock & Logout
  As an authenticated user
  I want to lock or log out of the app
  So that I can secure my session

  Background:
    Given I am authenticated
    And I am on the settings screen

  Scenario: Lock app returns to PIN unlock
    When I tap "Lock App"
    Then I should see the PIN unlock screen
    And the crypto service should be locked

  Scenario: Logout shows confirmation dialog
    When I tap "Log Out"
    Then I should see the logout confirmation dialog
    And I should see "Confirm" and "Cancel" buttons

  Scenario: Cancel logout dismisses dialog
    When I tap "Log Out"
    And I tap "Cancel"
    Then the dialog should be dismissed
    And I should remain on the settings screen

  Scenario: Confirm logout clears identity
    When I tap "Log Out"
    And I tap "Confirm"
    Then I should return to the login screen
    And no stored keys should remain
    And the crypto service should be locked
```

### `packages/test-specs/features/settings/device-link.feature`

```gherkin
@android @ios @regression @requires-camera
Feature: Device Linking
  As a user with an identity on another device
  I want to link this device by scanning a QR code
  So that I can use the same identity on both devices

  Background:
    Given I am authenticated
    And I navigate to the device link screen from settings

  Scenario: Device link screen shows step indicator
    Then I should see the step indicator
    And I should see step labels (Scan, Verify, Import)
    And the current step should be "Scan"

  Scenario: Device link shows camera or permission prompt
    Then I should see either the camera preview or the camera permission prompt

  Scenario: Camera permission denied shows request button
    Given camera permission is not granted
    Then I should see the "Request Camera Permission" button

  @requires-camera
  Scenario: Invalid QR code shows error
    When a QR code with invalid format is scanned
    Then I should see the error state
    And the error message should mention "Invalid QR code format"
    And I should see "Retry" and "Cancel" buttons

  Scenario: Cancel returns to settings
    When I tap the back button
    Then I should return to the settings screen

  Scenario: Device link back navigation
    When I tap the back button
    Then I should see the settings screen
    And the device link card should still be visible
```

### `packages/test-specs/features/admin/admin-navigation.feature`

```gherkin
@android @ios @smoke
Feature: Admin Panel Navigation
  As an admin
  I want to access the admin panel
  So that I can manage volunteers, bans, audit logs, and invites

  Background:
    Given I am authenticated
    And I am on the settings screen

  Scenario: Navigate to admin panel
    When I scroll to and tap the admin card
    Then I should see the admin screen
    And the admin title should be displayed
    And the admin tabs should be visible

  Scenario: Admin back navigation returns to settings
    When I navigate to the admin panel
    And I tap the back button
    Then I should return to the settings screen
    And the settings identity card should be visible
```

### `packages/test-specs/features/admin/admin-tabs.feature`

```gherkin
@android @ios @regression
Feature: Admin Tabs
  As an admin
  I want to switch between admin tabs
  So that I can manage different aspects of the system

  Background:
    Given I am authenticated
    And I have navigated to the admin panel

  Scenario: All four admin tabs are present
    Then I should see the following tabs:
      | tab         |
      | Volunteers  |
      | Ban List    |
      | Audit Log   |
      | Invites     |

  Scenario: Default tab is Volunteers
    Then the "Volunteers" tab should be selected by default
    And volunteers content should be displayed (loading, empty, or list)

  Scenario Outline: Switch to admin tab
    When I tap the "<tab>" tab
    Then <tab_content> content should be displayed (loading, empty, or list)

    Examples:
      | tab        | tab_content  |
      | Ban List   | bans         |
      | Audit Log  | audit        |
      | Invites    | invites      |

  Scenario: Switch between all tabs without crash
    When I tap "Ban List"
    And I tap "Audit Log"
    And I tap "Invites"
    And I tap "Volunteers"
    Then I should be on the Volunteers tab
    And no crashes should occur
```

### `packages/test-specs/features/admin/access-control.feature`

```gherkin
@android @ios @regression
Feature: Access Control
  As the system
  I want to enforce state-based access to features
  So that locked devices cannot access sensitive functionality

  Scenario: Locked state restricts to PIN unlock only
    Given the crypto service is locked
    And a stored identity exists
    Then I should see the PIN unlock screen
    And the bottom navigation should not be visible
    And I should not be able to access any tab

  Scenario: Unlocked state provides full app access
    Given I am authenticated and on the dashboard
    Then the bottom navigation should be visible
    And I should be able to navigate to all tabs:
      | tab           |
      | Dashboard     |
      | Notes         |
      | Conversations |
      | Shifts        |
      | Settings      |

  Scenario: Crypto operations blocked when locked
    Given the crypto service is locked
    When I attempt to create an auth token
    Then it should throw a CryptoException
    When I attempt to encrypt a note
    Then it should throw a CryptoException
```

## Android Test Implementation

### File Structure

```
apps/android/app/src/androidTest/java/org/llamenos/hotline/
  e2e/
    settings/
      SettingsDisplayTest.kt        # 6 tests
      LockLogoutTest.kt             # 4 tests
      DeviceLinkTest.kt             # 6 tests
    admin/
      AdminNavigationTest.kt        # 2 tests
      AdminTabsTest.kt              # 6 tests
      AccessControlTest.kt          # 3 tests
```

### `LockLogoutTest.kt` Pattern

Lock/logout tests need special handling because they change auth state:

```kotlin
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class LockLogoutTest {
    @get:Rule(order = 0) val hiltRule = HiltAndroidRule(this)
    @get:Rule(order = 1) val composeRule = createAndroidComposeRule<MainActivity>()

    @Inject lateinit var keystoreService: KeystoreService
    @Inject lateinit var cryptoService: CryptoService

    @Before fun setup() { hiltRule.inject() }

    @After
    fun teardown() {
        // Ensure clean state for other tests
        keystoreService.clear()
        cryptoService.lock()
    }

    @Test
    fun lockAppReturnsToPinUnlock() {
        TestNavigationHelper.navigateToMainScreen(composeRule)
        TestNavigationHelper.navigateToTab(composeRule, NavTabs.SETTINGS)

        composeRule.onNodeWithTag("settings-lock-button").performClick()
        composeRule.waitForIdle()

        // Should be on PIN unlock screen
        composeRule.onNodeWithTag("unlock-title").assertIsDisplayed()
        composeRule.onNodeWithTag("pin-pad").assertIsDisplayed()
    }

    @Test
    fun confirmLogoutClearsIdentity() {
        TestNavigationHelper.navigateToMainScreen(composeRule)
        TestNavigationHelper.navigateToTab(composeRule, NavTabs.SETTINGS)

        // Scroll to and tap logout
        composeRule.onNodeWithTag("settings-logout-button").performScrollTo()
        composeRule.onNodeWithTag("settings-logout-button").performClick()
        composeRule.waitForIdle()

        // Confirm dialog
        composeRule.onNodeWithTag("logout-confirmation-dialog").assertIsDisplayed()
        composeRule.onNodeWithTag("confirm-logout-button").performClick()
        composeRule.waitForIdle()

        // Should be back on login
        composeRule.onNodeWithTag("app-title").assertIsDisplayed()
        composeRule.onNodeWithTag("create-identity").assertIsDisplayed()
    }
}
```

## Test Count

| Feature File | Scenarios | Android Tests |
|---|---|---|
| `settings-display.feature` | 6 | 6 |
| `lock-logout.feature` | 4 | 4 |
| `device-link.feature` | 6 | 6 |
| `admin-navigation.feature` | 2 | 2 |
| `admin-tabs.feature` | 6 | 6 |
| `access-control.feature` | 3 | 3 |
| **Total** | **27** | **27** |

(Replaces 6 existing AdminFlowTest scenarios + adds 21 new)

## Verification

```bash
# Run admin/settings E2E tests on Pixel 6a
cd apps/android && ./gradlew connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=org.llamenos.hotline.e2e.settings,org.llamenos.hotline.e2e.admin

# Validate feature coverage
bun run test-specs:validate

# Build and lint
cd apps/android && ./gradlew assembleDebug && ./gradlew lintDebug
```
