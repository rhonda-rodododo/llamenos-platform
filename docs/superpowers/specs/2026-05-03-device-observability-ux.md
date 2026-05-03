# Device Management & Observability UX

## Current State

### Crypto Foundation (Complete)

The Rust crypto layer in `packages/crypto/` provides all primitives needed for device management:

- **Per-device keys** (`device_keys.rs`): Ed25519 signing + X25519 encryption keypairs per device, Argon2id-encrypted with user PIN/passphrase. `DeviceKeyState` tracks `deviceId`, `signingPubkeyHex`, `encryptionPubkeyHex`.
- **Sigchain** (`sigchain.rs`): Append-only hash-chained device authorization log. Link types: `user_init`, `device_add`, `device_remove`, `puk_rotate`, `hub_membership_change`. Full chain verification (sequence, hash linkage, signer membership, Ed25519 signatures).
- **Provisioning** (`provisioning.rs`): ECDH ephemeral key agreement for device linking. XChaCha20-Poly1305 encryption of nsec, HKDF-derived 6-digit SAS code for MITM protection.
- **PUK** (`puk.rs`): Per-User Key with Cascading Lazy Key Rotation (CLKR). Seed HPKE-wrapped per-device. Rotation re-seals to remaining devices, creates chain link for historical decryption.
- **Auth tokens** (`auth.rs`): Per-device Ed25519 signatures bound to `timestamp:method:path` for replay-resistant API auth.

### Backend API (Complete)

| Route file | Endpoints | Purpose |
|------------|-----------|---------|
| `apps/worker/routes/devices.ts` | `GET /api/devices`, `POST /api/devices/register`, `POST/DELETE /api/devices/voip-token`, `DELETE /api/devices/:id`, `DELETE /api/devices` | Device CRUD, push token management |
| `apps/worker/routes/sigchain.ts` | `GET /api/users/:pk/sigchain`, `POST /api/users/:pk/sigchain` | Sigchain read/append |
| `apps/worker/routes/webauthn.ts` | 6 endpoints (login/register options+verify, list/delete credentials) | WebAuthn passkey lifecycle |
| `apps/worker/routes/provisioning.ts` | `POST /api/provisioning/rooms`, `GET/POST /api/provisioning/rooms/:id` | Ephemeral device linking relay |
| `apps/worker/routes/puk.ts` | `POST /api/puk/envelopes`, `GET /api/puk/envelopes/:deviceId` | PUK distribution to devices |
| `apps/worker/routes/mls.ts` | 4 endpoints under `/api/hubs/:hubId/mls/` | MLS message routing per device |

Key service: `apps/worker/services/identity.ts` handles device registration with LRU eviction (max 5 devices), session creation (8h sliding expiry, 1h renewal threshold), WebAuthn credential management.

Key service: `apps/worker/services/crypto-keys.ts` handles sigchain append with sequence/hash validation, PUK envelope distribution, MLS message queuing.

### Database Schema (Partial)

**What's tracked** (`apps/worker/db/schema/users.ts`):

| Table | Columns | Gaps |
|-------|---------|------|
| `devices` | id, pubkey, platform, pushToken, voipToken, wakeKeyPublic, ed25519Pubkey, x25519Pubkey, registeredAt, lastSeenAt | No device name, model, OS version, IP, app version, locale |
| `sessions` | token, pubkey, createdAt, expiresAt, deviceInfo (JSONB, undefined schema) | deviceInfo never populated, no IP tracking |
| `webauthn_credentials` | credentialId, publicKey, counter, transports, backedUp, label, createdAt, lastUsedAt | Good - label and lastUsedAt exist |
| `sigchain_links` | id, userPubkey, seqNo, linkType, payload, signature, prevHash, hash, createdAt | Complete |
| `puk_envelopes` | id, userPubkey, deviceId, generation, envelope, createdAt | Complete |
| `provision_rooms` | id, ephemeralPubkey, encryptedNsec, primaryPubkey, token, status, createdAt | Complete |

