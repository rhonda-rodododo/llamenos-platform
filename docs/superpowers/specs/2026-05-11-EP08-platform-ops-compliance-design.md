---
epic: EP08
title: Platform Operations & Compliance
status: stub
depends-on: [EP01]
phase: 3
---

# EP08: Platform Operations & Compliance

**Date:** 2026-05-11
**Source:** v1 (llamenos-hotline) → v2 (llamenos)

## Overview

Port platform-scoped admin operations and GDPR compliance features from v1 to v2. This covers platform settings (feature flags, branding, session policy), GDPR erasure queue, consent tracking, data retention configuration, and cross-hub aggregated views for bans, audit, analytics, and health.

## v1 Implementation Reference

### GDPR System (fully implemented in v1)

**Backend:**
- `GdprService` (`src/server/services/gdpr.ts`) — consent tracking, data export, erasure request lifecycle, retention purge
- `gdpr.ts` routes (`src/server/routes/gdpr.ts`) — OpenAPI endpoints for consent, export, self-erasure, admin erasure queue
- `retention-purge.ts` job (`src/server/jobs/retention-purge.ts`) — daily cron at 03:00 UTC, purges per retention settings + auth events

**DB tables (v1 schema `src/server/db/schema/settings.ts`):**
- `gdpr_consents` — pubkey, consent_version, consented_at (one row per user per version)
- `gdpr_erasure_requests` — pubkey (PK), requested_at, execute_at, status (pending/executed/cancelled)
- `retention_settings` — hub_id (PK, default 'global'), settings (JSONB: callRecordsDays, notesDays, messagesDays, auditLogDays), updated_at

**Zod schemas (v1 `src/shared/schemas/gdpr.ts`):**
- `GdprConsentSchema` — version string
- `RetentionSettingsSchema` — callRecordsDays (30-3650), notesDays (30-3650), messagesDays (30-3650), auditLogDays (365-3650)

**API routes (v1):**
- `GET /gdpr/consent` — check consent status
- `POST /gdpr/consent` — record consent (validates CONSENT_VERSION)
- `GET /gdpr/export` — self-service data export (JSON download)
- `GET /gdpr/export/:targetPubkey` — admin export of any user (requires `gdpr:admin`)
- `GET /gdpr/me/erasure` — check self-erasure request status
- `DELETE /gdpr/me` — create self-erasure (72h delay, requires `gdpr:erase-self`)
- `DELETE /gdpr/me/cancel` — cancel pending self-erasure
- `GET /gdpr/erasure-requests` — list all requests, filterable by status (requires `gdpr:admin`)
- `DELETE /gdpr/:targetPubkey` — admin immediate erasure (requires `gdpr:admin`)

**Erasure cascade (v1 `GdprService.eraseUser()`):**
1. Delete WebAuthn credentials
2. Delete provision rooms
3. Remove user from shift schedules (jsonb array filter)
4. Delete active shifts
5. Delete note envelopes authored by user
6. Anonymize audit log entries (actorPubkey → `[erased]`)
7. Anonymize user record (clear encrypted PII, keep row for relational integrity)
8. Mark erasure request as executed

**Retention purge (v1 `GdprService.purgeExpiredData()`):**
- Deletes call records, notes, messages, audit log entries older than configured days per hub
- Messages filtered via conversations join (no direct hubId on messageEnvelopes)
- Auth events purged separately (90-day hardcoded TTL)
- Audit entry logged only when records actually deleted

**Frontend (v1):**
- `GdprAdminSection` (`src/client/components/admin-sections/gdpr-section.tsx`) — admin erasure queue with status filters, manual pubkey export/erase, confirmation dialog
- `RetentionSection` (`src/client/components/admin-sections/retention-section.tsx`) — 4-field config (calls, notes, messages, audit log) with on-blur save
- `ConsentGate` (`src/client/components/consent-gate.tsx`) — full-screen overlay blocking app until consent granted, scroll-to-bottom requirement
- Client queries: `useErasureRequests`, `useAdminEraseUser`, `useRetentionSettings`, `useUpdateRetentionSettings`

**i18n (v1):**
- `gdpr.*` namespace — 30+ keys for self-service and admin GDPR UI
- `retention.*` namespace — 9 keys for retention configuration UI

### Platform Settings (v1 patterns)

- Global config, default policies, feature flags, maintenance controls
- Cross-hub admin views for bans, audit, health (aggregated)

## v2 Current State

### What exists

**Backend:**
- `system:manage-instance` permission exists for platform settings
- `settings:manage-ttl` permission with PATCH `/settings/ttl` route — manages operational TTL overrides (captcha, rate limits, provision rooms, invites, WebAuthn challenges, file uploads, blast queues) — this is NOT data retention (calls/notes/messages/audit)
- System health routes in `apps/worker/routes/system.ts` — aggregated health dashboard (server, services, calls, storage, backup, users)
- Health probes: `/health/ready` and `/health/live`
- `systemSettings` table has `ttlOverrides` column (JSONB) for operational cleanup TTLs
- `hubStorageSettings` table has per-namespace `retentionDays` column
- WebAuthn/passkey policy section already implemented
- WebAuthn settings route: PATCH `/settings/webauthn`

**Frontend:**
- Admin sidebar port design spec exists (`2026-05-11-admin-sidebar-port-design.md`)
- Nav structure defines Platform scope with: Hubs, Roles, Bans, Audit, Analytics, Health, Platform, GDPR Erasure
- Platform nav items noted as "NOT IN NAV YET" in sidebar port plan

**i18n:**
- No GDPR or retention i18n keys exist in v2 yet (packages/i18n has no gdpr/retention namespaces)
- Admin nav scope/group keys exist for "Platform" section

