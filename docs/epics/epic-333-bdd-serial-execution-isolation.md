# Epic 333: BDD Serial Execution Isolation

## Problem

71 desktop BDD scenarios fail when run as a full serial suite (310 tests, 1 worker) but pass when run per-feature-group. The failures are caused by **server state pollution** between scenarios — earlier tests modify shared state (demo mode, setup wizard, created data) that corrupts later tests.

### Root Causes

| Category | Count | Example |
|----------|-------|---------|
| Setup wizard state leakage | ~15 | Setup wizard tests toggle `setupCompleted`, breaking subsequent auth flows |
| Demo mode state pollution | ~8 | Demo mode tests enable demo mode server-side, subsequent tests see demo UI |
| Missing test data | ~20 | Reports, contacts, call recordings, shift details need pre-existing data |
| Step definition collisions | ~5 | Same Gherkin step text matches wrong step file depending on import order |
| Unimplemented UI features | ~10 | Call recording, multi-hub, shift detail, contact timeline need data seeding |
| Crypto BDD tests (browser context) | ~8 | Crypto interop BDD scenarios fail due to localStorage access after logout |

### Current State

- **Baseline (pre-Epic 314)**: 78 failures, 232 passed
- **After Epic 314 Phase 1**: 71 failures, 236 passed
- **Per-group execution**: 0 failures (all groups pass individually)

## Solution

### 1. Add `Before` Hook for Server State Reset

Add a `Before` hook in `tests/steps/fixtures.ts` that calls `/api/test-reset` before each scenario. This ensures every test starts with clean server state.

```typescript
// tests/steps/common/before-hooks.ts
import { Before } from '../fixtures'
import { Timeouts } from '../../helpers'

const TEST_RESET_SECRET = process.env.DEV_RESET_SECRET || 'test-reset-secret'

Before(async ({ page }) => {
  // Reset server state before each scenario
  try {
    await page.request.post('/api/test-reset', {
      headers: { 'X-Test-Secret': TEST_RESET_SECRET },
    })
  } catch {
    // Server may not be ready — continue anyway
  }
})
```

**Risk**: This makes the suite slower (~2s per reset × 310 tests = ~10 min overhead). Mitigate by making `/api/test-reset` faster or only resetting between feature files (not every scenario).

**Alternative**: Reset only when the scenario has a `@resets-state` tag (applied to setup wizard, demo mode, etc.).

### 2. Tag State-Mutating Scenarios

Add `@resets-state` tag to scenarios that modify global server state:
- Setup wizard scenarios (toggle `setupCompleted`)
- Demo mode scenarios (enable/disable demo mode)
- Logout scenarios (clear auth state — less impactful since each test calls `loginAsAdmin`)

### 3. Fix Step Definition Collisions

| Collision | Resolution |
|-----------|------------|
| `I should see the identity card` | Rename dashboard version to `I should see the dashboard identity card` |
| `I should see the step indicator` | Already fixed in Epic 314 (context-aware check) |
| `I should see the reports screen` | Already uses test IDs (no collision) |

### 4. Add Data Seeding for Data-Dependent Tests

Create seed functions in `tests/api-helpers.ts` for:
- **Call recordings**: `seedCallWithRecording(request)` — creates a call record with `hasRecording: true`
- **Shift details**: `seedShiftWithVolunteers(request)` — creates a shift and assigns volunteers
- **Contacts**: `seedContact(request)` — creates a contact with timeline events

Use these in `Given` steps:
```gherkin
Given a call with recording exists    # → seedCallWithRecording()
Given a shift with assigned volunteers exists  # → seedShiftWithVolunteers()
```

### 5. Fix Crypto BDD Browser Context Issues

The crypto interop BDD scenarios (lines 69-75 in failure list) fail with:
```
SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied
```

This happens when a previous test logged out and the browser context has restricted storage access. Fix by adding explicit page navigation before localStorage access:
```typescript
Given('I am on the onboarding screen', async ({ page }) => {
  await page.goto('/onboarding')
  await page.waitForLoadState('domcontentloaded')
})
```

### 6. Tag Remaining Unimplemented Features as @wip

Review each failing scenario and tag as `@wip` if it tests functionality that doesn't exist yet:
- Call recording badge/player when no calls have recordings in test env
- Shift detail volunteer assignment when no volunteers are assigned
- Contact timeline events when no events exist

## Files to Change

| File | Change |
|------|--------|
| `tests/steps/common/before-hooks.ts` | NEW — `Before` hook for state reset |
| `tests/steps/fixtures.ts` | Import before-hooks |
| `tests/api-helpers.ts` | Add `seedCallWithRecording`, `seedShiftWithVolunteers`, `seedContact` |
| `tests/steps/admin/desktop-admin-steps.ts` | Fix step collisions |
| `tests/steps/dashboard/dashboard-steps.ts` | Rename identity card step |
| `tests/steps/crypto/crypto-steps.ts` | Fix browser context navigation |
| `packages/test-specs/features/admin/settings.feature` | Add `@resets-state` tags |
| `packages/test-specs/features/platform/desktop/misc/setup-wizard.feature` | Add `@resets-state` tags |
| `packages/test-specs/features/core/dashboard.feature` | Fix identity card step text |
| `packages/test-specs/features/platform/desktop/calls/call-recording.feature` | Add data seeding steps |
| `packages/test-specs/features/admin/shift-management.feature` | Add data seeding steps |
| `packages/test-specs/features/core/contacts.feature` | Add data seeding steps |
| `playwright.config.ts` | Optionally add `@resets-state` handling |

## Priority

Medium — The BDD suite passes per-group (the way CI runs it with `test:desktop`). Full serial execution is for thoroughness, not gating. But having 71 failures makes it hard to distinguish real regressions from known serial issues.

## Acceptance Criteria

- Full serial BDD suite: 0 failures (310 tests, 1 worker)
- No scenario depends on state from a previous scenario
- Each scenario creates its own test data via API helpers
- State-mutating scenarios tagged and isolated
- CI can run the full suite without false failures

## Depends On

- Epic 314 (Phase 1 complete)

## Discovered

2026-03-14 during Epic 314 Phase 1 investigation. Root cause identified by comparing per-group vs full-suite results.
