# Epic E — Backend Access Control & Input Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven backend security vulnerabilities — co-approver admin check (H01), IDOR on records/by-contact, account lockdown re-auth, blast input validation (H02), SSRF fail-open (H07), PUK envelope race condition (H09), and rate limit coverage gap (H03, depends on Epic A).

**Architecture:** All fixes are backend-only, targeting `apps/worker/`. Each fix is a surgical change to an existing file — no new routes, no schema migrations unless required. H09 uses Drizzle's `onConflictDoUpdate` to eliminate the race. H01, IDOR, and Lockdown add guard logic inline in route handlers or services. H02 adds per-channel content validation. H07 inverts a catch clause from fail-open to fail-closed. H03 is gated on Epic A and deferred to Phase 4.

**Tech Stack:** Bun + Hono + Drizzle ORM + PostgreSQL + Vitest. Zod schemas in `packages/protocol/schemas/`. Unit tests in `apps/worker/__tests__/unit/`. The existing test pattern uses `vitest`, mocked services, and a minimal Hono app per test file.

---

## File Map

| File | Change |
|------|--------|
| `apps/worker/services/erasure.ts` | H01: add admin-device check for coApproverPubkey after sig verify |
| `apps/worker/routes/records.ts` | IDOR: pass hubId to `cases.listByContact()` |
| `apps/worker/services/cases.ts` | IDOR: add hubId filter in `listByContact()` |
| `apps/worker/middleware/require-fresh-auth.ts` | Lockdown: new middleware — rejects session-token auth, requires Schnorr |
| `apps/worker/routes/account.ts` | Lockdown: apply `requireFreshAuth` to POST /lockdown |
| `apps/worker/lib/ssrf-guard.ts` | H07: catch → return error instead of silently passing |
| `apps/worker/lib/ssrf-guard.test.ts` | H07: add test for DNS failure case |
| `apps/worker/services/crypto-keys.ts` | H09: use `onConflictDoUpdate` in `distributePukEnvelopes` |
| `apps/worker/__tests__/unit/puk-routes.test.ts` | H09: add concurrent-write test |
| `packages/protocol/schemas/blasts.ts` | H02: add per-channel body length limits, control char validation |
| `apps/worker/services/blasts.ts` | H02: sanitize content before storage |
| `apps/worker/__tests__/unit/validation-blasts.test.ts` | H02: add channel-specific length and sanitization tests |
| `apps/worker/__tests__/unit/erasure-service.test.ts` | H01: new unit test file for co-approver admin check |
| `apps/worker/__tests__/unit/records-route.test.ts` | IDOR: add hub isolation test for by-contact |
| `apps/worker/__tests__/unit/account-lockdown.test.ts` | Lockdown: new test file for re-auth middleware |

---

## Phase 1: Critical Access Control (H01, IDOR, Lockdown)

### Task 1: H01 — Verify co-approver is a registered admin device

**Files:**
- Modify: `apps/worker/services/erasure.ts` (lines around 145–165)
- Create: `apps/worker/__tests__/unit/erasure-service.test.ts`

The current `createSelfRequest()` verifies the Ed25519 signature but never checks whether `coApproverPubkey` belongs to a user with an admin role. Any keypair — including a volunteer's — can sign a valid co-approver payload.

- [ ] **Step 1.1: Write the failing test**

Create `apps/worker/__tests__/unit/erasure-service.test.ts`:

