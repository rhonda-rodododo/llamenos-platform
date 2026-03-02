@android @ios @desktop
Feature: Reports
  As a reporter or admin
  I want to submit and view reports
  So that community incidents can be documented

  Background:
    Given I am logged in as an admin

  Scenario: Reports page loads with heading
    When I navigate to the "Reports" page
    Then I should see the "Reports" heading

  Scenario: Create a report
    When I navigate to the "Reports" page
    And I click "New Report"
    And I fill in the report details
    And I click "Submit"
    Then the report should appear in the reports list

  Scenario: Report list displays
    Given at least one report exists
    When I navigate to the "Reports" page
    Then I should see reports in the list

  Scenario: Report detail view
    Given a report exists
    When I click on the report
    Then I should see the report detail view
    And I should see the report content

  Scenario: Reporter can create reports
    Given a reporter has been invited and onboarded
    When the reporter logs in
    And they navigate to the "Reports" page
    And they create a new report
    Then the report should be saved successfully

  Scenario: Reporter cannot access admin pages
    Given a reporter is logged in
    When they navigate to "/volunteers" via SPA
    Then they should see "Access Denied"
