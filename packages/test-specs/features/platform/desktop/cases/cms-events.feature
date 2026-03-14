@desktop
Feature: Event Management
  Coordinators and admins track events (protests, mass arrests)
  and link case records and reports to them.

  Note: The events page does not yet have a desktop route.
  These scenarios define the target behavior for when
  the /events route is implemented.

  Background:
    Given I am logged in as an admin
    And case management is enabled
    And the "jail-support" template has been applied
    And an event entity type exists

  # --- Event list page ---

  Scenario: Events page loads with title and create button
    When I navigate to the "Events" page
    Then I should see the "Events" page title
    And the new event button should be visible

  Scenario: Events page shows empty state when no events exist
    Given no events have been created
    When I navigate to the "Events" page
    Then the empty state card should be visible
    And I should see "No events yet"

  Scenario: Events page lists existing events with status and date
    Given events exist
    When I navigate to the "Events" page
    Then at least one event card should be visible
    And each event card should show a start date
    And each event card should show a status badge

  # --- Event creation ---

  Scenario: Create a new event with name and date
    When I navigate to the "Events" page
    And I click the new event button
    And I fill in the event name with a unique name
    And I fill in the event start date
    And I submit the event creation form
    Then a success toast should appear
    And the new event should appear in the event list

  # --- Event detail ---

  Scenario: Clicking an event card loads the detail view
    Given an event "March 14 Protest" exists
    When I navigate to the "Events" page
    And I click on the "March 14 Protest" event card
    Then the event detail should be visible
    And the event name should be displayed
    And the event start date should be displayed

  Scenario: Event detail shows linked cases tab
    Given an event with linked cases exists
    When I view the event detail
    And I click the "Cases" tab
    Then linked case records should be visible
    And each case link should show a case number

  Scenario: Event detail shows linked cases count
    Given an event with 3 linked cases exists
    When I view the event detail
    Then the linked cases count should show 3

  Scenario: Event detail shows linked reports tab
    Given an event with linked reports exists
    When I view the event detail
    And I click the "Reports" tab
    Then linked reports should be visible

  # --- Linking cases to events ---

  Scenario: Link an existing case to an event
    Given an event exists
    And arrest cases exist
    When I view the event detail
    And I click the "Link Case" button
    And I search for a case by number
    And I select the case from the search results
    Then the case should appear in the event's linked cases
    And the linked cases count should increase by 1

  Scenario: Link a report to an event
    Given an event exists
    And a report exists
    When I view the event detail
    And I click the "Link Report" button
    And I select the report
    Then the report should appear in the event's linked reports

  # --- Event status ---

  Scenario: Change event status
    Given an event with status "active" exists
    When I view the event detail
    And I change the event status to "concluded"
    Then the event status should reflect "Concluded"
    And a success toast should appear
