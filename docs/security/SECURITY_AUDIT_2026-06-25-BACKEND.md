# Backend Security Audit — Wave 3 (2026-06-25)

**Scope:** `apps/worker/` — Bun/Hono backend server
**Branch:** `audit-backend-w3` from `d076a731` (main)
**Prior audits:** Wave 1 (2026-05-18), Wave 2 (2026-06-09)
**Threat model:** E2EE, zero-knowledge server, zero-trust. Adversaries include nation-states, right-wing groups, and private hacking firms.
**Classification:** CONFIDENTIAL — Restricted to security team
**Auditor:** Automated deep-read audit (Claude Opus 4.6)

---

## Executive Summary

This wave 3 audit re-examines the backend codebase as of commit `d076a731` on `main`. **The wave 2 security fix PRs have NOT been merged to main** — all wave 2 critical and high findings remain present in production code. This audit verifies the persistence of those findings and identifies additional issues.

The backend has strong fundamentals: Zod validation on nearly all production routes, parameterized SQL via Drizzle ORM, well-designed CORS, comprehensive WebSocket challenge-response auth with membership revalidation, and defense-in-depth security headers. However, several architectural gaps persist.

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 1 | Persists from wave 2 |
| HIGH | 6 | 5 persist from wave 2, 1 new |
| MEDIUM | 14 | 8 persist from wave 2, 6 new |
| LOW | 11 | 6 persist from wave 2, 5 new |
| **Total** | **32** | |

### Top Priority Actions

1. **Merge the wave 2 security fix PRs.** Fixes for C1, H1-H6, and several MEDIUM/LOW findings exist in unmerged branches. These represent completed work that is not protecting the codebase.
2. **Sigchain hash recomputation** (C1) — the most critical cryptographic integrity gap.
3. **MLS device ownership verification** (H1) — enables message interception.
4. **Outbound message encryption before storage** (H4) — violates zero-knowledge property.

---

## CRITICAL

### C1: Sigchain hash not recomputed server-side — payload not bound to hash (PERSISTS from wave 2)
**File:** `apps/worker/services/crypto-keys.ts:93-168`

The server verifies `seqNo` continuity, `prevHash` chain linkage, and Ed25519 signature over `link.hash` — but **never recomputes the hash from link content** (linkType, seqNo, payload, prevHash). A malicious client could submit a link with arbitrary payload but a correctly-signed hash that doesn't actually commit to that payload.

The signature is verified over `link.hash` (line 129-132), but `link.hash` is client-supplied and accepted without recomputation. The hash chain's tamper-detection property is defeated.

**Impact:** Third-party auditors cannot trust that sigchain payloads match their hashes. An attacker controlling a user's signing key could sign a hash over different content than what's stored, undermining the entire sigchain integrity model.

**Fix:** Define a canonical hash computation over `(prevHash || linkType || seqNo || canonicalize(payload))` and verify `link.hash` matches before accepting.

---

## HIGH

### H1: MLS routes lack device ownership verification — 4 endpoints (PERSISTS from wave 2)
**File:** `apps/worker/routes/mls.ts:66-212`

None of the MLS routes verify that the `deviceId` parameter belongs to the authenticated user:

- `GET /mls/messages?deviceId=X` (line 160-171) — any hub member can fetch-and-delete another device's pending MLS messages
- `POST /mls/key-packages?deviceId=X` (line 178-209) — upload malicious key packages under another device's ID
- `POST /mls/commit` (line 66-96) — `recipientDeviceIds` are not validated as belonging to hub members
- `POST /mls/welcome` (line 103-131) — `recipientDeviceId` is not validated

