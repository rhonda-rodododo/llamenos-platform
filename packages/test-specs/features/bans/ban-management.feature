@android @ios @desktop
Feature: Ban Management
  As an admin
  I want to manage a ban list of phone numbers
  So that abusive callers can be blocked

  Background:
    Given I am logged in as an admin
    And I navigate to the "Ban List" page

  Scenario: Ban list page loads with heading and buttons
    Then I should see the "Ban List" heading
    And I should see a "Ban Number" button
    And I should see an "Import Ban" button

  Scenario: Ban list shows bans or empty state
    Then I should see bans or the "No banned numbers" message

  Scenario: Add ban with phone and reason
    When I click the "Ban Number" button
    And I fill in the phone number
    And I fill in the reason with "Spam caller"
    And I click "Save"
    Then the phone number should appear in the ban list
    And I should see "Spam caller"

  Scenario: Ban shows date
    When I add a ban with reason "Date check"
    Then the ban entry should contain the current year

  Scenario: Remove ban with confirmation
    Given a ban exists
    When I click "Remove" on the ban
    Then I should see a confirmation dialog
    When I click "Unban" in the dialog
    Then the dialog should close
    And the ban should no longer appear in the list

  Scenario: Cancel ban removal
    Given a ban exists
    When I click "Remove" on the ban
    Then I should see a confirmation dialog
    When I click "Cancel" in the dialog
    Then the dialog should close
    And the ban should still appear in the list

  Scenario: Cancel add ban form
    When I click the "Ban Number" button
    Then the phone number input should be visible
    When I click "Cancel"
    Then the phone number input should not be visible

  Scenario: Phone validation rejects invalid numbers
    When I click the "Ban Number" button
    And I fill in the phone number with "+12"
    And I click "Save"
    Then I should see "invalid phone"

  Scenario: Multiple bans display in list
    When I add two bans with different phone numbers
    Then both phone numbers should appear in the ban list
    And both ban reasons should be visible

  Scenario: Bulk import form opens and closes
    When I click the "Import Ban" button
    Then I should see "Paste phone numbers"
    When I click "Cancel"
    Then I should not see "Paste phone numbers"

  Scenario: Bulk import adds multiple bans
    When I click the "Import Ban" button
    And I paste two phone numbers in the textarea
    And I fill in the reason with "Bulk ban reason"
    And I click "Submit"
    Then both phone numbers should appear in the ban list

  Scenario: Bulk import rejects invalid phones
    When I click the "Import Ban" button
    And I paste invalid phone numbers in the textarea
    And I click "Submit"
    Then I should see "invalid phone"

  Scenario: Volunteer cannot access ban list
    Given a volunteer exists
    When the volunteer logs in and navigates to "/bans"
    Then they should see "Access Denied"
