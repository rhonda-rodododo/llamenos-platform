# Spec: cms-contact-management

**Date:** 2026-03-21
**Branch:** desktop (or feature branch)
**Status:** Draft

---

## Goal

Complete contact management across all platforms — mobile CRUD for directory contacts, write operations for relationships and affinity groups, and merge capabilities for contacts and cases.

---

## Current State

### What exists

**Backend (apps/worker/routes/contacts-v2.ts):**
- Full CRUD for contacts: `POST /directory` (create), `PATCH /directory/:id` (update), `DELETE /directory/:id` (delete), `GET /directory` (list), `GET /directory/:id` (get), `GET /directory/search` (trigram search), `GET /directory/lookup/:identifierHash`
- Full CRUD for affinity groups: `POST /directory/groups`, `PATCH /directory/groups/:groupId`, `DELETE /directory/groups/:groupId`, `GET /directory/groups`, `GET /directory/groups/:groupId`, `POST /directory/groups/:groupId/members`, `DELETE /directory/groups/:groupId/members/:contactId`, `GET /directory/groups/:groupId/members`
- Full CRUD for relationships: `POST /directory/:id/relationships`, `DELETE /directory/:id/relationships/:relId`, `GET /directory/:id/relationships`
- Contact groups membership lookup: `GET /directory/:id/groups`
- Permission guards: `contacts:create`, `contacts:edit`, `contacts:delete`, `contacts:manage-groups`, `contacts:manage-relationships`, `contacts:view`

**Client API (src/client/lib/api.ts):**
- Read functions: `listRawContacts()`, `searchRawContacts()`, `getRawContact()`, `listDirectoryContactRelationships()`, `listDirectoryContactGroups()`, `listDirectoryContactCases()`
- Write functions for contacts: `createRawContact()`, `updateDirectoryContact()`, `deleteDirectoryContact()` — **all three exist**
- Write functions for relationships: **none**
- Write functions for affinity groups: **none**

**iOS (apps/ios/Sources/Views/Contacts/):**
- `ContactsView.swift` — list view, read-only, navigates to detail
- `ContactDetailView.swift` — detail with identifiers, interaction summary, linked cases, relationships (read-only display)
- `ContactTimelineView.swift` — call/conversation/note history
- No create/edit views for contacts
- No write UI for relationships or groups
- No groups tab in detail view

**Android (apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/):**
- `ContactsScreen.kt` — list view, read-only, navigates to detail
- `ContactDetailScreen.kt` — detail with identifiers, interaction summary, linked cases, relationships (read-only display)
- `ContactTimelineScreen.kt` — call/conversation/note history
- No create/edit screens for contacts
- No write UI for relationships or groups
- No groups tab in detail screen

**Desktop:**
- Contacts accessible via `/directory` route
- No dedicated contact create/edit UI (uses inline forms in directory view if any)
- No relationship management UI
- No affinity group management UI

### What is missing

1. Client API functions for relationship CRUD and affinity group CRUD
2. Mobile contact create and edit forms (iOS + Android)
3. Desktop and mobile UI for relationship write operations
4. Desktop UI for affinity group management
5. Mobile groups tab in contact detail (read-only display)
6. Backend: `POST /directory/merge` endpoint (contact merge)
7. Backend: `POST /records/merge` endpoint (case merge)
8. Client API functions: `mergeContacts()`, `mergeCases()`
9. Desktop UI: contact merge and case merge actions

---

## Required Changes

### Gap 1: Client API — relationship and group write functions

**File:** `src/client/lib/api.ts`

Add after the existing `listDirectoryContactGroups()` function:

