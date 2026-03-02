@android @desktop @regression
Feature: Call History
  As a volunteer or admin
  I want to view past call records
  So that I can review call history and follow up

  Background:
    Given I am authenticated and on the dashboard

  Scenario: Navigate to call history from dashboard
    When I tap the view call history button
    Then I should see the call history screen
    And I should see the call history title

  Scenario: Call history displays filter chips
    When I tap the view call history button
    Then I should see the "All" call filter chip
    And I should see the "Completed" call filter chip
    And I should see the "Unanswered" call filter chip

  Scenario: Call history shows empty state
    When I tap the view call history button
    Then I should see the call history empty state

  Scenario: Navigate back from call history
    When I tap the view call history button
    And I tap the back button on call history
    Then I should see the dashboard

  Scenario: Filter calls by completed status
    When I tap the view call history button
    And I tap the "Completed" call filter chip
    Then the "Completed" call filter should be selected

  Scenario: Filter calls by unanswered status
    When I tap the view call history button
    And I tap the "Unanswered" call filter chip
    Then the "Unanswered" call filter should be selected
