---
epic: EP07
title: Shift Management
status: specced
depends-on: [EP01, EP03]
phase: 2
---

# Spec: EP07 — Shift Management

**Date:** 2026-05-11
**Status:** Specced

---

## Goal

Complete shift management across all platforms — admin CRUD for shift schedules, shift overrides (cancel/substitute per date), ring group management, fallback group configuration, server-side clock-in with heartbeat liveness, user availability blocks, shift join/leave requests with approval workflow, and user-facing shift status/schedule views on desktop, iOS, and Android.

---

## Design Decisions

1. **Ring groups are independent of teams (EP03).** Ring groups are a first-class shift-routing concept. Teams are a general-purpose organizational primitive for access control, case assignment, and other purposes. A hub with 2 users doesn't need teams but benefits from ring groups. A hub with 200 users uses both. No FK between them.

2. **Override granularity: per-shift-per-date + global-date.** Nullable `shiftId` means "all shifts on this date" — covers the holiday use case with one record. Two types: cancel and substitute. No partial time changes (admin creates a substitute override or adjusts the shift directly).

3. **User availability blocks: date-range only.** Users submit "unavailable from X to Y" date ranges. Advisory — admins see them when scheduling but can still assign. No recurring patterns. Separate from real-time online/offline status.

4. **Shift join/leave requests with approval.** Users can request to join or leave a shift. Requests require approval by a user with `shifts:approve-requests` permission. Approved join requests add the user to the shift's pubkey list (or to the ring group's members if the shift uses a ring group). Approved leave requests remove them.

5. **Clock-in via HTTP + WebSocket heartbeat for liveness.** Explicit HTTP clock-in/out creates/deletes `active_shifts` records. WebSocket heartbeat (every 30s) updates `lastHeartbeat`. Routing pipeline filters to users with fresh heartbeats (within configurable timeout, default 90s). Auto-cleanup job removes stale records. Handles app crash/network loss gracefully — no tab-state concerns since v2 is Tauri desktop + native mobile only.

6. **Shift names encrypted with hub key.** Shift names, ring group names, override notes, and availability reasons are hub-key encrypted via `encryptHubField`. AAD binding on record ID + field name. Domain separation labels from `crypto-labels.json`. Consistent with project security posture that all implicating data is encrypted.

---

## Data Model

### Shifts table (modify existing `apps/worker/db/schema/shifts.ts`)

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Client-generated UUID for AAD binding |
| hubId | text NOT NULL | Hub scope |
| encryptedName | text NOT NULL | Hub-key encrypted (replaces plaintext `name`) |
| startTime | text NOT NULL | HH:MM format, UTC |
| endTime | text NOT NULL | HH:MM format, supports midnight-crossing |
| days | int[] NOT NULL | 0=Sunday through 6=Saturday |
| ringGroupId | text NULL FK→ring_groups.id | If set, resolved at routing time; overrides userPubkeys |
| userPubkeys | text[] NOT NULL | Direct assignment (used when ringGroupId is null) |
| createdAt | timestamptz NOT NULL | Auto-populated |

A shift uses EITHER `ringGroupId` (resolved at routing time) OR `userPubkeys` (direct). Both can coexist in the schema — the routing pipeline prefers ringGroupId if set.

### ring_groups (new)

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Client-generated UUID for AAD binding |
| hubId | text NOT NULL | Hub scope |
| encryptedName | text NOT NULL | Hub-key encrypted |
| createdAt | timestamptz NOT NULL | Auto-populated |

Index: `ring_groups_hub_idx ON (hubId)`

### ring_group_members (new)

| Column | Type | Notes |
|--------|------|-------|
| ringGroupId | text NOT NULL | FK→ring_groups.id ON DELETE CASCADE |
| userPubkey | text NOT NULL | User public key |
| addedBy | text NOT NULL | Pubkey of admin who added |
| createdAt | timestamptz NOT NULL | Auto-populated |

