@backend @security
Feature: Client-reported security events
  Clients that detect a TLS certificate pin mismatch cannot authenticate (the
  failure happens before login), so they report it to an unauthenticated
  endpoint. The report must reach admins, carry no IP or device identifier,
  and be bounded against abuse.

  @backend
  Scenario: A client reports a certificate pin mismatch without authenticating and an admin sees it
    When an unauthenticated client reports a certificate pin mismatch
    Then the response status is 202
    And an admin can see the reported certificate pin mismatch in the security events
    And the reported event carries no device or IP identifier

  @backend
  Scenario: A client report with an unknown field is rejected
    When an unauthenticated client reports a certificate pin mismatch with an extra "device_id" field
    Then the response status is 400

  @backend
  Scenario: A client cannot report an event type other than a certificate pin mismatch
    When an unauthenticated client reports a "login_failed" event
    Then the response status is 400

  @backend
  Scenario: A client report with too many events is rejected
    When an unauthenticated client reports 21 certificate pin mismatch events in one request
    Then the response status is 400

  @backend
  Scenario: A client report with an oversized string is rejected
    When an unauthenticated client reports a certificate pin mismatch with a 200 character app version
    Then the response status is 400

  @backend
  Scenario: A client report with an oversized body is rejected
    When an unauthenticated client reports a certificate pin mismatch with a 20000 byte padding field
    Then the response status is 413

  @backend
  Scenario: Client security event submissions are rate limited per IP
    When an unauthenticated client submits 7 certificate pin mismatch reports from the same IP
    Then the submissions before the limit succeed and a later submission is rejected with 429
