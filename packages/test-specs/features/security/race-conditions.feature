@backend @security @concurrency
Feature: Race condition prevention
  As the security system
  I want to prevent race conditions in concurrent operations
  So that data integrity is maintained under parallel access

  # RACE-01
  @backend
  Scenario: Concurrent invite redemption only creates one volunteer
    Given an admin creates an invite code for race testing
    When two users simultaneously redeem the same invite code
    Then exactly one redemption succeeds
    And one redemption returns an error

  # RACE-02
  @backend
  Scenario: Concurrent MLS message fetch returns messages to only one caller
    Given MLS messages are queued for a test device
    When two requests simultaneously fetch MLS messages for that device
    Then the combined message count across both responses equals the original count
    And no messages are duplicated between responses

  # RACE-03
  @backend @wip
  Scenario: Concurrent provision room consumption succeeds for only one caller
    Given a provision room has an encrypted payload
    When two requests simultaneously poll the provision room
    Then exactly one response contains the encrypted payload

  # RACE-04
  @backend
  Scenario: Concurrent blast send only transitions once
    Given a draft blast exists with subscribers
    When two requests simultaneously send the blast
    Then exactly one send succeeds
    And the other returns an error

  # RACE-05
  @backend
  Scenario: Concurrent device registrations respect max device limit
    Given a user has 4 registered devices
    When two new devices register simultaneously for the user
    Then the user has at most 5 devices

  # RACE-08
  @backend
  Scenario: WebAuthn challenge cannot be consumed twice
    Given a WebAuthn challenge is stored
    When two requests simultaneously consume the challenge
    Then exactly one consumption succeeds
    And the other returns not found

  # RACE-09
  @backend @wip
  Scenario: Concurrent bulk imports handle overlapping identifiers
    Given a hub with existing subscribers
    When two bulk imports with overlapping identifiers run simultaneously
    Then no duplicate subscribers are created
