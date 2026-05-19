# Epic A: Auth & Session Security — Implementation Plan

**Date**: 2026-05-18
**Spec**: `docs/superpowers/specs/2026-05-18-epic-a-auth-session-security.md`
**Priority**: Critical
**Findings**: C01, C02, C03, H03, H04, H05, H06, H08

---

## Dependency Graph

```
Phase 1: Database Foundation (C03)
    └──► Phase 4: Rate Limit Coverage (H03)

Phase 2: Auth Hardening (C01, H04, H05)  — independent

Phase 3: Session Security (C02, H06, H08) — independent
```

Phases 2 and 3 are independent of each other and of Phase 1. Phase 4 depends on Phase 1 (persistent rate limiter must exist before expanding coverage).

---

## Phase 1: Database Foundation — Persistent Rate Limiter (C03)

### Goal
Replace the in-memory `Map<string, RateLimitEntry>` with PostgreSQL-backed rate limiting using the existing `rate_limits` table and `SettingsService.checkRateLimit()`.

### Why PostgreSQL, not a new table
The existing `rate_limits` table (`apps/worker/db/schema/settings.ts:324-327`) and `SettingsService.checkRateLimit()` (`apps/worker/services/settings.ts:485-524`) already implement atomic PostgreSQL-backed rate limiting with upsert semantics. The spec suggests a new `api_rate_limits` table with fixed-window counters — this is better than the existing timestamp-array approach for high throughput. **Decision: create the new `api_rate_limits` table** with fixed-window counters as the spec recommends, since the existing table's JSONB timestamp array doesn't scale well under concurrent load.

### Tasks

#### 1.1 — Migration: `api_rate_limits` table
**File**: `apps/worker/db/migrations/0014_api_rate_limits.sql`

```sql
-- Migration 0014: Persistent API rate limiting
-- Epic A / C03: Replace in-memory rate limiter with PostgreSQL

CREATE TABLE IF NOT EXISTS "api_rate_limits" (
  "key"          text PRIMARY KEY,
  "count"        integer NOT NULL DEFAULT 1,
  "window_start" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "api_rate_limits_window_idx"
  ON "api_rate_limits" ("window_start");
```

**Rollback**: `DROP TABLE IF EXISTS api_rate_limits;`

#### 1.2 — Drizzle schema: `apiRateLimits`
**File**: `apps/worker/db/schema/settings.ts`

Add after the existing `rateLimits` table:

```typescript
export const apiRateLimits = pgTable('api_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(1),
  windowStart: timestamp('window_start', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
```

**File**: `apps/worker/db/schema/index.ts` — export the new table.

#### 1.3 — Rate limit tier configuration
**File**: `apps/worker/middleware/rate-limit.ts` — **full rewrite**

Replace the entire file. New implementation:

```typescript
export type RateLimitTier = 'strict' | 'write' | 'read' | 'webhook' | 'unlimited'

export const RATE_LIMIT_TIERS: Record<Exclude<RateLimitTier, 'unlimited'>, { maxRequests: number; windowMs: number }> = {
  strict:  { maxRequests: 5,   windowMs: 60_000 },   // Auth/login/provisioning — per IP
  write:   { maxRequests: 30,  windowMs: 60_000 },   // Create/update/delete — per user
  read:    { maxRequests: 120, windowMs: 60_000 },   // Read endpoints — per user
  webhook: { maxRequests: 300, windowMs: 60_000 },   // Provider webhooks — per IP
}
```

Key implementation details:
- Accept `tier: RateLimitTier` parameter
- Key derivation: `strict` and `webhook` tiers use IP (`c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'`); `write` and `read` tiers use `c.get('pubkey')`
- For `strict` tier on unauthenticated routes: key by IP (no pubkey available)
- Use single SQL query via Drizzle raw:
  ```sql
  INSERT INTO api_rate_limits (key, count, window_start)
  VALUES ($1, 1, NOW())
  ON CONFLICT (key) DO UPDATE
  SET count = CASE
    WHEN api_rate_limits.window_start < NOW() - $2::interval
    THEN 1
    ELSE api_rate_limits.count + 1
  END,
  window_start = CASE
    WHEN api_rate_limits.window_start < NOW() - $2::interval
    THEN NOW()
    ELSE api_rate_limits.window_start
  END
  RETURNING count, window_start;
  ```
