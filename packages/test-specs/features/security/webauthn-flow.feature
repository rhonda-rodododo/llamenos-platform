@backend @security
Feature: WebAuthn Flow
  As a user with a hardware security key or passkey
  I want to register and authenticate via WebAuthn
  So that I have phishing-resistant multi-factor authentication

  @backend
  Scenario: Generate registration options
    Given a registered user with a known keypair
    When the user requests WebAuthn registration options
    Then the response status is 200
    And the registration options contain a challenge

  @backend
  Scenario: List credentials returns empty for new user
    Given a registered user with a known keypair
    When the user lists their WebAuthn credentials
    Then the response status is 200
    And 0 WebAuthn credentials are listed

  @backend
  Scenario: Generate login options (public endpoint)
    When a client requests WebAuthn login options
    Then the response status is 200
    And the login options contain a challenge

  @backend
  Scenario: Login verify rejects invalid assertion
    When a client requests WebAuthn login options
    And the client submits a fabricated login assertion
    Then the response status is 401

  @backend
  Scenario: Login options are rate limited
    When a client floods WebAuthn login options 15 times
    Then at least one response is 429
