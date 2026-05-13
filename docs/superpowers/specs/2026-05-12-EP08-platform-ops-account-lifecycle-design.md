---
epic: EP08
title: Platform Operations & Account Lifecycle Security
status: spec
depends-on: [EP01]
phase: 3
date: 2026-05-12
---

# EP08: Platform Operations & Account Lifecycle Security

## Overview

This epic delivers the account lifecycle security system, data retention management, cross-hub ban aggregation, and platform settings for the Llamenos v2 platform. The design is driven by the project's threat model (nation states, right-wing groups, private hacking firms) — not GDPR regulatory compliance alone. The cryptographic guarantees go beyond regulatory minimums to ensure forward-secure revocation, zero-knowledge server operation, and active elimination of departed user access.

## Design Decisions (Resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Erasure delay | Admin-configurable (24h–7d) + emergency override (4h floor) | Hub admins need agency; hard floor prevents coerced short-window erasure |
| Data export | Not included | Volunteers don't own the data they create about callers; hub migration is a separate ops concern |
| Consent tracking | Not included | Organizational onboarding handles consent, not software gates |
| Re-encryption on departure | Active (Approach B) | Even if adversary extracted keys AND ciphertext, server-side envelopes are re-wrapped without them |
| Remote device wipe | Included | Two-phase: destroy keys first, then wipe ciphertext |
| Retention scope | Per-hub with platform-enforced minimums | Hub admins get agency; platform admin enforces floors to prevent evidence destruction |
| Cross-hub views | Only bans (safety feature) | Audit/analytics/health aggregation deferred to EP04 |
| Audit log erasure | Crypto-shredding (per-user key destroyed, hash chain intact) | Industry best practice for E2EE + append-only logs |

## Scope

### Included

1. **Account erasure system** — self-service (configurable delay + emergency override) and admin-immediate, with full cryptographic cascade
2. **Remote device wipe** — server-pushed key destruction + data wipe for compromised users/devices
3. **Active re-encryption on departure** — envelope copies addressed to departed user re-wrapped for remaining recipients
4. **Crypto-shredding for audit log** — per-user audit envelope key, destroyed on erasure, hash chain intact
5. **Data retention purge** — per-hub ciphertext TTLs with platform-enforced minimums, daily cron
6. **Cross-hub ban management** — platform-scoped ban aggregation for multi-number harasser defense
7. **Platform settings** — feature flags, branding defaults, session policy

### Excluded

- No consent gate or consent tracking
- No data export (hub migration is a future ops epic)
- No cross-hub audit/analytics/health views (deferred to EP04)

## Permissions

New permissions added to `PERMISSION_CATALOG`:

```typescript
// Erasure
'erasure:request-self': 'Request own account erasure',
'erasure:admin': 'Manage erasure queue, execute immediate erasure, trigger remote wipe',

// Retention
'retention:manage': 'Configure hub-level data retention periods',

// Bans (platform scope — extends existing bans domain)
'bans:read-platform': 'View bans across all hubs',
'bans:create-platform': 'Create bans that apply across all hubs',
'bans:delete-platform': 'Remove platform-scoped bans',
```

## Architecture

### Section 1: Account Erasure & Cryptographic Cascade

#### Two Erasure Paths

**Self-service erasure:**
- Requires `erasure:request-self` permission
- Available on all platforms (desktop, iOS, Android)
- Configurable delay: hub admin sets via `erasure_config` (min 24h, max 7d, default 72h)
- Emergency override: co-approver Ed25519 signature + justification text, reduces delay to 4h floor
- Cancellable during delay period (protection against coerced erasure)

**Admin immediate erasure:**
- Requires `erasure:admin` permission
- Available on all platforms
- No delay — executes immediately
- Requires justification text (stored in audit log before crypto-shred)
- Used for: compromised users, malicious actors, departed volunteers needing instant revocation

#### Cryptographic Cascade Sequence

**Phase 1 — Revocation (immediate, synchronous):**

