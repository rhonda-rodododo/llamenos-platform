# Epic 220: Core Features BDD Specs & Android E2E Implementation

**Status: PENDING**
**Priority**: High — covers the 4 main tabs
**Depends on**: Epic 219 (auth flow — tests need to reach main screen)
**Blocks**: None

## Summary

Write Gherkin feature files and Android Compose UI E2E tests for the four primary tabs: Dashboard, Notes, Conversations, and Shifts. These are the features volunteers interact with most. Tests exercise real navigation, UI rendering, and user interactions on the Pixel 6a.

## Feature Files

### `packages/test-specs/features/dashboard/dashboard-display.feature`

```gherkin
@android @ios @smoke
Feature: Dashboard Display
  As an authenticated volunteer
  I want to see the dashboard
  So that I can see my status at a glance

  Background:
    Given I am authenticated and on the dashboard

  Scenario: Dashboard displays all status cards
    Then I should see the connection status card
    And I should see the shift status card
    And I should see the active calls card
    And I should see the recent notes card
    And I should see the identity card

  Scenario: Dashboard shows npub in identity card
    Then the identity card should display my npub
    And the npub should start with "npub1"

  Scenario: Dashboard shows connection status
    Then the connection card should show a status text
    And the top bar should show a connection dot

  Scenario: Dashboard shows shift status
    Then the shift card should show "Off Shift" or "On Shift"
    And a clock in/out button should be visible

  Scenario: Dashboard shows active call count
    Then the calls card should display a numeric call count
    And the count should be "0" for a fresh session

  Scenario: Dashboard shows recent notes section
    Then the recent notes card should be displayed
    And either recent notes or "no recent notes" message should appear

  @regression
  Scenario: Dashboard lock button is present
    Then the lock button should be visible in the top bar

  @regression
  Scenario: Dashboard logout button is present
    Then the logout button should be visible in the top bar
```

### `packages/test-specs/features/dashboard/shift-status.feature`

```gherkin
@android @ios @regression
Feature: Dashboard Shift Actions
  As a volunteer on the dashboard
  I want to quickly clock in/out
  So that I can start receiving calls without navigating to shifts

  Background:
    Given I am authenticated and on the dashboard

  Scenario: Clock in button shows when off shift
    Given I am off shift
    Then the dashboard clock button should say "Clock In"

  Scenario: Tapping clock in attempts to clock in
    Given I am off shift
    When I tap the dashboard clock button
    Then a clock-in request should be sent
    And the button should show a loading state briefly
```

### `packages/test-specs/features/notes/note-list.feature`

```gherkin
@android @ios @smoke
Feature: Notes List
  As a volunteer
  I want to see my encrypted notes
  So that I can review call documentation

  Background:
    Given I am authenticated and on the main screen

  Scenario: Navigate to notes tab
    When I tap the "Notes" tab
    Then I should see the notes screen
    And the create note FAB should be visible

  Scenario: Notes tab shows empty state or list
    When I tap the "Notes" tab
    Then I should see either the notes list, empty state, or loading indicator

  Scenario: Create note FAB navigates to create screen
    When I tap the "Notes" tab
    And I tap the create note FAB
    Then I should see the note creation screen
    And the note text input should be visible
    And the save button should be visible
    And the back button should be visible
```

### `packages/test-specs/features/notes/note-create.feature`

```gherkin
@android @ios @smoke
Feature: Note Creation
  As a volunteer on a call
  I want to create encrypted notes
  So that the call is documented securely

  Background:
    Given I am authenticated and on the note creation screen

  Scenario: Note text input accepts text
    When I type "Test note content" in the note text field
    Then the text "Test note content" should be displayed

  Scenario: Back navigation returns to notes list
    When I tap the back button
    Then I should return to the notes list
    And the create note FAB should be visible

  @regression
  Scenario: Note creation with custom fields
    Given custom fields are configured for notes
    When I type "Call note with fields" in the note text field
    Then I should see custom field inputs below the text field
```

### `packages/test-specs/features/notes/note-detail.feature`

```gherkin
@android @ios @regression
Feature: Note Detail View
  As a volunteer
  I want to view the full details of a note
  So that I can review the complete call documentation

  Background:
    Given I am authenticated
    And at least one note exists

  Scenario: Note detail displays decrypted content
    When I navigate to a note's detail view
    Then I should see the full note text
    And I should see the creation date
    And I should see the author pubkey

  Scenario: Note detail back navigation
    When I am on a note detail view
    And I tap the back button
    Then I should return to the notes list

  Scenario: Note detail shows copy button
    When I am on a note detail view
    Then a copy button should be visible in the top bar
```

### `packages/test-specs/features/conversations/conversation-list.feature`

```gherkin
@android @ios @smoke
Feature: Conversations List
  As a volunteer
  I want to see conversations from callers
  So that I can respond to messages (SMS, WhatsApp, Signal)

  Background:
    Given I am authenticated and on the main screen

  Scenario: Navigate to conversations tab
    When I tap the "Conversations" tab
    Then I should see the conversations screen
    And the filter chips should be visible

  Scenario: Filter chips are displayed
    When I tap the "Conversations" tab
    Then I should see the "Active" filter chip
    And I should see the "Closed" filter chip
    And I should see the "All" filter chip

  Scenario: Default filter is "Active"
    When I tap the "Conversations" tab
    Then the "Active" filter should be selected
```

### `packages/test-specs/features/conversations/conversation-filters.feature`

