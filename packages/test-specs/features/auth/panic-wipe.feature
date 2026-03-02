@android @ios @desktop @smoke
Feature: Panic Wipe
  As a user in danger
  I want to quickly wipe all local data
  So that sensitive information cannot be recovered

  Scenario: Triple-Escape triggers panic wipe
    Given I am logged in as an admin
    And I am on the dashboard
    When I press Escape three times quickly
    Then the panic wipe overlay should appear
    And I should be redirected to the login page
    And all local storage should be cleared
    And all session storage should be cleared

  Scenario: Two Escapes then pause does not trigger wipe
    Given I am logged in as an admin
    And I am on the dashboard
    When I press Escape twice then wait over one second
    And I press Escape once more
    Then I should still be on the dashboard
    And the encrypted key should still be in storage
