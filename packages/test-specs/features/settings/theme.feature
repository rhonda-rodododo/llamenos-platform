@android @ios @desktop
Feature: Theme
  As a user
  I want to switch between light and dark themes
  So that I can use the app comfortably in any lighting

  Background:
    Given I am logged in as an admin

  Scenario: Can switch to dark theme
    When I click the dark theme button
    Then the page should have the "dark" class

  Scenario: Can switch to light theme
    When I click the light theme button
    Then the page should not have the "dark" class

  Scenario: Can switch to system theme
    When I click the system theme button
    Then the page should render without errors

  Scenario: Theme persists across page reload
    When I click the dark theme button
    And I reload and re-authenticate
    Then the page should have the "dark" class

  Scenario: Login page has theme toggle
    When I log out
    Then I should see the dark theme button on the login page
    And I should see the light theme button on the login page
    And I should see the system theme button on the login page

  Scenario: Dark theme persists across SPA navigation
    When I click the dark theme button
    And I navigate to the "Volunteers" page
    Then the page should have the "dark" class
    When I navigate to the "Audit Log" page
    Then the page should have the "dark" class
    When I navigate to the "Dashboard" page
    Then the page should have the "dark" class