```gherkin
@android @ios @regression
Feature: Conversation Filters
  As a volunteer
  I want to filter conversations by status
  So that I can focus on active or review closed ones

  Background:
    Given I am authenticated and on the conversations screen

  Scenario: Switch to "Closed" filter
    When I tap the "Closed" filter chip
    Then the "Closed" filter should be selected
    And the conversation list should update

  Scenario: Switch to "All" filter
    When I tap the "All" filter chip
    Then the "All" filter should be selected

  Scenario: Switch back to "Active" filter
    Given I have selected the "Closed" filter
    When I tap the "Active" filter chip
    Then the "Active" filter should be selected

  Scenario: Conversations show empty or list state
    Then I should see either the conversations list, empty state, or loading indicator
```

### `packages/test-specs/features/shifts/shift-list.feature`

```gherkin
@android @ios @smoke
Feature: Shifts Tab
  As a volunteer
  I want to see available shifts and my clock status
  So that I can manage when I receive calls

  Background:
    Given I am authenticated and on the main screen

  Scenario: Navigate to shifts tab
    When I tap the "Shifts" tab
    Then I should see the clock in/out card
    And the clock status text should be displayed

  Scenario: Clock in button visible when off shift
    When I tap the "Shifts" tab
    Then the "Clock In" button should be visible

  Scenario: Shifts show schedule or empty state
    When I tap the "Shifts" tab
    Then I should see either the shifts list, empty state, or loading indicator
```

### `packages/test-specs/features/shifts/clock-in-out.feature`

```gherkin
@android @ios @regression @requires-network
Feature: Clock In/Out
  As a volunteer
  I want to clock in and out
  So that the system knows when I'm available for calls

  Background:
    Given I am authenticated and on the shifts screen

  Scenario: Clock in changes status to on-shift
    Given I am off shift
    When I tap "Clock In"
    Then the clock status should update
    And the button should change to "Clock Out"
    And the shift timer should appear

  Scenario: Clock out changes status to off-shift
    Given I am on shift
    When I tap "Clock Out"
    Then the clock status should show "Off Shift"
    And the button should change to "Clock In"
```

## Android Test Implementation

### File Structure

```
apps/android/app/src/androidTest/java/org/llamenos/hotline/
  e2e/
    dashboard/
      DashboardDisplayTest.kt       # 8 tests
      DashboardShiftActionsTest.kt   # 2 tests
    notes/
      NoteListTest.kt               # 3 tests
      NoteCreateTest.kt             # 3 tests
      NoteDetailTest.kt             # 3 tests
    conversations/
      ConversationListTest.kt       # 3 tests
      ConversationFiltersTest.kt    # 4 tests
    shifts/
      ShiftListTest.kt              # 3 tests
      ClockInOutTest.kt             # 2 tests
    navigation/
      BottomNavigationTest.kt      # 3 tests
```

### Navigation Tab Constants

```kotlin
object NavTabs {
    const val DASHBOARD = "nav-dashboard"
    const val NOTES = "nav-notes"
    const val CONVERSATIONS = "nav-conversations"
    const val SHIFTS = "nav-shifts"
    const val SETTINGS = "nav-settings"
}
```

## Test Count

| Feature File | Scenarios | Android Tests |
|---|---|---|
| `dashboard-display.feature` | 8 | 8 |
| `shift-status.feature` | 2 | 2 |
| `note-list.feature` | 3 | 3 |
| `note-create.feature` | 3 | 3 |
| `note-detail.feature` | 3 | 3 |
| `conversation-list.feature` | 3 | 3 |
| `conversation-filters.feature` | 4 | 4 |
| `shift-list.feature` | 3 | 3 |
| `clock-in-out.feature` | 2 | 2 |
| `bottom-navigation.feature` | 3 | 3 |
| **Total** | **34** | **34** |

(Replaces ~22 existing tests from NoteFlowTest, ShiftFlowTest, ConversationFlowTest + adds 12 new)

## Bottom Navigation E2E

### `packages/test-specs/features/navigation/bottom-navigation.feature`

```gherkin
@android @ios @smoke
Feature: Bottom Navigation
  As an authenticated user
  I want to switch between tabs
  So that I can access different features

  Background:
    Given I am authenticated and on the dashboard

  Scenario: All five tabs are visible
    Then I should see the Dashboard tab
    And I should see the Notes tab
    And I should see the Conversations tab
    And I should see the Shifts tab
    And I should see the Settings tab

  Scenario: Tab switching preserves state
    When I tap the "Shifts" tab
    Then I should see the shifts screen
    When I tap the "Notes" tab
    Then I should see the notes screen
    When I tap the "Dashboard" tab
    Then I should see the dashboard
    When I tap the "Settings" tab
    Then I should see the settings screen

  Scenario: Tab switching between conversations and notes
    When I tap the "Conversations" tab
    Then I should see the conversation filters
    When I tap the "Notes" tab
    Then I should see the create note FAB
    When I tap the "Conversations" tab
    Then I should see the conversation filters
```

## Verification

```bash
# Run all core feature E2E tests on Pixel 6a
cd apps/android && ./gradlew connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=org.llamenos.hotline.e2e.dashboard,org.llamenos.hotline.e2e.notes,org.llamenos.hotline.e2e.conversations,org.llamenos.hotline.e2e.shifts

# Validate feature coverage
bun run test-specs:validate

# Build and lint
cd apps/android && ./gradlew assembleDebug && ./gradlew lintDebug
```