- Remove the in-memory `Map`, the `setInterval` cleanup, and the `RateLimitEntry` interface
- The middleware needs access to the DB via `c.get('services')` or `c.get('db')` — check which is available at the middleware execution point
- Return 429 with `Retry-After` header (seconds until window resets)
- `unlimited` tier returns a no-op middleware

**Edge cases**:
- IP extraction: must handle proxied requests (CF-Connecting-IP > X-Forwarded-For > fallback)
- Race condition: the `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` is atomic in PostgreSQL
- Clock skew: use `NOW()` (server time), not client time
- Missing DB context: if DB is unreachable, **fail open** (log error, allow request) — rate limiting is defense-in-depth, not a primary auth mechanism

#### 1.4 — Periodic cleanup of expired windows
**File**: `apps/worker/services/settings.ts`

Add method to `SettingsService`:
```typescript
async clearExpiredApiRateLimits(): Promise<void> {
  await this.db.delete(apiRateLimits)
    .where(sql`${apiRateLimits.windowStart} < NOW() - INTERVAL '10 minutes'`)
}
```

This should be called from the existing periodic cleanup mechanism or a new one in the server startup.

**File**: `apps/worker/routes/dev.ts` — Update the `/test-rate-limits` endpoint to also clear `api_rate_limits`.

#### 1.5 — Unit tests: Rate limiter

**File**: `apps/worker/middleware/__tests__/rate-limit.test.ts` (new)

Tests (using the DB directly, not HTTP):
- `rateLimit('strict') blocks 6th request within 60s window`
- `rateLimit('strict') allows request after window expires`
- `rateLimit('write') blocks 31st request within 60s window`
- `rateLimit('read') blocks 121st request within 60s window`
- `rateLimit('webhook') blocks 301st request within 60s window`
- `rateLimit('unlimited') never blocks`
- `concurrent requests are counted atomically (10 parallel inserts = count 10)`
- `window resets after expiry (count goes back to 1)`
- `Retry-After header is present on 429 response`
- `IP-based keying used for strict and webhook tiers`
- `pubkey-based keying used for write and read tiers`
- `unauthenticated strict requests key by IP`

### BDD Tests (Phase 1)

**File**: `packages/test-specs/features/security/rate-limiting.feature` (new)

```gherkin
@backend @security
Feature: Persistent rate limiting
  Rate limit state persists in PostgreSQL and survives server restarts.
  Different endpoint tiers have different limits.

  Background:
    Given a clean test environment
    And rate limit counters are cleared

  Scenario: Rate limit counter persists across server restart
    Given a user has made 4 of 5 allowed auth requests
    When the server restarts
    And the user makes another auth request
    Then the response status should be 429
    And the Retry-After header should be present

  Scenario: Rate limit window expires correctly
    Given a user has been rate limited on auth endpoints
    When 60 seconds have passed
    Then the next auth request should succeed with status 200

  Scenario: Concurrent requests are counted atomically
    When 10 auth requests arrive simultaneously from the same IP
    Then the total count in the database should be exactly 10

  Scenario: Different endpoints have different rate limit tiers
    Given I am authenticated
    When I make 6 POST requests to an auth endpoint within 1 minute
    Then the 6th request should return 429
    When I make 31 write requests within 1 minute
    Then the 31st request should return 429
    When I make 121 read requests within 1 minute
    Then the 121st request should return 429

  Scenario: 429 response includes Retry-After header
    When I make 6 auth requests within 1 minute from the same IP
    Then the 6th response status should be 429
    And the Retry-After header should contain a positive integer
```

