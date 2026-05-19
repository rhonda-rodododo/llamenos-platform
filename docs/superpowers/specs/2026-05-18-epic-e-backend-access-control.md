# Epic E — Backend Access Control & Input Validation

**Date:** 2026-05-18  
**Status:** SPEC — no code changes  
**Author:** rhonda-rodododo  
**Priority:** HIGH — all findings are severity HIGH or critical

---

## Overview

Two audits (2026-05-18) found access control gaps and input validation issues in `apps/worker/`. This spec defines the required fixes for 10 findings:

- H01: Emergency Erasure Co-Approval Accepts Any Key
- H02: Blast Content Unsanitized
- H03: Rate Limiting Coverage (only 5/56 routes protected)
- H04: Dev Routes Accessible to Any Auth User
- H05: Telephony Webhook Signature Bypass
- H07: SSRF DNS Fail-Open
- H09: PUK Envelope Storage Race Condition
- IDOR: Records /by-contact Missing Hub Membership Check
- LOCKDOWN: Account Lockdown Missing Elevated Auth

**Design principle (default-deny):** Every route that does not explicitly declare required role/permissions must require `settings:manage` (admin). Fail CLOSED on all security checks without exception.

**Epic A dependency:** H03 (tiered rate limiting) requires a Redis-backed rate limit store from Epic A to be effective in multi-process deployments. The in-memory store already exists and works for single-process; the tiered limits MUST be implemented regardless and will work with the existing store. Epic A persistence is a scale improvement, not a prerequisite.

---

## Findings

---

### H01 — Emergency Erasure Co-Approval Accepts Any Key

**File:** `apps/worker/services/erasure.ts:140–166`

#### Current Behavior

The co-approval path verifies that `coApproverPubkey` is a valid Ed25519 key and that the signature over `LABEL_ERASURE_OVERRIDE_SIG:userId:timestamp` is valid. However, it performs **no check that the key belongs to a registered admin**. Any holder of any Ed25519 keypair can construct a valid signature and co-approve an emergency erasure — including the user's own secondary device or a freshly generated throwaway key.

```typescript
// Current — only checks signature validity, not admin membership
sigValid = ed25519Verify(
  hexToBytes(emergency.coApproverPubkey),
  sigMessage,
  hexToBytes(emergency.coApproverSignature),
)
// No check: is coApproverPubkey a registered admin device key?
```

#### Required Behavior

After signature verification succeeds, look up all admin device keys via `IdentityService.getUsers()` filtered to users with `settings:manage` permission. The `coApproverPubkey` must match a known device public key belonging to an active admin user. If no matching admin device is found, reject with 403.

The check must be done against the **user sigchain / device registry** — not just the roles table — because device keys are the trust root.

#### Specific Changes

**`apps/worker/services/erasure.ts`**

After line 165 (`if (!sigValid) { throw new ServiceError(400, ...) }`), add:

```typescript
// Verify co-approver is a registered admin
const { users: allUsers } = await this.identity.getUsers()
const { roles: roleDefs } = await this.settings.getRoles()
const adminUsers = allUsers.filter(u =>
  u.active !== false &&
  resolvePermissions(u.roles, roleDefs).includes('settings:manage')
)
// Get all device pubkeys for admin users
const adminDeviceKeys = await this.identity.getDevicePubkeysForUsers(
  adminUsers.map(u => u.pubkey)
)
if (!adminDeviceKeys.has(emergency.coApproverPubkey)) {
  throw new ServiceError(403, 'Co-approver is not a registered admin device')
}
```

If `getDevicePubkeysForUsers` does not exist, add it to `IdentityService` — it should query the `devices` table for all `pubkey` values belonging to users in the provided list.

The `ErasureService` constructor already receives `identity` and `settings` — no DI changes needed.

#### Threat Model Note

An adversary who compromises a non-admin device cannot unilaterally trigger emergency erasure on another user's account. Two admin devices must collude, which matches the intended 2-of-N admin co-approval semantics.

---

### H02 — Blast Content Unsanitized

**File:** `apps/worker/services/blasts.ts:483–500`

#### Current Behavior

`createBlast(input)` inserts `input.content` and `input.name` directly into the database with no:
- Length limit
- Control character stripping
- Encoding validation
- Channel-specific constraint checking

A blast targeting SMS with a 50 KB content field would attempt to send 50 KB to an SMS provider, which either truncates silently, fails with a 400 error, or in the worst case injects extra segments exploiting provider-specific control sequences.

#### Required Behavior

Validate and sanitize content before storage. Channel-specific limits:

| Channel     | Max content bytes | Notes |
|-------------|------------------|-------|
| SMS         | 1,600            | GSM-7: 160 chars × 10 segments max |
| WhatsApp    | 4,096            | WhatsApp Business API limit |
| Signal      | 64,000           | Signal message limit |
| Telegram    | 4,096            | Telegram API limit |
| RCS         | 8,192            | Google RBM limit |
| Email       | 102,400          | 100 KB |
| Default     | 64,000           | Fallback for new channel types |

Name limit: 255 bytes for all channels.

