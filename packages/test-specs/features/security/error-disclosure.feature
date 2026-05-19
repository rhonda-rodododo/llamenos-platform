@backend
Feature: Error disclosure prevention
  Error responses must not leak internal details, stack traces, or failure reasons.
  All authentication failures must return the same generic error body regardless of failure mode.

  # ─── Authentication error uniformity ────────────────────────────────────────

  Scenario: Auth failure with malformed Bearer token returns 401
    Given a request with auth header "Bearer {not-json}"
    When the request is sent to a protected endpoint
    Then the response status should be 401
    And the response body should be exactly '{"error":"Authentication failed"}'

  Scenario: Auth failure with expired token returns 401
    Given a request with an expired auth token
    When the request is sent to a protected endpoint
    Then the response status should be 401
    And the response body should be exactly '{"error":"Authentication failed"}'

  Scenario: Auth failure with unknown pubkey returns same error
    Given a request with an auth token for an unknown pubkey
    When the request is sent to a protected endpoint
    Then the response status should be 401
    And the response body should be exactly '{"error":"Authentication failed"}'

  Scenario: Auth failure with missing Authorization header returns 401
    Given a request with no Authorization header
    When the request is sent to a protected endpoint
    Then the response status should be 401
    And the response body should be exactly '{"error":"Authentication failed"}'

  # ─── Server error containment ────────────────────────────────────────────────

  Scenario: Unhandled server error returns generic 500 without stack trace
    Given I am authenticated as admin
    When a request triggers an unhandled server error
    Then the response status should be 500
    And the response body should be exactly '{"error":"Internal server error"}'
    And the response should not contain any stack trace

  # ─── SIP bridge error disclosure ────────────────────────────────────────────
  # Note: Since Epic E, webhook endpoints run signature/IP validation before
  # parsing request bodies. Without valid provider credentials, requests are
  # rejected with 403 (Forbidden) before JSON parsing occurs.

  Scenario: Malformed JSON body to SIP bridge command endpoint returns 403
    Given a valid SIP bridge request signature
    And the request body is "this is not json"
    When the command is sent to the SIP bridge
    Then the response status should be 403
    And the response should not contain any stack trace
    And the response error should be generic

  Scenario: Malformed JSON body to SIP bridge ring endpoint returns 403
    Given a valid SIP bridge request signature
    And the request body is "not-json-at-all"
    When the ring command is sent to the SIP bridge
    Then the response status should be 403
    And the response should not contain any stack trace
    And the response error should be generic
