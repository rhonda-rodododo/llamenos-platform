# Epic 304: Backend BDD Coverage Expansion

**Status**: PLANNED
**Priority**: High
**Depends on**: Epic 301 (BDD Spec Reorganization)
**Branch**: TBD

## Summary

Expand backend BDD test coverage from ~59 implemented step definitions to ~400+ test cases by auto-generating permission matrix tests from the existing RBAC config, adding API contract validation from zod schemas, and filling CRUD lifecycle + edge case gaps. The existing `test-backend-bdd` infrastructure (Playwright + Docker Compose, serial workers) handles all execution.

**Current state:** 495 scenarios exist across `core/`, `admin/`, `security/` feature files, but only ~59 have backend step definitions. 216 scenarios are skipped by `missingSteps: "skip-scenario"` because they're desktop/mobile-only UI tests. The gap is in backend-specific behavioral coverage that's never been written.

## Problem Statement

1. **Permission matrix is untested at the API level.** 5 roles × ~60 route-level permission checks = ~300 combinations. Only a handful are covered (auth scenarios test admin + volunteer, not reviewer/reporter). A permission misconfiguration would be invisible.

2. **Zod schema validation is untested.** 30+ request schemas with field constraints (regex, min/max, enums) — no test verifies that invalid payloads are rejected with proper error responses.

3. **CRUD lifecycles have gaps.** Notes, shifts, bans, conversations, reports — most test the happy path but skip update, delete, list-with-filters, and pagination edge cases.

4. **Cross-DO integration untested.** Workflows that span multiple Durable Objects (e.g., creating a volunteer in IdentityDO then assigning shifts in ShiftManagerDO then routing calls in CallRouterDO) have no end-to-end backend test.

## Strategy

### Strategy 1: Permission Matrix Tests (~200 scenarios)

Auto-generatable from `packages/shared/permissions.ts` + route definitions.

**Source data:**
- 5 default roles: `super-admin`, `hub-admin`, `reviewer`, `volunteer`, `reporter`
- ~60 `requirePermission()` calls across route files
- `checkPermission()` inline checks for row-level access

**Feature file structure:**
```gherkin
# packages/test-specs/features/security/permission-matrix.feature

Feature: Permission Matrix
  Verify that each API endpoint enforces its required permissions correctly.
  Each role should be granted or denied access based on its permission set.

  # --- Calls Domain ---
  Scenario Outline: <role> <expected> access call history
    Given a registered volunteer with role "<role>"
    When the volunteer requests "GET /api/calls/history"
    Then the response status should be <status>

    Examples:
      | role         | expected  | status |
      | super-admin  | has       | 200    |
      | hub-admin    | has       | 200    |
      | reviewer     | denied    | 403    |
      | volunteer    | denied    | 403    |
      | reporter     | denied    | 403    |

  # Repeat for each requirePermission() endpoint group...
```

**Endpoint groups to cover (from `requirePermission()` calls):**

| Domain | Endpoints | Permission | Roles with access |
|--------|-----------|------------|-------------------|
| Audit | `GET /api/audit/*` | `audit:read` | super-admin, hub-admin |
| Contacts | `GET /api/contacts/*` | `contacts:view` | super-admin, hub-admin, volunteer |
| Volunteers | `GET /api/volunteers` | `volunteers:read` | super-admin, hub-admin |
| Volunteers | `POST /api/volunteers` | `volunteers:create` | super-admin, hub-admin |
| Volunteers | `PATCH /api/volunteers/:id` | `volunteers:update` | super-admin, hub-admin |
| Volunteers | `DELETE /api/volunteers/:id` | `volunteers:delete` | super-admin, hub-admin |
| Shifts | `GET /api/shifts` | `shifts:read` | super-admin, hub-admin |
| Shifts | `POST /api/shifts` | `shifts:create` | super-admin, hub-admin |
| Shifts | `PATCH /api/shifts/:id` | `shifts:update` | super-admin, hub-admin |
| Shifts | `DELETE /api/shifts/:id` | `shifts:delete` | super-admin, hub-admin |
| Shifts | `GET /api/shifts/fallback` | `shifts:manage-fallback` | super-admin, hub-admin |
| Bans | `POST /api/bans` | `bans:report` | super-admin, hub-admin, volunteer |
| Bans | `GET /api/bans` | `bans:read` | super-admin, hub-admin |
| Bans | `POST /api/bans/bulk` | `bans:bulk-create` | super-admin, hub-admin |
| Bans | `DELETE /api/bans/:phone` | `bans:delete` | super-admin, hub-admin |
| Invites | `GET /api/invites` | `invites:read` | super-admin, hub-admin |
| Invites | `POST /api/invites` | `invites:create` | super-admin, hub-admin |
| Invites | `DELETE /api/invites/:code` | `invites:revoke` | super-admin, hub-admin |
| Notes | `GET /api/notes` | `notes:read-own` | all (scoped results) |
| Notes | `POST /api/notes` | `notes:create` | super-admin, hub-admin, volunteer |
| Notes | `PATCH /api/notes/:id` | `notes:update-own` | super-admin, hub-admin, volunteer |
| Notes | `POST /api/notes/:id/replies` | `notes:reply` | super-admin, hub-admin, reviewer, volunteer |
| Settings | `GET /api/settings/spam` | `settings:manage-spam` | super-admin, hub-admin |
| Settings | `PATCH /api/settings/spam` | `settings:manage-spam` | super-admin, hub-admin |
| Settings | `GET /api/settings/telephony-provider` | `settings:manage-telephony` | super-admin, hub-admin |
| Settings | `PATCH /api/settings/telephony-provider` | `settings:manage-telephony` | super-admin, hub-admin |
| Settings | `GET /api/settings/messaging` | `settings:manage-messaging` | super-admin, hub-admin |
| Settings | `PATCH /api/settings/messaging` | `settings:manage-messaging` | super-admin, hub-admin |
| Settings | `GET /api/settings/ivr-languages` | `settings:manage-ivr` | super-admin, hub-admin |
| Settings | `PATCH /api/settings/ivr-languages` | `settings:manage-ivr` | super-admin, hub-admin |
| Settings | `PUT /api/settings/custom-fields` | `settings:manage-fields` | super-admin, hub-admin |
| Settings | `PATCH /api/settings/transcription` | `settings:manage-transcription` | super-admin, hub-admin |
| Files | `POST /api/files/:id/share` | `files:share` | super-admin, hub-admin |
| Hubs | `POST /api/hubs` | `system:manage-hubs` | super-admin |
| Hubs | `PATCH /api/hubs/:id` | `system:manage-hubs` | super-admin |
| System | `* /api/system/*` | `system:manage-instance` | super-admin |
| Metrics | `GET /api/metrics` | `audit:read` | super-admin, hub-admin |
| Reports | various | `reports:*` | varies by endpoint |
| Setup | various | `settings:manage` | super-admin, hub-admin |

