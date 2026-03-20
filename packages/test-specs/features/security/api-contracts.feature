@backend
Feature: API Contract Validation
  Verify that all API endpoints validate request bodies against their Zod schemas
  and return proper error responses for invalid input.

  # ─── Pubkey Format Validation ──────────────────────────────────────

  Scenario: Create volunteer rejects invalid pubkey format
    When an admin sends "POST" to "/api/volunteers" with body:
      | pubkey | not-a-hex-string |
      | name   | Test Volunteer   |
      | phone  | +15551234567     |
    Then the response status should be 400

  Scenario: Create volunteer rejects short pubkey
    When an admin sends "POST" to "/api/volunteers" with body:
      | pubkey | abcdef |
      | name   | Test   |
      | phone  | +15551234567 |
    Then the response status should be 400

  Scenario: Create volunteer rejects uppercase hex pubkey
    When an admin sends "POST" to "/api/volunteers" with body:
      | pubkey | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA |
      | name   | Test   |
      | phone  | +15551234567 |
    Then the response status should be 400

  # ─── Phone Format Validation ───────────────────────────────────────

  Scenario: Create ban rejects non-E164 phone
    When an admin sends "POST" to "/api/bans" with body:
      | phone  | 555-123-4567      |
      | reason | invalid phone test |
    Then the response status should be 400

  Scenario: Create ban rejects phone without plus prefix
    When an admin sends "POST" to "/api/bans" with body:
      | phone  | 15551234567       |
      | reason | no plus prefix    |
    Then the response status should be 400

  # ─── Required Fields Missing ───────────────────────────────────────

  Scenario: Create volunteer rejects missing name
    When an admin sends "POST" to "/api/volunteers" with body:
      | pubkey | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | phone  | +15551234567 |
    Then the response status should be 400

  Scenario: Create volunteer rejects missing pubkey
    When an admin sends "POST" to "/api/volunteers" with body:
      | name  | Test Volunteer |
      | phone | +15551234567   |
    Then the response status should be 400

  Scenario: Create shift rejects missing name
    When an admin sends "POST" to "/api/shifts" with body:
      | startTime        | 09:00 |
      | endTime          | 17:00 |
    Then the response status should be 400

  Scenario: Create shift rejects missing days
    When an admin sends "POST" to "/api/shifts" with body:
      | name      | Test Shift |
      | startTime | 09:00      |
      | endTime   | 17:00      |
    Then the response status should be 400

  Scenario: Create note rejects missing encryptedContent
    When an admin sends "POST" to "/api/notes" with empty encrypted content
    Then the response status should be 400

  Scenario: Create report rejects missing title
    When an admin sends "POST" to "/api/reports" with missing title
    Then the response status should be 400

  Scenario: Create invite rejects missing name
    When an admin sends "POST" to "/api/invites" with body:
      | roleIds | ["role-volunteer"] |
    Then the response status should be 400

  Scenario: Create role rejects missing permissions
    When an admin sends "POST" to "/api/settings/roles" with body:
      | name | Test Role |
      | slug | test-role |
    Then the response status should be 400

  Scenario: Create hub rejects missing name
    When an admin sends "POST" to "/api/hubs" with body:
      | description | A test hub |
    Then the response status should be 400

  # ─── String Length Constraints ─────────────────────────────────────

  Scenario: Create volunteer rejects empty name
    When an admin sends "POST" to "/api/volunteers" with body:
      | pubkey | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | name   |                                                                |
      | phone  | +15551234567                                                   |
    Then the response status should be 400

  Scenario: Create role rejects empty slug
    When an admin sends "POST" to "/api/settings/roles" with body:
      | name        | Test        |
      | slug        |             |
      | permissions | ["notes:read-own"] |
      | description | test role   |
    Then the response status should be 400

  Scenario: Role slug rejects special characters
    When an admin sends "POST" to "/api/settings/roles" with body:
      | name        | Test         |
      | slug        | Test Role!   |
      | permissions | ["notes:read-own"] |
      | description | test role    |
    Then the response status should be 400

  # ─── Integer Bounds ────────────────────────────────────────────────

  Scenario: Pagination rejects page 0
    When an admin sends "GET" to "/api/notes?page=0&limit=50"
    Then the response status should be 400

  Scenario: Pagination rejects limit over 200
    When an admin sends "GET" to "/api/notes?page=1&limit=500"
    Then the response status should be 400

  Scenario: Pagination rejects negative limit
    When an admin sends "GET" to "/api/notes?page=1&limit=-1"
    Then the response status should be 400

  Scenario: Spam settings rejects maxCallsPerMinute over 100
    When an admin sends "PATCH" to "/api/settings/spam" with body:
      | maxCallsPerMinute | 999 |
    Then the response status should be 400

  Scenario: Spam settings rejects maxCallsPerMinute of 0
    When an admin sends "PATCH" to "/api/settings/spam" with body:
      | maxCallsPerMinute | 0 |
    Then the response status should be 400

  Scenario: Call settings rejects queueTimeout under 30
    When an admin sends "PATCH" to "/api/settings/call" with body:
      | queueTimeoutSeconds | 5 |
    Then the response status should be 400

  Scenario: Call settings rejects queueTimeout over 300
    When an admin sends "PATCH" to "/api/settings/call" with body:
      | queueTimeoutSeconds | 999 |
    Then the response status should be 400

  Scenario: Shift days rejects day value over 6
    When an admin sends "POST" to "/api/shifts" with invalid day body
    Then the response status should be 400

  Scenario: Shift days rejects negative day value
    When an admin sends "POST" to "/api/shifts" with negative day body
    Then the response status should be 400

  # ─── Enum Validation ───────────────────────────────────────────────

  Scenario: Telephony provider rejects unknown type
    When an admin sends "PATCH" to "/api/settings/telephony-provider" with body:
      | type | invalid-provider |
    Then the response status should be 400

  Scenario: Conversation status rejects invalid enum
    When an admin sends "GET" to "/api/conversations?status=invalid"
    Then the response status should be 400

  # ─── Date Format Validation ────────────────────────────────────────

  Scenario: Call history rejects invalid date format
    When an admin sends "GET" to "/api/calls/history?dateFrom=not-a-date"
    Then the response status should be 400

  Scenario: Call history accepts YYYY-MM-DD format
    When an admin sends "GET" to "/api/calls/history?dateFrom=2026-01-01"
    Then the response status should not be 400

  # ─── Valid Request Acceptance ──────────────────────────────────────

  Scenario: Create volunteer accepts valid input
    When an admin creates a volunteer with valid data
    Then the response status should not be 400

  Scenario: Create shift accepts valid input
    When an admin creates a shift with valid data
    Then the response status should not be 400

  Scenario: Create ban accepts valid E164 phone
    When an admin sends "POST" to "/api/bans" with body:
      | phone  | +15559876543 |
      | reason | valid test   |
    Then the response status should not be 400

  Scenario: Spam settings accepts valid bounds
    When an admin sends "PATCH" to "/api/settings/spam" with body:
      | maxCallsPerMinute   | 50 |
      | blockDurationMinutes | 30 |
    Then the response status should not be 400

  Scenario: Telephony provider accepts valid twilio config
    When an admin sends "PATCH" to "/api/settings/telephony-provider" with valid twilio body
    Then the response status should not be 400

  Scenario: Pagination accepts valid bounds
    When an admin sends "GET" to "/api/notes?page=1&limit=100"
    Then the response status should not be 400