```typescript
// Relationship write operations
export async function createContactRelationship(
  contactId: string,
  body: CreateRelationshipBody
) { ... }  // POST /directory/:id/relationships

export async function deleteContactRelationship(
  contactId: string,
  relId: string
) { ... }  // DELETE /directory/:id/relationships/:relId

// Affinity group write operations
export async function createAffinityGroup(body: CreateAffinityGroupBody) { ... }
// POST /directory/groups

export async function updateAffinityGroup(groupId: string, body: UpdateAffinityGroupBody) { ... }
// PATCH /directory/groups/:groupId

export async function deleteAffinityGroup(groupId: string) { ... }
// DELETE /directory/groups/:groupId

export async function addGroupMember(groupId: string, body: AddGroupMemberBody) { ... }
// POST /directory/groups/:groupId/members

export async function removeGroupMember(groupId: string, contactId: string) { ... }
// DELETE /directory/groups/:groupId/members/:contactId

export async function listAffinityGroups() { ... }
// GET /directory/groups — required for Gap 4 group management UI
```

Import types from `@protocol/schemas/contact-relationships`:
- `CreateRelationshipBody`
- `CreateAffinityGroupBody`
- `UpdateAffinityGroupBody`
- `AddGroupMemberBody`

### Gap 2: Mobile contact create and edit

**iOS — new files:**

`apps/ios/Sources/Views/Contacts/ContactCreateView.swift`
- Sheet presented from `ContactsView.swift` via a `+` toolbar button (admin-only, check permissions)
- Form fields: contact type selector (uses `contactTypes` from vm), name text field, phone text field, email text field, notes text field
- On submit: encrypt PII fields using hub key (`CryptoService.encryptWithHubKey`), call `apiService.createRawContact()`, dismiss sheet and refresh list
- `data-testid` equivalents: `accessibilityIdentifier("contact-create-sheet")`, `accessibilityIdentifier("contact-create-name")`, `accessibilityIdentifier("contact-create-phone")`, `accessibilityIdentifier("contact-create-save")`

`apps/ios/Sources/Views/Contacts/ContactEditView.swift`
- Sheet presented from `ContactDetailView.swift` via an edit toolbar button (admin-only)
- Pre-fills all fields from the existing contact's decrypted PII
- On submit: re-encrypt updated PII fields, call `apiService.updateDirectoryContact()`, dismiss sheet and refresh detail
- `accessibilityIdentifier("contact-edit-sheet")`, `accessibilityIdentifier("contact-edit-save")`

**iOS — modifications:**

`apps/ios/Sources/Views/Contacts/ContactsView.swift`
- Add `+` toolbar button visible when user has `contacts:create` permission
- Present `ContactCreateView` as sheet

`apps/ios/Sources/Views/Contacts/ContactDetailView.swift`
- Add edit toolbar button visible when user has `contacts:edit` permission
- Present `ContactEditView` as sheet

`apps/ios/Sources/Services/ApiService.swift` (or equivalent API layer)
- Ensure `createRawContact()`, `updateDirectoryContact()`, `deleteDirectoryContact()` are exposed
- These map to `POST /directory`, `PATCH /directory/:id`, `DELETE /directory/:id`

**Android — new files:**

`apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactCreateScreen.kt`
- Bottom sheet or full-screen composable presented from `ContactsScreen`
- Same fields as iOS: contact type, name, phone, email, notes
- On submit: encrypt via `CryptoService.encryptWithHubKey()`, call API, navigate back to list

`apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactEditScreen.kt`
- Bottom sheet or full-screen composable presented from `ContactDetailScreen`
- Pre-fills from existing contact's decrypted PII
- On submit: re-encrypt, call API, navigate back to detail

`apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactFormViewModel.kt`
- Shared ViewModel backing both create and edit
- State: `contactType`, `nameText`, `phoneText`, `emailText`, `notesText`, `isSaving`, `error`
- `fun submit()` — encrypts fields, dispatches API call

**Android — modifications:**

`apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt`
- Add FAB visible when user has `contacts:create` permission
- Navigate to `ContactCreateScreen`

`apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt`
- Add edit icon button in `TopAppBar` visible when user has `contacts:edit` permission
- Navigate to `ContactEditScreen`