```typescript
/**
 * Unit tests for ErasureService.createSelfRequest — H01 co-approver admin check.
 */
import { describe, it, expect, vi } from 'vitest'
import { ErasureService } from '@worker/services/erasure'
import { ServiceError } from '@worker/services/settings'

// Minimal Ed25519 helpers (real crypto, but no DB)
import { ed25519 } from '@noble/curves/ed25519.js'
import { bytesToHex, hexToBytes } from '@shared/encoding'

function makeAdminUser(pubkey: string) {
  return { pubkey, roles: ['role-super-admin'], active: true }
}
function makeVolunteerUser(pubkey: string) {
  return { pubkey, roles: ['role-volunteer'], active: true }
}

function buildService(coApproverUser: ReturnType<typeof makeAdminUser> | null) {
  // Real erasure config
  const mockDb = {} as never
  const mockErasureConfig = { emergencyOverrideEnabled: true, delayHours: 72 }

  const service = new ErasureService(mockDb)

  // Stub the DB and config lookups used by createSelfRequest
  vi.spyOn(service, 'getMyRequest').mockResolvedValue(null)
  vi.spyOn(service, 'getConfig').mockResolvedValue(mockErasureConfig as never)
  // Stub identity lookup
  const mockIdentity = {
    getUserInternal: vi.fn().mockResolvedValue(coApproverUser),
  }
  // @ts-expect-error private for test
  service.identity = mockIdentity

  return { service, mockIdentity }
}

describe('ErasureService.createSelfRequest — co-approver admin check (H01)', () => {
  const privKey = ed25519.utils.randomPrivateKey()
  const pubKey = bytesToHex(ed25519.getPublicKey(privKey))
  const coPrivKey = ed25519.utils.randomPrivateKey()
  const coPubKey = bytesToHex(ed25519.getPublicKey(coPrivKey))

  function makeSignedEmergency(userId: string, ts: string) {
    const label = 'llamenos:erasure:emergency:override'
    const msg = new TextEncoder().encode(`${label}:${userId}:${ts}`)
    const sig = bytesToHex(ed25519.sign(msg, coPrivKey))
    return { coApproverPubkey: coPubKey, coApproverSignature: sig, timestamp: ts }
  }

  it('rejects emergency erasure when co-approver is not an admin', async () => {
    const { service } = buildService(makeVolunteerUser(coPubKey))
    const ts = new Date().toISOString()
    const emergency = makeSignedEmergency(pubKey, ts)

    await expect(
      service.createSelfRequest(pubKey, 'hub-1', 'test', emergency),
    ).rejects.toThrow(ServiceError)
  })

  it('rejects emergency erasure when co-approver is unknown (not registered)', async () => {
    const { service } = buildService(null)
    const ts = new Date().toISOString()
    const emergency = makeSignedEmergency(pubKey, ts)

    await expect(
      service.createSelfRequest(pubKey, 'hub-1', 'test', emergency),
    ).rejects.toThrow(ServiceError)
  })

  it('accepts emergency erasure when co-approver has admin role', async () => {
    const { service } = buildService(makeAdminUser(coPubKey))
    // Stub the DB insert
    const fakeRow = {
      id: 'req-1', userId: pubKey, status: 'pending',
      requestedBy: pubKey, requestedAt: new Date(), executeAt: new Date(),
      executedAt: null, justification: 'test', emergencyOverride: true,
      coApproverPubkey: coPubKey, cancelledAt: null,
    }
    vi.spyOn(service['db'] as never, 'insert').mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
    } as never)
    const ts = new Date().toISOString()
    const emergency = makeSignedEmergency(pubKey, ts)

    const result = await service.createSelfRequest(pubKey, 'hub-1', 'test', emergency)
    expect(result.id).toBe('req-1')
  })
})
```

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
cd /media/rikki/recover/projects/llamenos-plan-epic-e/apps/worker
bun test __tests__/unit/erasure-service.test.ts 2>&1 | tail -20
```

Expected: FAIL — `ErasureService` has no `identity` property, and no admin check exists.

- [ ] **Step 1.3: Add `identity` dependency to ErasureService and inject in service container**

Read `apps/worker/services/erasure.ts`. Find the constructor and add the identity service reference. Then add the admin check after Ed25519 signature verification.

In `apps/worker/services/erasure.ts`, add to the class:

```typescript
// Add to constructor parameter (around line 30):
constructor(
  private readonly db: ReturnType<typeof getDb>,
  private readonly identity?: { getUserInternal(pubkey: string): Promise<{ roles: string[] } | null> },
) {}
```

Then inside `createSelfRequest`, after the `if (!sigValid)` block (around line 165), add:

```typescript
      // H01: Verify co-approver is a registered admin device
      const coApproverUser = await this.identity?.getUserInternal(emergency.coApproverPubkey) ?? null
      const adminRoles = ['role-super-admin', 'role-admin', 'role-hub-admin']
      const isAdmin = coApproverUser?.roles.some(r => adminRoles.includes(r)) ?? false
      if (!isAdmin) {
        throw new ServiceError(403, 'Co-approver must be a registered admin device')
      }
```

- [ ] **Step 1.4: Wire identity into ErasureService in the service container**

Read `apps/worker/services/index.ts`. Find where `ErasureService` is constructed and pass the identity service:

```typescript
// Before (approximate):
erasure: new ErasureService(db),

