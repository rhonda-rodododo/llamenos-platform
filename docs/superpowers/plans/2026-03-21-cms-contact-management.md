# CMS Contact Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete contact management across all platforms — mobile write operations for contacts, relationships, and affinity groups; desktop relationship/group management UI; and contact + case merge capabilities.
**Architecture:** Mobile apps (iOS + Android) currently use the legacy `/api/contacts` phone-hash system and must be migrated to the CMS v2 `/directory` endpoint (with E2EE encrypted profiles) before any write UI can be added. All contact PII is encrypted on-device with the hub key using `LABEL_CONTACT_PROFILE` / `LABEL_CONTACT_ID` domain labels before being sent to the server. Contact merge re-encryption is entirely client-side — the server receives only the pre-merged, re-encrypted blob.
**Tech Stack:** Bun + Hono (backend), TypeScript/React + TanStack Router (desktop), SwiftUI @Observable (iOS), Kotlin/Compose + Hilt (Android), Zod schemas → quicktype codegen (protocol types), `bun run codegen` after any schema change.

---

## Critical Architecture Note

**Mobile apps are on the legacy contact system.** Both iOS (`/api/contacts`) and Android (`/api/contacts`) use the old phone-hash model (`ContactSummary`, `ContactDetail` with `contactHash`). The CMS v2 system uses `/directory` with E2EE encrypted profiles (`RawContact` with `encryptedSummary`, `encryptedPII`). Before adding any write UI on mobile, the mobile apps must be migrated to the v2 directory endpoint. This plan includes that migration as a prerequisite.

**crypto-labels.json already has the right labels:**
- `LABEL_CONTACT_PROFILE` = `"llamenos:contact-profile"` — for encrypting contact summary/PII
- `LABEL_CONTACT_ID` = `"llamenos:contact-identifier"` — for identifier envelopes
- `HMAC_CONTACT_NAME` = `"llamenos:contact-name"` — for blind index of display name

---

## Task Index