---

## Phase 2: Auth Hardening (C01, H04, H05)

### Goal
Remove dev-mode auth bypass, gate dev routes properly, and enforce webhook signature verification everywhere.

### Tasks

#### 2.1 — Remove dev-mode auth bypass (C01)
**File**: `apps/worker/middleware/auth.ts`

**Change**: Remove lines 24-41 (the entire dev-mode bypass block). Replace with an opt-in `DEV_AUTH_BYPASS` gated path:

```typescript
if (!authResult && c.env.DEV_AUTH_BYPASS === 'true') {
  const devAuthHeader = c.req.header('Authorization') ?? null
  const authPayload = parseAuthHeader(devAuthHeader)
  if (authPayload?.pubkey && validateToken(authPayload)) {
    const user = await services.identity.getUserInternal(authPayload.pubkey)
    if (user && user.active !== false) {
      authResult = { pubkey: authPayload.pubkey, user }
      reqLog.warn('DEV_AUTH_BYPASS active — signature verification skipped', {
        pubkeyPrefix: authPayload.pubkey.slice(0, 8),
      })
    }
  }
}
```

Key differences from current code:
- Gated by `DEV_AUTH_BYPASS=true` env var (explicit opt-in), NOT by `ENVIRONMENT=development`
- WARN level logging, not INFO
- Log message explicitly names the bypass

**File**: `apps/worker/types.ts` — Add `DEV_AUTH_BYPASS?: string` to `Env` type.

**Verification**: Grep `deploy/docker/` and `deploy/helm/` to confirm `DEV_AUTH_BYPASS` is NOT set in any config file.

**Rollback**: Revert the commit. No data changes.

#### 2.2 — Gate dev routes behind `DEV_ROUTES_ENABLED` (H04)
**File**: `apps/worker/app.ts`

**Change**: Replace line 117 (`api.route('/', devRoutes)`) with conditional mounting:

```typescript
// Dev routes — only available when explicitly enabled in development
if (process.env.ENVIRONMENT === 'development' && process.env.DEV_ROUTES_ENABLED === 'true') {
  api.route('/', devRoutes)
}
```

Wait — Hono routes are configured at app construction time, and the env is available on `c.env` at request time, not at module load. Need to check how the Hono app is constructed. Looking at the app.ts structure, the Hono app is constructed at module scope. The env vars come from Bun's `process.env` in the server startup.

**Alternative approach**: Keep the route mounted but add an early guard middleware:

```typescript
// In app.ts, before mounting dev routes:
const devGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT !== 'development' || c.env.DEV_ROUTES_ENABLED !== 'true') {
    return c.json({ error: 'Not Found' }, 404)
  }
  return next()
})
```

Then mount: `api.use('/test-*', devGuard)` before `api.route('/', devRoutes)`.

**File**: `apps/worker/routes/dev.ts`

**Change**: Remove the Bearer token bypass from `checkResetSecret()` (lines 33-34):

```typescript
// REMOVE these lines:
// const authHeader = c.req.header('Authorization')
// if (authHeader?.startsWith('Bearer ')) return true
```

After removal, `checkResetSecret()` only accepts exact `X-Test-Secret` header match.

**File**: `apps/worker/types.ts` — Add `DEV_ROUTES_ENABLED?: string` to `Env` type.

**Edge cases**:
- BDD test helpers that use `apiPost()` with Bearer tokens will break — they must send `X-Test-Secret` header instead
- Check BDD step definitions for test-reset calls and update them

**Rollback**: Revert the commit.

#### 2.3 — Remove webhook signature bypass for localhost (H05)
**File**: `apps/worker/routes/telephony.ts`

**Change**: Remove lines 52-55 (the `isDev`/`isLocal` bypass). The middleware becomes:

```typescript
telephony.use('*', async (c, next) => {
  // ... existing adapter resolution code ...

  const isValid = await adapter.validateWebhook(c.req.raw)
  if (!isValid) {
    logger.error(`Webhook signature FAILED for ${url.pathname}`)
    return c.text('Forbidden', 403)
  }
  await next()
})
```

**Edge cases**:
- Local telephony development requires valid webhook signatures — developers must use test provider credentials or a signature bypass tool
- The simulation endpoints in `dev.ts` are unaffected (they bypass telephony entirely)

**Rollback**: Revert the commit.

### BDD Tests (Phase 2)

**File**: `packages/test-specs/features/security/auth-hardening.feature` (new)

```gherkin
@backend @security
Feature: Auth bypass removal and dev route gating
  Dev-mode shortcuts for auth bypass, dev route access, and webhook
  signature verification are removed or gated behind explicit flags.

  # ─── C01: Dev Auth Bypass ──────────────────────────────────────────

  Scenario: Dev-mode does not bypass signature verification
    Given the environment is "development"
    And DEV_AUTH_BYPASS is not set
    And a registered user with a valid pubkey
    When I send a request with a valid pubkey but invalid signature
    Then the response status should be 401

  Scenario: DEV_AUTH_BYPASS enables bypass when explicitly set
    Given the environment is "development"
    And DEV_AUTH_BYPASS is "true"
    And a registered user with a valid pubkey
    When I send a request with a valid pubkey but invalid signature
    Then the response status should be 200

  Scenario: DEV_AUTH_BYPASS has no effect in production
    Given the environment is "production"
    And DEV_AUTH_BYPASS is "true"
    And a registered user with a valid pubkey
    When I send a request with a valid pubkey but invalid signature
    Then the response status should be 401

  Scenario: Valid signature accepted in development mode
    Given the environment is "development"
    And DEV_AUTH_BYPASS is not set
    And a registered user with a valid keypair
    When I send a request with a valid pubkey and valid Ed25519 signature
    Then the response status should be 200

  # ─── H04: Dev Routes Gating ───────────────────────────────────────

  Scenario: Dev routes unavailable when DEV_ROUTES_ENABLED is unset
    Given the environment is "development"
    And DEV_ROUTES_ENABLED is not set
    When I POST to "/api/test-reset" with valid X-Test-Secret
    Then the response status should be 404

  Scenario: Dev routes unavailable in production
    Given the environment is "production"
    And DEV_ROUTES_ENABLED is "true"
    When I POST to "/api/test-reset" with valid X-Test-Secret
    Then the response status should be 404

  Scenario: Bearer token alone does not grant dev route access
    Given the environment is "development"
    And DEV_ROUTES_ENABLED is "true"
    When I POST to "/api/test-reset" with only an Authorization Bearer token
    Then the response status should be 404

  Scenario: X-Test-Secret grants dev access when DEV_ROUTES_ENABLED
    Given the environment is "development"
    And DEV_ROUTES_ENABLED is "true"
    When I POST to "/api/test-reset" with valid X-Test-Secret
    Then the response status should be 200

  # ─── H05: Webhook Signature Enforcement ────────────────────────────

  Scenario: Localhost webhook without valid signature is rejected
    Given the environment is "development"
    And a telephony provider is configured
    When I POST to "/api/telephony/incoming" from 127.0.0.1 without a valid signature
    Then the response status should be 403

  Scenario: Webhook with valid provider signature is accepted
    Given a telephony provider is configured with test credentials
    When I POST to "/api/telephony/incoming" with a valid provider signature
    Then the response status should be 200
```

---

## Phase 3: Session Security (C02, H06, H08)

### Goal
Delete sessions on device revocation, enforce absolute session lifetime, and fix WebAuthn challenge atomic consume.

### Tasks

#### 3.1 — Migration: sessions device_id index (C02)
**File**: `apps/worker/db/migrations/0014_api_rate_limits.sql` (append to same migration file, or create `0015_session_device_idx.sql` if Phase 1 is a separate PR)