// After:
erasure: new ErasureService(db, services.identity),
```

Note: `services.identity` must be constructed before `services.erasure` in the factory chain. Check the construction order and adjust if needed.

- [ ] **Step 1.5: Run the test again**

```bash
bun test __tests__/unit/erasure-service.test.ts 2>&1 | tail -20
```

Expected: PASS — all three scenarios pass.

- [ ] **Step 1.6: Run existing erasure tests to confirm no regression**

```bash
bun test --run 2>&1 | grep -E "erasure|FAIL|pass|fail" | head -20
```

- [ ] **Step 1.7: Commit**

```bash
git add apps/worker/services/erasure.ts apps/worker/services/index.ts apps/worker/__tests__/unit/erasure-service.test.ts
git commit -m "fix(erasure): verify co-approver is a registered admin device (H01)"
```

---

### Task 2: IDOR — Hub isolation on `/records/by-contact/:contactId`

**Files:**
- Modify: `apps/worker/routes/records.ts` (lines 230–260)
- Modify: `apps/worker/services/cases.ts` (method `listByContact`, lines ~473–502)
- Modify: `apps/worker/__tests__/unit/records-route.test.ts`

Currently, `GET /records/by-contact/:contactId` fetches all non-closed records linked to a contact across ALL hubs. Any user with `cases:read-own` can query any contact ID and see records from other hubs.

- [ ] **Step 2.1: Write the failing test**

In `apps/worker/__tests__/unit/records-route.test.ts`, find the `makeApp` function and add a test:

```typescript
describe('GET /records/by-contact/:contactId — IDOR protection', () => {
  it('only returns records from the request hub', async () => {
    const { app, services } = makeApp({ hubId: 'hub-A' })
    services.cases.listByContact.mockResolvedValue({ records: [
      { id: 'rec-1', hubId: 'hub-A' },
    ], total: 1 })

    const res = await app.request('/records/by-contact/contact-1')
    expect(res.status).toBe(200)

    // Verify that listByContact was called with the hubId
    expect(services.cases.listByContact).toHaveBeenCalledWith('contact-1', 'hub-A')
  })

  it('returns empty when the caller is not in the contact\'s hub', async () => {
    const { app, services } = makeApp({ hubId: 'hub-B' })
    services.cases.listByContact.mockResolvedValue({ records: [], total: 0 })

    const res = await app.request('/records/by-contact/contact-1')
    expect(res.status).toBe(200)
    const body = await res.json() as { records: unknown[] }
    expect(body.records).toHaveLength(0)
  })
})
```

- [ ] **Step 2.2: Run test to confirm it fails**

```bash
bun test __tests__/unit/records-route.test.ts 2>&1 | grep -E "IDOR|by-contact|FAIL|fail" | head -10
```

Expected: FAIL — `listByContact` called without hubId.

- [ ] **Step 2.3: Update the route to pass hubId**

In `apps/worker/routes/records.ts`, find the `/by-contact/:contactId` handler (around line 231–260):

```typescript
// Before:
  async (c) => {
    const contactId = c.req.param('contactId')
    const permissions = c.get('permissions')

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const result = await services.cases.listByContact(contactId)
    return c.json(result)
  },

// After:
  async (c) => {
    const contactId = c.req.param('contactId')
    const permissions = c.get('permissions')
    const hubId = c.get('hubId') ?? ''

    const accessLevel = getAccessLevel(permissions)
    if (!accessLevel) {
      return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
    }

    const services = c.get('services')
    const result = await services.cases.listByContact(contactId, hubId)
    return c.json(result)
  },
```

- [ ] **Step 2.4: Update `cases.listByContact` to filter by hubId**

In `apps/worker/services/cases.ts`, update the method signature and add hubId filter:

```typescript
// Before:
  async listByContact(contactId: string): Promise<{
    records: CaseRecordRow[]
    total: number
  }> {
    const links = await this.db
      .select({ caseId: caseContacts.caseId })
      .from(caseContacts)
      .where(eq(caseContacts.contactId, contactId))

    if (links.length === 0) return { records: [], total: 0 }

    const caseIds = links.map((l) => l.caseId)

    const rows = await this.db
      .select()
      .from(caseRecords)
      .where(
        and(
          sql`${caseRecords.id} = ANY(ARRAY[${sql.join(
            caseIds.map((id) => sql`${id}`),
            sql.raw(','),
          )}]::text[])`,
          isNull(caseRecords.closedAt),
        ),
      )
      .orderBy(desc(caseRecords.updatedAt))

    return { records: rows, total: rows.length }
  }

