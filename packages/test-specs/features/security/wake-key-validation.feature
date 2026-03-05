@android @ios @crypto @security
Feature: Wake Key Validation
  As a device receiving push notifications
  I want wake key operations to be validated
  So that only well-formed payloads are accepted

  Scenario: Wake key generation produces valid 64-char hex public key
    When I generate a wake key
    Then the wake public key should be 64 hex characters
    And the wake key should be stored persistently
    And generating the wake key again should return the same key

  Scenario: Decryption rejects malformed ephemeral public key
    Given a wake key has been generated
    When I attempt to decrypt a wake payload with a malformed ephemeral key
    Then the decryption should return null

  Scenario: Decryption rejects truncated ciphertext
    Given a wake key has been generated
    When I attempt to decrypt a wake payload with truncated ciphertext
    Then the decryption should return null
