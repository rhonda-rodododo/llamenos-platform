---
epic: EP07
title: Shift Management
status: stub
depends-on: [EP01, EP03]
phase: 2
---

# Spec: EP07 — Shift Management

**Date:** 2026-05-11
**Status:** Stub

---

## Goal

Complete shift management across all platforms — admin CRUD for shift schedules, shift overrides (cancel/substitute per date), ring group management, fallback group configuration, and user-facing shift status/schedule views on desktop, iOS, and Android.

---

## Current State

### What exists

**Backend (apps/worker/routes/shifts.ts):**
- Full CRUD via `createEntityRouter` factory (list, create, update, delete) — hub-scoped, with audit events (`shiftCreated`, `shiftEdited`, `shiftDeleted`)
- `GET /my-status` — returns current user shift status (onShift, currentShift, nextShift)
- `GET /fallback` / `PUT /fallback` — fallback ring group management (permission: `shifts:manage-fallback`)
- Permission guards: `shifts:read-own`, `shifts:read`, `shifts:create`, `shifts:update`, `shifts:delete`, `shifts:manage-fallback`

**DB schema (apps/worker/db/schema/shifts.ts):**
- `shifts` table: id, hubId, name, startTime, endTime, days (int[]), userPubkeys (text[]), createdAt
- `push_reminders_sent` table: shiftId, reminderDate, pubkey, sentAt (composite PK)
- No `shift_overrides` table
- No `ring_groups` table
- No `active_shifts` / clock-in tracking table

**Protocol schemas (packages/protocol/schemas/shifts.ts):**
- `shiftResponseSchema`: id, name, startTime, endTime, days, userPubkeys, createdAt
- `myStatusResponseSchema`: onShift, currentShift (name/startTime/endTime), nextShift (name/startTime/endTime/day)
- `createShiftBodySchema`, `updateShiftBodySchema`, `fallbackGroupSchema`
- No override schemas, no ring group schemas, no clock-in/out schemas

**Desktop client (src/client/routes/shifts.tsx):**
- Shifts page exists with admin CRUD: create/edit/delete shifts, day picker, time range, user multi-select
- Fallback group card with `UserMultiSelect`
- Break toggle button (on/off shift) — uses `useAuth().toggleBreak`
- Uses imperative `useState` + `useEffect` fetch pattern (not React Query hooks)
- No shift override UI
- No ring group management UI
- No weekly calendar / schedule visualization

**v1 client (llamenos-hotline, src/client/routes/shifts.tsx):**
- Nearly identical shift CRUD page with React Query hooks (`useShifts`, `useCreateShift`, etc.)
- Hub-encrypted shift names via `encryptHubField`
- React Query hooks in `src/client/lib/queries/shifts.ts` (useShifts, useFallbackGroup, useShiftStatus, useCreateShift, useUpdateShift, useDeleteShift, useSetFallbackGroup)
- `useShiftStatus` hook with 60s polling for dashboard display
- No override UI in v1 either

**Dashboard shift status (src/client/lib/hooks.ts):**
- `useShiftStatus()` hook fetches `/shifts/my-status` with periodic refresh
- Used in `src/client/routes/index.tsx` (dashboard) and `__root.tsx` (layout)

**i18n (packages/i18n/locales/en.json):**
- Comprehensive shift keys exist: `shifts.*` namespace (~50+ keys covering create, edit, delete, clock in/out, status, fallback, reminders, schedule view)
- Dashboard status keys: `dashboard.onShift`, `dashboard.offShift`, `dashboard.shiftStatus`
- Help/FAQ keys referencing shift workflows

**iOS / Android:**
- No shift management views exist
- No shift status display on mobile dashboards

### What is missing

1. **Shift overrides** — no DB table, no protocol schema, no backend routes, no UI on any platform
   - Cancel a shift for a specific date
   - Substitute different volunteers for a specific date
2. **Ring groups** — no DB table, no backend routes, no management UI
   - Named groups of volunteers for routing
   - Assign ring groups to shifts instead of individual pubkeys
3. **Active shift / clock-in tracking** — no DB table for tracking who is currently clocked in
   - Break state tracked in auth context only (client-side), not persisted server-side
   - No audit trail for clock-in/out events
4. **Desktop improvements:**
   - Migrate from imperative fetch to React Query hooks (v1 already has these)
   - Hub-encrypted shift names (v1 has `encryptHubField` integration, v2 does not)
   - Weekly calendar / schedule visualization
   - Shift override management UI
5. **Mobile shift views (iOS + Android):**
   - Admin shift CRUD screens
   - User-facing schedule view (my shifts, next shift)
   - Shift status on mobile dashboard
   - Clock in/out, break toggle
6. **Server-side shift status persistence** — clock-in state should be tracked server-side for accurate call routing

---

## Scope

### In scope

- Shift override DB schema, protocol schemas, backend routes, and desktop UI
- Ring group DB schema, backend routes, and admin management UI (desktop)
- Server-side clock-in/out tracking (active_shifts table + routes)
- Desktop: migrate to React Query hooks, add hub-encrypted names, schedule visualization
- iOS: shift schedule view, shift status on dashboard, admin CRUD (if admin role)
- Android: shift schedule view, shift status on dashboard, admin CRUD (if admin role)
- Push reminder integration (table exists, wire up to shift notification flow)

### Out of scope

- Automated shift swap / trade requests between volunteers (future epic)
- Shift analytics / coverage reports (covered by analytics epic)
- Calendar sync (Google Calendar, Apple Calendar) — future integration
- Voice IVR shift announcements to callers

---

## Key Design Decisions (TBD)

1. **Ring groups vs. direct user assignment** — Should shifts reference ring groups or keep direct pubkey arrays? Or both (ring group as shortcut, resolved to pubkeys at routing time)?
2. **Override granularity** — Per-shift-per-date, or per-date global? Should overrides support partial time changes (e.g., shift starts 1 hour later)?
3. **Clock-in persistence** — WebSocket presence-based, or explicit HTTP clock-in/out calls with DB persistence?
4. **Shift name encryption** — v1 uses `encryptHubField` for shift names. Should v2 follow the same pattern or treat shift names as non-sensitive metadata?
5. **Mobile admin scope** — Full shift CRUD on mobile, or read-only with admin actions limited to desktop?

---

## Architecture Notes

- Backend routes exist and use `createEntityRouter` factory — extending with overrides and ring groups should follow the same pattern
- Permission catalog already covers shift operations — may need new permissions for overrides (`shifts:manage-overrides`) and ring groups (`shifts:manage-ring-groups`)
- Push reminders table exists but needs wiring to the notification service (Signal notifier sidecar, push notifications)
- Shift status is currently computed on-the-fly from schedule + current time — adding server-side clock-in state changes the routing logic in the telephony layer

---

## References

- v1 shift page: `/home/rikki/projects/llamenos-hotline/src/client/routes/shifts.tsx`
- v1 React Query hooks: `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/shifts.ts`
- v2 backend routes: `/media/rikki/recover/projects/llamenos/apps/worker/routes/shifts.ts`
- v2 DB schema: `/media/rikki/recover/projects/llamenos/apps/worker/db/schema/shifts.ts`
- v2 protocol schemas: `/media/rikki/recover/projects/llamenos/packages/protocol/schemas/shifts.ts`
- v2 desktop page: `/media/rikki/recover/projects/llamenos/src/client/routes/shifts.tsx`
- v2 shift status hook: `/media/rikki/recover/projects/llamenos/src/client/lib/hooks.ts`