Security preferences (`userSecurityPrefs`): `alertOnNewDevice`, `alertOnPasskeyChange`, `alertOnPinChange` flags exist but are not wired to any notification delivery.

### Client UI (Major Gaps)

**Desktop** (`src/client/`):
- Device linking works in both directions (new device via `link-device.tsx`, primary via `settings.tsx` `LinkDeviceSection`)
- WebAuthn passkey registration/deletion exists in settings
- Key manager (`key-manager.ts`) handles lock/unlock, idle timeout (5min), tab visibility grace (30s)
- **No device list view, no device revocation UI, no sigchain visualization, no session management UI**

**iOS** (`apps/ios/`):
- Device linking flow complete: QR scanning, ECDH, SAS verification, SSRF-protected relay validation
- **No device list, no device revocation, no session view**

**Android** (`apps/android/`):
- Device linking state machine and UI scaffolded (QR scanning via CameraX + ML Kit)
- **Relay connection is MOCKED** — no live WebSocket, no real ECDH, no production import
- **No device list, no device revocation, no session view**

### What's Completely Missing

1. **Device inventory UI** — no platform shows linked devices
2. **Device revocation** — backend `DELETE /api/devices/:id` exists but no UI calls it; no sigchain `device_remove` link created on revocation
3. **Session observability** — `sessions` table has `deviceInfo` JSONB but it's never populated; no UI to view/terminate sessions
4. **Device metadata** — no name, model, OS, IP, app version tracked
5. **Admin device oversight** — no admin view of users' devices
6. **Login/auth history** — no audit trail of successful/failed logins
7. **Push delivery observability** — two-tier push dispatch exists but no delivery status tracking per device
8. **Security alerts** — `alertOnNewDevice` pref exists but nothing sends the alert

---

## Proposed Features

### Tier 1: Essential (Pre-Launch)

These are the minimum viable device management features needed before users trust their sensitive data to the app.

#### T1.1 — Device List View

Show all linked devices for the current user on all platforms.

**Data source**: `GET /api/devices` (already exists) + new metadata fields.

**Per-device display**:
- Device name (user-editable label, e.g., "Work Laptop")
- Platform icon (iOS / Android / Desktop)
- Device model (e.g., "iPhone 15 Pro", "Pixel 8", "Linux Desktop")
- Last seen (relative timestamp, e.g., "2 minutes ago")
- Current device highlighted with "(this device)" badge
- Trust indicator: sigchain-verified vs. push-only registration
- PUK generation: which generation this device has (shows if out of date)

**New DB columns on `devices`**:
- `deviceName` (text, nullable) — user-assigned label
- `deviceModel` (text, nullable) — auto-detected hardware model
- `osVersion` (text, nullable) — e.g., "iOS 18.2", "Android 15"
- `appVersion` (text, nullable) — app build version
- `lastIpHash` (text, nullable) — HMAC(IP, server_secret) for anomaly detection without storing raw IPs

#### T1.2 — Device Revocation

One-tap removal of any device from any other trusted device.

**Flow**:
1. User taps "Remove" on a device in the device list
2. Confirmation dialog: "Remove [Device Name]? This device will be signed out and lose access to encrypted content."
3. On confirm:
   a. Create `device_remove` sigchain link (signed by current device)
   b. `DELETE /api/devices/:id` (already exists)
   c. Rotate PUK (exclude removed device from re-sealing)
   d. Rotate hub keys for all hubs the user is a member of
   e. Push security notification to remaining devices
4. Revoked device: on next API call, receives 401; on next key unlock, detects sigchain revocation and shows "This device has been removed" screen

**New endpoint**: `POST /api/devices/:id/revoke` — orchestrates sigchain append + device deletion + PUK rotation in a transaction.

#### T1.3 — Active Session Management

Show and manage WebAuthn sessions.