**E2EE requirement:** Contact PII fields (name, phone, email, free-form notes) are hub-key encrypted on device before being sent. The backend never receives plaintext PII. Before using `LABEL_CONTACT_PII`, run `grep -r 'LABEL_CONTACT' packages/protocol/crypto-labels.json`. If absent, add it to `crypto-labels.json` as `'llamenos:contact-pii'` and run `bun run codegen` to regenerate labels across all platforms. This is a prerequisite for the contact encryption work.

### Gap 3: Desktop — relationship management UI

**File:** `src/client/routes/directory/$contactId.tsx` (or whichever component renders contact detail on desktop)

Add a "Relationships" section to the contact detail view:
- Display existing relationships (already populated from `listDirectoryContactRelationships()`)
- "Add relationship" button: opens inline form with fields:
  - Contact picker (search by name/identifier, calls `searchRawContacts()`)
  - Relationship type selector (use `RELATIONSHIP_TYPES` constants from `@protocol/schemas/contact-relationships`)
  - Direction selector: outgoing / incoming / bidirectional
  - Optional notes (encrypted with hub key before sending)
  - On save: calls `createContactRelationship()`
- Each existing relationship row: "Remove" button → calls `deleteContactRelationship()` with confirmation

**File:** `src/client/routes/directory/$contactId.tsx` (groups tab/section)

Add a "Groups" section to the contact detail view (read-only — shows which affinity groups this contact belongs to, with group name, role, and member count from `listDirectoryContactGroups()`).

### Gap 4: Desktop — affinity group management UI

**File:** `src/client/routes/directory/groups.tsx` (new route) OR add as a tab to the existing directory view

Affinity groups management page:
- List all groups (`listAffinityGroups()` — calls `GET /directory/groups`, added in Gap 1 above)
- "Create group" button: opens form with fields:
  - Group name and description (displayed as plaintext; stored encrypted with hub key)
  - Member picker (multi-select, search contacts)
  - Role per member (optional, from `GROUP_MEMBER_ROLES` constants)
  - On save: calls `createAffinityGroup()`
- Each group row: expand to see members, edit name/description, add/remove members
- Edit calls `updateAffinityGroup()`, member add/remove calls `addGroupMember()` / `removeGroupMember()`
- Delete group: calls `deleteAffinityGroup()` with confirmation

**E2EE:** Group `encryptedDetails` (name + description) is encrypted with hub key on client. `detailEnvelopes` must include all admin pubkeys per the standard envelope pattern.

### Gap 5: Mobile — groups tab in contact detail (read-only)

`apps/ios/Sources/Views/Contacts/ContactDetailView.swift`
- Add a "Groups" section after the "Relationships" section
- Calls `listDirectoryContactGroups(contactId)` (via ViewModel)
- Displays each group: name, description (decrypted), member count, the contact's role in the group

`apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt`
- Add a `GroupMembership` section in `ContactProfileContent`
- Same data as iOS

### Gap 6: Contact merge backend

**File:** `apps/worker/routes/contacts-v2.ts`

New endpoint: `POST /directory/merge`

> **E2EE constraint:** Contact merge re-encryption CANNOT be done server-side — the server never holds the hub key plaintext. The server merge endpoint receives a pre-merged, re-encrypted profile blob from the client. The client is responsible for: (1) decrypting both contact profiles using the hub key, (2) applying field resolution rules, (3) re-encrypting the merged profile, (4) POSTing `{ survivingId, deletedId, mergedEncryptedProfile: string }` to `POST /contacts/merge`. The server performs only: validate both contact IDs exist, replace `survivor.encryptedProfile` with `mergedEncryptedProfile`, unlink `deleted` contact's cases and relink to survivor, delete the `deleted` contact record. No server-side PII handling.

```
Permission: contacts:delete (admin-level)
Body: {
  survivingId: string (uuid),
  deletedId: string (uuid),
  mergedEncryptedProfile: string,  // re-encrypted by client
}
```

