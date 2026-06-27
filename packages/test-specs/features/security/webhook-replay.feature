@backend
Feature: Webhook replay protection
  Webhooks from telephony and messaging providers must not be replayable.
  Replayed webhooks return idempotent 200 OK to support provider retries.

  Scenario: Webhook with wrong Content-Type is rejected
    Given a configured telephony provider expecting form-encoded content
    And a webhook with Content-Type "application/json"
    When the webhook is delivered
    Then the response status should be 403

  Scenario: Webhook from non-allowlisted IP is rejected
    Given IP allowlisting is enabled for provider "TWILIO"
    And the request comes from IP "1.2.3.4"
    When the webhook is delivered
    Then the response status should be 403

  Scenario: Replayed webhook payload returns idempotent 200
    Given a webhook payload "CallSid=replay-test-123&From=%2B15551234567"
    When the webhook is delivered twice with the same payload
    Then the second response status should be 200