### Strategy 2: API Contract Tests (~60 scenarios)

Validate that zod schemas actually reject invalid input with proper error responses.

**Source data:** 30+ exported schemas in `apps/worker/schemas/`

```gherkin
Feature: API Contract Validation
  Verify that all API endpoints validate request bodies against their schemas
  and return proper error responses for invalid input.

  Scenario: Login rejects missing pubkey
    When an unauthenticated request is sent to "POST /api/auth/login" with body:
      | field     | value      |
      | timestamp | 1234567890 |
      | token     | abc123     |
    Then the response status should be 400
    And the response should contain validation error for "pubkey"

  Scenario: Create volunteer rejects invalid pubkey format
    Given a registered admin
    When the admin sends "POST /api/volunteers" with body:
      | field  | value     |
      | pubkey | not-a-hex |
      | name   | Test      |
    Then the response status should be 400
    And the response should contain validation error for "pubkey"

  # ... for each schema's required fields + format constraints
```

**Schemas to cover:**
- `loginBodySchema` (pubkey regex, timestamp, token)
- `bootstrapBodySchema` (pubkey regex, name)
- `createVolunteerBodySchema` (pubkey, name, phone, roles)
- `updateVolunteerBodySchema` (name, phone, roles optional)
- `createShiftBodySchema` (name, startTime, endTime, volunteers)
- `createNoteBodySchema` (callId, encryptedContent, recipientEnvelopes)
- `createReportBodySchema` (type, fields)
- `spamSettingsSchema` (captchaEnabled, rateLimit, etc.)
- `telephonyProviderSchema` (provider enum, credentials)
- `messagingConfigSchema` (channels)
- `createBlastBodySchema` (subject, body, channels)
- `createInviteBodySchema` (roles)
- `createHubBodySchema` (name, description)
- `paginationSchema` (limit, offset bounds)
- `cursorPaginationSchema` (cursor, limit)
- All `*QuerySchema` for GET endpoints

### Strategy 3: CRUD Lifecycle Tests (~30 scenarios)

Complete create → read → update → delete → verify-deleted cycles for each entity.

```gherkin
Feature: Volunteer CRUD Lifecycle
  Scenario: Full volunteer lifecycle
    Given a registered admin
    When the admin creates a volunteer with name "Alice" and pubkey "<random>"
    Then the volunteer list should contain "Alice"
    When the admin updates the volunteer's name to "Alice Updated"
    Then the volunteer list should contain "Alice Updated"
    When the admin deactivates the volunteer
    Then the volunteer list should not contain "Alice Updated"
```

**Entities to cover:**
- Volunteers (create, read, update, delete, role assignment)
- Shifts (create, read, update, delete, fallback group)
- Bans (create, bulk-create, read, delete)
- Notes (create, read, update, reply, list-with-filters)
- Invites (create, read, redeem, revoke)
- Reports (create, read, update status, assign, message)
- Conversations (list, claim, send, close, reopen, reassign)
- Custom fields (create, update, delete, validate in notes)
- Hubs (create, update, add/remove members, key distribution)
- Blast campaigns (create, schedule, list subscribers)
- IVR audio (upload, list, delete)
- Report types (create, update, delete)
- Roles (create, update, delete — system roles immutable)

