# Security Remediation — Epic 3: Worker Backend & Hub Key Endpoints

**Date**: 2026-03-21
**Audit ref**: `docs/security/SECURITY_AUDIT_2026-03-21.md`
**Findings addressed**: CRIT-H1, CRIT-W1, CRIT-W2, HIGH-H1, HIGH-H2, HIGH-H3, HIGH-W1, HIGH-W3, HIGH-W4, HIGH-W5, MED-W1, MED-W2 (12 total)
**Audit corrections**: HIGH-W2 (rate limiting "inverted") — investigation confirmed rate limiting logic is correct; this finding is closed as N/A.
**Dependency order**: After Epic 2 (Crypto). Must land before Epic 4 (Desktop) and Epic 5 (iOS/Android).

---

## Context

The worker backend handles call routing, key distribution, webhook processing, and audit logging. Three critical findings, all in different subsystems:
- Hub key endpoint missing auth guard (hub membership enumeration)
- Twilio webhook hub selected from untrusted query param (signature bypass)
- Volunteer pubkey accepted from URL params in callbacks (audit log poisoning, call hijacking)

**HIGH-W2 (rate limiting) closed**: Investigation confirmed `checkRateLimit()` returns `{ limited: boolean }` and the condition `if (limited) return 429` is correct and not inverted. The `ENVIRONMENT !== 'development'` outer check correctly skips rate limiting in dev mode only. No change needed.

The audit also described a "WebAuthn signature verification skipped" concern. Investigation confirmed the auth middleware at `apps/worker/middleware/auth.ts:25-35` includes a dev-mode signature bypass scoped to `ENVIRONMENT === 'development'` — it still validates token format and freshness, and requires the user to already be registered. This bypass is intentional for E2E mobile test environments with cross-architecture signature interop issues. No security change required; this is documented behavior.

---

## Findings and Fixes

### CRIT-H1 — `GET /api/hubs/:hubId/key` has no membership check

**File**: `apps/worker/routes/hubs.ts:249-283`

The hub key retrieval route is registered with no middleware — no auth guard, no permission check, no hub access check. The handler uses `c.get('pubkey')` which is `undefined` for unauthenticated requests. It fetches all envelopes for the caller-supplied `hubId` and returns 404 if no matching pubkey is found. This means:

1. Any unauthenticated request to `GET /api/hubs/<id>/key` can enumerate hub existence (200 vs 404 vs error)
2. Any authenticated volunteer can probe hub IDs they are not members of
3. The response distinguishes "hub exists, you have no key" from "hub not found"

The sibling route (`GET /:hubId`, lines 102-141) correctly uses `requirePermission('hubs:read')` followed by an inline `isSuperAdmin || hasHubAccess` check. The key route skips both.

**Prerequisite**: Verify in `apps/worker/app.ts` that the auth middleware is applied globally before the hubs router is mounted. `requirePermission()` calls `c.get('permissions')` which is only set after the auth middleware runs. If the hubs router is mounted inside the authenticated router (as the sibling routes are), no additional auth middleware is needed at the route level. Confirm the router mounting structure before implementing.

**Fix**: Add identical middleware as the sibling route:

```typescript
routes.get('/:hubId/key',
  describeRoute({ ... }),
  requirePermission('hubs:read'),        // ← ADD: auth + permission guard
  async (c) => {
    const hubId = c.req.param('hubId')
    const pubkey = c.get('pubkey')        // ← now guaranteed non-undefined
    const services = c.get('services')
    const permissions = c.get('permissions')

    // ADD: hub access check matching sibling route pattern (lines 130-134)
    const isSuperAdmin = permissions.includes('*')
    if (!isSuperAdmin) {
      const hasAccess = await services.identity.hasHubAccess(pubkey, hubId)
      if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)
    }

    const { envelopes } = await services.settings.getHubKeyEnvelopes(hubId)
    const myEnvelope = envelopes.find(e => e.pubkey === pubkey)
    if (!myEnvelope) return c.json({ error: 'No key envelope for this user' }, 404)
    return c.json({ envelope: myEnvelope })
  },
)
```

**Verification**:
- Unauthenticated request → 401
- Authenticated volunteer without hub membership → 403
- Authenticated volunteer with hub membership but no envelope → 404
- Authenticated volunteer with hub membership and envelope → 200 with envelope

---

### CRIT-W1 — Twilio webhook hub selected from untrusted `?hub=` query parameter

**File**: `apps/worker/routes/telephony.ts:32-61`

Incoming Twilio webhooks include a `?hub=<hubId>` query parameter. The webhook handler uses this to resolve the hub's telephony adapter and validates the webhook signature against that hub's credentials:

