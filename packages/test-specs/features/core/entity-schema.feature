@backend
Feature: Entity Schema Management
  Admins configure entity types and relationship types that define
  the hub's case management structure.

  Background:
    Given a registered admin "admin1"

  @cases
  Scenario: Enable case management for a hub
    When admin "admin1" enables case management
    Then the hub should have case management enabled

  @cases
  Scenario: Create an entity type
    Given case management is enabled
    When admin "admin1" creates an entity type "arrest_case" with category "case"
    Then the entity type "arrest_case" should exist
    And the entity type should have a generated UUID id
    And the entity type should have category "case"

  @cases
  Scenario: Create entity type with statuses and fields
    Given case management is enabled
    When admin "admin1" creates an entity type "medical_encounter" with:
      | statuses  | triaged,treating,treated,closed |
      | fields    | chief_complaint:text,triage_level:select,follow_up:checkbox |
    Then the entity type should have 4 statuses
    And the entity type should have 3 fields

  @cases
  Scenario: Update entity type — add a field
    Given case management is enabled
    And an entity type "arrest_case" exists
    When admin "admin1" adds a field "court_date" of type "text" to "arrest_case"
    Then the entity type "arrest_case" should have the field "court_date"

  @cases
  Scenario: Delete entity type
    Given case management is enabled
    And an entity type "test_type" exists
    When admin "admin1" deletes the entity type "test_type"
    Then the entity type "test_type" should not exist

  @cases
  Scenario: Duplicate entity type name is rejected
    Given case management is enabled
    And an entity type "arrest_case" exists
    When admin "admin1" tries to create an entity type "arrest_case" with category "case"
    Then the response status should be 409

  @cases
  Scenario: Create a relationship type
    Given case management is enabled
    And an entity type "arrest_case" exists
    When admin "admin1" creates a relationship type linking "contact" to "arrest_case" as "M:N"
    Then the relationship type should exist

  @cases @permissions
  Scenario: Volunteer cannot manage entity types
    Given a registered volunteer "vol1"
    And case management is enabled
    When volunteer "vol1" tries to create an entity type
    Then the response status should be 403

  @cases
  Scenario: Generate case number with auto-increment
    Given case management is enabled
    When a case number is generated with prefix "JS"
    Then the case number should match pattern "JS-{year}-0001"
    When another case number is generated with prefix "JS"
    Then the case number should match pattern "JS-{year}-0002"

  @cases @permissions
  Scenario: New CMS permissions are available in default roles
    When admin "admin1" lists roles
    Then the hub-admin role should include "cases:*"
    And the volunteer role should include "cases:create"
    And the volunteer role should include "cases:read-own"
