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
| HIGH | 10 | 5 persist from wave 2, 5 new |
| MEDIUM | 30 | 8 persist from wave 2, 22 new |
| LOW | 17 | 6 persist from wave 2, 11 new |
| **Total** | **58** | |

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

### H6: SSRF via telephony recording URL fetches (NEW)
**Files:** `apps/worker/telephony/vonage.ts:405,415`, `apps/worker/telephony/plivo.ts:366,378`

`getRecordingAudio()` in both Vonage and Plivo adapters accepts a parameter that is a full URL (from webhook payload `recording_url` / `RecordUrl` fields) and passes it to `safeFetch()` without `ssrfGuard: true`. A compromised or spoofed webhook could supply an internal URL (e.g., `http://169.254.169.254/latest/meta-data/`) and the server would fetch it with provider authentication headers attached.

**Impact:** Server-side request forgery — an attacker could probe internal infrastructure, access cloud metadata endpoints, or reach internal services.

**Fix:** Enable `ssrfGuard: true` on all recording URL fetches. Alternatively, validate recording URLs against provider-specific hostname allowlists (e.g., `*.api.vonage.com`, `*.plivo.com`).

### H7: Firehose connection read lacks hub-scoping — cross-hub data access (NEW)
**File:** `apps/worker/routes/firehose.ts:169-179`

`GET /:id` with `firehose:read` permission retrieves any firehose connection by UUID without verifying it belongs to the caller's hub. The same issue affects `GET /:id/buffer` (line 360-371), `POST /:id/optout` (line 408-418), and `DELETE /:id/optout` (line 434-442).

While the list endpoints (lines 60, 91) correctly scope by `hubId`, individual record access bypasses hub scoping entirely.

**Impact:** A user with `firehose:read` in hub A can read firehose connection details and buffer contents from hub B.

**Fix:** After fetching the connection, verify `row.hubId` matches the caller's hub context.

### H8: WebRTC/SIP token routes lack any permission guard (NEW)
**File:** `apps/worker/routes/webrtc.ts:19,72,126,154`

All four WebRTC/SIP endpoints (token generation, SIP credential generation, status checks) rely solely on authentication but have zero `requirePermission()` calls. Any authenticated user — regardless of role — can generate WebRTC tokens and SIP credentials. A user with zero permissions (e.g., deactivated but still holding a valid session) could generate telephony credentials.

**Fix:** Add `requirePermission('calls:answer')` or a dedicated `telephony:use-webrtc` permission to all four endpoints.

### H9: Evidence routes missing hub-scoping — cross-hub IDOR (NEW)
**Files:** `apps/worker/routes/evidence.ts:126-259`

Evidence-by-ID routes (`GET /evidence/:evidenceId`, `GET /evidence/:evidenceId/custody`, `POST /evidence/:evidenceId/access`, `POST /evidence/:evidenceId/verify`) accept an arbitrary `evidenceId` with no check that the evidence belongs to the caller's hub. A user with `evidence:download` in Hub A could access evidence metadata, custody chains, and trigger access logs for evidence in Hub B by guessing evidence IDs.

**Fix:** After fetching evidence by ID, verify it belongs to the caller's hub context.

### H10: Admin device overview accepts arbitrary hubId query parameter — cross-hub enumeration (NEW)
**File:** `apps/worker/routes/admin/devices.ts:25`

The `hubId` comes from `c.req.valid('query')` (user-provided), not from hub context middleware. An admin of Hub A with `users:manage-devices` could pass `hubId=<hub-B-id>` and view device overviews for users in Hub B.

**Fix:** Use `c.get('hubId')` from hub context middleware instead of accepting it as a query parameter.

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

### M6: WebSocket upgrade path bypasses all Hono rate limiting (NEW)
**File:** `src/server/index.ts:254-264`

WebSocket upgrades are handled in the raw `Bun.serve()` `fetch()` handler, before requests reach the Hono app and its `rateLimit()` middleware. An attacker can flood the server with upgrade requests — each allocating a 32-byte nonce and a timer — without any IP-based throttling, even for unauthenticated attempts.

**Fix:** Add an IP-based rate limit check before `server.upgrade()`, or move WebSocket handling into the Hono middleware chain.

### M7: Login rate limit key is `'unknown'` for all non-Cloudflare deployments (NEW)
**File:** `apps/worker/routes/auth.ts:43`