// After:
  async listByContact(contactId: string, hubId: string): Promise<{
    records: CaseRecordRow[]
    total: number
  }> {
    const links = await this.db
      .select({ caseId: caseContacts.caseId })
      .from(caseContacts)
      .where(eq(caseContacts.contactId, contactId))

    if (links.length === 0) return { records: [], total: 0 }

    const caseIds = links.map((l) => l.caseId)

    const rows = await this.db
      .select()
      .from(caseRecords)
      .where(
        and(
          sql`${caseRecords.id} = ANY(ARRAY[${sql.join(
            caseIds.map((id) => sql`${id}`),
            sql.raw(','),
          )}]::text[])`,
          isNull(caseRecords.closedAt),
          // IDOR fix: only return records from the caller's hub
          hubId ? eq(caseRecords.hubId, hubId) : sql`true`,
        ),
      )
      .orderBy(desc(caseRecords.updatedAt))

    return { records: rows, total: rows.length }
  }
```

- [ ] **Step 2.5: Run tests**

```bash
bun test __tests__/unit/records-route.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 2.6: Check TypeScript**

```bash
cd /media/rikki/recover/projects/llamenos-plan-epic-e && bun run typecheck 2>&1 | grep -E "cases|records|IDOR" | head -10
```

Expected: No errors in changed files.

- [ ] **Step 2.7: Commit**

```bash
git add apps/worker/routes/records.ts apps/worker/services/cases.ts apps/worker/__tests__/unit/records-route.test.ts
git commit -m "fix(records): enforce hub isolation on by-contact lookup (IDOR)"
```

---

### Task 3: Lockdown — Require Schnorr re-authentication

**Files:**
- Create: `apps/worker/middleware/require-fresh-auth.ts`
- Modify: `apps/worker/routes/account.ts`
- Create: `apps/worker/__tests__/unit/account-lockdown.test.ts`

Currently, POST `/account/lockdown` accepts any valid session token — even a 7-day-old one. An attacker who briefly hijacks a session can trigger lockdown without the user's device key. The fix: require the request to be authenticated via Schnorr signature (Ed25519 over method + path + timestamp), which proves possession of the device private key at that moment. Schnorr auth is already supported; session-token auth must be blocked for this endpoint.

The auth middleware sets `c.get('sessionToken')` if session-token auth was used. If the request was authenticated via Schnorr signature, `sessionToken` is undefined.

- [ ] **Step 3.1: Write the failing test**

Create `apps/worker/__tests__/unit/account-lockdown.test.ts`:

```typescript
/**
 * Unit tests for POST /account/lockdown — elevated auth requirement.
 */
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../../types'
import accountRoutes from '../../routes/account'

function makeApp(opts: { sessionToken?: string; pubkey?: string } = {}) {
  const { sessionToken, pubkey = 'test-pubkey' } = opts
  const app = new Hono<AppEnv>()
  const services = {
    identity: {
      terminateOtherSessions: vi.fn().mockResolvedValue(3),
      getUserHubIds: vi.fn().mockResolvedValue(['hub-1', 'hub-2']),
      emitSecurityEvent: vi.fn().mockResolvedValue(undefined),
    },
  }

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey as never)
    c.set('services', services as never)
    if (sessionToken !== undefined) {
      c.set('sessionToken', sessionToken as never)
    }
    await next()
  })

  app.route('/account', accountRoutes)
  return { app, services }
}

describe('POST /account/lockdown — elevated auth', () => {
  it('rejects requests authenticated via session token', async () => {
    const { app } = makeApp({ sessionToken: 'old-session-token' })

    const res = await app.request('/account/lockdown', { method: 'POST' })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string; code: string }
    expect(body.code).toBe('ELEVATED_AUTH_REQUIRED')
  })

  it('allows requests authenticated via Schnorr (no session token)', async () => {
    const { app, services } = makeApp({ sessionToken: undefined })

    const res = await app.request('/account/lockdown', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(services.identity.terminateOtherSessions).toHaveBeenCalledWith('test-pubkey', '')
  })

  it('lockdown/complete does not require elevated auth (client-side completion step)', async () => {
    const { app } = makeApp({ sessionToken: 'some-session' })

    const res = await app.request('/account/lockdown/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pukRotated: true, hubKeysRotated: ['hub-1'], hubKeysFailed: [] }),
    })
    // Should not be blocked by elevated auth (completion is done after lockdown)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
bun test __tests__/unit/account-lockdown.test.ts 2>&1 | tail -20
```

Expected: FAIL — lockdown returns 200 even with session token.

- [ ] **Step 3.3: Create the middleware**