```sql
-- C02: Index for efficient session lookup by deviceId (for revocation cleanup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_device_info_device_id_idx"
  ON "sessions" ((device_info->>'deviceId'))
  WHERE device_info IS NOT NULL;
```

Note: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. If using Drizzle migrations that wrap in transactions, this must be a separate migration file or use `SET LOCAL` to disable the transaction wrapper.

#### 3.2 — Delete sessions on device revocation (C02)
**File**: `apps/worker/services/identity.ts`

**Change**: Inside `revokeDevice()` transaction (around line 975), add session deletion:

```typescript
await this.db.transaction(async (tx) => {
  // 1. Append device_remove sigchain link (existing)
  // ...

  // 2. Delete device record (existing)
  await tx.delete(devices).where(eq(devices.id, deviceId))

  // 3. Delete all sessions for this device (NEW — C02)
  await tx.delete(sessions).where(
    and(
      eq(sessions.pubkey, pubkey),
      sql`${sessions.deviceInfo}->>'deviceId' = ${deviceId}`
    )
  )

  // 4. Emit security event (existing)
  // ...
})
```

**Also add** a reusable method:
```typescript
async deleteSessionsByDeviceId(pubkey: string, deviceId: string): Promise<number> {
  const result = await this.db.delete(sessions).where(
    and(
      eq(sessions.pubkey, pubkey),
      sql`${sessions.deviceInfo}->>'deviceId' = ${deviceId}`
    )
  ).returning()
  return result.length
}
```

