@android @ios @desktop
Feature: Dashboard Quick Actions Grid
  As an authenticated volunteer
  I want to see quick action cards on the dashboard
  So that I can quickly navigate to key features

  Background:
    Given I am authenticated and on the dashboard

  Scenario: Quick actions grid is visible
    Then I should see the quick actions grid

  Scenario: All quick action cards are displayed
    Then I should see the reports card on the dashboard
    And I should see the contacts card on the dashboard
    And I should see the blasts card on the dashboard
    And I should see the help card on the dashboard

  Scenario: Tapping reports card opens reports
    When I tap the view reports button
    Then I should see the reports screen

  Scenario: Tapping contacts card opens contacts
    When I tap the view contacts button
    Then I should see the contacts screen

  Scenario: Tapping blasts card opens blasts
    When I tap the view blasts button
    Then I should see the blasts screen
