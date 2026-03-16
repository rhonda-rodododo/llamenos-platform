# Epic 353: Mobile Feature Parity — Missing Screens (iOS + Android)

**Status**: TODO
**Priority**: High
**Depends on**: Epic 341 (Hub Context), Epic 344/345 (Mobile CMS Case Views), Epic 348 (Codegen Wiring)
**Branch**: `desktop`

## Summary

Desktop has several admin/management screens backed by existing worker API endpoints that have no mobile equivalent. This epic adds six feature areas to both iOS (SwiftUI) and Android (Compose), bringing mobile to near-parity with the desktop app. Every screen reuses existing API routes — no backend work required.

## Problem Statement

Mobile users (especially admins doing field work) cannot:
- Switch between hubs or manage hub settings
- View or create events (CMS event entities with time/location/sub-events)
- Search the contact directory by name trigrams or browse contact profiles with relationships
- Triage reports into cases (view pending reports, convert to cases)
- Browse entity type schemas defined for their hub
- Configure on-device transcription settings (iOS already has `TranscriptionSettingsView` but Android lacks equivalent)

All of these have working desktop UIs and backend APIs. The gap is purely in the native mobile clients.

## Existing Infrastructure

### Desktop Reference Implementations
| Feature | Desktop File | Key Components |
|---------|-------------|----------------|
| Hub Management | `src/client/routes/__root.tsx`, `src/client/components/hub-switcher.tsx` | `HubSwitcher` dropdown in sidebar, `useConfig().hubs/currentHubId/setCurrentHubId` |
| Events | `src/client/routes/events.tsx` | List/detail split view, `category === 'event'` entity type filter, `CreateRecordDialog`, `CaseTimeline` |
| Contact Directory | `src/client/routes/contacts-directory.tsx`, `src/client/components/contacts/contact-profile.tsx` | Trigram search, type filter, `ContactProfile` with tabs (Profile/Identifiers/Cases/Relationships/Groups), E2EE decrypt |
| Triage | `src/client/routes/triage.tsx` | Status tabs (pending/in_progress/completed), `TriageReportContent`, `TriageCaseCreationPanel`, `TriageLinkedCases` |
| Schema Browser | `src/client/routes/admin.case-management.tsx` (entity-types section) | Entity type list, field definitions, status definitions, enum values |
| Transcription | `src/client/routes/settings.tsx` (transcription section) | WASM Whisper config, model selection, language |

### Worker API Endpoints (all existing, no changes needed)

**Hubs** (SettingsDO):
- `GET /settings/hubs` — list all hubs
- `POST /settings/hubs` — create hub
- `GET /settings/hub/:id` — hub detail
- `PATCH /settings/hub/:id` — update hub
- `DELETE /settings/hub/:id` — archive hub
- `GET /settings/hub/:id/settings` — hub-specific settings
- `PUT /settings/hub/:id/settings` — update hub settings

**Events** (`apps/worker/routes/events.ts`):
- `GET /api/events?page=&limit=&eventTypeHash=&statusHash=&parentEventId=&startAfter=&startBefore=` — paginated list with filters
- `GET /api/events/:id` — single event detail
- `POST /api/events` — create event (auto-generates case number if entity type has numbering)
- `PATCH /api/events/:id` — update event
- `POST /api/events/:id/records` — link record to event
- `POST /api/events/:id/reports` — link report to event

**Contacts V2** (`apps/worker/routes/contacts-v2.ts`):
- `GET /api/contacts-v2?page=&limit=&contactTypeHash=&statusHash=&nameToken=` — paginated list with blind index filters
- `GET /api/contacts-v2/search?tokens=` — trigram name search
- `GET /api/contacts-v2/lookup/:identifierHash` — lookup by phone/email hash
- `GET /api/contacts-v2/:id` — contact detail with E2EE envelopes
- `GET /api/contacts-v2/:id/relationships` — contact relationships
- `GET /api/contacts-v2/:id/groups` — affinity groups
- `GET /api/contacts-v2/:id/cases` — linked cases

