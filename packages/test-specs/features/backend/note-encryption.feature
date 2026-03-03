@backend
Feature: Note Encryption
  As the records system
  I want to handle encrypted note envelopes
  So that note content is never stored in plaintext

  Scenario: Note envelope has per-note random key
    Given a new note is created
    Then the envelope should contain a unique random symmetric key

  Scenario: Note key is ECIES-wrapped for volunteer
    Given a note created by a volunteer
    Then the envelope should contain the key wrapped for the volunteer's pubkey

  Scenario: Note key is ECIES-wrapped for each admin
    Given a hub with 3 admins
    When a note is created
    Then the envelope should contain 3 admin key wraps

  Scenario: Note content is encrypted with XChaCha20-Poly1305
    Given an encrypted note envelope
    Then the ciphertext should be decryptable with the correct symmetric key

  Scenario: Forward secrecy through unique keys
    Given two notes created by the same volunteer
    Then each note should have a different symmetric key

  Scenario: Envelope format matches protocol specification
    Given an encrypted note envelope
    Then it should contain version, nonce, ciphertext, and reader keys fields