```typescript
const hubId = url.searchParams.get('hub')
const adapter = hubId
  ? await services.telephony.getAdapterForHub(hubId)
  : services.telephony.getDefaultAdapter()
await adapter.validateWebhook(c.req.raw)  // validates against hub's credentials
```

An attacker can supply `?hub=hub-A` on a callback for hub-B's call, causing validation to use hub-A's Twilio credentials. If hub-A's credentials are weaker or the attacker controls hub-A's configuration, they can forge webhook events for hub-B's calls — answering calls, ending them, or submitting CAPTCHA bypass events.

**Root cause**: Hub identity on inbound webhooks must come from the server-side call record, not from the URL.

**Architectural note**: The current `telephony.use('*', ...)` middleware at lines 32-61 fires before any route handler and cannot read the request body (CallSid is a body field, not a URL parameter). This means the middleware architecture itself must change — the global signature validation middleware must be dissolved into per-route validation calls. The global adapter is used for `/incoming` (inbound calls, no prior record); all callback routes (`/user-answer`, `/call-status`, `/call-recording`) call `adapter.validateWebhook()` inline after looking up the call record.

**Fix**:

For **inbound call webhooks** (no associated call record yet — the call is new):
- Validate against a global or per-number adapter. The phone number the caller dialed (`To` field in Twilio payload) determines the hub, not a URL parameter.
- Store the resolved `hubId` in the `active_calls` table when creating the call record (`addCall`).

For **callback webhooks** (answer, status, recording — associated with an existing call):
- Look up `hubId` from the `active_calls` table using `CallSid` (already available in the Twilio payload body).
- Ignore the `?hub=` URL parameter entirely for signature validation.

```typescript
// For status/answer callbacks:
const callSid = formData.get('CallSid') as string
const call = await services.calls.getActiveCallBySid(callSid)
if (!call) return c.text('Unknown call', 404)
const adapter = await services.telephony.getAdapterForHub(call.hubId)
await adapter.validateWebhook(c.req.raw)
```

This requires `active_calls` to store `hubId` (already done when the call is created via `addCall`).

**Verification**:
- Webhook for hub-B's CallSid with `?hub=hub-A` → adapter resolved from call record (hub-B), not URL param
- Webhook with unknown CallSid → 404 before adapter selection
- Valid hub-B webhook → passes validation

---

### CRIT-W2 — Volunteer pubkey accepted from URL params in Twilio callbacks

**File**: `apps/worker/routes/telephony.ts:193-194, 236, 339`

The `/user-answer`, `/call-status`, and `/call-recording` handlers extract `pubkey` from `url.searchParams`:

```typescript
const pubkey = url.searchParams.get('pubkey') || ''
await services.calls.answerCall(hubId ?? '', parentCallSid, pubkey)
await audit(services.audit, 'callAnswered', pubkey, { ... })
```

The pubkey embedded in the callback URL is set by the server when starting parallel ringing, but there is no mechanism to verify it hasn't been tampered with by the time the callback arrives. Twilio signature validation protects the Twilio-signed body fields — not URL query parameters.

**Root cause**: Call ownership must be tracked server-side, not via URL parameters.

**Fix**: Add a `callToken` column to `active_calls` — a cryptographically random token generated when the ringing URL is constructed and stored alongside the call record.

When building the callback URLs for parallel ringing:
```typescript
const callToken = crypto.randomUUID()
await services.calls.storeCallToken(callSid, volunteerPubkey, callToken)
// Embed callToken in the callback URL instead of pubkey:
const callbackUrl = `${base}/user-answer?callToken=${callToken}&parentCallSid=${parentCallSid}`
```

When the callback arrives:
```typescript
const callToken = url.searchParams.get('callToken') || ''
const callRecord = await services.calls.resolveCallToken(callToken)
if (!callRecord) return c.text('Invalid token', 403)
const pubkey = callRecord.volunteerPubkey  // server-side, not from URL
```

The `callToken` is opaque and single-use — consumed when the answer is recorded. A forged URL with an unknown token returns 403. A valid token from a different call cannot be replayed because the token is tied to a specific `(callSid, volunteerPubkey)` pair.

**Schema change**: Add `call_token UUID UNIQUE` and `call_token_volunteer TEXT` to `active_calls` table. The `UNIQUE` constraint is required to prevent race conditions on concurrent answer callbacks. Use an atomic `DELETE ... RETURNING` to consume the token:

```typescript
// In resolveCallToken service method:
const [record] = await db
  .delete(callTokens)           // or update active_calls
  .where(eq(callTokens.token, callToken))
  .returning({ volunteerPubkey: callTokens.volunteerPubkey, callSid: callTokens.callSid })
// If record is undefined, token was already consumed or never existed → 403
```

This ensures two simultaneous webhook deliveries for the same token cannot both succeed. Clean up unused tokens on call end (separate delete, not part of the atomic consume).

**Verification**:
- Answer callback with valid callToken → pubkey resolved from server-side record
- Answer callback with forged/unknown callToken → 403
- Replay of a consumed callToken → 403 (token marked used)
- Audit log `callAnswered` event references correct volunteer pubkey

---

### HIGH-H1 — Hub key ECIES unwrap absent on iOS client

**File**: `apps/ios/Sources/App/AppState.swift:372`

iOS receives `serverEventKeyHex` solely via `GET /api/auth/me`, relying entirely on the server to deliver the correct hub-scoped key. There is no client-side verification that the key corresponds to the active hub or that the ECIES envelope can be independently unwrapped.

**Investigation finding**: The `/api/auth/me` response constructs `serverEventKeyHex` from `SERVER_NOSTR_SECRET` via HKDF — this is a server-derived key, not an ECIES-wrapped key. The hub key distribution (via `GET /api/hubs/:hubId/key`) is a separate ECIES-wrapped key for Nostr relay event content.

**Design prerequisite**: Before implementation, resolve whether `serverEventKeyHex` (from `SERVER_NOSTR_SECRET`) and the hub key (from `GET /api/hubs/:hubId/key`) are the same key or different keys at the Nostr relay encryption layer. If the relay uses `SERVER_NOSTR_SECRET`-derived keys for content encryption (separate from the hub key), the architecture decision of which key to use for relay events must be made before the iOS client fix in Epic 5 can be specified. This is a blocker for the HIGH-H1 Epic 5 implementation — not for the worker-side fix below.

**Fix**: Verify the `/api/auth/me` endpoint correctly scopes `serverEventKeyHex` to the active hub. If the key is global (not hub-scoped), the worker must be updated to:
1. Accept a hub scope in the auth/me request (e.g., `?hub=<slug>`)
2. Return the ECIES-wrapped hub key envelope alongside the session data
3. The client performs the ECIES unwrap locally using its nsec

If `SERVER_NOSTR_SECRET` is truly global across all hubs (current state per audit finding HIGH-W1), fix HIGH-W1 first (migrate to per-hub key delivery), then implement client-side unwrap. The iOS client code change (fetching and unwrapping the hub key envelope) is documented in Epic 5.

**Verification**: After hub key scoping is implemented, verify that switching hubs causes the client to receive and unwrap a different key.

---

### HIGH-H2 — Android push notifications carry no hub attribution

**File**: `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt:89-134`

Push notifications dispatch on `data["type"]` with no hub check. A volunteer in Hub A and Hub B receives identical call notifications with no indication of which hub the call belongs to.

**Fix — worker side**: Include `hubId` in the encrypted wake payload sent to the push service:

```typescript
// In the wake payload construction (apps/worker/services/push.ts or similar):
const wakePayload: WakePayload = {
  callId,
  shiftId,
  hubId,          // ← ADD
  type: 'incoming_call',
}
```

This requires updating the `WakePayload` Zod schema in `packages/protocol/schemas/` and running codegen.

**Fix — Android side** (documented in Epic 5): After decrypting the wake payload, check `wakePayload.hubId` against the active hub before surfacing the ringing call UI.

**Verification**: A push for hub-B while the volunteer's active hub is hub-A either shows a hub-attribution badge or is suppressed (depending on product decision). Calls for the active hub ring normally.

---

### HIGH-H3 — Active hub slug stored in `UserDefaults` instead of Keychain

**File**: `apps/ios/Sources/ViewModels/HubManagementViewModel.swift:20-28`

The active hub slug is persisted in `UserDefaults.standard`, which is not excluded from iCloud backups and is observable by MDM profiles. Hub membership is sensitive organizational metadata.

**Fix** (iOS side — documented in Epic 5): Migrate `activeHubSlug` persistence to `KeychainService` matching the pattern used for `hubUrl`.

**Worker-side note**: No worker change required. This is purely an iOS client change.

---

### HIGH-W1 — `serverEventKeyHex` delivered to all authenticated users regardless of role

**File**: `apps/worker/routes/auth.ts:153-155, 173`

`serverEventKeyHex` is derived deterministically from `SERVER_NOSTR_SECRET` via HKDF and returned in `/api/auth/me` to every authenticated user. This is a single global key covering all hubs. Any compromised volunteer session exposes the full relay decryption key.