**Triage** (via `apps/worker/routes/reports.ts`):
- `GET /api/reports?conversionEnabled=true&conversionStatus=pending|in_progress|completed&page=&limit=` — triage queue
- `PATCH /api/reports/:id` with `{ conversionStatus: ... }` — update conversion status
- `POST /api/records` — create case record (pre-filled from report)

**Entity Schema** (`apps/worker/routes/entity-schema.ts`):
- `GET /api/settings/cms/entity-types` — list entity types
- `GET /api/settings/cms/entity-types/:id` — single entity type with fields, statuses, enums
- `GET /api/settings/cms/relationship-types` — relationship type definitions

### Existing Mobile Code to Build On

**iOS**:
- `ContactsView.swift` — basic contact list with search (phone-hash based, not trigram). Enhance with directory search
- `TranscriptionSettingsView.swift` — already complete (toggle, language picker, privacy notice)
- `AdminTranscriptionSettingsView.swift` — admin toggle for global transcription settings
- `CaseListView.swift` / `CaseDetailView.swift` — template-driven case views (pattern to follow)
- `APIService.swift` — Schnorr-authenticated HTTP client
- `CryptoService` — singleton for E2EE decryption of contact profiles

**Android**:
- `ContactsScreen.kt` — basic contacts with phone-hash search. Enhance with directory search
- `CaseListScreen.kt` / `CaseDetailScreen.kt` — template-driven case views (pattern to follow)
- `ApiService.kt` + `AuthInterceptor` — authenticated HTTP
- `CryptoService` — singleton for E2EE

### i18n Strings (existing in `en.json`)
Many strings already exist from desktop implementation:
- `hubs.*` — hub management strings (createHub, editHub, hubName, etc.)
- `events.*` / `caseManagement.events` — event-related strings
- `contactDirectory.*` — contact profile tabs, search, types
- `triage.*` — triage queue status tabs, conversion
- `entityType.*` — schema-related labels

New strings needed primarily for mobile-specific UX (e.g., bottom sheet titles, compact labels). Estimate ~30 new keys across all 6 features. All must be added to 13 locales via `bun run i18n:codegen`.

---

## Phase 1: Hub Management (iOS + Android)

### Screens

**Hub List / Switcher**:
- Show in settings or as a navigation element (iOS: Settings section; Android: Settings section)
- List hubs with name, member count badge
- Active hub highlighted
- Tap to switch (reloads all hub-scoped data)
- Single-hub users: hide switcher entirely (match desktop `isMultiHub` logic)

**Hub Detail View** (admin only):
- Hub name, slug, description, phone number
- Member count
- Edit button (admin) opens edit form

**Create/Edit Hub Form** (admin only):
- Fields: name, description, phone number (E.164 via `PhoneInput` equivalent)
- Validation matching desktop

### iOS Implementation

New files:
- `apps/ios/Sources/Views/Hubs/HubListView.swift` — List of hubs with switch action
- `apps/ios/Sources/Views/Hubs/HubDetailView.swift` — Hub detail + edit form
- `apps/ios/Sources/ViewModels/HubViewModel.swift` — @Observable, fetches from `/settings/hubs`
- `apps/ios/Sources/Models/Hub.swift` — Codable model (if not already in codegen output)

Integration:
- Add "Hubs" section to `SettingsView.swift` (below Account, above Preferences)
- Show active hub name in section header
- `NavigationLink` to `HubListView`
- On hub switch: update `AppState.activeHubId`, trigger data reload across all tabs

### Android Implementation

New files:
- `apps/android/.../ui/hubs/HubListScreen.kt` — Compose list with switch action
- `apps/android/.../ui/hubs/HubDetailScreen.kt` — Detail + edit form
- `apps/android/.../ui/hubs/HubViewModel.kt` — Hilt @HiltViewModel, fetches from `/settings/hubs`

Integration:
- Add "Hubs" section to `SettingsScreen.kt`
- On hub switch: update shared preferences / state holder, trigger data reload

### Accessibility Identifiers
- `hub-list`, `hub-row-{id}`, `hub-switch-btn-{id}`, `hub-active-badge`
- `hub-detail-name`, `hub-detail-description`, `hub-edit-btn`
- `hub-create-btn`, `hub-form-name`, `hub-form-description`, `hub-form-phone`, `hub-form-save`