**Edge cases**:
- Sessions without `deviceId` in `device_info` (older sessions) — unaffected (SQL `->>'deviceId'` returns NULL, won't match)
- Transaction atomicity: session deletion is inside the same transaction as device deletion — if either fails, both roll back

**Rollback**: Revert the commit. Dangling sessions resume 8h natural expiry.

#### 3.3 — Session absolute max lifetime (H06)
**File**: `apps/worker/lib/session-renewal.ts`

Add max lifetime constant and update `RenewalDecision`:

```typescript
/** Absolute max session lifetime: 7 days */
export const MAX_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export type RenewalDecision =
  | { action: 'valid'; expiresAt: Date }
  | { action: 'renew'; newExpiresAt: Date }
  | { action: 'expired' }
  | { action: 'max_lifetime_exceeded' }

export function decideSessionRenewal(
  expiresAt: Date,
  now: Date = new Date(),
  renewalThresholdMs: number = RENEWAL_THRESHOLD_MS,
  sessionDurationMs: number = SESSION_DURATION_MS,
  createdAt?: Date,
  maxLifetimeMs: number = MAX_SESSION_LIFETIME_MS,
): RenewalDecision {
  // Check absolute max lifetime first
  if (createdAt && (now.getTime() - createdAt.getTime()) >= maxLifetimeMs) {
    return { action: 'max_lifetime_exceeded' }
  }

  if (expiresAt < now) {
    return { action: 'expired' }
  }

  const remaining = expiresAt.getTime() - now.getTime()
  if (remaining < renewalThresholdMs) {
    const newExpiresAt = new Date(now.getTime() + sessionDurationMs)
    return { action: 'renew', newExpiresAt }
  }

  return { action: 'valid', expiresAt }
}
```

**File**: `apps/worker/services/identity.ts`

Update `validateSession()` (around line 591):

```typescript
async validateSession(token: string): Promise<ServerSession> {
  // ... existing fetch logic ...

  const decision = decideSessionRenewal(
    row.expiresAt,
    new Date(),
    RENEWAL_THRESHOLD_MS,
    SESSION_DURATION_MS,
    row.createdAt,  // pass createdAt for max lifetime check
  )

  if (decision.action === 'max_lifetime_exceeded') {
    await this.db.delete(sessions).where(eq(sessions.token, token))
    throw new ServiceError(401, 'Session max lifetime exceeded', { code: 'SESSION_MAX_LIFETIME' })
  }

  if (decision.action === 'expired') {
    await this.db.delete(sessions).where(eq(sessions.token, token))
    throw new ServiceError(401, 'Session expired')
  }

  if (decision.action === 'renew') {
    await this.db
      .update(sessions)
      .set({ expiresAt: decision.newExpiresAt })
      .where(eq(sessions.token, token))
    return { ...rowToSession(row), expiresAt: decision.newExpiresAt.toISOString() }
  }

  return rowToSession(row)
}
```

**Migration**: None — `sessions.createdAt` already exists.

**Edge cases**:
- Sessions created before this change: they have `createdAt` already, so the max lifetime check works retroactively
- Sessions older than 7 days: immediately expired on next validation (security improvement)

**Rollback**: Revert the commit.

#### 3.4 — WebAuthn challenge atomic consume (H08)
**File**: `apps/worker/services/identity.ts`

Replace `getWebAuthnChallenge()` (lines 744-765) with atomic delete-if-valid:

```typescript
async getWebAuthnChallenge(id: string): Promise<{ challenge: string }> {
  const cutoff = new Date(Date.now() - CHALLENGE_TTL_MS)

  // Atomic: delete only if not expired
  const deleted = await this.db
    .delete(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.challengeId, id),
        gt(webauthnChallenges.createdAt, cutoff),
      )
    )
    .returning()

  if (deleted.length > 0) {
    return { challenge: deleted[0].challenge }
  }

  // No row deleted — either doesn't exist or expired
  const [stale] = await this.db
    .select()
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.challengeId, id))
    .limit(1)

  if (stale) {
    // Expired — clean up the stale row
    await this.db
      .delete(webauthnChallenges)
      .where(eq(webauthnChallenges.challengeId, id))
    throw new ServiceError(410, 'Challenge expired')
  }

  throw new ServiceError(404, 'Challenge not found')
}
```

**Key change**: The valid challenge is consumed atomically (DELETE with WHERE condition). An expired challenge is NOT consumed prematurely — the user gets a clean error without losing a valid challenge to a race.

**Edge cases**:
- Race condition: two simultaneous consume attempts — only one gets the row (DELETE ... RETURNING is atomic)
- Expired challenge cleanup: stale rows are cleaned up on access, preventing table bloat

**Rollback**: Revert the commit.

### Unit tests (Phase 3)

**File**: `apps/worker/lib/__tests__/session-renewal.test.ts` (update existing or create)

- `decideSessionRenewal returns max_lifetime_exceeded when createdAt is 7+ days ago`
- `decideSessionRenewal returns renew when createdAt is 6 days ago and remaining < 1h`
- `decideSessionRenewal returns valid when createdAt is within 7 days`
- `max lifetime check takes precedence over renewal check`
- `createdAt undefined skips max lifetime check (backward compat)`

### BDD Tests (Phase 3)

**File**: `packages/test-specs/features/security/session-security.feature` (new)

```gherkin
@backend @security
Feature: Session security hardening
  Sessions are cleaned up on device revocation, have an absolute maximum
  lifetime, and WebAuthn challenges are consumed atomically.

  # ─── C02: Session Cleanup on Device Revocation ────────────────────

  Scenario: Revoked device sessions are immediately invalidated
    Given a registered user with an active device "device-1"
    And the user has an active session linked to "device-1"
    When the user revokes device "device-1"
    Then all sessions for "device-1" should be deleted
    And the session token should return 401 when used

  Scenario: Revoking a device does not affect other device sessions
    Given a registered user with devices "device-1" and "device-2"
    And the user has active sessions for both devices
    When the user revokes device "device-1"
    Then sessions for "device-2" should remain valid
    And the "device-2" session token should still authenticate

  Scenario: Session deletion is atomic with device deletion
    Given a registered user with an active device "device-1"
    And the user has an active session linked to "device-1"
    When the user revokes device "device-1"
    Then the device record should not exist in the database
    And no sessions for "device-1" should exist in the database

  # ─── H06: Session Absolute Max Lifetime ────────────────────────────

  Scenario: Session within max lifetime is renewed normally
    Given a session created 6 days ago with 30 minutes remaining
    When the session is validated
    Then the session should be renewed with a new expiry

  Scenario: Session exceeding max lifetime is rejected
    Given a session created 8 days ago
    When the session is validated
    Then the response status should be 401
    And the error code should be "SESSION_MAX_LIFETIME"
    And the session should be deleted from the database

  Scenario: Session at exactly 7 days is rejected
    Given a session created exactly 7 days ago
    When the session is validated
    Then the response status should be 401
    And the error code should be "SESSION_MAX_LIFETIME"

  # ─── H08: WebAuthn Challenge Atomic Consume ────────────────────────

  Scenario: Valid challenge is consumed and returned
    Given a WebAuthn challenge created 2 minutes ago
    When the challenge is consumed
    Then the challenge value should be returned
    And the challenge should not exist in the database

  Scenario: Expired challenge is not consumed prematurely
    Given a WebAuthn challenge created 6 minutes ago
    When the challenge is consumed
    Then the response status should be 410
    And the expired challenge should be cleaned up from the database

  Scenario: Missing challenge returns 404
    When a non-existent challenge is consumed
    Then the response status should be 404

  Scenario: Concurrent challenge consume attempts — only one succeeds
    Given a valid WebAuthn challenge
    When two simultaneous consume requests arrive
    Then exactly one should succeed with the challenge value
    And the other should receive 404
```

---

## Phase 4: Rate Limit Coverage (H03)

### Depends on: Phase 1 (persistent rate limiter must be in place)

### Goal
Apply rate limiting as a default middleware on all routes, with per-route tier overrides matching the user-confirmed rate limit tiers.

### Tasks

#### 4.1 — Default rate limiting on all routes
**File**: `apps/worker/app.ts`

Apply rate limiting at two levels:

**Public routes** (before auth middleware):
```typescript
import { rateLimit } from './middleware/rate-limit'

// Strict rate limiting on auth/provisioning endpoints (by IP)
api.use('/auth/*', rateLimit('strict'))
api.use('/webauthn/*', rateLimit('strict'))
api.use('/invites/*', rateLimit('strict'))
api.use('/provision/*', rateLimit('strict'))
api.use('/recovery-group/*', rateLimit('strict'))

// Webhook rate limiting (by IP)
api.use('/telephony/*', rateLimit('webhook'))
api.use('/messaging/*', rateLimit('webhook'))

// Health/metrics — no rate limiting
// (already mounted before this middleware, or use 'unlimited')
```

**Authenticated routes** (after auth middleware):
```typescript
// Default: read tier for GET, write tier for mutations
authenticated.use('*', async (c, next) => {
  const method = c.req.method
  const tier = (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
    ? 'read' : 'write'
  return rateLimit(tier)(c, next)
})
```

**Key design**: The method-based default (GET→read, POST/PUT/DELETE→write) provides sensible defaults without touching individual route files. Per-route overrides can be added later if needed.

**File ordering matters**: Rate limit middleware must be applied BEFORE the route handlers but AFTER CORS (to ensure 429 responses have CORS headers).

#### 4.2 — Per-route tier overrides
Some routes need explicit overrides:

| Route | Override | Reason |
|-------|----------|--------|
| `/health/*` | `unlimited` | Internal probes |
| `/metrics/*` | `unlimited` | Prometheus scraping |
| `/config/*` | `unlimited` | Public config |
| `/telephony/*` | `webhook` | Provider callbacks |
| `/messaging/*` | `webhook` | Provider callbacks |

These are already handled by the middleware placement in 4.1.

#### 4.3 — BDD test helper update
**File**: `apps/worker/routes/dev.ts`

The test-reset endpoint should also clear the new `api_rate_limits` table:

```typescript
// In /test-rate-limits handler:
await services.settings.clearRateLimits(prefix || undefined)
// Also clear the new api_rate_limits table
const db = c.get('db') // or however DB access works
await db.delete(apiRateLimits).where(
  prefix ? sql`key LIKE ${prefix + '%'}` : sql`1=1`
)
```

### BDD Tests (Phase 4)

**File**: `packages/test-specs/features/security/rate-limiting.feature` (append to Phase 1 file)

```gherkin
  # ─── H03: Rate Limit Coverage ──────────────────────────────────────

  Scenario: Auth endpoints reject after 5 requests per minute
    When I make 6 authentication requests to "/api/auth" within 1 minute from the same IP
    Then the 6th request should return 429
    And the Retry-After header should be present

  Scenario: Write endpoints reject after 30 requests per minute
    Given I am authenticated
    When I make 31 POST requests to a write endpoint within 1 minute
    Then the 31st request should return 429

  Scenario: Read endpoints reject after 120 requests per minute
    Given I am authenticated
    When I make 121 GET requests to a read endpoint within 1 minute
    Then the 121st request should return 429

  Scenario: Webhook endpoints allow 300 requests per minute
    Given a telephony provider is configured
    When 300 valid webhook requests arrive within 1 minute
    Then all 300 should succeed
    And the 301st should return 429

  Scenario: Health endpoints are not rate limited
    When I make 500 requests to "/api/health/ready"
    Then all responses should be 200

  Scenario: All API endpoints have rate limiting applied
    Given I am authenticated
    When I make requests to any authenticated endpoint
    Then the response should include rate limit state tracking
    And exceeding the tier limit should return 429
```

---

## Implementation Sequence

| Step | Phase | Finding | Parallel? | Files Changed |
|------|-------|---------|-----------|---------------|
| 1 | 1 | C03 | Start | migration, schema, middleware/rate-limit.ts, services/settings.ts, routes/dev.ts |
| 2 | 2.1 | C01 | Yes (with 1) | middleware/auth.ts, types.ts |
| 3 | 2.2 | H04 | Yes (with 1) | app.ts, routes/dev.ts, types.ts |
| 4 | 2.3 | H05 | Yes (with 1) | routes/telephony.ts |
| 5 | 3.2 | C02 | Yes (with 1) | services/identity.ts, migration |
| 6 | 3.3 | H06 | Yes (with 1) | lib/session-renewal.ts, services/identity.ts |
| 7 | 3.4 | H08 | Yes (with 1) | services/identity.ts |
| 8 | 4 | H03 | After 1 | app.ts, test-specs |

Steps 2-7 can all proceed in parallel with step 1, as they don't depend on the persistent rate limiter. Step 8 must wait for step 1.

---

## Rollback Strategy

Each phase is independently revertable:
- **Phase 1**: Drop `api_rate_limits` table, revert middleware to in-memory. No data loss.
- **Phase 2**: Revert commits. Dev bypass resumes. No data changes.
- **Phase 3**: Revert commits. Sessions resume 8h sliding expiry. No data loss.
- **Phase 4**: Remove default middleware. Routes return to un-rate-limited state.

All changes are code-level except the migration (Phase 1 table + Phase 3 index). Both are additive and can be dropped without data loss.

---

## Verification Checklist

- [ ] All 8 findings have corresponding BDD scenarios
- [ ] Rate limit tiers match user-confirmed values (5/30/120/300 req/min)
- [ ] 429 responses include Retry-After header
- [ ] DEV_AUTH_BYPASS is NOT in any Docker/Helm config
- [ ] DEV_ROUTES_ENABLED is NOT in any Docker/Helm config
- [ ] WebAuthn challenge consume is atomic (single SQL query)
- [ ] Session deletion is inside the device revocation transaction
- [ ] Session max lifetime check precedes sliding expiry renewal
- [ ] Webhook signature verification has no localhost bypass
- [ ] `api_rate_limits` table has cleanup mechanism for expired windows
