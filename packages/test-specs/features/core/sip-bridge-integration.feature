@backend @integration @telephony @sip
Feature: SIP Bridge Integration
  As the Asterisk/SIP telephony bridge
  I want to route inbound calls through the ARI adapter to the app
  So that calls over SIP reach on-shift volunteers and are properly tracked

  # ── Inbound Call Routing ─────────────────────────────────────────

  Scenario: Inbound call via SIP bridge creates call event
    Given 1 volunteers are on shift
    When an inbound SIP call arrives from "+15553330000"
    Then a call event should be created with status "ringing"
    And the call should have a unique call ID

  Scenario: Parallel ring reaches multiple volunteers
    Given 3 volunteers are on shift
    When an inbound SIP call arrives from "+15553330001"
    Then a call ring Nostr event should be published
    And the call status should be "ringing"

  Scenario: Call answered terminates other ringing channels
    Given 2 volunteers are on shift
    And an inbound SIP call arrives from "+15553330002"
    When a volunteer answers the call
    Then the call status should be "in-progress"
    And the call should be assigned to the answering volunteer

  Scenario: DTMF gather collects digits
    Given an inbound SIP call with IVR in progress
    When DTMF digits "1234" are received
    Then the digits should be recorded on the call
    And the call flow should continue

  Scenario: Call recording starts and completes
    Given an inbound SIP call arrives from "+15553330003"
    When the call is answered and recording starts
    Then the recording should have a non-empty URL or reference
    And the call metadata should include recording info

  Scenario: SIP bridge health check returns healthy
    When the SIP bridge health endpoint is requested
    Then the response status should be 200

  # ── Call Lifecycle ────────────────────────────────────────────────

  Scenario: Unanswered SIP call routes to voicemail
    Given no volunteers are on shift
    When an inbound SIP call arrives from "+15553330004"
    And the call rings with no answer
    Then the call status should be "unanswered"

  Scenario: Call ended by caller updates call status
    Given 1 volunteers are on shift
    And an inbound SIP call arrives from "+15553330005"
    And a volunteer answers the call
    When the caller disconnects
    Then the call status should be "completed"
