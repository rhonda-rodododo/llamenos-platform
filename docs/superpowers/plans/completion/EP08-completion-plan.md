# EP08 — Platform Operations & Compliance — Completion Plan

## Scope

### Already Done (~65%)
- Erasure DB schema: erasure_requests, erasure_config, re_encryption_jobs, audit_user_keys
- Erasure protocol schemas
- Erasure routes: self-erasure, admin erasure, cancel, emergency override
- Erasure service with cascade logic
- Erasure expiry worker
- Desktop erasure queue admin section
- Desktop erasure config section
- Account recovery/erasure flow
- Crypto labels: `LABEL_AUDIT_USER_KEY_WRAP`, `LABEL_ERASURE_OVERRIDE_SIG`
- Retention DB schema: retention_settings, retention_platform_floors
- Retention protocol schemas
- Permissions: `erasure:request-self`, `erasure:admin`, `retention:manage`
- i18n: `erasure.*` namespace (~20+ keys)
- BDD: `erasure.feature`, `retention.feature` (passing)

### Remaining Work
- Platform settings routes (`GET/PATCH /settings/platform`) — not started
- Platform settings UI (feature flags, branding, session policy) — not started
- `system:manage-instance` admin UI — not started
- Remote device wipe UI — not started
- Re-encryption job monitoring UI
- Emergency override co-approver selection UI
- Retention purge cron job (daily 03:00 UTC) — not verified
- Cross-hub ban management UI
- Self-service erasure UI verification
- i18n gaps: `deviceWipe.*`, `platformSettings.*` namespaces missing

## Tasks (ordered by dependency)

### Task 1: Platform settings backend routes
- **Platform**: backend
- **Files**:
  - `apps/worker/routes/settings.ts` — add `GET /settings/platform`, `PATCH /settings/platform`
  - `apps/worker/db/schema/` — platform settings table if not exists (or extend systemSettings)
  - `packages/protocol/schemas/settings.ts` — add platform settings schema
- **What**: Create `GET /settings/platform` and `PATCH /settings/platform` endpoints. Platform settings include: feature flags (object of flag name → boolean), branding defaults (hub-key encrypted org name, logo URL), session policy (max sessions per user, session TTL, idle timeout). Gated by `system:manage-instance` permission. Store in `systemSettings` table or a new `platform_settings` table.
- **Spec reference**: Slice 4 (Platform Settings UI), What is missing — Backend item 1
- **Acceptance**: GET returns current settings; PATCH updates; permission-gated; schema validated

### Task 2: Platform settings desktop UI
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-sections/platform-settings-section.tsx` (new)
  - `src/client/lib/queries/platform-settings.ts` (new)
- **What**: Admin section for platform settings under the Platform nav scope. Feature flags: toggle switches for each flag. Branding: org name (encrypted), logo URL input. Session policy: numeric inputs for max sessions, session TTL, idle timeout. React Query hooks for fetching and updating. Gated by `system:manage-instance`.
- **Spec reference**: Slice 4, What is missing — Frontend item 4
- **Acceptance**: Settings page renders; changes save and persist; permission-gated

### Task 3: Remote device wipe UI
- **Platform**: desktop + backend
- **Files**:
  - `src/client/components/admin-sections/devices-section.tsx` — add wipe action
  - `apps/worker/routes/devices.ts` — add wipe endpoint if missing
  - `src/client/components/security/device-wipe-notification.tsx` (new)
- **What**: Admin can trigger remote wipe of a revoked device from the device oversight section. Backend sends wipe command via WebSocket to the target device. Target device receives wipe notification and executes secure key erasure. If device is offline, wipe queued for delivery on next connection. Display wipe status (pending/completed) in admin UI. Build the "Device removed" screen shown on the wiped device.
- **Spec reference**: What is missing — Remote device wipe UI
- **Acceptance**: Admin can trigger wipe; device receives and executes; status tracked

### Task 4: Re-encryption job monitoring UI
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-sections/erasure-config-section.tsx` — add re-encryption monitoring
- **What**: Show re-encryption job progress in the erasure config admin section. Display: job ID, status (pending/running/completed/failed), progress percentage, affected records count, started/completed timestamps. Use the existing `re_encryption_jobs` table data. Poll for updates or subscribe via WS.
- **Spec reference**: Incomplete items — Re-encryption job monitoring UI
- **Acceptance**: Active re-encryption jobs visible with progress; completed jobs in history

### Task 5: Retention purge cron job verification
- **Platform**: backend
- **Files**:
  - `apps/worker/lib/` — retention purge worker/cron
  - `apps/worker/index.ts` — verify cron registration
- **What**: Verify that a daily retention purge job runs at 03:00 UTC. It should: delete call records older than `retentionSettings.callRecordsDays`, delete note envelopes older than `notesDays`, delete message envelopes older than `messagesDays`, delete audit log entries older than `auditLogDays`. Per-hub settings with global fallback. Auth events purged separately (90-day TTL). If not implemented, create the cron job following v1's `retention-purge.ts` pattern. Log only when records actually deleted.
- **Spec reference**: v1 Implementation Reference (Retention purge), Slice 1
- **Acceptance**: Cron runs daily at 03:00 UTC; purges per retention settings; audit entry logged on purge

### Task 6: Cross-hub ban management UI
- **Platform**: desktop
- **Files**:
  - `src/client/routes/admin/platform-bans.tsx` (new or extend existing)
  - `src/client/lib/queries/bans.ts` — add platform-scope queries
- **What**: Platform-scoped bans admin view aggregating bans across all hubs. Show: ban list with hub, caller identifier (hashed), reason, created by, date. Allow platform admins to create cross-hub bans (banned across all hubs). Requires super-admin permission.
- **Spec reference**: Slice 5 (Cross-Hub Aggregated Views)
- **Acceptance**: Cross-hub ban list renders; platform bans enforceable across hubs

### Task 7: i18n — missing namespaces
- **Platform**: all
- **Files**:
  - `packages/i18n/locales/*.json` — add `deviceWipe.*`, `platformSettings.*` namespaces
- **What**: Add i18n keys: `deviceWipe.*` (wipe confirmation, status, device removed screen text), `platformSettings.*` (feature flags section, branding section, session policy section, all field labels). Add to all 13 locales. Run codegen + validation.
- **Spec reference**: i18n gaps
- **Acceptance**: `bun run i18n:validate:all` passes; all new UI strings localized

### Task 8: Self-service erasure UI verification
- **Platform**: desktop
- **Files**:
  - `src/client/components/account-recovery-flow.tsx` — verify self-service path
- **What**: Verify the full self-service erasure flow: user can request erasure (72h delay), see countdown, cancel pending request. Verify the ConsentGate pattern blocks app until consent is current. If any flow is broken, fix it.
- **Spec reference**: Slice 2 (ConsentGate + Self-Service GDPR UI)
- **Acceptance**: Self-erasure request creates 72h-delayed entry; countdown visible; cancel works; ConsentGate blocks without consent

### Task 9: Emergency override co-approver selection UI
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-sections/erasure-config-section.tsx` or related
- **What**: When an admin triggers an emergency erasure override, the UI should allow selecting a co-approver (another admin) who must also approve the action. Display available co-approvers (other super-admins). Track co-approval status.
- **Spec reference**: Incomplete items — Emergency override co-approver selection
- **Acceptance**: Co-approver selection UI renders; override requires dual approval
