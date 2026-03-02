@android @ios @desktop @regression
Feature: Call History Date Range Filter
  As a volunteer or admin
  I want to filter call history by date range
  So that I can review calls from a specific time period

  Background:
    Given I am authenticated and on the main screen

  Scenario: Date range filter chips are visible
    Given I am on the call history screen
    Then I should see the date from filter
    And I should see the date to filter

  Scenario: Clear button appears when a date is selected
    Given I am on the call history screen
    And a date range is selected
    Then I should see the date range clear button
