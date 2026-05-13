---
epic: EP06
phase: A2
title: "CMS Write UX — Entity & Contact CRUD Across All Platforms"
status: specced
depends-on: [EP06-A1]
blocks: [EP06-A4]
---

# Spec: EP06-A2 — CMS Write UX

**Date:** 2026-05-12
**Status:** Specced

---

## Goal

Complete the write UX for the CMS across all three platforms (desktop, iOS, Android). This covers: entity (record) create/edit with the unified entity type system, contact create/edit with E2EE + blind indexes, relationship and affinity group management, and the two missing field types (location with geocoding, file upload). Hub admins must be able to fully configure entity types and field definitions from any platform, including mobile.

---

## Architecture Decisions

### 1. One entity CRUD flow, entity type drives the form

After A1 unifies events into the entity type system, there is exactly one entity creation flow: user selects an entity type template → form renders fields defined by that entity type → client encrypts, computes blind indexes, submits. No separate "create event" vs "create case" flows.

The `SchemaForm` component (desktop) and equivalent mobile views render dynamically from the entity type's field definitions. Field type components (text, number, select, date, location, file, etc.) are shared across all entity create/edit forms.

### 2. Mobile hub admin = full entity type configuration

Hub admins on mobile must be able to:
- Create/edit/archive entity types
- Define and reorder custom fields on entity types
- Configure statuses, severities, categories
- Manage report type field definitions
- Enable/disable entity type templates

This is NOT desktop-only. The field definition editor renders as a full-screen list editor on mobile with drag-to-reorder, inline field property editing, and field type picker.

### 3. Contact write UI with E2EE + blind indexes

Contact create/edit forms encrypt all PII fields client-side before submission. The flow:
1. User fills contact form (name, phone, email, identifiers, tags, notes)
2. Client encrypts PII fields with hub key → `encryptedProfile` / `profileEnvelopes`
3. Client computes blind index tokens: name trigrams (`HMAC_CONTACT_NAME`), tag hashes (`HMAC_CONTACT_TAG`), identifier hashes (phone HMAC)
4. Client submits encrypted payload + blind index tokens to `/directory`
5. Server stores encrypted blob + blind index tokens, never sees plaintext

Mobile contact creation must support:
- Phone number input with country code picker
- Camera scan for business cards (stretch goal — OCR extraction)
- Quick-create from active call (pre-populated with caller number)
- Offline queue: if offline, queue encrypted payload for sync on reconnect

### 4. Relationship management

Contact relationships are encrypted links between two contacts. The relationship type and notes are encrypted; only the two contact IDs are cleartext (needed for server-side join queries).

Desktop gets a relationship management section in the contact detail view:
- Add relationship (select contact, pick type, add notes)
- View/edit existing relationships
- Delete relationships

Mobile gets read-only relationship display initially. The relationship graph is too complex for small screens as a write surface.

### 5. Affinity group management

