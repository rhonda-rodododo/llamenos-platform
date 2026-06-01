@backend
Feature: Provider Setup OAuth Flow
  As an admin
  I want to configure telephony providers via OAuth
  So that I can securely authorize provider access without storing static credentials

  Scenario: Admin starts OAuth flow for a supported provider
    Given I am a provider setup admin
    When I POST to start OAuth for provider "twilio" with redirect URL "llamenos://oauth/callback"
    Then the OAuth start response is 200
    And the response contains an authUrl
    And the response contains a stateId
    And the response contains an expiresAt

  Scenario: OAuth callback with expired state is rejected
    Given a provider OAuth state token has expired
    When I POST the OAuth callback with that expired state token
    Then the provider setup response is 400

  Scenario: OAuth callback with unknown state is rejected
    When I POST the OAuth callback with an unknown state token "deadbeef"
    Then the provider setup response is 400

  Scenario: OAuth callback with reused state is rejected
    Given I am a provider setup admin
    And a provider OAuth flow has been started for "twilio" with redirect "llamenos://oauth/callback"
    And the provider OAuth flow has already been consumed
    When I POST the OAuth callback with the same state token again
    Then the provider setup response is 400

  Scenario: Admin can poll OAuth status for pending state
    Given I am a provider setup admin
    And a provider OAuth flow has been started for "twilio" with redirect "llamenos://oauth/callback"
    When I GET the OAuth status for that state token
    Then the OAuth status response is 200
    And the OAuth status is "pending"
    And the OAuth provider is "twilio"

  Scenario: OAuth status returns 404 for unknown state
    Given I am a provider setup admin
    When I GET the OAuth status for state "unknownstate123"
    Then the OAuth status response is 404

  Scenario: Non-admin cannot start OAuth flow
    Given I am a provider setup volunteer
    When I POST to start OAuth for provider "twilio" with redirect URL "llamenos://oauth/callback"
    Then the provider setup response is 403

  Scenario: Unsupported provider OAuth returns error
    Given I am a provider setup admin
    When I POST to start OAuth for provider "asterisk" with redirect URL "llamenos://oauth/callback"
    Then the provider setup response is 400
