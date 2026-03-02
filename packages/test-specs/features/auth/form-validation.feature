@android @ios @desktop
Feature: Form Validation
  As a user
  I want forms to validate input
  So that I don't submit invalid data

  Background:
    Given I am logged in as an admin

  Scenario: Volunteer form rejects invalid phone
    When I navigate to the "Volunteers" page
    And I click "Add Volunteer"
    And I fill in name with "Test"
    And I fill in phone with "+123"
    And I click "Save"
    Then I should see "invalid phone"

  Scenario: Volunteer form rejects phone without plus prefix
    When I navigate to the "Volunteers" page
    And I click "Add Volunteer"
    And I fill in name with "Test"
    And I fill in phone with "1234"
    And I click "Save"
    Then I should see "invalid phone"

  Scenario: Volunteer form accepts valid E.164 phone
    When I navigate to the "Volunteers" page
    And I click "Add Volunteer"
    And I fill in name with "Valid Phone Test"
    And I fill in a valid phone number
    And I click "Save"
    Then I should see the volunteer nsec

  Scenario: Ban form rejects invalid phone
    When I navigate to the "Ban List" page
    And I click "Ban Number"
    And I fill in phone with "+123"
    And I fill in reason with "Test reason"
    And I click "Save"
    Then I should see "invalid phone"

  Scenario: Login rejects nsec without nsec prefix
    When I log out
    And I click "Recovery Options"
    And I enter "npub1abc123" in the nsec field
    And I click "Log In"
    Then I should see "invalid"

  Scenario: Login rejects very short nsec
    When I log out
    And I click "Recovery Options"
    And I enter "nsec1short" in the nsec field
    And I click "Log In"
    Then I should see "invalid"

  Scenario: Bulk ban import validates phone format
    When I navigate to the "Ban List" page
    And I click "Import"
    And I paste invalid phone numbers in the textarea
    And I fill in reason with "Test reason"
    And I click "Submit"
    Then I should see "invalid phone"
