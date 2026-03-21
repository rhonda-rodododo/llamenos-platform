# Security Remediation — Worker Backend & Hub Key Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 security findings in the worker backend — missing auth on the hub key endpoint, webhook hub resolution from untrusted URL params, volunteer pubkey in Twilio callback URLs, raw phone in audit log, and permission hardening.

> **Codebase audit 2026-03-21:** All 10 findings remain open. One finding has an architectural ambiguity:
> - **HIGH-W1** (Task 4): `serverEventKeyHex` is still delivered to all authenticated users in `auth.ts`. The audit agent noted this may have been made intentional in Epic 252/258, but no gating code was found — it is still open. The plan's approach (scope to `settings:manage` permission) is correct unless a design decision overrides it. **Confirm with team before implementing Task 4.**

**Architecture:** All fixes are confined to the worker backend (`apps/worker/`). CRIT-H1 adds `requirePermission` middleware to the unguarded `GET /:hubId/key` route using the same hub-access check already in `GET /:hubId`. CRIT-W1/W2 dissolve the global `telephony.use('*', ...)` middleware that trusts the `?hub=` URL param into per-route validation from the call record, and replace the raw volunteer pubkey URL param with a single-use opaque call token stored in PostgreSQL. Tasks 2, 4, 5, 6, and 7 are smaller scoped fixes (audit log hashing, dev endpoint status codes, Twilio SID regex, serverEventKeyHex permission gate, WakePayload hubId field, and permission hardening notes).

**Tech Stack:** Bun, Hono, PostgreSQL, Drizzle ORM, Twilio webhooks

---

> **HIGH-W2 (rate limiting) — Closed N/A**: Investigation confirmed the rate limiting logic is correct. `checkRateLimit()` returns `{ limited: boolean }` and the `if (limited) return 429` condition is correctly implemented. No change needed.

---

## File Map

| File | Findings |
|------|----------|
| `apps/worker/routes/hubs.ts` | CRIT-H1 (missing auth on `GET /:hubId/key`) |
| `apps/worker/routes/bans.ts` | HIGH-W3 (raw phone in audit log), MED-W2 (wrong permission on `POST /bans`) |
| `apps/worker/routes/dev.ts` | HIGH-W4 (403 instead of 404 for dev endpoints) |
| `apps/worker/routes/settings.ts` | HIGH-W5 (no Twilio SID regex in test URL construction) |
| `apps/worker/routes/auth.ts` | HIGH-W1 (serverEventKeyHex returned to non-admin), HIGH-H1 (architecture comment) |
| `apps/worker/routes/telephony.ts` | CRIT-W1 (hub from URL param), CRIT-W2 (pubkey in URL) |
| `apps/worker/db/schema/calls.ts` | CRIT-W2 (call_token column) |
| `apps/worker/services/calls.ts` | CRIT-W2 (resolveCallToken service method) |
| `apps/worker/telephony/twilio.ts` | CRIT-W2 (callToken in ringing URLs) |
| `apps/worker/telephony/vonage.ts` | CRIT-W2 (callToken in ringing URLs) |
| `apps/worker/telephony/plivo.ts` | CRIT-W2 (callToken in ringing URLs) |
| `apps/worker/telephony/asterisk.ts` | CRIT-W2 (callToken in ringing URLs) |
| `apps/worker/telephony/adapter.ts` | CRIT-W2 (update RingVolunteersParams, CallAnsweredParams) |
| `apps/worker/services/ringing.ts` | CRIT-W2 (generate callToken per volunteer) |
| `apps/worker/types/infra.ts` | HIGH-H5 (add hubId to WakePayload) |
| `packages/protocol/schemas/settings.ts` | HIGH-W5 (Twilio SID regex in telephonyProviderSchema) |
| `packages/test-specs/features/security/hub-key-lifecycle.feature` | CRIT-H1 (new auth guard scenarios) |
| `packages/test-specs/features/security/api-contracts.feature` | HIGH-W3, HIGH-W4, HIGH-W5, MED-W2 scenarios |
| `tests/steps/backend/hub-key-lifecycle.steps.ts` | CRIT-H1 step implementations |
| `tests/steps/backend/contracts.steps.ts` | HIGH-W3, HIGH-W4, HIGH-W5, MED-W2 step implementations |

---

## Task 1: CRIT-H1 — Hub key endpoint auth guard

**Files:**
- Modify: `apps/worker/routes/hubs.ts` (line 249: `routes.get('/:hubId/key', ...)`)
- Modify: `packages/test-specs/features/security/hub-key-lifecycle.feature`
- Modify: `tests/steps/backend/hub-key-lifecycle.steps.ts`

The `GET /:hubId/key` route at line 249 has no `requirePermission` call and no hub membership check. Any authenticated user can retrieve any other member's encrypted key envelope. The fix mirrors the access control pattern at lines 130-134 (used in `GET /:hubId`).

- [ ] **Step 1: Write the failing BDD scenarios**

Add to `packages/test-specs/features/security/hub-key-lifecycle.feature` after the existing scenarios:

```gherkin
  # ── Auth Guards ───────────────────────────────────────────────────

  Scenario: Unauthenticated request to hub key endpoint returns 401
    Given a hub exists with a member "Alice"
    And hub key envelopes are set for "Alice"
    When an unauthenticated client requests the hub key
    Then the response status should be 401

  Scenario: Non-member cannot fetch hub key envelope
    Given a hub exists with a member "Alice"
    And hub key envelopes are set for "Alice"
    And a volunteer "Eve" who is not a hub member
    When "Eve" requests the hub key envelope
    Then the response status should be 403

  Scenario: Member without an envelope receives 404
    Given a hub exists with a member "Alice"
    And hub key envelopes are set for "Alice"
    And a volunteer "Bob" is added to the hub but has no envelope
    When "Bob" requests the hub key envelope
    Then the response status should be 404
```

- [ ] **Step 2: Run tests to confirm they fail**

```
bun run test:backend:bdd --grep "Unauthenticated request to hub key"
```

Expected: FAIL (currently 200/200/404 instead of 401/403/404 — the first two pass without auth because the route has no middleware)

- [ ] **Step 3: Implement the fix in `apps/worker/routes/hubs.ts`**

At line 249, the current route is:
```typescript
routes.get('/:hubId/key',
  describeRoute({ ... }),
  async (c) => {
    const hubId = c.req.param('hubId')
    const pubkey = c.get('pubkey')
    ...
  },
)
```

Replace it with:
```typescript
routes.get('/:hubId/key',
  describeRoute({
    tags: ['Hubs'],
    summary: 'Get hub key envelope for current user',
    responses: {
      200: {
        description: 'Hub key envelope',
        content: {
          'application/json': {
            schema: resolver(hubKeyEnvelopeResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('hubs:read'),
  async (c) => {
    const hubId = c.req.param('hubId')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const user = c.get('user')
    const permissions = c.get('permissions')

    // Check hub membership — super admin bypasses (same pattern as GET /:hubId lines 130-134)
    const isSuperAdmin = checkPermission(permissions, '*')
    const hasHubAccess = (user.hubRoles || []).some(hr => hr.hubId === hubId)
    if (!isSuperAdmin && !hasHubAccess) {
      return c.json({ error: 'Access denied' }, 403)
    }

    try {
      const { envelopes } = await services.settings.getHubKeyEnvelopes(hubId)

      // Return only the envelope for this user
      const myEnvelope = envelopes.find(e => e.pubkey === pubkey)
      if (!myEnvelope) return c.json({ error: 'No key envelope for this user' }, 404)

      return c.json({ envelope: myEnvelope })
    } catch {
      return c.json({ error: 'Hub not found' }, 404)
    }
  },
)
```