**Impact:** Message denial-of-service (drain another device's queue), impersonation via malicious key packages, MLS group key establishment compromise.

**Fix:** Verify `deviceId` belongs to the authenticated user via the `devices` table. Validate recipient device IDs are active hub members.

### H2: Account lockdown completion lacks `requireFreshAuth` (PERSISTS from wave 2)
**File:** `apps/worker/routes/account.ts:45-46`

`POST /api/account/lockdown` correctly requires `requireFreshAuth`, but `POST /api/account/lockdown/complete` does not. A stolen session token could falsely report lockdown completion, causing the client to believe key rotation succeeded when it hasn't.

**Fix:** Add `requireFreshAuth` to `/lockdown/complete`.

### H3: Plaintext stored as `encryptedContent` for external messaging channels (PERSISTS from wave 2)
**File:** `apps/worker/routes/conversations.ts:316`

```typescript
const encryptedContent = body.encryptedContent ?? plaintextForSending ?? ''
```

When sending outbound messages to SMS/WhatsApp/Signal without client-side pre-encryption, the **plaintext message body** is stored in the `encryptedContent` database field (persisted at line 432). This violates the zero-knowledge server property.

**Impact:** All outbound messages to external channels without pre-encryption are server-readable plaintext at rest.

**Fix:** Call `encryptMessageForStorage()` before persisting. Discard plaintext after sending via the messaging adapter.

### H4: Webhook replay protection not wired in (PERSISTS from wave 2)
**Files:** `apps/worker/middleware/webhook-auth.ts`, `apps/worker/routes/telephony.ts`, `apps/worker/messaging/router.ts`

The `webhookAuth` middleware (content-type enforcement + IP allowlisting + replay protection via `checkWebhookReplay`) is **defined but never imported or used anywhere**. The PostgreSQL-backed webhook nonce tracking service (`apps/worker/services/webhook-replay.ts`) exists but is unreachable.

**Impact:** Captured signed webhook payloads can be replayed indefinitely — duplicate call records, duplicate message processing, double audit entries.

**Fix:** Apply `webhookAuth` to all webhook ingress routes (telephony, messaging).

### H5: Ban list stores plaintext phone numbers in `phone_display` column (PERSISTS from wave 1)
**Files:** `apps/worker/db/schema/records.ts:87`, `apps/worker/services/records.ts:260-261`

The `bans` table has a `phone` column (hash) and a `phone_display` column (plaintext E.164). Ban records store the original phone number in cleartext, contradicting the zero-knowledge server claim.

**Impact:** Database breach exposes banned callers' phone numbers.

**Fix:** Encrypt `phone_display` with the hub key, or remove it and derive display from the hash lookup at query time.

### H6: Firehose connection read lacks hub-scoping — cross-hub data access (NEW)
**File:** `apps/worker/routes/firehose.ts:169-179`

`GET /:id` with `firehose:read` permission retrieves any firehose connection by UUID without verifying it belongs to the caller's hub. The same issue affects `GET /:id/buffer` (line 360-371), `POST /:id/optout` (line 408-418), and `DELETE /:id/optout` (line 434-442).

While the list endpoints (lines 60, 91) correctly scope by `hubId`, individual record access bypasses hub scoping entirely.

**Impact:** A user with `firehose:read` in hub A can read firehose connection details and buffer contents from hub B.

**Fix:** After fetching the connection, verify `row.hubId` matches the caller's hub context.

---

## MEDIUM

### M1: Rate limiter fails open on database error (PERSISTS from wave 2)
**File:** `apps/worker/middleware/rate-limit.ts:76-79`

When the PostgreSQL rate limit check throws (DB outage), requests are allowed through. A database outage disables all rate limiting.

**Fix:** Add in-memory fallback rate limiter for `strict` tier (auth endpoints), or fail closed for auth-related rate limits.

### M2: Rate limiting disabled entirely in development mode (PERSISTS from wave 2)
**File:** `apps/worker/middleware/rate-limit.ts:47-49`

All rate limiting skipped when `ENVIRONMENT=development`. A misconfigured staging environment with `ENVIRONMENT=development` gets zero rate protection.

**Fix:** Use a dedicated `DISABLE_RATE_LIMITS=true` flag instead of the environment name. Or at minimum, log a startup warning when rate limiting is disabled.

### M3: IP-based rate limiting spoofable without reverse proxy (PERSISTS from wave 2)
**File:** `apps/worker/middleware/rate-limit.ts:23-27`

`extractIp` trusts `CF-Connecting-IP` and `X-Forwarded-For` headers directly. Without Cloudflare Tunnels or a trusted reverse proxy, any client can set these headers to bypass IP-based rate limits.

**Fix:** Validate that forwarded headers come from trusted upstreams (e.g., Cloudflare IP ranges), or use the connection remote address as fallback.

### M4: Public endpoints without rate limiting (PERSISTS from wave 2)
**File:** `apps/worker/app.ts:163-204`

Unprotected public endpoints:
- `GET/PATCH /messaging/preferences` (lines 163-183) — token-validated but no rate limit, brute-forceable
- `GET /ivr-audio/:promptType/:language` (line 186) — no rate limit, bandwidth exhaustion vector

**Fix:** Apply `strict` or `webhook` rate limit tier.

### M5: No per-connection WebSocket message rate limiting (PERSISTS from wave 2)
**File:** `apps/worker/routes/ws.ts:85-161`

Replay has a per-hub rate limit, but incoming client messages (subscribe/unsubscribe/ping) have no messages-per-second throttle. A single authenticated client can flood the server with rapid subscribe/unsubscribe cycles.

**Fix:** Add per-connection message rate limit (e.g., 60 msg/min).

### M6: `PATCH /messaging/preferences` accepts unvalidated JSON body (NEW)
**File:** `apps/worker/app.ts:171-183`

```typescript
body = await c.req.json()
// ...
const result = await services.blasts.updatePreferences(token, body as { language?: string; status?: ... })
```

Uses raw `c.req.json()` with an `as` cast instead of Zod validation. Any JSON shape is accepted and passed to the service layer. This is the only non-dev production endpoint without Zod validation.

**Fix:** Add a Zod schema for the preferences update body with explicit field validation.

### M7: Signal notification digest inline permission check — wildcard bypass (PERSISTS from wave 2)
**File:** `apps/worker/routes/signal-notification.ts:281-293`

`POST /digest/run` checks `permissions.includes('system:admin')` directly instead of `requirePermission()`. A super-admin with wildcard `*` permission (but not the literal string `system:admin`) would be denied.

**Fix:** Replace with `requirePermission('system:admin')` middleware.

### M8: Health check leaks error messages to unauthenticated callers (PERSISTS from wave 2)
**File:** `apps/worker/routes/health.ts`

`err.message` returned in `detail` field for failing health checks. Could leak internal hostnames, connection strings, database errors.

**Fix:** Return generic `'Connection check failed'`. Log actual error server-side only.

### M9: No WebSocket connection limit per user (NEW)
**File:** `apps/worker/routes/ws.ts`, `apps/worker/lib/ws-manager.ts`

No cap on simultaneous WebSocket connections per pubkey. An attacker with valid credentials can open thousands of connections, causing memory exhaustion on the server.

**Fix:** Cap at ~10 connections per pubkey in the connection manager.

### M10: Webhook URL falls back to request URL without `WEBHOOK_BASE_URL` (PERSISTS from wave 2)
**File:** `apps/worker/lib/webhook-url.ts:18-21`

If `WEBHOOK_BASE_URL` is unconfigured in production, webhook signature validation may use the spoofable `Host` header.

**Fix:** Fail-hard at startup if `WEBHOOK_BASE_URL` is empty in non-development environments.

### M11: ADMIN_PUBKEY auto-restoration cannot be disabled during incidents (NEW)
**File:** `apps/worker/middleware/auth.ts:72-86`

The ADMIN_PUBKEY user's `role-super-admin` is automatically restored on every authenticated request. During an incident where the admin account is compromised, there is no way to revoke admin access — the middleware will re-grant it immediately.

**Impact:** Cannot contain a compromised admin account without redeploying with a different ADMIN_PUBKEY.

**Fix:** Add kill switch env var (`ADMIN_PUBKEY_AUTO_RESTORE=false`) for incident containment.

### M12: WebAuthn registration challenge not bound to authenticated user during verification (NEW)
**Files:** `apps/worker/routes/webauthn.ts:141,173`, `apps/worker/services/identity.ts:828`

The `storeWebAuthnChallenge` correctly accepts a `pubkey` parameter and stores it with the challenge. However, `getWebAuthnChallenge()` only checks `challengeId` — it never validates that the consuming user matches the `pubkey` stored with the challenge. An attacker who intercepts a challenge ID could register their own authenticator under a victim's account if they can satisfy the origin/rpID checks.

**Fix:** Add a `pubkey` parameter to `getWebAuthnChallenge()` and include `eq(webauthnChallenges.pubkey, pubkey)` in the WHERE clause for registration flows.

### M13: Session token compared with `===` instead of constant-time comparison (NEW)
**File:** `apps/worker/routes/sessions.ts:49`

`isCurrent: s.token === currentToken` uses JavaScript string equality, which is susceptible to timing side-channels. The codebase already uses `timingSafeEqual` for webhook secrets (Telegram, Signal) but not here.

**Fix:** Use `crypto.timingSafeEqual` for the `isCurrent` comparison, or compare by session `id` instead of the secret token value.

### M14: OpenAPI spec and Scalar docs publicly accessible (PERSISTS from wave 2)
**File:** `apps/worker/app.ts:299-300`

`/api/openapi.json` and `/api/docs` are unauthenticated, revealing every endpoint, schema, and parameter definition to potential attackers.

**Fix:** Gate behind auth or restrict to development mode in production deployments.

---

## LOW

### L1: DEV_AUTH_BYPASS — no startup rejection in production (PERSISTS from wave 2)
**File:** `apps/worker/middleware/auth.ts:35-47`

Dual-condition guard (`ENVIRONMENT=development && DEV_AUTH_BYPASS=true`) skips Ed25519 signature verification. No startup assertion prevents `DEV_AUTH_BYPASS=true` from being set in production — only the runtime check protects.

**Fix:** Reject `DEV_AUTH_BYPASS=true` at startup when `ENVIRONMENT=production`. Emit a security event.

### L2: Events routes past sunset date with no enforcement (PERSISTS from wave 2)
**File:** `apps/worker/routes/events.ts:31-37`

`Sunset: 2026-07-01` header set but no enforcement. The date is less than a week away (today is 2026-06-25) and there is still no 410 Gone response after the sunset date.

**Fix:** Add date check: if `Date.now() > new Date(SUNSET_DATE)`, return 410 Gone with `Link` header pointing to successor endpoint.

### L3: Dev route handlers use `c.req.json()` without Zod validation (PERSISTS from wave 2)
**File:** `apps/worker/routes/dev.ts`

Most dev/simulation endpoints use `await c.req.json()` with `as` casts. Triple-gated (environment + secret + guard) but inconsistent with production patterns and could mask issues during E2E testing.

**Fix:** Use Zod validation even for dev-only endpoints.

### L4: Webhook IP allowlist only supports IPv4 (PERSISTS from wave 2)
**File:** `apps/worker/middleware/webhook-ip-allowlist.ts`

`ipToNum` only handles IPv4 dotted-quad notation. IPv6 addresses would fail CIDR matching silently.

**Fix:** Add IPv6 support or explicitly reject IPv6 before matching.

### L5: Auth login rate limit uses inconsistent IP extraction (PERSISTS from wave 2)
**File:** `apps/worker/routes/auth.ts`

Auth routes use the global `rateLimit('strict')` middleware (applied in `app.ts:133`), which uses `extractIp`. However, any inline IP extraction in auth routes may use only `CF-Connecting-IP` without the `X-Forwarded-For` fallback, creating inconsistency.

**Fix:** Ensure all rate-limiting uses the same `extractIp` helper.

### L6: No SSL enforcement in database connection config (PERSISTS from wave 2)
**File:** `apps/worker/db/index.ts`

No explicit SSL configuration. Relies on `DATABASE_URL` containing `?sslmode=require`. If the URL is misconfigured, connections may fall back to unencrypted.

**Fix:** Enforce SSL in the Drizzle connection config for production environments.

### L7: Conversation message `externalId` accepted from client (NEW)
**File:** `apps/worker/routes/conversations.ts:420-424`

```typescript
if (!externalId && body.externalId) {
  externalId = body.externalId
}
```

Client-provided `externalId` is accepted as a fallback. While intended for simulation/test flows, a malicious client could inject arbitrary external IDs to spoof message delivery confirmation.

**Fix:** Only accept `externalId` from client in development mode, or remove the fallback entirely.

### L8: Error messages in outbound messaging failures exposed to client (NEW)
**File:** `apps/worker/routes/conversations.ts:399-401`

```typescript
status = 'failed'
failureReason = result.error
```

The raw `result.error` from messaging adapters (which may contain provider API details, internal URLs, or configuration info) is stored in `failureReason` and may be returned to the client.

**Fix:** Sanitize `failureReason` before storage — replace with generic categories like `'delivery_failed'`, `'provider_error'`, etc. Log the full error server-side.

### L9: Firehose opt-out uses `firehose:read` instead of a dedicated permission (NEW)
**Files:** `apps/worker/routes/firehose.ts:408-409, 434-435`

`POST /:id/optout` and `DELETE /:id/optout` both require `firehose:read`. These are write operations (opting out of data collection) that should use a more appropriate permission, or at minimum `firehose:manage`.

**Fix:** Use a dedicated `firehose:optout` permission or `firehose:manage` for write operations.

### L10: Missing `X-Frame-Options`, `Strict-Transport-Security`, and `Cache-Control` headers (NEW)
**File:** `apps/worker/app.ts:113-118`

Security headers include `X-Content-Type-Options` and `Referrer-Policy` but omit `X-Frame-Options: DENY`, `Strict-Transport-Security`, and `Cache-Control: no-store`. While this is an API (not serving HTML), defense-in-depth best practice is to include these. Missing `Cache-Control` could allow sensitive API responses to be cached by intermediaries.

**Fix:** Add `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and `Cache-Control: no-store`.

### L11: Bridge-unavailable messages silently marked as `sent` (NEW)
**File:** `apps/worker/routes/conversations.ts:388-397`

When the messaging bridge is unreachable (ECONNREFUSED, ETIMEDOUT, etc.), the message is stored with `status: 'sent'` rather than a retry or failure state. The user sees a successful send, but the message was never delivered.

**Fix:** Use a `'queued'` or `'pending_retry'` status for bridge-unavailable scenarios. Implement a background retry queue.

---

## Positive Security Patterns

The following security patterns are well-implemented and represent strong baseline security:

1. **Zod validation on all production routes** — input validation is comprehensive across nearly every endpoint (only `PATCH /messaging/preferences` is missing)
2. **Parameterized SQL via Drizzle ORM** — no raw SQL injection vectors found
3. **CORS hardening** — wildcard rejection, credentials-aware, preflight rejection for disallowed origins
4. **WebSocket challenge-response auth** — Ed25519 signature verification with nonce, timestamp freshness, and periodic membership revalidation
5. **Security headers** — `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`
6. **Global error handler** — never exposes stack traces or internals to clients (`app.ts:79-86`)
7. **Dev endpoint protection** — triple-gated with environment check, DEV_ROUTES_ENABLED, and X-Test-Secret header
8. **Request ID correlation** — every request gets a unique ID for audit trail
9. **WebAuthn enforcement** — configurable passkey requirements for admins and users
10. **Rate limiting architecture** — PostgreSQL-backed, per-tier, with Retry-After headers
11. **Provisioning brute-force protection** — per-room guess limits prevent token enumeration
12. **IVR path parameter validation** — regex allowlist on `promptType` and `language` (line 191)

---

## Wave 2 Fix Status

The following wave 2 security fix PRs exist in unmerged branches:

| Fix | Branch/Commit | Status |
|-----|---------------|--------|
| C1: Sigchain hash recomputation | `e59ab7657` | NOT on main |
| H1: MLS device ownership | `10e9dff37` | NOT on main |
| H3: Encrypt outbound messages | `31f92f71a` | NOT on main |
| H5/H6: Wire webhook auth | `70856a905` | NOT on main |
| H2, M6, M9, M10, L3: P2 batch | `c33f089ad` | NOT on main |
| Rate limiting all environments | `93d9fb543` | NOT on main |
| 5 HIGH backend findings | `5174ed0df` | NOT on main |
| Webhook replay dedup fix | `d740b568e` | NOT on main |
| FFI label registry (crypto) | `c2ef3ef35` | NOT on main |

**Action required:** Merge these fix PRs to main to close the outstanding findings.

---

## Methodology

This audit was conducted by:

1. **Automated deep-read analysis** of all route, middleware, service, and schema files in `apps/worker/`
2. **Wave 2 finding verification** — each wave 2 finding was re-checked against current `main` to confirm persistence
3. **Git history analysis** — `git log --since="2026-05-18"` to identify new code and security-relevant changes
4. **Parallel agent analysis** covering:
   - Auth & session handling
   - Access control & RBAC
   - Crypto operations & input validation
   - WebSocket, rate limiting, information disclosure
   - Webhook & telephony adapters
   - Newer route files (admin, evidence, erasure, retention, etc.)

---

## Recommendations Priority Matrix

| Priority | Action | Findings Addressed |
|----------|--------|--------------------|
| P0 | Merge existing wave 2 fix PRs | C1, H1-H4, and 10+ MEDIUM/LOW |
| P1 | Hub-scope firehose individual reads | H6 |
| P1 | Encrypt/remove ban list `phone_display` | H5 |
| P2 | Rate limit public endpoints | M4 |
| P2 | Add WebSocket per-connection rate limit | M5 |
| P2 | Add WebSocket per-user connection cap | M9 |
| P2 | Zod validate preferences endpoint | M6 |
| P2 | Bind WebAuthn challenge to user | M12 |
| P2 | Constant-time session token comparison | M13 |
| P2 | Add ADMIN_PUBKEY kill switch | M11 |
| P3 | Gate OpenAPI docs behind auth | M12 |
| P3 | Enforce events sunset date | L2 |
| P3 | Address remaining LOW findings | L1, L3-L11 |