**Per-session display**:
- Device that created the session (link to device if known)
- Created time, expires time, last activity
- "End Session" button (except current session)
- "End All Other Sessions" button

**New endpoints**:
- `GET /api/sessions` — list active sessions for current user (filter expired)
- `DELETE /api/sessions/:token` — terminate specific session
- `DELETE /api/sessions` — terminate all sessions except current

**Populate `deviceInfo` JSONB**: On session creation, capture `{ deviceId, platform, userAgent, ipHash }` from the auth context. This links sessions to devices.

#### T1.4 — WebAuthn Credential Management (Enhancement)

The backend already supports list/delete. Enhance the UI:

- Rename credentials (label editing — backend already stores `label`)
- Show last used time (already tracked as `lastUsedAt`)
- Show backup status (already tracked as `backedUp`)
- Show credential count warning if only 1 credential registered

#### T1.5 — Security Event Notifications

Wire up the existing `alertOnNewDevice`, `alertOnPasskeyChange`, `alertOnPinChange` preferences.

**Events that trigger alerts**:
- New device added (sigchain `device_add`)
- Device removed (sigchain `device_remove`)
- New WebAuthn credential registered
- WebAuthn credential deleted
- PUK rotated
- Session created from new device
- Failed login attempt (WebAuthn verification failure)

**Delivery channels** (per existing `userSecurityPrefs.notificationChannel`):
- In-app push notification (wake-tier encrypted)
- Signal message (via `signal-notifier/` sidecar)

**New table**: `security_events`
- `id`, `userPubkey`, `eventType`, `deviceId` (nullable), `metadata` (JSONB), `ipHash`, `createdAt`
- Append-only log, never deleted (admin audit trail)

---

### Tier 2: Observability (Post-Launch)

#### T2.1 — Login & Auth History

User-facing "Recent Activity" view (since we have no IDP to provide this).

**Display**:
- Successful logins: time, device, method (PIN vs WebAuthn), coarse location (country/region from IP, resolved at request time, NOT stored)
- Failed attempts: time, method, reason (wrong PIN, unknown credential)
- Security events: device added/removed, PUK rotation, credential changes

**Data source**: `security_events` table from T1.5 + existing audit log entries.

**Privacy**: Raw IPs never stored. `ipHash` for anomaly grouping. Coarse geo resolved on-the-fly from current IP for display only, never persisted.

#### T2.2 — Session Anomaly Detection

Flag suspicious sessions based on heuristics:

- **New device**: first session from a device not in sigchain
- **Unusual timing**: login outside user's normal hours (requires 2+ weeks of baseline)
- **IP anomaly**: `ipHash` differs from last 5 sessions
- **Concurrent sessions**: more than 3 active sessions simultaneously
- **Rapid geo-shift**: if coarse location changes impossibly fast between sessions

**Implementation**: Background job that runs on session creation. Suspicious sessions flagged in `security_events` with `eventType: 'session_anomaly'`. Alert sent via T1.5 notification pipeline.

**No auto-block**: Anomalies are informational. Users/admins decide to act. Auto-blocking is dangerous for crisis workers who may legitimately need urgent access from unusual locations.

#### T2.3 — Admin Device Oversight

Admin dashboard showing aggregate device health across all users.

**Views**:
- Per-user device count and last-seen (sortable, filterable)
- Users with 0 active devices (abandoned accounts)
- Users with 5 devices (at capacity — may need to revoke old ones)
- Users not seen in >30 days (configurable threshold)
- Users with unrotated PUK (stale generation)
- Device platform distribution (iOS vs Android vs Desktop pie chart)

**Alerts** (configurable by admin):
- User exceeds N devices
- User not seen in N days
- Push delivery failure rate > threshold for a user

**New endpoint**: `GET /api/admin/devices/overview` — aggregated device stats (admin-only, `users:manage` permission).

#### T2.4 — Push Notification Delivery Status

Track push delivery outcomes per device.