1. Sigchain terminal entry — Ed25519-signed `{ type: 'revoke-user', reason, timestamp }` appended to user's sigchain
2. Hub key rotation for every hub the user was a member — new random 32 bytes, HPKE-wrapped to remaining members via `LABEL_HUB_KEY_WRAP`
3. MLS epoch advance (if MLS feature flag enabled) — removes departed user from all group states
4. Remote device wipe pushed to all user's devices (see Section 2)
5. WebSocket connection terminated immediately

**Phase 2 — Server-side cleanup (immediate, transactional):**

6. Delete WebAuthn credentials for user
7. Delete provision rooms where user is a participant
8. Remove user from shift schedules (JSONB array filter in `shift_schedules`)
9. Delete active shifts for user
10. Delete PUK envelopes addressed to the user (`puk_envelopes` table)
11. Delete recovery envelopes for this user (`user_recovery_envelopes` from EP09)
12. Invalidate recovery group shares held by this user — trigger re-deal of affected groups excluding departed user (EP09 interaction)
13. Anonymize user row: clear all encrypted PII fields, set `status: 'erased'`, keep row for FK integrity

**Phase 3 — Crypto-shredding (immediate):**

14. Destroy per-user audit envelope key (see Section 3) — makes all audit entries where this user is referenced undecryptable
15. Replace `actorPubkey` with `[erased]` on audit entries where this user was the actor (preserves hash chain — the hash includes the original value, but the displayed field is anonymized)

**Phase 4 — Active re-encryption (background job):**

16. Queue re-encryption job: find all note `adminEnvelopes` / `authorEnvelope` entries referencing departed user's pubkey
17. Find all note reply `readerEnvelopes` entries referencing departed user's pubkey
18. Find all message `readerEnvelopes` entries referencing departed user's pubkey
19. For each envelope: remove the departed user's HPKE-wrapped key copy from the JSONB array
20. Progress tracked in `re_encryption_jobs` table — admin can monitor via UI
21. Job is idempotent — safe to retry on failure

Note: Re-encryption here means removing the departed user's envelope copy (their HPKE-wrapped symmetric key), NOT re-encrypting the content itself. The content key stays the same; only the key-wrapping layer changes.

#### Emergency Override Co-Approver

The co-approver must be a *different* user with `erasure:admin` permission in the same hub. The co-approver signs `(targetUserId || timestamp || justification)` with their device Ed25519 key. The server verifies the signature against the co-approver's sigchain-authorized device key. Self-approval (same user as requester) is rejected.

#### Erasure Config

Each hub stores erasure configuration in a dedicated `erasure_config` table:

```
erasure_config:
  hubId: TEXT PK REFERENCES hubs(id) ON DELETE CASCADE
  delayHours: INTEGER NOT NULL DEFAULT 72 (CHECK: 24–168)
  emergencyOverrideEnabled: BOOLEAN NOT NULL DEFAULT true
  updatedAt: TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updatedBy: TEXT NOT NULL
```

The emergency minimum (4h) is a hard-coded constant, not configurable — prevents weakening via config.

Platform admin enforces a minimum delay floor across all hubs via `erasurePlatformFloor.minDelayHours` in platform settings (e.g., "no hub may set delay below 48h").

### Section 2: Remote Device Wipe

#### Trigger Conditions

- Admin executes immediate erasure (`erasure:admin`)
- Admin revokes a specific device via sigchain management
- Self-service erasure delay expires
- User self-revokes a compromised device (if they have another active device)

#### Delivery Mechanism

The server pushes a `device:wipe` event via WebSocket. The payload is signed by the server's Ed25519 key (from `LABEL_SERVER_SIGNING_KEY`):

```typescript
interface DeviceWipeCommand {
  type: 'device:wipe'
  targetDevicePubkey: string
  reason: 'user-erasure' | 'device-revocation' | 'admin-erasure'
  timestamp: string
  serverSignature: string // Ed25519 sig over (targetDevicePubkey || timestamp || reason)
}
```

#### Client-Side Wipe Sequence (all platforms)

