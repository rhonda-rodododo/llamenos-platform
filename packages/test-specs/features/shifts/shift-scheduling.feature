@android @ios @desktop
Feature: Shift Scheduling
  As an admin
  I want to create and manage shift schedules
  So that volunteers know when to answer calls

  Background:
    Given I am logged in as an admin
    And I navigate to the "Shifts" page

  Scenario: Shift page loads with heading and create button
    Then I should see the "Shift Schedule" heading
    And I should see a "Create Shift" button
    And I should see "Fallback Group"

  Scenario: Shift schedule shows shifts or empty state
    Then I should see shifts or the "No shifts scheduled" message

  Scenario: Create shift with name and times
    When I click the "Create Shift" button
    And I fill in the shift name with a unique name
    And I set the start time to "08:00"
    And I set the end time to "16:00"
    And I click "Save"
    Then the shift should appear in the schedule
    And the shift should show "08:00 - 16:00"

  Scenario: Edit shift name and time
    Given a shift exists
    When I click "Edit" on the shift
    And I change the shift name
    And I set the start time to "10:00"
    And I set the end time to "18:00"
    And I click "Save"
    Then the updated shift name should be visible
    And the shift should show "10:00 - 18:00"

  Scenario: Delete a shift
    Given a shift exists
    When I click "Delete" on the shift
    Then the shift should no longer be visible

  Scenario: Cancel shift creation
    When I click the "Create Shift" button
    Then the shift form should be visible
    When I click "Cancel"
    Then the shift form should not be visible

  Scenario: Cancel shift edit
    Given a shift exists
    When I click "Edit" on the shift
    Then the edit form should be visible
    When I click "Cancel"
    Then the original shift name should still be visible

  Scenario: Assign volunteer to shift
    Given a volunteer exists
    When I create a shift and assign the volunteer
    And I click "Save"
    Then the shift should show "1 volunteer"

  Scenario: Fallback group selection
    Given a volunteer exists
    When I add the volunteer to the fallback group
    Then the volunteer badge should appear in the fallback group

  Scenario: Shift shows volunteer count
    When I create a shift without assigning volunteers
    Then the shift should show "0 volunteer"
