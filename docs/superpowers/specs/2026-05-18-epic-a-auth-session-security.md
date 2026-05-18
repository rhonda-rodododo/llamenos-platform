# Epic A: Critical Auth & Session Security Fixes

**Date**: 2026-05-18
**Status**: Draft
**Priority**: Critical
**Source**: Independent security audits (Claude + Kimi), 2026-05-18

## Overview

Two independent security audits identified critical authentication and session management vulnerabilities in `apps/worker/`. This spec covers 8 findings (3 critical, 5 high) requiring backend code changes, a database migration, and comprehensive test coverage.

---

## Findings

### C01 — Dev-Mode Auth Bypass (CRITICAL)

**Current behavior**: When `ENVIRONMENT=development` and Ed25519 signature verification fails, the auth middleware falls back to pubkey-only authentication for registered users. Any valid pubkey with a well-formed (but incorrectly-signed) token authenticates successfully.

- **File**: `apps/worker/middleware/auth.ts:31-41`
- The bypass validates token format and freshness but skips signature verification entirely
- Logged as `Dev-mode signature bypass` at INFO level
- Comment justifies this for "mobile E2E tests where Rust native crypto library may produce signatures that fail verification due to cross-architecture interop differences"

**Target behavior**: Remove the dev-mode signature bypass entirely. Dev environments must use real authentication with test keypairs. If a dev convenience is truly needed for specific cross-architecture testing scenarios, gate it behind an explicit `DEV_AUTH_BYPASS=true` environment variable that:
- Is NEVER set in Docker/Helm/CI configs
- Emits a WARN-level log on every bypassed request
- Is documented as a security risk in the env var reference

**Files to change**:
- `apps/worker/middleware/auth.ts` — Remove lines 24-41 (the entire dev-mode bypass block). Optionally add a `DEV_AUTH_BYPASS` gated path with loud warnings.
- `apps/worker/types.ts` — Add `DEV_AUTH_BYPASS?: string` to `Env` type if the opt-in path is implemented
- `deploy/docker/docker-compose.dev.yml` — Verify `DEV_AUTH_BYPASS` is NOT present
- `deploy/helm/` — Verify `DEV_AUTH_BYPASS` is NOT in any values file

**Migration**: None (code-only change).

**Backward compatibility**: Breaking for any dev tooling that relies on the bypass. Mobile E2E tests using cross-architecture crypto must be fixed to produce valid signatures or use test keypairs with correct signing.

**Rollback**: Revert the commit. No data migration needed.

---

### C02 — Dangling Sessions After Device Revocation (CRITICAL)

**Current behavior**: `revokeDevice()` in `apps/worker/services/identity.ts:944-1011` atomically appends a sigchain link, deletes the device record, and emits a security event — but does NOT delete session tokens associated with the revoked device. Sessions have 8-hour sliding expiry (effectively unlimited with H06). A revoked device can continue making authenticated requests for up to 8 hours (or indefinitely if H06 is also unpatched).

- **File**: `apps/worker/services/identity.ts:974-1007` (the transaction block)
- Sessions table has `device_info` JSONB column containing `deviceId` (see `apps/worker/db/schema/users.ts:81`)
- `createSession()` at line 563-584 stores `deviceId` in `deviceInfo`

**Target behavior**: `revokeDevice()` must atomically delete all sessions whose `device_info->>'deviceId'` matches the revoked device ID, within the same transaction as device deletion.

**Files to change**:
- `apps/worker/services/identity.ts`:
  - Inside the `revokeDevice()` transaction (line 975), add: delete from `sessions` where `device_info->>'deviceId' = deviceId` AND `pubkey = pubkey`
  - Add a new `deleteSessionsByDeviceId(pubkey: string, deviceId: string)` method for reuse
- `apps/worker/db/schema/users.ts` — Add a GIN index on `sessions.device_info` for query performance (optional but recommended for production scale):
  ```sql
  CREATE INDEX sessions_device_info_device_id_idx ON sessions ((device_info->>'deviceId'));
  ```

**Migration**: Add index on `sessions.device_info->>'deviceId'` (non-blocking `CREATE INDEX CONCURRENTLY`).

