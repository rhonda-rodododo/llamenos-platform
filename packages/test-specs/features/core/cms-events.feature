@backend
Feature: CMS Events
  Admins create events (protests, mass arrests) and link
  case records and reports to them.

  @events
  Scenario: Create event record
    Given case management is enabled
    And an event entity type "protest_event" exists
    When the admin creates an event of type "protest_event"
    Then the event should have a generated UUID id
    And the event should have a start date

  @events
  Scenario: Link record to event
    Given case management is enabled
    And an event entity type "link_event_type" exists
    And an event of type "link_event_type" exists
    And an entity type "event_case_type" exists
    And a record of type "event_case_type" exists
    When the admin links the record to the event
    Then the event should have 1 linked record

  @events
  Scenario: Link report to event
    Given case management is enabled
    And an event entity type "report_event_type" exists
    And an event of type "report_event_type" exists
    And a report exists
    When the admin links the report to the event
    Then the event should have 1 linked report

  @events
  Scenario: List records linked to event
    Given case management is enabled
    And an event entity type "list_link_event" exists
    And an event of type "list_link_event" exists
    And an entity type "list_link_case" exists
    And 2 records of type "list_link_case" are linked to the event
    When the admin lists records linked to the event
    Then 2 record links should be returned