PK: `(ringGroupId, userPubkey)`. Index: `ring_group_members_user_idx ON (userPubkey)`.

### shift_overrides (new)

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Client-generated UUID |
| hubId | text NOT NULL | Hub scope |
| shiftId | text NULL | FK→shifts.id ON DELETE CASCADE; null = all shifts |
| date | text NOT NULL | YYYY-MM-DD |
| type | text NOT NULL | 'cancel' or 'substitute' |
| userPubkeys | text[] NULL | Replacement users (substitute only) |
| encryptedNote | text NULL | Hub-key encrypted admin note |
| createdBy | text NOT NULL | Pubkey of creator |
| createdAt | timestamptz NOT NULL | Auto-populated |

Unique: `(hubId, shiftId, date)` — one override per shift per date.
Partial unique: `(hubId, date) WHERE shiftId IS NULL` — one global override per date.
Index: `shift_overrides_hub_date_idx ON (hubId, date)`.

### active_shifts (new)

| Column | Type | Notes |
|--------|------|-------|
| pubkey | text NOT NULL | User public key |
| hubId | text NOT NULL | Hub scope |
| startedAt | timestamptz NOT NULL | Clock-in time |
| lastHeartbeat | timestamptz NOT NULL | Updated by WS heartbeat |

PK: `(pubkey, hubId)`.

### user_availability_blocks (new)

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Client-generated UUID for AAD binding |
| hubId | text NOT NULL | Hub scope |
| userPubkey | text NOT NULL | User public key |
| startDate | text NOT NULL | YYYY-MM-DD |
| endDate | text NOT NULL | YYYY-MM-DD (inclusive) |
| encryptedReason | text NULL | Hub-key encrypted, optional |
| createdAt | timestamptz NOT NULL | Auto-populated |

Index: `availability_blocks_hub_user_idx ON (hubId, userPubkey)`.
Index: `availability_blocks_hub_date_idx ON (hubId, startDate, endDate)`.

### shift_join_requests (new)

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Client-generated UUID |
| hubId | text NOT NULL | Hub scope |
| shiftId | text NOT NULL | FK→shifts.id ON DELETE CASCADE |
| userPubkey | text NOT NULL | Requester pubkey |
| type | text NOT NULL | 'join' or 'leave' |
| status | text NOT NULL DEFAULT 'pending' | 'pending', 'approved', 'denied' |
| reviewedBy | text NULL | Approver/denier pubkey |
| reviewedAt | timestamptz NULL | Review timestamp |
| createdAt | timestamptz NOT NULL | Auto-populated |

Index: `shift_join_requests_hub_idx ON (hubId, status)`.

---

## Permissions

### New permissions

| Permission | Description | Typical holder |
|-----------|-------------|----------------|
| shifts:manage-overrides | CRUD shift overrides | Admin |
| shifts:manage-ring-groups | CRUD ring groups + membership | Admin |
| shifts:approve-requests | Approve/deny shift join/leave requests | Admin |
| shifts:request-join | Submit join/leave requests | Volunteer |
| shifts:set-availability | Submit own availability blocks | Volunteer |

### Existing permissions (unchanged)

| Permission | Description |
|-----------|-------------|
| shifts:read-own | Check own shift status |
| shifts:read | View all shifts |
| shifts:create | Create shift schedules |
| shifts:update | Modify shift schedules |
| shifts:delete | Delete shift schedules |
| shifts:manage-fallback | Configure fallback ring group |

---

## API Endpoints

### Ring Groups — `/ring-groups` (new route file via `createEntityRouter`)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/ring-groups` | shifts:manage-ring-groups | List + member counts |
| POST | `/ring-groups` | shifts:manage-ring-groups | Create (client UUID for AAD) |
| PATCH | `/ring-groups/:id` | shifts:manage-ring-groups | Update encrypted name |
| DELETE | `/ring-groups/:id` | shifts:manage-ring-groups | Fails if referenced by active shift (restrict) |
| GET | `/ring-groups/:id/members` | shifts:manage-ring-groups | List members |
| POST | `/ring-groups/:id/members` | shifts:manage-ring-groups | Add members (pubkeys array) |
| DELETE | `/ring-groups/:id/members/:pubkey` | shifts:manage-ring-groups | Remove member |

