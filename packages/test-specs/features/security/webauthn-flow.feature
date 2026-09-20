@backend @security
Feature: WebAuthn Flow
  As a user with a hardware security key or passkey
  I want to register and authenticate via WebAuthn
  So that I have phishing-resistant multi-factor authentication

  @backend
  Scenario: Generate registration options
    Given a registered user with a known keypair
    When the user requests WebAuthn registration options
    Then the response status is 200
    And the registration options contain a challenge

  @backend
  Scenario: List credentials returns empty for new user
    Given a registered user with a known keypair
    When the user lists their WebAuthn credentials
    Then the response status is 200
    And 0 WebAuthn credentials are listed

  @backend
  Scenario: Generate login options (public endpoint)
    When a client requests WebAuthn login options
    Then the response status is 200
    And the login options contain a challenge

  @backend
  Scenario: Login verify rejects invalid assertion
    When a client requests WebAuthn login options
    And the client submits a fabricated login assertion
    Then the response status is 401

  @backend
  Scenario: Login options are rate limited
    When a client floods WebAuthn login options 15 times
    Then at least one response is 429

  # ─── Passkey policy self-lockout guard (#672) ──────────────────────
  # Enabling "require passkeys for admins" is server-wide. The admin enabling it
  # must already hold a registered credential, otherwise the auth middleware
  # returns WEBAUTHN_REQUIRED on their very next request (including the PATCH
  # that could turn the policy back off) and no in-app path back remains.

  @backend
  Scenario: Admin without a passkey cannot enable the admin passkey requirement
    Given an admin user with no registered passkey
    When that admin enables the passkey requirement for admins
    Then the response status is 409
    And the response error code is "WEBAUTHN_CREDENTIAL_REQUIRED"
    And the passkey requirement for admins is still disabled
    And that admin can still manage WebAuthn settings

  # ─── Passkey policy success branch (#676, follow-up to #672) ───────
  # requireForAdmins=true mutates a *global* system setting — the whole backend-bdd
  # suite runs fullyParallel against one shared server, and persisting this would
  # 403 every passkey-less admin in every concurrent scenario, including the
  # bootstrap admin the hub fixtures use (the #671 shard-poisoning failure mode).
  # Runs in the serial `backend-bdd-global-setting` Playwright project instead
  # (see playwright.config.ts), which is the only project allowed to touch this
  # setting. Its step file resets requireForAdmins back to false in an `After`
  # hook so the mutation never outlives this scenario.

  @backend @global-setting
  Scenario: Admin with a passkey can enable the admin passkey requirement
    Given an admin user with a registered passkey
    When that admin enables the passkey requirement for admins
    Then the response status is 200
    And the passkey requirement for admins is enabled