**Fix**: Migrate from a server-derived global key to a per-hub ECIES-wrapped key envelope system (matching the hub key model already in place).

**Approach**:
1. Remove `serverEventKeyHex` from the `/api/auth/me` response entirely.
2. Clients obtain hub event decryption keys via `GET /api/hubs/:hubId/key` (same endpoint, fixed by CRIT-H1). The existing hub key already serves as the relay event encryption key — clients already have access to it via their ECIES-unwrapped envelope.
3. If the Nostr relay uses `SERVER_NOSTR_SECRET`-derived keys for event encryption (separate from the hub key), evaluate whether this layer should be replaced with the hub key. If so, update `hub-event-crypto.ts` to use the hub key rather than `SERVER_NOSTR_SECRET`.

**Near-term acceptable compromise**: If full migration is deferred, scope `serverEventKeyHex` delivery to users with a `events:read-server-key` permission (admin-only), so at minimum volunteer-level compromise does not expose the global relay key.

**Verification**: After removal, volunteer-level auth/me responses contain no `serverEventKeyHex`. Admin responses may contain it if the permission-scoped interim approach is used. Relay event decryption still works via hub key envelope.

---

### HIGH-W3 — Raw caller phone number written to audit log in plaintext

**File**: `apps/worker/routes/bans.ts:63`

```typescript
await audit(services.audit, 'numberBanned', pubkey, { phone: body.phone })
```

`hashPhone` is NOT currently imported in `bans.ts`. The fix requires adding the import and updating the audit call:

```typescript
// Add import at top of bans.ts:
import { hashPhone } from '../lib/crypto'

// Change audit call:
await audit(services.audit, 'numberBanned', pubkey, {
  phone: hashPhone(body.phone, c.env.HMAC_SECRET),
})
```

Check for any other audit log calls in `bans.ts` that include raw phone numbers and apply the same fix.

**Verification**: After the fix, the `details` column of audit log entries for `numberBanned` contains the hashed phone (hex string), not a recognizable phone number format.

---

### HIGH-W4 — Dev endpoint returns `403` instead of `404` when no secret configured

**File**: `apps/worker/routes/dev.ts:34-64`

When `ENVIRONMENT=development` is set but no `DEV_RESET_SECRET` is configured, `checkResetSecret` returns `false` and the endpoint returns `403 Forbidden`. This confirms the endpoint exists in development environments without a secret.

The current 404 behavior (for non-development environments) is correct. The issue is only in the `isDev && !checkResetSecret` path.

**Fix**: Return `404` for all cases where access is denied at the secret-check level, not `403`. The pattern appears in **three endpoint handlers** — all must be fixed:

- `/test-reset` handler (line 39-41)
- `/test-reset-no-admin` handler (line 73-75)
- `/test-reset-records` handler (line 109-111)

```typescript
if (!checkResetSecret(c)) {
  return c.json({ error: 'Not Found' }, 404)  // was: 403
}
```

This makes all three endpoints indistinguishable from non-existent endpoints regardless of whether `DEV_RESET_SECRET` is configured.

**Verification**: `curl -X POST http://localhost:3000/api/test-reset` without a secret returns `404`, not `403`. Same for `/test-reset-no-admin` and `/test-reset-records`.

---

### HIGH-W5 — Missing `encodeURIComponent` on `accountSid` in Twilio test URL

**File**: `apps/worker/routes/settings.ts:432-450`

The Twilio provider test constructs a URL with `accountSid` unsanitized:

```typescript
testUrl = `https://api.twilio.com/2010-04-01/Accounts/${body.accountSid}.json`
```

**Fix**:

1. Verify `telephonyProviderSchema` enforces a strict Twilio SID format. The SID should match `/^AC[a-f0-9]{32}$/`. If the Zod schema does not enforce this regex, add:

```typescript
accountSid: z.string().regex(/^AC[a-f0-9]{32}$/, 'Invalid Twilio Account SID format')
```

2. Apply `encodeURIComponent` defensively regardless:

```typescript
testUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(body.accountSid)}.json`
```

**Verification**: Submit a provider test with `accountSid: "AC../../../foo"`. With the regex, Zod validation rejects it at 400. Even without, the URL is safely encoded.

---

### MED-W1 — Hub-scoped routes accessible via global endpoint

**File**: `apps/worker/middleware/hub.ts`; `apps/worker/app.ts:139-182`

