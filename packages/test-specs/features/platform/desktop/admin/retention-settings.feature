@desktop
Feature: Admin Retention Settings
  As an admin
  I want to configure data retention periods per category
  So that data is automatically purged according to policy

  Background:
    Given I am logged in as an admin

  Scenario: Retention section renders in admin panel
    When I navigate to the admin "retention" section
    Then I should see the retention categories

  Scenario: Retention categories show call records, notes, messages, audit log
    When I navigate to the admin "retention" section
    Then I should see retention settings for "call_records"
    And I should see retention settings for "notes"
    And I should see retention settings for "messages"
    And I should see retention settings for "audit_log"

  Scenario: Each category has a days input and save button
    When I navigate to the admin "retention" section
    Then each retention category should have a days input and save button
