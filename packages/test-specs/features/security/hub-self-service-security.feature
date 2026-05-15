@backend @security @hub-selfservice
Feature: Hub Self-Service Security
  As a security-conscious admin
  I want hub self-service endpoints to enforce strict isolation and zero-knowledge
  So that cross-hub credential access is impossible and super-admins cannot read secrets

  Scenario: Cross-hub credential access attempt is denied
    Given I am a hub admin for hub "hub-a"
    And provider "twilio" is configured for hub "hub-a"
    When I attempt to GET provider status for hub "hub-b"
    Then the response is 403

  Scenario: Tampered hubId in request body vs auth context is denied
    Given I am a hub admin for hub "hub-a"
    When I POST to onboard hub "hub-b" with tampered hubId
    Then the response is 403

  Scenario: Super-admin cannot read hub credentials via any API path
    Given I am a super admin
    And provider "twilio" is configured for hub "test-hub"
    When I GET provider status for hub "test-hub"
    Then the response is 200
    And the response does not contain decrypted credentials

  Scenario: OAuth state is bound to hubId
    Given I am a hub admin for hub "test-hub"
    When I start OAuth for provider "twilio" under hub "test-hub"
    Then the OAuth state contains hubId "test-hub"

  Scenario: Template credential hints contain no real secrets
    Given I am a super admin
    When I create a provider template with credentialHints containing a secret
    Then the response is 400
    And the error mentions credential hint validation

  Scenario: Sub-account provisioning does not expose master credentials
    Given I am a hub admin for hub "test-hub"
    And a master provider config exists for hub "test-hub"
    When I provision a sub-account from the master config
    Then the response contains subAccountId
    And the response does not contain master credentials
