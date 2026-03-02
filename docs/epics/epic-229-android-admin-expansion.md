# Epic 229: Android Admin Panel Expansion

## Goal

Implement Android UI for admin features currently stubbed in BDD step definitions: volunteer CRUD, audit log filters, shift scheduling admin, custom fields admin, bulk ban import, and reports. Mobile should provide consistent feature coverage with desktop but does not need identical UX — mobile-appropriate layouts and interactions are expected.

## Design Principles

- **Feature parity, not UX parity**: Android implements the same features as desktop but with mobile-native interaction patterns (bottom sheets instead of sidebars, simplified list views, etc.)
- **Volunteer self-sufficiency**: Volunteers should be able to do everything they need from mobile — answer calls, write notes, view their schedule, manage their profile
- **Admin operational tasks on mobile**: Admins should be able to handle most day-to-day operational tasks from mobile — volunteer management, shift scheduling, ban lists, audit review
- **No full hub management from mobile**: Technical configuration (telephony provider setup, IVR settings, relay configuration, encryption policies) is NOT in scope for mobile. These are desktop-only admin tasks that are configured once during hub setup, not managed on the go

## Context

After Epic 228, 498 step definitions exist but many admin features are stubs — the UI doesn't exist yet on Android. This epic builds the production Compose UI and wires up API calls through `AdminViewModel` and `ApiService`. The scope is limited to operational admin features — technical hub configuration remains desktop-only.

## Architecture Patterns (from existing codebase)

All new UI follows the established patterns:
- **State**: `MutableStateFlow<XxxUiState>` in `@HiltViewModel`
- **API**: `apiService.request<T>("METHOD", "/api/path", body?)` / `apiService.requestNoContent()`
- **Compose**: Material 3, `Scaffold`, `TopAppBar`, `LazyColumn`, `AlertDialog`, `OutlinedTextField`
- **TestTags**: Every interactive element gets `.testTag("kebab-case-tag")`
- **Loading/empty/error/list**: Standard 4-state pattern with testTags `feature-loading`, `feature-empty`, `feature-list`, `feature-error`

## Implementation

### 1. Volunteer CRUD (VolunteersTab expansion)

**Files modified**: `VolunteersTab.kt`, `AdminViewModel.kt`, `AdminModels.kt`

Add to `VolunteersTab`:
- FAB with `testTag("create-volunteer-fab")`
- `AddVolunteerDialog` (AlertDialog): name field, phone field with E.164 validation, role selector (Select), Save/Cancel
- After save: nsec display card with copy button (`created-volunteer-nsec`)
- Phone validation: must match `^\+\d{7,15}$`, show inline "invalid phone" error
- Delete button on each `VolunteerCard` with confirmation dialog

Add to `AdminViewModel`:
```kotlin
fun createVolunteer(name: String, phone: String, role: String)
fun deleteVolunteer(id: String)
```

API endpoints (already exist on server):
- `POST /api/admin/volunteers` → `CreateVolunteerResponse(volunteer, nsec)`
- `DELETE /api/admin/volunteers/:id`

New models in `AdminModels.kt`:
```kotlin
@Serializable data class CreateVolunteerRequest(val name: String, val phone: String, val role: String)
@Serializable data class CreateVolunteerResponse(val volunteer: Volunteer, val nsec: String)
```

TestTags: `create-volunteer-fab`, `volunteer-name-input`, `volunteer-phone-input`, `volunteer-role-select`, `confirm-create-volunteer`, `cancel-create-volunteer`, `created-volunteer-nsec`, `dismiss-nsec-card`, `delete-volunteer-{id}`, `confirm-delete-volunteer`

### 2. Audit Log Filters (AuditLogTab expansion)

**Files modified**: `AuditLogTab.kt`, `AdminViewModel.kt`

Add filter bar above the LazyColumn:
- Search `OutlinedTextField` with `testTag("audit-search")`
- Event type dropdown (ExposedDropdownMenuBox) with `testTag("audit-event-filter")`
  - Categories: All Events, Authentication, Volunteers, Calls, Settings, Shifts, Notes
- Date range: two date picker fields (`audit-date-from`, `audit-date-to`)
- Clear button (shown only when filters active) `testTag("audit-clear-filters")`

Add to `AdminViewModel`:
```kotlin
val auditSearchQuery: MutableStateFlow<String>
val auditEventFilter: MutableStateFlow<String>  // "all", "auth", "volunteers", etc.
val auditDateFrom: MutableStateFlow<String?>
val auditDateTo: MutableStateFlow<String?>
fun clearAuditFilters()
```

API: Query params already supported by `/api/admin/audit?search=&eventType=&dateFrom=&dateTo=`

TestTags: `audit-search`, `audit-event-filter`, `audit-date-from`, `audit-date-to`, `audit-clear-filters`

### 3. Admin Shift Scheduling (ShiftsScreen expansion)

**Files modified**: `ShiftsScreen.kt`, `ShiftsViewModel.kt`, `ShiftModels.kt`

When user is admin, show additional UI:
- "Shift Schedule" heading (`shifts-heading`)
- "Create Shift" button (`create-shift-button`)
- "Fallback Group" section at bottom
- Per-shift Edit/Delete buttons (admin-only)

New composable `ShiftCreateEditDialog`:
- Shift name field (`shift-name-input`)
- Start time picker (`shift-start-time`) — `OutlinedTextField` with time format
- End time picker (`shift-end-time`)
- Volunteer assignment multi-select (chips)
- Save/Cancel buttons

