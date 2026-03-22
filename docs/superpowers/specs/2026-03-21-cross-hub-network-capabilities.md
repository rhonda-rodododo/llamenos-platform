# Spec: Cross-Hub Network Capabilities

**Date:** 2026-03-21
**Scope:** Backend (worker), Desktop UI, iOS, Android
**Status:** Pre-implementation spec

---

## CORE ARCHITECTURAL AXIOM — Read This First

> **Multi-hub membership is a core value proposition of Llamenos. Any authenticated user can be a member of multiple hubs simultaneously — regardless of their role. The system MUST behave as follows at all times:**
>
> 1. **Incoming calls, push notifications, and real-time Nostr events are received from ALL hubs the user is a member of — not just the hub currently active in the UI.**
> 2. **Hub switching in the UI changes only the browsing/case management context. It does not pause, interrupt, or filter call reception, notification delivery, or WebSocket subscriptions for other hubs.**
> 3. **An active call on Hub A is not interrupted by the user switching to Hub B's UI context.**
> 4. **The "active hub" is a UI navigation concept only. All protocol-level operations (SIP registration, WebSocket subscription, push decryption) are hub-independent and cover all memberships.**
>
> This axiom is not a guideline — it is an architectural constraint. Any feature that would cause a user to miss calls or notifications from a non-active hub violates this constraint and must not ship.

This document describes the features required to enforce this axiom architecturally, and to extend the hub network with cross-hub capabilities (ban propagation, mutual aid fallback, network-wide emergency broadcast, cross-hub audit).

---

## Table of Contents

