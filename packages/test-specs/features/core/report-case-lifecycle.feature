@backend @lifecycle
Feature: Report-to-Case Lifecycle
  As an admin or volunteer
  I want to manage the full lifecycle from report submission to case creation
  So that incidents are properly tracked, assigned, and linked

  Background:
    And case management is enabled

  # ── Full Lifecycle ───────────────────────────────────────────────

  Scenario: Full report-to-case conversion workflow
    Given a reporter submits a report with title "Incident at Main St"
    And a volunteer is assigned to the report
    When the admin converts the report to a case
    Then a case record should be created
    And the case should be linked to the original report
    And listing the report should show the linked case ID
    And listing the case should show the linked report ID

  # ── Reporter Data Isolation ──────────────────────────────────────

  Scenario: Reporter can only see their own reports
    Given reporter "R1" creates a report with title "R1 Report"
    And reporter "R2" creates a report with title "R2 Report"
    When "R1" lists their own reports
    Then "R1" should see "R1 Report"
    And "R1" should not see "R2 Report"

  # ── Metadata Persistence ─────────────────────────────────────────

  Scenario: Report metadata persists through updates
    Given a report exists with metadata category "urgent" and title "Fire on 5th Ave"
    When the admin updates the lifecycle report status to "active"
    And the report is fetched again
    Then the report metadata should still contain category "urgent"
    And the report metadata should be a proper JSONB object, not a double-serialized string