- [ ] **Step 4: Write step definitions for the new scenarios**

In `tests/steps/backend/hub-key-lifecycle.steps.ts`, add the following after the existing imports and state management:

```typescript
// ── Auth Guard Steps ─────────────────────────────────────────────

Given('a hub exists with a member {string}', async ({ request, world }, name: string) => {
  const hkState = getHubKeyState(world)
  hkState.hubId = await createHub(request)
  const vol = await createVolunteerViaApi(request, { name: `${name} ${Date.now()}` })
  hkState.members.set(name, { name, nsec: vol.nsec, pubkey: vol.pubkey })
})

Given('hub key envelopes are set for {string}', async ({ request, world }, name: string) => {
  const hkState = getHubKeyState(world)
  expect(hkState.hubId).toBeTruthy()
  const member = hkState.members.get(name)
  expect(member).toBeTruthy()
  const entry = generateMockEnvelopeEntry(member!.pubkey, 'initial')
  hkState.originalEnvelopes.set(name, entry.wrappedKey)
  const res = await apiPut(request, `/hubs/${hkState.hubId}/key`, { envelopes: [entry] })
  expect(res.status).toBe(200)
})

Given('a volunteer {string} who is not a hub member', async ({ request, world }, name: string) => {
  const vol = await createVolunteerViaApi(request, { name: `${name} ${Date.now()}` })
  getHubKeyState(world).members.set(name, { name, nsec: vol.nsec, pubkey: vol.pubkey })
  // Note: NOT added to hub members list — just a registered user with no hub role
})

Given('a volunteer {string} is added to the hub but has no envelope', async ({ request, world }, name: string) => {
  const hkState = getHubKeyState(world)
  const vol = await createVolunteerViaApi(request, { name: `${name} ${Date.now()}` })
  hkState.members.set(name, { name, nsec: vol.nsec, pubkey: vol.pubkey })
  // Add to hub membership but do NOT set an envelope for them
  const res = await apiPost(request, `/hubs/${hkState.hubId}/members`, {
    pubkey: vol.pubkey,
    roleIds: ['role-volunteer'],
  })
  expect(res.status).toBe(200)
})

When('an unauthenticated client requests the hub key', async ({ request, world }) => {
  const hkState = getHubKeyState(world)
  // Make request with no auth header (apiGet always adds auth — use raw fetch)
  const res = await request.get(`${BASE_URL}/api/hubs/${hkState.hubId}/key`)
  getHubKeyState(world).fetchResults.set('_unauth', { status: res.status() })
})

When('{string} requests the hub key envelope', async ({ request, world }, name: string) => {
  const hkState = getHubKeyState(world)
  const member = hkState.members.get(name)
  expect(member).toBeTruthy()
  const res = await apiGet(request, `/hubs/${hkState.hubId}/key`, member!.nsec)
  hkState.fetchResults.set(name, { status: res.status })
})

Then('the response status should be {int}', async ({ world }, expectedStatus: number) => {
  // Find the most recently stored result (last entry in fetchResults map)
  const results = [...getHubKeyState(world).fetchResults.values()]
  const last = results[results.length - 1]
  expect(last).toBeTruthy()
  expect(last.status).toBe(expectedStatus)
})
```

Also add `BASE_URL` at the top of the file (after imports):
```typescript
const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
```

- [ ] **Step 5: Run tests again to confirm they pass**

```
bun run test:backend:bdd --grep "hub key"
```

Expected: All hub-key-lifecycle scenarios PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/routes/hubs.ts \
        packages/test-specs/features/security/hub-key-lifecycle.feature \
        tests/steps/backend/hub-key-lifecycle.steps.ts
git commit -m "$(cat <<'EOF'
fix(security): CRIT-H1 add auth guard to GET /:hubId/key endpoint

Unauthenticated requests now return 401 (requirePermission gate).
Non-hub-members return 403 (same hubRoles check as GET /:hubId).
Hub members without an envelope still return 404.
BDD scenarios cover all three cases.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Quick independent fixes — HIGH-W3 + HIGH-W4 + HIGH-W5

**Files:**
- Modify: `apps/worker/routes/bans.ts`
- Modify: `apps/worker/routes/dev.ts`
- Modify: `packages/protocol/schemas/settings.ts`
- Modify: `packages/test-specs/features/security/api-contracts.feature`
- Modify: `tests/steps/backend/contracts.steps.ts`

### HIGH-W3: Raw phone number in audit log

In `apps/worker/routes/bans.ts` at line 63, the `numberBanned` audit call passes the raw phone:
```typescript
await audit(services.audit, 'numberBanned', pubkey, { phone: body.phone })
```

The file already imports `hashPhone` is NOT imported (check: line 1-10 imports do not include it). `hashPhone` is used in `apps/worker/lib/crypto.ts`.

Fix: add import and hash the phone in the audit call.

### HIGH-W4: Dev endpoints return 403 instead of 404

In `apps/worker/routes/dev.ts`, `checkResetSecret` returns `false` when the secret doesn't match, and the callers return 403. This reveals that a dev endpoint exists. There are **five** guard sites that return 403 on secret mismatch:
- Line 40-41: `/test-reset` handler
- Line 73-74: `/test-reset-no-admin` handler
- Line 109-110: `/test-reset-records` handler
- Line 130-131: `/test-promote-admin` handler
- Line 168-169: `/test-setup-cms` handler

Each uses the pattern:
```typescript
if (!checkResetSecret(c)) {
  return c.json({ error: 'Forbidden' }, 403)
}
```

All five must be changed to return 404 (endpoint does not exist for unauthorized callers):
```typescript
if (!checkResetSecret(c)) {
  return c.json({ error: 'Not Found' }, 404)
}
```

Note: `simulationGuard` at line 327 already returns 404 on secret mismatch — normalize all five reset/setup endpoints to match.

### HIGH-W5: No Twilio SID format validation in telephonyProviderSchema

In `packages/protocol/schemas/settings.ts` at line 146-165, `telephonyProviderSchema` has:
```typescript
accountSid: z.string().optional(),
```

