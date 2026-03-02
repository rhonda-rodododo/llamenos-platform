@android @ios @desktop
Feature: Audit Log
  As an admin
  I want to view an audit log of all actions
  So that I can track who did what and when

  Background:
    Given I am logged in as an admin

  Scenario: Audit log page loads with heading
    When I navigate to the "Audit Log" page
    Then I should see the "Audit Log" heading

  Scenario: Audit log shows entries after admin actions
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    Then I should see "Volunteer Added"

  Scenario: Entries show timestamps
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    Then audit entries should be visible with date information

  Scenario: Audit entry actors are displayed as links
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    Then audit entries should show actor links pointing to volunteer profiles

  Scenario: Volunteer sees access denied on audit page
    Given a volunteer exists
    When the volunteer logs in and navigates to "/audit"
    Then they should see "Access Denied"

  Scenario: Multiple action types appear
    Given I have created and then deleted a volunteer
    When I navigate to the "Audit Log" page
    Then I should see "Volunteer Added"
    And I should see "Volunteer Removed"

  Scenario: Filter bar is visible with all controls
    When I navigate to the "Audit Log" page
    Then I should see a search input
    And I should see an "All Events" event type filter
    And I should see date range inputs

  Scenario: Event type filter narrows results
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    And I filter by "Volunteers" event type
    Then I should see "Volunteer Added"
    When I filter by "Calls" event type
    Then "Volunteer Added" should not be visible

  Scenario: Search filter works
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    And I search for "xyznonexistent999"
    Then "Volunteer Added" should not be visible

  Scenario: Clear button resets all filters
    When I navigate to the "Audit Log" page
    And I type "something" in the search input
    Then I should see a "Clear" button
    When I click "Clear"
    Then the search input should be empty
    And the "Clear" button should not be visible

  Scenario: Event type badges use category colors
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    Then the "Volunteer Added" badge should have the purple color class
