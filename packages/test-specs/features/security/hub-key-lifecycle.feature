@backend @security @crypto
Feature: Hub Key Lifecycle
  As the encryption system
  I want hub keys to be securely distributed and rotated
  So that only current members can decrypt hub-encrypted data

  # ── Key Distribution ─────────────────────────────────────────────

  Scenario: Hub key distributed to all members
    Given a hub with 3 members: "Alice", "Bob", and "Carol"
    When the admin sets hub key envelopes for all 3 members
    Then "Alice" should be able to fetch their hub key envelope
    And "Bob" should be able to fetch their hub key envelope
    And "Carol" should be able to fetch their hub key envelope
    And each envelope should be unique per member

  # ── Revocation on Removal ────────────────────────────────────────

  Scenario: Removed member loses hub key access
    Given a hub with 3 members: "Alice", "Bob", and "Carol"
    And hub key envelopes are set for all 3 members
    When "Carol" is removed from the hub
    And the admin updates hub key envelopes for "Alice" and "Bob" only
    Then "Alice" should be able to fetch their hub key envelope
    And "Bob" should be able to fetch their hub key envelope
    And "Carol" should receive 404 when fetching their hub key envelope

  # ── Key Rotation ─────────────────────────────────────────────────

  Scenario: Hub key rotation on member departure
    Given a hub with 3 members: "Alice", "Bob", and "Carol"
    And hub key envelopes are set for all 3 members
    When "Carol" is removed from the hub
    And a new hub key is generated and wrapped for remaining members only
    Then "Alice"'s new envelope should differ from the original
    And "Bob"'s new envelope should differ from the original
    And the new envelopes should contain exactly 2 entries
