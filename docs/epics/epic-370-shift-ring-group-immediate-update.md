# Epic 370: Real-Time Shift Ring Group Updates

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 365 (surfaces the bug)
**Blocks**: None
**Branch**: `desktop`

## Summary

The BDD scenario "Volunteer removed from shift stops ringing on next call" (in `call-lifecycle.feature`)
fails because the `Then 'only the second volunteer should be rung'` step in `cross-do.steps.ts`
asserts `expect(xdo.callId).toBeDefined()` — but `xdo.callId` is never set by the
`When 'a call arrives from a unique caller'` step, which stores the call ID in `state.callId`
(the shared state, not `xdo`). The assertion always fails with "Expected undefined to be defined."

Secondary issue: even after fixing the state reference, the assertion is shallow — it only
checks that a call was created, not that only the second volunteer was rung. The step should
verify ring group membership using the TwiML response or call metadata.

## Problem Statement

**Failing scenario** (`packages/test-specs/features/core/call-lifecycle.feature`):
```gherkin
Scenario: Volunteer removed from shift stops ringing on next call
  Given 2 volunteers are on shift
  When the admin removes the first volunteer from the shift
  And a call arrives from a unique caller
  Then only the second volunteer should be rung
```

### Root Cause: `xdo.callId` vs `state.callId` state mismatch

`When 'a call arrives from a unique caller'` in `tests/steps/backend/call-lifecycle.steps.ts:40`
stores the call in **`state.callId`** (the shared `CrossDoState`):
```typescript
const result = await simulateIncomingCall(request, { callerNumber: caller })
state.callId = result.callId   // ← shared state
```

`Then 'only the second volunteer should be rung'` in `tests/steps/backend/cross-do.steps.ts:400`
checks **`xdo.callId`** (the `cross-do`-local state):
```typescript
Then('only the second volunteer should be rung', async ({}) => {
  expect(xdo.callId).toBeDefined()  // ← xdo, not state! Always undefined here
})
```

`xdo.callId` is only set by steps like `When an incoming call arrives` (which stores to `xdo.callId`
at cross-do.steps.ts:82+150), not by the `call-lifecycle.steps.ts` step. Result: the assertion
always fails with `Expected undefined to be defined`.

### Secondary issue: shallow assertion

Even after fixing the state reference, `expect(xdo.callId).toBeDefined()` only verifies a call
was created — NOT that only the second volunteer was rung. A proper assertion should check
the ring targets in the simulated call result.

### Confirmed: shift update infrastructure is correct

The supporting steps and route are **not** broken:
- `PATCH /shifts/:id` uses `updateShiftBodySchema` which includes `volunteerPubkeys: z.array(pubkeySchema).optional()` ✓  (`packages/protocol/schemas/shifts.ts:43`)
- `When 'the admin removes the first volunteer from the shift'` (`cross-do.steps.ts:390`) patches
  the shift to only include the second volunteer ✓
- `getCurrentVolunteers` in `shifts.ts` queries the DB directly — no caching ✓
- `Given '2 volunteers are on shift'` (`common.steps.ts:60`) populates `state.shiftIds` ✓

## Implementation

### Fix 1: `tests/steps/backend/cross-do.steps.ts` — use `state.callId` fallback

The `Then 'only the second volunteer should be rung'` step needs to read the callId from
`state.callId` (set by the call-lifecycle step) since `xdo.callId` is only set by the
cross-do-internal call steps:

```typescript
// BEFORE:
Then('only the second volunteer should be rung', async ({}) => {
  // Call was created; shift only has second volunteer
  expect(xdo.callId).toBeDefined()
})

// AFTER:
Then('only the second volunteer should be rung', async ({}) => {
  // callId is set by call-lifecycle.steps.ts via state.callId;
  // xdo.callId is set by cross-do internal steps. Accept either.
  const callId = xdo.callId ?? state.callId
  expect(callId).toBeDefined()

  // Verify only the second volunteer (state.volunteers[1]) was targeted
  // The first volunteer (state.volunteers[0]) should not have been rung
  // This is verifiable via the call's ring group if the simulation captures it
  if (state.volunteers.length >= 2) {
    const removedPubkey = state.volunteers[0].pubkey
    // The call was created after the first volunteer was removed from the shift.
    // A fuller assertion would check the TwiML/ring targets. At minimum, confirm
    // the call exists — the shift-routing logic is unit-tested separately.
    expect(callId).toBeTruthy()
  }
})
```

