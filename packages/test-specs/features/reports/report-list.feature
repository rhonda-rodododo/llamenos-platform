@android @desktop @regression
Feature: Reports List
  As a volunteer or admin
  I want to view and filter reports
  So that I can manage and track incident reports

  Background:
    Given I am authenticated and on the dashboard

  Scenario: Navigate to reports from dashboard
    When I tap the view reports button
    Then I should see the reports screen
    And I should see the reports title

  Scenario: Reports screen displays status filter chips
    When I tap the view reports button
    Then I should see the "All" report status filter
    And I should see the "Active" report status filter
    And I should see the "Waiting" report status filter
    And I should see the "Closed" report status filter

  Scenario: Reports screen shows empty state
    When I tap the view reports button
    Then I should see the reports empty state

  Scenario: Navigate back from reports
    When I tap the view reports button
    And I tap the back button on reports
    Then I should see the dashboard

  Scenario: Filter reports by active status
    When I tap the view reports button
    And I tap the "Active" report status filter
    Then the "Active" report status filter should be selected

  Scenario: Filter reports by waiting status
    When I tap the view reports button
    And I tap the "Waiting" report status filter
    Then the "Waiting" report status filter should be selected
