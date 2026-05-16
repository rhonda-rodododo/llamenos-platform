@desktop @ios @android
Feature: Shift Management
  As an admin or volunteer
  I want to manage shifts, clock in/out, and view shift details
  So that call coverage is organized and tracked

  # ── Shift List ────────────────────────────────────────────────────

  @desktop @ios @android @smoke
  Scenario: Navigate to shifts tab
    Given I am authenticated and on the main screen
    When I tap the "Shifts" tab
    Then I should see the clock in/out card
    And the clock status text should be displayed

  @desktop @ios @android @smoke
  Scenario: Clock in button visible when off shift
    Given I am authenticated and on the main screen
    When I tap the "Shifts" tab
    Then the "Clock In" button should be visible

  @desktop @ios @android @smoke
  Scenario: Shifts show schedule or empty state
    Given I am authenticated and on the main screen
    When I tap the "Shifts" tab
    Then I should see either the shifts list, empty state, or loading indicator

  # ── Clock In/Out ──────────────────────────────────────────────────

  @desktop @ios @android @regression @requires-network
  Scenario: Clock in changes status to on-shift
    Given I am authenticated and on the shifts screen
    And I am off shift
    When I tap "Clock In"
    Then the clock status should update
    And the button should change to "Clock Out"
    And the shift timer should appear

  @desktop @ios @android @regression @requires-network
  Scenario: Clock out changes status to off-shift
    Given I am authenticated and on the shifts screen
    And I am on shift
    When I tap "Clock Out"
    Then the clock status should show "Off Shift"
    And the button should change to "Clock In"

  # ── Shift Detail ──────────────────────────────────────────────────

  @desktop @ios @android
  Scenario: Navigate to shift detail from list
    Given I am authenticated and on the dashboard
    And I have navigated to the admin panel
    And I tap the "Shift Schedule" tab
    When I tap a shift card
    Then I should see the shift detail screen

  @desktop @ios @android
  Scenario: Shift info card shows name and time
    Given I am authenticated and on the dashboard
    And I have navigated to the admin panel
    And I tap the "Shift Schedule" tab
    When I tap a shift card
    Then I should see the shift info card

  @desktop @ios @android
  Scenario: Volunteer assignment list is displayed
    Given I am authenticated and on the dashboard
    And I have navigated to the admin panel
    And I tap the "Shift Schedule" tab
    When I tap a shift card
    Then I should see the volunteer assignment section

  @desktop @ios @android
  Scenario: Toggle volunteer assignment
    Given I am authenticated and on the dashboard
    And I have navigated to the admin panel
    And I tap the "Shift Schedule" tab
    When I tap a shift card
    And I tap a volunteer assignment card
    Then the volunteer assignment should toggle

  @desktop @ios @android
  Scenario: Navigate back from shift detail
    Given I am authenticated and on the dashboard
    And I have navigated to the admin panel
    And I tap the "Shift Schedule" tab
    When I tap a shift card
    And I tap the back button on the shift detail
    Then I should see the admin screen

  # ── Shift Scheduling ──────────────────────────────────────────────

  @desktop @ios @android
  Scenario: Shift page loads with heading and create button
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    Then I should see the "Shift Schedule" heading
    And I should see a "Create Shift" button
    And I should see "Fallback Group"

  @desktop @ios @android
  Scenario: Shift schedule shows shifts or empty state
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    Then I should see shifts or the "No shifts scheduled" message

  @desktop @ios @android
  Scenario: Create shift with name and times
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    When I click the "Create Shift" button
    And I fill in the shift name with a unique name
    And I set the start time to "08:00"
    And I set the end time to "16:00"
    And I click "Save"
    Then the shift should appear in the schedule
    And the shift should show "08:00 - 16:00"

  @desktop @ios @android
  Scenario: Edit shift name and time
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    And a shift exists
    When I click "Edit" on the shift
    And I change the shift name
    And I set the start time to "10:00"
    And I set the end time to "18:00"
    And I click "Save"
    Then the updated shift name should be visible
    And the shift should show "10:00 - 18:00"

  @desktop @ios @android
  Scenario: Delete a shift
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    And a shift exists
    When I click "Delete" on the shift
    Then the shift should no longer be visible

  @desktop @ios @android
  Scenario: Cancel shift creation
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    When I click the "Create Shift" button
    Then the shift form should be visible
    When I click "Cancel"
    Then the shift form should not be visible

  @desktop @ios @android
  Scenario: Cancel shift edit
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    And a shift exists
    When I click "Edit" on the shift
    Then the edit form should be visible
    When I click "Cancel"
    Then the original shift name should still be visible

  @desktop @ios @android
  Scenario: Assign volunteer to shift
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    And a volunteer exists
    When I create a shift and assign the volunteer
    And I click "Save"
    Then the shift should show "1 volunteer"

  @desktop @ios @android
  Scenario: Fallback group selection
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    And a volunteer exists
    When I add the volunteer to the fallback group
    Then the volunteer badge should appear in the fallback group

  @desktop @ios @android
  Scenario: Shift shows volunteer count
    Given I am logged in as an admin
    And I navigate to the "Shifts" page
    When I create a shift without assigning volunteers
    Then the shift should show "0 volunteer"
