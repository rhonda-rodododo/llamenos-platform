# Epic 366: Hub Key Lifecycle Fix

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 365 (surfaces the bugs)
**Blocks**: None
**Branch**: `desktop`

## Summary

Fix three failing `@crypto`-tagged BDD scenarios in `hub-key-lifecycle.feature`. The hub key
`PUT /hubs/:id/key` endpoint expects `{ envelopes: Array<{ pubkey, wrappedKey, ephemeralPubkey }> }`
but the step definitions (Epic 365) send `{ envelopes: { [pubkey]: string } }` (a flat dict of base64
strings). The `GET /hubs/:id/key` response is correctly per-member-filtered but the steps expect
`{ envelope: string }` whereas the schema returns `{ envelope: { pubkey, wrappedKey, ephemeralPubkey } }`.
Fix: update the step definitions to match the actual API contract and use proper mock ECIES envelopes.

## Problem Statement

Three hub-key-lifecycle scenarios fail:

1. **Hub key distributed to all members** — `PUT /hubs/:id/key` validation fails (400) because the step
   sends `{ envelopes: { [pubkey]: string } }` instead of `{ envelopes: Array<{ pubkey, wrappedKey, ephemeralPubkey }> }`.
   The schema `hubKeyEnvelopesBodySchema` strictly validates the array shape.

2. **Removed member loses hub key access** — fails on the same PUT format problem, then the follow-up
   GET assertion fails because `res.data.envelope` is an object `{ pubkey, wrappedKey, ephemeralPubkey }`,
   not a string.

3. **Hub key rotation on member departure** — fails for both reasons above.

Root cause: `tests/steps/backend/hub-key-lifecycle.steps.ts` was written with a simplified mock format
that doesn't match the protocol schema in `packages/protocol/schemas/hubs.ts`. The API is correct.
The step definitions need to be updated.

**Files affected**:
- `tests/steps/backend/hub-key-lifecycle.steps.ts` (bug source)
- `packages/protocol/schemas/hubs.ts:34` — `hubKeyEnvelopeResponseSchema` (correct, no change)
- `packages/protocol/schemas/hubs.ts:60` — `hubKeyEnvelopesBodySchema` (correct, no change)

## Implementation

### Fix 1: Update PUT body format in step definitions

**File**: `tests/steps/backend/hub-key-lifecycle.steps.ts`

The `generateMockEnvelope` helper and the code that calls `apiPut` must produce the correct shape:

```typescript
// BEFORE (wrong):
function generateMockEnvelope(pubkey: string, seed: string): string {
  return Buffer.from(`envelope:${pubkey}:${seed}:${Date.now()}`).toString('base64')
}

// ... and calling:
const envelopes: Record<string, string> = {}
envelopes[member.pubkey] = generateMockEnvelope(member.pubkey, 'initial')
await apiPut(request, `/hubs/${hkState.hubId}/key`, { envelopes })
```

```typescript
// AFTER (correct — matches hubKeyEnvelopesBodySchema):
function generateMockEnvelopeEntry(
  pubkey: string,
  seed: string,
): { pubkey: string; wrappedKey: string; ephemeralPubkey: string } {
  // wrappedKey: z.string().min(1) — any non-empty string is valid
  // Encode pubkey + seed so each member gets a DISTINCT wrappedKey (no Date.now() drift risk)
  const wrapped = Buffer.from(`wrapped:${pubkey}:${seed}`).toString('base64')
  // ephemeralPubkey: pubkeySchema = ^[0-9a-f]{64}$
  // Use a fixed 64-char hex placeholder (doesn't need to be per-member for schema validation)
  const ephemeralPubkey = pubkey  // real pubkeys are 64-char hex — reuse for simplicity
  return { pubkey, wrappedKey: wrapped, ephemeralPubkey }
}
```

Then the PUT call becomes:
```typescript
const envelopes: Array<{ pubkey: string; wrappedKey: string; ephemeralPubkey: string }> = []
for (const [name, member] of hkState.members) {
  const entry = generateMockEnvelopeEntry(member.pubkey, 'initial')
  envelopes.push(entry)
  hkState.originalEnvelopes.set(name, entry.wrappedKey)
  hkState.currentEnvelopes.set(name, entry.wrappedKey)
}
const res = await apiPut(request, `/hubs/${hkState.hubId}/key`, { envelopes })
expect(res.status).toBe(200)
```

### Fix 2: Update GET response assertion

**File**: `tests/steps/backend/hub-key-lifecycle.steps.ts`

