# EP03 — Teams & Tags — Completion Plan

## Scope

### Already Done (~70%)
- Teams DB schema (teams, teamMembers, contactTeamAssignments tables)
- Tags DB schema (tags table)
- Teams API: full CRUD + member management + contact assignment
- Tags API: full CRUD with color and category
- Teams service and Tags service
- Crypto labels: `LABEL_TEAM_ENCRYPT`, `LABEL_TAG_ENCRYPT`
- Teams admin section (list, create, delete) — desktop
- Tags admin section (list, create, delete, color picker) — desktop
- Permissions: `teams:read`, `teams:manage`, `tags:view`, `tags:create`, `tags:manage`

### Remaining Work
- TagInput component (multi-select with inline create)
- TagBadge component (reusable badge with color dot)
- Contact integration (tags/teams on contact detail and list pages)
- Contact filtering by tag/team
- React Query hooks for teams and tags
- Audit log integration for team/tag CRUD
- iOS tag picker and tag display on contacts
- Android tag picker and tag display on contacts
- Team filtering on mobile

## Tasks (ordered by dependency)

### Task 1: React Query hooks for teams and tags
- **Platform**: desktop
- **Files**:
  - `src/client/lib/queries/teams.ts` (new)
  - `src/client/lib/queries/tags.ts` (new)
- **What**: Create React Query hooks: `useTeams(hubId)`, `useTeamMembers(teamId)`, `useTeamContacts(teamId)`, `useTags(hubId)` — all with 5min staleTime, hub-key decryption of encrypted fields client-side using `LABEL_TEAM_ENCRYPT` / `LABEL_TAG_ENCRYPT` with appropriate AAD. Create corresponding mutations (`useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`, `useAddTeamMembers`, `useRemoveTeamMember`, `useAssignTeamContacts`, `useUnassignTeamContact`, `useCreateTag`, `useUpdateTag`, `useDeleteTag`) with cache invalidation.
- **Spec reference**: React Query hooks section, D1 encryption pattern
- **Acceptance**: All hooks fetch and decrypt data correctly; mutations invalidate caches; 5min staleTime

### Task 2: TagBadge component
- **Platform**: desktop
- **Files**:
  - `src/client/components/tag-badge.tsx` (new)
- **What**: Reusable component showing a colored dot + label text with optional remove button (X). Props: `color: string`, `label: string`, `onRemove?: () => void`. Uses shadcn Badge as base with custom color dot styling.
- **Spec reference**: Component hierarchy (user-facing) — TagBadge
- **Acceptance**: Renders with color dot; remove button fires callback; visually matches design system

### Task 3: TagInput component
- **Platform**: desktop
- **Files**:
  - `src/client/components/tag-input.tsx` (new)
- **What**: Multi-select tag picker using shadcn Command + Popover pattern. Props: `hubId`, `value: string[]` (tag IDs), `onChange`, `allowCreate` (derived from `tags:create` permission check). Features: search/filter existing tags, grouped by decrypted category, color dot per tag. When `allowCreate` is true, typing a non-matching name shows "Create '{typed}'" option that auto-slugifies, encrypts label/category with hub key, and POSTs to create tag. Selected tags shown as TagBadge chips with remove. Uses `useTags()` hook for data.
- **Spec reference**: Component hierarchy (user-facing) — TagInput, D2, D5
- **Acceptance**: Multi-select works; inline create respects permissions; categories group correctly; optimistic updates

### Task 4: Contact integration — tags and teams on contact pages
- **Platform**: desktop
- **Files**:
  - `src/client/components/contact-profile.tsx` — add tag display and TagInput
  - `src/client/routes/contacts-directory.tsx` — add tag/team filter controls
  - `src/client/components/contact-card.tsx` — show tag badges
- **What**: Integrate TagInput into contact detail/profile pages for adding/removing tags. Display TagBadge components on contact cards in the directory. Add filter dropdowns/chips for filtering contacts by tag (via HMAC blind index comparison) and by team (via contactTeamAssignments). The tag filter computes `HMAC(slug, hubBlindIndexKey)` client-side and sends to server for matching against `contacts.tagHashes`.
- **Spec reference**: Architecture (Contact integration), D2 (always server-side records)
- **Acceptance**: Tags visible on contacts; TagInput works on contact profile; filter by tag/team works in directory

