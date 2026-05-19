@backend
Feature: Error disclosure prevention
  Error responses must not leak internal details, stack traces, or failure reasons.

  Scenario: Server error returns generic 500 without stack trace
    Given an authenticated admin user
    When the admin triggers an unhandled server error
    Then the response status should be 500
    And the response body "error" field should be "Internal server error"
    And the response body should not contain "Error:"
    And the response body should not contain "at "

  Scenario: Auth failure with expired token returns generic error
    Given a request signed with a valid keypair
    But the auth timestamp is 600 seconds in the past
    When the request is sent to "/api/users/me"
    Then the response status should be 401
    And the response body "error" field should be "Authentication failed"

  Scenario: Auth failure with unknown pubkey returns same generic error
    Given a request signed with an unregistered keypair
    When the request is sent to "/api/users/me"
    Then the response status should be 401
    And the response body "error" field should be "Authentication failed"

  Scenario: Auth failure with malformed token returns same generic error
    Given a request with Authorization header "Bearer not-valid-json"
    When the request is sent to "/api/users/me"
    Then the response status should be 401
    And the response body "error" field should be "Authentication failed"
