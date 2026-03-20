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