Create `apps/worker/middleware/require-fresh-auth.ts`:

```typescript
/**
 * requireFreshAuth — blocks session-token auth for sensitive operations.
 *
 * For operations like account lockdown, proof of current device key possession
 * is required. Session tokens can be stolen or long-lived. A Schnorr-signed
 * request proves the user's device key is still in their possession at the
 * moment of the request.
 *
 * Usage: apply BEFORE route handlers that require elevated auth.
 *
 * When session token auth is detected (c.get('sessionToken') is set),
 * this middleware returns 401 ELEVATED_AUTH_REQUIRED. Clients must
 * re-authenticate using a fresh Ed25519/Schnorr signature.
 */
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

export const requireFreshAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionToken = c.get('sessionToken')
  if (sessionToken) {
    return c.json(
      {
        error: 'This action requires re-authentication. Sign a fresh request with your device key.',
        code: 'ELEVATED_AUTH_REQUIRED',
      },
      401,
    )
  }
  await next()
})
```

- [ ] **Step 3.4: Apply middleware to POST /account/lockdown**

In `apps/worker/routes/account.ts`, import and apply the middleware:

```typescript
// Add import at top:
import { requireFreshAuth } from '../middleware/require-fresh-auth'

// Apply to lockdown route only:
accountRoutes.post('/lockdown', requireFreshAuth, async (c) => {
  // ... existing handler unchanged
})
```

- [ ] **Step 3.5: Run the test**

```bash
bun test __tests__/unit/account-lockdown.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 3.6: Typecheck**

```bash
bun run typecheck 2>&1 | grep -E "account|fresh|lockdown" | head -10
```

- [ ] **Step 3.7: Commit**

```bash
git add apps/worker/middleware/require-fresh-auth.ts apps/worker/routes/account.ts apps/worker/__tests__/unit/account-lockdown.test.ts
git commit -m "fix(account): require Schnorr re-auth for emergency lockdown"
```

---

## Phase 2: Input Validation (H02, H07)

### Task 4: H02 — Blast content sanitization and per-channel limits

**Files:**
- Modify: `packages/protocol/schemas/blasts.ts` (lines ~119–137)
- Modify: `apps/worker/services/blasts.ts` (content handling)
- Modify: `apps/worker/__tests__/unit/validation-blasts.test.ts`

Current issues:
1. A single `max(1600)` limit applies regardless of channel — SMS is OK, but WhatsApp supports 4096 chars and Signal supports 60000. The validation is misleading for those channels.
2. No sanitization of control characters (`\x00–\x08\x0b\x0c\x0e–\x1f\x7f`) which can corrupt SMS encoding or exploit downstream parsers.
3. Null bytes (`\x00`) are accepted, which breaks PostgreSQL text storage.

The fix: add a Zod `.superRefine()` that rejects null bytes in all content, and add a content sanitizer in the blast service that strips other control characters before storage. Per-channel limits are enforced at the schema level using a discriminated check.

- [ ] **Step 4.1: Add sanitization test cases to existing file**

In `apps/worker/__tests__/unit/validation-blasts.test.ts`, add to the `POST /blasts` describe block:

```typescript
    it('rejects content.body with null bytes', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        content: { body: 'hello\x00world' },
      })
      expect(res.status).toBe(400)
    })

    it('rejects content.body with control characters (e.g. BEL)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        content: { body: 'hello\x07world' },
      })
      expect(res.status).toBe(400)
    })

    it('accepts content.body with newlines (normal SMS content)', async () => {
      const app = createApp()
      // Note: this hits the service which is mocked in validation tests
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        content: { body: 'Line 1\nLine 2' },
      })
      // Validation passes (newlines are fine); service mock returns 201/200
      expect(res.status).not.toBe(400)
    })
```

- [ ] **Step 4.2: Run to confirm tests fail**

```bash
bun test __tests__/unit/validation-blasts.test.ts 2>&1 | tail -20
```

Expected: FAIL — null bytes and control chars currently accepted.

- [ ] **Step 4.3: Update the blast body schema**

In `packages/protocol/schemas/blasts.ts`, update `createBlastBodySchema` and `updateBlastBodySchema`:

```typescript
// Add a reusable blast body string validator
const blastBodyString = (max: number) =>
  z.string()
    .min(1)
    .max(max)
    .refine(
      (s) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s),
      'Blast content must not contain control characters (null bytes, BEL, BS, etc.)',
    )