### Permissions
- View hubs: any authenticated user
- Create/edit/archive hubs: `settings:manage` permission

---

## Phase 2: Events Screen (iOS + Android)

### Screens

**Event List**:
- Fetch entity types with `category === 'event'`, show as filter tabs (if multiple event types)
- Paginated list of events with: title (from `caseNumber` or first text field), status pill, date, linked record/report count
- Pull-to-refresh
- Search bar (filter by blind index fields)
- FAB / "+" button to create event (requires `events:create`)

**Event Detail**:
- Header: case number, status pill, entity type badge
- Template-driven field display (reuse `SchemaForm` equivalent from case detail)
- Tabs: Details / Timeline / Linked Records / Linked Reports
- Status change via bottom sheet (iOS) / ModalBottomSheet (Android)
- Link record/report actions

**Create Event Form**:
- Entity type picker (if multiple event types)
- Template-driven field form (reuse case creation patterns)
- Date/time pickers for event timing fields
- Location field

### iOS Implementation

New files:
- `apps/ios/Sources/Views/Events/EventListView.swift` — List with entity type tabs
- `apps/ios/Sources/Views/Events/EventDetailView.swift` — Detail with tabs
- `apps/ios/Sources/Views/Events/EventCreateView.swift` — Create form
- `apps/ios/Sources/ViewModels/EventsViewModel.swift` — @Observable

Integration:
- Add Events tab to `MainTabView.swift` or as a navigation destination from Dashboard
- Consider: if tab bar is already full (6 tabs), events could be a section within the Cases tab or accessible from Dashboard quick actions

### Android Implementation

New files:
- `apps/android/.../ui/events/EventListScreen.kt` — List with ScrollableTabRow for entity types
- `apps/android/.../ui/events/EventDetailScreen.kt` — Detail with tab row
- `apps/android/.../ui/events/EventCreateScreen.kt` — Create form
- `apps/android/.../ui/events/EventsViewModel.kt` — @HiltViewModel

Integration:
- Add Events as a navigation destination. Android currently has 5 bottom nav items (Dashboard, Notes, Conversations, Shifts, Settings). Events could be accessible from Dashboard or via a "More" pattern.

### Accessibility Identifiers
- `event-list`, `event-card-{id}`, `event-status-pill`, `event-type-tab-{id}`
- `event-detail-header`, `event-detail-tabs`, `event-timeline`, `event-linked-records`, `event-linked-reports`
- `event-create-btn`, `event-form-type-picker`, `event-form-save`

### Permissions
- `events:read` — view events
- `events:create` — create events
- `events:update` — edit events, change status

---

## Phase 3: Contact Directory Enhancement (iOS + Android)

### Current State
Both platforms have `ContactsView`/`ContactsScreen` showing contacts by phone hash with basic search. The desktop contact directory (`contacts-directory.tsx`) has significantly more capability:
- Trigram name search via `/api/contacts-v2/search?tokens=`
- Contact type filter (individual, organization, legal_entity, government)
- Full profile viewer with tabs (Profile, Identifiers, Cases, Relationships, Groups)
- E2EE decryption of contact summary and PII tiers

### Enhancements

**Trigram Search**:
- Replace or supplement the existing phone-hash search with trigram name search
- As user types, generate trigram tokens client-side and query `/api/contacts-v2/search?tokens=`
- Show results with decrypted display names (requires E2EE envelope decryption)

**Contact Type Filter**:
- Filter chips/segments for: All, Individual, Organization, Legal Entity, Government
- Maps to `contactTypeHash` query parameter

**Contact Profile View**:
- Tabbed profile matching desktop: Profile (demographics, notes), Identifiers (phone/email/Signal), Cases (linked), Relationships (contact-to-contact), Groups (affinity groups)
- E2EE decryption of summary tier (display name, type, tags) and PII tier (demographics, identifiers, emergency contacts)
- Relationship list shows related contacts with relationship type labels