Sanitization: strip C0/C1 control characters (U+0000–U+001F, U+007F–U+009F) except `\n`, `\r`, `\t`. Reject null bytes (U+0000) outright. Validate UTF-8 encoding.

#### Specific Changes

**New: `apps/worker/lib/blast-validation.ts`**

```typescript
const CHANNEL_CONTENT_LIMITS: Record<string, number> = {
  sms: 1600,
  whatsapp: 4096,
  signal: 64000,
  telegram: 4096,
  rcs: 8192,
  email: 102400,
}
const DEFAULT_CONTENT_LIMIT = 64000
const NAME_LIMIT = 255

export function validateBlastContent(
  content: string,
  targetChannels: string[],
): void {
  // UTF-8 validation (Bun strings are UTF-16; check for lone surrogates)
  if (/[\uD800-\uDFFF]/.test(content)) {
    throw new ServiceError(400, 'Blast content contains invalid Unicode (lone surrogate)')
  }
  // Null byte check
  if (content.includes('\x00')) {
    throw new ServiceError(400, 'Blast content contains null bytes')
  }
  // Per-channel size limit
  const contentBytes = Buffer.byteLength(content, 'utf8')
  for (const channel of targetChannels) {
    const limit = CHANNEL_CONTENT_LIMITS[channel] ?? DEFAULT_CONTENT_LIMIT
    if (contentBytes > limit) {
      throw new ServiceError(400,
        `Blast content exceeds ${channel} limit (${contentBytes} > ${limit} bytes)`)
    }
  }
}

export function sanitizeBlastContent(content: string): string {
  // Strip C0 control chars except \n \r \t
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu, '')
}

export function validateBlastName(name: string): void {
  const nameBytes = Buffer.byteLength(name, 'utf8')
  if (nameBytes > NAME_LIMIT) {
    throw new ServiceError(400, `Blast name exceeds ${NAME_LIMIT} bytes`)
  }
}
```

**`apps/worker/services/blasts.ts:createBlast`**

Before the `db.insert()` call, add:

```typescript
validateBlastName(input.name)
validateBlastContent(input.content, input.targetChannels)
const sanitizedContent = sanitizeBlastContent(input.content)
// Use sanitizedContent in the insert, not input.content
```

Also apply the same validation in `updateBlast` if that method accepts content/name changes.

---

### H03 — Rate Limiting Coverage

**Scope:** All ~56 route files in `apps/worker/routes/`

#### Current Behavior

Rate limiting is applied to 9 specific routes across 9 files:
- `webauthn.ts` — WebAuthn registration/authentication
- `ws.ts` — WebSocket connections
- `telephony.ts` — telephony webhooks
- `recovery-group.ts` — recovery group operations
- `security-events.ts` — security event recording
- `sessions.ts` — session management
- `dev.ts` — dev test helpers
- `devices.ts` — device management
- `admin/devices.ts` — admin device management

The remaining ~47 route files have no rate limiting whatsoever.

#### Required Behavior

Apply a **default rate limit middleware** to ALL routes via the app-level middleware chain, with per-route overrides for tighter or looser limits where justified.

**Tiers:**