**New table**: `push_delivery_log`
- `id`, `deviceId`, `notificationType`, `tier` (wake/full), `status` (sent/delivered/failed), `error`, `apnsId` or `fcmMessageId`, `createdAt`

**Display per device** (in device detail view):
- Last successful push delivery time
- Recent failure count
- Stale token indicator (N consecutive failures)

**Admin view**: delivery success rate per user, per platform, per notification type.

#### T2.5 — WebAuthn Credential Usage Log

Track every WebAuthn authentication attempt.

**Extend `security_events`** with:
- `eventType: 'webauthn_auth_success'` / `'webauthn_auth_failure'`
- `metadata: { credentialId, counter, rpId }`

**Display**: In credential detail view, show usage history (last 10 authentications).

---

### Tier 3: Advanced (Future)

#### T3.1 — Sigchain Visualization

Interactive timeline/graph of the user's sigchain.

**Display**:
- Vertical timeline with each sigchain link as a node
- Node types color-coded: genesis (green), device_add (blue), device_remove (red), puk_rotate (yellow)
- Each node shows: timestamp, signing device, affected device, sequence number
- Hash chain visualized as connecting lines between nodes
- Expand node for full payload details

**Implementation**: Client-side rendering from `GET /api/users/:pk/sigchain`. No new backend work. Desktop uses a React timeline component; mobile uses native equivalents.

#### T3.2 — Device Health Dashboard

Per-device health metrics for power users and admins.

**Metrics**:
- Key age: how long since device keys were generated
- PIN age: how long since PIN was last changed (requires new `pinChangedAt` field)
- PUK generation: is this device on the latest generation?
- Push token freshness: last time the push token was refreshed
- Sigchain participation: last time this device signed a sigchain entry
- App version: is this device on the latest app version?

**Health score**: Simple traffic light (green/yellow/red) per device based on thresholds:
- Red: PUK >2 generations behind, or push token failing, or app version >2 major behind
- Yellow: key age >1 year, or PIN age >6 months, or PUK 1 generation behind
- Green: everything current

#### T3.3 — Lost Device Recovery Flow

Guided wizard when a user reports a lost device.

**Steps**:
1. User identifies lost device from device list on any remaining device
2. Immediate revocation (T1.2 flow)
3. PUK rotation (automatic, part of revocation)
4. Hub key rotation for all hubs (automatic, part of revocation)
5. Option to end all sessions (T1.3)
6. Option to change PIN on remaining devices
7. Confirmation: "Lost device can no longer decrypt any new content"

**Edge case — all devices lost**:
1. User contacts admin
2. Admin verifies identity out-of-band (in person, known phone number, etc.)
3. Admin creates a "recovery invite" — special invite code that bootstraps a fresh device
4. User provisions new device with recovery invite
5. New sigchain starts (genesis link) — old sigchain terminated
6. All historical encrypted content is LOST (this is the correct security behavior; explain clearly in the UI)

#### T3.4 — Notification Channel Health

Per-user dashboard showing which notification channels are working.

**Channels**:
- Push (APNs/FCM): last successful delivery, failure count
- Signal: registration status, last message sent, delivery receipt
- SMS: delivery status (if configured)
- WebSocket: current connection status, last ping

**Display**: Grid of channels with green/red/gray indicators. Gray = not configured. Red = last delivery failed. Green = working.

#### T3.5 — Cross-Device Key Sync Status

Show PUK envelope distribution status across devices.

**Display per device**:
- Current PUK generation held by this device
- Whether an undelivered envelope is pending
- CLKR chain completeness (can this device decrypt all generations?)

**Use case**: Debugging why a device can't decrypt old notes — may be missing CLKR chain links.

---

## UX Design

### Desktop (Tauri)

**Settings > Devices** (new section, between existing sections):

