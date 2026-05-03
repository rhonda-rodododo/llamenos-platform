@backend @security @crypto
Feature: MLS Group Messaging
  As the hub state management system
  I want MLS handshake messages to be routed between devices
  So that hub-scoped group state is maintained via MLS

  Background:
    Given a registered user with a known keypair
    And a test hub exists

  @backend
  Scenario: Upload key packages for a device
    Given the user has a registered device "mls-device-1"
    When the user uploads 3 key packages for "mls-device-1"
    Then the response status is 204

  @backend
  Scenario: Fan-out a Commit to group members
    Given the user has a registered device "mls-device-1"
    When the user sends an MLS commit to device "mls-device-2"
    Then the response status is 204

  @backend
  Scenario: Deliver a Welcome to a new member
    Given the user has a registered device "mls-device-1"
    When the user sends an MLS welcome to device "mls-device-new"
    Then the response status is 204

  @backend
  Scenario: Fetch pending MLS messages
    Given the user has a registered device "mls-device-1"
    And an MLS commit was sent to "mls-device-1"
    When the user fetches MLS messages for "mls-device-1"
    Then the response status is 200
    And 1 MLS message is pending

  @backend
  Scenario: Fetch-and-clear semantics
    Given the user has a registered device "mls-device-1"
    And an MLS commit was sent to "mls-device-1"
    When the user fetches MLS messages for "mls-device-1"
    And the user fetches MLS messages for "mls-device-1" again
    Then 0 MLS messages are pending

  @backend
  Scenario: Missing deviceId query parameter returns 400
    When the user fetches MLS messages without a deviceId
    Then the response status is 400