1. [Protocol Schema Additions](#1-protocol-schema-additions)
2. [Backend: Contact Merge Endpoint](#2-backend-contact-merge-endpoint)
3. [Backend: Case Merge Endpoint](#3-backend-case-merge-endpoint)
4. [Client API: Write Function Additions](#4-client-api-write-function-additions)
5. [iOS: Migrate to v2 Directory Endpoint](#5-ios-migrate-to-v2-directory-endpoint)
6. [iOS: Contact Create and Edit](#6-ios-contact-create-and-edit)
7. [iOS: Mobile Groups Tab](#7-ios-mobile-groups-tab)
8. [Android: Migrate to v2 Directory Endpoint](#8-android-migrate-to-v2-directory-endpoint)
9. [Android: Contact Create and Edit](#9-android-contact-create-and-edit)
10. [Android: Mobile Groups Tab](#10-android-mobile-groups-tab)
11. [Desktop: Relationship Write UI](#11-desktop-relationship-write-ui)
12. [Desktop: Affinity Group Management UI](#12-desktop-affinity-group-management-ui)
13. [Desktop: Contact Merge UI](#13-desktop-contact-merge-ui)
14. [Desktop: Case Merge UI](#14-desktop-case-merge-ui)
15. [BDD Tests](#15-bdd-tests)
16. [Verification Gates](#16-verification-gates)

---

## 1. Protocol Schema Additions

**File:** `packages/protocol/schemas/contacts-v2.ts`

- [ ] Add `mergeContactsBodySchema` after the existing update schema:
  ```typescript
  export const mergeContactsBodySchema = z.object({
    survivingId: z.uuid(),
    deletedId: z.uuid(),
    mergedEncryptedSummary: z.string(),
    mergedSummaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
    mergedEncryptedPII: z.string().optional(),
    mergedPIIEnvelopes: z.array(recipientEnvelopeSchema).optional(),
    mergedIdentifierHashes: z.array(z.string()).min(1),
    mergedNameHash: z.string().optional(),
    mergedTrigramTokens: z.array(z.string()).optional(),
    mergedBlindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  })
  export type MergeContactsBody = z.infer<typeof mergeContactsBodySchema>
  ```
  > Note: The client sends the full re-encrypted profile fields, not just `mergedEncryptedProfile: string`. This allows the server to correctly update all indexed fields (name hash, trigram tokens, blind indexes) without ever holding plaintext.

**File:** `packages/protocol/schemas/records.ts`

- [ ] Add `mergeRecordsBodySchema`:
  ```typescript
  export const mergeRecordsBodySchema = z.object({
    primaryId: z.uuid(),
    duplicateId: z.uuid(),
  })
  export type MergeRecordsBody = z.infer<typeof mergeRecordsBodySchema>
  ```

- [ ] Run `bun run codegen` to regenerate Swift and Kotlin types.
- [ ] Confirm `bun run typecheck` passes.

---

## 2. Backend: Contact Merge Endpoint

**File:** `apps/worker/services/contacts.ts`

- [ ] Add `merge()` method to the `ContactsService` class:
  ```typescript
  async merge(hubId: string, input: MergeContactsBody): Promise<ContactRow>
  ```
  Implementation steps (all in a transaction):
  1. Verify `survivingId` exists and belongs to `hubId` — throw 404 if not.
  2. Verify `deletedId` exists and belongs to `hubId` — throw 404 if not.
  3. Reject if `survivingId === deletedId` — throw 400.
  4. Update surviving contact: set `encryptedSummary`, `summaryEnvelopes`, `encryptedPII`, `piiEnvelopes`, `identifierHashes` (union with surviving's existing hashes), `nameHash`, `trigramTokens`, `blindIndexes`, `updatedAt`.
  5. Re-link case contact links (`record_contacts` table): `UPDATE record_contacts SET contact_id = survivingId WHERE contact_id = deletedId AND hub_id = hubId` — on duplicate key, delete the duplicate row.
  6. Re-link interactions referencing `deletedId` in the interaction's `contactId` column.
  7. Re-link relationships: `UPDATE contact_relationships SET contact_id_a = survivingId WHERE contact_id_a = deletedId AND hub_id = hubId`; same for `contact_id_b`. Deduplicate: if a relationship between survivingId and some third contact already exists in the same direction, delete the redundant new row.
  8. Re-link affinity group memberships: `UPDATE group_members SET contact_id = survivingId WHERE contact_id = deletedId` — on duplicate key, delete the duplicate row.
  9. Delete the `deletedId` contact record.
  10. Emit audit log: `contactMerged` with `{ survivingId, deletedId }`.
  11. Return the updated surviving contact row.

**File:** `apps/worker/routes/contacts-v2.ts`

- [ ] Add `POST /merge` endpoint (before any wildcard routes):
  ```typescript
  contactsV2.post('/merge',
    requirePermission('contacts:delete'),
    validator('json', mergeContactsBodySchema),
    async (c) => { ... }
  )
  ```
  Import `mergeContactsBodySchema` from `@protocol/schemas/contacts-v2`.
  Call `services.contacts.merge(hubId, body)`.
  Return 200 with the updated surviving contact.

- [ ] Add `mergeContactsBodySchema` to the imports in `contacts-v2.ts`.
- [ ] Add OpenAPI `describeRoute` annotations (tags: `['Contact Directory']`, summary: `'Merge duplicate contacts (client-side E2EE)'`).

---

## 3. Backend: Case Merge Endpoint

**File:** `apps/worker/services/records.ts`

- [ ] Add `merge()` method to `RecordsService`:
  ```typescript
  async merge(hubId: string, input: MergeRecordsBody): Promise<RecordRow>
  ```
  Implementation steps (all in a transaction):
  1. Verify `primaryId` exists in hub — throw 404 if not.
  2. Verify `duplicateId` exists in hub — throw 404 if not.
  3. Verify both records have the same `entityTypeId` — throw 400 if not.
  4. Reject if `primaryId === duplicateId` — throw 400.
  5. Move all interactions: `UPDATE case_interactions SET record_id = primaryId WHERE record_id = duplicateId`.
  6. Move all evidence: `UPDATE case_evidence SET record_id = primaryId WHERE record_id = duplicateId`.
  7. Move contact links: `UPDATE record_contacts SET record_id = primaryId WHERE record_id = duplicateId` — on duplicate (same contactId), delete redundant row.
  8. Move report links: `UPDATE record_reports SET record_id = primaryId WHERE record_id = duplicateId`.
  9. Move note links (if applicable table exists): `UPDATE record_notes SET record_id = primaryId WHERE record_id = duplicateId`.
  10. Delete the `duplicateId` record.
  11. Emit audit log: `caseMerged` with `{ primaryId, duplicateId }`.
  12. Return the updated primary record.

**File:** `apps/worker/routes/records.ts`

- [ ] Add `POST /merge` endpoint:
  ```typescript
  records.post('/merge',
    requirePermission('cases:delete'),
    validator('json', mergeRecordsBodySchema),
    async (c) => { ... }
  )
  ```
  Import `mergeRecordsBodySchema` from `@protocol/schemas/records`.
  Call `services.records.merge(hubId, body)`.
  Return 200 with the updated primary record.

- [ ] Add OpenAPI `describeRoute` annotations.

---

## 4. Client API: Write Function Additions

**File:** `src/client/lib/api.ts`

Add all missing write functions after the existing `listDirectoryContactGroups()` function (line ~1771).

**Relationship write operations:**

- [ ] Import `CreateRelationshipBody` from `@protocol/schemas/contact-relationships`.
- [ ] Add `createContactRelationship(contactId: string, body: CreateRelationshipBody): Promise<ContactRelationship>` — `POST` to `hp('/directory/${contactId}/relationships')`.
- [ ] Add `deleteContactRelationship(contactId: string, relId: string): Promise<{ ok: boolean }>` — `DELETE` to `hp('/directory/${contactId}/relationships/${relId}')`.

**Affinity group write operations:**

- [ ] Import `CreateAffinityGroupBody`, `UpdateAffinityGroupBody`, `AddGroupMemberBody` from `@protocol/schemas/contact-relationships`.
- [ ] Add `listAffinityGroups(): Promise<{ groups: ContactGroup[] }>` — `GET` to `hp('/directory/groups')`.
- [ ] Add `createAffinityGroup(body: CreateAffinityGroupBody): Promise<ContactGroup>` — `POST` to `hp('/directory/groups')`.
- [ ] Add `updateAffinityGroup(groupId: string, body: UpdateAffinityGroupBody): Promise<ContactGroup>` — `PATCH` to `hp('/directory/groups/${groupId}')`.
- [ ] Add `deleteAffinityGroup(groupId: string): Promise<{ ok: boolean }>` — `DELETE` to `hp('/directory/groups/${groupId}')`.
- [ ] Add `addGroupMember(groupId: string, body: AddGroupMemberBody): Promise<{ ok: boolean }>` — `POST` to `hp('/directory/groups/${groupId}/members')`.
- [ ] Add `removeGroupMember(groupId: string, contactId: string): Promise<{ ok: boolean }>` — `DELETE` to `hp('/directory/groups/${groupId}/members/${contactId}')`.

**Merge operations:**

- [ ] Import `MergeContactsBody` from `@protocol/schemas/contacts-v2`.
- [ ] Import `MergeRecordsBody` from `@protocol/schemas/records`.
- [ ] Add `mergeContacts(body: MergeContactsBody): Promise<RawContact>` — `POST` to `hp('/directory/merge')`.
- [ ] Add `mergeCases(body: MergeRecordsBody): Promise<CaseRecord>` — `POST` to `hp('/records/merge')`.

- [ ] Run `bun run typecheck` — confirm no errors.

---

## 5. iOS: Migrate to v2 Directory Endpoint

The iOS contact stack currently uses `/api/contacts` (phone-hash system) and `ContactSummary`/`ContactDetail` models from the legacy route. Before adding write UI, migrate to the v2 `/directory` endpoint and `RawContact`-based models.

**File:** `apps/ios/Sources/ViewModels/ContactsViewModel.swift`

- [ ] Replace `ContactsListResponse` / `ContactSummary` with a new `DirectoryContactListResponse` struct that wraps `[RawContact]`.
- [ ] Update `loadContacts()` to call `hp("/api/directory")` with params `?page=&limit=`.
- [ ] Update `search()` to call `hp("/api/directory/search")` with `?tokens=`.
- [ ] Decrypt each `RawContact` after fetch using `cryptoService.decryptHubSymmetric()` with `LABEL_CONTACT_PROFILE` to get display name, contact type, tags. Store both `rawContact` and decrypted fields.
- [ ] Add `cryptoService: CryptoService` injection (constructor parameter).
- [ ] Replace `ContactSummary` usage with a new `DecryptedContactSummary` struct:
  ```swift
  struct DecryptedContactSummary {
      let raw: RawContact
      let displayName: String
      let contactType: String
      let tags: [String]
      let canDecrypt: Bool
  }
  ```
- [ ] Update `ContactsView.swift` to use `DecryptedContactSummary` in the list.

**File:** `apps/ios/Sources/ViewModels/ContactsViewModel.swift` (detail section)

- [ ] Update `loadContactDetail(contactHash:)` — the old method uses a hash; replace with `loadContactDetail(contactId:)` which calls `hp("/api/directory/\(contactId)")` and returns `RawContact`.
- [ ] Decrypt the returned `RawContact` with both summary and PII tiers.
- [ ] Update `loadRelationships()` to call `hp("/api/directory/\(contactId)/relationships")`.
- [ ] Add `loadGroups(contactId:)` — calls `hp("/api/directory/\(contactId)/groups")`.

**File:** `apps/ios/Sources/Views/Contacts/ContactDetailView.swift`

- [ ] Update to accept `contactId: String` instead of `contactHash: String`.
- [ ] Update `ContactNavDestination` enum cases to use `contactId`.
- [ ] Update all navigation calls in `ContactsView.swift`.

**Note on legacy `ContactSummary` model in `apps/ios/Sources/ViewModels/`:** After migration, the old `ContactSummary`, `ContactDetail`, `ContactsListResponse`, `ContactDetailResponse` structs defined in the iOS view models are replaced by protocol-generated types. Remove the old struct definitions or replace them with the new `DecryptedContactSummary` wrapper.

---

## 6. iOS: Contact Create and Edit

**New file:** `apps/ios/Sources/Views/Contacts/ContactCreateView.swift`

- [ ] Sheet view with form fields: contact type selector, display name, notes (free text for now; PII fields like phone/email use `ContactPII` structure).
- [ ] On submit:
  1. Fetch active hub key bytes: `cryptoService.hubKeyBytes(for: hubContext.activeHubId)`.
  2. Encrypt summary JSON (`{ displayName, contactType, tags }`) using `cryptoService.encryptHubSymmetric(plaintext, hubKeyBytes, LABEL_CONTACT_PROFILE)` → `encryptedSummary`.
  3. Build `summaryEnvelopes` using `encryptWithHubKey` ECIES wrapping per-recipient (admin pubkeys from `hub.adminPubkeys`).
  4. Generate HMAC blind index for display name: `HMAC(HMAC_CONTACT_NAME, displayName.lowercased())`.
  5. Call `apiService.createRawContact(body)` via `APIService.request(method: "POST", path: hp("/api/directory"), body: ...)`.
  6. On success: dismiss sheet, call `onCreated()` callback to refresh list.
- [ ] `accessibilityIdentifier("contact-create-sheet")`, `accessibilityIdentifier("contact-create-name")`, `accessibilityIdentifier("contact-create-save")`.

**New file:** `apps/ios/Sources/Views/Contacts/ContactEditView.swift`

- [ ] Sheet view, pre-filled from the existing contact's decrypted summary (and PII if available).
- [ ] On submit: re-encrypt updated fields, call `PATCH /api/directory/\(contactId)` via `APIService`.
- [ ] `accessibilityIdentifier("contact-edit-sheet")`, `accessibilityIdentifier("contact-edit-save")`.

**File:** `apps/ios/Sources/Views/Contacts/ContactsView.swift`

- [ ] Add `@State private var showCreateSheet = false`.
- [ ] Add toolbar `+` button, visible only when `appState.userPermissions.contains("contacts:create")`.
- [ ] Present `ContactCreateView` as `.sheet(isPresented: $showCreateSheet)`.
- [ ] On create success: refresh `vm.loadContacts()`.

**File:** `apps/ios/Sources/Views/Contacts/ContactDetailView.swift`

- [ ] Add `@State private var showEditSheet = false`.
- [ ] Add edit toolbar button, visible only when `appState.userPermissions.contains("contacts:edit")`.
- [ ] Present `ContactEditView` as `.sheet`.

**Note on encryption helper:** iOS `CryptoService` has hub key bytes accessible via the hub key cache (`hubKeyCache`). Use the existing `xchacha20poly1305Encrypt` FFI function (from UniFFI) with the hub key + `LABEL_CONTACT_PROFILE` as the context label, or add a `encryptHubSymmetric(data:hubId:label:)` helper method to `CryptoService` if it does not already exist.

---

## 7. iOS: Mobile Groups Tab

**File:** `apps/ios/Sources/Views/Contacts/ContactDetailView.swift`

- [ ] Add a Groups section after the Relationships section.
- [ ] Load groups via `vm.loadGroups(contactId:)` (added in Task 5).
- [ ] Display each group: decrypted name (from `encryptedDetails`), member count, the contact's role in the group.
- [ ] Decrypt `encryptedDetails` using `cryptoService.decryptHubSymmetric()` with `LABEL_CONTACT_PROFILE` (or the affinity group details label — same hub key encryption).
- [ ] Show `data-testid`-equivalent `accessibilityIdentifier("contact-groups-section")` on the section container.

**File:** `apps/ios/Sources/ViewModels/ContactsViewModel.swift`

- [ ] Add `groups: [DecryptedGroupMembership] = []` to detail state.
- [ ] Add `loadGroups(contactId: String) async` method calling `hp("/api/directory/\(contactId)/groups")`.
- [ ] Add `DecryptedGroupMembership` struct:
  ```swift
  struct DecryptedGroupMembership {
      let groupId: String
      let groupName: String
      let role: String?
      let memberCount: Int
  }
  ```

---

## 8. Android: Migrate to v2 Directory Endpoint

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/model/ContactModels.kt`

- [ ] Add new model classes for the v2 system alongside the existing legacy models (do NOT delete legacy models yet — they may be used by the legacy contacts route until that route is removed):
  ```kotlin
  @Serializable data class RawContact(
    val id: String,
    val hubId: String,
    val identifierHashes: List<String>,
    val nameHash: String? = null,
    val trigramTokens: List<String>? = null,
    val encryptedSummary: String,
    val summaryEnvelopes: List<RecipientEnvelope>,
    val encryptedPII: String? = null,
    val piiEnvelopes: List<RecipientEnvelope>? = null,
    val contactTypeHash: String? = null,
    val tagHashes: List<String> = emptyList(),
    val caseCount: Int = 0,
    val createdAt: String,
    val updatedAt: String,
  )
  @Serializable data class RawContactListResponse(
    val contacts: List<RawContact>,
    val total: Int,
    val page: Int,
    val limit: Int,
    val hasMore: Boolean,
  )
  data class DecryptedContactSummary(
    val raw: RawContact,
    val displayName: String,
    val contactType: String,
    val tags: List<String>,
    val canDecrypt: Boolean,
  )
  ```
  Also add `RecipientEnvelope` if not already in models:
  ```kotlin
  @Serializable data class RecipientEnvelope(
    val pubkey: String,
    val encryptedKey: String,
  )
  ```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsViewModel.kt`

- [ ] Add `CryptoService` injection.
- [ ] Replace `loadContacts()` to call `apiService.hp("/api/directory")` and deserialize `RawContactListResponse`.
- [ ] After fetch, decrypt each `RawContact` using `cryptoService.decryptHubSymmetric(encryptedSummary, hubKeyBytes, LABEL_CONTACT_PROFILE)` to get `displayName`, `contactType`, `tags`.
- [ ] Update `_uiState` to hold `List<DecryptedContactSummary>` instead of `List<ContactSummary>`.
- [ ] Update `search()` to call `hp("/api/directory/search?tokens=...")`.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailViewModel.kt`

- [ ] Change `loadContact(contactHash:)` to `loadContact(contactId: String)` — call `hp("/api/directory/\(contactId)")` returning `RawContact`.
- [ ] Decrypt summary + PII tiers using `CryptoService`.
- [ ] Update `loadRelationships()` to call `hp("/api/directory/\(contactId)/relationships")`.
- [ ] Add `loadGroups(contactId: String)` calling `hp("/api/directory/\(contactId)/groups")`.
- [ ] Update `ContactDetailUiState` to include `groups: List<DecryptedGroupMembership>`.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt`

- [ ] Update to pass `contactId` (not `contactHash`) to navigation.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt`

- [ ] Update to receive `contactId: String` parameter (not `contactHash`).
- [ ] Update navigation route registration.

**Note on Android CryptoService:** `CryptoService` has `hubKeys: MutableMap<String, ByteArray>`. Add a `decryptHubSymmetric(ciphertext: String, hubId: String, label: String): String?` method if it does not exist. This should use XChaCha20-Poly1305 via the native JNI binding with the hub key and the label as the context.

---

## 9. Android: Contact Create and Edit

**New file:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactFormViewModel.kt`

- [ ] `@HiltViewModel` ViewModel shared by create and edit screens.
- [ ] State:
  ```kotlin
  data class ContactFormUiState(
    val displayName: String = "",
    val contactType: String = "individual",
    val notes: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
    val savedContactId: String? = null,
  )
  ```
- [ ] Inject `ApiService`, `CryptoService`, `ActiveHubState`.
- [ ] `fun initForEdit(contactId: String)` — load `RawContact` and decrypt for pre-fill.
- [ ] `fun setDisplayName(v: String)`, `fun setContactType(v: String)`, `fun setNotes(v: String)`.
- [ ] `fun submit()`:
  1. Encrypt summary `{ displayName, contactType }` with hub key + `LABEL_CONTACT_PROFILE` → `encryptedSummary`.
  2. Build `summaryEnvelopes` (ECIES per admin pubkey).
  3. Compute `nameHash` = HMAC(`HMAC_CONTACT_NAME`, displayName.lowercase()).
  4. For create: `apiService.request<RawContact>("POST", apiService.hp("/api/directory"), body)`.
  5. For edit: `apiService.request<RawContact>("PATCH", apiService.hp("/api/directory/\$contactId"), body)`.
  6. Set `savedContactId` on success.

**New file:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactCreateScreen.kt`

- [ ] Full-screen Composable or `ModalBottomSheet`.
- [ ] Fields: `OutlinedTextField` for display name, `ExposedDropdownMenuBox` for contact type, `OutlinedTextField` for notes.
- [ ] `Button("Save")` calls `vm.submit()`.
- [ ] On `savedContactId != null`: navigate back and trigger list refresh.
- [ ] Test tags: `Modifier.testTag("contact-create-name")`, `Modifier.testTag("contact-create-save")`.

**New file:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactEditScreen.kt`

- [ ] Same structure as create, calls `vm.initForEdit(contactId)` in `LaunchedEffect`.
- [ ] Test tags: `Modifier.testTag("contact-edit-name")`, `Modifier.testTag("contact-edit-save")`.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt`

- [ ] Add `FloatingActionButton` visible when `userPermissions.contains("contacts:create")`.
- [ ] Navigate to `ContactCreateScreen` on FAB click.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt`

- [ ] Add `IconButton` (edit icon) in `TopAppBar` visible when `userPermissions.contains("contacts:edit")`.
- [ ] Navigate to `ContactEditScreen(contactId)`.

**Navigation:** Register `ContactCreateScreen` and `ContactEditScreen` in the nav graph. Pass `contactId` as string argument to edit screen.

**DI:** Add `ContactFormViewModel` binding to the Hilt module or rely on `@HiltViewModel` auto-provision.

---

## 10. Android: Mobile Groups Tab

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt`

- [ ] Add a `GroupMemberships` section in `ContactProfileContent`, below the `Relationships` section.
- [ ] Display from `uiState.groups: List<DecryptedGroupMembership>`.
- [ ] Each row: group name (decrypted), member count, contact's role (if set).
- [ ] Show `Modifier.testTag("contact-groups-section")` on the container.

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/model/ContactModels.kt`

- [ ] Add `DecryptedGroupMembership`:
  ```kotlin
  data class DecryptedGroupMembership(
    val groupId: String,
    val groupName: String,
    val role: String?,
    val memberCount: Int,
  )
  ```

(The `loadGroups()` call and state update are already in Task 8's `ContactDetailViewModel` changes.)

---

## 11. Desktop: Relationship Write UI

**File:** `src/client/components/contacts/contact-profile.tsx`

- [ ] Import `createContactRelationship`, `deleteContactRelationship`, `RELATIONSHIP_TYPES` (from `@protocol/schemas/contact-relationships` — re-export from `api.ts` or import directly).
- [ ] In `RelationshipsTab`:
  - Add "Add Relationship" button (visible when user has `contacts:manage-relationships` permission; use `useAuth()` to check).
  - On click: show an inline form with:
    - Contact picker (debounced search input calling `searchRawContacts()`, showing decrypted display names).
    - Relationship type `<Select>` using `RELATIONSHIP_TYPES` array.
    - Direction `<Select>`: `a_to_b` / `b_to_a` / `bidirectional`.
    - Optional notes `<Input>` (encrypted with hub key before sending, using `encryptMessage()` from `platform.ts` with admin envelopes from `listAdmins()`).
  - On save: call `createContactRelationship(contactId, body)`, refresh relationships list.
  - Each existing relationship row: add "Remove" `<Button>` (admin-only, with confirmation) → calls `deleteContactRelationship(contactId, rel.id)`.
  - `data-testid="relationship-add-button"`, `data-testid="relationship-save-button"`, `data-testid="relationship-remove-{relId}"`.

- [ ] Import new functions in `src/client/lib/api.ts` exports are used via the existing import block at top of `contact-profile.tsx`.

---

## 12. Desktop: Affinity Group Management UI

**File:** `src/client/routes/contacts-directory.tsx`

- [ ] Add a "Groups" tab to the directory page (alongside the contact list).
- [ ] Import `listAffinityGroups`, `createAffinityGroup`, `updateAffinityGroup`, `deleteAffinityGroup`, `addGroupMember`, `removeGroupMember` from `@/lib/api`.
- [ ] Groups tab content:
  - Load groups via `listAffinityGroups()` on mount.
  - "Create Group" button (admin-only): opens a dialog with:
    - Group name + description text fields.
    - Member picker (multi-select, searches contacts via `searchRawContacts()`).
    - Role input per member (optional free-text).
    - Encrypt name+description as JSON with hub key (`encryptMessage()` from `platform.ts`) → `encryptedDetails`.
    - Build `detailEnvelopes` per admin pubkey.
    - Call `createAffinityGroup(body)`.
  - Each group row: expand to show members.
  - Edit button on group row: opens edit dialog (pre-filled), calls `updateAffinityGroup(groupId, body)`.
  - "Add member" button in expanded row: contact picker → calls `addGroupMember(groupId, body)`.
  - "Remove member" per member row: calls `removeGroupMember(groupId, contactId)`.
  - Delete group button (admin-only): confirmation dialog → calls `deleteAffinityGroup(groupId)`.
  - `data-testid="affinity-groups-tab"`, `data-testid="create-group-button"`, `data-testid="group-row-{groupId}"`, `data-testid="delete-group-{groupId}"`.

---

## 13. Desktop: Contact Merge UI

**File:** `src/client/components/contacts/contact-profile.tsx`

- [ ] Add "Merge duplicate" button in the contact profile header (admin-only, `contacts:delete` permission).
- [ ] Opens a `<Dialog>`:

  **Step 1 — Find duplicate:**
  - Search input → `searchRawContacts()` → shows contact list.
  - Select one contact as the "duplicate to delete".
  - `data-testid="merge-contact-search"`, `data-testid="merge-contact-select-{contactId}"`.

  **Step 2 — Field resolution:**
  - Decrypt both contacts (surviving = current contact, deleted = selected duplicate).
  - Side-by-side comparison: display name, contact type, notes, identifier count.
  - Radio buttons per resolvable field: "Keep from this contact" / "Keep from duplicate".
  - `data-testid="merge-field-resolution-displayName"`.

  **Step 3 — Confirm:**
  - Warning: "The duplicate contact and all its data will be permanently merged into this contact. This cannot be undone."
  - Confirmation checkbox.
  - "Merge" button.

  **On confirm:**
  1. Decrypt both contacts' summary tiers.
  2. Apply field resolutions to build merged summary JSON.
  3. Encrypt merged summary with hub key + `LABEL_CONTACT_PROFILE` → `mergedEncryptedSummary`.
  4. Build `mergedSummaryEnvelopes` per admin pubkey.
  5. Merge `identifierHashes`: union of both.
  6. Compute merged `nameHash` from merged display name.
  7. Call `mergeContacts({ survivingId, deletedId, mergedEncryptedSummary, mergedSummaryEnvelopes, mergedIdentifierHashes, mergedNameHash })`.
  8. Navigate to surviving contact (it already has the merged data).
  9. `data-testid="merge-confirm-checkbox"`, `data-testid="merge-submit-button"`.

---

## 14. Desktop: Case Merge UI

**File:** `src/client/routes/cases.tsx` (or the case detail component — locate via `grep -r "CaseDetail\|case-detail" src/client/`)

- [ ] Add "Merge case" action to the case detail view's more-actions menu (admin-only, `cases:delete` permission).
- [ ] Opens a `<Dialog>`:

  **Step 1 — Find duplicate:**
  - Case number input OR search by case attributes.
  - List matching cases from `listCases()` or `searchCases()`.
  - Select one as the "duplicate".
  - `data-testid="merge-case-search"`, `data-testid="merge-case-select-{caseId}"`.

  **Step 2 — Confirm:**
  - Show summary: both case numbers, entity type, contact count, interaction count from each.
  - Warning: "All interactions, evidence, and contacts from the duplicate case will be moved to this case. The duplicate will be permanently deleted."
  - Confirmation checkbox + "Merge" button.
  - `data-testid="merge-case-confirm-checkbox"`, `data-testid="merge-case-submit"`.

  **On confirm:**
  1. Call `mergeCases({ primaryId: currentCaseId, duplicateId: selectedCaseId })`.
  2. Show success toast.
  3. Close dialog (stay on current case — it now has all merged content).

---

## 15. BDD Tests

**File:** `tests/features/contacts/contact-create.feature` (new)

- [ ] Write BDD feature file with scenarios:
  - `Scenario: Admin creates a contact` — POST /directory with encrypted body → 201, contact appears in list.
  - `Scenario: Contact creation requires contacts:create permission` — volunteer cannot create.
  - `Scenario: Admin edits a contact` — PATCH /directory/:id updates encrypted profile.
  - `Scenario: Admin deletes a contact` — DELETE /directory/:id, 404 on subsequent GET.

**File:** `tests/features/contacts/contact-merge.feature` (new)

- [ ] Write BDD feature file:
  - `Scenario: Admin merges two contacts` — POST /directory/merge, surviving contact updated, deleted contact gone, case links moved.
  - `Scenario: Contact merge rejects same ID` — survivingId === deletedId → 400.
  - `Scenario: Contact merge rejects cross-hub` — 404 if deletedId belongs to different hub.

**File:** `tests/features/records/case-merge.feature` (new)

- [ ] Write BDD feature file:
  - `Scenario: Admin merges two cases` — POST /records/merge, interactions moved, duplicate deleted.
  - `Scenario: Case merge rejects different entity types` — 400.
  - `Scenario: Case merge rejects cross-hub` — 404.

**File:** `tests/features/contacts/affinity-groups.feature` (new)

- [ ] Write BDD feature file:
  - `Scenario: Admin creates an affinity group` — POST /directory/groups → 201.
  - `Scenario: Admin adds a member to a group` — POST /directory/groups/:id/members.
  - `Scenario: Admin removes a member from a group` — DELETE /directory/groups/:id/members/:contactId.
  - `Scenario: Admin deletes a group` — DELETE /directory/groups/:id → 204.

- [ ] Run `bun run test:backend:bdd` — confirm all new scenarios pass (red → fix → green).

---

## 16. Verification Gates

Run these in order. Every gate must pass before the plan is marked complete.

- [ ] **Protocol codegen:** `bun run codegen` — no errors; `bun run typecheck` — no type errors.
- [ ] **Backend BDD:** `bun run test:backend:bdd` — all scenarios pass including new contact/record merge and affinity group scenarios.
- [ ] **Desktop build:** `bun run build` — no errors.
- [ ] **Desktop typecheck:** `bun run typecheck` — clean.
- [ ] **Android unit tests:** `cd apps/android && ./gradlew testDebugUnitTest` — all pass.
- [ ] **Android lint:** `./gradlew lintDebug` — no new errors.
- [ ] **Android E2E compile:** `./gradlew compileDebugAndroidTestKotlin` — compiles cleanly.
- [ ] **iOS build:** `ssh mac "cd ~/.worktrees/desktop && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17'"` — succeeds.
- [ ] **iOS tests:** `ssh mac "cd ~/.worktrees/desktop && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17'"` — passes.
- [ ] **E2EE check:** Using browser network inspector (or test assertion), confirm that no contact create or edit request contains a plaintext name or phone number in the request body.
- [ ] **Merge E2EE check:** Confirm `POST /directory/merge` body contains only UUID IDs and ciphertext strings — no plaintext PII fields.
- [ ] **Permission check:** Volunteer (non-admin) cannot create contacts (API returns 403), cannot merge, cannot manage groups.

---

## File Map

| File | Change |
|------|--------|
| `packages/protocol/schemas/contacts-v2.ts` | Add `mergeContactsBodySchema` |
| `packages/protocol/schemas/records.ts` | Add `mergeRecordsBodySchema` |
| `apps/worker/services/contacts.ts` | Add `merge()` method |
| `apps/worker/services/records.ts` | Add `merge()` method |
| `apps/worker/routes/contacts-v2.ts` | Add `POST /merge` endpoint |
| `apps/worker/routes/records.ts` | Add `POST /merge` endpoint |
| `src/client/lib/api.ts` | Add 10 write functions (relationships, groups, merge) |
| `src/client/components/contacts/contact-profile.tsx` | Add relationship write UI, contact merge dialog |
| `src/client/routes/contacts-directory.tsx` | Add affinity groups tab with full CRUD UI |
| `src/client/routes/cases.tsx` (or case detail component) | Add case merge dialog |
| `apps/ios/Sources/ViewModels/ContactsViewModel.swift` | Migrate to v2 directory endpoint + decryption |
| `apps/ios/Sources/Views/Contacts/ContactsView.swift` | Add `+` toolbar button, present create sheet |
| `apps/ios/Sources/Views/Contacts/ContactDetailView.swift` | Migrate to contactId, add edit button, groups section |
| `apps/ios/Sources/Views/Contacts/ContactCreateView.swift` | New file |
| `apps/ios/Sources/Views/Contacts/ContactEditView.swift` | New file |
| `apps/android/app/src/main/java/org/llamenos/hotline/model/ContactModels.kt` | Add v2 model classes |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsViewModel.kt` | Migrate to v2 directory endpoint |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailViewModel.kt` | Migrate to contactId, add groups loading |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt` | Add FAB for create |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt` | Migrate to contactId, add edit action, groups section |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactCreateScreen.kt` | New file |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactEditScreen.kt` | New file |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactFormViewModel.kt` | New file |
| `tests/features/contacts/contact-create.feature` | New BDD feature |
| `tests/features/contacts/contact-merge.feature` | New BDD feature |
| `tests/features/contacts/affinity-groups.feature` | New BDD feature |
| `tests/features/records/case-merge.feature` | New BDD feature |