### What is missing from v2

**Backend (must build):**
1. `gdpr_consents` DB table — consent version tracking per user
2. `gdpr_erasure_requests` DB table — erasure request lifecycle
3. `retention_settings` DB table — per-hub data retention config (distinct from operational TTL overrides)
4. GDPR service — consent, export, erasure, retention purge (port from v1)
5. GDPR API routes — consent, export, self-erasure, admin erasure queue
6. Retention purge cron job — daily purge of expired call records, notes, messages, audit entries
7. GDPR permissions: `gdpr:export`, `gdpr:erase-self`, `gdpr:admin`
8. ConsentGate enforcement — block app usage until consent recorded

**Frontend (must build):**
1. GDPR Erasure admin section (port v1 `GdprAdminSection`)
2. Retention settings section (port v1 `RetentionSection`)
3. ConsentGate overlay (port v1 `ConsentGate`)
4. Platform settings section — feature flags, branding, multi-hub defaults
5. Self-service GDPR panel (user-facing: export, erasure request/cancel)
6. Cross-hub aggregated views: platform-bans, platform-audit, platform-analytics, platform-health

**i18n (must add):**
- `gdpr.*` namespace (30+ keys) across all 13 locales
- `retention.*` namespace (9 keys) across all 13 locales
- Platform settings labels

## Architecture Decisions

### Data Retention vs. Operational TTL

v2 already has operational TTL management (`apps/worker/lib/ttl.ts`) for ephemeral data (captchas, rate limits, provision rooms, invites). This is distinct from GDPR data retention which covers long-lived business data (call records, notes, messages, audit logs). The two systems must remain separate:

- **Operational TTL** (`/settings/ttl`, `settings:manage-ttl`) — minutes-to-days cleanup of transient operational data
- **Data Retention** (new, `/settings/retention` or `/gdpr/retention`) — 30-day to 10-year retention of business records, GDPR-scoped

### Erasure Delay

v1 uses 72-hour delay for self-erasure requests. This should be preserved — it balances user agency with protection against compromised accounts.

### Consent Versioning

v1 uses `CONSENT_VERSION` constant — consent must be re-granted when the version bumps. The ConsentGate blocks all app functionality until consent is current. This pattern must be ported to v2 with the same fail-closed behavior.

### Platform vs. Hub Scope

- Retention settings: configurable per-hub with global fallback (matching v1)
- GDPR consent: per-user, platform-scoped (not hub-specific)
- Erasure: platform-scoped (erases user across all hubs)
- Platform settings UI: requires `system:manage-instance`, super-admin only

### E2EE Considerations

- Data export returns ciphertext envelopes — client decrypts. Server never has plaintext.
- Erasure anonymizes rather than deletes user rows to preserve relational integrity.
- Audit log entries get actorPubkey replaced with `[erased]` — encrypted event content stays (only admins can decrypt, and the user is gone).

## Scope Breakdown

### Slice 1: GDPR Backend (DB + Service + Routes)
- Add `gdpr_consents`, `gdpr_erasure_requests`, `retention_settings` tables
- Port `GdprService` from v1 (adapt to v2 schema names)
- Port GDPR routes (adapt to v2 Hono patterns — non-OpenAPI for file downloads, OpenAPI for JSON endpoints)
- Add `gdpr:export`, `gdpr:erase-self`, `gdpr:admin` permissions
- Wire retention purge cron job into server startup
- Drizzle migration

### Slice 2: ConsentGate + Self-Service GDPR UI
- Port `ConsentGate` component (full-screen overlay, scroll-to-bottom, fail-closed)
- Wire into auth provider (same pattern as v1 `AuthProvider`)
- Self-service panel: data export download, erasure request/cancel, countdown display
- Client API functions + React Query hooks

### Slice 3: Admin GDPR Erasure + Retention UI
- Port `GdprAdminSection` to v2 admin sidebar (under Platform scope)
- Port `RetentionSection` to v2 admin sidebar
- Wire into admin section registry
- Add nav items to sidebar config

### Slice 4: Platform Settings UI
- Platform settings section: feature flags, branding defaults, session management
- Requires `system:manage-instance` permission
- Wire into admin sidebar under Platform scope

### Slice 5: Cross-Hub Aggregated Views
- Platform-scoped Bans view (aggregated across hubs)
- Platform-scoped Audit view (aggregated across hubs)
- Platform-scoped Analytics view (aggregated metrics)
- Platform-scoped Health view (already partially exists in `system.ts`)
- Wire all into admin sidebar Platform scope

### Slice 6: i18n
- Add `gdpr.*` and `retention.*` keys to all 13 locale files
- Platform settings labels
- Run `bun run i18n:codegen` + validators

## Open Questions

1. Should the erasure delay be admin-configurable (v1 hardcodes 72h)?
2. Should retention settings be configurable at entity-type level in v2's CMS model (e.g., different retention for different case types)?
3. Platform analytics — what metrics to aggregate cross-hub? v1 had basic call counts; v2 has richer entity model.
4. Should ConsentGate apply on mobile (iOS/Android) too, or is it desktop-only initially?
5. v1 consent text references a privacy policy page — v2 has one at `site/src/content/pages/en/privacy.md`. Same version?

## Test Plan

- Backend BDD: consent lifecycle, erasure request lifecycle, retention purge, permission enforcement
- E2E Playwright: ConsentGate blocks app, consent grants access, self-service export/erasure
- E2E Playwright: admin erasure queue, retention settings save
- Unit: GdprService methods, retention clamping logic, consent version validation
