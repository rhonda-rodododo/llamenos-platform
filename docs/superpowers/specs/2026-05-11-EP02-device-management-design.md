---
epic: EP02
title: Device & Identity Management
status: stub
depends-on: [EP01]
phase: 2
---

# EP02: Device & Identity Management

**Date:** 2026-05-11
**Status:** Stub (awaiting detailed planning)
**Depends on:** EP01 (Admin sidebar port — provides the admin shell + nav infrastructure)

## Scope

Port v1's device and identity management features to v2 and extend them with the v2 crypto architecture (per-device Ed25519/X25519 keys, sigchains, PUK, HPKE). This epic covers both the admin-facing hub device oversight and the user-facing device/session management.

## What Exists in v2

### Crypto Foundation (Complete)

- `packages/crypto/` — Ed25519/X25519 device keys, sigchain (append-only hash-chained device authorization), provisioning (ECDH + SAS), PUK with CLKR, per-device auth tokens
- Tauri `CryptoState` holds device private keys; UI only sees pubkeys via `platform.ts`
- Device linking works both directions (new device via `link-device.tsx`, primary via settings `LinkDeviceSection`)

### Backend (Complete)

- `apps/worker/routes/devices.ts` — `GET /api/devices`, `POST /api/devices/register`, `DELETE /api/devices/:id`, VoIP token management
- `apps/worker/routes/sigchain.ts` — sigchain read/append
- `apps/worker/routes/webauthn.ts` — 6 WebAuthn endpoints (login/register options+verify, list/delete credentials)
- `apps/worker/routes/provisioning.ts` — ephemeral device linking relay rooms
- `apps/worker/routes/puk.ts` — PUK envelope distribution
- `apps/worker/services/identity.ts` — device registration with LRU eviction (max 5), session management (8h sliding, 1h renewal)
- `apps/worker/services/crypto-keys.ts` — sigchain append with sequence/hash validation

### User-Facing Settings (v2, Partial)

- `src/client/routes/settings.tsx` — has `LinkDeviceSection` (provisioning QR/code), WebAuthn passkey management (list, register, delete with labels/badges), key backup info
- No dedicated `/security/*` routes in v2 (v1 had `/security/sessions`, `/security/passkeys`, `/security/history`, `/security/factors`)
- No device list view, no device revocation UI, no session management, no security event history

### Admin Settings (v2)

- `src/client/routes/admin/settings.tsx` — admin settings page with section components, but NO devices section registered
- No `devices-section.tsx` in v2's `admin-sections/` or `admin-settings/` directories
- Admin nav config (from EP01) has a "Devices" item under General group (nav slug: `devices`, permission: `settings:read`)

### Existing Spec

- `docs/superpowers/specs/2026-05-03-device-observability-ux.md` — comprehensive 3-tier spec covering device list, revocation, sessions, security events, admin oversight, sigchain visualization, anomaly detection. Defines API design, DB schema changes, UX mockups, security considerations, and implementation phases.

## What v1 Had

### Admin Devices Section (`devices-section.tsx`)

- Hub-scoped device list via `GET /hubs/:hubId/devices`
- Per-device row: label (or truncated ID), verified badge (`DeviceBadge`), verify button for unverified devices
- SAS 7-emoji verification ceremony via `VerifyFingerprintModal`:
  - Derives SAS from verifier pubkey + target pubkey + fresh session nonce (32 random bytes)
  - 7x3 emoji grid display + 8-column emoji picker for interactive verification
  - Mismatch detection with warning, reset capability
  - On confirm: creates `device_fingerprint_verified` signed audit entry via `buildSignedAuditEntry`, submits to `/hubs/:hubId/devices/:id/verify`
- Admin role check (role-admin, role-super-admin, admin, super_admin)

### User Security Routes

- `/security/sessions` — active session list with revoke, sign-out-everywhere, emergency lockdown modal
- `/security/passkeys` — WebAuthn credential management with rename, delete, transport badges (USB/internal/hybrid/NFC/BLE/smart-card), backup status, last-used dates
- `/security/history` — security event timeline with event type labels, location display, timestamps, "report suspicious" per-event, JSON export
- `/security/factors` — PIN change, recovery key rotation, idle lock settings
- `/security` layout — tabbed navigation across all security sub-routes

## What Needs to Be Built

### Phase 1: Admin Device Oversight (Desktop)

1. **Admin devices section component** — port v1's `devices-section.tsx` to v2's admin settings architecture
   - Register in admin nav under General > Devices (EP01 nav config already has the slot)
   - Hub-scoped device list with metadata (name, platform, model, last seen)
   - Device verification status badges
   - Verify button triggering SAS emoji ceremony

2. **SAS emoji verification modal** — port v1's `VerifyFingerprintModal`
   - Adapt to v2's crypto architecture (per-device Ed25519 keys via `platform.ts` IPC)
   - Session nonce generation, SAS derivation, 7-emoji interactive picker
   - Signed audit entry creation via Tauri CryptoState (device private key never in JS)
   - Verification endpoint integration

3. **Device fingerprint display** — truncated Ed25519 pubkey with copy button per device

### Phase 2: User Device & Session Management (Desktop)

