# Epic 219: Auth Flow BDD Specs & Android E2E Implementation

**Status: PENDING**
**Priority**: Critical — auth is the gateway to all features
**Depends on**: Epic 218 (BDD framework)
**Blocks**: Epics 220-222

## Summary

Write comprehensive Gherkin feature files for all authentication flows and implement the corresponding Android Compose UI E2E tests. This covers: login screen, identity creation, onboarding (nsec backup), key import, PIN setup, PIN unlock, and identity reset. Tests run on the Pixel 6a via `connectedDebugAndroidTest`.

## Feature Files

### `packages/test-specs/features/auth/login.feature`

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
    Then I should see the app title "Llámenos"
    And I should see the hub URL input field
    And I should see the nsec import input field
    And I should see the "Create New Identity" button
    And I should see the "Import Key" button

  Scenario: Hub URL input accepts and displays text
    When I enter "https://hub.example.com" in the hub URL field
    Then the hub URL field should contain "https://hub.example.com"

  Scenario: Nsec input is password-masked
    When I enter "nsec1test" in the nsec field
    Then the nsec field should be a password field

  @regression
  Scenario Outline: Import key validates nsec input
    When I enter "<nsec_input>" in the nsec field
    And I tap "Import Key"
    Then I should see "<expected_result>"
    And I should "<navigation>"

    Examples:
      | nsec_input                                                         | expected_result            | navigation                    |
      |                                                                    | error "Please enter nsec"  | remain on login screen        |
      | not-a-valid-nsec                                                   | an error message           | remain on login screen        |
      | nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5e  | the PIN setup screen       | navigate to PIN setup         |
```

### `packages/test-specs/features/auth/onboarding.feature`

```gherkin
@android @ios @smoke
Feature: Identity Creation & Onboarding
  As a new user
  I want to create a new identity
  So that I can use the app with a fresh keypair

  Background:
    Given the app is freshly installed
    And I am on the login screen

  Scenario: Create identity navigates to onboarding
    When I tap "Create New Identity"
    Then I should see the onboarding screen
    And I should see my generated nsec
    And I should see my generated npub
    And I should see the "I've Backed Up My Key" button

  Scenario: Create identity with hub URL stores it
    When I enter "https://hub.example.com" in the hub URL field
    And I tap "Create New Identity"
    Then I should see the onboarding screen
    And the hub URL should be persisted

  Scenario: Generated nsec has correct format
    When I tap "Create New Identity"
    Then the displayed nsec should start with "nsec1"
    And the displayed npub should start with "npub1"

  Scenario: Confirm backup navigates to PIN setup
    When I tap "Create New Identity"
    And I tap "I've Backed Up My Key"
    Then I should see the PIN setup screen
    And the title should say "Enter a PIN"
```

### `packages/test-specs/features/auth/pin-setup.feature`

```gherkin
@android @ios @smoke
Feature: PIN Setup
  As a new user completing onboarding
  I want to set a PIN to protect my identity
  So that my private key is encrypted at rest

  Background:
    Given I have created a new identity
    And I have confirmed my nsec backup
    And I am on the PIN setup screen

  Scenario: PIN pad displays correctly
    Then I should see the PIN pad with digits 0-9
    And I should see the backspace button
    And I should see the PIN dots indicator
    And the title should say "Enter a PIN"

  Scenario: Entering 4 digits moves to confirmation
    When I enter PIN "1234"
    Then the title should change to "Confirm your PIN"
    And the PIN dots should be cleared

  Scenario: Matching confirmation completes setup
    When I enter PIN "1234"
    And I confirm PIN "1234"
    Then I should arrive at the dashboard
    And the dashboard title should be displayed
    And the bottom navigation should be visible

  Scenario: Mismatched confirmation shows error
    When I enter PIN "1234"
    And I confirm PIN "5678"
    Then I should see a PIN mismatch error
    And I should remain on the PIN confirmation screen

  @regression
  Scenario: Backspace removes last digit
    When I press "1", "2"
    And I press backspace
    And I press "3", "4", "5"
    Then 4 digits should be entered
    And the title should change to "Confirm your PIN"

  @regression
  Scenario: PIN is encrypted and stored
    When I enter PIN "1234"
    And I confirm PIN "1234"
    Then the encrypted key data should be stored
    And the pubkey should be stored for locked display
    And the npub should be stored for locked display
```

### `packages/test-specs/features/auth/pin-unlock.feature`

```gherkin
@android @ios @smoke
Feature: PIN Unlock
  As a returning user
  I want to unlock the app with my PIN
  So that I can access my encrypted identity

  Background:
    Given I have a stored identity with PIN "1234"
    And the app is restarted

  Scenario: Unlock screen displays for returning user
    When the app launches
    Then I should see the PIN unlock screen
    And the title should indicate "Unlock"
    And the PIN pad should be displayed

  Scenario: Correct PIN unlocks the app
    When I enter PIN "1234"
    Then I should arrive at the dashboard
    And the crypto service should be unlocked

  Scenario: Wrong PIN shows error
    When I enter PIN "9999"
    Then I should see the error "Incorrect PIN"
    And I should remain on the unlock screen
    And the PIN dots should be cleared

  @regression
  Scenario: Multiple wrong PINs allow retry
    When I enter PIN "0000"
    And I see the error
    And I enter PIN "1111"
    And I see the error
    And I enter PIN "1234"
    Then I should arrive at the dashboard

  @regression
  Scenario: Reset identity from unlock screen
    When I tap "Reset Identity"
    Then I should see a confirmation dialog
    When I confirm the reset
    Then I should return to the login screen
    And no stored keys should remain
