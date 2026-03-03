@desktop
Feature: PIN Challenge (Re-auth Step-up)
  As an admin
  I want sensitive actions to require PIN re-verification
  So that even if someone gains access to my unlocked session, they cannot unmask PII

  Background:
    Given I am logged in as an admin

  Scenario: Phone unmask requires PIN challenge
    When I navigate to the "Volunteers" page
    And I click the phone visibility toggle
    Then I should see the PIN challenge dialog
    When I enter the correct PIN
    Then the PIN challenge dialog should close
    And I should see the unmasked phone number

  Scenario: Wrong PIN shows error, three failures wipes key
    When I navigate to the "Volunteers" page
    And I click the phone visibility toggle
    Then I should see the PIN challenge dialog
    When I enter a wrong PIN three times
    Then I should be redirected to the login page

  Scenario: Cancel PIN challenge closes dialog
    When I navigate to the "Volunteers" page
    And I click the phone visibility toggle
    Then I should see the PIN challenge dialog
    When I click "Cancel"
    Then the PIN challenge dialog should close
    And I should still be on the volunteers page
