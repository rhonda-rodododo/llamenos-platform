@android @ios @desktop @regression
Feature: Report Creation
  As a volunteer
  I want to create structured reports
  So that I can document incidents with titles and categories

  Background:
    Given I am authenticated and on the main screen

  Scenario: Create report FAB is visible
    Given I navigate to the reports list
    Then I should see the create report button

  Scenario: Report creation form has required fields
    Given I navigate to the report creation form
    Then I should see the report title input
    And I should see the report body input
    And I should see the report submit button

  Scenario: Submit button is disabled without title and body
    Given I navigate to the report creation form
    Then the report submit button should be disabled