`const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'` — since the production deployment is a self-hosted Bun server behind Caddy (not Cloudflare), `CF-Connecting-IP` is never set. ALL login attempts share the rate limit key `auth:hash('unknown')`. This means the 10 attempts/minute limit is shared across all attackers AND all legitimate users. The same issue exists in `/bootstrap` (line 99) and `/webauthn/login/options`.

**Impact:** The auth rate limit is effectively a single global bucket — one attacker can lock out all users, and distributed attackers bypass per-IP limits entirely.

**Fix:** Use Caddy's `X-Real-IP` header or Bun's connection remote address. Ensure the `extractIp` helper is used consistently.

### M8: `PATCH /messaging/preferences` accepts unvalidated JSON body (NEW)
**File:** `apps/worker/app.ts:171-183`

```typescript
body = await c.req.json()
// ...
const result = await services.blasts.updatePreferences(token, body as { language?: string; status?: ... })
```

Uses raw `c.req.json()` with an `as` cast instead of Zod validation. Any JSON shape is accepted and passed to the service layer. This is the only non-dev production endpoint without Zod validation.

**Fix:** Add a Zod schema for the preferences update body with explicit field validation.

### M9: Signal notification digest inline permission check — wildcard bypass (PERSISTS from wave 2)
**File:** `apps/worker/routes/signal-notification.ts:281-293`

`POST /digest/run` checks `permissions.includes('system:admin')` directly instead of `requirePermission()`. A super-admin with wildcard `*` permission (but not the literal string `system:admin`) would be denied.

**Fix:** Replace with `requirePermission('system:admin')` middleware.

### M10: Health check leaks error messages to unauthenticated callers (PERSISTS from wave 2)
**File:** `apps/worker/routes/health.ts`

`err.message` returned in `detail` field for failing health checks. Could leak internal hostnames, connection strings, database errors.

**Fix:** Return generic `'Connection check failed'`. Log actual error server-side only.

### M11: No WebSocket connection limit per user (NEW)
**File:** `apps/worker/routes/ws.ts`, `apps/worker/lib/ws-manager.ts`

No cap on simultaneous WebSocket connections per pubkey. An attacker with valid credentials can open thousands of connections, causing memory exhaustion on the server.

**Fix:** Cap at ~10 connections per pubkey in the connection manager.

### M12: Webhook URL falls back to request URL without `WEBHOOK_BASE_URL` (PERSISTS from wave 2)
**File:** `apps/worker/lib/webhook-url.ts:18-21`

If `WEBHOOK_BASE_URL` is unconfigured in production, webhook signature validation may use the spoofable `Host` header.

**Fix:** Fail-hard at startup if `WEBHOOK_BASE_URL` is empty in non-development environments.

### M13: ADMIN_PUBKEY auto-restoration cannot be disabled during incidents (NEW)
**File:** `apps/worker/middleware/auth.ts:72-86`

The ADMIN_PUBKEY user's `role-super-admin` is automatically restored on every authenticated request. During an incident where the admin account is compromised, there is no way to revoke admin access — the middleware will re-grant it immediately.

**Impact:** Cannot contain a compromised admin account without redeploying with a different ADMIN_PUBKEY.

**Fix:** Add kill switch env var (`ADMIN_PUBKEY_AUTO_RESTORE=false`) for incident containment.

### M14: WebAuthn registration challenge not bound to authenticated user during verification (NEW)
**Files:** `apps/worker/routes/webauthn.ts:141,173`, `apps/worker/services/identity.ts:828`

The `storeWebAuthnChallenge` correctly accepts a `pubkey` parameter and stores it with the challenge. However, `getWebAuthnChallenge()` only checks `challengeId` — it never validates that the consuming user matches the `pubkey` stored with the challenge. An attacker who intercepts a challenge ID could register their own authenticator under a victim's account if they can satisfy the origin/rpID checks.

**Fix:** Add a `pubkey` parameter to `getWebAuthnChallenge()` and include `eq(webauthnChallenges.pubkey, pubkey)` in the WHERE clause for registration flows.

### M15: Session token compared with `===` instead of constant-time comparison (NEW)
**File:** `apps/worker/routes/sessions.ts:49`

`isCurrent: s.token === currentToken` uses JavaScript string equality, which is susceptible to timing side-channels. The codebase already uses `timingSafeEqual` for webhook secrets (Telegram, Signal) but not here.