1. [Feature 1: Architecture Documentation](#feature-1-architecture-documentation)
2. [Feature 2: Cross-Hub Ban Propagation](#feature-2-cross-hub-ban-propagation)
3. [Feature 3: Cross-Hub User Suspension Suggestions](#feature-3-cross-hub-user-suspension-suggestions)
4. [Feature 4: Multi-Hub SIP Registration (Call Receiving from All Hubs)](#feature-4-multi-hub-sip-registration)
5. [Feature 5: Mutual Aid Fallback Ring Groups](#feature-5-mutual-aid-fallback-ring-groups)
6. [Feature 6: Network-Level Emergency Broadcast](#feature-6-network-level-emergency-broadcast)
7. [Feature 7: Cross-Hub Audit Log (Super-Admin)](#feature-7-cross-hub-audit-log)
8. [File Map](#file-map)
9. [Architectural Constraints](#architectural-constraints)
10. [Verification Gates](#verification-gates)

---

## Feature 1: Architecture Documentation

### Goal

Make the multi-hub axiom impossible to miss. Every engineer working on this codebase must encounter it in the first file they read for any hub-related feature.

### Current State

The axiom is implied by the multi-hub architecture but not stated anywhere explicitly. `CLAUDE.md` describes multi-hub membership as a capability but does not articulate the "all hubs active at all times" invariant. `docs/protocol/PROTOCOL.md` has no section on cross-hub call routing or hub switching semantics.

### Required Changes

**CLAUDE.md** — Add a new section "Multi-Hub Architecture Guarantees" immediately after the "Architecture Roles" table:

```markdown
## Multi-Hub Architecture Guarantees

Any authenticated user may be a member of multiple hubs simultaneously — regardless of role. The following invariants are
non-negotiable and must be preserved by every feature touching call routing, push handling,
WebSocket subscriptions, or SIP registration:

1. **All hubs are always active.** Incoming calls, APNs push notifications, VoIP pushes,
   and Nostr events are received from every hub the user is a member of — regardless
   of which hub is currently active in the UI.
2. **Hub switching is UI-only.** Changing `hubContext.activeHubId` (iOS), `ActiveHubState`
   (Android), or the desktop hub selector changes browsing/case context only. It does not
   cancel SIP registrations, close WebSocket connections, or stop processing push payloads
   for other hubs.
3. **Call handling is hub-independent.** When an incoming call arrives for Hub A while the
   user has Hub B active in the UI, the call is received normally. The incoming call
   screen shows which hub the call is for.
4. **Active call continuity.** An active call on Hub A is not affected by switching the UI
   context to Hub B.

**Hub-scoped operations** (change when hub context switches):
- API requests for notes, cases, contacts, shifts, reports, conversations, bans, settings
- WebSocket channel subscriptions (browsing)
- UI rendering (tab contents, list data)

**Hub-independent operations** (always cover all memberships):
- SIP account registration (Linphone maintains one account per member hub)
- VoIP push processing (wake payload decryption uses the hub key from the payload's hubId)
- APNs display notification delivery (all hubs push to the device)
- Nostr relay subscription (strfry subscription covers all hub pubkeys)
```

**docs/protocol/PROTOCOL.md** — Add a new section after the existing push notification section, titled "Cross-Hub Routing Semantics":

The section must cover:
- How a client identifies which hub an incoming call/push belongs to (`hubId` field in push payload, SIP routing via per-hub domain)
- Hub switching semantics: what changes vs what stays the same at the protocol level
- SIP registration: one `GET /api/hubs/{hubId}/telephony/sip-token` per hub, all registrations maintained concurrently
- Wake payload decryption: always use the hub key for the `hubId` in the payload, never the "active" hub key
- WebSocket: clients may maintain parallel WebSocket connections per hub, or a single connection with hub-keyed subscriptions; server routes events by hub key

### Multi-Hub Axiom Applicability

This feature IS the axiom — it governs all other features in this spec.

### Files to Change

- `CLAUDE.md` — add "Multi-Hub Architecture Guarantees" section
- `docs/protocol/PROTOCOL.md` — add "Cross-Hub Routing Semantics" section

---

## Feature 2: Cross-Hub Ban Propagation

### Goal

Allow admins to propagate a ban suggestion to other hubs within the same network, and allow super-admins to issue a network-wide ban across all hubs simultaneously. Abusive callers (domestic abusers, stalkers, harassment campaigns) are a network-wide risk and cannot be contained to a single hub ban.

### Current State

**Database:** `apps/worker/db/schema/records.ts` — the `bans` table has a `hub_id` column. A ban applies only to the hub it was created for. The `listBans` query in `RecordsService` filters by `hubId`. Ban lookup during call routing (`apps/worker/routes/telephony.ts`) checks the ban list for the hub receiving the call only.

**API:** `apps/worker/routes/bans.ts` — `POST /bans/` (hub-scoped), `DELETE /bans/:phone` (hub-scoped), `POST /bans/bulk`. No cross-hub propagation endpoints exist.

**Schema:** `packages/protocol/schemas/bans.ts` — `banResponseSchema` contains `phone`, `reason`, `bannedBy`, `bannedAt`. No propagation status or network-wide fields.

**Privacy constraint:** The existing `hashPhone()` HMAC blind index in `apps/worker/lib/crypto.ts` is already used for audit logging (phone hash, not phone number). Cross-hub propagation MUST use the same blind index mechanism — raw phone numbers must not leave a hub's trust boundary.

### Required Changes

#### Database Schema

Add two new tables in `apps/worker/db/schema/records.ts`:

**`ban_propagation_suggestions`** — pending suggestions sent from Hub A to Hub B:
```
id            text PK
sourceHubId   text NOT NULL  -- hub that originated the ban
targetHubId   text NOT NULL  -- hub being asked to adopt the ban
banId         text REFERENCES bans(id)  -- the originating ban record
phoneHash     text NOT NULL  -- HMAC blind index (no raw phone)
reason        text
status        text NOT NULL DEFAULT 'pending'  -- pending | accepted | rejected
suggestedBy   text NOT NULL  -- pubkey of the admin who triggered propagation
suggestedAt   timestamp NOT NULL DEFAULT NOW()
reviewedBy    text
reviewedAt    timestamp
```

**`network_bans`** — super-admin network-wide bans (applies across all hubs):
```
id            text PK
phoneHash     text NOT NULL UNIQUE  -- HMAC blind index
phone         text NOT NULL  -- encrypted (see below)
reason        text
bannedBy      text NOT NULL
bannedAt      timestamp NOT NULL DEFAULT NOW()
```

Encrypt `phone` using `LABEL_NETWORK_BAN_PHONE = 'llamenos:network-ban-phone'` with the hub's symmetric key ECIES-wrapped for super-admin readers only — same pattern as contact PII envelopes. Only super-admins can decrypt the raw phone from a network ban. Admins see only the `phoneHash` in their UI.

#### Service Layer (`apps/worker/services/records.ts`)

Add methods:
- `propagateBanToHub(banId, sourceHubId, targetHubId, suggestedBy)` — inserts a suggestion row; emits Nostr event (see below)
- `propagateBanToAllHubs(banId, sourceHubId, suggestedBy)` — calls propagateBanToHub for each hub the server knows about
- `listBanSuggestions(hubId)` — returns pending suggestions for this hub
- `reviewBanSuggestion(suggestionId, adminPubkey, action: 'accept' | 'reject')` — if accepted, calls `addBan()` with the originating phone number (requires retrieving it from the source hub ban record)
- `createNetworkBan(phone, reason, bannedBy)` — inserts into `network_bans`, enforces across all hub lookups
- `isNetworkBanned(phoneHash)` — used in call routing to check network-wide ban list before hub-specific ban list

**Privacy architecture for `reviewBanSuggestion`:** The `phoneHash` in the suggestion is sufficient for enforcement (ban routing already uses the hash for lookups). However, if a Hub B admin wants to create a matching hub-scoped ban record (to show in their ban list UI), they need the raw phone number. Two options:
1. The suggestion includes the phone number encrypted with Hub B's hub key (ECIES), decryptable only by Hub B admins.
2. Hub B admin accepts the suggestion, creating a hub-scoped ban keyed off the `phoneHash` only (no raw phone stored on Hub B).

**Decision:** Use option 2 — store the `phoneHash` in the hub-scoped ban on Hub B without the raw phone number. This means Hub B's ban list will show "caller (identity protected)" for propagated bans, with source hub and reason visible. This is correct — Hub B admins should not receive PII from Hub A.

#### API Endpoints (`apps/worker/routes/bans.ts`)

New endpoints:

```
POST /bans/:id/propagate
  Permission: bans:propagate (new permission — admins only)
  Body: { targetHubIds: string[] }  -- specific hubs, or omit for all-hubs suggestion
  Action: calls propagateBanToHub or propagateBanToAllHubs
  Audit: logs propagation with phoneHash

GET /bans/suggestions
  Permission: bans:create (admins can review suggestions for their hub)
  Returns: pending ban suggestions for the requesting user's hub

POST /bans/suggestions/:id/review
  Permission: bans:create
  Body: { action: 'accept' | 'reject' }
  Action: calls reviewBanSuggestion; if accepted, creates hub-scoped ban

POST /network/bans  (super-admin only)
  Permission: * (system:manage-instance or super-admin wildcard)
  Body: { phone: string, reason?: string }
  Action: calls createNetworkBan
  Audit: logs network-wide ban

GET /network/bans  (super-admin only)
  Permission: *
  Returns: all network-wide bans
```

**Mount location:** `POST /network/bans` mounts on the `/network` prefix (new top-level route group). Other ban routes remain on the existing `/bans` prefix. The `network.ts` router mounts at `/api/network` in the main Hono app. All endpoint paths in this spec should be read as `/api/network/bans`, `/api/network/users/:pubkey/flag`, etc. Add `app.route('/api/network', networkRouter)` in `apps/worker/app.ts`.

**Hub routing middleware** must be updated: `isNetworkBanned()` is checked during call routing (telephony webhook) before the hub-specific ban check.

#### Nostr Event for Ban Propagation

When a ban is propagated, emit an encrypted Nostr event (kind `20002`) to Hub B's relay subscription:
- Content: ECIES-encrypted JSON with `{ type: "ban:suggestion", sourceHubId, phoneHash, reason, suggestionId }` using Hub B's hub key
- Generic tag: `["t", "llamenos:event"]` — all Nostr events emitted by the server use this generic tag; the event type is encoded only in the encrypted payload content, not in relay-visible tags
- Hub B clients display an in-app badge on the ban management screen when a suggestion arrives

#### Protocol Schema (`packages/protocol/schemas/bans.ts`)

Add:
- `banSuggestionSchema` — for suggestion list responses
- `banPropagateBodySchema` — for `POST /bans/:id/propagate`:
  ```ts
  banPropagateBodySchema = z.object({ targetHubIds: z.array(z.string()).optional() })
  ```
  Omitting `targetHubIds` (or passing an empty array) means propagate to ALL hubs where the banned phone hash matches a caller.
- `banSuggestionReviewBodySchema` — for `POST /bans/suggestions/:id/review`
- `networkBanBodySchema` — for `POST /network/bans`
- `networkBanResponseSchema`

#### Desktop UI

- Ban detail page: add "Propagate ban" button → opens hub selector modal (checkboxes for each network hub), or "Propagate to all hubs" option
- Ban management page: add "Incoming suggestions" tab showing pending suggestions with accept/reject actions
- Super-admin settings: "Network bans" panel for `GET/POST /network/bans`

### Multi-Hub Axiom Applicability

Ban propagation is an administrative action — it is hub-scoped in origin but explicitly designed to cross hub boundaries. Network-wide bans apply at call routing time regardless of which hub receives the call. This extends, rather than violates, the axiom.

### Files to Change

- `apps/worker/db/schema/records.ts` — add `banPropagationSuggestions`, `networkBans` tables
- `apps/worker/db/schema/index.ts` — export new tables
- `apps/worker/services/records.ts` — add propagation methods
- `apps/worker/routes/bans.ts` — add propagation and suggestion endpoints
- `apps/worker/routes/network.ts` — new file: `POST /network/bans`, `GET /network/bans`
- `apps/worker/routes/telephony.ts` — check `isNetworkBanned()` in call routing
- `packages/protocol/schemas/bans.ts` — add propagation schemas
- Desktop UI: ban detail, ban list, super-admin settings

---

## Feature 3: Cross-Hub User Suspension Suggestions

### Goal

When a user behaves inappropriately on Hub A, Hub A's admin can flag that user for review on other hubs where they are also a member. Hub B's admin retains full autonomy over their user roster — Hub A can flag but not remove. Super-admins can suspend network-wide.

### Current State

No cross-hub user management capabilities exist. User membership per hub is stored in the `user_hub_roles` table (see `apps/worker/db/schema/users.ts`). Removing a user from Hub A (`DELETE /hubs/:hubId/members/:pubkey`) has no effect on their membership in Hub B.

### Required Changes

#### Database Schema (`apps/worker/db/schema/users.ts`)

Add:

**`user_flags`** — cross-hub flag-for-review records:
```
id             text PK
flaggedPubkey  text NOT NULL
sourceHubId    text NOT NULL
targetHubId    text NOT NULL
reason         text NOT NULL
flaggedBy      text NOT NULL  -- admin pubkey
flaggedAt      timestamp NOT NULL DEFAULT NOW()
status         text NOT NULL DEFAULT 'pending'  -- pending | reviewed | dismissed
reviewedBy     text
reviewedAt     timestamp
```

**`network_suspensions`** — super-admin network-wide suspensions:
```
pubkey         text PK
reason         text
suspendedBy    text NOT NULL
suspendedAt    timestamp NOT NULL DEFAULT NOW()
```

#### Service Layer (`apps/worker/services/identity.ts`)

Add methods:
- `flagUserForReview(flaggedPubkey, sourceHubId, reason, flaggedBy)` — creates flag records for ALL other hubs where the user is a member; emits Nostr notification to those hub admins. **Flag-for-review is an all-or-nothing operation:** when Hub A flags a user, records are created for ALL other hubs where that user is a member. There is no per-hub targeting. This is intentional — admins should not need to know which other hubs the user belongs to. Hub B admins receive the flag and independently decide whether to act.
- `listUserFlags(hubId)` — pending flags for the requesting hub's admins
- `dismissUserFlag(flagId, reviewerPubkey)` — marks flag reviewed/dismissed without action
- `networkSuspendUser(pubkey, reason, suspendedBy)` — creates network suspension record; does NOT delete `user_hub_roles` rows. Instead it sets a `network_suspensions` record, and the auth middleware's `isNetworkSuspended()` check returns 403 before any hub-role check. If the suspension is lifted (`DELETE /network/users/:pubkey/suspend`), hub memberships are still intact. Removing rows would require tracking them elsewhere for reinstatement. Emits Nostr notification to all affected hub admins.
- `isNetworkSuspended(pubkey)` — checked during auth resolution

#### API Endpoints

```
POST /users/:pubkey/flag-for-review
  Permission: users:manage (hub-scoped admin action)
  Body: { reason: string }
  Action: flags user on all hubs where they are also a member

GET /users/flags
  Permission: users:manage
  Returns: pending flags for the requesting admin's hub

POST /users/flags/:id/dismiss
  Permission: users:manage
  Body: { }

POST /network/users/:pubkey/suspend  (super-admin only)
  Permission: *
  Body: { reason: string }
  Action: network-wide suspension

DELETE /network/users/:pubkey/suspend  (super-admin only)
  Permission: *
  Action: lift network-wide suspension
```

#### Auth Middleware

`apps/worker/middleware/hub.ts` or auth resolution: check `isNetworkSuspended(pubkey)` after resolving user identity. A network-suspended user receives `403 Forbidden` on all API requests, regardless of hub.

#### Nostr Notification

When a user is flagged, emit encrypted Nostr event (kind `20003`) to all target hub relay subscriptions:
- Content: ECIES-encrypted `{ type: "user:flag", flaggedPubkey, sourceHubId, reason, flagId }` using each target hub's key
- Generic tag: `["t", "llamenos:event"]` — event type is in the encrypted payload only, not in relay-visible tags
- Desktop and mobile clients show a badge on the admin user management screen

#### Desktop UI

- User detail page (admin): "Flag for network review" button → modal with reason field
- Admin user management: "Incoming flags" tab showing flagged users with dismiss option
- Super-admin: "Network suspensions" panel

### Multi-Hub Axiom Applicability

Cross-hub user flagging does not affect call receiving or notification delivery for the flagged user until Hub B's admin takes action. Flagging is informational only from Hub A's perspective — it does not alter the user's memberships or capabilities. Network suspension (super-admin) does affect all hubs simultaneously, which is intentional and under super-admin authority.

### Files to Change

- `apps/worker/db/schema/users.ts` — add `userFlags`, `networkSuspensions` tables
- `apps/worker/services/identity.ts` — add flag/suspend methods
- `apps/worker/routes/users.ts` or new `apps/worker/routes/network.ts` — new endpoints
- `apps/worker/middleware/hub.ts` — check `isNetworkSuspended` in auth path
- `packages/protocol/schemas/` — add `userFlagSchema`, `networkSuspensionSchema`
- Desktop UI: user detail, admin user management, super-admin settings

---

## Feature 4: Multi-Hub SIP Registration

### Goal

Ensure iOS and Android LinphoneService maintains SIP registrations for ALL hubs the user is a member of simultaneously, not just the currently active hub. This enforces the multi-hub axiom at the telephony layer.

### Current State

**iOS `LinphoneService`** (`apps/ios/Sources/Services/LinphoneService.swift`): The protocol already has `registerHubAccount(hubId:sipParams:)` and `unregisterHubAccount(hubId:)`. The `hubAccounts` dictionary tracks per-hub `Account` objects. The service can handle multiple concurrent registrations architecturally.

The gap is in when registrations happen: SIP registration is currently tied to shift start (`ShiftsViewModel` calls `linphoneService.registerHubAccount` when going on-shift for a hub). If the user is on-shift for Hub A but Hub B is active in the UI, Hub B's SIP account may not be registered.

**Android:** Similar gap in `LinphoneService.kt` (to be confirmed during implementation).

**Incoming call identification:** The `pendingCallHubIds` map in `LinphoneService` already supports correlating call ID → hub ID from VoIP push payloads before Linphone fires `onCallStateChanged`. This is the correct architecture.

### Required Changes

#### iOS

**`apps/ios/Sources/ViewModels/ShiftsViewModel.swift`** — When loading shift status on launch or after hub context switch, register SIP accounts for ALL hubs where the user has an active shift, not just the currently active hub. The method that fetches shift status must iterate over all member hubs and call `registerHubAccount` for each.

**`apps/ios/Sources/App/AppState.swift`** — On post-authentication hub list load, iterate member hubs and pre-register SIP accounts for hubs where the user has an active on-shift record (shift `startTime <= now AND endTime >= now`). Do not pre-register for all member hubs indiscriminately — this would waste SIP server resources for hubs where the user is not currently on duty. Do not wait for the user to manually switch hub context.

**`apps/ios/Sources/Services/LinphoneService.swift`** — No changes required to the core service (the architecture is already correct). The fix is in the callers.

**Incoming call hub display:** When `onCallStateChanged` fires for an incoming call:
1. Look up `hubId` from `pendingCallHubIds[callId]`
2. If `hubId != hubContext.activeHubId`, call `hubContext.setActiveHub(hubId)` before presenting the call UI — or present the call UI with the hub name displayed ("Incoming call — Hub A"), allowing the user to accept without switching context first.

Option 2 (display without forcing hub switch) is preferred: the user should not have their browsing context disrupted by an incoming call that they may decline.

**Incoming call UI (`apps/ios/Sources/Views/` — call answer screen):** Show hub name/logo for the incoming call when it is from a non-active hub.

#### Android

**`apps/android/app/src/main/java/.../service/LinphoneService.kt`** — Android changes mirror iOS: iterate all on-shift hubs on startup and call `registerHubAccount()` for each. In `PushService.kt`, when handling an `incoming_call` notification, do NOT call `setActiveHub()` — this would disrupt the user's browsing context. Display the incoming call notification with hub name from the payload. On incoming call from non-active hub, display hub identity in the incoming call notification/screen. Specific files: `apps/android/app/src/main/java/.../service/LinphoneService.kt` and `apps/android/app/src/main/java/.../ui/calls/IncomingCallScreen.kt`.

#### SIP Token Fetching for All Hubs

The endpoint `GET /api/hubs/{hubId}/telephony/sip-token` is already hub-scoped. Fetching tokens for multiple hubs requires one request per hub. This is acceptable — SIP registrations are long-lived (expiry from `SipTokenResponse.expiry`) and do not refresh frequently.

**Token refresh:** Implement a background refresh timer per hub (refresh at 80% of `expiry`). This is an extension of the existing shift-linked registration — currently the token is fetched once per shift start.

> **Before implementing the refresh timer:** Verify the `expiry` field type in `SipTokenResponse` schema by running `grep -A5 'expiry' packages/protocol/schemas/telephony.ts`. If it is a Unix timestamp (number), compute `refreshAt = expiry * 1000 * 0.8`. If it is a duration in seconds, compute `refreshAt = Date.now() + expiry * 1000 * 0.8`.

### Multi-Hub Axiom Applicability

This feature is a direct enforcement of the axiom at the telephony layer. Without it, a user receives calls only on their currently active hub's SIP account, violating guarantee #1.

### Files to Change

- `apps/ios/Sources/ViewModels/ShiftsViewModel.swift` — register SIP for all on-shift hubs
- `apps/ios/Sources/App/AppState.swift` — multi-hub SIP pre-registration on login
- `apps/ios/Sources/Services/LinphoneService.swift` — add SIP token refresh timer support
- `apps/ios/Sources/Views/` — incoming call UI: hub identity display
- `apps/android/app/src/main/java/.../service/LinphoneService.kt` — same changes
- `apps/android/app/src/main/java/.../ui/` — incoming call UI: hub identity display

---

## Feature 5: Mutual Aid Fallback Ring Groups

### Goal

If Hub A has no on-shift users available when a call arrives, Hub A's admin can pre-configure Hub B as a fallback. Hub B users receive Hub A calls during the fallback period and are shown "Answering for Hub A" in the call UI.

### Current State

**`apps/worker/services/ringing.ts`** — The ringing service rings all on-shift, non-busy users for the call's hub. If none are available, the call falls through to voicemail or a configured TwiML fallback. No cross-hub ringing is implemented.

**`apps/worker/db/schema/settings.ts`** — Hub settings are stored as JSONB. Fallback hub configuration does not exist.

### Required Changes

#### Database Schema (`apps/worker/db/schema/settings.ts`)

Add a `hub_fallback_configs` table:
```
id               text PK
primaryHubId     text NOT NULL REFERENCES hubs(id)
fallbackHubId    text NOT NULL REFERENCES hubs(id)
priority         integer NOT NULL DEFAULT 1  -- lower = tried first
activeWindowStart  time  -- null = always active
activeWindowEnd    time  -- null = always active
timezone           text
createdBy        text NOT NULL
createdAt        timestamp NOT NULL DEFAULT NOW()
UNIQUE(primaryHubId, fallbackHubId)
```

#### Service Layer (`apps/worker/services/ringing.ts`)

Update `ringVolunteers()` (or equivalent):
1. Attempt to ring on-shift users for the primary hub.
2. If none available — meaning zero users with `status='on_shift'` and `busyStatus != 'on_call'` in the primary hub's shift roster — check `hub_fallback_configs` for the primary hub.
3. For each fallback hub in priority order:
   - Check if fallback is within its active window (if configured). The active window comparison uses PostgreSQL: `CURRENT_TIME AT TIME ZONE hub_fallback_configs.timezone BETWEEN activeWindowStart AND activeWindowEnd`. Validate that `timezone` is a valid IANA timezone identifier before insertion.
   - Attempt to ring on-shift users for the fallback hub.
   - Pass the originating hub ID as call metadata so the user's UI can display it.
4. If still no users, fall through to TwiML fallback.

#### Call Metadata

The `calls` table already has a `hubId` column. Add an `originatingHubId` column (nullable) to record when a call was routed via fallback. This is displayed in the call detail UI and audit log.

#### API Endpoints (`apps/worker/routes/hubs.ts`)

> **Before implementing fallback endpoints:** Check whether `system:manage-hubs` exists in the PBAC permission registry (`apps/worker/lib/auth.ts` and `packages/protocol/schemas/auth.ts`). If it does not exist, create it as a new super-admin-only permission and add it to the permission registry. Hub fallback configuration is a cross-hub operation and must be behind this permission.

```
GET /hubs/:hubId/fallbacks
  Permission: hubs:read (admin of the hub)
  Returns: configured fallback hubs in priority order

POST /hubs/:hubId/fallbacks
  Permission: system:manage-hubs (or hub-admin permission)
  Body: { fallbackHubId: string, priority?: number, activeWindowStart?: string, activeWindowEnd?: string, timezone?: string }

DELETE /hubs/:hubId/fallbacks/:fallbackHubId
  Permission: system:manage-hubs

PATCH /hubs/:hubId/fallbacks/:fallbackHubId
  Permission: system:manage-hubs
  Body: { priority?, activeWindowStart?, activeWindowEnd?, timezone? }
```

#### Desktop UI

- Hub settings page: "Fallback ring groups" section with add/remove/reorder UI
- Incoming call screen for fallback-routed calls: banner "This call is for [Hub A] — you are answering as fallback"
- Call history and call detail: show originating hub when different from answering hub

#### User UX on Mobile

On iOS and Android incoming call screen: display originating hub name prominently when answering as fallback. This requires the VoIP push payload to include `originatingHubId` (or the Linphone SIP headers to carry it). The server populates this in the VoIP push when routing a fallback call.

### Multi-Hub Axiom Applicability

Fallback ring groups extend the axiom: a user receives calls not only from their own hubs, but from partner hubs configured as fallback. The call receiving path remains hub-independent — the user's device always processes the incoming VoIP push regardless of UI context.

### Files to Change

- `apps/worker/db/schema/settings.ts` — add `hubFallbackConfigs` table
- `apps/worker/db/schema/calls.ts` — add `originatingHubId` column
- `apps/worker/services/ringing.ts` — add fallback ringing logic
- `apps/worker/routes/hubs.ts` — add fallback CRUD endpoints
- `packages/protocol/schemas/hubs.ts` — add fallback config schemas
- Desktop UI: hub settings, call detail, call answer screen
- iOS: incoming call UI hub display
- Android: incoming call notification hub display

---

## Feature 6: Network-Level Emergency Broadcast

### Goal

Super-admins can send an urgent message to ALL users across ALL hubs simultaneously. Use cases: system outage warning, safety alert, policy update requiring immediate attention.

### Current State

The blast system (`apps/worker/services/blasts.ts`) handles batched SMS/WhatsApp/Signal delivery to callers (outbound messaging to contacts). It is not designed for internal broadcasts to app users. There is no in-app broadcast mechanism.

### Required Changes

#### Database Schema

Add `network_broadcasts` table (`apps/worker/db/schema/`):
```
id           text PK
subject      text NOT NULL
body         text NOT NULL  -- plaintext (see design note below)
severity     text NOT NULL DEFAULT 'info'  -- info | warning | critical
sentBy       text NOT NULL
sentAt       timestamp NOT NULL DEFAULT NOW()
expiresAt    timestamp  -- null = no expiry; clients hide after this time
```

> **Plaintext design note:** Network broadcast body is stored in plaintext in the DB by design. This is an accepted tradeoff: super-admin broadcasts are system-level messages (outage warnings, policy updates), not user PII. Super-admins who can send broadcasts already have platform-level access. Future consideration: encrypt at rest if broadcast content evolves to include sensitive operational details.

#### Service Layer

`apps/worker/services/broadcasts.ts` (new):
- `sendNetworkBroadcast(subject, body, severity, expiresAt, sentBy)` — inserts record, pushes APNs notification to all active user devices, emits encrypted Nostr event (kind `20004`) to all hub relay subscriptions
- `listActiveBroadcasts()` — returns non-expired broadcasts (used by client on app launch and WebSocket reconnect)

APNs delivery: use the existing push infrastructure in `apps/worker/lib/push-dispatch.ts`. Call `createPushDispatcherFromService(env, db)` and iterate all distinct device tokens registered in the `devices` table. Send a display notification (not a silent wake push) with `{ type: 'broadcast', broadcastId }` to each device. Clients fetch the broadcast body via `GET /network/broadcasts/:id` on receipt.

Nostr delivery: emit one event per hub (encrypted with each hub's key) carrying the broadcast payload, using the generic tag `["t", "llamenos:event"]`. The broadcast type is encoded only in the encrypted payload content. Clients subscribed to their hub Nostr feeds receive it in real time.

#### API Endpoints

```
POST /network/broadcasts  (super-admin only)
  Permission: *
  Body: { subject: string, body: string, severity?: 'info'|'warning'|'critical', expiresAt?: string }

GET /network/broadcasts
  Permission: authenticated (any user)
  Returns: active (non-expired) broadcasts, newest first

DELETE /network/broadcasts/:id  (super-admin only)
  Permission: *
  Action: set expiresAt = NOW() (soft-delete / retract)
```

#### Client Display

On all platforms (Desktop, iOS, Android): display active broadcasts as a dismissible alert banner at the top of the main UI, below any soft-update banners. The banner persists until dismissed by the user (dismissal stored in `UserDefaults` / `SharedPreferences` keyed by broadcast ID) or until `expiresAt` passes.

On launch and on WebSocket reconnect, clients call `GET /network/broadcasts` to load any broadcasts issued while offline.

**Severity styling:**
- `info` — blue banner
- `warning` — amber banner
- `critical` — red banner with persistent display (cannot be dismissed until super-admin retracts)

#### Desktop UI

- Super-admin settings: "Emergency broadcast" panel with compose form (subject, body, severity, optional expiry)
- Broadcast history: list of past broadcasts with retract action

### Multi-Hub Axiom Applicability

Network broadcasts are sent to all users on all hubs simultaneously. The delivery mechanism (APNs + Nostr) is hub-independent by design. This is a canonical example of hub-independent operation.

### Files to Change

- `apps/worker/db/schema/` — add `networkBroadcasts` table
- `apps/worker/services/broadcasts.ts` — new file
- `apps/worker/routes/network.ts` — add broadcast endpoints (extend the file created for Feature 2)
- `packages/protocol/schemas/` — add `networkBroadcastSchema`
- Desktop: super-admin settings, alert banner component
- iOS: alert banner in main view hierarchy
- Android: alert banner in main composable

---

## Feature 7: Cross-Hub Audit Log (Super-Admin)

### Goal

Super-admins can view a unified audit feed spanning all hubs simultaneously. Current hub-scoped audit queries give a super-admin no cross-hub visibility — they must switch hub context to review each hub separately.

### Current State

**`apps/worker/db/schema/records.ts`** — `auditLog` table has a nullable `hubId` column. All audit events are already stored in a single PostgreSQL table — the data is co-located. The only barrier is that the `GET /audit` API endpoint filters by the requesting user's hub.

**`apps/worker/services/audit.ts`** — The implementer must check the actual signature of `listAuditLog()` in `apps/worker/services/audit.ts` before writing the cross-hub extension. Do not assume any parameter signature. Cross-hub querying requires either removing the hub filter for super-admin requests, or adding a new service method.

### Required Changes

#### Service Layer (`apps/worker/services/audit.ts`)

Add `listAuditLogAllHubs(filters)` — same as existing list method but without the `hubId` constraint. Accepts optional `actorPubkey`, `action`, date range, and pagination filters.

Alternatively, extend the existing `listAuditLog()` to accept `hubId: string | 'all'` and branch internally.

#### API Endpoints

Extend the existing audit endpoint (`apps/worker/routes/` — wherever audit is mounted):

```
GET /audit?allHubs=true
  Permission: * (super-admin only — checked via checkPermission(permissions, '*'))
  Query params: allHubs=true, action?, actorPubkey?, from?, to?, limit?, offset?
  Returns: audit entries across all hubs, with hubId included in each entry
```

The `allHubs=true` query param is only honored when the requesting user has wildcard (`*`) permissions. Non-super-admin requests with `allHubs=true` receive a `403`.

#### Desktop UI

- Super-admin settings: "Network audit" tab
- Shows the unified audit log with a `Hub` column identifying the hub for each entry
- Filterable by hub, action type, actor pubkey, and date range
- Uses the same audit log component as the hub-scoped view, with hub column added

#### Protocol Schema

Add `crossHubAuditQuerySchema` (for the `?allHubs=true` query params) and extend `auditEntrySchema` to include `hubName` (joined from hub record for display convenience).

### Multi-Hub Axiom Applicability

Cross-hub audit is a read-only super-admin view. It does not affect call handling, notification delivery, or any operational invariant. It provides visibility into the multi-hub system without changing its behavior.

### Files to Change

- `apps/worker/services/audit.ts` — add cross-hub query support
- `apps/worker/routes/` (audit route) — add `allHubs` query parameter handling
- `packages/protocol/schemas/` — extend audit schemas
- Desktop: super-admin "Network audit" tab

---

## File Map

### Backend (`apps/worker/`)

| File | Features |
|---|---|
| `db/schema/records.ts` | F2: ban_propagation_suggestions, network_bans |
| `db/schema/users.ts` | F3: user_flags, network_suspensions |
| `db/schema/settings.ts` | F5: hub_fallback_configs |
| `db/schema/calls.ts` | F5: originatingHubId column |
| `db/schema/` (new) | F6: network_broadcasts |
| `db/schema/index.ts` | Re-export all new tables |
| `services/records.ts` | F2: propagation, network ban methods |
| `services/identity.ts` | F3: flag, network suspension methods |
| `services/ringing.ts` | F5: fallback ring group logic |
| `services/audit.ts` | F7: cross-hub query |
| `services/broadcasts.ts` (new) | F6: network broadcast service |
| `routes/bans.ts` | F2: propagation, suggestion, review endpoints |
| `routes/hubs.ts` | F5: fallback config endpoints |
| `routes/network.ts` (new) | F2: /network/bans; F3: /network/users/suspend; F6: /network/broadcasts |
| `routes/` (audit) | F7: allHubs query param |
| `middleware/hub.ts` | F3: isNetworkSuspended check |
| `routes/telephony.ts` | F2: isNetworkBanned check in call routing |

### Protocol (`packages/protocol/schemas/`)

| File | Features |
|---|---|
| `bans.ts` | F2: propagation, suggestion, network ban schemas |
| `users.ts` or new `userFlags.ts` | F3: flag, suspension schemas |
| `hubs.ts` | F5: fallback config schemas |
| new `broadcasts.ts` | F6: network broadcast schema |
| (audit schema) | F7: cross-hub audit query schema |

### Desktop UI (`src/client/`)

| Component | Features |
|---|---|
| Ban detail / ban list | F2: propagate button, suggestion inbox |
| Super-admin: Network bans panel | F2 |
| User detail / user management | F3: flag button, incoming flags tab |
| Super-admin: Network suspensions | F3 |
| Hub settings | F5: fallback ring groups |
| Call detail / call answer screen | F5: originating hub display |
| Emergency broadcast panel (super-admin) | F6 |
| Alert banner (global layout) | F6 |
| Network audit tab (super-admin) | F7 |

### iOS (`apps/ios/`)

| File | Features |
|---|---|
| `Sources/ViewModels/ShiftsViewModel.swift` | F4: multi-hub SIP registration |
| `Sources/App/AppState.swift` | F4: post-login SIP pre-registration |
| `Sources/Services/LinphoneService.swift` | F4: SIP token refresh |
| `Sources/Views/` (call answer screen) | F4, F5: hub identity display |
| Main view hierarchy | F6: broadcast alert banner |

### Android (`apps/android/`)

| File | Features |
|---|---|
| `app/src/main/java/.../service/LinphoneService.kt` | F4: multi-hub SIP registration |
| `app/src/main/java/.../ui/` (call screen) | F4, F5: hub identity display |
| Main composable / scaffold | F6: broadcast alert banner |

### Documentation

| File | Features |
|---|---|
| `CLAUDE.md` | F1: Multi-Hub Architecture Guarantees section |
| `docs/protocol/PROTOCOL.md` | F1: Cross-Hub Routing Semantics section |

---

## Super-Admin Identity Model

Super-admins are users with the `*` permission grant in a platform-level hub (not a tenant hub). The auth middleware populates `permissions` including `*` for these users. `checkPermission(permissions, '*')` returns true if the user has `*` in their permission set. Super-admin status is stored as a role in `user_hub_roles` for the designated platform admin hub (hub with `isPlatformAdmin = true` in the `hubs` table). If this column doesn't exist yet, add it as part of Feature 3's DB schema changes.

---

## Architectural Constraints

**Privacy — phone numbers never cross hub boundaries.**
Cross-hub ban propagation uses HMAC blind indexes (`hashPhone()`), not raw E.164 numbers. This is already established practice in the audit log (`bans.ts` line 65). All new cross-hub ban features must follow this constraint. The `networkBans` table stores both a phone hash (for enforcement) and an encrypted phone (for super-admin management only, encrypted with the server key).

**Trust boundaries — Hub A admin cannot act on Hub B.**
Flagging a user is informational only. Hub B's admin retains full autonomy. The propagation APIs are "suggest" APIs, not "apply" APIs (except for super-admin network-wide actions).

**Multi-hub axiom enforcement.**
Features 4 (multi-hub SIP) and the documented axiom in Feature 1 are prerequisites for all other features — they establish the correct foundation. Features 2, 3, 5, 6, 7 are additive capabilities layered on top.

**No PII in Nostr events.**
All Nostr events for cross-hub coordination (ban suggestions, user flags, broadcasts) must be ECIES-encrypted with the target hub's key. All server-emitted Nostr events use the generic tag `["t", "llamenos:event"]` — the relay cannot distinguish event types. The event type is encoded only in the encrypted payload content, never in relay-visible tags.

**Super-admin permission model.**
Super-admin actions (`POST /network/bans`, `POST /network/users/:pubkey/suspend`, `POST /network/broadcasts`) require `checkPermission(permissions, '*')` — the wildcard permission already held by `role-super-admin`. No new permission strings needed for super-admin routes.

New permissions needed for hub-admin actions:
- `bans:propagate` — propose a ban propagation (hub admin)
- `users:flag` — flag a user for review on other hubs (hub admin)

---

## Verification Gates

### Feature 1: Documentation
- [ ] `CLAUDE.md` contains "Multi-Hub Architecture Guarantees" section with all 4 invariants
- [ ] `docs/protocol/PROTOCOL.md` contains "Cross-Hub Routing Semantics" section
- [ ] A new contributor reading `CLAUDE.md` before writing any hub-related code encounters the axiom

### Feature 2: Ban Propagation
- [ ] BDD: Admin on Hub A bans a number → propagates suggestion to Hub B → Hub B admin accepts → number is blocked on Hub B
- [ ] BDD: Super-admin creates network ban → number is blocked on both Hub A and Hub B without hub admin action
- [ ] Audit log: propagation events logged with phone hash (never raw number)
- [ ] API: `POST /bans/:id/propagate` returns 403 for Volunteer-role users
- [ ] Privacy: `phoneHash` appears in suggestion records, not raw `phone`

### Feature 3: User Suspension Suggestions
- [ ] BDD: Hub A admin flags user → Hub B admin receives flag notification → Hub B admin dismisses → user retains Hub B membership
- [ ] BDD: Super-admin network-suspends user → user receives 403 on all hubs
- [ ] API: `POST /users/:pubkey/flag-for-review` returns 403 for Volunteer-role users
- [ ] Auth middleware: network-suspended user blocked before hub-scoped permission check

### Feature 4: Multi-Hub SIP Registration
- [ ] iOS: user on-shift on Hub A and Hub B simultaneously receives incoming call from Hub B while Hub A is active in UI
- [ ] iOS: incoming call from non-active hub shows correct hub name
- [ ] Android: same two tests
- [ ] No SIP accounts unregistered on hub context switch

### Feature 5: Mutual Aid Fallback
- [ ] BDD: Hub A has zero on-shift users → call is routed to Hub B fallback user → user sees "Answering for Hub A"
- [ ] BDD: Hub B fallback has an active window configured → fallback not applied outside that window
- [ ] Call detail shows originating hub when different from answering hub

### Feature 6: Network Broadcast
- [ ] BDD: Super-admin sends critical broadcast → all active user devices receive APNs notification → app displays red banner
- [ ] BDD: Broadcast with expiry → banner disappears after expiry time
- [ ] BDD: Super-admin retracts broadcast → banner disappears for all clients on next poll/WebSocket event
- [ ] API: `POST /network/broadcasts` returns 403 for non-super-admin

### Feature 7: Cross-Hub Audit
- [ ] BDD: Super-admin queries `GET /audit?allHubs=true` → receives entries from Hub A and Hub B in single response
- [ ] API: `GET /audit?allHubs=true` returns 403 for hub-admin (non-super-admin) users
- [ ] Desktop: Network audit tab renders entries from multiple hubs with hub column populated