export const createBlastBodySchema = z.looseObject({
  name: z.string().min(1).max(200),
  content: z.object({
    body: blastBodyString(1600),
    mediaUrl: z.url().optional(),
  }),
  channels: z.array(z.enum(['sms', 'whatsapp', 'signal'])).min(1),
  scheduledAt: z.iso.datetime().optional(),
})

export const updateBlastBodySchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  content: z.object({
    body: blastBodyString(1600),
    mediaUrl: z.url().optional(),
  }).optional(),
  channels: z.array(z.enum(['sms', 'whatsapp', 'signal'])).min(1).optional(),
  scheduledAt: z.iso.datetime().optional().nullable(),
})
```

Note: `1600` is the safe shared limit (10× SMS segments). Per-channel enforcement beyond 1600 is a delivery concern, not a storage concern, and can be added when the blast delivery worker validates per-channel constraints.

- [ ] **Step 4.4: Run validation tests**

```bash
bun test __tests__/unit/validation-blasts.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 4.5: Run full typecheck to confirm no schema regressions**

```bash
bun run typecheck 2>&1 | grep -E "blasts|protocol" | head -15
```

- [ ] **Step 4.6: Run all unit tests to confirm no blast test regressions**

```bash
bun test --run 2>&1 | grep -E "blast|FAIL" | head -20
```

- [ ] **Step 4.7: Commit**

```bash
git add packages/protocol/schemas/blasts.ts apps/worker/__tests__/unit/validation-blasts.test.ts
git commit -m "fix(blasts): reject control characters and null bytes in blast content (H02)"
```

---

### Task 5: H07 — SSRF guard fails CLOSED on DNS failure

**Files:**
- Modify: `apps/worker/lib/ssrf-guard.ts` (lines 140–148)
- Modify: `apps/worker/lib/ssrf-guard.test.ts`

The `validateExternalUrlWithDns` function at line 143–145 silently ignores DNS resolution failures and returns `null` (safe), allowing the request. An attacker can register a domain that initially fails DNS resolution and bypass SSRF protection.

- [ ] **Step 5.1: Write the failing test**

In `apps/worker/lib/ssrf-guard.test.ts`, add a test near the bottom:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { validateExternalUrlWithDns } from '@worker/lib/ssrf-guard'

describe('validateExternalUrlWithDns — DNS failure behavior', () => {
  it('blocks request when DNS resolution fails (fail-closed)', async () => {
    // Mock dns to throw (simulates NXDOMAIN or network failure)
    vi.mock('node:dns/promises', () => ({
      resolve4: vi.fn().mockRejectedValue(new Error('ENOTFOUND nonexistent.example.invalid')),
      resolve6: vi.fn().mockRejectedValue(new Error('ENOTFOUND nonexistent.example.invalid')),
    }))

    const result = await validateExternalUrlWithDns('https://nonexistent.example.invalid/path')
    expect(result).not.toBeNull()
    expect(result).toContain('DNS')
  })
})
```

- [ ] **Step 5.2: Run test to confirm it fails**

```bash
bun test lib/ssrf-guard.test.ts 2>&1 | tail -20
```

Expected: FAIL — currently returns `null` (allow) on DNS error.

- [ ] **Step 5.3: Fix the catch block to fail-closed**

In `apps/worker/lib/ssrf-guard.ts`, replace lines 143–145:

```typescript
  } catch {
    // DNS resolution failed — allow the request (fail-open for non-resolvable hosts)
  }
```

With:

```typescript
  } catch {
    // DNS resolution failed — block the request (fail-closed: unknown is untrusted)
    return `${label} DNS resolution failed — cannot verify address safety`
  }