```
+-------------------------------------------------+
| Devices                                    [+]  |
+-------------------------------------------------+
| * This device                                   |
|   Linux Desktop            Last active: now     |
|   PUK gen 3 | App v2.1.0                       |
|                                                  |
|   iPhone 15 Pro (Work Phone)                    |
|   iOS 18.2                 Last active: 5m ago  |
|   PUK gen 3 | App v2.1.0          [Remove]     |
|                                                  |
|   Pixel 8 (Personal)                            |
|   Android 15               Last active: 2h ago  |
|   PUK gen 3 | App v2.0.5          [Remove]     |
+-------------------------------------------------+
```

Tapping a device expands a detail panel:
- Ed25519 pubkey fingerprint (truncated, with copy button)
- Registration date
- Sigchain verification status (green checkmark if device_add link exists)
- Push delivery status (last success/failure)
- "Rename" inline edit for device name
- "Remove Device" destructive button with confirmation

**Settings > Sessions** (new section):

```
+-------------------------------------------------+
| Active Sessions                                  |
+-------------------------------------------------+
|   Current session                                |
|   Started: 2h ago | Expires: 6h      [Active]  |
|                                                  |
|   iPhone 15 Pro (Work Phone)                    |
|   Started: 1d ago | Expires: 7h     [End]      |
|                                                  |
|   Unknown device                                 |
|   Started: 3d ago | Expires: 5h     [End]      |
|                                                  |
| [End All Other Sessions]                         |
+-------------------------------------------------+
```

**Settings > Security** (enhanced):

```
+-------------------------------------------------+
| Security Alerts                                  |
|  [x] Alert on new device                        |
|  [x] Alert on passkey change                    |
|  [x] Alert on PIN change                        |
|  Delivery: [Push v] [Signal v]                  |
+-------------------------------------------------+
| Recent Activity                      [View All]  |
|  - New session from iPhone (2h ago)              |
|  - Passkey registered (1d ago)                   |
|  - PUK rotated (3d ago)                          |
+-------------------------------------------------+
```

### iOS (SwiftUI)

**Settings > Devices**:
- `List` with `ForEach` over devices
- Current device pinned to top with `.listRowBackground(.accentColor.opacity(0.1))`
- Swipe to delete (triggers revocation flow with confirmation)
- Tap for detail sheet (same info as desktop detail panel)
- Pull to refresh

**Settings > Sessions**:
- Similar list layout
- "End Session" via swipe or detail view
- "End All Other Sessions" as a destructive button at bottom

**Settings > Security > Recent Activity**:
- Chronological list with section headers by date
- Event type icons (device, key, session, warning)
- Tap for detail (full event metadata)

### Android (Compose)

**Settings > Devices**:
- `LazyColumn` with `Card` per device
- Current device card with `MaterialTheme.colorScheme.primaryContainer` background
- Long-press or menu for revocation
- Tap for detail bottom sheet

**Settings > Sessions & Security**: Same patterns as iOS, using Material 3 components.

---

## API Design

### New Endpoints

```
POST   /api/devices/:id/revoke
  Auth: required (must own device OR admin)
  Body: { confirm: true }
  Response: 200 { sigchainLink: SigchainLink, pukRotated: boolean }
  Side effects:
    1. Append device_remove sigchain link
    2. DELETE device record
    3. Rotate PUK (exclude revoked device)
    4. Trigger hub key rotation for all user's hubs
    5. Create security_event
    6. Push notification to remaining devices

PATCH  /api/devices/:id
  Auth: required (must own device)
  Body: { deviceName?: string }
  Response: 200 { device: Device }

GET    /api/sessions
  Auth: required
  Response: 200 { sessions: Session[] }
  Session: { token (truncated), deviceId, platform, createdAt, expiresAt, lastActivity, isCurrent }

DELETE /api/sessions/:token
  Auth: required (must own session)
  Response: 200 { ok: true }

DELETE /api/sessions/others
  Auth: required
  Response: 200 { terminated: number }

GET    /api/security-events
  Auth: required
  Query: { limit?: number, offset?: number, type?: string }
  Response: 200 { events: SecurityEvent[], total: number }
  SecurityEvent: { id, eventType, deviceId?, metadata, ipHash?, createdAt }

GET    /api/admin/devices/overview
  Auth: required (users:manage permission)
  Response: 200 { users: AdminDeviceOverview[] }
  AdminDeviceOverview: { pubkey, displayName, deviceCount, lastSeenAt, oldestPukGeneration, latestPukGeneration }

GET    /api/admin/security-events
  Auth: required (users:manage permission)
  Query: { limit, offset, type, userPubkey? }
  Response: 200 { events: SecurityEvent[], total: number }
```