### Shift Overrides — `/shifts/overrides` (nested under shifts)

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/shifts/overrides?from=&to=` | shifts:manage-overrides | List in date range |
| POST | `/shifts/overrides` | shifts:manage-overrides | Create cancel or substitute |
| DELETE | `/shifts/overrides/:id` | shifts:manage-overrides | Remove override |

No PATCH — delete and recreate for changes.

### Clock-in — `/shifts/clock`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| POST | `/shifts/clock/in` | shifts:read-own | Any volunteer can clock in |
| POST | `/shifts/clock/out` | shifts:read-own | Any volunteer can clock out |
| GET | `/shifts/clock/status` | shifts:read | Who's clocked in (admin view) |
| DELETE | `/shifts/clock/:pubkey` | shifts:update | Admin force clock-out |

Heartbeat is NOT HTTP — it piggybacks on the existing WebSocket connection (`shift:heartbeat` message every 30s, server updates `active_shifts.lastHeartbeat`).

### User Availability — `/shifts/availability`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/shifts/availability` | shifts:set-availability | Own blocks |
| GET | `/shifts/availability/all` | shifts:read | All users' blocks (admin) |
| POST | `/shifts/availability` | shifts:set-availability | Create block (client UUID for AAD) |
| DELETE | `/shifts/availability/:id` | shifts:set-availability | Delete own block |

### Shift Join/Leave Requests — `/shifts/requests`

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| POST | `/shifts/requests` | shifts:request-join | Submit request |
| GET | `/shifts/requests` | shifts:approve-requests | List pending (admin) |
| GET | `/shifts/requests/mine` | shifts:request-join | Own requests |
| PATCH | `/shifts/requests/:id` | shifts:approve-requests | Approve or deny |

When a join request is approved: if the shift uses direct `userPubkeys`, the server adds the user to that array. If the shift uses a `ringGroupId`, the server adds the user to `ring_group_members` for that ring group. When a leave request is approved, the server removes them from the corresponding location. The admin reviewing the request sees which target (shift pubkeys or ring group) will be modified.

### Existing Shifts Endpoints (modified)

- `createShiftBodySchema` adds `id` (client UUID for AAD), `ringGroupId` (nullable), renames `name` → `encryptedName`
- `updateShiftBodySchema` adds `ringGroupId` (nullable), renames `name` → `encryptedName`
- `shiftResponseSchema` adds `ringGroupId`, renames `name` → `encryptedName`
- `myStatusResponseSchema` returns `id` and `encryptedName` (client decrypts) instead of plaintext name

---

## Routing Pipeline

`getCurrentVolunteers(hubId)` evolves from a simple schedule lookup to a multi-step pipeline:

```
1. findActiveShifts(hubId, currentDay, currentTime)
   → shifts where days includes currentDay AND time is within range
   → handles midnight-crossing shifts (startTime > endTime)

2. applyOverrides(activeShifts, hubId, todayDate)
   → remove cancelled shifts
   → substitute user lists where overrides exist
   → global overrides (shiftId=null) cancel ALL shifts for that date

3. resolveVolunteers(activeShifts)
   → for each shift: if ringGroupId set, resolve members from ring_group_members
   → otherwise use shift.userPubkeys
   → union all into a single pubkey set

4. filterClockIn(pubkeys, hubId, heartbeatTimeout)
   → inner join with active_shifts where lastHeartbeat > (now - timeout)
   → only clocked-in, live users pass through

5. excludeUnavailable(pubkeys, hubId, todayDate)
   → remove users with availability blocks covering today

6. fallback(pubkeys, hubId)
   → if empty, use fallback group (existing logic)
```

