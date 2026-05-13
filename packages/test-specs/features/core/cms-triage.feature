@backend
Feature: CMS Triage Queue
  Admins filter reports eligible for case conversion, track conversion
  status, and create cases linked to reports through the triage workflow.

  @triage
  Scenario: List triage queue returns only conversion-enabled report types
    Given case management is enabled
    And a CMS report type with allowCaseConversion enabled exists
    And a CMS report type with allowCaseConversion disabled exists
    And a report of the conversion-enabled type exists
    And a report of the conversion-disabled type exists
    When the admin lists reports with conversionEnabled true
    Then only reports of the conversion-enabled type should be returned

  @triage
  Scenario: Filter triage queue by conversion status pending
    Given case management is enabled
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists with conversionStatus "pending"
    And a report of the conversion-enabled type exists with conversionStatus "completed"
    When the admin lists reports with conversionEnabled true and conversionStatus "pending"
    Then only reports with conversionStatus "pending" should be returned

  @triage
  Scenario: Update report conversion status to in_progress
    Given case management is enabled
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    When the admin updates the report conversionStatus to "in_progress"
    Then the report metadata should include conversionStatus "in_progress"

  @triage
  Scenario: Update report conversion status to completed
    Given case management is enabled
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    When the admin updates the report conversionStatus to "completed"
    Then the report metadata should include conversionStatus "completed"

  @triage
  Scenario: Create case from report links the case to the report
    Given case management is enabled
    And an entity type "triage_case_type" exists
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    When the admin creates a case record from the report
    Then the report should have 1 linked case record

  @triage @permissions
  Scenario: Volunteer without reports:read-all cannot access triage queue
    Given case management is enabled
    And a volunteer exists with cases:create permission only
    When the volunteer lists reports with conversionEnabled true
    Then the request should be forbidden

  @triage
  Scenario: Empty triage queue returns empty list
    Given case management is enabled
    And a CMS report type with allowCaseConversion enabled exists
    When the admin lists reports with conversionEnabled true
    Then the triage queue should be empty

  @triage
  Scenario: Conversion status persists across report fetches
    Given case management is enabled
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    When the admin updates the report conversionStatus to "in_progress"
    And the admin fetches the report
    Then the report metadata should include conversionStatus "in_progress"

  # --- Atomic report-to-entity conversion (EP06-A3) ---

  @triage @backend
  Scenario: POST /records/convert-from-report creates a case record atomically
    Given case management is enabled
    And an entity type "triage_entity_type" exists
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    When the admin converts the report to an entity using the atomic endpoint
    Then the response status should be 201
    And the response should include a "recordId"
    And the response should include "reportId" matching the original report
    And the report conversionStatus should be "completed"

  @triage @backend
  Scenario: Atomic conversion auto-assigns when entity type has autoAssign enabled
    Given case management is enabled
    And an entity type "auto_assign_entity_type" with autoAssign enabled exists
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    And an on-shift volunteer with capacity exists
    When the admin converts the report to an entity using the atomic endpoint
    Then the response status should be 201
    And the response should have "autoAssigned" true
    And the response "assignedTo" should be non-empty

  @triage @backend
  Scenario: Atomic conversion without autoAssign does not assign
    Given case management is enabled
    And an entity type "no_assign_entity_type" with autoAssign disabled exists
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    When the admin converts the report to an entity using the atomic endpoint
    Then the response status should be 201
    And the response should have "autoAssigned" false

  @triage @backend @permissions
  Scenario: Volunteer without reports:triage cannot use atomic conversion
    Given case management is enabled
    And an entity type "triage_entity_type" exists
    And a CMS report type with allowCaseConversion enabled exists
    And a report of the conversion-enabled type exists
    And a volunteer exists with cases:create permission only
    When the volunteer converts the report using the atomic endpoint
    Then the request should be forbidden
