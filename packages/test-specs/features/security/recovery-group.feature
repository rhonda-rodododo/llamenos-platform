@backend @security @crypto
Feature: Recovery Group Lifecycle
  As the recovery system
  I want to manage hub-scoped K-of-N Shamir recovery groups
  So that users can recover encrypted data when they lose all devices

  Background:
    Given a registered admin user with "recovery:manage" permission
    And a hub is available for recovery group tests

  # -- Enrollment --

  @backend
  Scenario: Enroll a valid 2-of-3 recovery group
    When the admin enrolls a 2-of-3 recovery group for the hub
    Then the response status is 200
    And the response body has "ok" equal to true
    When the admin fetches the recovery group for the hub
    Then the response status is 200
    And the recovery group has threshold 2 and totalShares 3
    And the recovery group has 3 share holders

  @backend
  Scenario: Reject enrollment with threshold exceeding totalShares
    When the admin enrolls a recovery group with threshold 4 and totalShares 3
    Then the response status is 400
    And the response body has error containing "Threshold cannot exceed"

  @backend
  Scenario: Reject enrollment with mismatched envelope count
    When the admin enrolls a recovery group with mismatched envelope count
    Then the response status is 400
    And the response body has error containing "share envelopes"

  @backend
  Scenario: Rotate recovery group replaces old shares atomically
    Given a recovery group is enrolled for the hub
    When the admin enrolls a new 2-of-3 recovery group with different share holders
    Then the response status is 200
    When the admin fetches the recovery group for the hub
    Then the recovery group has the new share holders

  # -- Permission Enforcement --

  @backend
  Scenario: Enrollment requires recovery:manage permission
    Given a user without "recovery:manage" permission
    When that user attempts to enroll a recovery group
    Then the response status is 403

  @backend
  Scenario: Viewing group requires recovery:view permission
    Given a recovery group is enrolled for the hub
    And a user without "recovery:view" permission
    When that user fetches the recovery group for the hub
    Then the response status is 403

  # -- User Envelope --

  @backend
  Scenario: Authenticated user can store recovery envelope
    When an authenticated user stores a recovery envelope for the hub
    Then the response status is 200
    And the response body has "ok" equal to true

  @backend
  Scenario: User envelope upserts on re-submission
    When an authenticated user stores a recovery envelope for the hub
    And the user stores a different envelope for the same hub
    Then the response status is 200

  # -- Share Liveness --

  @backend
  Scenario: Share holder can submit liveness proof
    Given a recovery group is enrolled for the hub
    When a share holder submits a liveness proof for the hub
    Then the response status is 200
    And the response body has "ok" equal to true

  @backend
  Scenario: Non-holder liveness proof is rejected
    Given a recovery group is enrolled for the hub
    When a non-holder submits a liveness proof for the hub
    Then the response status is 403

  # -- Anti-Enumeration --

  @backend
  Scenario: Initiate for nonexistent user returns same response shape
    When an unauthenticated client initiates recovery for a nonexistent user in the hub
    Then the response status is 200
    And the response body has "verificationSent" equal to true
    And the response body has a "sessionId" UUID field

  # -- Duplicate Contribution guard (no Signal sidecar needed) --

  @backend
  Scenario: Contributing share to non-existent session returns 404
    When an authenticated user contributes a share to session "nonexistent-session-id"
    Then the response status is 404

  # -- Session listing (EP09 errata #1 / issue #729) --

  @backend
  Scenario: Admin lists recovery sessions for a hub
    Given a recovery session exists for the hub
    When the admin lists recovery sessions for the hub
    Then the response status is 200
    And the listed sessions include the seeded session

  @backend
  Scenario: Listing sessions requires recovery:view permission
    Given a recovery session exists for the hub
    And a user without "recovery:view" permission
    When that user lists recovery sessions for the hub
    Then the response status is 403

  # -- Atomic group rotation with envelope re-wrap (EP09 errata #5 / issue #729) --

  @backend @crypto
  Scenario: Rotating a recovery group excludes the departed holder and re-wraps user envelopes
    Given a recovery group with a real HPKE keypair is enrolled for the hub
    When the admin rotates the recovery group, excluding the departed holder, and re-wraps the user envelope
    Then the response status is 200
    And the rotated recovery group excludes the departed holder
    And the departed group key cannot decrypt the rotated envelope, but the new group key can

  # -- Full recovery ceremony + recovery-device-add sigchain link (EP09 errata #12 / issue #729) --

  @backend @crypto
  Scenario: Completing recovery authorizes the new device via a self-signed sigchain link and decrypts the PUK seed
    Given a recovery group is enrolled with two real contributing holders
    When each contributing holder submits their share to the new device
    Then the recovering device reconstructs the group key from the released contributions
    When the new device completes recovery with a self-authorizing sigchain link
    Then the response status is 200
    And the recovering user's sigchain shows a recovery-device-add link signed by the new device
    And the recovered device decrypts the PUK seed envelope
