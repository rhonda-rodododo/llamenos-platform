@backend @security @crypto
Feature: PUK Rotation
  As the key management system
  I want per-user key envelopes distributed to each device
  So that key rotation re-wraps secrets without trusting the server

  Background:
    Given a registered user with a known keypair

  @backend
  Scenario: Distribute PUK envelopes to a single device
    Given the user has a registered device "device-alpha"
    When the user distributes PUK envelopes for generation 0
    Then the response status is 201
    And 1 PUK envelope is stored

  @backend
  Scenario: Retrieve the latest PUK envelope for a device
    Given the user has a registered device "device-alpha"
    And PUK envelopes are distributed for generation 0
    When the user fetches the PUK envelope for "device-alpha"
    Then the response status is 200
    And the PUK envelope generation is 0

  @backend
  Scenario: Higher generation supersedes previous
    Given the user has a registered device "device-alpha"
    And PUK envelopes are distributed for generation 0
    And PUK envelopes are distributed for generation 1
    When the user fetches the PUK envelope for "device-alpha"
    Then the PUK envelope generation is 1

  @backend
  Scenario: Distribute envelopes for multiple devices
    Given the user has a registered device "device-alpha"
    And the user has a registered device "device-beta"
    When the user distributes PUK envelopes for generation 0 to all devices
    Then the response status is 201
    And 2 PUK envelopes are stored

  @backend
  Scenario: No envelope found for unknown device
    When the user fetches the PUK envelope for "nonexistent-device"
    Then the response status is 404