```typescript
// BEFORE (wrong):
const res = await apiGet<{ envelope: string }>(...)
expect(res.data.envelope).toBeTruthy()
hkState.fetchResults.set(name, { status: res.status, envelope: res.data.envelope })

// AFTER (correct — envelope is an object):
const res = await apiGet<{ envelope: { pubkey: string; wrappedKey: string; ephemeralPubkey: string } }>(...)
expect(res.status).toBe(200)
expect(res.data.envelope).toBeTruthy()
expect(res.data.envelope.wrappedKey).toBeTruthy()
// Store wrappedKey as the comparison token
hkState.fetchResults.set(name, { status: res.status, envelope: res.data.envelope.wrappedKey })
```

### Fix 3: Update "each envelope should be unique per member"

The uniqueness check compares `wrappedKey` values. Since each member's `wrappedKey` encodes
their distinct `pubkey` in the mock (not `Date.now()`), values are guaranteed distinct even
under rapid execution. ✓

### Fix 4: Update "removed member gets 404" assertion

The test step `{string} should receive {int} when fetching their hub key envelope` is correct —
the route already returns 404 when the member has no envelope stored. No change needed.

### Fix 5: Update "envelopes contain exactly N entries" check

The `lastEnvelopeCount` tracks the number of envelopes in the last PUT, which is already correct.
No change needed.

### Fix 6: Update the `{string} is removed from the hub` step

Currently the step deletes the volunteer via `DELETE /volunteers/:pubkey`. This will fail auth
or deactivate the volunteer rather than removing them from a hub membership. The hub membership
is stored in `hub_keys` table implicitly (via the envelopes). Removing the member from the hub
means simply NOT including their envelope in the next PUT.

Update the step to reflect actual behavior: mark the member as removed in local state, then
omit them from the next PUT:

```typescript
When('{string} is removed from the hub', async ({ request }, name: string) => {
  // Mark as removed in local state — we omit this member from subsequent key updates.
  // NOTE: Do NOT call DELETE /volunteers/:pubkey here. That permanently deletes the volunteer,
  // causing subsequent auth to return 401 (volunteer not found), not 404 (no envelope).
  // The "removed from hub" concept is modelled by simply not including their envelope
  // in the next PUT, which causes setHubKeyEnvelopes' replace-all transaction to delete
  // their row from hub_keys. Their GET then returns 404 ("No key envelope for this user"). ✓
  hkState.currentEnvelopes.delete(name)
})
```

The feature scenario then works end-to-end: after removing Carol's entry from `currentEnvelopes`,
the next PUT only includes Alice and Bob, and Carol's GET returns 404 because her envelope
was deleted by the replace-all transaction in `setHubKeyEnvelopes`.

## Files to Modify

| File | Change |
|------|--------|
| `tests/steps/backend/hub-key-lifecycle.steps.ts` | Fix PUT body format, GET response assertions, `removedFromHub` step logic |

## Testing

Run:
```bash
bun run test:backend:bdd -- --grep "Hub Key Lifecycle"
```

All 3 scenarios must pass:
- Hub key distributed to all members
- Removed member loses hub key access
- Hub key rotation on member departure

## Acceptance Criteria & Test Scenarios

- [ ] PUT `/hubs/:id/key` accepts `{ envelopes: Array<{ pubkey, wrappedKey, ephemeralPubkey }> }` and returns 200
  → `packages/test-specs/features/security/hub-key-lifecycle.feature: "Hub key distributed to all members"`
- [ ] GET `/hubs/:id/key` returns `{ envelope: { pubkey, wrappedKey, ephemeralPubkey } }` for the requesting member
  → `packages/test-specs/features/security/hub-key-lifecycle.feature: "Hub key distributed to all members"`
- [ ] After updating envelopes for only 2 of 3 members, the removed member gets 404 on GET
  → `packages/test-specs/features/security/hub-key-lifecycle.feature: "Removed member loses hub key access"`
- [ ] New envelopes differ from originals after rotation
  → `packages/test-specs/features/security/hub-key-lifecycle.feature: "Hub key rotation on member departure"`
- [ ] All 3 hub-key-lifecycle scenarios pass; total suite still 588+
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/security/hub-key-lifecycle.feature` | Existing | No change — scenarios are correct |
| `tests/steps/backend/hub-key-lifecycle.steps.ts` | Modify | Fix PUT format, GET response shape, removal step |

## Risk Assessment

- **Low risk**: Only test/step definition changes — no production code modified
- **Confirmed safe**: `pubkeySchema = z.string().regex(/^[0-9a-f]{64}$/)` — using the member's
  own pubkey as `ephemeralPubkey` satisfies this constraint since real pubkeys are 64-char hex
- **Confirmed safe**: `wrappedKey = z.string().min(1)` — base64 string of any length works
- **Low risk**: `setHubKeyEnvelopes` uses a replace-all transaction: deletes all existing
  envelopes for the hub, then re-inserts only the provided ones. This is already the correct
  behaviour for the revocation scenario — confirmed in `apps/worker/services/settings.ts:1628`