### Modified Endpoints

```
POST   /api/devices/register
  Add to body: { ..., deviceName?, deviceModel?, osVersion?, appVersion? }
  Add to logic: compute ipHash from request IP, update lastSeenAt

GET    /api/devices
  Add to response per device: { ..., deviceName, deviceModel, osVersion, appVersion, lastIpHash, isCurrent }

POST   /webauthn/login/verify
  Add to logic: populate session.deviceInfo, create security_event

POST   /webauthn/register/verify
  Add to logic: create security_event
```

### New Zod Schemas (in `packages/protocol/schemas/`)

```typescript
// device-management.ts
const deviceMetadataSchema = z.object({
  deviceName: z.string().max(64).optional().default(''),
  deviceModel: z.string().max(128).optional().default(''),
  osVersion: z.string().max(64).optional().default(''),
  appVersion: z.string().max(32).optional().default(''),
})

const revokeDeviceBodySchema = z.object({
  confirm: z.literal(true),
})

const revokeDeviceResponseSchema = z.object({
  sigchainSeqNo: z.number().int(),
  pukGeneration: z.number().int(),
})

const securityEventSchema = z.object({
  id: z.uuid(),
  eventType: z.enum([
    'device_add', 'device_remove', 'puk_rotate',
    'webauthn_register', 'webauthn_delete',
    'webauthn_auth_success', 'webauthn_auth_failure',
    'session_create', 'session_terminate',
    'session_anomaly', 'pin_change',
  ]),
  deviceId: z.uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  createdAt: z.string().datetime(),
})

const securityEventsResponseSchema = z.object({
  events: z.array(securityEventSchema),
  total: z.number().int(),
})

const sessionResponseSchema = z.object({
  tokenPrefix: z.string(), // first 8 chars for identification
  deviceId: z.uuid().optional(),
  platform: z.string().optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  isCurrent: z.boolean(),
})

const adminDeviceOverviewSchema = z.object({
  pubkey: z.string(),
  displayName: z.string(),
  deviceCount: z.number().int(),
  lastSeenAt: z.string().datetime().optional(),
  pukGeneration: z.number().int().optional(),
  platformBreakdown: z.record(z.string(), z.number().int()),
})
```

---

## Security Considerations

### What Users Can See vs. What Admins Can See

| Data | User (own devices) | Admin |
|------|-------------------|-------|
| Device list (own) | Full detail | Full detail |
| Device list (other users) | No | Count + last seen + platform only |
| Session list (own) | Full detail | No (sessions are user-private) |
| Security events (own) | Full history | Full history + cross-user queries |
| Sigchain (own) | Full chain | Full chain |
| Sigchain (others) | No | Read-only (already implemented) |
| IP information | Never raw — coarse location on-the-fly display only | Same — `ipHash` for correlation, never raw |
| Push delivery status | Own devices | All users (aggregate) |

### IP Handling

**Principle**: Never store raw IP addresses.

- `ipHash = HMAC-SHA256(IP, SERVER_HMAC_SECRET)` — stored for anomaly grouping
- Coarse geo (country/region) resolved at request time via MaxMind GeoLite2 or similar, displayed but NEVER persisted
- IP hash rotation: if `SERVER_HMAC_SECRET` rotates, old hashes become unlinkable (acceptable — anomaly detection resets)