Routes mounted on both the global and hub-scoped routers use `requirePermission()` which checks global permissions. A user with global `notes:read-own` can reach `/api/notes` (all hubs' notes, filtered by `hubId ?? ''`) even if they have no hub role.

**Fix**: For routes that should be hub-scoped only, ensure the route handler or service layer enforces hub filtering when `c.get('hubId')` is empty string. The empty-string case currently means "all hubs" — this must be restricted to super-admin only.

In the service layer, for queries that use `hubId`:
```typescript
const hubId = c.get('hubId') ?? ''
if (!hubId && !isSuperAdmin) {
  return c.json({ error: 'Hub context required' }, 400)
}
```

Alternatively, remove the global route registrations for hub-scoped resources (notes, conversations, calls, reports) and require all access to go through `/api/hubs/:hubId/<resource>`.

**Recommended approach**: Enforce hub ID requirement in the service layer for non-super-admin callers. This is less disruptive than removing global routes and still prevents cross-hub data access.

**Verification**: A volunteer (no super-admin permission) calling `GET /api/notes` without a hub context receives `400`. Super-admin calling the same receives all-hub data.

---

### MED-W2 — Direct ban by phone number inconsistent with caller identity model

**File**: `apps/worker/routes/bans.ts:31-66`

`POST /bans/` accepts a raw `phone` field from the request body and creates a ban directly. The call-scoped `/calls/ban` endpoint has a comment "server resolves phone number — volunteer never sees it." These two paths are inconsistent: volunteers should never submit raw phone numbers.

**Fix**: Restrict `POST /bans/` raw phone submission to admin-only:

```typescript
// Change permission from 'bans:report' to the admin-level ban permission:
requirePermission('bans:delete'),  // admin-only permission (exists in shared/permissions.ts:86)
```

Note: `bans:delete` is an existing admin-level permission — it's the closest semantically appropriate admin-level permission currently defined. An alternative is to introduce a new `bans:create` guard on this route specifically (the permission is already defined in `packages/shared/permissions.ts:84` as "Ban numbers" but is not currently used on any route — using it here aligns with its stated purpose).

Volunteers use only `POST /calls/:callId/ban` where the server resolves the phone from the call record. This preserves caller identity protection — volunteers never handle raw phone numbers.

**Verification**: A volunteer attempting `POST /bans/` with a `phone` body receives `403`. Admin can still create bans directly. Volunteer ban flow via call-scoped endpoint works normally.

---

## Implementation Sequence

1. **CRIT-H1** — Add auth middleware to hub key endpoint (independent, fast fix)
2. **HIGH-W3** — Hash phone in ban audit log (independent one-line fix)
3. **HIGH-W4** — Return 404 in dev endpoint (independent one-line fix)
4. **HIGH-W5** — Add SID format validation + encodeURIComponent (independent)
5. **CRIT-W1 + CRIT-W2 together** — These must land in a single commit: CRIT-W1 dissolves the global signature-validation middleware into per-route calls; CRIT-W2 adds the callToken column and switches callback handlers to server-side pubkey resolution. An intermediate state where the middleware is restructured but pubkeys still come from URL params (or vice versa) is still insecure. Both changes affect the same webhook handler files.
7. **HIGH-W1** — serverEventKeyHex scoping (design decision: permission gate vs full migration; implement permission gate first as interim)
8. **HIGH-H1, HIGH-H2** — Dependent on hub key architecture decisions above; document server-side changes needed for Epic 5
9. **MED-W1, MED-W2** — Permission hardening (after above changes are stable)

---

## Verification Checklist

- [ ] Unauthenticated `GET /api/hubs/<any-id>/key` → 401
- [ ] Authenticated non-member `GET /api/hubs/<hub-id>/key` → 403
- [ ] Authenticated member `GET /api/hubs/<hub-id>/key` → 200 with correct envelope
- [ ] Twilio webhook with `?hub=wrong-hub` resolves adapter from call record, not URL param
- [ ] Twilio webhook with unknown CallSid → 404 before adapter selection
- [ ] Answer callback with forged callToken → 403
- [ ] Answer callback with valid callToken → pubkey resolved server-side, call marked answered
- [ ] Replay of consumed callToken → 403
- [ ] `POST /api/bans/` audit log `numberBanned` detail contains hashed phone, not plaintext
- [ ] Dev reset endpoint returns 404 (not 403) when no `DEV_RESET_SECRET` is set
- [ ] Twilio `accountSid` with path traversal (`../`) → 400 from Zod validation
- [ ] Volunteer `GET /api/notes` without hub context → 400 (not all-hub data)
- [ ] Volunteer `POST /api/bans/` with phone body → 403
- [ ] Admin `POST /api/bans/` with phone body → 200 (still works)
- [ ] `bun run typecheck` passes
- [ ] `bun run test:backend:bdd` passes