### Task 5: Audit log integration for team/tag operations
- **Platform**: backend
- **Files**:
  - `apps/worker/services/teams.ts` — add audit entries
  - `apps/worker/services/tags.ts` — add audit entries
  - `apps/worker/services/audit.ts` — add `teams` and `tags` to EVENT_CATEGORIES
- **What**: Add hash-chained audit log entries via `AuditService.append()` for all team operations (teamCreated, teamUpdated, teamDeleted, teamMemberAdded, teamMemberRemoved, teamContactAssigned, teamContactUnassigned) and tag operations (tagCreated, tagUpdated, tagDeleted). Details include relevant IDs but never plaintext names.
- **Spec reference**: D4 (Audit log entries)
- **Acceptance**: All team/tag CRUD produces audit entries; entries visible in admin audit view; hash chain intact

### Task 6: Enhance desktop admin team/tag sections
- **Platform**: desktop
- **Files**:
  - `src/client/components/admin-sections/teams-section.tsx` — add member management, contact assignment panels
  - `src/client/components/admin-sections/tags-section.tsx` — add category field, edit form, live preview
- **What**: Enhance the existing teams section with: TeamMembersPanel (UserMultiSelect for adding, list with remove), TeamContactsPanel (ContactSelect for assigning, list with remove), TeamDeleteDialog (cascade warning showing member/contact counts). Enhance tags section with: category input field (freeform encrypted text), tag edit form (label, color, category — slug immutable), tag delete dialog showing removed-from-contacts count. Wire to React Query hooks from Task 1.
- **Spec reference**: Component hierarchy (desktop admin)
- **Acceptance**: Full team member/contact management; tag edit with category; delete cascades shown

### Task 7: iOS tag picker and tag display
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Components/TagPickerView.swift` (new)
  - `apps/ios/Sources/Views/Components/TagBadgeView.swift` (new)
  - `apps/ios/Sources/Views/Contacts/` — modify contact views to show tags
  - `apps/ios/Sources/Services/TagsService.swift` (new)
- **What**: SwiftUI tag picker component (searchable list with color dots, grouped by decrypted category). TagBadge view (color dot + label). Integrate into contact detail views — display tags on contacts, allow tag assignment if user has `tags:create` permission. API service using codegen'd types. Decrypt tag labels via `CryptoService.decryptHubField()` with `LABEL_TAG_ENCRYPT`.
- **Spec reference**: Platform Coverage — iOS, D7
- **Acceptance**: Tags visible on iOS contacts; tag picker works for assignment; decryption via UniFFI

### Task 8: Android tag picker and tag display
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/components/TagPicker.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/components/TagBadge.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/contacts/` — modify contact screens
  - `apps/android/app/src/main/kotlin/org/llamenos/app/api/TagsRepository.kt` (new)
- **What**: Material 3 Compose tag picker (searchable, category-grouped, color indicators). TagBadge composable. Integrate into contact screens. API repository using codegen'd `@Serializable` types. Decrypt via `CryptoService.decryptHubField()` with `LABEL_TAG_ENCRYPT`.
- **Spec reference**: Platform Coverage — Android, D7
- **Acceptance**: Tags visible on Android contacts; tag picker works; Material 3 design

### Task 9: i18n for teams and tags
- **Platform**: all
- **Files**:
  - `packages/i18n/locales/*.json` — add/verify team and tag keys across 13 locales
- **What**: Verify and add missing i18n keys for: team CRUD UI strings, tag CRUD UI strings, TagInput placeholder/create text, filter labels, audit event descriptions. Run `bun run i18n:codegen` and `bun run i18n:validate:all`.
- **Spec reference**: Scope — i18n
- **Acceptance**: `bun run i18n:validate:all` passes; all team/tag UI strings localized
