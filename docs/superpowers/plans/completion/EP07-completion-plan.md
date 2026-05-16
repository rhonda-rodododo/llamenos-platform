# EP07 — Shift Management — Completion Plan

## Scope

### Already Done (~75%)
- All DB tables: shifts, ring_groups, ring_group_members, shift_overrides, user_availability_blocks, shift_join_requests, active_shifts
- All protocol schemas for shifts, ring-groups, overrides, availability, requests
- Full backend routes: clock-in/out, overrides, availability, requests
- Ring group CRUD + member management
- All services: shifts, ring-groups, shift-overrides, active-shifts, shift-availability, shift-requests
- Desktop UI: 6-tab shifts page (schedule, ring groups, overrides, availability, requests, active)
- Standalone panels: overrides-panel, ring-groups-panel
- Clock-in/out toggle in header
- All permissions
- iOS basic schedule view
- Android basic schedule view + ViewModel
- BDD: `shift-management.feature` (all passing)

### Remaining Work
- i18n namespaces incomplete (`availability.*`, `shiftRequests.*`, `shiftOverrides.*`)
- React Query cache invalidation patterns not fully verified
- iOS admin shift views entirely missing (ring groups, overrides, join/leave requests, approval)
- Android admin shift views entirely missing (same gaps)
- Mobile clock-in/out not confirmed

## Tasks (ordered by dependency)

### Task 1: Complete i18n namespaces
- **Platform**: all
- **Files**:
  - `packages/i18n/locales/*.json` — add missing namespaces across 13 locales
- **What**: Add missing i18n keys: `availability.*` (availability block strings: markUnavailable, startDate, endDate, reason, noBlocks, deleteConfirm), `shiftRequests.*` (join/leave request strings: requestJoin, requestLeave, pending, approved, denied, approve, deny, noRequests), `shiftOverrides.*` (override management: createOverride, cancel, substitute, selectShift, allShifts, pickDate, replacementVolunteers, note, deleteConfirm), additional `shifts.*` keys for clock-in/out status text. Run `bun run i18n:codegen` + `bun run i18n:validate:all`.
- **Spec reference**: i18n section of EP07 spec
- **Acceptance**: `bun run i18n:validate:all` passes; all shift-related UI strings localized across 13 locales

### Task 2: Verify React Query cache invalidation
- **Platform**: desktop
- **Files**:
  - `src/client/lib/queries/shifts.ts` (if exists, or wherever shift hooks live)
  - `src/client/routes/shifts.tsx`
- **What**: Audit all shift-related React Query hooks and mutations to verify the cache invalidation map from the spec is implemented: createShift→shifts list+my-status, clockIn/clockOut→clock-status+my-status, createOverride→overrides+my-status, reviewJoinRequest→pending requests+shifts list, etc. Verify WebSocket-driven invalidation for `shift:clockIn`, `shift:clockOut`, `shift:overrideCreated`, `shift:requestReceived`, `shift:requestReviewed` events. Fix any gaps.
- **Spec reference**: Migration to React Query — Mutation → cache invalidation map, WS-driven invalidation
- **Acceptance**: All mutations invalidate correct query keys; WS events trigger cache invalidation

### Task 3: iOS admin shift views — ring groups
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Shifts/ShiftAdminView.swift` (new)
  - `apps/ios/Sources/Views/Shifts/RingGroupsView.swift` (new)
  - `apps/ios/Sources/Views/Shifts/RingGroupDetailView.swift` (new)
  - `apps/ios/Sources/Services/ShiftAdminService.swift` (new or extend)
- **What**: SwiftUI admin view with NavigationStack tabs: Shifts / Ring Groups / Overrides / Requests. Ring Groups tab: list with member counts, tap to expand members, add/remove members, create/edit/delete ring groups. Encrypted names decrypted via `CryptoService.decryptHubField()` with `LABEL_RING_GROUP_NAME`. Gated by `shifts:manage-ring-groups` permission.
- **Spec reference**: Mobile — iOS (ShiftAdminView), Platform parity table
- **Acceptance**: Ring group CRUD works on iOS; members manageable; encrypted names decrypted

### Task 4: iOS admin shift views — overrides, requests, clock-in
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Shifts/OverridesView.swift` (new)
  - `apps/ios/Sources/Views/Shifts/ShiftRequestsView.swift` (new)
  - `apps/ios/Sources/Views/Shifts/AvailabilityBlockSheet.swift` (new)
- **What**: Overrides tab: list upcoming overrides with type badges (cancel/substitute), create override (pick shift or "all shifts", pick date, type, replacement volunteers for substitute, optional encrypted note). Requests tab: list pending join/leave requests with approve/deny buttons, resolved request history. Availability: "Mark unavailable" button → date range picker sheet + optional encrypted reason. Clock-in/out button on main shift view. All encrypted fields use appropriate crypto labels.
- **Spec reference**: Mobile — iOS (ShiftAdminView, AvailabilityBlockSheet)
- **Acceptance**: Override CRUD, request approval, availability blocks, and clock-in/out all work on iOS

### Task 5: Android admin shift views — ring groups
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/ShiftAdminScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/RingGroupsScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/RingGroupViewModel.kt` (new)
- **What**: Material 3 Compose admin screen with `TabRow` + `HorizontalPager`. Ring Groups tab: list with member counts, expand to manage members, CRUD. Hilt-injected ViewModel. Encrypted name decryption via `CryptoService.decryptHubField()`.
- **Spec reference**: Mobile — Android (ShiftAdminScreen), Platform parity table
- **Acceptance**: Ring group CRUD works on Android; Material 3 design

### Task 6: Android admin shift views — overrides, requests, clock-in
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/OverridesScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/ShiftRequestsScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/AvailabilityBlockDialog.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/ShiftOverrideViewModel.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/ShiftRequestViewModel.kt` (new)
- **What**: Mirror iOS admin functionality: overrides tab (list, create cancel/substitute), requests tab (pending list, approve/deny), availability block dialog (Material 3 date range picker + reason), clock-in/out button. All encrypted fields decrypted via crypto service.
- **Spec reference**: Mobile — Android, Platform parity table
- **Acceptance**: All admin shift features work on Android

### Task 7: Mobile clock-in/out + dashboard integration
- **Platform**: iOS, Android
- **Files**:
  - iOS: `apps/ios/Sources/Views/Shifts/ShiftsView.swift` — add clock-in/out button
  - iOS: `apps/ios/Sources/Views/Dashboard/ShiftStatusCard.swift` (new or modify)
  - Android: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/shifts/ShiftsScreen.kt` — add clock-in/out
  - Android: dashboard integration
- **What**: Prominent clock-in/out toggle on the main shift view for both platforms. Calls `POST /shifts/clock/in` and `POST /shifts/clock/out`. Starts/stops WebSocket heartbeat interval (30s `shift:heartbeat` messages). Dashboard status card showing current/next shift and online/offline status.
- **Spec reference**: Clock-in lifecycle, Mobile — iOS/Android (ShiftStatusCard)
- **Acceptance**: Clock-in/out works on both platforms; heartbeat maintains liveness; dashboard card shows status