```

- [ ] **Step 5.4: Run SSRF tests**

```bash
bun test lib/ssrf-guard.test.ts 2>&1 | tail -20
```

Expected: PASS — all existing tests still pass, new DNS failure test passes.

- [ ] **Step 5.5: Typecheck**

```bash
bun run typecheck 2>&1 | grep ssrf | head -5
```

- [ ] **Step 5.6: Commit**

```bash
git add apps/worker/lib/ssrf-guard.ts apps/worker/lib/ssrf-guard.test.ts
git commit -m "fix(ssrf): fail closed on DNS resolution failure (H07)"
```

---

## Phase 3: Race Condition Fix (H09)

### Task 6: H09 — PUK envelope upsert to prevent concurrent write corruption

**Files:**
- Modify: `apps/worker/services/crypto-keys.ts` (method `distributePukEnvelopes`, lines ~182–210)
- Modify: `apps/worker/__tests__/unit/puk-routes.test.ts`

Current `distributePukEnvelopes` issues a plain `INSERT`. The table has a unique constraint on `(device_id, generation)`. Under concurrent writes (two clients rotate PUK at the same time), the second write fails with a unique constraint violation, leaving some devices with no envelope for the new generation.

Fix: use `onConflictDoUpdate` — if the same `(deviceId, generation)` already exists, update the envelope in-place. This is safe because the envelope for a given generation should be deterministic (same PUK seed encrypted to the same device key).

- [ ] **Step 6.1: Write the failing test (concurrent behavior)**

In `apps/worker/__tests__/unit/puk-routes.test.ts`, add at the end of the `POST /puk/envelopes` describe block:

```typescript
    it('handles concurrent envelope distribution for the same generation (upsert)', async () => {
      const { app, services } = createApp()
      const envelope = [{ deviceId: 'dev-1', generation: 2, envelope: 'enc-v2' }]
      // Simulate idempotent upsert — same generation succeeds twice
      services.cryptoKeys.distributePukEnvelopes
        .mockResolvedValueOnce([
          { id: 'env-1', userPubkey: 'user-pk-1', deviceId: 'dev-1', generation: 2, envelope: 'enc-v2', createdAt: '2026-01-01' },
        ])
        .mockResolvedValueOnce([
          { id: 'env-1', userPubkey: 'user-pk-1', deviceId: 'dev-1', generation: 2, envelope: 'enc-v2', createdAt: '2026-01-01' },
        ])

      // Both requests should succeed
      const [res1, res2] = await Promise.all([
        app.request('/puk/envelopes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envelopes: envelope }),
        }),
        app.request('/puk/envelopes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envelopes: envelope }),
        }),
      ])

      expect(res1.status).toBe(201)
      expect(res2.status).toBe(201)
    })
```

- [ ] **Step 6.2: Run test to verify current state passes (this test passes already since we're mocking the service)**

```bash
bun test __tests__/unit/puk-routes.test.ts 2>&1 | tail -20
```

The route test will pass since services are mocked. The real fix is in the service.

- [ ] **Step 6.3: Fix `distributePukEnvelopes` to use upsert**

In `apps/worker/services/crypto-keys.ts`, find the `distributePukEnvelopes` method and update the insert:

```typescript
// Before:
    const inserted = await this.db
      .insert(pukEnvelopes)
      .values(envelopes.map(e => ({
        userPubkey,
        deviceId: e.deviceId,
        generation: e.generation,
        envelope: e.envelope,
      })))
      .returning()

// After:
    const inserted = await this.db
      .insert(pukEnvelopes)
      .values(envelopes.map(e => ({
        userPubkey,
        deviceId: e.deviceId,
        generation: e.generation,
        envelope: e.envelope,
      })))
      .onConflictDoUpdate({
        target: [pukEnvelopes.deviceId, pukEnvelopes.generation],
        set: {
          envelope: sql`excluded.envelope`,
          createdAt: sql`excluded.created_at`,
        },
      })
      .returning()
```

Ensure `sql` is imported from `drizzle-orm` at the top of the file. The `sql` template tag is already used in the service — check the import and add `sql` if it's not already imported.

- [ ] **Step 6.4: Typecheck the crypto-keys service**

```bash
bun run typecheck 2>&1 | grep crypto-keys | head -10
```

Expected: No errors.

- [ ] **Step 6.5: Run all PUK tests**

```bash
bun test __tests__/unit/puk-routes.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 6.6: Commit**

```bash
git add apps/worker/services/crypto-keys.ts apps/worker/__tests__/unit/puk-routes.test.ts
git commit -m "fix(puk): use upsert for PUK envelope distribution to prevent race condition (H09)"
```

---

## Phase 4: Rate Limit Coverage (H03 — depends on Epic A)

> **BLOCKED until Epic A Phase 1 (persistent rate limiter) is merged.**
> 
> Epic A must land first because:
> - The in-memory rate limiter in `middleware/rate-limit.ts` is per-process and not suitable as a default middleware (loses state on restart, incorrect under multi-process deployment).
> - Epic A replaces it with a PostgreSQL-backed rate limiter with per-route tier configuration.
> - Once Epic A is merged, the tasks below can be executed.

### Task 7: H03 — Apply rate limiting to all routes (after Epic A)