**Fix:** Use `crypto.timingSafeEqual` for the `isCurrent` comparison, or compare by session `id` instead of the secret token value.

### M16: `safeFetch` SSRF guard defaults to disabled (NEW)
**File:** `apps/worker/lib/safe-fetch.ts:17`

The `safeFetch` wrapper defaults `ssrfGuard` to `false`. Only 1 call site out of dozens enables it (Signal adapter). For a security-critical application, the default should be inverted: SSRF guard on by default, with explicit `ssrfGuard: false` for trusted provider API calls.

**Fix:** Invert the default to `ssrfGuard: true`. Add `ssrfGuard: false` to trusted API calls (Twilio, Vonage base API URLs, etc.).

### M17: SIP credentials returned as long-lived plaintext passwords (NEW)
**File:** `apps/worker/telephony/sip-tokens.ts:48-66`

`generateSipParams()` returns SIP passwords as plaintext strings for mobile Linphone SDK configuration. These are long-lived static passwords, unlike WebRTC tokens (`webrtc-tokens.ts`) which use 1-hour JWT expiry. A compromised device retains valid SIP credentials until manually rotated.

**Fix:** Generate time-limited SIP credentials (like the WebRTC JWT approach), or implement credential rotation on session renewal.

### M18: Signal/SIP bridge communication may use plaintext HTTP (NEW)
**Files:** `apps/worker/messaging/signal/adapter.ts:139,199,234`, SIP bridge adapter

The Signal adapter communicates with the signal-cli bridge at `config.bridgeUrl`. If the URL uses `http://` (common in Docker sidecar deployments), the bridge API key is transmitted in cleartext. For a zero-knowledge architecture where the bridge handles plaintext Signal identifiers, this undermines the security model.

**Fix:** Validate that `bridgeUrl` uses HTTPS, or enforce TLS at the code level. Allow HTTP only when explicitly opted into for localhost development.

### M19: OpenAPI spec and Scalar docs publicly accessible (PERSISTS from wave 2)
**File:** `apps/worker/app.ts:299-300`

`/api/openapi.json` and `/api/docs` are unauthenticated, revealing every endpoint, schema, and parameter definition to potential attackers.

**Fix:** Gate behind auth or restrict to development mode in production deployments.

### M20: SSRF via unvalidated ntfy pushToken URL (NEW)
**Files:** `packages/protocol/schemas/devices.ts:13`, `apps/worker/lib/ntfy-client.ts:60`, `apps/worker/lib/push-dispatch.ts:263`

Android UnifiedPush tokens are endpoint URLs (e.g., `https://ntfy.example.com/up-topic-xxx`) stored via `registerDeviceBodySchema` with only `z.string().min(1)` validation — no URL format or SSRF checks. When the server sends push notifications, `NtfyClient.send()` calls `fetch(options.endpoint, ...)` with no SSRF guard. Any authenticated user can register a `pushToken` pointing to `http://169.254.169.254/latest/meta-data/` or other internal services, and the server will fetch it on every push notification.

**Impact:** Internal infrastructure probing, cloud metadata access. Unlike the settings SSRF (admin-only), this is exploitable by any authenticated user with device registration access.

**Fix:** Validate `pushToken` as a well-formed HTTPS URL via `z.string().url()`. Apply `validateExternalUrlWithDns()` before storing. Enable `ssrfGuard: true` in `NtfyClient.send()`.

### M21: Contacts-v2 group operations not hub-scoped by resource (NEW)
**File:** `apps/worker/routes/contacts-v2.ts:216-376`

Group CRUD operations (`GET/PATCH/DELETE /groups/:groupId`, member management) check `contacts:manage-groups` permission but do not verify the group belongs to the caller's hub. A user with this permission in Hub A could modify or delete groups in Hub B by providing Hub B's group ID. The `listGroups` correctly passes `hubId`, but individual operations use only the groupId.

**Fix:** After fetching the group by ID, verify `group.hubId` matches the caller's hub context.

### M22: Erasure admin operations not scoped to admin's hub (NEW)
**File:** `apps/worker/routes/erasure.ts:268-360`

`POST /:userId` (execute erasure) and `POST /:userId/wipe-device/:devicePubkey` take `userId` from URL params but only check `erasure:admin` permission. No verification that the target user belongs to a hub the admin manages. An admin of Hub A could erase users or remote-wipe devices in Hub B.

