@android @ios @desktop @regression
Feature: Report Claiming
  As a volunteer
  I want to claim waiting reports
  So that I can take responsibility for handling them

  Background:
    Given I am authenticated and on the main screen

  Scenario: Claim button is visible on waiting report
    Given I am viewing a report with status "waiting"
    Then I should see the report claim button

  Scenario: Claim button is not visible on closed report
    Given I am viewing a report with status "closed"
    Then I should not see the report claim button
