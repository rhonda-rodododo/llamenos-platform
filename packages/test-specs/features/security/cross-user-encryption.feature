@backend @security @crypto
Feature: Cross-User Encryption Boundaries
  As the E2EE system
  I want to verify that encryption prevents cross-user data access
  So that note confidentiality holds even when users share a hub

  # ── Positive paths: authorized decryption ─────────────────────

  Scenario: Volunteer decrypts own note (positive path)
    Given a volunteer "OwnerVol" with a real keypair
    And the admin keypair is known
    When "OwnerVol" creates an encrypted note "Private crisis note" with their own envelope and admin envelope
    Then the note is stored on the server
    When "OwnerVol" retrieves the note as the author
    And "OwnerVol" decrypts their note using their own envelope
    Then the decrypted note content should be "Private crisis note"

  Scenario: Admin decrypts volunteer note via admin envelope (positive path)
    Given a volunteer "VolWithAdmin" with a real keypair
    And the admin keypair is known
    When "VolWithAdmin" creates an encrypted note "Admin-readable note" with their own envelope and admin envelope
    Then the note is stored on the server
    When the admin retrieves the note via notes:read-all
    And the admin decrypts the note using the admin envelope
    Then the decrypted note content should be "Admin-readable note"

  # ── Negative paths: unauthorized decryption ──────────────────

  Scenario: Same-hub reviewer cannot decrypt another volunteer's note
    Given a volunteer "AuthorVol" with a real keypair
    And a reviewer "ReviewerUser" with a real keypair
    And the admin keypair is known
    When "AuthorVol" creates an encrypted note "Reviewer should not read this" with their own envelope and admin envelope
    Then the note is stored on the server
    When "ReviewerUser" fetches the author's note via direct API access as an authorized reader
    Then "ReviewerUser" receives the encrypted blob
    But "ReviewerUser" has no HPKE envelope for their key
    And "ReviewerUser" cannot decrypt the note with their private key

  Scenario: Hub admin reads all notes but cannot decrypt without envelope
    Given a volunteer "SecretVol" with a real keypair
    And a hub admin "HubAdminUser" with a real keypair
    And the admin keypair is known
    When "SecretVol" creates an encrypted note "Hub admin cannot decrypt this" with their own envelope and admin envelope
    Then the note is stored on the server
    When "HubAdminUser" fetches notes via notes:read-all
    Then "HubAdminUser" can see the encrypted note blob
    But "HubAdminUser" has no HPKE envelope for their key
    And "HubAdminUser" cannot decrypt the note with their private key

  Scenario: Admin-created note cannot be decrypted by a volunteer
    Given a volunteer "CannotReadVol" with a real keypair
    And the admin keypair is known
    When the admin creates an encrypted note "Admin-only note content" with only the admin envelope
    Then the note is stored on the server
    When "CannotReadVol" retrieves notes visible to them
    Then "CannotReadVol" does not see the admin's note in their list
    And any attempt to decrypt the admin note ciphertext with "CannotReadVol" key should fail

  # ── HPKE cryptographic isolation ──────────────────────────────

  Scenario: HPKE decryption fails when wrong private key is used
    Given a volunteer "RightVol" with a real keypair
    And a volunteer "WrongVol" with a real keypair
    And the admin keypair is known
    When "RightVol" creates an encrypted note "Wrong-key test" with their own envelope and admin envelope
    Then the note is stored on the server
    When "WrongVol" attempts HPKE unwrap of "RightVol"'s author envelope
    Then the HPKE operation should throw a decryption error

  Scenario: Each recipient's wrapped key is cryptographically distinct
    Given a volunteer "KeyDistinctVol" with a real keypair
    And a hub admin "KeyDistinctAdmin" with a real keypair
    And the admin keypair is known
    When "KeyDistinctVol" creates an encrypted note "Distinct keys test" with their own envelope and admin envelope
    Then the note is stored on the server
    And the author envelope ciphertext differs from the admin envelope ciphertext
    And both envelopes encrypt the same content key but are cryptographically independent
