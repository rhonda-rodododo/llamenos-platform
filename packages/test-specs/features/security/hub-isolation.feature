@backend @security
Feature: Multi-Hub Isolation
  As a security-conscious admin
  I want complete data separation between hubs
  So that hub A admins cannot see or affect hub B data

  Background:
    Given hub "hub-a" exists with admin "admin-a"
    And hub "hub-b" exists with admin "admin-b"

  Scenario: Hub A admin cannot see Hub B provider config
    Given provider "twilio" is configured for hub "hub-a"
    When "admin-b" GETs provider status for hub "hub-b"
    Then the response does not contain hub-a config

  Scenario: Hub A provisioned number does not appear in Hub B
    Given a phone number is provisioned for hub "hub-a"
    When "admin-b" lists phone numbers for hub "hub-b"
    Then the number list does not contain hub-a number

  Scenario: Hub A channel config does not affect Hub B
    Given channel "signal" is enabled for hub "hub-a"
    When "admin-b" gets channel config for hub "hub-b"
    Then signal is not enabled for hub "hub-b"

  Scenario: Hub A usage stats do not include Hub B activity
    Given hub "hub-a" has 10 SMS sent
    And hub "hub-b" has 5 SMS sent
    When "admin-a" gets usage for hub "hub-a"
    Then the usage shows 10 SMS
    And does not show 5 SMS

  Scenario: Hub admin without manage-instance cannot create templates
    Given "admin-a" has permission "telephony:manage-providers"
    And "admin-a" does not have permission "system:manage-instance"
    When "admin-a" POSTs to create a provider template
    Then the response is 403

  Scenario: Tampered hubId in request is rejected
    Given "admin-a" is authenticated for hub "hub-a"
    When "admin-a" sends a request with hubId "hub-b" in the body
    Then the response is 403

  Scenario: Hub deactivation does not affect other hubs
    Given provider "twilio" is configured for hub "hub-a"
    And provider "twilio" is configured for hub "hub-b"
    When hub "hub-a" is deactivated
    Then provider config for hub "hub-b" still exists

  Scenario: Super-admin aggregate view shows operational status without credentials
    Given I am a super admin
    And provider "twilio" is configured for hub "hub-a"
    And provider "signalwire" is configured for hub "hub-b"
    When I GET provider status for all hubs
    Then I see operational status for both hubs
    And I do not see any credentials
