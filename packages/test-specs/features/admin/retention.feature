@desktop @ios @android
Feature: Data Retention Policies
  As an admin
  I want to configure data retention periods
  So that old data is purged in compliance with privacy regulations

  # ── Backend: Hub retention settings ────────────────────────────────

  @backend
  Scenario: Hub admin reads retention settings (empty)
    Given a hub admin user in hub "test-hub"
    When the retention admin GETs "/hubs/test-hub/retention"
    Then the response status should be 200
    And the response should contain an empty settings list

  @backend
  Scenario: Hub admin configures call record retention
    Given a hub admin user in hub "test-hub"
    When the admin PATCHes "/hubs/test-hub/retention" with call_records 365 days
    Then the response status should be 200
    And the settings should show call_records with retentionDays 365

  @backend
  Scenario: Hub admin configures multiple retention categories
    Given a hub admin user in hub "test-hub"
    When the admin PATCHes "/hubs/test-hub/retention" with notes 730 days and messages 180 days
    Then the response status should be 200
    And the settings should contain 2 categories

  @backend
  Scenario: Retention cannot be set below platform floor
    Given a hub admin user in hub "test-hub"
    And a platform floor of 90 days for call_records
    When the admin PATCHes "/hubs/test-hub/retention" with call_records 30 days
    Then the response status should be 400
    And the response should contain error about platform floor

  @backend
  Scenario: Invalid category is rejected
    Given a hub admin user in hub "test-hub"
    When the admin PATCHes "/hubs/test-hub/retention" with category "invalid_category"
    Then the response status should be 400

  # ── Backend: Platform retention floors ──────────────────────────────

  @backend
  Scenario: Super admin reads platform retention floors
    Given a super admin user
    When the retention admin GETs "/retention/platform-floors"
    Then the response status should be 200
    And the response should contain a floors list

  @backend
  Scenario: Super admin sets platform retention floor
    Given a super admin user
    When the admin PATCHes "/retention/platform-floors" with audit_log minimum 90 days
    Then the response status should be 200
    And the floors should show audit_log with minRetentionDays 90

  @backend
  Scenario: Non-admin cannot access platform floors endpoint
    Given a non-admin volunteer user
    When the non-admin GETs "/retention/platform-floors"
    Then the response status should be 403
