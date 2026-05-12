@backend
Feature: Hub Onboarding and Provider Templates
  As a hub admin
  I want to onboard my hub with provider templates and manage channels
  So that my hub can receive calls and messages

  Background:
    Given I am a hub admin
    And a hub "test-hub" exists

  Scenario: Hub admin starts onboarding with template
    Given a provider template "twilio-hotline" exists with channels "voice,sms"
    When I POST to start onboarding for hub "test-hub" with template "twilio-hotline"
    Then the onboarding response is 200
    And the onboarding state has currentStep "template_selection"
    And the channelConfig has voice enabled
    And the channelConfig has sms enabled

  Scenario: Hub admin starts onboarding from scratch
    When I POST to start onboarding for hub "test-hub" without template
    Then the onboarding response is 200
    And the onboarding state has currentStep "template_selection"
    And all channels are disabled

  Scenario: Hub admin completes all onboarding steps
    Given onboarding is started for hub "test-hub"
    When I complete step "template_selection"
    And I complete step "channel_selection"
    And I complete step "provider_connection"
    And I complete step "phone_number"
    And I complete step "channel_setup"
    Then the onboarding is marked complete
    And hub settings has providerSetupComplete true

  Scenario: Hub admin enables and disables channels
    Given onboarding is complete for hub "test-hub"
    When I PUT to enable channel "signal" for hub "test-hub"
    Then the channel config has signal enabled
    When I PUT to disable channel "signal" for hub "test-hub"
    Then the channel config has signal disabled

  Scenario: User with system:create-hub creates own hub
    Given I have permission "system:create-hub"
    When I POST to create hub "my-hub"
    Then the hub creation response is 201
    And I am hub admin for "my-hub"

  Scenario: User without system:create-hub cannot create hubs
    Given I do not have permission "system:create-hub"
    When I POST to create hub "my-hub"
    Then the response is 403

  Scenario: Super-admin CRUD on provider templates
    Given I am a super admin
    When I POST to create provider template "test-template"
    Then the template creation response is 201
    When I GET provider template "test-template"
    Then the template response is 200
    When I PUT to update provider template "test-template"
    Then the update response is 200
    When I DELETE provider template "test-template"
    Then the deactivate response is 200

  Scenario: Quota enforcement blocks phone number provisioning
    Given hub "test-hub" has quota maxPhoneNumbers set to 1
    And hub "test-hub" already has 1 phone number
    When I attempt to provision another phone number
    Then the provisioning is blocked by quota

  Scenario: Hub admin switches provider
    Given provider "twilio" is configured for hub "test-hub"
    When I POST to switch provider to "signalwire" for hub "test-hub"
    Then the old provider config is deleted
    And a new provider config for "signalwire" exists