1. **Verify** server Ed25519 signature on wipe command (prevents forged wipe attacks)
2. **Destroy keys** — Stronghold vault (desktop), Keychain items (iOS), Keystore + EncryptedSharedPreferences (Android)
3. **Wipe cached data** — decrypted content in memory, local SQLite/CoreData/Room cache, IndexedDB
4. **Wipe app state** — session tokens, sync timestamps, offline message queue
5. **Navigate to revoked screen** — non-dismissable, informs user their access has been revoked, no retry possible

#### Edge Cases

| Scenario | Handling |
|----------|----------|
| App offline | Wipe event queued server-side. On next connection, delivered as first message before any data sync. Server gates all responses behind wipe acknowledgment. |
| App never reconnects | Keys revoked server-side (sigchain terminated, hub keys rotated, envelopes re-encrypted). Device holds stale ciphertext with valid keys but cannot reach server. Active re-encryption (Phase 4) ensures even cached ciphertext becomes useless if keys were extracted. |
| Multiple devices | Wipe is per-device. Each device's WebSocket/push channel gets its own wipe command. Admin can wipe one device while others stay active, or wipe all on full account erasure. |
| Silent push (mobile) | If not connected via WebSocket, APNs (iOS) / FCM (Android) silent push wakes the app to establish connection and receive wipe. Push payload contains no sensitive data — only a "sync required" signal. |

#### Platform Implementation

| Platform | Key Storage Destroyed | Data Cache Wiped | Delivery |
|----------|----------------------|------------------|----------|
| Desktop (Tauri) | Stronghold vault file | localStorage + IndexedDB | WebSocket |
| iOS | Keychain (`kSecAttrAccessibleAfterFirstUnlock`) | CoreData + UserDefaults | WebSocket + silent APNs |
| Android | Keystore + EncryptedSharedPreferences | Room DB + DataStore | WebSocket + silent FCM |

### Section 3: Crypto-Shredding for Audit Log

The existing audit log (`audit_log` table) uses a SHA-256 hash chain for tamper detection. Entries have:
- `actorPubkey` — who performed the action
- `details` — JSONB with action-specific data (may contain pubkeys, hub IDs, etc.)
- `previousEntryHash` + `entryHash` — hash chain links

#### Per-User Audit Envelope Key

**This is a new behavior introduced by EP08.** Existing audit entries (created before EP08) have plaintext `details`. After EP08, new audit entries encrypt the `details` field with the actor's audit key.

Each user gets an audit envelope key — a random 32-byte AES-256-GCM key used to encrypt the `details` JSONB within audit entries that reference this user:

- Generated when the user is first created (or lazily on first audit entry post-EP08)
- When an audit entry is created with `actorPubkey = X`, the `details` field is encrypted with user X's audit key before storage
- The audit key is itself HPKE-wrapped to the platform admins via `LABEL_AUDIT_USER_KEY_WRAP` and stored in `audit_user_keys`
- On erasure: the row in `audit_user_keys` is deleted. Admins can no longer decrypt the `details` in those entries. The `actorPubkey` field is replaced with `[erased]`.
- Pre-EP08 audit entries with plaintext details: on erasure, their `details` field is set to `null` (scrubbed). This is a one-time migration concern, not ongoing.

#### Hash Chain Integrity

The hash chain computes `entryHash = SHA-256(id || action || actorPubkey || details || previousEntryHash || createdAt)`. On erasure:
- The `entryHash` values are NOT modified (chain stays verifiable against original values)
- The `actorPubkey` field IS modified to `[erased]` — this means re-computing the hash from current field values will NOT match `entryHash`
- A new `erasedAt` TIMESTAMPTZ column (nullable) is added to `audit_log`. Non-null indicates this entry was modified by an authorized erasure. The chain verification algorithm skips hash re-verification for entries with `erasedAt` set, preserving tamper detection for all other entries.

This matches the crypto-shredding pattern used by Proton and Wire enterprise (per research findings).

#### New Crypto Label

