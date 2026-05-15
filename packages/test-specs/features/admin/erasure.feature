@backend
Feature: Account Erasure
  As a user or admin
  I want to request and process account erasure
  So that user data is removed in compliance with GDPR

  # ── Backend: Self-service erasure ───────────────────────────────────

  @backend
  Scenario: Volunteer requests own account erasure
    Given a volunteer user
    When the volunteer POSTs to "/erasure/me" with a justification
    Then the response status should be 200
    And the response should contain an erasure request with status "pending"
    And the executeAt should be approximately 72 hours in the future

  @backend
  Scenario: Volunteer cannot create duplicate erasure request
    Given a registered volunteer user with a pending erasure request
    When the volunteer POSTs to "/erasure/me" again
    Then the response status should be 409
    And the response should contain error "Erasure request already pending"

  @backend
  Scenario: Volunteer cancels pending erasure request
    Given a registered volunteer user with a pending erasure request
    When the volunteer DELETEs "/erasure/me"
    Then the response status should be 200
    And the response should contain ok true

  @backend
  Scenario: Volunteer checks own erasure status with no pending request
    Given a registered volunteer user with no pending erasure request
    When the volunteer GETs "/erasure/me"
    Then the response status should be 200
    And the response should contain request null

  # ── Backend: Admin erasure ──────────────────────────────────────────

  @backend
  Scenario: Admin can list erasure requests
    Given an admin user
    And 2 pending erasure requests exist
    When the admin GETs "/erasure/requests"
    Then the response status should be 200
    And the response should contain a list of requests with total 2

  @backend
  Scenario: Admin executes immediate erasure
    Given an admin user
    And a target volunteer user exists
    When the admin POSTs to "/erasure/:userId" with a justification
    Then the response status should be 200
    And the response should contain ok true
    And the response should contain reEncryptionJobIds

  @backend
  Scenario: Admin can view re-encryption jobs
    Given an admin user
    When the admin GETs "/erasure/re-encryption-jobs"
    Then the response status should be 200
    And the response should contain a jobs list

  @backend
  Scenario: Non-admin cannot access erasure admin endpoints
    Given a volunteer user
    When the volunteer GETs "/erasure/requests"
    Then the response status should be 403

  # ── Backend: Device wipe ────────────────────────────────────────────

  @backend
  Scenario: Admin sends device wipe command
    Given an admin user
    And a target volunteer user with a known device pubkey
    When the admin POSTs to "/erasure/:userId/wipe-device/:devicePubkey"
    Then the response status should be 200
    And the response should contain ok true