**Fix:** Verify target user is a member of a hub the caller administers before executing erasure.

### M23: Recovery group info endpoint allows cross-hub access (NEW)
**File:** `apps/worker/routes/recovery-group.ts:99-131`

`GET /:hubId` takes hubId from the URL parameter with only `recovery:view` permission check. Unlike the session status endpoint (which checks hub membership via `user.hubRoles`), the group info endpoint does not verify the caller is a member of the requested hub.

**Fix:** Verify caller is a member of the requested hub before returning recovery group configuration.

### M24: Entity-schema and contacts-v2 accept hubId from request body (NEW)
**Files:** `apps/worker/routes/entity-schema.ts:319`, `apps/worker/routes/contacts-v2.ts:151`

Case number generation prefers `body.hubId` over `c.get('hubId')`. Contact creation uses `c.get('hubId') ?? body.hubId`. When accessed via the non-hub-scoped `authenticated` router, the client can specify any hubId, creating resources in arbitrary hubs.

**Fix:** Never accept `hubId` from request body. Always use `c.get('hubId')` from hub context middleware.

### M25: Entity-schema cross-hub sharing toggle uses hub-level permission for platform operation (NEW)
**File:** `apps/worker/routes/entity-schema.ts:137-178`

`GET /cross-hub` and `PUT /cross-hub` toggle cross-hub sharing for the entire platform but only require `settings:manage-cms` (a hub-scoped permission). A hub admin could toggle platform-wide sharing.

**Fix:** Require `system:manage-instance` (platform-level permission) instead.

### M26: Conversations accessible cross-hub when status is 'waiting' (NEW)
**File:** `apps/worker/routes/conversations.ts:224,263`

The access check is `if (!canReadAll && conv.assignedTo !== pubkey && conv.status !== 'waiting')`. Any authenticated user — including those in other hubs — can read conversation details and messages for any conversation with `status === 'waiting'`. In a multi-hub deployment, this leaks waiting conversation data across hubs.

**Impact:** Cross-hub information disclosure of unassigned conversations, potentially containing sensitive message content.

**Fix:** Add hub membership check before the status-based access bypass.

### M27: Records contacts endpoint does not verify assignment for 'assigned' access level (NEW)
**File:** `apps/worker/routes/records.ts:747+`

`GET /:id/contacts` checks access level but for users with `cases:read-assigned`, does not verify the user is actually assigned to or created the case. A user with `cases:read-assigned` could view contacts for any case in their hub.

**Fix:** When access level is 'assigned', verify `record.assignedTo.includes(pubkey)` before returning contacts.

### M28: Shifts availability delete has no ownership check (NEW)
**File:** `apps/worker/routes/shifts.ts:317`

`DELETE /availability/:id` requires `shifts:set-availability` but does not verify the caller owns the availability block. Any user with `shifts:set-availability` can delete any other user's availability block by ID.

**Fix:** After fetching the availability record, verify it belongs to the authenticated user.

### M29: Users cases endpoint takes hubId from query parameter (NEW)
**File:** `apps/worker/routes/users.ts:180`

`GET /:targetPubkey/cases` uses `c.req.query('hubId') ?? c.get('hubId') ?? ''` — a user with `users:read-cases` in Hub A could pass `hubId=<hub-B-id>` to view case assignments in Hub B. Another instance of the systemic hub-scoping pattern.

**Fix:** Use `c.get('hubId')` only, never accept from query parameter.

### M30: Evidence upload does not verify caller's access to parent case (NEW)
**File:** `apps/worker/routes/evidence.ts:29-46`

`POST /records/:id/evidence` requires `evidence:upload` permission but does not check the caller's assignment to or access level for the parent case record. A user with `evidence:upload` could attach evidence to any case in the system by guessing the case ID.

**Fix:** Verify caller has access to the parent case record before accepting evidence upload.

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

### L12: Health endpoint exposes memory usage and uptime without authentication (NEW)
**File:** `apps/worker/routes/health.ts:137-151`

`GET /api/health/` returns heap memory usage, RSS, and uptime to unauthenticated callers. These details help attackers fingerprint the server, estimate traffic levels, and time attacks.

**Fix:** Restrict the full health endpoint to internal network only. The `/live` and `/ready` probes are sufficient for k8s.