### Strategy 4: Edge Case & Error Handling Tests (~40 scenarios)

```gherkin
Feature: Edge Cases
  Scenario: Pagination returns correct totals
    Given 25 notes exist
    When the volunteer requests notes with limit 10 offset 0
    Then 10 notes should be returned
    And the total should be 25
    When the volunteer requests notes with limit 10 offset 20
    Then 5 notes should be returned

  Scenario: Concurrent shift creation doesn't corrupt state
    Given 2 admins create shifts simultaneously
    Then both shifts should exist without data loss

  Scenario: Rate limiting prevents brute force
    When 11 login attempts are made in rapid succession
    Then the 11th attempt should return 429

  Scenario: Large payload is rejected
    When a request is sent with a 2MB body
    Then the response status should be 413 or 400
```

**Categories:**
- Pagination edge cases (empty, boundary, cursor-based)
- Concurrent operations (idempotency, race conditions)
- Rate limiting (login, API calls)
- Input boundary values (empty strings, max lengths, unicode)
- Error response format consistency
- CORS headers on error responses
- Unauthenticated access to all protected routes

### Strategy 5: Cross-DO Integration Tests (~15 scenarios)

```gherkin
Feature: Cross-DO Workflows
  Scenario: Volunteer onboarding through call completion
    Given the system is bootstrapped
    When an admin creates a volunteer
    And the admin creates a shift including the volunteer
    And a call comes in during the shift
    Then the volunteer should be rung
    When the volunteer answers and writes a note
    Then the call history should show the completed call
    And the note should appear in the volunteer's note list
    And the audit log should contain entries for each step
```

**Workflows:**
- Volunteer onboarding → shift assignment → call routing → note creation → audit trail
- Ban a number → call from banned number → verify rejection → unban → verify accepted
- Conversation lifecycle: incoming message → assignment → reply → close → reopen
- Hub creation → member management → hub key rotation
- Report workflow: submit → assign reviewer → review → close
- Invite flow: create code → redeem → verify volunteer created with roles

## Implementation Plan

### Phase 1: Infrastructure + Permission Matrix (largest ROI)

**Files to create/modify:**
- `packages/test-specs/features/security/permission-matrix.feature` — Scenario Outlines for all endpoint groups
- `tests/steps/backend/permission-matrix.steps.ts` — Generic step definitions using parameterized HTTP calls
- `tests/steps/backend/fixtures.ts` — Add role-specific volunteer creation helpers

**Step definitions needed:**
```typescript
Given('a registered volunteer with role {string}', async ({ request }, role) => {
  // Create volunteer, assign role, return authenticated context
})

When('the volunteer requests {string} {string}', async ({ request }, method, path) => {
  // Execute HTTP request with auth, store response
})

When('the volunteer requests {string} {string} with body:', async ({ request }, method, path, body) => {
  // Execute HTTP request with auth + body, store response
})

Then('the response status should be {int}', async ({}, status) => {
  // Assert stored response status
})
```

**Estimation:** ~200 scenarios, 4-5 new step definitions, 1 feature file with Scenario Outlines
**Gate:** `bun run test:backend:bdd` passes with 200+ new passing tests

### Phase 2: API Contracts + CRUD Lifecycles

**Files to create/modify:**
- `packages/test-specs/features/security/api-contracts.feature` — Schema validation scenarios
- `packages/test-specs/features/core/crud-lifecycles.feature` — Entity lifecycle scenarios
- `tests/steps/backend/contracts.steps.ts` — Validation error assertion steps
- `tests/steps/backend/crud.steps.ts` — CRUD operation steps

**Estimation:** ~90 scenarios, 8-10 new step definitions, 2 feature files
**Gate:** All contract + lifecycle tests pass

### Phase 3: Edge Cases + Cross-DO Integration

**Files to create/modify:**
- `packages/test-specs/features/core/edge-cases.feature` — Pagination, concurrency, rate limits
- `packages/test-specs/features/core/cross-do-workflows.feature` — Multi-DO scenarios
- `tests/steps/backend/edge-cases.steps.ts` — Edge case step definitions

**Estimation:** ~55 scenarios, 6-8 new step definitions, 2 feature files
**Gate:** `bun run test:backend:bdd` shows 400+ passing tests, `bun run test:all` green

## Verification

After all phases:
- `bun run test:backend:bdd` — 400+ passing backend BDD tests
- `bun run test:all` — all platforms green
- Permission matrix covers every `requirePermission()` call in the codebase
- Schema validation covers every exported `*Schema` in `apps/worker/schemas/`

## Non-Goals

- **No UI test changes.** This epic only adds backend step definitions and shared feature files.
- **No performance/load testing.** API latency and throughput are out of scope.
- **No mock server tests.** All tests run against the real Docker Compose backend.

## Maintenance Cost

The permission matrix tests are **auto-maintainable**: when a new `requirePermission()` call is added, a new Scenario Outline row is added. When a role's permissions change, the expected status codes in the Examples table are updated. The zod schema tests are similarly stable — they only change when schemas change.

Estimated ongoing maintenance: ~5 minutes per new endpoint, ~2 minutes per permission change.