New composable `FallbackGroupCard`:
- Volunteer chip list with add/remove
- Uses volunteer list from `AdminViewModel`

Add to `ShiftsViewModel`:
```kotlin
fun createShift(name: String, startTime: String, endTime: String, volunteerIds: List<String>)
fun updateShift(id: String, ...)
fun deleteShift(id: String)
fun setFallbackGroup(volunteerIds: List<String>)
```

API endpoints (already exist):
- `POST /api/admin/shifts` → create
- `PUT /api/admin/shifts/:id` → update
- `DELETE /api/admin/shifts/:id` → delete
- `PUT /api/admin/shifts/fallback` → set fallback group

New models in `ShiftModels.kt`:
```kotlin
@Serializable data class CreateShiftRequest(val name: String, val startTime: String, val endTime: String, val days: List<Int>, val volunteerIds: List<String>)
@Serializable data class FallbackGroupRequest(val volunteerIds: List<String>)
@Serializable data class ShiftDetailResponse(val id: String, val name: String, val startTime: String, val endTime: String, val days: List<Int>, val volunteers: List<Volunteer>, val volunteerCount: Int)
```

TestTags: `shifts-heading`, `create-shift-button`, `shift-name-input`, `shift-start-time`, `shift-end-time`, `shift-form`, `shift-edit-{id}`, `shift-delete-{id}`, `fallback-group-card`, `fallback-volunteer-{pubkey}`

### 4. Custom Fields Admin (new CustomFieldsTab)

**New files**: `CustomFieldsTab.kt`
**Files modified**: `AdminScreen.kt`, `AdminViewModel.kt`, `AdminModels.kt`

Add 5th admin tab `AdminTab.CUSTOM_FIELDS` ("Fields"):
- Custom field list with reorder, edit, delete
- "Add Field" FAB
- `CustomFieldCreateEditDialog`:
  - Label field (auto-generates slug)
  - Type selector (text, number, select, checkbox, textarea)
  - For "select": dynamic options list with add/remove
  - Required toggle
  - Visible to volunteers toggle
  - Editable by volunteers toggle
  - Context selector (notes, reports, all)
  - Save/Cancel

Add to `AdminViewModel`:
```kotlin
val customFields: List<CustomFieldDefinition>
fun loadCustomFields()
fun createCustomField(field: CustomFieldDefinition)
fun updateCustomField(field: CustomFieldDefinition)
fun deleteCustomField(id: String)
fun reorderCustomFields(orderedIds: List<String>)
```

API endpoints:
- `GET /api/admin/custom-fields`
- `PUT /api/admin/custom-fields` (replaces entire array — matches desktop pattern)

TestTags: `admin-tab-fields`, `fields-loading`, `fields-empty`, `fields-list`, `create-field-fab`, `field-card-{id}`, `field-label-input`, `field-type-select`, `field-required-toggle`, `field-option-{index}`, `add-field-option`, `confirm-field-save`, `delete-field-{id}`

### 5. Bulk Ban Import (BanListTab expansion)

**Files modified**: `BanListTab.kt`, `AdminViewModel.kt`

Add "Import" button next to FAB:
- `BulkBanImportDialog`:
  - Multi-line `OutlinedTextField` (6 rows min) for phone numbers, one per line
  - Reason field
  - Submit button
  - Validation: each line must match E.164 format

Add to `AdminViewModel`:
```kotlin
fun bulkImportBans(phones: List<String>, reason: String)
```

API: `POST /api/admin/bans/bulk` → `BulkBanRequest(phones, reason)`

TestTags: `import-ban-button`, `bulk-ban-textarea`, `bulk-ban-reason`, `submit-bulk-import`

### 6. Conversation Actions (ConversationDetailScreen expansion)

**Files modified**: `ConversationDetailScreen.kt`, `ConversationsViewModel.kt`

Add admin action bar to conversation detail:
- "Assign" dropdown button (volunteer picker) — admin only
- "Close" button — changes status to closed
- "Reopen" button (for closed conversations)
- Assigned volunteer display chip
- Search input on conversations list screen

Add to `ConversationsViewModel`:
```kotlin
fun assignConversation(conversationId: String, volunteerPubkey: String)
fun closeConversation(conversationId: String)
fun reopenConversation(conversationId: String)
fun searchConversations(query: String)
```

TestTags: `assign-conversation-button`, `close-conversation-button`, `reopen-conversation-button`, `assigned-volunteer-chip`, `conversation-search`

## Step Definition Updates

After UI is built, update stub step definitions in:
- `AdminSteps.kt` — audit filter/search now real
- `BanSteps.kt` — bulk import now real
- `VolunteerSteps.kt` — volunteer creation/nsec display now real
- `ShiftSteps.kt` — admin CRUD now real
- `CustomFieldSteps.kt` — admin fields management now real
- `ConversationSteps.kt` — assign/close/reopen now real
- `GenericSteps.kt` — event type filter/date range now real

## Verification

```bash
cd apps/android && ./gradlew assembleDebugAndroidTest  # Compiles
cd apps/android && ./gradlew lintDebug                  # No regressions
cd apps/android && ./gradlew testDebugUnitTest          # Unit tests pass
```

## Dependency

- Requires Epic 228 (step definitions exist to test against)
- Parallel with Epic 230 (settings/polish)