**Note**: Contact merge is NOT included — no merge API exists in `contacts-v2` route or `ContactDirectoryDO`. Merge would require backend work and is out of scope.

### iOS Implementation

Modified files:
- `apps/ios/Sources/Views/Contacts/ContactsView.swift` — Add trigram search, type filter
- `apps/ios/Sources/ViewModels/ContactsViewModel.swift` — Add `searchByTrigrams()`, type filter state

New files:
- `apps/ios/Sources/Views/Contacts/ContactDirectoryProfileView.swift` — Full profile with tabs (distinct from existing `ContactTimelineView`)
- `apps/ios/Sources/Views/Contacts/ContactRelationshipsView.swift` — Relationships tab content

### Android Implementation

Modified files:
- `apps/android/.../ui/contacts/ContactsScreen.kt` — Add trigram search, type filter chips
- `apps/android/.../ui/contacts/ContactsViewModel.kt` — Add trigram search, type filter

New files:
- `apps/android/.../ui/contacts/ContactDirectoryProfileScreen.kt` — Full profile with tabs
- `apps/android/.../ui/contacts/ContactRelationshipsTab.kt` — Relationships tab

### Accessibility Identifiers
- `contact-search-input`, `contact-type-filter-{type}`, `contact-trigram-results`
- `contact-profile-header`, `contact-profile-tab-{name}`, `contact-identifiers-list`
- `contact-relationships-list`, `contact-groups-list`, `contact-cases-list`

### Permissions
- `contacts:view` — view contacts and search
- `contacts:create` — create new contacts (existing)

---

## Phase 4: Triage Queue (iOS + Android)

### Screens

**Triage List**:
- Tab bar: Pending / In Progress / Completed (matching desktop `STATUS_TABS`)
- List of reports with `allowCaseConversion: true` from their report type definition
- Each row: report title, report type badge, creation date, author (if admin), conversion status
- Pull-to-refresh
- Pagination

**Triage Detail**:
- Report content (encrypted fields, decrypted via E2EE envelopes)
- Report type metadata
- "Convert to Case" button (creates a new record via `POST /api/records` with fields pre-filled from report)
- Status update buttons (pending -> in_progress -> completed)
- Linked cases section (if already converted)

### iOS Implementation

New files:
- `apps/ios/Sources/Views/Reports/TriageListView.swift` — Triage queue with status tabs
- `apps/ios/Sources/Views/Reports/TriageDetailView.swift` — Report detail + convert action
- `apps/ios/Sources/ViewModels/TriageViewModel.swift` — @Observable

Integration:
- Accessible from Admin tab or as a navigation destination from Reports
- Gate on `reports:read-all` AND `cases:create` permissions (matching desktop)

### Android Implementation

New files:
- `apps/android/.../ui/reports/TriageListScreen.kt` — Triage queue with status tabs
- `apps/android/.../ui/reports/TriageDetailScreen.kt` — Report detail + convert
- `apps/android/.../ui/reports/TriageViewModel.kt` — @HiltViewModel

Integration:
- Accessible from admin section or Reports screen
- Permission-gated

### Accessibility Identifiers
- `triage-list`, `triage-status-tab-{status}`, `triage-report-{id}`
- `triage-detail-header`, `triage-convert-btn`, `triage-status-btn-{status}`
- `triage-linked-cases`

### Permissions
- `reports:read-all` — view all reports in triage queue
- `cases:create` — convert report to case

---

## Phase 5: Read-Only Schema Browser (iOS + Android)

### Screens

**Entity Type List**:
- List all entity types defined for the active hub
- Group by category: `case`, `event`, `contact` (with section headers)
- Each row: name, icon/emoji, field count, status count, archived badge
- Filter: active only (default) / show archived

**Entity Type Detail** (read-only):
- Header: name, slug, description, category, numbering prefix
- Fields section: ordered list of field definitions (name, type, required badge, description)
- Statuses section: list of status definitions with color dots
- Enum section: list of enum definitions with their values
- Permissions section: which roles can create/read/update

**No editing** — schema editing remains desktop-only due to the complexity of field ordering, validation rules, enum management, and the risk of accidental schema corruption on a small screen.

