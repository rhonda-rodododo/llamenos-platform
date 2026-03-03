@backend
Feature: Auth Token Verification
  As the server
  I want to verify authentication tokens
  So that only authorized users can access protected endpoints

  Scenario: Valid Schnorr-signed token is accepted
    Given a user with a valid keypair
    When the user creates a signed auth token
    Then the server should verify the token successfully

  Scenario: Expired token is rejected
    Given a user with a valid keypair
    When the user presents a token older than 5 minutes
    Then the server should reject the token with 401

  Scenario: Token with invalid signature is rejected
    Given a tampered auth token
    When the token is presented to the server
    Then the server should reject the token with 401

  Scenario: Token with wrong pubkey is rejected
    Given a token signed by an unregistered pubkey
    When the token is presented to the server
    Then the server should reject the token with 403

  Scenario: Session token validates WebAuthn credential
    Given a user with a registered WebAuthn credential
    When the user presents a valid session token
    Then the server should accept the session

  Scenario: Missing Authorization header returns 401
    When a request is made without any auth header
    Then the server should respond with 401