Server-side operations (in `services.contacts.merge()`):
1. Validate both `survivingId` and `deletedId` exist in the hub
2. Replace `survivor.encryptedProfile` with `mergedEncryptedProfile`
3. Merge identifier hashes: union of both contacts' blind index entries (HMAC hashes)
4. Re-link all case contact links (`record_contacts` table): update `contactId` from `deletedId` → `survivingId`
5. Re-link all interactions referencing `deletedId`
6. Re-link all relationships: replace `contactIdA` or `contactIdB` where = `deletedId` with `survivingId`; deduplicate
7. Re-link all affinity group memberships: update `contactId` from `deletedId` → `survivingId`; deduplicate
8. Delete `deletedId` contact record
9. Audit log: `contactMerged` with `{ survivingId, deletedId }`
10. Return: updated surviving contact

Schema in `@protocol/schemas/contacts-v2` — add `mergeContactsBodySchema`:
```typescript
export const mergeContactsBodySchema = z.object({
  survivingId: z.uuid(),
  deletedId: z.uuid(),
  mergedEncryptedProfile: z.string(),
})
```

> **Contact `notes` field:** The `notes` field is treated as a scalar string for merge purposes (surviving/deleted resolution). If notes contain multiple entries in a structured format, this must be revisited. V1 assumes scalar notes.

### Gap 7: Contact merge — client API + desktop UI

**File:** `src/client/lib/api.ts`

```typescript
export async function mergeContacts(params: {
  survivingId: string
  deletedId: string
  mergedEncryptedProfile: string  // pre-merged, re-encrypted by caller
}): Promise<RawContact>
```

**Desktop UI:**
- On contact detail view: "Merge duplicate" button (admin-only)
- Opens a merge dialog:
  - Contact search field to find the duplicate
  - Side-by-side field comparison showing decrypted PII from both contacts
  - Radio selectors per field: keep from surviving or keep from deleted contact
  - The dialog performs client-side merge: decrypts both profiles, applies selections, re-encrypts merged result
  - Confirmation step before submit
  - On confirm: calls `mergeContacts()` with the pre-encrypted merged profile, navigates to surviving contact

### Gap 8: Case merge backend

**File:** `apps/worker/routes/records.ts`

New endpoint: `POST /records/merge`

```
Permission: cases:delete (admin-level)
Body: {
  primaryId: string (uuid),
  duplicateId: string (uuid),
}
```

Server-side operations (in `services.cases.merge()`):
1. Load both records, verify both belong to the same hub and entity type
2. Keep primary record's summary envelope, metadata, status, severity (admin decision implied by choice of primaryId)
3. Move all interactions from `duplicateId` → `primaryId`
4. Move all evidence from `duplicateId` → `primaryId`
5. Move all contact links from `duplicateId` → `primaryId` (deduplicate by contactId)
6. Move all report links from `duplicateId` → `primaryId`
7. Move all note links from `duplicateId` → `primaryId`
8. Delete `duplicateId` record
9. Audit log: `caseMerged` with `{ primaryId, duplicateId }`
10. Return: updated primary record

Schema in `@protocol/schemas/records` — add `mergeRecordsBodySchema`:
```typescript
export const mergeRecordsBodySchema = z.object({
  primaryId: z.uuid(),
  duplicateId: z.uuid(),
})
```

### Gap 9: Case merge — client API + desktop UI

**File:** `src/client/lib/api.ts`

```typescript
export async function mergeCases(params: {
  primaryId: string
  duplicateId: string
}): Promise<CaseRecord>
```

**Desktop UI:**
- On case detail view: "Merge case" action (admin-only, in a more-actions dropdown)
- Opens a merge dialog:
  - Case search/number input to find the duplicate
  - Summary showing: both case numbers, entity type, status, contact count, interaction count
  - Warning: "All interactions, evidence, and contacts from the duplicate will be moved to this case. The duplicate will be permanently deleted."
  - Confirmation checkbox + submit
  - On confirm: calls `mergeCases()`, navigates to surviving case