Steps 1-3 determine WHO is scheduled. Steps 4-5 determine WHO is actually available. Step 6 is the safety net.

### Heartbeat mechanism

- Client sends `shift:heartbeat` every 30s while clocked in, over the existing WebSocket connection
- Server updates `active_shifts.lastHeartbeat = now()` on receipt
- Routing pipeline filters to `lastHeartbeat > now() - heartbeatTimeout`
- Heartbeat timeout configurable per hub in `hubSettings` (default: 90s — 3 missed heartbeats)
- Periodic cleanup job (every 5 minutes) deletes stale `active_shifts` records past timeout

### Clock-in lifecycle

```
User taps "Go Online" →
  POST /shifts/clock/in →
    UPSERT active_shifts (pubkey, hubId, startedAt=now, lastHeartbeat=now) →
      Client starts WS heartbeat interval →
        User appears in routing pipeline

User taps "Go Offline" →
  POST /shifts/clock/out →
    DELETE active_shifts (pubkey, hubId) →
      Client stops heartbeat interval →
        User removed from routing

App crash / network loss →
  Heartbeat stops →
    lastHeartbeat ages past timeout →
      Routing pipeline excludes user →
        Cleanup job deletes stale record
```

---

## Protocol Schemas & Codegen

### New Zod schemas in `packages/protocol/schemas/`

**`ring-group.ts`:**
- `ringGroupResponseSchema` — id, hubId, encryptedName, memberCount, createdAt
- `ringGroupDetailResponseSchema` — adds members array (pubkey, addedBy, createdAt)
- `ringGroupListResponseSchema` — { ringGroups: RingGroupResponse[] }
- `createRingGroupBodySchema` — id (client UUID for AAD), encryptedName
- `updateRingGroupBodySchema` — encryptedName
- `ringGroupMembersBodySchema` — { pubkeys: string[] }

**`shift-override.ts`:**
- `shiftOverrideResponseSchema` — id, hubId, shiftId (nullable), date, type, userPubkeys (nullable), encryptedNote (nullable), createdBy, createdAt
- `shiftOverrideListResponseSchema` — { overrides: ShiftOverrideResponse[] }
- `createShiftOverrideBodySchema` — shiftId (nullable), date, type, userPubkeys (for substitute), encryptedNote
- `overrideQuerySchema` — from (date string), to (date string)

**`shift-availability.ts`:**
- `availabilityBlockResponseSchema` — id, hubId, userPubkey, startDate, endDate, encryptedReason (nullable), createdAt
- `availabilityBlockListResponseSchema` — { blocks: AvailabilityBlockResponse[] }
- `createAvailabilityBlockBodySchema` — id (client UUID for AAD), startDate, endDate, encryptedReason

**`shift-request.ts`:**
- `shiftJoinRequestResponseSchema` — id, hubId, shiftId, userPubkey, type ('join'|'leave'), status ('pending'|'approved'|'denied'), reviewedBy (nullable), reviewedAt (nullable), createdAt
- `shiftJoinRequestListResponseSchema` — { requests: ShiftJoinRequestResponse[] }
- `createShiftJoinRequestBodySchema` — shiftId, type
- `reviewShiftJoinRequestBodySchema` — status ('approved'|'denied')

**`shifts.ts` (modify existing):**
- `shiftResponseSchema` — add `ringGroupId` (nullable), rename `name` → `encryptedName`
- `createShiftBodySchema` — add `id` (client UUID), `ringGroupId` (nullable), rename `name` → `encryptedName`
- `updateShiftBodySchema` — add `ringGroupId` (nullable), rename `name` → `encryptedName`
- `myStatusResponseSchema` — return `id` + `encryptedName` instead of plaintext `name`
- New: `clockStatusResponseSchema` — { users: { pubkey, startedAt, lastHeartbeat }[] }

### Schema registry