### Rate Limiting on Device Management Actions

| Action | Limit | Window | Scope |
|--------|-------|--------|-------|
| Device revocation | 3 | 1 hour | Per user |
| Session termination | 10 | 1 hour | Per user |
| Device rename | 10 | 1 hour | Per user |
| Device registration | 5 | 1 hour | Per user |
| WebAuthn registration | 3 | 1 hour | Per user |
| Failed login attempts | 10 | 15 min | Per IP hash |
| Security event query | 30 | 1 minute | Per user |
| Admin device overview | 10 | 1 minute | Per admin |

### Sensitive Operations Requiring Confirmation

These actions require an active PIN unlock or fresh WebAuthn assertion (not just a valid session token):

- Device revocation
- "End All Other Sessions"
- Changing security alert preferences
- Admin-assisted recovery

### Information Leakage Prevention

- Device model and OS version are self-reported by the client — never trust for security decisions, only for display
- Push tokens are opaque to the user — never expose APNs/FCM tokens in the UI
- Sigchain signatures are shown as truncated fingerprints, not full hex
- Admin device overview shows aggregate counts, not individual device details of other users
- Security events strip internal metadata (server IDs, internal error details) before returning to clients

---

## Implementation Plan

### Phase 1: Schema & Backend (Tier 1) — ~3 days

1. **DB migrations**:
   - Add `deviceName`, `deviceModel`, `osVersion`, `appVersion`, `lastIpHash` to `devices` table
   - Populate `sessions.deviceInfo` JSONB on session creation
   - Create `security_events` table
   - Add indexes for security event queries

2. **New Zod schemas** in `packages/protocol/schemas/device-management.ts`

3. **Run codegen** for Swift + Kotlin types

4. **New/modified routes**:
   - `POST /api/devices/:id/revoke` (orchestrated transaction)
   - `PATCH /api/devices/:id` (device rename)
   - `GET /api/sessions`, `DELETE /api/sessions/:token`, `DELETE /api/sessions/others`
   - `GET /api/security-events`
   - Modify `POST /api/devices/register` to accept + store new metadata
   - Modify `GET /api/devices` to return new fields

5. **Security event emission**: Wire up event creation in existing flows (WebAuthn auth, device register, sigchain append)

6. **Wire security alert preferences**: On security event creation, check `userSecurityPrefs.alertOnNewDevice` etc. and dispatch push/Signal notification

### Phase 2: Desktop UI (Tier 1) — ~2 days

1. **Device list component**: New settings section with device cards
2. **Device detail panel**: Expandable card with full metadata + rename + revoke
3. **Session list component**: Active sessions with "End" buttons
4. **Security events feed**: Recent activity list in Security settings section
5. **Confirmation dialogs**: For revocation and "End All Sessions"

### Phase 3: Mobile UI (Tier 1) — ~3 days (parallel iOS + Android)

1. **iOS**: Device list view, session list view, security events view in Settings
2. **Android**: Same views using Compose + Material 3
3. **Both**: Device metadata reporting on registration (`deviceModel`, `osVersion`, `appVersion`)

### Phase 4: Observability (Tier 2) — ~4 days

1. **Login history view**: Desktop + mobile
2. **Session anomaly detection**: Background service with configurable heuristics
3. **Admin device overview**: New admin dashboard section
4. **Push delivery logging**: `push_delivery_log` table + per-device display

### Phase 5: Advanced (Tier 3) — ~5 days

1. **Sigchain visualization**: React timeline component + native equivalents
2. **Device health dashboard**: Health score computation + display
3. **Lost device wizard**: Guided multi-step flow
4. **Notification channel health**: Cross-channel status grid

---

## Decisions to Review

### D1: How much device metadata to store?

**Chosen**: Store `deviceName`, `deviceModel`, `osVersion`, `appVersion`, `lastIpHash`. No raw IPs, no precise geo, no hardware serial.

