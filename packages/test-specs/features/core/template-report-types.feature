@backend
Feature: Template-Defined Report Types
  Templates can define custom report types with fields, statuses,
  and configuration. Report types are stored as CMS definitions
  alongside entity types. Admins can CRUD report types via the API.

  @cms @templates
  Scenario: Apply template with report types
    Given case management is enabled
    When the admin applies template "jail-support"
    Then the template should be applied successfully
    And CMS report type "lo_arrest_report" should exist
    And CMS report type "lo_misconduct_report" should exist
    And CMS report type "lo_arrest_report" should have "allowCaseConversion" enabled
    And CMS report type "lo_arrest_report" should have "mobileOptimized" enabled

  @cms @reports
  Scenario: List CMS report types
    Given case management is enabled
    And the admin applies template "jail-support"
    When the admin lists CMS report types
    Then 2 CMS report types should be returned

  @cms @reports
  Scenario: Get CMS report type by ID
    Given case management is enabled
    And the admin applies template "jail-support"
    When the admin gets CMS report type "lo_arrest_report"
    Then the CMS report type should have name "lo_arrest_report"
    And the CMS report type should have 6 fields

  @cms @reports
  Scenario: CMS report type has supportAudioInput on textarea fields
    Given case management is enabled
    And the admin applies template "jail-support"
    When the admin gets CMS report type "lo_arrest_report"
    Then the CMS report type field "arrestee_details" should have "supportAudioInput" enabled

  @cms @reports
  Scenario: Report type CRUD operations
    Given case management is enabled
    When the admin creates a custom CMS report type "incident_report"
    Then the CMS report type should be retrievable
    When the admin updates the CMS report type label to "Updated Report"
    Then the CMS report type label should be "Updated Report"
    When the admin archives the CMS report type
    Then the CMS report type should be marked as archived

  @cms @reports
  Scenario: CMS report type validation rejects duplicate names
    Given case management is enabled
    And the admin creates a custom CMS report type "duplicate_test"
    When the admin tries to create a CMS report type "duplicate_test"
    Then the response status should be 409