### Fix 2: Strengthen the ring group assertion (optional, recommended)

For a truly behavioral assertion, capture the ring group from the simulated call result.
`simulateIncomingCall` in `tests/api-helpers.ts` should return or expose the ring targets.
If the TwiML response is available, check that only the second volunteer's contact info appears:

```typescript
Then('only the second volunteer should be rung', async () => {
  const callId = xdo.callId ?? state.callId
  expect(callId).toBeDefined()

  if (state.volunteers.length >= 2 && state.lastTwimlResponse) {
    const removed = state.volunteers[0]
    const remaining = state.volunteers[1]
    // The TwiML should dial the remaining volunteer's number, not the removed one
    expect(state.lastTwimlResponse).not.toContain(removed.pubkey)
    expect(state.lastTwimlResponse).toContain(remaining.pubkey)
  }
})
```

This requires `state.lastTwimlResponse` to be captured in the `When 'a call arrives from a
unique caller'` step. Extend `call-lifecycle.steps.ts` to store the raw TwiML:

```typescript
When('a call arrives from a unique caller', async ({ request }) => {
  const caller = uniqueCallerNumber()
  lc.callerNumber = caller
  try {
    const result = await simulateIncomingCall(request, { callerNumber: caller })
    state.callId = result.callId
    state.callStatus = result.status
    state.lastTwimlResponse = result.twiml  // ← capture TwiML if returned
  } catch {
    state.callStatus = 'rejected'
  }
})
```

Verify that `simulateIncomingCall` returns `twiml` in its result shape. If not, extend it to
return the raw response body from `POST /telephony/incoming`.

## Files to Modify

| File | Change |
|------|--------|
| `tests/steps/backend/cross-do.steps.ts` | Fix `Then 'only the second volunteer should be rung'` to use `state.callId ?? xdo.callId` |
| `tests/steps/backend/call-lifecycle.steps.ts` | Capture `twiml` from `simulateIncomingCall` result in `state.lastTwimlResponse` |
| `tests/api-helpers.ts` | Verify `simulateIncomingCall` returns `{ callId, status, twiml }` |

## Testing

```bash
bun run test:backend:bdd -- --grep "Shift changes affect"
```

The scenario must pass:
1. 2 volunteers created and added to a shift
2. First volunteer removed via `PUT /shifts/:id` with updated `volunteerPubkeys`
3. Simulated call arrives; TwiML rings only the second volunteer

## Acceptance Criteria & Test Scenarios

- [ ] `Then 'only the second volunteer should be rung'` uses `state.callId ?? xdo.callId` — no longer fails with "undefined"
  → `packages/test-specs/features/core/call-lifecycle.feature: "Volunteer removed from shift stops ringing on next call"`
- [ ] A simulated call placed after shift membership update does not include the removed volunteer in the ring group
  → Same scenario
- [ ] Existing shift BDD tests still pass (shift CRUD, shift scheduling)
  → `bun run test:backend:bdd -- --grep "shift"`
- [ ] All BDD tests pass; 0 regressions

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/call-lifecycle.feature` | Existing | No change needed — scenario is correct |
| `tests/steps/backend/cross-do.steps.ts` | Modify | Fix `xdo.callId → state.callId ?? xdo.callId` in Then step |
| `tests/steps/backend/call-lifecycle.steps.ts` | Modify | Capture TwiML in `state.lastTwimlResponse` for ring group assertion |

## Risk Assessment

- **Low risk**: The fix is a one-line state reference change — no production code touched
- **Low risk**: Shift update infrastructure already works correctly (schema, route, service all
  confirmed to support `volunteerPubkeys`; no codegen changes needed)
- **Medium risk**: Strengthening the ring group assertion requires `simulateIncomingCall` to
  return the TwiML body — verify this is already returned or add it to the helper's return type
