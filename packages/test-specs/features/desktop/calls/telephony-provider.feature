@desktop
Feature: Telephony Provider Configuration
  As an admin
  I want to configure telephony provider credentials
  So that the hotline can make and receive calls

  Background:
    Given I am logged in as an admin

  Scenario: Display Twilio settings form
    When I navigate to the "Hub Settings" page
    And I expand the telephony provider section
    Then I should see the Twilio credentials form
    And I should see fields for Account SID, Auth Token, and TwiML App SID

  Scenario: Save Twilio credentials
    When I navigate to the telephony settings
    And I fill in valid Twilio credentials
    And I click "Save Provider"
    Then I should see a success message

  Scenario: Test connection shows result
    When I navigate to the telephony settings
    And I fill in Twilio credentials
    And I click "Test Connection"
    Then I should see either a success or error result

  Scenario: Invalid credentials show error
    When I navigate to the telephony settings
    And I fill in invalid Twilio credentials
    And I click "Test Connection"
    Then I should see a connection error

  Scenario: Switch between providers
    When I navigate to the telephony settings
    Then I should see available provider options
    And Twilio should be selected by default