All new schemas registered in `packages/protocol/tools/schema-registry.ts` for codegen to Swift Codable structs and Kotlin `@Serializable` data classes.

### New crypto labels in `packages/protocol/crypto-labels.json`

| Label | Purpose |
|-------|---------|
| LABEL_SHIFT_NAME | Shift name encryption |
| LABEL_RING_GROUP_NAME | Ring group name encryption |
| LABEL_SHIFT_OVERRIDE_NOTE | Override note encryption |
| LABEL_AVAILABILITY_REASON | Availability block reason encryption |

Codegen'd to TS/Swift/Kotlin constants via existing pipeline.

---

## Desktop UI

### Shifts page restructuring

The existing `src/client/routes/shifts.tsx` evolves from a flat page into a tabbed layout:

**Tab 1: Schedule** (default)
- Weekly calendar visualization — 7-column grid showing shifts per day with time blocks
- Color-coded by ring group (neutral for direct-assignment shifts)
- Override indicators (strikethrough for cancelled, highlighted for substituted)
- Click shift block to view/edit
- "Create Shift" button in header

**Tab 2: Ring Groups**
- List of ring groups with member counts
- Expand to see members, add/remove via `UserMultiSelect`
- Create/edit/delete ring groups
- Encrypted name display (decrypt with hub key)

**Tab 3: Overrides**
- Date-range picker to filter view
- List of upcoming overrides with type badge (cancel/substitute)
- Create override: pick shift (or "all shifts"), pick date, choose cancel or substitute, pick replacement volunteers for substitute, optional encrypted note
- Delete override

**Tab 4: Requests** (badge with pending count)
- List of pending join/leave requests
- Approve/deny buttons
- History of resolved requests (collapsed by default)

### Volunteer-facing elements (non-admin, visible to all)

**Header area:**
- Clock in/out toggle (prominent, evolves from current break button)
- Current status indicator: "Online — Morning Shift" or "Offline"

**My Schedule card:**
- Next 7 days with assigned shifts
- Availability block submission ("Mark unavailable" → date range picker + optional reason)
- My availability blocks listed with delete option

**Shift join/leave:**
- On unassigned shifts: "Request to join" button
- On assigned shifts: "Request to leave" button
- Pending request status display

### Migration to React Query

Replace `useState` + `useEffect` fetch pattern with React Query hooks.

**New query hooks in `src/client/lib/queries/shifts.ts`:**

| Hook | Key | Stale Time | Notes |
|------|-----|-----------|-------|
| useShifts(hubId) | ['shifts', hubId, 'list'] | 5 min | List + decrypt names |
| useShiftStatus() | ['shifts', hubId, 'my-status'] | 60s | Current/next shift |
| useFallbackGroup(hubId) | ['shifts', hubId, 'fallback'] | 5 min | Fallback pubkeys |
| useRingGroups(hubId) | ['ring-groups', hubId, 'list'] | 5 min | List + decrypt names |
| useRingGroupMembers(rgId) | ['ring-groups', hubId, rgId, 'members'] | 5 min | Member list |
| useShiftOverrides(hubId, from, to) | ['shifts', hubId, 'overrides', {from, to}] | 5 min | Date-range filtered |
| useAvailabilityBlocks(hubId) | ['availability', hubId, 'mine'] | 5 min | Own blocks |
| useAllAvailabilityBlocks(hubId) | ['availability', hubId, 'all'] | 5 min | Admin: all users |
| useShiftJoinRequests(hubId) | ['shift-requests', hubId, 'pending'] | 2 min | Admin: pending |
| useMyShiftJoinRequests(hubId) | ['shift-requests', hubId, 'mine'] | 2 min | Own requests |
| useClockStatus(hubId) | ['shifts', hubId, 'clock-status'] | 30s | Who's online |

**Mutation → cache invalidation map:**

