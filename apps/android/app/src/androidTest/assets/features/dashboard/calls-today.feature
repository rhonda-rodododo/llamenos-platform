Feature: Calls Today Count
  As a volunteer
  I want to see how many calls were handled today
  So that I can track daily activity at a glance

  Background:
    Given the app is launched

  Scenario: Calls today count displayed on dashboard
    Then I should see the calls today count on the dashboard

  Scenario: Calls today count updates with shift status
    When I pull to refresh the dashboard
    Then I should see the calls today count on the dashboard
