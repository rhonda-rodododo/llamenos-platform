@desktop
Feature: Auth Guards
  As the system
  I want to protect authenticated routes from unauthenticated access
  So that sensitive data is only accessible to logged-in users

  Scenario: Unauthenticated user is redirected to login from root
    Given I am not authenticated
    When I visit the app root
    Then I should be redirected to the login page

  Scenario: Unauthenticated user is redirected from notes
    Given I am not authenticated
    When I visit "/notes" without authentication
    Then I should be redirected to the login page

  Scenario: Unauthenticated user is redirected from settings
    Given I am not authenticated
    When I visit "/settings" without authentication
    Then I should be redirected to the login page

  Scenario: Unauthenticated user is redirected from admin settings
    Given I am not authenticated
    When I visit "/admin/settings" without authentication
    Then I should be redirected to the login page

  Scenario: Session requires PIN re-entry after reload
    Given I am logged in as an admin
    When I reload the page
    Then I should be redirected to the login page
    When I re-enter the correct PIN
    Then I should see the "Dashboard" heading

  Scenario: Logout clears session
    Given I am logged in as an admin
    When I log out
    And I visit the app root
    Then I should be redirected to the login page

  Scenario: API returns 401 for unauthenticated requests
    When I make an unauthenticated API request to "/api/volunteers"
    Then the response status should be 401