```

### `packages/test-specs/features/auth/key-import.feature`

```gherkin
@android @ios @regression
Feature: Key Import
  As an existing user
  I want to import my nsec from another device
  So that I can use the same identity on this device

  Background:
    Given the app is freshly installed
    And I am on the login screen

  Scenario: Import valid nsec and set PIN
    When I enter "https://hub.example.com" in the hub URL field
    And I enter a valid 63-character nsec
    And I tap "Import Key"
    And I enter PIN "5678"
    And I confirm PIN "5678"
    Then I should arrive at the dashboard
    And the hub URL should be stored as "https://hub.example.com"

  Scenario: Import without hub URL still works
    When I enter a valid 63-character nsec
    And I tap "Import Key"
    And I enter PIN "1234"
    And I confirm PIN "1234"
    Then I should arrive at the dashboard

  Scenario: Error clears when typing in nsec field
    When I tap "Import Key"
    And I see the error "Please enter your nsec"
    And I start typing in the nsec field
    Then the error should disappear
```

## Android Test Implementation

### File Structure

```
apps/android/app/src/androidTest/java/org/llamenos/hotline/
  e2e/
    auth/
      LoginScreenTest.kt          # login.feature scenarios
      OnboardingFlowTest.kt       # onboarding.feature scenarios
      PinSetupTest.kt             # pin-setup.feature scenarios
      PinUnlockTest.kt            # pin-unlock.feature scenarios
      KeyImportTest.kt            # key-import.feature scenarios
```

### `LoginScreenTest.kt`

```kotlin
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class LoginScreenTest {
    @get:Rule(order = 0) val hiltRule = HiltAndroidRule(this)
    @get:Rule(order = 1) val composeRule = createAndroidComposeRule<MainActivity>()

    @Before fun setup() { hiltRule.inject() }

    // Feature: Login Screen

    @Test fun loginScreenDisplaysAllRequiredElements() { ... }
    @Test fun hubUrlInputAcceptsAndDisplaysText() { ... }
    @Test fun nsecInputIsPasswordMasked() { ... }
    @Test fun importKeyWithEmptyNsecShowsError() { ... }
    @Test fun importKeyWithInvalidNsecShowsError() { ... }
    @Test fun importKeyWithValidNsecNavigatesToPinSetup() { ... }
}
```

### `PinUnlockTest.kt` (demonstrates state persistence)

This test is more complex because it requires setting up a stored identity first, then simulating an app restart. The test creates an identity, sets a PIN, then uses `ActivityScenario.recreate()` to simulate a cold start:

```kotlin
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class PinUnlockTest {
    @get:Rule(order = 0) val hiltRule = HiltAndroidRule(this)
    @get:Rule(order = 1) val composeRule = createAndroidComposeRule<MainActivity>()

    @Inject lateinit var cryptoService: CryptoService
    @Inject lateinit var keystoreService: KeystoreService

    @Before
    fun setup() {
        hiltRule.inject()
        // Pre-populate stored keys to simulate returning user
        setupStoredIdentity()
    }

    @After
    fun teardown() {
        keystoreService.clear()
        cryptoService.lock()
    }

    private fun setupStoredIdentity() {
        // Create identity and encrypt with PIN "1234" using CryptoService directly
        cryptoService.generateKeypair()
        runBlocking {
            val encrypted = cryptoService.encryptForStorage("1234")
            val stored = Json.encodeToString(StoredKeyData.serializer(), StoredKeyData(
                ciphertext = encrypted.ciphertext,
                salt = encrypted.salt,
                nonce = encrypted.nonce,
                pubkeyHex = encrypted.pubkeyHex,
                iterations = encrypted.iterations,
            ))
            keystoreService.store(KeystoreService.KEY_ENCRYPTED_KEYS, stored)
            keystoreService.store(KeystoreService.KEY_PUBKEY, cryptoService.pubkey!!)
            keystoreService.store(KeystoreService.KEY_NPUB, cryptoService.npub!!)
        }
        cryptoService.lock() // Simulate locked state
    }

    @Test fun unlockScreenDisplaysForReturningUser() { ... }
    @Test fun correctPinUnlocksTheApp() { ... }
    @Test fun wrongPinShowsError() { ... }
    @Test fun multipleWrongPinsAllowRetry() { ... }
}
```

## Refactoring Existing Tests

The 31 existing tests in 5 files (`AuthFlowTest.kt`, `AdminFlowTest.kt`, `NoteFlowTest.kt`, `ShiftFlowTest.kt`, `ConversationFlowTest.kt`) will be:

1. **Migrated** into the new `e2e/` directory structure
2. **Renamed** to match Gherkin scenario titles
3. **DRY'd** using `TestNavigationHelper` from Epic 218
4. **Expanded** with new scenarios from the feature files

The old files are deleted after migration — no parallel test hierarchies.

## Test Count

| Feature File | Scenarios | Android Tests |
|---|---|---|
| `login.feature` | 6 | 6 |
| `onboarding.feature` | 4 | 4 |
| `pin-setup.feature` | 6 | 6 |
| `pin-unlock.feature` | 5 | 5 |
| `key-import.feature` | 3 | 3 |
| **Total** | **24** | **24** |

(Replaces 6 existing `AuthFlowTest` scenarios + adds 18 new ones)

## Verification

```bash
# Run auth E2E tests on Pixel 6a
cd apps/android && ./gradlew connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=org.llamenos.hotline.e2e.auth

# Validate feature coverage
bun run test-specs:validate

# Build check
cd apps/android && ./gradlew assembleDebug
cd apps/android && ./gradlew lintDebug
```