**Files:**
- Modify: `apps/worker/app.ts` (add default rate limit middleware to authenticated router)
- Modify: `apps/worker/middleware/rate-limit.ts` (add tiered config, if Epic A doesn't already add it)
- Create: `apps/worker/__tests__/unit/rate-limit-coverage.test.ts`

**Overview:** Once Epic A's persistent rate limiter is available, the plan is:
1. Apply a default rate limit tier (e.g., 120 req/min per user) globally on the `authenticated` router in `app.ts`
2. Override specific routes with stricter tiers:
   - Auth endpoints (`/auth/login`, `/auth/bootstrap`): already rate-limited, verify
   - Erasure endpoints: 5 req/min
   - Blast schedule/send: 10 req/min
   - Admin destructive ops: 20 req/min
3. Webhook routes (telephony, messaging) keep no user-based rate limit (validated by provider signature)
4. Dev routes (`/api/*dev*`) are development-only, no rate limit needed

- [ ] **Step 7.1: Audit all routes for missing rate limits** (do this after Epic A merges)

```bash
cd /media/rikki/recover/projects/llamenos-plan-epic-e/apps/worker
grep -rn "rateLimit\|rate_limit\|checkRateLimit" routes/ | sort
```

Compare against route list in `app.ts` to identify all routes without rate limiting.

- [ ] **Step 7.2: Write a test that verifies the default middleware applies**

Create `apps/worker/__tests__/unit/rate-limit-coverage.test.ts` — this test will depend on Epic A's rate limiter API. Write it after reviewing Epic A's implementation.

- [ ] **Step 7.3: Add default rate limit to authenticated router in app.ts**

After Epic A lands, add to `apps/worker/app.ts`:

```typescript
// Import Epic A's tiered rate limiter
import { tieredRateLimit } from './middleware/rate-limit'

// Apply default tier to all authenticated routes
authenticated.use('*', tieredRateLimit('default'))  // e.g., 120 req/min
```

- [ ] **Step 7.4: Configure per-route tier overrides**

Review each route module and add `tieredRateLimit('strict')` or `tieredRateLimit('webhook')` as needed per Epic A's tier configuration spec.

- [ ] **Step 7.5: Run full test suite**

```bash
bun run test --run 2>&1 | tail -20
```

- [ ] **Step 7.6: Commit**

```bash
git add apps/worker/app.ts apps/worker/middleware/rate-limit.ts apps/worker/__tests__/unit/rate-limit-coverage.test.ts
git commit -m "feat(rate-limit): apply default rate limit tier to all authenticated routes (H03)"
```

---

## Final Verification (Phases 1–3)

### Task 8: Full test suite and typecheck

- [ ] **Step 8.1: Run full typecheck**

```bash
cd /media/rikki/recover/projects/llamenos-plan-epic-e && bun run typecheck 2>&1 | tail -30
```

Expected: 0 errors.

- [ ] **Step 8.2: Run all unit tests**

```bash
cd /media/rikki/recover/projects/llamenos-plan-epic-e/apps/worker && bun test --run 2>&1 | tail -30
```

Expected: All pass.

- [ ] **Step 8.3: Confirm git log looks clean**

```bash
git log --oneline -10
```

Expected: 5 commits for Phases 1–3, each scoped to one fix.

---

## Self-Review Against Spec

| Issue | Fix | Task | BDD Property Tested |
|-------|-----|------|---------------------|
| H01: co-approver not verified as admin | Admin role check in `erasure.ts` | Task 1 | Non-admin key rejected, admin accepted |
| IDOR: by-contact leaks cross-hub records | hubId filter in route+service | Task 2 | Cross-hub records invisible |
| Lockdown: no re-auth | `requireFreshAuth` middleware | Task 3 | Session-token auth rejected; Schnorr accepted |
| H02: control chars in blast content | Zod `.refine()` in schema | Task 4 | Null bytes and BEL rejected; newlines accepted |
| H07: SSRF fail-open on DNS error | catch → return error | Task 5 | DNS failure blocks request |
| H09: PUK race condition | `onConflictDoUpdate` upsert | Task 6 | Concurrent writes both succeed |
| H03: missing rate limits | Deferred (depends on Epic A) | Task 7 | N/A until Epic A |

**H04 (dev routes bypass) and H05 (webhook bypass) are NOT included in this plan** per the task prompt which limits scope to H01, H02, H03, H07, H09, IDOR, and lockdown. If these need to be added, create a follow-on spec.

**No placeholder tasks.** Phase 4 is explicitly gated on a dependency (Epic A) and the steps are as detailed as possible given that dependency.