### iOS Implementation

New files:
- `apps/ios/Sources/Views/Admin/SchemaBrowserView.swift` — Entity type list grouped by category
- `apps/ios/Sources/Views/Admin/SchemaDetailView.swift` — Read-only entity type detail
- `apps/ios/Sources/ViewModels/SchemaBrowserViewModel.swift` — @Observable

Integration:
- Add to Admin tab as a navigation destination
- Gate on admin role or `settings:manage` permission

### Android Implementation

New files:
- `apps/android/.../ui/admin/SchemaBrowserScreen.kt` — Entity type list
- `apps/android/.../ui/admin/SchemaDetailScreen.kt` — Entity type detail
- `apps/android/.../ui/admin/SchemaBrowserViewModel.kt` — @HiltViewModel

Integration:
- Add to Admin screen navigation

### Accessibility Identifiers
- `schema-list`, `schema-type-{id}`, `schema-category-{category}`
- `schema-detail-header`, `schema-fields-section`, `schema-field-{id}`
- `schema-statuses-section`, `schema-status-{id}`, `schema-enums-section`

### Permissions
- Admin role or `settings:manage`

---

## Phase 6: Transcription Settings (Android Only)

### Current State
- **iOS**: Already complete — `TranscriptionSettingsView.swift` has toggle, language picker, privacy notice. `AdminTranscriptionSettingsView.swift` has admin global settings. No work needed.
- **Android**: No transcription settings UI exists. Android uses native `SpeechRecognizer` API but has no settings screen.

### Screens

**Transcription Settings** (within Settings):
- Toggle: enable/disable on-device transcription
- Language picker: auto-detect + list of supported recognition languages
- Privacy notice section: "Audio is processed on-device only and never transmitted"
- Check `SpeechRecognizer.isRecognitionAvailable()` and show unavailable state if needed

### Android Implementation

New files:
- `apps/android/.../ui/settings/TranscriptionSettingsScreen.kt` — Settings screen
- `apps/android/.../service/TranscriptionPreferences.kt` — DataStore preferences for transcription state (if not already exists)

Integration:
- Add "Transcription" row to `SettingsScreen.kt` that navigates to `TranscriptionSettingsScreen`
- Mirror the iOS `TranscriptionSettingsView` UX

### Accessibility Identifiers
- `transcription-settings`, `transcription-enable-toggle`, `transcription-language-picker`
- `transcription-privacy-notice`

---

## i18n Strategy

### Reuse Existing Keys
The desktop i18n keys in `en.json` cover most of the needed strings. Mobile should use the same keys where applicable, accessed through the generated iOS `.strings` and Android `strings.xml` from `bun run i18n:codegen`.

### New Keys Needed (~30 total)
- Hub management: `hubs.switchHubTitle`, `hubs.activeHub`, `hubs.memberCount`
- Events: `events.entityTypeFilter`, `events.linkedRecords`, `events.linkedReports`, `events.createEvent`
- Contact directory: `contactDirectory.trigramSearch`, `contactDirectory.typeFilter`, `contactDirectory.decryptionFailed`
- Triage: `triage.convertToCase`, `triage.conversionSuccess`, `triage.queueEmpty`
- Schema browser: `schemaBrowser.title`, `schemaBrowser.fieldCount`, `schemaBrowser.statusCount`, `schemaBrowser.readOnly`
- Transcription (Android): reuse iOS keys already in locales

After adding keys to `packages/i18n/locales/en.json`, run:
```bash
bun run i18n:codegen        # Generate iOS .strings + Android strings.xml
bun run i18n:validate:all   # Validate all platforms
```

---

## Navigation Architecture Decisions

### iOS Tab Bar (currently 6 tabs)
iOS already has: Dashboard, Notes, Cases, Conversations, Shifts, Settings. Adding Events as a 7th tab would violate Apple HIG (max 5 visible, "More" tab for overflow). Options:
1. **Recommended**: Events accessible from Dashboard quick actions + Cases tab (since events are CMS entities, they fit under the Cases umbrella). Add "Events" segment/filter within CaseListView.
2. Alternative: Replace Shifts tab with a "More" tab containing Shifts, Events, Hub Management.