### L13: Event outbox uses `console.error` bypassing PII redaction pipeline (NEW)
**File:** `src/server/index.ts:142-158`

Several `console.error` calls in the event outbox drain bypass the structured logger's PII redaction patterns. Database error messages containing query data could be logged without redaction.

**Fix:** Replace `console.error` with `createLogger('outbox')` for consistent redaction.

### L14: Config endpoint exposes hub structure and bootstrap state to unauthenticated callers (NEW)
**File:** `apps/worker/routes/config.ts:96-112`

The public `/api/config` endpoint returns `serverPubkey`, `wsRelayUrl`, `hubs` (all active hubs with metadata), `needsBootstrap`, `setupCompleted`, and optionally `sentryDsn`. An attacker could learn hub count, names, and whether the instance is freshly deployed. The `sentryDsn` could be used to pollute crash reporting.

**Fix:** Minimize public config response. Move hub listing behind auth. Never expose `sentryDsn` publicly.

### L15: Entity file upload lacks MIME type validation (NEW)
**File:** `apps/worker/routes/uploads.ts:23-53`

The `POST /entity-file` endpoint validates file size but has no MIME type validation — any file type can be uploaded. While files are stored with server-generated UUID keys (preventing path traversal), unrestricted upload types could be used to store malicious content.

**Fix:** Add MIME type allowlist validation (e.g., images, PDFs, documents).

### L16: Debug info leak in development mode 403 responses (NEW)
**Files:** `apps/worker/middleware/permission-guard.ts:29`, `apps/worker/middleware/hub.ts:41-49`

Development-mode 403 responses include user roles, permission counts, pubkey prefix, and hubId. If `ENVIRONMENT=development` is set on a non-local deployment, these responses leak internal authorization state.

**Fix:** Remove detailed debug info from 403 responses, or restrict to localhost.

### L17: Bandwidth webhook uses Basic Auth without HMAC body integrity (NEW)
**File:** `apps/worker/telephony/bandwidth.ts:356-388`

Bandwidth webhook validation uses HTTP Basic Auth (username/password) but does not verify request body integrity via HMAC. A network-level attacker who intercepts the Basic Auth credentials could forge webhook payloads. This is a provider limitation (Bandwidth doesn't offer HMAC signing), but worth documenting.

**Fix:** Document the limitation. Consider IP allowlisting as a compensating control.

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
| P1 | SSRF guard on recording URL fetches | H6 |
| P1 | Hub-scope firehose individual reads | H7 |
| P1 | Add permission guards to WebRTC/SIP routes | H8 |
| P1 | Hub-scope evidence routes | H9 |
| P1 | Fix admin device hubId from query param | H10 |
| P1 | Encrypt/remove ban list `phone_display` | H5 |
| P1 | **Systemic: audit ALL routes for hub-scoping gaps** | H7,H9,H10,M21-M26,M29 |
| P1 | SSRF guard on ntfy pushToken URLs | M20 |
| P1 | Fix login rate limit key for non-CF deployments | M7 |
| P2 | Rate limit WebSocket upgrade path | M6 |
| P2 | Rate limit public endpoints | M4 |
| P2 | Add WebSocket per-connection rate limit | M5 |
| P2 | Add WebSocket per-user connection cap | M11 |
| P2 | Zod validate preferences endpoint | M8 |
| P2 | Bind WebAuthn challenge to user | M14 |
| P2 | Constant-time session token comparison | M15 |
| P2 | Invert safeFetch SSRF guard default | M16 |
| P2 | Time-limit SIP credentials | M17 |
| P2 | Enforce TLS on bridge communication | M18 |
| P2 | Add ADMIN_PUBKEY kill switch | M13 |
| P3 | Gate OpenAPI docs behind auth | M19 |
| P3 | Enforce events sunset date | L2 |
| P2 | Hub-scope contacts-v2 group operations | M21 |
| P2 | Hub-scope erasure admin operations | M22 |
| P2 | Hub-scope recovery group info | M23 |
| P2 | Never accept hubId from request body | M24 |
| P2 | Require platform permission for cross-hub toggle | M25 |
| P2 | Verify assignment on records contacts access | M27 |
| P2 | Add ownership check to shifts availability delete | M28 |
| P2 | Verify parent case access on evidence upload | M30 |
| P3 | Address remaining LOW findings | L1, L3-L17 |
