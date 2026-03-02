@desktop
Feature: Sidebar Navigation
  As a desktop user
  I want to navigate the app via a sidebar
  So that I can quickly access different sections

  Scenario: App loads with correct title
    When I visit the app root
    Then the page title should contain "Hotline"

  Scenario: Unauthenticated user is redirected to login
    When I visit "/notes" without authentication
    Then I should be redirected to the login page

  Scenario: Login page renders with sign-in form
    When I visit the login page
    Then I should see the nsec input

  Scenario: Login rejects invalid nsec
    When I visit the login page
    And I enter "invalid-key" in the nsec input
    And I click "Log In"
    Then I should see a validation error

  Scenario: API health check responds
    When I check the API health endpoint
    Then the response should be successful

  Scenario: API config endpoint responds
    When I check the API config endpoint
    Then the response should contain "hotlineName"
