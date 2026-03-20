@backend
Feature: Entity Schema Management
  Admins configure entity types and relationship types that define
  the hub's case management structure.

  @cases
  Scenario: Enable case management for a hub
    When the admin enables case management
    Then case management should be enabled

  @cases
  Scenario: Create an entity type
    Given case management is enabled
    When the admin creates an entity type named "arrest_case" with category "case"
    Then the entity type "arrest_case" should exist
    And it should have a generated UUID id
    And it should have category "case"

  @cases
  Scenario: Create entity type with statuses and fields
    Given case management is enabled
    When the admin creates an entity type with statuses "triaged,treating,treated,closed" and fields "chief_complaint:text,triage_level:select,follow_up:checkbox"
    Then the created entity type should have 4 statuses
    And the created entity type should have 3 fields

  @cases
  Scenario: Update entity type — add a field
    Given case management is enabled
    And an entity type "update_test" exists
    When the admin adds a field "court_date" of type "text" to entity type "update_test"
    Then entity type "update_test" should have the field "court_date"

  @cases
  Scenario: Delete entity type
    Given case management is enabled
    And an entity type "delete_test" exists
    When the admin deletes entity type "delete_test"
    Then entity type "delete_test" should not exist

  @cases
  Scenario: Duplicate entity type name is rejected
    Given case management is enabled
    And an entity type "dupe_test" exists
    When the admin tries to create an entity type named "dupe_test"
    Then the response status should be 409

  @cases
  Scenario: Create a relationship type
    Given case management is enabled
    And an entity type "rel_case" exists
    When the admin creates a relationship type from "contact" to "rel_case" with cardinality "M:N"
    Then the relationship type should exist

  @cases @permissions
  Scenario: Volunteer cannot manage entity types
    Given case management is enabled
    When a volunteer tries to create an entity type
    Then the response status should be 403

  @cases
  Scenario: Generate case number with auto-increment
    Given case management is enabled
    When a case number is generated with prefix "JS"
    Then the first case number should match "JS-{year}-0001"
    When another case number is generated with prefix "JS"
    Then the second case number should match "JS-{year}-0002"

  @cases @permissions
  Scenario: CMS permissions in default roles
    When the admin lists all roles
    Then the hub-admin role should include permission "cases:*"
    And the volunteer role should include permission "cases:create"
    And the volunteer role should include permission "cases:read-own"