The `/settings/telephony-provider/test` endpoint at `apps/worker/routes/settings.ts` line 434 constructs:
```typescript
testUrl = `https://api.twilio.com/2010-04-01/Accounts/${body.accountSid}.json`
```

Without sanitization, a crafted `accountSid` could redirect the server-side fetch. Fix: add regex validation in the schema AND encode the value in the URL.

- [ ] **Step 1: Write failing BDD scenarios**

Add to `packages/test-specs/features/security/api-contracts.feature`:

```gherkin
  # ─── Ban Audit Log Privacy ──────────────────────────────────────

  Scenario: Ban audit log does not expose raw phone number
    Given I am authenticated as admin
    When an admin sends "POST" to "/api/bans" with body:
      | phone  | +15551234567 |
      | reason | audit log test |
    Then the response status should be 200
    And the audit log entry for "numberBanned" should not contain the raw phone "+15551234567"

  # ─── Dev Endpoint Disclosure ────────────────────────────────────

  Scenario: Dev reset endpoint returns 404 for wrong secret in development
    When a client sends "POST" to "/api/test-reset" with header "X-Test-Secret: wrong-secret"
    Then the response status should be 404

  Scenario: Dev reset-no-admin endpoint returns 404 for wrong secret in development
    When a client sends "POST" to "/api/test-reset-no-admin" with header "X-Test-Secret: wrong-secret"
    Then the response status should be 404

  # ─── Twilio SID Format Validation ───────────────────────────────

  Scenario: Telephony provider test rejects malformed Twilio Account SID
    When an admin sends "POST" to "/api/settings/telephony-provider/test" with body:
      | type       | twilio            |
      | accountSid | NOT_A_REAL_SID    |
      | authToken  | test              |
    Then the response status should be 400
```

- [ ] **Step 2: Run tests to confirm they fail**

```
bun run test:backend:bdd --grep "Ban audit log|Dev reset endpoint|Twilio SID"
```

Expected: FAIL

- [ ] **Step 3: Implement HIGH-W3 fix in `apps/worker/routes/bans.ts`**

Add import at the top (after existing imports at line 9):
```typescript
import { hashPhone } from '../lib/crypto'
```

At line 63, change:
```typescript
await audit(services.audit, 'numberBanned', pubkey, { phone: body.phone })
```
to:
```typescript
await audit(services.audit, 'numberBanned', pubkey, { phoneHash: hashPhone(body.phone, c.env.HMAC_SECRET) })
```

- [ ] **Step 4: Implement HIGH-W4 fix in `apps/worker/routes/dev.ts`**

There are **five** `return c.json({ error: 'Forbidden' }, 403)` calls inside `checkResetSecret` guard blocks (lines 40, 74, 110, 131, 169). Change all five to return 404:

At line 40:
```typescript
// Before:
if (!checkResetSecret(c)) {
  return c.json({ error: 'Forbidden' }, 403)
}
// After:
if (!checkResetSecret(c)) {
  return c.json({ error: 'Not Found' }, 404)
}
```

Apply the same change at lines 74, 110, 131, and 169 (same pattern, same fix — all five guard sites must be updated).

- [ ] **Step 5: Implement HIGH-W5 fix — Twilio SID regex in schema**

In `packages/protocol/schemas/settings.ts`, change line 148:
```typescript
// Before:
accountSid: z.string().optional(),
// After:
accountSid: z.string().regex(/^AC[0-9a-f]{32}$/, 'Invalid Twilio Account SID format (must start with AC followed by 32 hex chars)').optional(),
```

In `apps/worker/routes/settings.ts`, in the `/telephony-provider/test` handler at line 434, add URI encoding:
```typescript
// Before:
testUrl = `https://api.twilio.com/2010-04-01/Accounts/${body.accountSid}.json`
// After:
testUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(body.accountSid ?? '')}.json`
```

- [ ] **Step 6: Write step implementations**

In `tests/steps/backend/contracts.steps.ts` (or create the file if it does not exist — check first with Glob), add:

```typescript
import { expect } from '@playwright/test'
import { Given, When, Then } from './fixtures'
import { apiPost, apiGet, ADMIN_NSEC } from '../../api-helpers'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

// ── Dev endpoint 404 on wrong secret ─────────────────────────────

When(
  'a client sends {string} to {string} with header {string}',
  async ({ request }, method: string, path: string, headerStr: string) => {
    const [headerName, headerValue] = headerStr.split(': ', 2)
    const url = `${BASE_URL}/api${path.replace('/api', '')}`
    let res: Awaited<ReturnType<typeof request.get>>
    if (method === 'POST') {
      res = await request.post(url, { headers: { [headerName]: headerValue } })
    } else {
      res = await request.get(url, { headers: { [headerName]: headerValue } })
    }
    // Store status for assertion
    ;(global as Record<string, unknown>)._lastContractStatus = res.status()
  },
)

// ── Audit log does not expose raw phone ──────────────────────────

Then(
  'the audit log entry for {string} should not contain the raw phone {string}',
  async ({ request }, eventType: string, rawPhone: string) => {
    const res = await apiGet<{ entries: Array<{ event: string; data: Record<string, unknown> }> }>(
      request,
      '/audit',
      ADMIN_NSEC,
    )
    expect(res.status).toBe(200)
    const matching = res.data.entries.filter(e => e.event === eventType)
    for (const entry of matching) {
      const json = JSON.stringify(entry.data)
      expect(json).not.toContain(rawPhone)
    }
  },
)
```

- [ ] **Step 7: Run tests again to confirm they pass**

```
bun run test:backend:bdd --grep "Ban audit log|Dev reset endpoint|Twilio SID"
bun run typecheck
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/worker/routes/bans.ts \
        apps/worker/routes/dev.ts \
        apps/worker/routes/settings.ts \
        packages/protocol/schemas/settings.ts \
        packages/test-specs/features/security/api-contracts.feature \
        tests/steps/backend/contracts.steps.ts
git commit -m "$(cat <<'EOF'
fix(security): HIGH-W3/W4/W5 — hash phone in audit log, 404 dev endpoints, Twilio SID regex

- bans.ts: audit numberBanned with phoneHash instead of raw phone
- dev.ts: wrong-secret returns 404 not 403 (prevents endpoint discovery)
- settings.ts (schema): accountSid now requires /^AC[0-9a-f]{32}$/ format
- settings.ts (route): encodeURIComponent on accountSid in test URL construction

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: CRIT-W1 + CRIT-W2 — Webhook hub from call record + callToken

**Files:**
- Modify: `apps/worker/db/schema/calls.ts`
- Modify: `apps/worker/services/calls.ts`
- Modify: `apps/worker/telephony/adapter.ts`
- Modify: `apps/worker/telephony/twilio.ts`
- Modify: `apps/worker/telephony/vonage.ts`
- Modify: `apps/worker/telephony/plivo.ts`
- Modify: `apps/worker/telephony/asterisk.ts`
- Modify: `apps/worker/services/ringing.ts`
- Modify: `apps/worker/routes/telephony.ts`
- Modify: `packages/test-specs/features/security/api-contracts.feature`
- Modify: `tests/steps/backend/contracts.steps.ts`

### CRIT-W1: Hub resolved from untrusted URL param
The global `telephony.use('*', ...)` middleware (lines 32-61 in `telephony.ts`) resolves the hub from `url.searchParams.get('hub')`. An attacker can forge `?hub=evil-hub-id` to redirect webhook validation to a different hub's Twilio credentials, bypassing signature verification. For callback routes (user-answer, call-status, call-recording), the hub must be resolved from the `CallSid`/`parentCallSid` body field by looking up `active_calls`.

### CRIT-W2: Volunteer pubkey in callback URLs
The ringing adapters embed `pubkey=${vol.pubkey}` in Twilio callback URLs (e.g., `twilio.ts` line 252). Twilio echoes these back unmodified. An attacker who intercepts or crafts a callback URL can supply any pubkey, bypassing the `answerCall` authorization. The fix: generate a `crypto.randomUUID()` call token per volunteer per ring, store `(callToken, callSid, volunteerPubkey)` in a `call_tokens` table, embed only the opaque token in the URL, and atomically `DELETE ... RETURNING` on use (single-use guarantee).

- [ ] **Step 1: Write failing BDD scenarios**

Add to `packages/test-specs/features/security/api-contracts.feature`:

```gherkin
  # ─── Telephony Callback Security ────────────────────────────────

  Scenario: Telephony callback with forged hub param is rejected
    Given a call is in progress with a known hub
    When a webhook is posted to "/api/telephony/user-answer" with a forged hub param
    Then the response status should be 400 or 403

  Scenario: Telephony callback with unknown call token is rejected
    When a webhook is posted to "/api/telephony/user-answer" with callToken "00000000-0000-0000-0000-000000000000"
    Then the response status should be 403

  Scenario: Call token is consumed on first use and rejected on second use
    Given a call is simulated and a call token is issued
    When the call token is used for the first time
    Then the response succeeds
    When the same call token is used again
    Then the response status should be 403