**Backward compatibility**: Fully backward-compatible. Existing sessions without `deviceId` in `device_info` are unaffected (they won't match the deletion query).

**Rollback**: Revert the commit. Dangling sessions resume their natural 8h expiry.

---

### C03 — In-Memory Rate Limiter Reset on Restart (CRITICAL)

**Current behavior**: The rate limiter in `apps/worker/middleware/rate-limit.ts:15-26` uses an in-memory `Map<string, RateLimitEntry>` with a `setInterval` cleanup. Server restart clears all rate limit state. Attackers can bypass rate limits by waiting for or triggering a restart.

- **File**: `apps/worker/middleware/rate-limit.ts:15` — `const store = new Map<string, RateLimitEntry>()`
- Note: The `SettingsService` already has a PostgreSQL-backed `checkRateLimit()` method at `apps/worker/services/settings.ts:485-520` using a `rate_limits` table. The middleware rate limiter is a separate, duplicative implementation.

**Target behavior**: Replace the in-memory `Map` with the existing PostgreSQL-backed `rate_limits` table. The middleware should:
1. Accept the Hono context to access `services.settings.checkRateLimit()`
2. Use `INSERT ... ON CONFLICT DO UPDATE` for atomic increment (already implemented in `SettingsService`)
3. Periodic cleanup of expired windows (already implemented via `clearRateLimits()`)

Alternatively, create a dedicated `rate_limits` table optimized for the middleware use case:

```sql
CREATE TABLE api_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX api_rate_limits_window_idx ON api_rate_limits (window_start);
```

Using fixed-window counters instead of timestamp arrays for better performance at scale:
```sql
INSERT INTO api_rate_limits (key, count, window_start)
VALUES ($1, 1, NOW())
ON CONFLICT (key) DO UPDATE
SET count = CASE
  WHEN api_rate_limits.window_start < NOW() - INTERVAL '1 minute'
  THEN 1
  ELSE api_rate_limits.count + 1
END,
window_start = CASE
  WHEN api_rate_limits.window_start < NOW() - INTERVAL '1 minute'
  THEN NOW()
  ELSE api_rate_limits.window_start
END
RETURNING count, window_start;
```

**Files to change**:
- `apps/worker/middleware/rate-limit.ts` — Rewrite to use PostgreSQL. Accept service context from Hono `c.get('services')`. Remove in-memory `Map` and `setInterval`.
- `apps/worker/db/schema/settings.ts` — Add `api_rate_limits` table if not reusing existing `rate_limits` table (check if `rate_limits` schema is suitable)
- `apps/worker/db/schema/index.ts` — Export new table if created
- Drizzle migration — Add new table or modify existing one

**Migration**: New `api_rate_limits` table (or verify existing `rate_limits` table is adequate).

**Backward compatibility**: Fully backward-compatible. Rate limit behavior improves (persists across restarts).

**Rollback**: Revert to in-memory implementation. No data loss — rate limit table can be dropped.

---

### H06 — Session Sliding Expiry with No Absolute Max Lifetime (HIGH)

**Current behavior**: Sessions are created with 8-hour expiry (`SESSION_DURATION_MS`). The sliding window at `apps/worker/services/identity.ts:606-614` renews the session to `now + 8h` whenever less than 1 hour remains. There is no absolute maximum lifetime — a session can be renewed indefinitely.

- **File**: `apps/worker/services/identity.ts:591-618` (`validateSession()`)
- **File**: `apps/worker/lib/session-renewal.ts` — Pure function `decideSessionRenewal()` with no max lifetime check
- **File**: `apps/worker/db/schema/users.ts:67-87` — `sessions` table has `createdAt` but no `maxLifetime` enforcement

**Target behavior**: Enforce an absolute maximum session lifetime of 7 days. After 7 days from `createdAt`, the session cannot be renewed regardless of sliding window state. The user must re-authenticate.

**Files to change**:
- `apps/worker/lib/session-renewal.ts`:
  - Add `MAX_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000` (7 days)
  - Update `decideSessionRenewal()` to accept `createdAt` and check absolute expiry
  - Add `'max_lifetime_exceeded'` to `RenewalDecision` union
- `apps/worker/services/identity.ts`:
  - In `validateSession()` (line 591): fetch `createdAt` from DB row, pass to renewal decision
  - If max lifetime exceeded: delete session, throw 401 with `code: 'SESSION_MAX_LIFETIME'`
  - In `createSession()`: ensure `createdAt` is always set (already is)

**Migration**: None — `sessions.createdAt` already exists in the schema.

**Backward compatibility**: Sessions older than 7 days will be forcibly expired on next validation. This is a security improvement, not a regression, but users with long-lived sessions will need to re-authenticate.

**Rollback**: Revert the commit. Sessions resume indefinite renewal.

---

### H08 — WebAuthn Challenge Consumed Before Expiry Check (HIGH)

**Current behavior**: `getWebAuthnChallenge()` at `apps/worker/services/identity.ts:744-765` first retrieves the challenge, then deletes it (line 754-756), and only THEN checks if it's expired (line 760). If the challenge is expired, the function throws 410 — but the challenge has already been consumed. A legitimate user who submits just after expiry loses their challenge and must restart the WebAuthn flow.

- **File**: `apps/worker/services/identity.ts:744-765`

**Target behavior**: Atomic consume-if-valid: use a single SQL query that deletes the challenge only if it's not expired.

```sql
DELETE FROM webauthn_challenges
WHERE challenge_id = $1
  AND created_at > NOW() - INTERVAL '5 minutes'
RETURNING challenge;
```

If no rows returned: check if the challenge exists at all (for correct error code):
- Not found → 404
- Found but expired → 410 (and delete the stale row)

**Files to change**:
- `apps/worker/services/identity.ts`:
  - Replace `getWebAuthnChallenge()` implementation (lines 744-765) with atomic delete-if-valid query
  - Use Drizzle's `and(eq(...), gt(createdAt, cutoff))` in the delete WHERE clause

**Migration**: None.

**Backward compatibility**: Fully backward-compatible. Same API contract, better atomicity.

**Rollback**: Revert the commit.

---

### H03 — Rate Limiting Coverage (HIGH)

**Current behavior**: Only 6 of ~56 route files use rate limiting middleware:
- `apps/worker/routes/sessions.ts`
- `apps/worker/routes/admin/devices.ts`
- `apps/worker/routes/webauthn.ts`
- `apps/worker/routes/telephony.ts` (via webhook signature validation, not the middleware)
- `apps/worker/routes/security-events.ts`
- `apps/worker/routes/devices.ts`

Unprotected sensitive endpoints include:
- `apps/worker/routes/auth.ts` — Authentication/login
- `apps/worker/routes/invites.ts` — Invite code redemption
- `apps/worker/routes/provisioning.ts` — Device provisioning
- `apps/worker/routes/webauthn.ts` — Partial coverage
- All 50+ authenticated route files — No default rate limiting

**Target behavior**: Apply rate limiting as a default middleware on all routes, with per-route tier overrides:

| Tier | Limit | Routes |
|------|-------|--------|
| `strict` | 5 req/min | `/auth/*`, `/invites/redeem`, `/provision/*`, `/webauthn/*`, `/recovery-group/*` |
| `standard` | 60 req/min | All authenticated routes (default) |
| `elevated` | 120 req/min | `/calls/*`, `/conversations/*`, `/ws/*` (high-frequency operational routes) |
| `webhook` | 300 req/min | `/telephony/*`, `/messaging/*` (provider webhooks) |
| `unlimited` | No limit | `/health/*`, `/metrics/*`, `/config/*` |

**Files to change**:
- `apps/worker/middleware/rate-limit.ts` — Add tier presets and a default middleware factory
- `apps/worker/app.ts` — Apply default `standard` rate limit on the `authenticated` Hono instance. Apply `strict` on public auth routes. Apply `unlimited` exception on health/metrics.
- Individual route files — Add per-route overrides where needed (e.g., `strict` on auth endpoints)

**Migration**: None (depends on C03 for persistent rate limiting).

**Backward compatibility**: New rate limits may affect existing integrations making >60 req/min. Document the limits.

**Rollback**: Remove the default middleware. Per-route limits revert to none.

---

### H04 — Dev Routes Accessible to Any Auth User (HIGH)

**Current behavior**: Dev routes at `apps/worker/routes/dev.ts` are mounted at `api.route('/', devRoutes)` on the PUBLIC (unauthenticated) Hono instance (`apps/worker/app.ts:117`). The `checkResetSecret()` function at `dev.ts:27-36` requires `DEV_RESET_SECRET` or `E2E_TEST_SECRET` header match, BUT it also accepts any `Authorization: Bearer *` header as valid (line 34). This means:
1. Routes are mounted unconditionally regardless of environment
2. Any authenticated user can access dev routes if `ENVIRONMENT=development`
3. The `Bearer` auth bypass in `checkResetSecret` is overly permissive

- **File**: `apps/worker/routes/dev.ts:27-36` — `checkResetSecret()` accepts any Bearer token
- **File**: `apps/worker/app.ts:117` — `api.route('/', devRoutes)` — unconditional mount

**Target behavior**:
1. Conditionally import/mount dev routes only when `ENVIRONMENT=development` AND `DEV_ROUTES_ENABLED=true`
2. Remove the generic `Bearer` auth bypass from `checkResetSecret()` — require exact secret match only
3. In production/staging, the route handlers should not be in the module graph at all

**Files to change**:
- `apps/worker/app.ts`:
  - Change `api.route('/', devRoutes)` to conditional: `if (env.ENVIRONMENT === 'development' && env.DEV_ROUTES_ENABLED === 'true') { api.route('/', devRoutes) }`
  - This requires restructuring the route setup slightly (move into a function that receives env)
- `apps/worker/routes/dev.ts`:
  - Remove lines 33-34 (`if (authHeader?.startsWith('Bearer ')) return true`) from `checkResetSecret()`
  - Require exact `X-Test-Secret` header match only
- `apps/worker/types.ts` — Add `DEV_ROUTES_ENABLED?: string` to `Env` type

**Migration**: None.

**Backward compatibility**: Breaking for dev tooling that relies on Bearer-token access to dev routes. BDD test helpers must use `X-Test-Secret` header explicitly.

**Rollback**: Revert the commit.

---

### H05 — Telephony Webhook Signature Bypass for Localhost (HIGH)

**Current behavior**: The telephony webhook middleware at `apps/worker/routes/telephony.ts:52-54` skips signature verification for requests where `CF-Connecting-IP` is `127.0.0.1` in development mode. This allows any local process to forge telephony webhooks without valid signatures.

```typescript
const isDev = env.ENVIRONMENT === 'development'
const isLocal = isDev && c.req.header('CF-Connecting-IP') === '127.0.0.1'
if (!isLocal) { /* validate signature */ }
```

- **File**: `apps/worker/routes/telephony.ts:52-54`

**Target behavior**: Always verify webhook signatures, even in development. Use test provider credentials that produce valid signatures. The comment references "Epic 258 C7" suggesting this was a deliberate choice, but it creates a vulnerability where any local process (or a process that can set `CF-Connecting-IP` header) can forge webhooks.

**Files to change**:
- `apps/worker/routes/telephony.ts`:
  - Remove lines 52-54 (the `isDev`/`isLocal` bypass)
  - Always call `adapter.validateWebhook(c.req.raw)`
- Documentation — Update telephony dev setup docs to explain how to configure test credentials that produce valid webhook signatures

**Migration**: None.

**Backward compatibility**: Breaking for local telephony development without valid provider credentials. Developers must configure test credentials (Twilio test credentials, ngrok tunnels, etc.).

**Rollback**: Revert the commit.

---

## Database Migration Plan

### New/Modified Tables

1. **`api_rate_limits`** (C03) — New table for persistent rate limiting:
   ```sql
   CREATE TABLE api_rate_limits (
     key TEXT PRIMARY KEY,
     count INTEGER NOT NULL DEFAULT 1,
     window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX api_rate_limits_window_idx ON api_rate_limits (window_start);
   ```

2. **`sessions`** (C02) — Add functional index for device-based session lookup:
   ```sql
   CREATE INDEX CONCURRENTLY sessions_device_id_idx
     ON sessions ((device_info->>'deviceId'))
     WHERE device_info IS NOT NULL;
   ```

3. **No schema changes needed for H06** — `sessions.created_at` already exists.

### Migration Order
1. `api_rate_limits` table (C03) — standalone, no dependencies
2. `sessions_device_id_idx` index (C02) — `CONCURRENTLY` for zero downtime

### Migration File
Create: `apps/worker/db/migrations/XXXX_epic_a_auth_security.sql`

---

## Dependency Ordering

```
C03 (persistent rate limiter) ─────────┐
                                        ├──► H03 (rate limit coverage expansion)
C01 (dev auth bypass)                   │
C02 (session cleanup on revoke)         │
H06 (session max lifetime) ─────────────┘  (independent but same session domain)
H08 (WebAuthn challenge atomicity)         (fully independent)
H04 (dev routes gating)                   (fully independent)
H05 (webhook signature bypass)            (fully independent)
```

**Critical path**: C03 must land before H03 (rate limit coverage depends on persistent rate limiter).

**Recommended implementation order**:
1. **Phase 1 — Foundation** (can be parallelized):
   - C01: Dev-mode auth bypass removal
   - C02: Session cleanup on device revocation
   - C03: Persistent rate limiter
   - H08: WebAuthn challenge atomicity
2. **Phase 2 — Session hardening** (depends on C02 being in place for full session security):
   - H06: Session max lifetime
3. **Phase 3 — Coverage expansion** (depends on C03):
   - H03: Rate limit coverage for all routes
4. **Phase 4 — Dev hardening** (can be parallelized with Phase 2-3):
   - H04: Dev routes gating
   - H05: Webhook signature bypass removal

---

## BDD Test Scenarios

### C01 — Dev Auth Bypass

```gherkin
Feature: Auth bypass removal
  Background:
    Given the environment is "development"
    And a registered user with pubkey "abc123..."

  Scenario: Invalid signature rejected in development mode
    When I send a request with a valid pubkey but invalid signature
    Then the response status should be 401

  Scenario: Valid signature accepted in development mode
    When I send a request with a valid pubkey and valid Ed25519 signature
    Then the response status should be 200

  Scenario: DEV_AUTH_BYPASS flag enables bypass when set
    Given DEV_AUTH_BYPASS is "true"
    When I send a request with a valid pubkey but invalid signature
    Then the response status should be 200
    And the log should contain "DEV_AUTH_BYPASS" at WARN level

  Scenario: DEV_AUTH_BYPASS flag has no effect when unset
    Given DEV_AUTH_BYPASS is not set
    When I send a request with a valid pubkey but invalid signature
    Then the response status should be 401
```

### C02 — Session Cleanup on Device Revocation

```gherkin
Feature: Device revocation session cleanup
  Background:
    Given a registered user with an active device "device-1"
    And the user has an active session linked to "device-1"

  Scenario: Revoking a device terminates its sessions
    When the user revokes device "device-1"
    Then all sessions for "device-1" should be deleted
    And the session token should no longer authenticate

  Scenario: Revoking a device does not affect other device sessions
    Given the user has another device "device-2" with an active session
    When the user revokes device "device-1"
    Then sessions for "device-2" should remain valid

  Scenario: Session deletion is atomic with device deletion
    When the user revokes device "device-1"
    And the transaction succeeds
    Then the device record should not exist
    And no sessions for that device should exist
```

### C03 — Persistent Rate Limiting

```gherkin
Feature: Persistent rate limiting
  Scenario: Rate limit state persists across server restart
    Given a user has made 4 of 5 allowed requests
    When the server restarts
    And the user makes another request
    Then the response status should be 429

  Scenario: Rate limit window expires correctly
    Given a user has been rate limited
    When 60 seconds have passed
    Then the next request should succeed with status 200

  Scenario: Concurrent requests are counted atomically
    When 10 requests arrive simultaneously for the same key
    Then the total count should be exactly 10
```

### H06 — Session Max Lifetime

```gherkin
Feature: Session absolute lifetime
  Scenario: Session within max lifetime is renewed normally
    Given a session created 6 days ago
    When the session is validated
    Then the session should be renewed (sliding window)

  Scenario: Session exceeding max lifetime is rejected
    Given a session created 8 days ago
    When the session is validated
    Then the response status should be 401
    And the error code should be "SESSION_MAX_LIFETIME"

  Scenario: Session at exactly 7 days is rejected
    Given a session created exactly 7 days ago
    When the session is validated
    Then the response status should be 401
```

### H08 — WebAuthn Challenge Atomicity

```gherkin
Feature: WebAuthn challenge consume-if-valid
  Scenario: Valid challenge is consumed and returned
    Given a WebAuthn challenge created 2 minutes ago
    When I retrieve the challenge
    Then the challenge value is returned
    And the challenge is deleted from the database

  Scenario: Expired challenge is not consumed
    Given a WebAuthn challenge created 6 minutes ago
    When I retrieve the challenge
    Then the response status should be 410
    And the expired challenge is cleaned up

  Scenario: Missing challenge returns 404
    When I retrieve a non-existent challenge
    Then the response status should be 404
```

### H03 — Rate Limit Coverage

```gherkin
Feature: Default rate limiting on all routes
  Scenario: Auth endpoint has strict rate limit
    When I make 6 authentication requests within 1 minute
    Then the 6th request should return 429
    And the Retry-After header should be present

  Scenario: Standard API endpoint has default rate limit
    Given I am authenticated
    When I make 61 requests to /api/users within 1 minute
    Then the 61st request should return 429

  Scenario: Health endpoint is not rate limited
    When I make 500 requests to /api/health/ready
    Then all responses should be 200
```

### H04 — Dev Routes Gating

```gherkin
Feature: Dev routes access control
  Scenario: Dev routes unavailable when DEV_ROUTES_ENABLED is unset
    Given ENVIRONMENT is "development"
    And DEV_ROUTES_ENABLED is not set
    When I POST to /api/test-reset with valid X-Test-Secret
    Then the response status should be 404

  Scenario: Dev routes unavailable in production
    Given ENVIRONMENT is "production"
    And DEV_ROUTES_ENABLED is "true"
    When I POST to /api/test-reset
    Then the response status should be 404

  Scenario: Bearer token alone does not grant dev access
    Given ENVIRONMENT is "development"
    And DEV_ROUTES_ENABLED is "true"
    When I POST to /api/test-reset with only Authorization: Bearer <token>
    Then the response status should be 404

  Scenario: X-Test-Secret grants access when DEV_ROUTES_ENABLED
    Given ENVIRONMENT is "development"
    And DEV_ROUTES_ENABLED is "true"
    When I POST to /api/test-reset with valid X-Test-Secret
    Then the response status should be 200
```

### H05 — Webhook Signature Enforcement

```gherkin
Feature: Telephony webhook signature always verified
  Scenario: Localhost request without valid signature is rejected
    Given ENVIRONMENT is "development"
    When I POST to /api/telephony/incoming from 127.0.0.1 without a valid signature
    Then the response status should be 403

  Scenario: Request with valid signature is accepted
    When I POST to /api/telephony/incoming with a valid provider signature
    Then the response status should be 200
```

---

## Security Impact Summary

| Finding | Severity | Attack Vector | Impact if Unpatched |
|---------|----------|---------------|---------------------|
| C01 | Critical | Any registered pubkey authenticates without valid signature in dev | Full auth bypass in any env running as `development` |
| C02 | Critical | Revoked device sessions remain active for 8h+ | Compromised device retains access after revocation |
| C03 | Critical | Server restart clears all rate limit state | Brute-force attacks reset on restart |
| H06 | High | Sessions renewed indefinitely | Stolen session tokens never expire |
| H08 | High | Race condition wastes valid WebAuthn challenges | DoS on WebAuthn registration flow |
| H03 | High | 50+ route files have no rate limiting | Brute-force and abuse on unprotected endpoints |
| H04 | High | Any Bearer token grants dev route access | Test reset/seed endpoints accessible to all auth users |
| H05 | High | Localhost bypass on webhook signature verification | Forged telephony webhooks in development |

---

## Out of Scope

- Client-side changes (desktop, iOS, Android)
- New crypto operations
- Wire protocol changes
- Frontend session management UI