**Alternative A — Minimal**: Only store platform + push token (current state). Pro: minimal data. Con: users can't distinguish devices, no observability.

**Alternative B — Rich**: Store device serial, precise GPS, raw IP, carrier info. Pro: maximum observability. Con: massive privacy risk for a security-sensitive app protecting against well-funded adversaries.

**Tradeoff**: We chose a middle ground. Device model and OS version help users identify their devices. IP hash enables anomaly detection without storing PII. App version enables upgrade nudges. Everything is self-reported — never trusted for security.

### D2: IP handling — hash vs. discard?

**Chosen**: HMAC hash with server secret. Enables anomaly grouping without storing raw IPs.

**Alternative A — Discard entirely**: Pro: zero IP data. Con: no ability to detect "login from new network" anomalies.

**Alternative B — Store raw for N days, then delete**: Pro: enables geo display. Con: raw IPs are PII, GDPR risk, and a honeypot for adversaries targeting our users.

**Tradeoff**: Hashing preserves the grouping property (same IP → same hash) without reversibility. We resolve geo on-the-fly for display but never persist it. If the HMAC secret rotates, old hashes become unlinkable — acceptable tradeoff.

### D3: Session visibility — should admins see user sessions?

**Chosen**: No. Admins see device counts and last-seen, but NOT individual session tokens or activity.

**Alternative**: Admins can view/terminate any session. Pro: emergency response. Con: session tokens could be used for impersonation; violates zero-knowledge principle.

**Tradeoff**: Admins can revoke devices (which implicitly kills sessions), but cannot view session details. This preserves the principle that even admins cannot impersonate users.

### D4: Security event retention — how long?

**Chosen**: Indefinite, append-only. Security events are part of the audit trail.

**Alternative A — 90-day rolling window**: Pro: bounded storage. Con: loses long-term audit capability.

**Alternative B — User-deletable**: Pro: GDPR right to erasure. Con: undermines audit integrity.

**Tradeoff**: Security events contain no PII (IP is hashed, device IDs are UUIDs). For GDPR, user deletion would delete the user record; security events can be anonymized (set `userPubkey = 'deleted'`) rather than deleted.

### D5: Device limit — keep at 5?

**Chosen**: Keep at 5 with LRU eviction. Add UI visibility so users understand the limit.

**Alternative A — Increase to 10**: Pro: accommodates power users. Con: more devices = more key wrapping overhead on PUK rotation.

**Alternative B — Configurable per hub**: Pro: flexibility. Con: complexity; device registration is per-user, not per-hub.

**Tradeoff**: 5 is a reasonable default for a crisis response app. The device list UI (Tier 1) will show the limit and which devices would be evicted next. We can revisit the limit based on user feedback.

### D6: Should anomaly detection auto-block?

**Chosen**: No. Anomalies are informational only — users and admins decide to act.

**Alternative**: Auto-block suspicious sessions with admin override.

**Tradeoff**: Crisis workers may legitimately need access from unusual locations/times (e.g., during an actual crisis). Auto-blocking could prevent access when it's most needed. The risk of a compromised device is better handled by the user via revocation than by automated lockout. We alert, they decide.

### D7: Recovery when all devices are lost — admin-assisted vs. social recovery?

**Chosen**: Admin-assisted recovery. Admin verifies identity out-of-band, creates recovery invite.

**Alternative A — Social recovery (N-of-M trusted contacts)**: Pro: no admin dependency. Con: complex UX, requires established trust network, vulnerable to collusion.

**Alternative B — No recovery**: Pro: simplest, most secure. Con: users permanently locked out if they lose all devices.

**Tradeoff**: Admin-assisted recovery is appropriate for an organization-managed app. The admin already knows the user (they assigned them shifts). Historical encrypted content is still lost — this is the correct security behavior since the old PUK seed is gone. The recovery invite bootstraps a fresh identity.