```

- [ ] **Step 2: Run tests to confirm they fail**

```
bun run test:backend:bdd --grep "Telephony callback"
```

Expected: FAIL (these routes do not yet validate hub from call record or validate tokens)

- [ ] **Step 3: Add `call_tokens` table to the DB schema**

In `apps/worker/db/schema/calls.ts`, add after the `callRecords` table:

```typescript
import { uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// call_tokens  (single-use opaque tokens for Twilio callback routing — CRIT-W2)
// ---------------------------------------------------------------------------
// Each token maps an opaque UUID to a (callSid, volunteerPubkey, hubId) tuple.
// Tokens are DELETE-on-read (atomic single-use) to prevent replay.

export const callTokens = pgTable(
  'call_tokens',
  {
    token: text('token').primaryKey(),          // crypto.randomUUID()
    callSid: text('call_sid').notNull(),
    volunteerPubkey: text('volunteer_pubkey').notNull(),
    hubId: text('hub_id').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('call_tokens_call_sid_idx').on(table.callSid),
    // TTL: tokens older than 5 min are treated as expired in resolveCallToken
    index('call_tokens_created_at_idx').on(table.createdAt),
  ],
)
```

Also export `callTokens` from `apps/worker/db/schema/index.ts`.

- [ ] **Step 4: Add service methods to `CallsService`**

In `apps/worker/services/calls.ts`, add after the existing imports:

```typescript
import { callTokens } from '../db/schema'
```

Add two methods to `CallsService`:

```typescript
  /**
   * Create a single-use call token linking a Twilio callback URL to a volunteer.
   * Called by the ringing service before ringVolunteers() embeds the URL.
   */
  async createCallToken(params: {
    callSid: string
    volunteerPubkey: string
    hubId: string
  }): Promise<string> {
    const token = crypto.randomUUID()
    await this.db.insert(callTokens).values({
      token,
      callSid: params.callSid,
      volunteerPubkey: params.volunteerPubkey,
      hubId: params.hubId,
    })
    return token
  }

  /**
   * Atomically consume a call token and return its associated data.
   * Returns null if the token does not exist (unknown, expired, or already used).
   * DELETE...RETURNING is atomic in PostgreSQL — no double-use possible.
   */
  async resolveCallToken(token: string): Promise<{
    callSid: string
    volunteerPubkey: string
    hubId: string
  } | null> {
    const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes
    const rows = await this.db
      .delete(callTokens)
      .where(
        and(
          eq(callTokens.token, token),
          gte(callTokens.createdAt, new Date(Date.now() - TOKEN_TTL_MS)),
        ),
      )
      .returning()
    if (rows.length === 0) return null
    const row = rows[0]
    return {
      callSid: row.callSid,
      volunteerPubkey: row.volunteerPubkey,
      hubId: row.hubId,
    }
  }

  /**
   * Resolve hub ID from an active call record using CallSid.
   * Used by CRIT-W1 fix to avoid trusting URL ?hub= param in callbacks.
   */
  async getHubIdForCall(callSid: string): Promise<string | null> {
    const rows = await this.db
      .select({ hubId: activeCalls.hubId })
      .from(activeCalls)
      .where(eq(activeCalls.callId, callSid))
      .limit(1)
    if (rows.length === 0) return null
    return rows[0].hubId ?? null
  }
```

- [ ] **Step 5: Update `RingVolunteersParams` and `CallAnsweredParams` in adapter.ts**

In `apps/worker/telephony/adapter.ts`, the `RingVolunteersParams` interface currently contains `volunteers: Array<{ pubkey: string; phone: string | null }>`. The adapters will now receive a pre-computed `callToken` per volunteer so the pubkey never appears in URLs.

Change `volunteers` type from `Array<{ pubkey: string; phone: string | null }>` to:
```typescript
volunteers: Array<{
  phone: string | null
  /** Opaque single-use token — embeds into callback URL instead of pubkey (CRIT-W2) */
  callToken: string
}>
```

In `CallAnsweredParams` (line 171-180), change `userPubkey: string` to:
```typescript
/** Opaque single-use call token resolved from URL — replaces userPubkey in URLs (CRIT-W2) */
callToken: string
/** Resolved volunteer pubkey — obtained by resolving callToken from DB before this call */
userPubkey: string
```

Add a new interface after `CallAnsweredParams`:
```typescript
/** Result of resolving a call token from the database. */
export interface ResolvedCallToken {
  callSid: string
  volunteerPubkey: string
  hubId: string
}
```

- [ ] **Step 6: Update `ringing.ts` to generate tokens per volunteer**

In `apps/worker/services/ringing.ts`, the call to `adapter.ringVolunteers` at line 109 currently passes `volunteers: toRingPhone` where each entry has `{ pubkey, phone }`.

Update to generate a call token per volunteer before calling `ringVolunteers`:

```typescript
// Generate single-use call tokens per volunteer (CRIT-W2)
const volunteersWithTokens = await Promise.all(
  toRingPhone.map(async (vol) => {
    const callToken = await services.calls.createCallToken({
      callSid,
      volunteerPubkey: vol.pubkey,
      hubId: hubId ?? '',
    })
    return { phone: vol.phone, callToken }
  }),
)

await breaker.execute(() =>
  withRetry(
    () => adapter.ringVolunteers({
      callSid,
      callerNumber,
      volunteers: volunteersWithTokens,
      callbackUrl: origin,
      hubId,
    }),
    { ... }
  )
)
```

- [ ] **Step 7: Update Twilio adapter to use callToken**

In `apps/worker/telephony/twilio.ts`, in `ringVolunteers` (line 243), change:
```typescript
// Before (line 252-253):
Url: `...user-answer?parentCallSid=${params.callSid}&pubkey=${vol.pubkey}${hubParam}`,
StatusCallback: `...call-status?parentCallSid=${params.callSid}&pubkey=${vol.pubkey}${hubParam}`,

// After:
Url: `...user-answer?callToken=${encodeURIComponent(vol.callToken)}`,
StatusCallback: `...call-status?callToken=${encodeURIComponent(vol.callToken)}`,
```

In `handleCallAnswered` (line 193), the `recordingStatusCallback` URL uses `pubkey=${params.userPubkey}`. After the callToken is resolved in the route handler (see Step 9), the recording callback URL should embed `callToken` for the volunteer's second-stage leg:

```typescript
// Before (line 197):
recordingStatusCallback="${params.callbackUrl}/api/telephony/call-recording?parentCallSid=${params.parentCallSid}&amp;pubkey=${params.userPubkey}${hp}"

// After — callToken in recording callback too:
recordingStatusCallback="${params.callbackUrl}/api/telephony/call-recording?parentCallSid=${params.parentCallSid}&amp;callToken=${params.callToken}${hp}"
```

- [ ] **Step 8: Update Vonage, Plivo, Asterisk adapters**

Apply the same `callToken` substitution in:
- `apps/worker/telephony/vonage.ts` lines 296, 298, 235 (answer_url, event_url, eventUrl)
- `apps/worker/telephony/plivo.ts` lines 255, 257, 259, 208 (answer_url, hangup_url, ring_url, callbackUrl)
- `apps/worker/telephony/asterisk.ts` in `ringVolunteers` and `handleCallAnswered` — pass `callToken` through to the bridge request body

Pattern for each:
```typescript
// Before:
`...?parentCallSid=${params.callSid}&pubkey=${vol.pubkey}${hubParam}`
// After:
`...?callToken=${encodeURIComponent(vol.callToken)}`
```

Note: Remove `hubParam` from ringing URLs too — the hub is now resolved server-side from the call record (CRIT-W1 fix).

- [ ] **Step 9: Update `telephony.ts` routes to resolve hub and token from call record**

This is the most invasive change. The current `telephony.use('*', ...)` global middleware at lines 32-61 must be dissolved. Instead, each route resolves the hub and validates the token independently.

**Replace the global middleware** with a per-route helper:

```typescript
/**
 * Resolve the hub ID from the active_calls record using CallSid.
 * For inbound (/incoming), hub is resolved from the called phone number instead.
 * Never trust ?hub= URL param for callbacks (CRIT-W1).
 */
async function resolveHubFromCallRecord(
  services: Services,
  callSid: string,
): Promise<string | undefined> {
  const hubId = await services.calls.getHubIdForCall(callSid)
  return hubId ?? undefined
}

/**
 * Validate Twilio webhook signature using the hub-scoped adapter.
 * Returns the adapter if valid, null if invalid.
 */
async function validateAndGetAdapter(
  env: Env,
  services: Services,
  hubId: string | undefined,
  request: Request,
  isDev: boolean,
): Promise<TelephonyAdapter | null> {
  const adapter = await getHubAdapter(env, services, hubId)
  if (!adapter) return null
  const isLocal = isDev && new URL(request.url).hostname === 'localhost'
  if (!isLocal) {
    const isValid = await adapter.validateWebhook(request)
    if (!isValid) return null
  }
  return adapter
}
```

Remove `telephony.use('*', ...)` (lines 32-61).

Update the `/user-answer` handler (CRIT-W1 + CRIT-W2):
```typescript
telephony.post('/user-answer', async (c) => {
  const url = new URL(c.req.url)
  const services = c.get('services')
  const isDev = c.env.ENVIRONMENT === 'development'

  // CRIT-W2: Resolve volunteer pubkey from opaque call token (delete-on-read)
  const callToken = url.searchParams.get('callToken') || ''
  const tokenData = await services.calls.resolveCallToken(callToken)
  if (!tokenData) {
    return new Response('Forbidden', { status: 403 })
  }
  const { callSid: parentCallSid, volunteerPubkey: pubkey, hubId } = tokenData

  // CRIT-W1: Use hub from call record, not from URL param
  const adapter = await validateAndGetAdapter(c.env, services, hubId || undefined, c.req.raw, isDev)
  if (!adapter) return new Response('Forbidden', { status: 403 })

  await services.calls.answerCall(hubId ?? '', parentCallSid, pubkey)
  // ... rest of handler unchanged
})
```

Update `/call-status` handler to extract `callToken`, resolve token, get hub from record:
```typescript
telephony.post('/call-status', async (c) => {
  const url = new URL(c.req.url)
  const services = c.get('services')
  const isDev = c.env.ENVIRONMENT === 'development'

  // CRIT-W2: Resolve pubkey from call token (if present — status can fire after token consumed)
  const callToken = url.searchParams.get('callToken') || ''
  const parentCallSid = url.searchParams.get('parentCallSid') || ''

  // For status callbacks: token may already be consumed (call already answered).
  // Resolve hub from call record directly.
  let pubkey = ''
  let hubId: string | undefined

  if (callToken) {
    // Token may still be present if call ended before being answered
    const tokenData = await services.calls.resolveCallToken(callToken)
    if (tokenData) {
      pubkey = tokenData.volunteerPubkey
      hubId = tokenData.hubId || undefined
    }
  }

  // CRIT-W1: Always resolve hub from call record, ignoring URL param
  if (!hubId && parentCallSid) {
    const hubFromRecord = await services.calls.getHubIdForCall(parentCallSid)
    hubId = hubFromRecord ?? undefined
  }

  const adapter = await validateAndGetAdapter(c.env, services, hubId, c.req.raw, isDev)
  if (!adapter) return new Response('Forbidden', { status: 403 })
  // ... rest of handler unchanged (uses pubkey and parentCallSid from above)
})
```

Update `/call-recording` similarly — resolve hub from call record, resolve pubkey from callToken (if still available) or from `answeredBy` on the call record.

For `/incoming`, `/language-selected`, `/captcha`, `/wait-music`, `/queue-exit`, `/voicemail-complete`, `/voicemail-recording`:
- These are hub-resolution via phone number (already done in `/incoming`) or use the simple global adapter. They do not need the call-record lookup.
- Each route gets its own `validateAndGetAdapter` call replacing the removed global middleware.
- For routes that previously read `?hub=` (language-selected, captcha, wait-music, queue-exit, voicemail-complete, voicemail-recording): these are called by Twilio during the IVR flow, not during callbacks to volunteer phones. The hub param in these URLs was set by the server when constructing the redirect URL (in `/incoming`). For these routes, the `?hub=` param is server-set and acceptable, but must be validated against the call record: look up `callSid` from the body and cross-check.

  Simplest safe approach for these continuation routes: validate signature with global adapter first, then use hub from call record if a callSid is available in the body, falling back to `?hub=` only when no callSid is known (IVR menu before call is registered):

```typescript
// Pattern for continuation routes (language-selected, captcha, etc.):
telephony.post('/language-selected', async (c) => {
  const url = new URL(c.req.url)
  const services = c.get('services')
  const isDev = c.env.ENVIRONMENT === 'development'
  // Use global adapter for validation (IVR continuation — no callSid in body yet)
  const globalAdapter = await getTelephonyFromService(c.env, services.settings)
  if (!globalAdapter) return c.json({ error: 'Telephony not configured' }, 404)
  const isLocal = isDev && url.hostname === 'localhost'
  if (!isLocal) {
    const isValid = await globalAdapter.validateWebhook(c.req.raw)
    if (!isValid) return new Response('Forbidden', { status: 403 })
  }
  // After signature validation, resolve hub from ?hub= (server-set, safe after validation)
  const hubId = url.searchParams.get('hub') || undefined
  const adapter = hubId
    ? ((await getHubTelephonyFromService(c.env, services.settings, hubId)) ?? globalAdapter)
    : globalAdapter
  // ... rest unchanged
})
```

- [ ] **Step 10: Add DB migration**

Create `apps/worker/db/migrations/add_call_tokens.sql`:
```sql
CREATE TABLE IF NOT EXISTS call_tokens (
  token       TEXT PRIMARY KEY,
  call_sid    TEXT NOT NULL,
  volunteer_pubkey TEXT NOT NULL,
  hub_id      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_tokens_call_sid_idx ON call_tokens (call_sid);
CREATE INDEX IF NOT EXISTS call_tokens_created_at_idx ON call_tokens (created_at);
```

Also add a periodic cleanup query in the `CallsService.reset()` method to delete expired tokens (>5 min old) in addition to any existing cleanup.

- [ ] **Step 11: Write step implementations for the telephony callback scenarios**

In `tests/steps/backend/contracts.steps.ts`, add:

```typescript
// ── Telephony webhook security ────────────────────────────────────

Given('a call is in progress with a known hub', async ({ request, world }) => {
  // Simulate an incoming call via dev endpoint to get a callId
  const res = await request.post(`${BASE_URL}/api/test-simulate/incoming-call`, {
    headers: { 'X-Test-Secret': process.env.E2E_TEST_SECRET ?? '' },
    data: { callerNumber: '+15550000099' },
  })
  const body = await res.json() as { ok: boolean; callId?: string }
  ;(global as Record<string, unknown>)._testCallId = body.callId
})

When(
  'a webhook is posted to {string} with a forged hub param',
  async ({ request }, path: string) => {
    const callId = (global as Record<string, unknown>)._testCallId as string ?? 'fake-call-id'
    const res = await request.post(`${BASE_URL}/api${path}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `parentCallSid=${callId}&hub=forged-hub-id`,
    })
    ;(global as Record<string, unknown>)._lastContractStatus = res.status()
  },
)

When(
  'a webhook is posted to {string} with callToken {string}',
  async ({ request }, path: string, callToken: string) => {
    const res = await request.post(`${BASE_URL}/api${path}?callToken=${callToken}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'parentCallSid=test-call-id',
    })
    ;(global as Record<string, unknown>)._lastContractStatus = res.status()
  },
)

Then('the response status should be {int} or {int}', async (_: unknown, a: number, b: number) => {
  const status = (global as Record<string, unknown>)._lastContractStatus as number
  expect([a, b]).toContain(status)
})
```

- [ ] **Step 12: Run tests and typecheck**

```
bun run typecheck
bun run test:backend:bdd --grep "Telephony callback"
```

Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add apps/worker/db/schema/calls.ts \
        apps/worker/db/schema/index.ts \
        apps/worker/db/migrations/add_call_tokens.sql \
        apps/worker/services/calls.ts \
        apps/worker/telephony/adapter.ts \
        apps/worker/telephony/twilio.ts \
        apps/worker/telephony/vonage.ts \
        apps/worker/telephony/plivo.ts \
        apps/worker/telephony/asterisk.ts \
        apps/worker/services/ringing.ts \
        apps/worker/routes/telephony.ts \
        packages/test-specs/features/security/api-contracts.feature \
        tests/steps/backend/contracts.steps.ts
git commit -m "$(cat <<'EOF'
fix(security): CRIT-W1/W2 — hub from call record, opaque call tokens for callbacks

CRIT-W1: Dissolve global telephony middleware that trusted ?hub= URL param.
Each callback route now resolves hub from active_calls DB record using CallSid
from the request body. Inbound/IVR continuation routes validate with global
adapter then use hub from server-set ?hub= (safe after signature validation).

CRIT-W2: Replace pubkey= in Twilio/Vonage/Plivo/Asterisk callback URLs with
opaque single-use UUID call tokens stored in new call_tokens table.
ringing.ts generates one token per volunteer before ringVolunteers().
resolveCallToken() uses DELETE...RETURNING for atomic single-use guarantee.
Unknown or expired tokens return 403 immediately.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: HIGH-W1 — `serverEventKeyHex` scoped to admins only

**Files:**
- Modify: `apps/worker/routes/auth.ts`
- Modify: `packages/test-specs/features/security/api-contracts.feature`
- Modify: `tests/steps/backend/contracts.steps.ts`

The `GET /auth/me` response at lines 153-155 and 173 includes `serverEventKeyHex` for all authenticated users. This key decrypts hub relay events. Volunteers who are not hub admins should not receive it — the current code gives it to every authenticated user indiscriminately.

Interim fix: only include `serverEventKeyHex` if the user has `settings:manage` permission (admin or super-admin). Future work: per-hub ECIES envelopes (tracked in security audit).

- [ ] **Step 1: Write failing BDD scenario**

Add to `packages/test-specs/features/security/api-contracts.feature`:

```gherkin
  # ─── serverEventKeyHex Scoping ──────────────────────────────────

  Scenario: Volunteer user does not receive serverEventKeyHex in /auth/me
    Given a volunteer is registered and logged in
    When the volunteer calls "GET" "/api/auth/me"
    Then the response status should be 200
    And the response should not contain "serverEventKeyHex"

  Scenario: Admin user receives serverEventKeyHex in /auth/me
    Given I am authenticated as admin
    When an admin sends "GET" to "/api/auth/me"
    Then the response status should be 200
    And the response body should contain field "serverEventKeyHex"
```

- [ ] **Step 2: Run test to confirm it fails**

```
bun run test:backend:bdd --grep "serverEventKeyHex"
```

Expected: FAIL (volunteers currently receive the field)

- [ ] **Step 3: Implement the fix in `apps/worker/routes/auth.ts`**

At lines 151-155, change:
```typescript
// Before:
// Derive server event key for client-side decryption of encrypted relay events (Epic 252)
// Moved here from /api/config to keep it behind authentication (Epic 258 C2)
const serverEventKeyHex = c.env.SERVER_NOSTR_SECRET
  ? bytesToHex(deriveServerEventKey(c.env.SERVER_NOSTR_SECRET))
  : undefined

// After:
// Derive server event key — scoped to admins only (HIGH-W1 interim gate).
// Full migration to per-hub ECIES envelopes tracked in security audit.
// Non-admin volunteers receive undefined and must use hub key envelopes instead.
const isAdmin = checkPermission(permissions, 'settings:manage')
const serverEventKeyHex = (isAdmin && c.env.SERVER_NOSTR_SECRET)
  ? bytesToHex(deriveServerEventKey(c.env.SERVER_NOSTR_SECRET))
  : undefined
```

The returned object at line 157-175 already includes `serverEventKeyHex` — with this change it will be `undefined` for non-admins, which Hono will omit from the JSON body automatically (undefined properties are dropped by JSON.stringify).

- [ ] **Step 4: Write step implementations**

In `tests/steps/backend/contracts.steps.ts`, add:

```typescript
// ── serverEventKeyHex scoping ─────────────────────────────────────

Given('a volunteer is registered and logged in', async ({ request, world }) => {
  const vol = await createVolunteerViaApi(request, { name: `Vol ${Date.now()}` })
  ;(global as Record<string, unknown>)._volunteerNsec = vol.nsec
})

When('the volunteer calls {string} {string}', async ({ request }, method: string, path: string) => {
  const nsec = (global as Record<string, unknown>)._volunteerNsec as string
  const res = await apiGet(request, path.replace('/api', ''), nsec)
  ;(global as Record<string, unknown>)._lastContractResponse = res
})

Then('the response should not contain {string}', async (_: unknown, fieldName: string) => {
  const res = (global as Record<string, unknown>)._lastContractResponse as { data: unknown }
  const json = JSON.stringify(res.data)
  expect(json).not.toContain(fieldName)
})

Then('the response body should contain field {string}', async (_: unknown, fieldName: string) => {
  const res = (global as Record<string, unknown>)._lastContractResponse as { data: Record<string, unknown> }
  expect(res.data[fieldName]).toBeDefined()
})
```

- [ ] **Step 5: Run tests and typecheck**

```
bun run typecheck
bun run test:backend:bdd --grep "serverEventKeyHex"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/routes/auth.ts \
        packages/test-specs/features/security/api-contracts.feature \
        tests/steps/backend/contracts.steps.ts
git commit -m "$(cat <<'EOF'
fix(security): HIGH-W1 scope serverEventKeyHex to admins only in /auth/me

Volunteers no longer receive the global hub relay decryption key.
Interim gate: requires settings:manage permission (admin or super-admin).
TODO tracked in security audit: migrate to per-hub ECIES envelopes so
each member only receives envelopes for their own hubs.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: HIGH-H2 — Add `hubId` to `WakePayload`

**Files:**
- Modify: `apps/worker/types/infra.ts`
- Modify: `apps/worker/services/ringing.ts` (or wherever VoIP push is dispatched with a WakePayload)
- Modify: `apps/worker/routes/conversations.ts` (if it constructs WakePayload for messaging push)

The `WakePayload` interface in `apps/worker/types/infra.ts` at line 100-107 does not include `hubId`. Mobile clients need `hubId` in the wake payload to route the notification to the correct hub on app foreground (see spec HIGH-H2). This is a type addition + usage update.

Note: This is NOT a `packages/protocol/schemas/` Zod schema change (WakePayload is an internal backend type defined in `apps/worker/types/infra.ts`, not exported via protocol codegen). No `bun run codegen` needed.

- [ ] **Step 1: Update `WakePayload` in `apps/worker/types/infra.ts`**

At line 100-107, add `hubId`:

```typescript
// Before:
/** Wake-tier payload — decryptable without PIN (minimal metadata) */
export interface WakePayload {
  type: PushNotificationType
  conversationId?: string
  channelType?: string
  callId?: string
  shiftId?: string
  startsAt?: string
}

// After:
/** Wake-tier payload — decryptable without PIN (minimal metadata) */
export interface WakePayload {
  type: PushNotificationType
  conversationId?: string
  channelType?: string
  callId?: string
  shiftId?: string
  startsAt?: string
  /** Hub that generated this event — used by mobile client for routing (HIGH-H2) */
  hubId?: string
}
```

- [ ] **Step 2: Update callers of `dispatchVoipPushFromService` in `ringing.ts`**

In `apps/worker/services/ringing.ts` at lines 82-93, the `dispatchVoipPushFromService` call constructs a `WakePayload` implicitly. Find the `dispatchVoipPushFromService` function signature in `apps/worker/lib/voip-push.ts` and update the callsite to pass `hubId`:

First, check `apps/worker/lib/voip-push.ts` for the function signature and WakePayload construction. Update the call in `ringing.ts` to include `hubId`:

```typescript
dispatchVoipPushFromService(
  browserVoip.map(v => v.pubkey),
  callSid,
  callerLast4,
  env,
  services.identity,
  hubId,  // Pass hubId so mobile client can route to correct hub
).catch(...)
```

Update `dispatchVoipPushFromService` signature in `apps/worker/lib/voip-push.ts` to accept and forward `hubId` into the WakePayload.

- [ ] **Step 3: Run typecheck**

```
bun run typecheck
```

Expected: PASS (no protocol codegen needed — WakePayload is a backend-internal type)

- [ ] **Step 4: Write a BDD scenario to verify hubId reaches push payload**

Add to `packages/test-specs/features/security/api-contracts.feature`:

```gherkin
  # ─── WakePayload hubId ───────────────────────────────────────────

  Scenario: VoIP push wake payload includes hubId when a hub call rings
    Given a hub is configured with a known hubId
    And a volunteer with a registered VoIP push token is on shift in that hub
    When a call comes in for that hub
    Then the push log should record a wake payload containing the hub's hubId
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker/types/infra.ts \
        apps/worker/services/ringing.ts \
        apps/worker/lib/voip-push.ts \
        packages/test-specs/features/security/api-contracts.feature
git commit -m "$(cat <<'EOF'
fix(security): HIGH-H2 add hubId to WakePayload for mobile hub routing

Mobile clients need hubId in the wake-tier push payload to navigate to
the correct hub context on notification tap without requiring decryption.
WakePayload is a backend-internal type — no protocol codegen needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: MED-W1 + MED-W2 — Permission hardening

**Files:**
- Modify: `apps/worker/routes/bans.ts`
- Modify: `packages/test-specs/features/security/permission-matrix.feature` (or `api-contracts.feature`)
- Modify: `tests/steps/backend/contracts.steps.ts`

### MED-W2: `POST /bans/` uses `bans:report` instead of `bans:create`

In `apps/worker/routes/bans.ts` at line 47:
```typescript
requirePermission('bans:report'),
```

The `bans:report` permission (defined in `packages/shared/permissions.ts` line 82) is intended for volunteer users to flag a number for admin review. The direct phone ban route creates an immediate ban — this should require `bans:create` (line 84 in permissions.ts). Volunteers with `bans:report` should not be able to directly ban without admin confirmation.

### MED-W1: Hub-scoped routes without hub context

Routes served at `/api/hubs/:hubId/notes`, `/api/hubs/:hubId/calls`, etc. go through the `hubScoped` router in `app.ts` (lines 166-182) which already applies `hubContext` middleware. The `hubId` is correctly set by the middleware. However, routes served without a hub prefix (e.g., `GET /api/notes`) lack a hub guard when a volunteer is in a multi-hub environment. The risk is that a volunteer in hub-A could potentially read hub-B's notes if they guess the right IDs.

This is already partially mitigated by service-level filtering (notes service filters by hubId from context), but the explicit guard adds defense-in-depth.

Add a hub context check in the `notes`, `calls`, and `conversations` routes for volunteer-level access: if the user is not a super-admin and no hub context is set and the user has hub memberships, require hub context.

- [ ] **Step 1: Write failing BDD scenarios**

Add to `packages/test-specs/features/security/api-contracts.feature`:

```gherkin
  # ─── Permission Hardening ────────────────────────────────────────

  Scenario: Volunteer with bans:report cannot directly ban a phone number
    Given a volunteer with only "bans:report" permission
    When the volunteer sends "POST" to "/api/bans" with body:
      | phone  | +15559876543  |
      | reason | volunteer ban |
    Then the response status should be 403

  Scenario: Admin with bans:create can directly ban a phone number
    Given I am authenticated as admin
    When an admin sends "POST" to "/api/bans" with body:
      | phone  | +15559876543  |
      | reason | admin ban     |
    Then the response status should be 200
```

- [ ] **Step 2: Run tests to confirm MED-W2 scenario fails**

```
bun run test:backend:bdd --grep "bans:report cannot directly ban"
```

Expected: FAIL (volunteer currently gets 200 because `bans:report` is allowed)

- [ ] **Step 3: Implement MED-W2 fix in `apps/worker/routes/bans.ts`**

At line 47, change:
```typescript
// Before:
requirePermission('bans:report'),
// After:
requirePermission('bans:create'),
```

Note: The default volunteer role in `packages/shared/permissions.ts` line 269 includes `'bans:report'` but NOT `'bans:create'`. Admin roles already have `bans:create`. This change is backwards-compatible — volunteers with `bans:report` only can still report numbers via a different flow (if one exists or will be built), but cannot directly create bans.

- [ ] **Step 4: MED-W1 hub context guard (notes, calls, conversations)**

For the `/api/notes` route (non-hub-prefixed), add a guard at the start of the handler:

In `apps/worker/routes/notes.ts`, in list/create handlers, add after getting context variables:
```typescript
const hubId = c.get('hubId')
const permissions = c.get('permissions')
const isSuperAdmin = checkPermission(permissions, '*')
// Volunteers without hub context on a route that requires hub isolation
if (!isSuperAdmin && !hubId) {
  return c.json({ error: 'Hub context required. Use /api/hubs/:hubId/notes' }, 400)
}
```

Apply the same pattern to `apps/worker/routes/calls.ts` and `apps/worker/routes/conversations.ts` list endpoints.

- [ ] **Step 5: Run tests**

```
bun run typecheck
bun run test:backend:bdd --grep "bans:report|bans:create|Hub context required"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/routes/bans.ts \
        apps/worker/routes/notes.ts \
        apps/worker/routes/calls.ts \
        apps/worker/routes/conversations.ts \
        packages/test-specs/features/security/api-contracts.feature \
        tests/steps/backend/contracts.steps.ts
git commit -m "$(cat <<'EOF'
fix(security): MED-W1/W2 — bans:create permission, hub context guard

MED-W2: POST /bans/ now requires bans:create (admin-level) not bans:report
(volunteer-level). Volunteers with bans:report can flag numbers for review
but cannot create immediate bans.

MED-W1: Notes, calls, and conversations list endpoints return 400 when
accessed without hub context by non-super-admin users. Volunteers must
use /api/hubs/:hubId/{notes,calls,conversations} paths.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: HIGH-H1 + HIGH-H3 — Architecture notes (no-code tasks)

**Files:**
- Modify: `apps/worker/routes/auth.ts` (add architecture comment)
- Modify: `apps/worker/routes/hubs.ts` (add architecture comment)

### HIGH-H1: serverEventKeyHex is currently global

The interim permission gate in Task 4 is a stopgap. The correct architecture is per-hub ECIES envelopes: each hub has a unique relay event key, and each member receives their envelope via `GET /:hubId/key`. This parallels the hub key distribution already implemented.

Add a code comment to `apps/worker/routes/auth.ts` near the `serverEventKeyHex` computation:

```typescript
// HIGH-H1 SECURITY AUDIT: serverEventKeyHex is currently a single global key derived
// from SERVER_NOSTR_SECRET. The migration path to per-hub ECIES envelopes:
//   1. Each hub generates a hub-specific relay event key (separate from hub data key)
//   2. Distribute via GET /hubs/:hubId/key (already authenticated + membership-gated)
//   3. Remove serverEventKeyHex from /auth/me entirely
// Tracked: security-audit HIGH-H1. Interim: admin-only gate (see isAdmin check above).
```

Add a parallel comment in `apps/worker/routes/hubs.ts` near the `GET /:hubId/key` handler:

```typescript
// HIGH-H1 SECURITY AUDIT: Future work — extend hub key envelopes to include a
// per-hub relay event decryption key alongside the hub data key. See auth.ts comment.
```

### HIGH-H3: iOS-only change

HIGH-H3 is a purely iOS client-side change (the iOS app must not cache hub keys across hub switches without re-fetching from the server). No worker change is needed.

- [ ] **Step 1: Add architecture comments**

In `apps/worker/routes/auth.ts`, add the HIGH-H1 comment block before line 151 (the `serverEventKeyHex` computation).

In `apps/worker/routes/hubs.ts`, add the HIGH-H1 migration comment before line 246 (the `// --- Hub Key Management ---` comment).

- [ ] **Step 2: Commit**

```bash
git add apps/worker/routes/auth.ts \
        apps/worker/routes/hubs.ts
git commit -m "$(cat <<'EOF'
docs(security): HIGH-H1/H3 architecture notes

HIGH-H1: Add code comments documenting the migration path from the global
serverEventKeyHex to per-hub ECIES relay event key envelopes.
HIGH-H3: iOS-only change (hub key caching) — no worker changes needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Verification for each task

| Task | Verification command | Expected |
|------|---------------------|----------|
| 1 (CRIT-H1) | `curl -X GET http://localhost:3000/api/hubs/test-id/key` (no auth) | 401 |
| 1 (CRIT-H1) | `apiGet(request, '/hubs/test-id/key', nonMemberNsec)` | 403 |
| 1 (CRIT-H1) | `apiGet(request, '/hubs/test-id/key', memberWithNoEnvelopeNsec)` | 404 |
| 1 (CRIT-H1) | `apiGet(request, '/hubs/test-id/key', memberWithEnvelopeNsec)` | 200 |
| 2 (HIGH-W3) | Audit log for numberBanned contains `phoneHash` not raw phone | PASS |
| 2 (HIGH-W4) | `POST /api/test-reset` with wrong secret | 404 |
| 2 (HIGH-W5) | `POST /api/settings/telephony-provider/test` with `accountSid: "BAD"` | 400 |
| 3 (CRIT-W1) | Callback with `?hub=forged` while call exists in another hub | 403 |
| 3 (CRIT-W2) | Callback with `?callToken=unknown-uuid` | 403 |
| 3 (CRIT-W2) | Callback with already-consumed token | 403 |
| 4 (HIGH-W1) | `GET /api/auth/me` as volunteer — no `serverEventKeyHex` field | PASS |
| 4 (HIGH-W1) | `GET /api/auth/me` as admin — `serverEventKeyHex` present | PASS |
| 5 (HIGH-H2) | `bun run typecheck` — WakePayload has hubId | PASS |
| 6 (MED-W2) | `POST /api/bans` as volunteer with bans:report only | 403 |
| 6 (MED-W1) | `GET /api/notes` as volunteer without hub context | 400 |

---

## Final verification commands

```bash
# Type check entire workspace
bun run typecheck

# Run backend BDD tests
bun run test:backend:bdd

# Run all tests (desktop Playwright)
bun run test

# Verify no new TS errors
bun run build
```

---

## Implementation order

Tasks should be implemented in this order to minimize conflicts:

1. **Task 2** (HIGH-W3/W4/W5) — isolated file changes, no dependencies
2. **Task 4** (HIGH-W1) — isolated auth.ts change
3. **Task 6** (MED-W1/W2) — isolated bans.ts + route changes
4. **Task 7** (HIGH-H1/H3) — comment-only changes
5. **Task 5** (HIGH-H2) — type addition, minor usage updates
6. **Task 1** (CRIT-H1) — hubs.ts middleware addition
7. **Task 3** (CRIT-W1/W2) — most invasive, involves DB schema, 5 adapters, route refactor; do last after other tasks are committed and tests are green
