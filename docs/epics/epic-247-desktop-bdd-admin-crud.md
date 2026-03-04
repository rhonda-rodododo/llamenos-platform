# Epic 247: Desktop BDD Behavioral Recovery — Admin CRUD

## Goal

Recover the behavioral depth lost in the Epic 232 BDD migration for admin CRUD operations: volunteers, bans, and shifts. The original `admin-flow.spec.ts` (250 lines), `ban-management.spec.ts` (207 lines), and `shift-management.spec.ts` (182 lines) tested full CRUD cycles with data verification. The current step definitions are presence-only checks.

## What Was Lost

### Shifts (original shift-management.spec.ts — 182 lines)
- Create shift → verify time display ("08:00 - 16:00")
- Edit shift name AND time → verify old name gone, new times displayed
- Delete shift → verify gone from list
- **Assign volunteer to shift** → open multi-select combobox, select volunteer, verify "1 volunteer" count
- **Fallback group** → select volunteer in fallback combobox, verify badge
- Verify 0 volunteer count for empty shifts

### Bans (original ban-management.spec.ts — 207 lines)
- Add ban → verify phone + reason displayed
- Ban shows date (year check)
- Remove ban with confirmation dialog → verify disappears
- Cancel removal → verify stays
- Phone validation rejects "+12"
- Multiple bans display with reasons
- **Bulk import** opens/closes, adds multiple, rejects invalid
- **Volunteer cannot access ban list** (navigate to /bans → access denied)

### Volunteers (original admin-flow.spec.ts — 250 lines)
- Add volunteer → see nsec → close card → verify in list
- Delete volunteer with confirmation → verify gone
- Phone validation rejects bad numbers
- Invite → generate link → revoke → verify gone

## Current State (Hollow Step Definitions)

### scheduling-steps.ts problems:
- `the shift should show "08:00 - 16:00"` → uses `.or()` fallback that never checks the actual text within the shift card
- `I create a shift and assign the volunteer` → tries to click first checkbox if visible, no actual volunteer assignment flow
- `I add the volunteer to the fallback group` → clicks first button in fallback card area, doesn't verify anything
- `the volunteer badge should appear in the fallback group` → just checks fallback card exists

### ban-steps.ts problems:
- Steps are actually BETTER than most — they create bans through UI and verify in list
- BUT: no API verification that ban was actually persisted in the backend
- Bulk import and volunteer access control steps are missing or shallow

### volunteer-steps.ts problems:
- Creates volunteers but never verifies via API that they exist
- `an invite link should be generated` → `.or()` fallback between invite card and nsec card
- Role-specific steps don't actually assign roles

## Implementation

### Phase 1: Expand API Helpers

Add to `tests/api-helpers.ts`:

```typescript
// Roles
export async function listRolesViaApi(request: APIRequestContext): Promise<Array<{ id: string; name: string; slug: string; permissions: string[] }>>
export async function createRoleViaApi(request: APIRequestContext, opts: { name: string; permissions: string[] }): Promise<{ id: string; slug: string }>
export async function deleteRoleViaApi(request: APIRequestContext, slug: string): Promise<void>

// Reports
export async function createReportViaApi(request: APIRequestContext, opts: { title: string; body: string }): Promise<{ id: string }>
export async function listReportsViaApi(request: APIRequestContext): Promise<Array<{ id: string; title: string; status: string }>>

// Notes
export async function listNotesViaApi(request: APIRequestContext): Promise<Array<{ id: string }>>

// Audit
export async function listAuditEntriesViaApi(request: APIRequestContext): Promise<Array<{ action: string; actorPubkey: string }>>
```

### Phase 2: Rewrite Shift Step Definitions

Replace `tests/steps/shifts/scheduling-steps.ts` with behavioral steps:

**Key changes:**
- `the shift should appear in the schedule` → after UI verify, also call `listShiftsViaApi()` and assert the shift name exists in API response
- `the shift should show "08:00 - 16:00"` → assert `.toContainText("08:00")` and `.toContainText("16:00")` within the specific shift card (no `.or()`)
- `the shift should no longer be visible` → after UI verify, also call `listShiftsViaApi()` and assert shift name NOT in response
- `I create a shift and assign the volunteer` → actually create a volunteer via API first, then use the volunteer assignment combobox, select by name, verify count badge shows "1"
- `the volunteer badge should appear in the fallback group` → check for volunteer name within the fallback group section

### Phase 3: Rewrite Ban Step Definitions

**Key changes:**
- After adding a ban, verify via `listBansViaApi()` that the phone exists in the backend
- After removing a ban, verify via `listBansViaApi()` that the phone is gone
- `Volunteer cannot access ban list` → create volunteer via API, login as volunteer, navigate to /bans, verify "Access Denied" or redirect

### Phase 4: Rewrite Volunteer Step Definitions

**Key changes:**
- After creating a volunteer via UI, verify via `listVolunteersViaApi()` that the name/phone match
- After deleting a volunteer, verify via `listVolunteersViaApi()` that the pubkey is gone
- Invite flow: verify invite link URL format, verify revocation removes from list
- Role assignment: after assigning role via dropdown, verify via API that the role changed

### Phase 5: Enhance Feature Files

Add missing behavioral scenarios to existing feature files:

**shift-scheduling.feature additions:**
```gherkin
  Scenario: Shift persists after page reload
    Given I create a shift with name "Persistent Shift"
    When I reload the page
    Then I should still see "Persistent Shift" in the shift list

  Scenario: Edit shift time displays correctly
    Given a shift exists with time "08:00 - 16:00"
    When I edit the shift time to "10:00 - 18:00"
    Then the shift should show "10:00 - 18:00"
    And the shift should not show "08:00 - 16:00"
```

**ban-management.feature additions:**
```gherkin
  Scenario: Ban persists after page reload
    Given I add a ban for a unique phone number
    When I reload the page
    Then the banned phone number should still be visible

  Scenario: Ban is verified via API
    Given I add a ban for a unique phone number
    Then the ban should exist in the API response
```

## Files Changed

| File | Action |
|------|--------|
| `tests/api-helpers.ts` | Add role, report, note, audit API helpers |
| `tests/steps/shifts/scheduling-steps.ts` | Full rewrite — behavioral assertions |
| `tests/steps/shifts/shift-detail-steps.ts` | Rewrite — remove `.or()` fallbacks |
| `tests/steps/admin/ban-steps.ts` | Add API verification after each mutation |
| `tests/steps/auth/volunteer-steps.ts` | Add API verification, proper role assignment |
| `packages/test-specs/features/shifts/shift-scheduling.feature` | Add persistence scenarios |
| `packages/test-specs/features/bans/ban-management.feature` | Add API verification scenarios |
| `packages/test-specs/features/desktop/admin/admin-flow.feature` | Add API verification to CRUD scenarios |

## Verification

1. All shift CRUD tests create data and verify via both UI AND API
2. All ban CRUD tests verify persistence via API after mutations
3. Volunteer CRUD verifies API state matches UI state
4. Zero `.or()` fallback patterns in rewritten step definitions
5. All `if (visible)` guard patterns replaced with hard assertions
6. `bun run test` passes with same or higher test count