```json
"LABEL_AUDIT_USER_KEY_WRAP": "llamenos:audit-user-key-wrap:v1"
```

Added to `packages/protocol/crypto-labels.json` and generated via codegen.

### Section 4: Data Retention Purge

#### Distinction from Operational TTL

| System | Purpose | Scope | Timescales |
|--------|---------|-------|------------|
| Operational TTL (`apps/worker/lib/ttl.ts`) | Clean up ephemeral operational data | Captchas, rate limits, provision rooms, invites | Minutes to days |
| Data Retention (this section) | Delete long-lived business records | Call records, notes, messages, audit entries | 30 days to 10 years |
| Storage Retention (`hubStorageSettings`) | S3 lifecycle on blob storage | Uploaded files per namespace | Days |

#### Retention Settings Table

```sql
CREATE TABLE retention_settings (
  hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'call_records' | 'notes' | 'messages' | 'audit_log'
  retention_days INTEGER NOT NULL, -- 30–3650
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL, -- pubkey of admin who set it
  PRIMARY KEY (hub_id, category)
);

CREATE TABLE retention_platform_floors (
  category TEXT PRIMARY KEY, -- same categories
  min_retention_days INTEGER NOT NULL, -- platform-enforced minimum
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL
);
```

#### Retention Categories

| Category | What gets purged | Default (no config) |
|----------|-----------------|---------------------|
| `call_records` | `call_records` + `call_legs` older than N days | No auto-purge |
| `notes` | `notes` + `note_replies` older than N days | No auto-purge |
| `messages` | `messages` (via `conversations.hubId` join) older than N days | No auto-purge |
| `audit_log` | `audit_log` entries older than N days | No auto-purge |

Default behavior: no automatic purge unless explicitly configured. This is intentional — data destruction should be an active choice, not a default.

#### Platform Floor Enforcement

Hub admins cannot set retention shorter than the platform floor:
- API validates: `hub_retention_days >= platform_floor_days`
- If a platform admin raises the floor above existing hub settings, those hubs are grandfathered until their next edit (no retroactive enforcement)

#### Purge Cron Job

- Runs daily at 03:00 UTC (configurable via platform settings)
- For each hub with retention settings: delete records older than `NOW() - retention_days`
- Cascade: deleting a note deletes its replies (FK cascade). Deleting a call record deletes its legs.
- Audit entry logged when purge executes and records are deleted (with count per category)
- Idempotent — safe to run multiple times

### Section 5: Cross-Hub Ban Management

#### Current State

The `bans` table has `hubId TEXT` — nullable, but currently always set to a specific hub. Bans are per-hub.

#### Platform-Scoped Bans

A ban with `hubId = NULL` applies across ALL hubs. When checking if a caller is banned:

```sql
SELECT 1 FROM bans
WHERE phone_hash = $1
AND (hub_id = $2 OR hub_id IS NULL)
LIMIT 1
```

This requires no schema change — just query adjustment and new routes.

#### New Routes

```
GET    /bans/platform         -- list platform-scoped bans (requires bans:read-platform)
POST   /bans/platform         -- create platform-scoped ban (requires bans:create-platform)
DELETE /bans/platform/:id     -- remove platform-scoped ban (requires bans:delete-platform)
POST   /bans/platform/bulk    -- bulk import platform bans (requires bans:create-platform)
GET    /bans/platform/search  -- search across all bans (hub + platform) by phone hash
```

#### Promotion

Hub admins with `bans:create-platform` can "promote" a hub-scoped ban to platform scope (creates a new platform ban from the same phone hash). This is the workflow when a harasser targets multiple numbers.

### Section 6: Platform Settings

Platform settings extend the existing `systemSettings` singleton table with new JSONB columns:

#### New Settings Fields

