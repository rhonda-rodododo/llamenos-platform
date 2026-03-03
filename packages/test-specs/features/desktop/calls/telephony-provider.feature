@desktop
Feature: Telephony Provider Configuration
  As an admin
  I want to configure telephony provider credentials
  So that the hotline can make and receive calls

  Background:
    Given I am logged in as an admin
    And I navigate to the "Hub Settings" page

  Scenario: Telephony provider section is visible and collapsed by default
    Then I should see "Telephony Provider"

  Scenario: Shows env fallback message when no provider configured
    When I expand the "Telephony Provider" section
    Then I should see "using environment variable defaults"

  Scenario: Provider dropdown shows all providers
    When I expand the "Telephony Provider" section
    Then the provider dropdown should have 5 options
    And the provider options should be Twilio, SignalWire, Vonage, Plivo, and Asterisk

  Scenario: Changing provider updates credential form fields
    When I expand the "Telephony Provider" section
    Then I should see "Account SID"
    And I should see "Auth Token"
    And I should not see "SignalWire Space"
    When I switch the provider to "signalwire"
    Then I should see "SignalWire Space"
    When I switch the provider to "vonage"
    Then I should see "API Key"
    And I should see "API Secret"
    And I should see "Application ID"
    And I should not see "Account SID"
    When I switch the provider to "plivo"
    Then I should see "Auth ID"
    When I switch the provider to "asterisk"
    Then I should see "ARI URL"
    And I should see "ARI Username"
    And I should see "ARI Password"
    And I should see "Bridge Callback URL"

  Scenario: Save button disabled when phone number is empty
    When I expand the "Telephony Provider" section
    Then the "Save Provider" button should be disabled

  Scenario: Admin can save Twilio provider config
    When I expand the "Telephony Provider" section
    And I fill in Twilio credentials with phone number
    And I click "Save Provider"
    Then I should see "Telephony provider saved"
    And I should see "Current provider" with "Twilio"

  Scenario: Saved provider config persists after page reload
    When I expand the "Telephony Provider" section
    And I fill in Twilio credentials with a different phone number
    And I click "Save Provider"
    Then I should see "Telephony provider saved"
    When I reload and re-authenticate
    And I navigate to the "Hub Settings" page
    And I expand the "Telephony Provider" section
    Then I should see "Current provider"
    And the phone number field should be pre-filled
    And the Account SID field should be pre-filled

  Scenario: Admin can save SignalWire provider config
    When I expand the "Telephony Provider" section
    And I switch the provider to "signalwire"
    And I fill in SignalWire credentials
    And I click "Save Provider"
    Then I should see "Telephony provider saved"
    And I should see "Current provider" with "SignalWire"

  Scenario: Test connection button works with fake credentials
    When I expand the "Telephony Provider" section
    And I fill in fake Twilio credentials
    And I click "Test Connection"
    Then I should see "Testing..."
    And I should see "Connection failed"

  Scenario: Deep link to telephony-provider section auto-expands it
    When I navigate to "/admin/settings?section=telephony-provider"
    Then the provider dropdown should be visible
