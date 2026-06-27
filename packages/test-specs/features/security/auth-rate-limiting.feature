@backend @security
Feature: Auth endpoint rate limiting
  Auth endpoints enforce strict per-IP and per-pubkey rate limits
  to prevent brute force and credential stuffing attacks.
  Rate limits are always enforced, including in development mode.

  Background:
    Given rate limit counters are cleared

  # --- Login Rate Limiting ---

  @backend
  Scenario: Login endpoint rate limited after 5 requests per minute from same IP
    When a client sends 6 login requests from the same IP within 1 minute
    Then at least one response should be 429
    And the 429 response body should contain "Too many login attempts"

  @backend
  Scenario: Login rate limit uses unique IP buckets
    When a client sends 3 login requests from IP "10.99.1.1"
    And a client sends 3 login requests from IP "10.99.1.2"
    Then all 6 requests should succeed without 429

  @backend
  Scenario: Login rate limit tracks per pubkey
    When a client sends 6 login requests with the same pubkey from different IPs
    Then at least one response should be 429

  # --- Bootstrap Rate Limiting ---

  @backend
  Scenario: Bootstrap endpoint rate limited after 3 requests per minute from same IP
    When a client sends 4 bootstrap requests from the same IP within 1 minute
    Then at least one response should be 429
    And the 429 response body should contain "Too many attempts"

  # --- WebAuthn Rate Limiting ---

  @backend
  Scenario: WebAuthn login options rate limited after 5 requests per minute
    When a client sends 6 WebAuthn login option requests from the same IP
    Then at least one response should be 429

  @backend
  Scenario: WebAuthn login verify rate limited after 5 requests per minute
    When a client sends 6 WebAuthn verify requests from the same IP
    Then at least one response should be 429
