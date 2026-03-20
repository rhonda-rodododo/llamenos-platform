@backend
Feature: Real-Time Relay Event Delivery
  The Nostr relay must deliver server-published events to subscribers.
  Every state mutation that publishes a Nostr event must result in
  the event arriving at the relay within 5 seconds.

  Background:
    And 1 volunteers are on shift
    And the test relay is connected and capturing events

  # --- Call Events ---

  @relay @calls
  Scenario: Incoming call publishes KIND_CALL_RING to relay
    When an incoming call arrives from a unique number
    Then the relay should receive a kind 1000 event within 5 seconds
    And the decrypted event content type should be "call:ring"
    And the event should contain a "callId" field

  @relay @calls
  Scenario: Answering a call publishes KIND_CALL_UPDATE to relay
    Given an incoming call is ringing
    When the first volunteer answers the call
    Then the relay should receive a kind 1001 event within 5 seconds
    And the decrypted event content type should be "call:update"
    And the event content "status" should be "in-progress"

  @relay @calls
  Scenario: Ending a call publishes KIND_CALL_UPDATE with completed status
    Given an incoming call is ringing
    And the first volunteer answers the call
    And the relay captured events are cleared
    When the active call is ended
    Then the relay should receive a kind 1001 event within 5 seconds
    And the decrypted event content type should be "call:update"
    And the event content "status" should be "completed"

  @relay @calls
  Scenario: Voicemail publishes KIND_CALL_VOICEMAIL to relay
    Given an incoming call is ringing
    When the call goes to voicemail
    Then the relay should receive a kind 1002 event within 5 seconds
    And the decrypted event content type should be "voicemail:new"

  # --- Presence Events ---

  @relay @presence
  Scenario: Answering a call publishes presence update to relay
    Given an incoming call is ringing
    When the first volunteer answers the call
    Then the relay should receive a kind 20000 event within 5 seconds
    And the decrypted event content type should be "presence:summary"

  # --- Messaging Events ---

  @relay @messaging
  Scenario: Inbound message publishes KIND_MESSAGE_NEW to relay
    When an inbound SMS message arrives from a unique number
    Then the relay should receive a kind 1010 event within 5 seconds
    And the decrypted event content type should be "message:new"
    And the event should contain a "conversationId" field

  # --- Event Encryption ---

  @relay @security
  Scenario: All relay events are encrypted with the server event key
    When an incoming call arrives from a unique number
    Then the relay should receive a kind 1000 event within 5 seconds
    And the raw event content should NOT be valid JSON
    And the decrypted event content should be valid JSON

  # --- Event Structure ---

  @relay
  Scenario: All relay events have the llamenos:event tag
    When an incoming call arrives from a unique number
    Then the relay should receive a kind 1000 event within 5 seconds
    And the event should have tag "t" with value "llamenos:event"
    And the event should have tag "d" with value "global"

  @relay
  Scenario: All relay events are signed by the server pubkey
    When an incoming call arrives from a unique number
    Then the relay should receive a kind 1000 event within 5 seconds
    And the event signature should be valid
    And the event pubkey should match the server's configured pubkey
