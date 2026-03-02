@android @ios @desktop @regression
Feature: Report Closing
  As a volunteer or admin
  I want to close active reports
  So that resolved incidents are marked as complete

  Background:
    Given I am authenticated and on the main screen

  Scenario: Close button is visible on active report
    Given I am viewing a report with status "active"
    Then I should see the report close button

  Scenario: Close button is not visible on waiting report
    Given I am viewing a report with status "waiting"
    Then I should not see the report close button

  Scenario: Close button is not visible on already closed report
    Given I am viewing a report with status "closed"
    Then I should not see the report close button