| Tier | Limit | Window | Key | Applies To |
|------|-------|--------|-----|-----------|
| auth | 5/min | 60s | IP | Auth endpoints: POST /api/auth/*, POST /api/webauthn/* |
| write | 30/min | 60s | user pubkey | POST/PUT/PATCH/DELETE on non-webhook routes |
| read | 120/min | 60s | user pubkey | GET on non-webhook routes |
| webhook | 300/min | 60s | IP | Provider webhook routes |
| health | unlimited | — | — | /health/*, /metrics |

For unauthenticated requests (no pubkey), fall back to IP-based limiting using the `CF-Connecting-IP` header (or `X-Forwarded-For` with single-hop trust). The current `rateLimit()` middleware skips unauthenticated requests entirely — this must be fixed.

#### Specific Changes

**`apps/worker/middleware/rate-limit.ts`** — extend to support IP-based fallback:

```typescript
export function rateLimit(
  maxRequests: number,
  windowMs: number,
  keyPrefix: string,
  options?: { ipFallback?: boolean }
): MiddlewareHandler<AppEnv>
```

When `pubkey` is not set and `options.ipFallback === true`, derive the rate limit key from `CF-Connecting-IP` (or `X-Forwarded-For`). Log missing IP header as a warning.

**`apps/worker/index.ts`** (or wherever global middleware is applied) — add default rate limiting before route registration:

```typescript
// Default rate limits — applied globally before any route handler
app.use('/api/*', defaultReadRateLimit)   // 120/min per user (IP fallback)
app.use('/api/*', defaultWriteRateLimit)  // applied by HTTP method in handler
```

A cleaner approach is a single middleware that inspects `c.req.method` to select the tier:

```typescript
export function defaultRateLimit(): MiddlewareHandler<AppEnv> {
  const readLimiter = rateLimit(120, 60_000, 'read', { ipFallback: true })
  const writeLimiter = rateLimit(30, 60_000, 'write', { ipFallback: true })
  return async (c, next) => {
    const method = c.req.method
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return writeLimiter(c, next)
    }
    return readLimiter(c, next)
  }
}
```

**Per-route overrides** (tighter):
- `POST /api/auth/*` — 5/min per IP (auth tier)
- `POST /api/webauthn/register`, `POST /api/webauthn/authenticate` — 5/min per IP
- `POST /api/telephony/*`, `POST /api/messaging/webhook/*` — 300/min per IP (webhook tier)
- `GET /health/*`, `GET /metrics` — exempt

**Per-route overrides** (looser, justified):
- `GET /api/calls/*` (active call polling) — 240/min per user
- `GET /api/ws` (WebSocket upgrade) — handled by existing ws.ts rateLimit

#### Route-by-Route Rate Limit Plan

| Route File | Current Status | Recommended Tier | Notes |
|------------|---------------|-----------------|-------|
| account.ts | None | write | POST /lockdown, /lockdown/complete |
| admin/devices.ts | Has limits | Already covered | Keep existing |
| analytics.ts | None | read | GET only |
| audit.ts | None | read | Admin-only |
| auth.ts | None | auth (5/min) | POST /auth/* — tightest limit |
| bans.ts | None | write | POST/DELETE |
| blasts.ts | None | write | POST/PUT — includes new content validation |
| calls.ts | None | read+write | GET: read tier; POST: write tier |
| config.ts | None | read | GET only |
| contacts.ts | None | write | POST/PUT/DELETE |
| contacts-v2.ts | None | write | POST/PUT/DELETE |
| conversations.ts | None | write | Messaging writes |
| devices.ts | Has limits | Already covered | Keep existing |
| dev.ts | Has limits | Keep | ENVIRONMENT-gated |
| entity-schema.ts | None | read | GET only |
| erasure.ts | None | write | POST erasure request |
| events.ts | None | write | POST/PUT |
| evidence.ts | None | write | POST/DELETE |
| files.ts | None | write | POST upload |
| firehose.ts | None | webhook (300/min) | Provider webhooks |
| geocoding.ts | None | read | External lookup |
| health.ts | None | exempt | Liveness/readiness probes |
| hub-onboard.ts | None | write | Onboarding steps |
| hubs.ts | None | write | CRUD |
| invites.ts | None | write | POST/DELETE |
| metrics.ts | None | exempt | Prometheus scrape |
| mls.ts | None | write | MLS group operations |
| notes.ts | None | write | Note CRUD |
| platform-bans.ts | None | write | Admin write |
| platform-settings.ts | None | write | Admin write |
| provider-setup.ts | None | write | Admin write |
| provider-templates.ts | None | read | GET only |
| provisioning.ts | None | write | Device provisioning |
| puk.ts | None | write | Key distribution |
| records.ts | None | write | CMS CRUD |
| recovery-group.ts | Has limits | Already covered | Keep existing |
| reports.ts | None | write | Report submission |
| retention.ts | None | write | Admin write |
| ring-groups.ts | None | write | Admin write |
| security-events.ts | Has limits | Already covered | Keep existing |
| sessions.ts | Has limits | Already covered | Keep existing |
| settings.ts | None | write | Admin write |
| setup.ts | None | write | Initial setup |
| shifts.ts | None | write | Shift CRUD |
| sigchain.ts | None | write | Key operations |
| signal-notification.ts | None | webhook | Sidecar-to-backend |
| signal.ts | None | webhook | Signal webhooks |
| system.ts | None | read | System status |
| tags.ts | None | write | Tag CRUD |
| teams.ts | None | write | Team CRUD |
| telephony.ts | Has limits | Already covered | Keep existing |
| uploads.ts | None | write | File upload |
| users.ts | None | write | User CRUD |
| webauthn.ts | Has limits | Already covered | Keep existing |
| webrtc.ts | None | write | WebRTC signaling |
| ws.ts | Has limits | Already covered | Keep existing |

---

### H04 — Dev Routes Accessible to Any Auth User

**File:** `apps/worker/routes/dev.ts:27–36`

#### Current Behavior

`dev.ts` is mounted unconditionally in the app. The individual endpoint handlers check `c.env.ENVIRONMENT !== 'development'` and return 404 if not in dev mode. However:

1. The module is imported and loaded regardless of environment — a future programming error could easily bypass the per-handler check.
2. The `checkResetSecret` function accepts **any valid Bearer token** as authentication in addition to the `X-Test-Secret` header (line 34: `if (authHeader?.startsWith('Bearer ')) return true`). This means any authenticated user can call dev routes when `DEV_RESET_SECRET` is configured.

```typescript
// Current — any valid Bearer auth passes the secret check
if (authHeader?.startsWith('Bearer ')) return true
```

#### Required Behavior

1. The `dev.ts` module must **not be imported at all** in production. Use dynamic import or conditional registration at app startup.
2. `checkResetSecret` must verify the Bearer token is specifically the `DEV_RESET_SECRET` or `E2E_TEST_SECRET` value, not just any valid auth token.
3. When `ENVIRONMENT=staging`, only `test-reset-records` with valid `E2E_TEST_SECRET` is permitted — this is already implemented but item 2 above undermines it.

#### Specific Changes

**`apps/worker/index.ts`** (app entry point where routes are registered):

```typescript
// Conditional dev routes — module not loaded in production
if (process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'staging') {
  const devRoutes = await import('./routes/dev')
  app.route('/api/dev', devRoutes.default)
}
```

**`apps/worker/routes/dev.ts:checkResetSecret`** — fix the Bearer token check:

```typescript
function checkResetSecret(c: { ... }): boolean {
  const secret = c.env.DEV_RESET_SECRET || c.env.E2E_TEST_SECRET
  if (!secret) return false
  // Only accept exact secret match — never accept arbitrary Bearer tokens
  if (c.req.header('X-Test-Secret') === secret) return true
  const authHeader = c.req.header('Authorization')
  if (authHeader === `Bearer ${secret}`) return true
  return false
}
```

**Note:** This is a behavior change for E2E tests that currently pass Bearer tokens. Test infrastructure (`TestApiClient.kt`, BDD world setup) will need to be updated to pass `X-Test-Secret: $E2E_TEST_SECRET` or `Authorization: Bearer $E2E_TEST_SECRET` (exact match).

---

### H05 — Telephony Webhook Signature Bypass

**File:** `apps/worker/routes/telephony.ts:52–55`

#### Current Behavior

```typescript
const isDev = env.ENVIRONMENT === 'development'
const isLocal = isDev && c.req.header('CF-Connecting-IP') === '127.0.0.1'
if (!isLocal) {
  const isValid = await adapter.validateWebhook(c.req.raw)
```

When `ENVIRONMENT=development` and the incoming request has `CF-Connecting-IP: 127.0.0.1`, webhook signature verification is **skipped entirely**. In practice, `CF-Connecting-IP` is not set by Cloudflare when running locally, so the check is based on the raw header which can be spoofed by any client that can set request headers.

More critically, any integration test, script, or misconfigured client talking to a dev server can forge telephony webhooks without valid provider credentials.

#### Required Behavior

Always verify webhook signatures. Remove the localhost bypass entirely. For development, use Twilio/SignalWire test credentials or the existing `SimulationAdapter` (dev simulation endpoints in `dev.ts` already bypass telephony entirely, so there is no legitimate need for signature bypass in the telephony handler).

#### Specific Changes

**`apps/worker/routes/telephony.ts`** — remove lines 52–55 and replace with:

```typescript
// Always verify webhook signatures — no localhost bypass
// Use dev/test credentials (TWILIO_TEST_ACCOUNT_SID etc.) in development
const isValid = await adapter.validateWebhook(c.req.raw)
if (!isValid) {
  logger.error(`Webhook signature FAILED for ${url.pathname}`)
  return c.text('Forbidden', 403)
}
```

**Documentation update:** Add to `CLAUDE.md` gotchas: "telephony webhook signature verification is always enforced. Use `dev.ts` simulation endpoints or configure test provider credentials for local E2E tests."

---

### H07 — SSRF DNS Fail-Open

**File:** `apps/worker/lib/ssrf-guard.ts:143–145`

#### Current Behavior

```typescript
} catch {
  // DNS resolution failed — allow the request (fail-open for non-resolvable hosts)
}
return null // null = allowed
```

When DNS resolution throws (network error, NXDOMAIN, timeout), the guard returns `null` (allowed). An attacker targeting an internal DNS name that is not publicly resolvable from the backend's upstream resolver, but IS resolvable from within the VPS network (e.g., `postgres`, `redis`, `localhost.internal`), could bypass SSRF protection.

#### Required Behavior

Fail CLOSED: if DNS resolution fails for any reason, block the request. Log the failure with the hostname (no IP) for debugging. Return a blocking error message.

#### Specific Changes

**`apps/worker/lib/ssrf-guard.ts:143–145`**:

```typescript
} catch (err) {
  // DNS resolution failed — BLOCK (fail closed, not fail open)
  // Non-resolvable hostnames may be internal names not accessible from the public internet
  const errorMsg = err instanceof Error ? err.message : String(err)
  logger.warn('SSRF guard: DNS resolution failed, blocking request', {
    hostname: parsed.hostname,
    error: errorMsg,
  })
  return `${label} DNS resolution failed (SSRF protection: fail-closed)`
}
```

The return value of a non-null string from `checkSsrf` must be treated as a block by all callers. Verify that callers check for non-null return and reject accordingly.

---

### H09 — PUK Envelope Storage Race Condition

**File:** `apps/worker/routes/puk.ts:74–85` / `apps/worker/services/crypto-keys.ts` (likely)

#### Current Behavior

`distributePukEnvelopes(userPubkey, envelopes)` stores per-device PUK envelopes. If two devices belonging to the same user submit envelopes concurrently (e.g., during initial device provisioning), the second write may overwrite or partially corrupt envelopes set by the first write, depending on the database operation used.

The race window is small but consequential: a corrupted PUK envelope means the affected device cannot decrypt any new notes until the next full re-distribution cycle.

#### Required Behavior

PUK envelope storage must be atomic per `(userPubkey, deviceId, generation)` tuple. Use `INSERT ... ON CONFLICT (user_pubkey, device_id) DO UPDATE SET ... WHERE excluded.generation > puk_envelopes.generation` (upsert) to ensure last-write-wins by generation number, or wrap in a transaction with `SELECT ... FOR UPDATE` on the user row to serialize concurrent writes.

The upsert approach is preferred — it avoids lock contention and is deadlock-safe.

#### Specific Changes

**`apps/worker/services/crypto-keys.ts`** (or wherever `distributePukEnvelopes` is implemented):

Replace non-atomic inserts with:

```typescript
// Atomic upsert — last writer wins by generation number
await this.db
  .insert(pukEnvelopes)
  .values(envelopesToInsert)
  .onConflictDoUpdate({
    target: [pukEnvelopes.userPubkey, pukEnvelopes.deviceId],
    set: {
      encryptedEnvelope: sql`EXCLUDED.encrypted_envelope`,
      generation: sql`EXCLUDED.generation`,
      updatedAt: sql`EXCLUDED.updated_at`,
    },
    where: sql`EXCLUDED.generation > ${pukEnvelopes}.generation`,
  })
```

If the schema does not have a unique constraint on `(user_pubkey, device_id)`, add a migration:

```sql
ALTER TABLE puk_envelopes
  ADD CONSTRAINT puk_envelopes_user_device_unique UNIQUE (user_pubkey, device_id);
```

---

### IDOR — Records /by-contact Missing Hub Membership Check

**File:** `apps/worker/routes/records.ts:231–259`

#### Current Behavior

```typescript
records.get('/by-contact/:contactId', ..., async (c) => {
  const contactId = c.req.param('contactId')
  const permissions = c.get('permissions')
  const accessLevel = getAccessLevel(permissions)
  if (!accessLevel) {
    return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
  }
  const services = c.get('services')
  const result = await services.cases.listByContact(contactId)
  return c.json(result)
})
```

This endpoint returns all records linked to a contact by ID. The only authorization check is that the caller has `cases:read-own` or higher. There is no check that:
1. The contact with `contactId` belongs to a hub the caller is a member of.
2. The caller has read access to **that hub's** contacts/records.

A volunteer in Hub A can enumerate records linked to contacts in Hub B by guessing/enumerating contact IDs (which are UUIDs, but still exposed via other endpoints).

#### Required Behavior

Before returning records, verify that the contact belongs to a hub the calling user is a member of, and that the user's access level applies to that hub's records.

#### Specific Changes

**`apps/worker/routes/records.ts:247–258`** — add hub membership check:

```typescript
async (c) => {
  const contactId = c.req.param('contactId')
  const permissions = c.get('permissions')
  const pubkey = c.get('pubkey')

  const accessLevel = getAccessLevel(permissions)
  if (!accessLevel) {
    return c.json({ error: 'Forbidden', required: 'cases:read-own' }, 403)
  }

  const services = c.get('services')

  // Verify contact exists and belongs to a hub the caller is a member of
  const contact = await services.contacts.getById(contactId)
  if (!contact) {
    return c.json({ error: 'Not Found' }, 404)
  }

  const userHubIds = await services.identity.getUserHubIds(pubkey)
  if (contact.hubId && !userHubIds.includes(contact.hubId)) {
    // Return 404 to avoid leaking hub membership information
    return c.json({ error: 'Not Found' }, 404)
  }

  const result = await services.cases.listByContact(contactId)
  return c.json(result)
}
```

**Note:** Return 404 (not 403) to avoid leaking that the contact exists in another hub. This is standard IDOR mitigation.

---

### LOCKDOWN — Account Lockdown Missing Elevated Authentication

**File:** `apps/worker/routes/account.ts:20–38`

#### Current Behavior

```typescript
accountRoutes.post('/lockdown', async (c) => {
  const pubkey = c.get('pubkey')
  // ... no elevated auth check ...
  await services.identity.terminateOtherSessions(pubkey, currentToken ?? '')
```

The lockdown endpoint requires only standard session auth (any valid session token). An attacker who steals a session token (e.g., via XSS on a compromised webview, compromised desktop app, or session fixation) can lock out the legitimate user by:
1. Calling `/api/account/lockdown` with the stolen token
2. This terminates all OTHER sessions — the legitimate user's sessions are invalidated
3. The attacker retains the stolen session while the user is locked out

This is a DoS / account takeover amplifier, not just a DoS. The lockdown operation is supposed to be an emergency recovery action initiated by the legitimate user.

#### Required Behavior

`POST /api/account/lockdown` must require **elevated authentication**: a freshly-proved possession of the device private key or a WebAuthn assertion, not just a session token. This mirrors PIN re-authentication patterns used in other critical operations.

Implementation options (in preference order):
1. **WebAuthn assertion**: Require a signed WebAuthn assertion in the request body, verified by `WebAuthnService` before proceeding. This is the preferred path if WebAuthn is enrolled for the user.
2. **Fresh Ed25519 signature**: Require a signed lockdown intent message (`LABEL_LOCKDOWN_INTENT:userId:timestamp`) in the request body, verified against the user's known device key. The timestamp must be within 60 seconds to prevent replay.
3. **Fallback**: If neither is enrolled (e.g., new account setup), reject with 428 (Precondition Required) and a message instructing the user to complete device setup first.

#### Specific Changes

**`apps/worker/routes/account.ts`**:

Add a new `lockdownElevatedAuthSchema` at the top:
```typescript
const lockdownElevatedAuthSchema = z.object({
  // Option A: WebAuthn assertion
  webauthnAssertion: z.object({
    id: z.string(),
    response: z.object({
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      signature: z.string(),
    }),
  }).optional(),
  // Option B: Fresh Ed25519 signature over lockdown intent
  signature: z.string().optional(),
  timestamp: z.number().int().optional(), // Unix ms
})
```

Update the handler to verify elevated auth before executing lockdown:

```typescript
accountRoutes.post('/lockdown',
  validator('json', lockdownElevatedAuthSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    // Require elevated auth (WebAuthn or fresh device signature)
    const elevated = await verifyElevatedAuth(pubkey, body, services)
    if (!elevated) {
      return c.json({ error: 'Elevated authentication required for lockdown' }, 403)
    }
    // ... rest of lockdown logic
  }
)
```

Add `verifyElevatedAuth` helper to `apps/worker/lib/elevated-auth.ts` (new file):

```typescript
export async function verifyElevatedAuth(
  pubkey: string,
  body: { webauthnAssertion?: ...; signature?: string; timestamp?: number },
  services: Services,
): Promise<boolean>
```

This function should:
1. Try WebAuthn assertion if provided and WebAuthn is enabled for the user.
2. Try Ed25519 signature if provided: verify `LABEL_LOCKDOWN_INTENT:${pubkey}:${timestamp}`, check timestamp within 60s, check against user's registered device keys.
3. Return false if neither is provided or verified.

The `LABEL_LOCKDOWN_INTENT` constant must be added to `packages/protocol/crypto-labels.json` and regenerated via codegen. Never use a raw string literal.

---

## Authorization Matrix

Based on the EP01 permission model:

| Endpoint Group | Minimum Permission | Notes |
|---------------|-------------------|-------|
| `GET /api/calls/*` | `calls:read-active` | Volunteers on shift |
| `POST /api/calls/answer` | `calls:answer` | Volunteer |
| `GET /api/notes/*` | `notes:read-own` | Own notes only for volunteer |
| `POST /api/notes/*` | `notes:create` | Volunteer |
| `GET /api/conversations/*` | `conversations:read-assigned` | Assigned conversations |
| `POST /api/conversations/*/send` | `conversations:send` | |
| `GET /api/records/*` | `cases:read-own` | CMS read |
| `POST /api/records/*` | `cases:create` | CMS write |
| `GET /api/hubs/*` | `hubs:read` | All authenticated |
| `POST /api/hubs/*` | `settings:manage` | Admin only |
| `GET /api/settings/*` | `settings:read` | |
| `PUT /api/settings/*` | `settings:manage` | Admin only |
| `POST /api/users/*` | `settings:manage` | Admin only |
| `DELETE /api/users/*` | `settings:manage` | Admin only |
| `POST /api/erasure/*` | `settings:manage` | Admin only |
| `POST /api/blasts/*` | `settings:manage` | Admin only |
| `POST /api/shifts/*` | `shifts:manage` | |
| `GET /api/shifts/own` | `shifts:read-own` | Volunteer |
| `POST /api/bans/*` | `bans:report` | Volunteer (report); `bans:manage` (admin) |
| `POST /api/account/lockdown` | Own account + elevated auth | Any user on own account |
| `GET /api/health/*` | None (public) | Kubernetes probes |
| `GET /api/metrics` | None or internal-only | Prometheus scrape |
| `POST /api/dev/*` | ENVIRONMENT=dev + secret | Never in production |
| `POST /api/telephony/*` | None (webhook) | Signature-verified |
| `POST /api/messaging/webhook/*` | None (webhook) | Signature-verified |

**Default-deny rule:** Any route not in the above table requires `settings:manage`. Routes that currently lack `requirePermission` middleware should be audited as part of implementation.

---

## Input Validation Inventory

| Endpoint | Accepts User Content | Current Validation | Required |
|----------|---------------------|-------------------|---------|
| `POST /api/blasts` | name, content | Schema only | Length limits, sanitization (H02) |
| `POST /api/notes` | encrypted content | Schema only | Envelope size limits |
| `POST /api/records` | encrypted fields | Schema only | Envelope size limits |
| `POST /api/contacts` | encrypted summary | Schema only | Envelope size limits |
| `POST /api/conversations/*/send` | message body | Schema only | Channel-specific limits |
| `POST /api/files/upload` | file | Content-type check | MIME validation, size limit |
| `POST /api/geocoding/lookup` | address string | None | SSRF guard (already exists) |
| `POST /api/erasure/request` | emergency.coApproverPubkey | None | Admin device key check (H01) |
| `POST /api/account/lockdown` | none | None | Elevated auth (LOCKDOWN) |
| `GET /api/records/by-contact/:id` | contactId path param | UUID format | Hub membership check (IDOR) |
| `POST /api/telephony/*` | raw provider body | Signature | Always verify (H05) |
| Geocoding / webhook URLs | URL string | SSRF guard | Fail-closed DNS (H07) |

---

## BDD Test Scenarios

Follows `packages/test-specs/features/` conventions. New file: `packages/test-specs/features/security/access-control.feature`

```gherkin
@security @backend
Feature: Backend Access Control
  As a security-conscious system
  I want all sensitive operations to require proper authorization
  So that unauthorized users cannot access or corrupt data

  Background:
    Given the backend is running in development mode
    And I have a registered volunteer user "alice"
    And I have a registered admin user "carol"
    And I have a second admin user "bob"

  # H01 — Emergency Erasure Co-Approval
  Scenario: Erasure co-approval with non-admin key is rejected
    Given "alice" has submitted an erasure request for her own account
    When "alice" attempts to co-approve the erasure with a freshly generated key
    Then the response status is 403
    And the response contains "Co-approver is not a registered admin device"

  Scenario: Erasure co-approval with valid admin key succeeds
    Given "alice" has submitted an erasure request for her own account
    When "carol" (admin) co-approves the erasure with their registered device key
    Then the response status is 200
    And the erasure request status is "pending_emergency"

  Scenario: Erasure co-approver cannot be the same user
    Given "alice" has submitted an erasure request for her own account
    When "alice" attempts to co-approve with her own device key
    Then the response status is 400
    And the response contains "Co-approver cannot be the same user"

  # H02 — Blast Content Validation
  Scenario: Blast with oversized SMS content is rejected
    When "carol" (admin) creates a blast targeting SMS with 2000 bytes of content
    Then the response status is 400
    And the response contains "exceeds sms limit"

  Scenario: Blast with control characters is sanitized
    When "carol" (admin) creates a blast with content containing null bytes
    Then the response status is 400
    And the response contains "null bytes"

  Scenario: Blast with valid content is accepted
    When "carol" (admin) creates a blast targeting SMS with 160 characters of content
    Then the response status is 201

  # H03 — Rate Limiting
  Scenario: Write endpoints are rate limited per user
    Given "alice" has made 30 POST requests to any write endpoint in the last 60 seconds
    When "alice" makes another POST request to a write endpoint
    Then the response status is 429
    And the response contains "retryAfterSeconds"

  Scenario: Unauthenticated requests are rate limited by IP
    Given 5 unauthenticated POST requests have been made to /api/auth from 1.2.3.4 in 60 seconds
    When a 6th unauthenticated POST to /api/auth comes from 1.2.3.4
    Then the response status is 429

  Scenario: Health endpoints are exempt from rate limiting
    Given "alice" has exceeded her rate limit
    When a request is made to /health/live
    Then the response status is 200

  # H04 — Dev Routes in Production
  Scenario: Dev routes return 404 when not in development
    Given the backend is running in production mode
    When any client sends POST /api/dev/test-reset
    Then the response status is 404

  Scenario: Dev route requires exact secret match
    Given the backend is in development mode with DEV_RESET_SECRET="s3cr3t"
    When a client sends POST /api/dev/test-reset with Authorization: Bearer sometoken
    Then the response status is 404
    And the dev reset did not execute

  Scenario: Dev route succeeds with exact Bearer secret
    Given the backend is in development mode with DEV_RESET_SECRET="s3cr3t"
    When a client sends POST /api/dev/test-reset with Authorization: Bearer s3cr3t
    Then the response status is 200

  # H05 — Telephony Webhook Signature
  Scenario: Telephony webhook without valid signature is rejected in development
    Given the backend is running in development mode
    When a POST to /api/telephony/incoming arrives from 127.0.0.1 without a valid signature
    Then the response status is 403

  Scenario: Telephony webhook with valid test signature succeeds
    Given Twilio test credentials are configured
    When a POST to /api/telephony/incoming arrives with a valid Twilio test signature
    Then the response status is 200

  # H07 — SSRF DNS Fail-Closed
  Scenario: SSRF guard blocks non-resolvable hostnames
    When the geocoding service attempts to fetch "http://internal-host-that-does-not-resolve/data"
    Then the SSRF guard returns a block error
    And the request is not forwarded

  Scenario: SSRF guard blocks resolvable internal addresses
    When the geocoding service attempts to fetch "http://host-resolving-to-10.0.0.1/data"
    Then the SSRF guard returns a block error

  # H09 — PUK Envelope Atomicity
  Scenario: Concurrent PUK envelope writes from two devices do not corrupt state
    Given "alice" has two devices "device-a" and "device-b"
    When both devices submit PUK envelopes simultaneously with different generations
    Then exactly one envelope per device is stored
    And the stored envelope has the higher generation number

  # IDOR — Records by Contact
  Scenario: Volunteer cannot fetch records for contact in another hub
    Given "alice" (volunteer) is a member of hub "hub-a" only
    And contact "C1" belongs to hub "hub-b"
    When "alice" requests GET /api/records/by-contact/C1
    Then the response status is 404

  Scenario: Volunteer can fetch records for contact in their own hub
    Given "alice" (volunteer) is a member of hub "hub-a"
    And contact "C1" belongs to hub "hub-a"
    And "alice" has cases:read-own permission
    When "alice" requests GET /api/records/by-contact/C1
    Then the response status is 200

  # LOCKDOWN — Elevated Auth
  Scenario: Account lockdown without elevated auth is rejected
    Given "alice" has a valid session token
    When "alice" calls POST /api/account/lockdown without an Ed25519 signature or WebAuthn assertion
    Then the response status is 403
    And the response contains "Elevated authentication required"

  Scenario: Account lockdown with valid fresh Ed25519 signature succeeds
    Given "alice" has a valid session token and registered device key
    When "alice" calls POST /api/account/lockdown with a fresh signature over LABEL_LOCKDOWN_INTENT
    Then the response status is 200
    And all other sessions for "alice" are terminated

  Scenario: Account lockdown with replayed signature is rejected
    Given "alice" has a valid session token and registered device key
    When "alice" calls POST /api/account/lockdown with a signature over a timestamp 90 seconds ago
    Then the response status is 403
```

---

## Dependency Ordering

The following sequence minimizes rework and ensures each fix can be independently implemented and tested:

```
Phase 1 (no external dependencies):
  H07 — SSRF DNS fail-closed     (single file, no schema changes)
  H05 — Telephony signature bypass (single file, no schema changes)
  H04 — Dev routes isolation     (module loading + checkResetSecret fix)

Phase 2 (requires Phase 1 infra to be stable):
  H02 — Blast content validation (new validation module + service changes)
  IDOR — Records /by-contact     (route-level authorization check)

Phase 3 (requires identity service patterns):
  H01 — Erasure co-approval      (requires getDevicePubkeysForUsers in IdentityService)
  H09 — PUK envelope atomicity   (requires DB migration + upsert pattern)

Phase 4 (new crypto label + elevated auth infrastructure):
  LOCKDOWN — Account lockdown elevated auth
    → Add LABEL_LOCKDOWN_INTENT to crypto-labels.json
    → Run bun run codegen
    → Implement elevated-auth.ts helper
    → Update account.ts route

Phase 5 (can proceed in parallel with Phases 1-4, but should land last):
  H03 — Rate limiting coverage
    → Epic A Redis store is recommended but not required
    → Implement defaultRateLimit() global middleware
    → Apply IP-fallback for unauthenticated requests
    → Add per-route overrides for auth/webhook tiers
```

---

## Notes on Epic A Dependency

H03 (rate limiting coverage) uses the existing in-memory store in `rate-limit.ts`. The in-memory store works correctly for single-process deployments. For horizontal scaling (multiple Bun worker processes), Epic A provides a Redis-backed store that makes rate limits consistent across processes.

**Recommendation:** Implement H03 against the in-memory store now. Design the `rateLimit()` function to accept an optional `store` parameter so the Epic A Redis store can be swapped in without touching route definitions. The interface should be:

```typescript
interface RateLimitStore {
  check(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs?: number }>
  increment(key: string, windowMs: number): Promise<void>
}
```

The current in-memory implementation becomes the default `MemoryRateLimitStore`, and Epic A provides `RedisRateLimitStore`.

---

## Files Affected (Summary)

| File | Change Type | Finding |
|------|------------|---------|
| `apps/worker/services/erasure.ts` | Modify | H01 |
| `apps/worker/services/identity.ts` | Add method | H01 |
| `apps/worker/lib/blast-validation.ts` | **New file** | H02 |
| `apps/worker/services/blasts.ts` | Modify | H02 |
| `apps/worker/middleware/rate-limit.ts` | Modify (IP fallback, store interface) | H03 |
| `apps/worker/index.ts` | Modify (global middleware, conditional dev import) | H03, H04 |
| `apps/worker/routes/dev.ts` | Modify (checkResetSecret fix) | H04 |
| `apps/worker/routes/telephony.ts` | Modify (remove localhost bypass) | H05 |
| `apps/worker/lib/ssrf-guard.ts` | Modify (fail-closed DNS) | H07 |
| `apps/worker/services/crypto-keys.ts` | Modify (upsert) | H09 |
| `apps/worker/db/migrations/NNNN_puk_envelope_unique.sql` | **New migration** | H09 |
| `apps/worker/routes/records.ts` | Modify (hub membership check) | IDOR |
| `apps/worker/routes/account.ts` | Modify (elevated auth) | LOCKDOWN |
| `apps/worker/lib/elevated-auth.ts` | **New file** | LOCKDOWN |
| `packages/protocol/crypto-labels.json` | Add LABEL_LOCKDOWN_INTENT | LOCKDOWN |
| `packages/test-specs/features/security/access-control.feature` | **New file** | All |

---

*Spec written 2026-05-18 by rhonda-rodododo for Epic E audit findings.*
