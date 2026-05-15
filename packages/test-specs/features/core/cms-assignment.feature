Feature: Smart Case Assignment API
  The assignment suggestion engine recommends volunteers based on
  availability, workload, specialization, and language matching.

  Background:
    Given the admin is authenticated
    And case management is enabled
    And the "jail-support" template is applied

  # --- Suggest assignees endpoint ---

  Scenario: GET /records/:id/suggest-assignees returns suggestions
    Given an unassigned arrest case exists
    And on-shift volunteers exist
    When I request GET /records/:id/suggest-assignees
    Then the response status should be 200
    And the response should contain "suggestions" array
    And each suggestion should have "pubkey", "score", and "reasons"

  Scenario: Suggestions filter out off-shift volunteers
    Given an unassigned arrest case exists
    And volunteer A is on-shift
    And volunteer B is off-shift
    When I request GET /records/:id/suggest-assignees
    Then volunteer A should appear in suggestions
    And volunteer B should not appear in suggestions

  Scenario: Suggestions filter out on-break volunteers
    Given an unassigned arrest case exists
    And volunteer A is on-shift and available
    And volunteer B is on-shift but on break
    When I request GET /records/:id/suggest-assignees
    Then volunteer A should appear in suggestions
    And volunteer B should not appear in suggestions

  Scenario: Suggestions filter out at-capacity volunteers
    Given an unassigned arrest case exists
    And volunteer A has 2/10 case capacity used
    And volunteer B has 10/10 case capacity used
    When I request GET /records/:id/suggest-assignees
    Then volunteer A should appear in suggestions
    And volunteer B should not appear in suggestions

  Scenario: Language match increases score
    Given an arrest case with language preference "es" exists
    And volunteer A speaks "es"
    And volunteer B speaks "en" only
    When I request GET /records/:id/suggest-assignees
    Then volunteer A should have a higher score than volunteer B

  Scenario: Lower workload increases score
    Given an unassigned arrest case exists
    And volunteer A has 1 active case
    And volunteer B has 7 active cases
    When I request GET /records/:id/suggest-assignees
    Then volunteer A should have a higher score than volunteer B

  Scenario: Specialization match increases score
    Given an arrest case of type "arrest_case" exists
    And volunteer A has specialization "jail_support"
    And volunteer B has no specializations
    When I request GET /records/:id/suggest-assignees
    Then volunteer A should have a higher score than volunteer B

  # --- Auto-assignment ---

  Scenario: POST /settings/cms/auto-assignment enables auto-assign
    When I POST /settings/cms/auto-assignment with enabled=true
    Then the response status should be 200
    And auto-assignment should be enabled

  Scenario: Auto-assignment assigns new cases round-robin
    Given auto-assignment is enabled
    And 3 on-shift volunteers with capacity exist
    When a new arrest case is created
    Then the case should have exactly 1 assignee
    And the assignee should be from the available volunteers

  # --- Score breakdown fields (EP06-A3) ---

  @backend
  Scenario: Suggestion response includes per-component score breakdown
    Given an unassigned arrest case exists
    And on-shift volunteers exist
    When I fetch suggest-assignees for the case
    Then the response status should be 200
    And each suggestion should include "workloadScore", "languageScore", "specializationScore", "availabilityScore"
    And each suggestion should include "matchedSpecializations" array

  @backend
  Scenario: Entity type autoAssign field is persisted
    Given an entity type with autoAssign enabled and threshold 35 exists
    When I fetch the entity type
    Then the entity type should have autoAssign true
    And the entity type should have autoAssignThreshold 35

  @backend
  Scenario: Entity type requiredSpecializations is used in scoring
    Given an arrest case linked to an entity type requiring specialization "crisis_counseling" exists
    And volunteer A has specialization "crisis_counseling"
    And volunteer B has no specializations
    When I fetch suggest-assignees for the case
    Then volunteer A should have a higher specializationScore than volunteer B