Affinity groups are organizational containers for contacts (similar to v1's team-based contact assignment but more flexible). Backend fully supports groups with member management (6 endpoints).

Desktop gets:
- Group list view in contact directory sidebar
- Create/edit/delete groups
- Add/remove members via multi-select
- Filter contact directory by group

Mobile gets:
- Group list view
- Add contacts to groups from contact detail
- Filter contacts by group
- Full group CRUD for hub admins

### 6. Location field type

Entity type fields with `type: "location"` render a location picker component:
- **Desktop:** Text input with geocoding autocomplete via Geoapify (adapter exists) + optional map preview
- **iOS:** Native `CLLocationManager` for GPS + `MKLocalSearchCompleter` for autocomplete (Apple-native, no third-party dependency)
- **Android:** `FusedLocationProviderClient` for GPS + Geoapify autocomplete (avoids Google Places API dependency and billing)
- **All platforms:** Manual address entry always available (no GPS required)
- **Precision capping:** Client-side enforcement based on entity type's `locationOptions.maxPrecision` — snaps coordinates to configured precision before encryption
- **Blind index:** City-level region bucket for server-side geographic filtering (if `indexable: true`)

Location values stored as encrypted JSON:
```json
{
  "address": "123 Main St, Springfield",
  "lat": 39.7817,
  "lon": -89.6501,
  "precision": "block",
  "source": "gps"
}
```

### 7. File upload field type

Entity type fields with `type: "file"` render a file picker/upload component:
- **Desktop:** Drag-and-drop zone + file picker, preview for images
- **iOS:** `PHPickerViewController` for photos, `UIDocumentPickerViewController` for files
- **Android:** `ActivityResultContracts.GetContent()` for files, camera intent for photos
- **All platforms:** File is encrypted client-side before upload to RustFS
- **Upload flow:** Client encrypts file → uploads encrypted blob to `POST /api/files` → receives file reference ID → stores reference ID in entity field
- **Size limits:** Configured per entity type field (`maxFileSize`, `allowedMimeTypes`, `maxFiles`)
- **No thumbnail generation on server** — thumbnails generated client-side from the decrypted file

### 8. Report type field editor

Report types have custom field definitions that control what fields appear on intake/report forms. The field editor is a full CRUD UI:
- Add/remove/reorder fields
- Configure field properties (label, type, required, validation, options)
- Preview form layout
- Available on all platforms (hub admin capability)

Shares the same `FieldDefinitionEditor` component as entity type field configuration. The editor is extracted as a reusable component.

---

## Current State

### Desktop
- **Entity CRUD:** `cases.tsx` has create/update dialogs with `SchemaForm` rendering entity type fields. Evidence tab, assignment dialog, timeline exist.
- **Contact directory:** `contacts-directory.tsx` has list view with search, type filtering, E2EE profile decryption. `CreateContactDialog` exists. No edit dialog.
- **Relationships:** Read-only display in `contact-profile.tsx`. No write UI.
- **Groups:** No UI (backend fully supports).
- **SchemaForm:** Falls through to plain `<Input>` for location fields (no geocoding). File fields have no upload UI.
- **Report type editor:** `ReportTypeFieldsEditor` is a stub.
- **Entity type admin:** Entity type CRUD exists in admin settings.

### iOS
- **Contacts:** Read-only list/detail via legacy `/api/contacts`. No create/edit views.
- **Cases:** List/detail exist. Limited create/edit.
- **Entity type admin:** No admin configuration UI.
- **Field types:** No location or file field components.

### Android
- **Contacts:** Read-only list/detail via legacy `/api/contacts`. No create/edit screens.
- **Cases:** List/detail exist. Limited create/edit.
- **Entity type admin:** No admin configuration UI.
- **Field types:** No location or file field components.

### Client API (`src/client/lib/api.ts`)
**Present:**
- `listRawContacts()`, `searchRawContacts()`, `getRawContact()`, `createRawContact()`, `updateDirectoryContact()`, `deleteDirectoryContact()`
- `listRecords()`, `getRecord()`, `createRecord()`, `updateRecord()`, `listEntityTypes()`
- `listDirectoryContactRelationships()`, `listDirectoryContactGroups()`, `listDirectoryContactCases()`

**Missing:**
- Relationship write: `createContactRelationship()`, `deleteContactRelationship()`
- Group write: `createAffinityGroup()`, `updateAffinityGroup()`, `deleteAffinityGroup()`, `addGroupMember()`, `removeGroupMember()`, `listAffinityGroups()`
- File upload: `uploadFile()`, `getFileMetadata()`
- Entity type templates: `listEntityTemplates()`, `enableTemplate()`, `customizeEntityType()`

---

## Gaps This Phase Addresses

| # | Gap | From EP06 Stub |
|---|-----|----------------|
| 1 | Contact create/edit UI (all platforms) | Gap 2 |
| 2 | Relationship write UI (desktop) | Gap 2 |
| 3 | Affinity group management UI (all platforms) | Gap 2 |
| 4 | Location field type (all platforms) | Gap 8 |
| 5 | File upload field type (all platforms) | Gap 8 |
| 6 | Report type field editor (all platforms) | Gap 7 |
| 7 | Entity type admin on mobile | New (mobile hub admin) |
| 8 | Client API gaps for write operations | Gap 13 (partial) |

---

## Threat Model Considerations

### Contact PII encryption flow
All contact PII (name, phone, email, identifiers) is encrypted with the hub key before leaving the client. The server stores:
- `encryptedProfile`: AES-256-GCM ciphertext of contact profile JSON
- `profileEnvelopes`: HPKE-wrapped content keys for each authorized recipient
- `blindIndexes`: JSONB of HMAC tokens for searchability
- `trigramTokens`: Array of name trigram tokens for partial search

The server NEVER receives plaintext contact data. Search works via blind index matching.

### Location data sensitivity
GPS coordinates are high-value targets. Location field values are:
- Encrypted in the entity's `fieldEnvelopes` tier
- Precision-capped client-side before encryption (admin-configurable per entity type)
- Blind-indexed at city level only (if indexable)
- Never stored in cleartext (unlike current events table `locationApproximate`)

### File upload security
Files are encrypted client-side with a per-file random key before upload. The server stores encrypted blobs and never sees file contents. File metadata (name, size, MIME type) is stored in the entity's encrypted field values, not as cleartext server columns.

### Mobile device security
- Contact PII decrypted only for display, immediately discarded from memory
- Offline queued payloads are encrypted at rest (iOS Keychain, Android EncryptedSharedPreferences)
- No plaintext caching of contact data
- Blind index tokens computed via platform crypto service (Rust UniFFI on iOS, JNI on Android)

### Entity type definition encryption
Entity type definitions (field names, labels, configurations) reveal operational details about a hub's mission. These are encrypted with the hub key. The server stores them as opaque blobs, routing by entity type UUID.

### No data export
No bulk export of contacts or entities. The contact directory and entity list are in-app views only. Bulk operations (tag assignment, group membership) are in-app mutations, never extraction.

---

## Permission Model

### Contact operations
| Permission | Allows | Platforms |
|---|---|---|
| `contacts:view` | View contact list and details | All |
| `contacts:create` | Create new contacts | All |
| `contacts:edit` | Edit existing contacts | All |
| `contacts:delete` | Delete contacts | All |
| `contacts:manage-relationships` | Create/delete relationships (write: desktop; read: all platforms — `contacts:view` suffices for reading relationships) |
| `contacts:manage-groups` | Create/edit/delete groups, manage members | All |
| `contacts:view-pii` | Decrypt and view PII tier fields | All |
| `contacts:search` | Search contacts via blind indexes | All |

### Entity operations
| Permission | Allows | Platforms |
|---|---|---|
| `cases:create` | Create entities of any type | All |
| `cases:read-own` | Read entities created by self | All |
| `cases:read-assigned` | Read entities assigned to self | All |
| `cases:read-all` | Read all entities | All |
| `cases:update` | Update entities | All |
| `cases:delete` | Delete entities | All |
| `settings:manage-cms` | Entity type configuration, field definitions, report type editing | All (hub admin) |
| `files:upload` | Upload encrypted files (inherited from entity permission — any user who can create/edit an entity with a file field can upload) | All |

### Field-level access
Entity type fields have `accessLevel` (all, admin, assigned, custom) that controls which users can see/edit specific fields within an entity. This is enforced in the form renderer — fields the user doesn't have access to are hidden.

---

## Mobile UX Patterns

### Contact creation flow (iOS/Android)
1. Tap "+" in contact directory → full-screen form
2. Required fields: display name
3. Optional sections: identifiers (phone, email, Signal), tags, notes, relationships
4. Phone input: country code picker + number field
5. "Save" encrypts all fields, computes blind indexes, submits
6. Offline: form remains open, "Saved offline — will sync" badge
7. Quick-create from call: pre-populates phone number from active call

### Entity creation flow (iOS/Android)
1. Tap "+" in entity list → entity type picker (shows enabled templates)
2. Select type → full-screen form with type-specific fields
3. Dynamic field rendering based on entity type definition
4. Date fields: native date/time picker
5. Location fields: native GPS + address autocomplete
6. File fields: native photo/document picker
7. "Save" encrypts, computes blind indexes, submits

### Entity type configuration (iOS/Android — hub admin)
1. Navigate to hub admin → Entity Types section
2. List of enabled entity types with edit/create/archive options
3. Tap entity type → full-screen editor:
   - General: name, label, icon, color, category
   - Fields: full-screen list with drag-to-reorder, inline property editing
   - Statuses: list editor with add/remove/reorder
   - Severities: list editor (optional)
   - Categories: list editor (optional)
   - Access: default access level, role restrictions
4. Field type picker: modal with all available field types
5. Field property editor: full-screen form per field

### Affinity group management (iOS/Android)
1. Groups tab in contact directory
2. Group list → tap group → member list
3. Add members: search contacts, multi-select, confirm
4. Hub admins: create/edit/delete groups
5. From contact detail: "Add to Group" action sheet

---

## Implementation Scope

### Backend
1. **Client API write functions** — add missing relationship, group, file, and template management endpoints to existing routes
2. **File upload endpoint** — `POST /api/files` for encrypted blob storage via RustFS (verify existence or create)
3. **Entity type template CRUD** — endpoints for enabling/customizing templates per hub

### Desktop
4. **Contact edit dialog** — mirror create dialog with pre-populated fields, decrypt-on-open
5. **Relationship write UI** — add/delete relationships in contact detail section
6. **Affinity group management UI** — group list sidebar, create/edit/delete, member management
7. **Location field component** — geocoding autocomplete (OpenCage/Geoapify adapter exists), optional map preview
8. **File upload field component** — drag-and-drop zone, progress bar, encrypted upload
9. **Field definition editor** — extract shared `FieldDefinitionEditor` from entity type admin, wire into report type admin
10. **Client API functions** — add all missing write functions

### iOS
11. **Contact create/edit views** — `CreateContactView.swift`, `EditContactView.swift` with E2EE + blind index via CryptoService
12. **Entity create/edit views** — dynamic form rendering from entity type definitions
13. **Location field view** — `CLLocationManager` GPS + `MKLocalSearchCompleter` autocomplete
14. **File upload view** — `PHPickerViewController` + `UIDocumentPickerViewController`
15. **Entity type admin views** — full entity type configuration (hub admin)
16. **Affinity group views** — group list, member management, contact-to-group actions
17. **Field definition editor** — list editor with drag-to-reorder on mobile

### Android
18. **Contact create/edit screens** — `CreateContactScreen.kt`, `EditContactScreen.kt` with E2EE + blind index via CryptoService JNI
19. **Entity create/edit screens** — dynamic form rendering from entity type definitions
20. **Location field composable** — `FusedLocationProviderClient` GPS + geocoding autocomplete
21. **File upload composable** — `ActivityResultContracts.GetContent()` + camera intent
22. **Entity type admin screens** — full entity type configuration (hub admin)
23. **Affinity group screens** — group list, member management, contact-to-group actions
24. **Field definition editor** — list editor with drag-to-reorder on mobile

### Protocol / i18n
25. **Protocol schemas** — file upload response schema, entity template management schemas
26. **i18n strings** — all 13 locales: form labels, field type names, validation messages, group management labels, entity type admin labels

---

## References

- Existing spec: `2026-03-21-cms-contact-management.md` — contact write operations detail
- Existing spec: `2026-03-21-cms-field-types.md` — location and file field type detail
- Existing spec: `2026-03-21-cms-advanced-ui.md` — field editor extraction detail
- Entity type schema: `packages/protocol/schemas/entity-schema.ts`
- Desktop SchemaForm: `src/client/components/schema-form.tsx`
- Geocoding adapters: existing OpenCage/Geoapify infrastructure