---

## File Map

| File | Change |
|------|--------|
| `src/client/lib/api.ts` | Add `createContactRelationship`, `deleteContactRelationship`, `listAffinityGroups`, `createAffinityGroup`, `updateAffinityGroup`, `deleteAffinityGroup`, `addGroupMember`, `removeGroupMember`, `mergeContacts`, `mergeCases` |
| `apps/ios/Sources/Views/Contacts/ContactCreateView.swift` | New file — contact creation sheet |
| `apps/ios/Sources/Views/Contacts/ContactEditView.swift` | New file — contact edit sheet |
| `apps/ios/Sources/Views/Contacts/ContactsView.swift` | Add `+` toolbar button, present create sheet |
| `apps/ios/Sources/Views/Contacts/ContactDetailView.swift` | Add edit button, groups section |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactCreateScreen.kt` | New file |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactEditScreen.kt` | New file |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactFormViewModel.kt` | New file — shared create/edit VM |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactsScreen.kt` | Add FAB for create |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/contacts/ContactDetailScreen.kt` | Add edit action, groups section |
| `apps/worker/routes/contacts-v2.ts` | Add `POST /directory/merge` endpoint |
| `apps/worker/routes/records.ts` | Add `POST /records/merge` endpoint |
| `packages/protocol/schemas/contacts-v2.ts` | Add `mergeContactsBodySchema` |
| `packages/protocol/schemas/records.ts` | Add `mergeRecordsBodySchema` |
| Desktop contact detail route | Add relationship write UI, groups display, merge action |
| Desktop directory route or new groups route | Add affinity group management page |
| Desktop case detail route | Add case merge action |

---

## Verification Gates

1. **Client API coverage:** `createContactRelationship`, `deleteContactRelationship`, `listAffinityGroups`, `createAffinityGroup`, `updateAffinityGroup`, `deleteAffinityGroup`, `addGroupMember`, `removeGroupMember`, `mergeContacts`, `mergeCases` all exist and are typed against protocol schemas.

2. **Mobile contact create (iOS):** Admin can create a contact with name, phone, email; contact appears in list; PII is visible only after hub-key decryption in the client.

3. **Mobile contact create (Android):** Same as iOS, using `ContactCreateScreen` + `ContactFormViewModel`.

4. **Mobile contact edit:** Admin can open edit sheet from detail view, modify a field, save — change reflected in detail view.

5. **Mobile groups display:** `ContactDetailView` (iOS) and `ContactDetailScreen` (Android) show affinity group memberships when the contact belongs to any groups.

6. **Desktop relationship management:** Admin can add a relationship between two contacts (with type and direction), relationship appears in both contacts' detail views; admin can remove a relationship.

7. **Desktop affinity group management:** Admin can create a group, add/remove members, update group name/description, delete group.

8. **Contact merge backend:** `POST /directory/merge` accepts `{ survivingId, deletedId, mergedEncryptedProfile }` — surviving contact's `encryptedProfile` is replaced with the client-provided merged blob, union of identifier hashes applied, all case/interaction/relationship links updated, deleted contact record removed. Server never decrypts PII.

9. **Contact merge desktop UI:** Admin can trigger merge from contact detail, select field resolutions, confirm — duplicate record is gone from list.

10. **Case merge backend:** `POST /records/merge` merges two case records — all interactions, evidence, and contact links from duplicate transferred to primary, duplicate deleted.

11. **Case merge desktop UI:** Admin can trigger merge from case detail, confirm — duplicate case is gone, primary case has all the content.

12. **Type-check:** `bun run typecheck` passes with no errors.

13. **Backend BDD:** All BDD tests for contacts and records routes continue to pass (`bun run test:backend:bdd`).

14. **Android:** `./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin` all pass.

15. **E2EE:** Network inspector confirms no plaintext PII is sent to the server in any contact create, edit, or merge operation.