```typescript
interface PlatformSettings {
  // Feature flags — consolidates existing scattered boolean columns into one JSONB
  // Migration: read from existing columns, write to featureFlags, drop old columns in follow-up
  featureFlags: {
    mlsEnabled: boolean          // MLS group messaging (default: false)
    transcriptionEnabled: boolean // migrated from systemSettings.transcription_enabled
    caseManagementEnabled: boolean // migrated from systemSettings.case_management_enabled
    crossHubSharingEnabled: boolean // migrated from systemSettings.cross_hub_sharing_enabled
  }

  // Branding
  branding: {
    instanceName: string         // e.g., "Llamenos Crisis Network"
    supportEmail: string
    privacyPolicyUrl: string
  }

  // Session policy
  sessionPolicy: {
    maxSessionDurationHours: number  // force re-auth after N hours (default: 720 = 30d)
    maxInactiveHours: number         // logout after inactivity (default: 168 = 7d)
  }

  // Erasure platform floor
  erasurePlatformFloor: {
    minDelayHours: number        // minimum erasure delay any hub can set (default: 24)
  }

  // Retention purge schedule
  retentionPurge: {
    cronHourUtc: number          // hour of day to run purge (default: 3)
    enabled: boolean             // master kill switch (default: true)
  }
}
```

#### Routes

```
GET   /settings/platform       -- read platform settings (requires system:manage-instance)
PATCH /settings/platform       -- update platform settings (requires system:manage-instance)
```

Platform settings UI is desktop-only (requires `system:manage-instance` — super admin with desktop access).

### Section 7: i18n

New keys added to `packages/i18n/locales/` across all 13 locales:

#### Namespaces

| Namespace | Approximate Keys | Used By |
|-----------|-----------------|---------|
| `erasure.*` | ~25 | Self-service erasure UI, admin erasure queue, confirmation dialogs, status labels |
| `retention.*` | ~12 | Retention config UI, purge status, category labels |
| `platformBans.*` | ~10 | Cross-hub ban management, promotion dialog |
| `platformSettings.*` | ~15 | Platform settings section labels |
| `deviceWipe.*` | ~5 | Revoked device screen |

Total: ~102 new keys across 13 locales.

### Section 8: New DB Tables Summary

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `erasure_requests` | Erasure request lifecycle | userId, requestedAt, executeAt, status, requestedBy, justification, emergencyOverride, coApproverPubkey, coApproverSignature |
| `erasure_config` | Per-hub erasure delay config | hubId (PK), delayHours, emergencyOverrideEnabled, updatedAt, updatedBy |
| `re_encryption_jobs` | Track envelope re-encryption progress | id, userId, hubId, status, totalEnvelopes, processedEnvelopes, startedAt, completedAt |
| `retention_settings` | Per-hub data retention config | (hubId, category) PK, retentionDays, updatedAt, updatedBy |
| `retention_platform_floors` | Platform-enforced minimum retention | category PK, minRetentionDays, updatedAt, updatedBy |
| `audit_user_keys` | Per-user audit envelope keys (HPKE-wrapped) | userPubkey PK, encryptedKey, adminEnvelopes (JSONB), createdAt |

**Modified existing tables:**

| Table | Change |
|-------|--------|
| `audit_log` | Add `erasedAt TIMESTAMPTZ` nullable column (marks entries modified by authorized erasure) |
| `users` | Add `erased` as valid status value |

### Section 9: New Crypto Labels

Added to `packages/protocol/crypto-labels.json`:

```json
"LABEL_AUDIT_USER_KEY_WRAP": "llamenos:audit-user-key-wrap:v1",
"LABEL_ERASURE_OVERRIDE_SIG": "llamenos:erasure-override-sig:v1"
```