| Mutation | Invalidates |
|----------|------------|
| createShift / updateShift / deleteShift | shifts list, my-status |
| setFallbackGroup | fallback |
| createOverride / deleteOverride | overrides (prefix), my-status |
| clockIn / clockOut | clock-status, my-status |
| createRingGroup / updateRingGroup / deleteRingGroup | ring-groups list |
| addRingGroupMembers / removeRingGroupMember | ring-group members, ring-groups list (member count) |
| createAvailabilityBlock / deleteAvailabilityBlock | availability mine, availability all |
| submitJoinRequest | shift-requests mine, shift-requests pending |
| reviewJoinRequest | shift-requests pending, shifts list (user added/removed) |

**Optimistic updates** for: clock in/out toggle, availability block delete, join request approve/deny.

**WebSocket-driven invalidation** — new event types trigger cache invalidation:
- `shift:clockIn` / `shift:clockOut` → clock status
- `shift:overrideCreated` → overrides + my-status
- `shift:requestReceived` → pending requests (admin)
- `shift:requestReviewed` → my requests + shift list (volunteer)

Stale times are safety-net polling; most updates arrive via WebSocket.

**Error handling:** All mutations use `onError` to roll back optimistic updates. Toast notifications for mutation failures.

### Hub-key encryption integration

- Client pre-generates UUID for new records (AAD binding)
- Decrypt in query hooks: shift names, ring group names, override notes, availability reasons
- Crypto labels from codegen'd constants (never raw strings)

---

## Mobile — iOS & Android

### iOS (SwiftUI) — `apps/ios/Sources/Views/Shifts/`

**ShiftScheduleView** — main entry from hub tab:
- My upcoming shifts (next 7 days, cards with day/time/name)
- Current status banner ("Online — Morning Shift" / "Offline")
- Clock in/out button (prominent)
- Availability section: my blocks + "Add unavailable dates" sheet

**ShiftDetailView** — tapped from schedule:
- Shift info (name, time, days, volunteers or ring group)
- "Request to join" / "Request to leave" button
- Pending request status

**ShiftAdminView** — visible with shift admin permissions:
- NavigationStack tabs: Shifts / Ring Groups / Overrides / Requests
- Full CRUD for each entity
- Request approval with approve/deny

**AvailabilityBlockSheet** — date range picker + optional encrypted reason

**Dashboard integration** — `ShiftStatusCard` on hub dashboard showing current/next shift and online status.

### Android (Kotlin/Compose) — `apps/android/app/src/main/kotlin/.../ui/shifts/`

Mirror of iOS feature set:

**ShiftScheduleScreen** — `@Composable`, Hilt-injected ViewModel. My shifts, status, clock in/out, availability.

**ShiftDetailScreen** — shift info + join/leave request.

**ShiftAdminScreen** — `TabRow` + `HorizontalPager` for shifts, ring groups, overrides, requests.

**AvailabilityBlockDialog** — Material 3 date range picker + optional reason.

**ViewModels:** `ShiftScheduleViewModel`, `ShiftAdminViewModel`, `RingGroupViewModel`, `ShiftOverrideViewModel`, `ShiftRequestViewModel`.

### Encryption on mobile

Both platforms use `CryptoService.decryptHubField()` — iOS via UniFFI XCFramework, Android via JNI `.so`. Same pattern as other encrypted hub data.

### i18n

New keys in `packages/i18n/locales/en.json`:
- `ringGroups.*` — ring group CRUD strings
- `availability.*` — availability block strings
- `shiftRequests.*` — join/leave request strings
- Additional `shifts.*` keys for clock-in/out status, override management

Existing `shifts.*` keys (~50+) cover basic CRUD. Codegen produces iOS `.strings` and Android `strings.xml` + `I18n.kt`.

### Platform parity