### Android Bottom Nav (currently 5 tabs)
Android has: Dashboard, Notes, Conversations, Shifts, Settings. Cases are accessible from Dashboard. Events should follow the same pattern — accessible from Dashboard or Cases navigation.

### Hub Switcher Placement
Both platforms: within Settings, not in the tab bar or navigation header. Desktop puts it in the sidebar which has no mobile equivalent. Settings is the natural home.

### Triage + Schema Browser Placement
Both: within the Admin section (iOS `AdminTabView`, Android `AdminScreen`). These are admin-only features.

---

## Implementation Order

| Phase | Feature | Priority | Effort (iOS + Android) | Dependencies |
|-------|---------|----------|----------------------|--------------|
| 1 | Hub Management | High | 3 days | Epic 341 complete |
| 2 | Events Screen | High | 4 days | Phase 1 (hub context) |
| 3 | Contact Directory Enhancement | Medium | 3 days | E2EE decrypt working |
| 4 | Triage Queue | Medium | 3 days | CMS enabled, report types |
| 5 | Schema Browser | Low | 2 days | Entity types populated |
| 6 | Transcription Settings (Android only) | Low | 1 day | None |

**Total estimate**: ~16 days (both platforms, sequential)
**Parallelizable**: iOS and Android agents can work simultaneously on each phase

---

## Testing Strategy

### BDD Specs
Shared `.feature` files in `packages/test-specs/features/`:
- `hub-management.feature` — hub CRUD, switching
- `events-mobile.feature` — event list, create, detail
- `contact-directory-mobile.feature` — trigram search, profile tabs
- `triage-mobile.feature` — queue filtering, case conversion
- `schema-browser-mobile.feature` — read-only entity type browsing

### iOS Tests
- XCUITest step definitions for each feature
- `bun run ios:uitest` must pass

### Android Tests
- Compose UI test step definitions for each feature
- `bun run test:android` (unit + lint) must pass
- `bun run test:android:e2e` (Cucumber BDD) must pass

### Gate
```bash
bun run test:ios       # iOS: codegen + build + unit + UI tests
bun run test:android   # Android: codegen + unit + lint + build
```

---

## Security Considerations

- **Hub switching**: Changing hub must clear and reload all hub-scoped cached data (contacts, cases, events). No data bleed between hubs.
- **Contact E2EE**: Mobile trigram search queries go to server as hashed tokens. Display names are only visible after client-side decryption of ECIES envelopes. Server never sees plaintext contact names.
- **Triage permissions**: Triage queue requires both `reports:read-all` AND `cases:create`. UI must not show triage to users without both permissions.
- **Schema browser**: Read-only to prevent accidental schema modifications from mobile. Even if someone reverse-engineers the API, the backend requires `settings:manage` for writes.
- **Transcription privacy**: On-device only. Audio never leaves the device. Settings UI must prominently display this.

## Acceptance Criteria

- [ ] Hub list view shows all hubs, active hub highlighted, switch reloads data (iOS + Android)
- [ ] Admin can create and edit hubs from mobile (iOS + Android)
- [ ] Events list shows event entities filtered by `category === 'event'` (iOS + Android)
- [ ] Event detail shows template-driven fields, timeline, linked records/reports (iOS + Android)
- [ ] Contact directory supports trigram name search (iOS + Android)
- [ ] Contact profile shows tabbed view with relationships and groups (iOS + Android)
- [ ] Triage queue shows reports with `allowCaseConversion`, filterable by status (iOS + Android)
- [ ] "Convert to Case" creates a record from report with pre-filled fields (iOS + Android)
- [ ] Schema browser shows entity types grouped by category with field/status details (iOS + Android)
- [ ] Transcription settings screen with toggle, language picker, privacy notice (Android)
- [ ] All new screens have `accessibilityIdentifier` / `testTag` on every interactive element
- [ ] i18n strings added to all 13 locales, codegen passes
- [ ] `bun run test:ios` and `bun run test:android` pass