### Section 10: API Routes Summary

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/erasure/me` | `erasure:request-self` | Check own erasure request status |
| POST | `/erasure/me` | `erasure:request-self` | Create self-erasure request |
| DELETE | `/erasure/me` | `erasure:request-self` | Cancel pending self-erasure |
| GET | `/erasure/requests` | `erasure:admin` | List all erasure requests (filterable by status) |
| POST | `/erasure/:userId` | `erasure:admin` | Admin immediate erasure |
| POST | `/erasure/:userId/wipe-device/:devicePubkey` | `erasure:admin` | Remote wipe specific device |
| GET | `/retention` | `retention:manage` | Get hub retention settings |
| PATCH | `/retention` | `retention:manage` | Update hub retention settings |
| GET | `/retention/platform-floors` | `system:manage-instance` | Get platform retention floors |
| PATCH | `/retention/platform-floors` | `system:manage-instance` | Update platform retention floors |
| GET | `/bans/platform` | `bans:read-platform` | List platform-scoped bans |
| POST | `/bans/platform` | `bans:create-platform` | Create platform ban |
| DELETE | `/bans/platform/:id` | `bans:delete-platform` | Remove platform ban |
| POST | `/bans/platform/bulk` | `bans:create-platform` | Bulk import platform bans |
| GET | `/bans/platform/search` | `bans:read-platform` | Search all bans (hub + platform) |
| GET | `/settings/platform` | `system:manage-instance` | Read platform settings |
| PATCH | `/settings/platform` | `system:manage-instance` | Update platform settings |

### Section 11: Platform Matrix

| Feature | Desktop | iOS | Android | Backend |
|---------|---------|-----|---------|---------|
| Erasure self-service | Full | Full | Full | Routes + service + cron |
| Erasure admin queue | Full | Full | Full | Routes + service |
| Remote device wipe (receive) | Full | Full | Full | WebSocket push |
| Remote device wipe (trigger) | Full | Full | Full | Admin UI |
| Re-encryption monitoring | Full | Full | Full | Background job |
| Retention config (hub) | Full | Full | Full | Routes + cron |
| Retention floors (platform) | Full | Desktop only | Desktop only | Routes |
| Cross-hub bans | Full | Full | Full | Routes |
| Platform settings | Full | Desktop only | Desktop only | Routes |

Hub-scoped features are fully functional on mobile (hub admins work from the field). Platform-scoped features requiring `system:manage-instance` are desktop-only.

### Section 12: EP09 Interaction (Recovery Group Cascade)

When a user is erased:

1. Delete all `user_recovery_envelopes` for this user (their KEK wrapped under recovery group key)
2. If the user holds Shamir shares for other users' recovery groups:
   - Mark their share as invalidated in `hub_recovery_group_shares`
   - If remaining valid shares < threshold: flag the recovery group as degraded (admin alert)
   - Admin must re-deal the recovery group excluding the departed user
3. If the user has active `recovery_sessions` (was in the process of being recovered): cancel those sessions

### Section 13: Test Strategy

**Backend BDD:**
- Erasure request lifecycle (create, cancel, expire, execute)
- Admin immediate erasure with full cascade verification
- Emergency override validation (co-approver signature, 4h floor)
- Retention purge (per-hub, respects platform floors)
- Cross-hub ban creation, search, promotion from hub scope
- Permission enforcement on all routes

**Desktop Playwright E2E:**
- Self-service erasure request flow (request, see countdown, cancel)
- Admin erasure queue (list, filter by status, execute with justification)
- Retention settings UI (configure per-hub, validate against platform floor)
- Platform ban management (create, search, promote)
- Remote device wipe (verify revoked screen appears)

**iOS XCUITest + Android Compose UI:**
- Self-service erasure flow
- Admin erasure queue
- Retention config
- Cross-hub ban management
- Device wipe receipt (revoked screen)

**Crypto unit tests (Rust):**
- Audit user key generation, wrapping, destruction
- Crypto-shredding verification (key destroyed → decryption fails)
- Erasure override signature verification

**Integration:**
- Full erasure cascade end-to-end: create user, create notes/messages, erase user, verify all envelope copies removed, verify re-encryption completed, verify audit crypto-shred, verify device wipe delivery

**Adversarial:**
- Attempt to decrypt after erasure (must fail)
- Attempt to access server after sigchain termination (must fail)
- Attempt erasure with expired/invalid co-approver signature (must reject)
- Attempt to set retention below platform floor (must reject)
- Replay attack on device wipe command (timestamp + signature verification)