| Feature | Desktop | iOS | Android |
|---------|---------|-----|---------|
| View my schedule | Yes | Yes | Yes |
| Clock in/out | Yes | Yes | Yes |
| Shift status on dashboard | Yes | Yes | Yes |
| Availability blocks | Yes | Yes | Yes |
| Join/leave requests | Yes | Yes | Yes |
| Shift CRUD (admin) | Yes | Yes | Yes |
| Ring group CRUD (admin) | Yes | Yes | Yes |
| Override management (admin) | Yes | Yes | Yes |
| Request approval (admin) | Yes | Yes | Yes |
| Weekly calendar visualization | Yes | No (list) | No (list) |
| Fallback group config | Yes | Yes | Yes |

Mobile uses list-based schedule views rather than a weekly calendar grid.

---

## Audit Events

| Event | Trigger |
|-------|---------|
| shiftCreated | Shift created (existing) |
| shiftEdited | Shift updated (existing) |
| shiftDeleted | Shift deleted (existing) |
| shiftClockIn | User clocks in |
| shiftClockOut | User clocks out |
| shiftForceClockOut | Admin force clock-out |
| shiftOverrideCreated | Override created |
| shiftOverrideDeleted | Override deleted |
| shiftJoinRequested | User submits join/leave request |
| shiftJoinApproved | Request approved |
| shiftJoinDenied | Request denied |
| availabilityBlockCreated | User creates availability block |
| availabilityBlockDeleted | User deletes availability block |
| ringGroupCreated | Ring group created |
| ringGroupUpdated | Ring group updated |
| ringGroupDeleted | Ring group deleted |
| ringGroupMemberAdded | Member added to ring group |
| ringGroupMemberRemoved | Member removed from ring group |

---

## Scope

### In scope

- Ring groups: DB schema, protocol schemas, backend routes, CRUD on all platforms
- Shift overrides: DB schema, protocol schemas, backend routes, admin UI on all platforms
- Server-side clock-in/out with WebSocket heartbeat liveness
- User availability blocks: DB schema, protocol schemas, CRUD on all platforms
- Shift join/leave requests with approval workflow on all platforms
- Desktop: migrate to React Query, hub-encrypted names, weekly calendar, tabbed admin
- iOS: schedule view, clock-in/out, availability, admin CRUD, dashboard status card
- Android: schedule view, clock-in/out, availability, admin CRUD, dashboard status card
- Routing pipeline evolution (overrides, ring group resolution, clock-in filter, availability filter)
- New crypto labels for encrypted fields
- Protocol codegen for Swift/Kotlin types
- i18n for all new strings across 13 locales (via packages/i18n codegen)
- Audit events for all new operations

### Out of scope

- Automated shift swap/trade between volunteers (future epic)
- Shift analytics / coverage reports (EP04 — Analytics)
- Calendar sync (Google Calendar, Apple Calendar)
- Voice IVR shift announcements to callers
- Push reminder wiring (table exists, separate integration concern)
- Recurring availability patterns (date ranges only)

---

## References

- v1 shift routes: `/home/rikki/projects/llamenos-hotline/src/server/routes/shifts.ts`
- v1 shift service: `/home/rikki/projects/llamenos-hotline/src/server/services/shifts.ts`
- v1 shift DB schema: `/home/rikki/projects/llamenos-hotline/src/server/db/schema/shifts.ts`
- v1 React Query hooks: `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/shifts.ts`
- v1 shift page: `/home/rikki/projects/llamenos-hotline/src/client/routes/shifts.tsx`
- v2 backend routes: `apps/worker/routes/shifts.ts`
- v2 DB schema: `apps/worker/db/schema/shifts.ts`
- v2 protocol schemas: `packages/protocol/schemas/shifts.ts`
- v2 desktop page: `src/client/routes/shifts.tsx`
- v2 shift status hook: `src/client/lib/hooks.ts`
- v2 ringing service: `apps/worker/services/ringing.ts`
- v2 entity router factory: `apps/worker/lib/entity-router.ts`
- EP03 spec (teams): `docs/superpowers/specs/2026-05-11-EP03-teams-tags-design.md`
