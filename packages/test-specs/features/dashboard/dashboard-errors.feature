@android @ios @desktop @regression
Feature: Dashboard Error Handling
  As a volunteer
  I want to see error messages when dashboard actions fail
  So that I know when something went wrong

  Background:
    Given I am authenticated and on the dashboard

  Scenario: Error card is hidden by default
    Then the dashboard error card should not be visible

  Scenario: Error card can be dismissed
    Given a dashboard error is displayed
    When I dismiss the dashboard error
    Then the dashboard error card should not be visible