4. **User device list** — new settings section showing all linked devices for current user
   - Current device highlighted
   - Device name (editable), platform icon, model, last seen, PUK generation
   - Revoke/remove action with confirmation (creates `device_remove` sigchain link, rotates PUK, rotates hub keys)

5. **Session management** — active sessions with revoke
   - Port v1's session list with current-session badge, last-active, user-agent display
   - "Sign out everywhere else" action
   - Emergency lockdown (port v1's `LockdownModal`)

6. **Security event history** — port v1's history view
   - Event type labels, timestamps, location (resolved on-the-fly, never stored)
   - Report suspicious, JSON export

7. **Enhanced passkey management** — v2 settings already has basic passkey CRUD; enhance with:
   - Rename (inline edit like v1)
   - Transport badges (v1 pattern)
   - Credential count warning

### Phase 3: Backend Enhancements

8. **New endpoints** (per device-observability spec):
   - `POST /api/devices/:id/revoke` — orchestrated revocation (sigchain + delete + PUK rotation + hub key rotation)
   - `PATCH /api/devices/:id` — device rename
   - `GET /api/sessions`, `DELETE /api/sessions/:token`, `DELETE /api/sessions/others` — session management
   - `GET /api/security-events` — user-facing security event log
   - `GET /api/admin/devices/overview` — admin aggregate device stats

9. **DB schema changes**:
   - Add `deviceName`, `deviceModel`, `osVersion`, `appVersion`, `lastIpHash` to `devices` table
   - Populate `sessions.deviceInfo` JSONB on session creation
   - Create `security_events` table (append-only)

10. **New Zod schemas** in `packages/protocol/schemas/device-management.ts` + codegen for Swift/Kotlin

### Phase 4: Mobile (iOS + Android)

11. **iOS device management views** — SwiftUI device list, session list, security events in Settings
12. **Android device management views** — Compose device list, session list, security events in Settings
13. **Mobile device metadata reporting** — send deviceModel, osVersion, appVersion on registration

### Phase 5: Advanced (Post-Launch)

14. **Sigchain visualization** — interactive timeline of device authorization chain
15. **Security alert delivery** — wire `alertOnNewDevice`/`alertOnPasskeyChange`/`alertOnPinChange` prefs to push + Signal notifications
16. **Session anomaly detection** — flag unusual login patterns (informational, no auto-block)
17. **Lost device recovery wizard** — guided multi-step flow for device loss
18. **Device health dashboard** — per-device health score (key age, PUK freshness, app version)

## Key Architecture Decisions

### Crypto Key Management

- All SAS derivation and signing happens in Rust (`packages/crypto`), invoked via Tauri IPC on desktop, UniFFI on iOS, JNI on Android
- Device private keys NEVER enter JavaScript/webview — `platform.ts` routes through IPC
- SAS emoji verification binds to a fresh per-session nonce to prevent pre-computation attacks
- Device revocation creates a `device_remove` sigchain link, which triggers PUK rotation excluding the revoked device

### Permission Model

- Users see their own devices, sessions, and security events
- Admins see hub-scoped device list with verification status (device counts + last-seen per user, not session details)
- Admins can verify devices (SAS ceremony) but cannot view/terminate user sessions (zero-knowledge principle)

### Relationship to Device Observability Spec

The existing `2026-05-03-device-observability-ux.md` spec provides the comprehensive design for all tiers. This epic spec defines the **porting scope and sequencing** — what to bring from v1 first, what new v2-specific work is needed, and how it maps to the admin sidebar infrastructure from EP01.

## Dependencies

| Dependency | Status | Required For |
|------------|--------|-------------|
| EP01: Permission System & Role Management | In progress | Admin nav routing, role definitions for multi-role assignment UI |
| `packages/crypto` SAS derivation | Complete | Emoji verification ceremony |
| Tauri IPC `CryptoState` | Complete | Desktop device key operations |
| Backend device/sigchain routes | Complete | All device management features |
| `packages/protocol` codegen | Complete | Cross-platform type generation |

## Cross-Epic Notes

- **Multi-role assignment UI**: EP01 establishes multi-role support (union model) in the permission engine and role definitions. The actual user-role assignment UI (multi-select picker on user profile/management views) should be built as part of this epic's user management work. The backend already supports role ID arrays — this is a UI task.

## Open Questions

1. **Migrate v1 security routes or integrate into settings?** v1 had standalone `/security/*` routes with tabbed navigation. v2 currently has everything in `/settings`. Should we add a `/security` route tree or keep device/session management as settings sections?

2. **Admin device verification scope** — v1 verified devices per-hub. With v2's multi-hub architecture, should verification be per-hub (v1 behavior) or per-user (global trust)?

3. **Emergency lockdown scope** — v1's lockdown modal existed on the sessions page. In v2's multi-hub world, should lockdown be per-hub or global (all hubs)?

4. **SAS emoji table** — v1 used a custom emoji table (`SAS_EMOJI_TABLE` in `@/lib/mls/emoji-table`). Should v2 use the same table or derive from `packages/crypto` (making it consistent across all platforms)?

5. **Device metadata collection** — the observability spec proposes `deviceModel`, `osVersion`, `appVersion` etc. How much metadata should Tauri desktop auto-detect vs. require manual entry?
