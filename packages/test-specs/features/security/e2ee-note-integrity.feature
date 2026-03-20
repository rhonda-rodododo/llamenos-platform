@backend @security @crypto
Feature: E2EE Note Integrity
  As the encryption system
  I want real ECIES encrypt-decrypt round-trips for notes
  So that note confidentiality is cryptographically verified end-to-end

  Scenario: Real ECIES encrypt-decrypt round-trip for notes
    Given a volunteer "IntegrityVol" with a real keypair
    And the admin keypair is known
    When the volunteer encrypts note content "Patient reported chest pain" with a random content key
    And the content key is ECIES-wrapped for the volunteer
    And the content key is ECIES-wrapped for the admin
    And the encrypted note is submitted via the API with real ciphertext and envelopes
    Then the API should return the note with the exact ciphertext
    When the volunteer unwraps their envelope and decrypts the note
    Then the decrypted plaintext should be "Patient reported chest pain"
    When the admin unwraps their envelope and decrypts the note
    Then the decrypted plaintext should be "Patient reported chest pain"

  Scenario: Third-party volunteer cannot decrypt another's note
    Given a volunteer "VolA" with a real keypair
    And a volunteer "VolB" with a real keypair
    And the admin keypair is known
    When volunteer "VolA" encrypts note content "Confidential VolA data" with envelopes for themselves and the admin
    And the encrypted note is submitted via the API by "VolA"
    And volunteer "VolB" fetches the note
    Then volunteer "VolB" should see the ciphertext
    But volunteer "VolB" should have no envelope for their pubkey
    And attempting to unwrap with "VolB" secret key should fail

  Scenario: Multi-admin envelope - both admins can decrypt
    Given a volunteer "MultiAdminVol" with a real keypair
    And admin "AdminA" with a real keypair
    And admin "AdminB" with a real keypair
    When the volunteer encrypts note content "Multi-admin secret" with envelopes for both admins
    And the encrypted note is submitted via the API with both admin envelopes
    Then admin "AdminA" can unwrap their envelope and decrypt to "Multi-admin secret"
    And admin "AdminB" can unwrap their envelope and decrypt to "Multi-admin secret"
    And the two admin wrapped keys should be different

  Scenario: Note content survives JSONB storage round-trip
    Given a volunteer "StorageVol" with a real keypair
    And the admin keypair is known
    When the volunteer encrypts note content "Storage fidelity test" with real crypto
    And the encrypted note is submitted via the API with real envelopes
    Then the note ID should be returned
    When the note row is fetched directly from the database
    Then the DB encrypted_content column should match the submitted ciphertext exactly
    And the DB admin_envelopes JSONB should be a proper array not a string
    And the DB author_envelope JSONB should be a proper object not a string
    When the ciphertext from the DB is decrypted with the original content key
    Then the decrypted plaintext should be "Storage fidelity test"
