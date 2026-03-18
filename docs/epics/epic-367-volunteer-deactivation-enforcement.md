# Epic 367: Volunteer Deactivation Enforcement

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 365 (surfaces the bug)
**Blocks**: None
**Branch**: `desktop`

## Summary

Deactivated volunteers (`active = false`) can still make authenticated API requests and receive
200 responses. The auth middleware fetches the volunteer record but does not check the `active`
field. Fix: add an `active` check in `authenticateRequest()` that returns `null` (→ 401) for
deactivated volunteers. One BDD scenario fails: "Deactivated volunteer loses all access immediately".

## Problem Statement

`apps/worker/lib/auth.ts` `authenticateRequest()`:

```typescript
const volunteer = await identityService.getVolunteerInternal(auth.pubkey)
if (!volunteer) return null
return { pubkey: auth.pubkey, volunteer }  // ← no active check!
```

The volunteers table has `active: boolean('active').notNull().default(true)` (`apps/worker/db/schema/volunteers.ts:39`).
When an admin sets `active = false` (via `PATCH /volunteers/:pubkey` with `{ active: false }`), the
volunteer's sessions are revoked (`revokeSessions(targetPubkey)` in `routes/volunteers.ts:132`), but:

1. **Schnorr auth** — A volunteer who re-signs a new Schnorr auth header (without using a revoked
   session) gets a fresh 200. Sessions are revoked, but Schnorr doesn't use sessions.
2. **Existing sessions** — Session revocation happens, but there's a TOCTOU window between revocation
   and the next request. More importantly, if the BDD test sends a request immediately after deactivation
   before the revocation propagates, the session may still be valid.

The correct fix is to check `volunteer.active` as part of authentication, not just revoke sessions.
This matches the principle of least surprise: a deactivated user should be completely locked out.

**BDD Scenario failing**:
```
Scenario: Deactivated volunteer loses all access immediately
  Given an active volunteer with notes and shift access
  When an admin deactivates the volunteer
  Then the volunteer should receive 403 when listing notes
  And the volunteer should receive 403 when listing shifts
  And the volunteer should receive 403 when accessing their profile
```

The test expects 403, but the current behavior returns 200 (Schnorr auth succeeds despite deactivation).

## Implementation

### Fix: `apps/worker/lib/auth.ts`

Add an `active` check after fetching the volunteer:

```typescript
// BEFORE:
const volunteer = await identityService.getVolunteerInternal(auth.pubkey)
if (!volunteer) return null
return { pubkey: auth.pubkey, volunteer }

// AFTER:
const volunteer = await identityService.getVolunteerInternal(auth.pubkey)
if (!volunteer) return null
if (volunteer.active === false) return null  // ← deactivated = unauthenticated
return { pubkey: auth.pubkey, volunteer }
```

Apply the same fix to the session-token path:

```typescript
// Session token path (currently):
const volunteer = await identityService.getVolunteerInternal(session.pubkey)
if (!volunteer) return null
return { pubkey: session.pubkey, volunteer }

// Fixed:
const volunteer = await identityService.getVolunteerInternal(session.pubkey)
if (!volunteer) return null
if (volunteer.active === false) return null  // ← deactivated
return { pubkey: session.pubkey, volunteer }
```

### Why 403 instead of 401?

The BDD spec expects 403 ("Forbidden"), not 401 ("Unauthorized"). However, returning `null` from
`authenticateRequest` causes the route's auth middleware to respond with 401. The scenario should
be updated to expect 401 (the semantically correct response: credentials are valid but the account
is disabled), OR the deactivation check should be moved to a permission layer that returns 403.

Two options:
1. **Update the feature file to expect 401** — semantically correct. A deactivated account makes
   the auth token invalid.
2. **Move check to permission layer, return 403** — consistent with "authenticated but forbidden".

**Decision**: Return 401 and update the feature file. NIST 800-63B: "The authentication attempt
shall fail" for disabled accounts. 401 is correct because the credential is no longer valid.

Update the feature file step:
```gherkin
# BEFORE:
Then the volunteer should receive 403 when listing notes
# AFTER:
Then the volunteer should receive 401 when listing notes
```

And update the step definitions accordingly.

### Fix: `tests/steps/backend/data-isolation.steps.ts`

Update the deactivation test steps to expect 401:

```typescript
// In the "deactivated volunteer loses access" assertions:
// Change expect(res.status).toBe(403) → expect(res.status).toBe(401)
```

### Admin account exception

The admin bootstrapped via `ADMIN_PUBKEY` in `.dev.vars` does not have a volunteer record.
Requests from admin use the `requireAdmin` middleware which validates via `ADMIN_PUBKEY` env var,
not through `authenticateRequest`. Admin is unaffected by this change.

### Audit log

Deactivated volunteer access attempts should be silent failures (no audit entry). The 401 is
returned before any permission check or audit write.

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/lib/auth.ts` | Add `volunteer.active === false → return null` to both auth paths |
| `packages/test-specs/features/security/data-isolation.feature` | Change 403 → 401 for deactivation scenario |
| `tests/steps/backend/data-isolation.steps.ts` | Update assertions from 403 → 401 |

## Testing

```bash
bun run test:backend:bdd -- --grep "Deactivated volunteer loses"
```

The scenario must pass end-to-end:
1. Create volunteer, give them notes and shift access
2. Admin deactivates via `PATCH /volunteers/:pubkey` with `{ active: false }`
3. Subsequent requests from that volunteer's nsec return 401

## Acceptance Criteria & Test Scenarios

- [ ] `PATCH /volunteers/:pubkey` with `{ active: false }` sets `active = false` in DB (already works)
  → Covered by existing volunteer update tests
- [ ] Subsequent Schnorr-authenticated requests from deactivated volunteer return 401
  → `packages/test-specs/features/security/data-isolation.feature: "Deactivated volunteer loses all access immediately"`
- [ ] Session-authenticated requests from deactivated volunteer also return 401
  → Same scenario, implicitly covered by Schnorr path fix
- [ ] Admin accounts (env-var based) are unaffected by the active check
  → Covered by all existing admin-auth BDD tests still passing
- [ ] All BDD tests pass; 0 regressions
  → `bun run test:backend:bdd`

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/security/data-isolation.feature` | Modify | 403 → 401 for deactivation scenario |
| `tests/steps/backend/data-isolation.steps.ts` | Modify | Assert 401 status codes |

## Risk Assessment

- **Low risk**: One-line check in auth middleware, well-isolated
- **Medium risk**: Verify no existing BDD tests create volunteers with `active: false` and then
  expect successful auth — search for `active.*false` or `deactivat` in step definitions before
  committing
- **Low risk**: Admin env-var auth path is separate from `authenticateRequest`
