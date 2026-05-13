---
epic: EP06
phase: A4
title: "Advanced CMS — Merge, Evidence, Bulk Ops, Cross-Hub, Import"
status: specced
depends-on: [EP06-A2]
blocks: []
---

# Spec: EP06-A4 — Advanced CMS

**Date:** 2026-05-12
**Status:** Specced

---

## Goal

Complete the advanced CMS operations: client-side contact merge with re-encryption, server-side entity merge, evidence custody chain display across all platforms, in-app bulk contact operations (no export), cross-hub entity visibility for super-admins, and contact batch import with duplicate detection. These features depend on the write UX from A2 being in place.

---

## Architecture Decisions

### 1. Contact merge — entirely client-side

Contact merge is a client-side operation due to E2EE constraints — the server can't read contact PII to merge it. The flow:

1. Admin selects two contacts to merge (primary survives, secondary is absorbed)
2. Client decrypts both contacts' PII profiles
3. Client presents merge preview: field-by-field comparison, admin picks values from either contact
4. Client creates merged profile, re-encrypts with hub key
5. Client computes new blind indexes for merged profile (name trigrams, identifier hashes, tag hashes)
6. Client sends merged encrypted payload to `POST /directory/merge`:
   ```json
   {
     "primaryId": "...",
     "secondaryId": "...",
     "mergedEncryptedProfile": "...",
     "mergedProfileEnvelopes": [...],
     "mergedBlindIndexes": {...},
     "mergedTrigramTokens": [...]
   }
   ```
7. Server:
   - Updates primary contact with merged encrypted data + indexes
   - Re-links all secondary's relationships, group memberships, entity links, call links, conversation links to primary
   - Deletes secondary's blind index entries and trigram tokens (invalidated by merge)
   - Marks secondary as merged (soft delete with `mergedIntoId` pointer to primary)
   - Audit log entry

**Desktop-only write UI.** Merge is too complex for mobile (field-by-field comparison on small screens). Mobile shows merged contacts correctly but doesn't initiate merges.

### 2. Entity merge — server-side relinking

Entity merge is simpler than contact merge — no PII re-encryption needed. The surviving entity keeps its own encrypted content. The merged entity's linked resources move to the survivor.

`POST /records/merge`:
```json
{
  "primaryId": "...",
  "secondaryId": "..."
}
```

Server-side transaction:
1. Re-link secondary's contacts, interactions, reports, evidence to primary
2. Increment primary's counters
3. Copy secondary's interactions as "merged" interactions on primary (preserves timeline)
4. Soft-delete secondary with pointer to primary
5. Audit log entry

No encryption changes needed — the surviving entity's encrypted content is untouched. The merged entity's timeline items become part of the survivor's timeline.

**Desktop-only write UI.** Entity merge requires understanding both entities' context.

### 3. Evidence custody chain display — all platforms

Backend evidence endpoints are fully implemented:
- `POST /records/:id/evidence` — upload metadata
- `GET /records/:id/evidence` — list evidence
- `GET /evidence/:id/custody` — custody chain
- `POST /evidence/:id/access` — log access
- `POST /evidence/:id/verify` — integrity verification

Missing: UI for viewing custody chain and verifying integrity. All platforms get evidence display:

**Desktop:** Evidence tab in entity detail (exists) + custody chain timeline + integrity verification button
**iOS:** Evidence section in entity detail + custody chain list view
**Android:** Evidence section in entity detail + custody chain list view

Custody chain displays as a chronological list:
- Who accessed the evidence, when, action type (upload, view, download, verify)
- Integrity hash verification status (green check / red warning)
- Chain integrity (SHA-256 hash chain — any break shows warning)

### 4. Bulk contact operations — in-app mutations only, NO export

v1 had `POST /api/contacts/bulk` for batch updates and `POST /api/contacts/outreach` for notifications. v2 needs equivalent in-app batch operations:

**Supported bulk operations:**
- Add/remove tags to multiple contacts
- Add/remove contacts from affinity groups
- Change contact risk level
- Bulk delete (single confirmation dialog showing count of contacts to delete — not per-contact confirmation)

**NOT supported (security constraint):**
- CSV/PDF/file export of contact data
- Bulk data extraction in any format
- Copy-to-clipboard of multiple contacts

**Implementation:** Multi-select mode in contact directory. Bottom action bar appears with available bulk actions. Each action confirms before executing.

**Backend:** `POST /directory/bulk` endpoint with action type:
```json
{
  "contactIds": ["...", "..."],
  "action": "add-tags",
  "payload": { "tags": ["urgent", "follow-up"] }
}
```

Blind indexes are recomputed per-contact for tag changes (tag hashes change). Client sends updated blind index tokens for each affected contact.

### 5. Cross-hub entity visibility — forward-only envelopes

Super-admins who oversee multiple hubs need to see entities across hubs without switching hub context.

**Approach:** Forward-only envelope inclusion. When a super-admin's pubkey is in the entity's envelope recipients, they can decrypt it from any hub view. Entities created *before* the super-admin was enrolled are NOT retroactively accessible — no re-encryption ceremony.

**Implementation:**
1. New permission: `cases:read-cross-hub` (platform-level, not hub-level)
2. Entity creation: if hub has super-admins, their pubkeys are added to envelope recipients alongside hub members
3. Cross-hub query: `GET /records?crossHub=true` — server queries the `summaryEnvelopes` JSONB for records where the requesting user's pubkey appears as a recipient (the pubkey is stored as a key in the envelopes object, so the server can filter without decrypting). This is a JSONB containment query: `WHERE summary_envelopes ? :userPubkey`
4. Desktop: toggle in entity list header: "This Hub" / "All Hubs" (visible only with `cases:read-cross-hub`)
5. Navigation: clicking a cross-hub entity opens it in the source hub's context

**Mobile:** Cross-hub toggle available on entity list (same UX as desktop, adapted for mobile layout).

### 6. Contact batch import — client-side encryption

v1 had batch import with server-side encryption (server received plaintext). v2 must do client-side encryption:

1. Admin uploads CSV/vCard file (file never leaves the device — parsed client-side)
2. Client parses contacts from file
3. For each contact:
   - Encrypt PII fields with hub key
   - Compute blind indexes (name trigrams, identifier hashes, tag hashes)
   - Check for duplicates via blind index lookup against server
4. Client shows import preview: new contacts, potential duplicates, validation errors
5. Admin confirms import
6. Client batch-submits encrypted contacts to `POST /directory/bulk-create`

**Duplicate detection:** Client computes identifier hashes (phone, email) for each import contact, sends to `GET /directory/lookup/:identifierHash` for each. Matches shown as "potential duplicate — merge or skip."

**Rate limiting:** Max 100 contacts per batch to prevent abuse. Admin can run multiple batches.

**File handling:** Import file is parsed in-memory, never sent to server. After import, file reference is discarded. The server never sees the original file.

**Desktop-only.** Import involves spreadsheet review and duplicate resolution — not suitable for mobile.

### 7. Custom report display types

Entities can be displayed in different rendering modes depending on their fields:

**Table (default):** Paginated list with sortable columns, entity type filters
**Calendar:** Month/week view for entities with date fields — rendered from decrypted date values
**Timeline:** Chronological ordering for entities with timestamps — useful for incident tracking

Display types are per-entity-type configuration:
```json
{
  "displayTypes": ["table", "calendar", "timeline"],
  "defaultDisplayType": "table"
}
```

Calendar and timeline views are available on all platforms. Calendar uses a simple month grid on mobile (no third-party calendar library — native date layout).

---

## Current State

### Backend
- **Contact merge:** No `POST /directory/merge` endpoint
- **Entity merge:** No `POST /records/merge` endpoint
- **Evidence:** Fully implemented (upload, list, custody, access logging, verification)
- **Bulk operations:** No bulk endpoint
- **Cross-hub:** No cross-hub query support
- **Batch import:** No `POST /directory/bulk-create` endpoint

### Desktop
- **Evidence tab:** Exists in entity detail but no custody chain tab, no integrity verification button
- **Merge:** No merge UI for contacts or entities
- **Bulk operations:** No multi-select in contact directory
- **Cross-hub:** No toggle
- **Import:** No import UI
- **Display types:** Only table view

### iOS / Android
- **Evidence:** No evidence detail views
- **Merge:** No merge UI (expected — desktop-only)
- **Bulk operations:** No bulk operations
- **Cross-hub:** No cross-hub toggle
- **Import:** No import (expected — desktop-only)
- **Display types:** Only list view

---

## Gaps This Phase Addresses

| # | Gap | From EP06 Stub |
|---|-----|----------------|
| 1 | Contact merge (client-side re-encryption) | Gap 3 |
| 2 | Entity merge (server-side relinking) | Gap 4 |
| 3 | Evidence custody chain UI | Gap 6 |
| 4 | Bulk contact operations | Gap 11 |
| 5 | Cross-hub entity visibility | Gap 12 |
| 6 | Contact batch import | v1 feature port |
| 7 | Custom report display types (calendar, timeline) | New |

---

## Threat Model Considerations

### Contact merge re-encryption
Merge produces new encrypted profile + new blind indexes. The merged contact gets fresh encryption — no stale keys. Server receives only the merged encrypted blob and can't read the plaintext merge result.

Old blind indexes from the secondary contact are invalidated. The primary contact's new indexes reflect the merged data. Search results update immediately.

### Bulk operations — no extraction vectors
Bulk operations modify contacts in-place (tags, groups). No operation produces exportable output. The multi-select UI doesn't enable clipboard copying of contact data. Bulk delete requires per-contact confirmation (not one-click mass delete).

### Cross-hub envelope security
Super-admin pubkeys are added to envelope recipients at entity creation time. The server facilitates the cross-hub query but cannot read any entity content. Entities created before super-admin enrollment are not retroactively accessible — there is no mechanism to re-encrypt existing entities for new recipients without the original creator's participation.

This is a security feature, not a limitation: it prevents a compromised super-admin account from gaining access to historical data.

### Import file security
The import file (CSV/vCard) is parsed client-side and never sent to the server. After parsing, the client encrypts each contact individually with the hub key. The server receives the same encrypted payloads as manual contact creation — it cannot distinguish imported contacts from manually created ones.

If the device is compromised during import, the plaintext file is at risk. But this is the same threat as any client-side operation with E2EE — the device must be trusted during active use.

### Evidence custody chain integrity
The custody chain uses SHA-256 hash chaining (`previousEntryHash` → `entryHash`). Any tampering with custody entries breaks the chain. The UI visually indicates chain integrity: green check for valid chain, red warning for breaks. This is a client-side verification — the client hashes each entry and compares.

### Display type data handling
Calendar and timeline views render from decrypted entity data client-side. No pre-computed calendar data stored server-side. The server provides the same encrypted entity list regardless of display type — rendering mode is a client-side concern.

---

## Permission Model

| Permission | Allows | Platforms |
|---|---|---|
| `contacts:merge` | Merge contacts | Desktop |
| `cases:update` | Merge entities (merge is a destructive update — uses existing `cases:update` permission, no new permission needed) | Desktop |
| `evidence:manage-custody` | View custody chain, verify integrity | All |
| `contacts:edit` | Bulk tag/group operations | Desktop (multi-select) |
| `contacts:delete` | Bulk delete | Desktop (multi-select) |
| `cases:read-cross-hub` | Cross-hub entity toggle | All (platform-level) |
| `contacts:create` | Batch import | Desktop |
| `contacts:merge` | Resolve import duplicates via merge | Desktop |

---

## Mobile UX Patterns

### Evidence custody chain (iOS/Android)
1. Entity detail → Evidence section → tap evidence item
2. Evidence detail view: metadata (type, size, uploaded date, uploader)
3. "Custody Chain" section: chronological list of access events
4. Each entry: action icon, actor name (decrypted), timestamp, action type
5. Chain integrity indicator at top: "Chain verified" / "Chain broken at entry #N"
6. "Verify Integrity" button: re-computes hashes, shows result

### Cross-hub entity browsing (iOS/Android)
1. Entity list → scope toggle in header: "This Hub" / "All Hubs"
2. "All Hubs" mode: entities from all hubs, grouped by hub
3. Hub badge on each entity card showing source hub
4. Tap entity → detail view in source hub context (hub switches temporarily for data access, UI shows "Viewing in [Hub Name]" banner)

### Calendar display (iOS/Android)
1. Entity list → display type picker: "List" / "Calendar"
2. Calendar mode: month grid with date indicators (dots for entities on that date)
3. Tap date → list of entities on that date
4. Swipe left/right for month navigation
5. Only available when entity type has date fields

### Bulk operations (desktop-only — noted for completeness)
1. Contact directory → "Select" mode button
2. Checkboxes appear on contact cards
3. Bottom action bar: "Tag" / "Group" / "Delete" / "Cancel"
4. Tag action: tag picker dialog (add/remove)
5. Group action: group picker dialog (add/remove)
6. Delete action: confirmation dialog with count

---

## Implementation Scope

### Backend
1. **Contact merge endpoint** — `POST /directory/merge` (server-side relinking + soft delete)
2. **Entity merge endpoint** — `POST /records/merge` (transaction: relink resources, soft delete)
3. **Bulk contact operations endpoint** — `POST /directory/bulk` with action types
4. **Batch contact import endpoint** — `POST /directory/bulk-create` (max 100 per batch)
5. **Cross-hub entity query** — extend `listRecords` service method with `crossHub` flag, query across hub IDs where user is envelope recipient
6. **Cross-hub permission** — add `cases:read-cross-hub` to platform-level permissions

### Desktop
7. **Contact merge UI** — field comparison dialog, merge preview, confirm
8. **Entity merge UI** — simple confirmation dialog (no field comparison needed)
9. **Evidence custody chain tab** — chronological timeline in evidence detail, integrity verification
10. **Bulk operations** — multi-select mode in contact directory, action bar
11. **Cross-hub toggle** — "This Hub" / "All Hubs" in entity list header
12. **Contact import dialog** — CSV/vCard parser, duplicate detection, preview, batch submit
13. **Calendar display type** — month grid view for date-bearing entities
14. **Timeline display type** — chronological view for timestamped entities
15. **Client API functions** — `mergeContacts()`, `mergeEntities()`, `bulkContactAction()`, `bulkCreateContacts()`, `listEntitiesCrossHub()`

### iOS
16. **Evidence custody chain view** — list view with integrity indicator
17. **Cross-hub entity toggle** — scope picker in entity list
18. **Calendar display** — native month grid (no third-party lib)
19. **Timeline display** — chronological list

### Android
20. **Evidence custody chain view** — list view with integrity indicator
21. **Cross-hub entity toggle** — scope picker in entity list
22. **Calendar display** — month grid composable
23. **Timeline display** — chronological list

### Protocol / i18n
24. **Protocol schemas** — merge request/response, bulk action request/response, bulk create request/response, cross-hub query params
25. **i18n strings** — all 13 locales: merge labels, bulk action labels, import labels, custody chain labels, display type names, cross-hub labels

---

## References

- Existing spec: `2026-03-21-cms-contact-management.md` — merge operations detail
- Existing spec: `2026-03-21-cms-advanced-ui.md` — evidence custody and cross-hub detail
- v1 contact import: `/home/rikki/projects/llamenos-hotline/src/server/routes/contacts-import.ts`
- v1 bulk operations: `/home/rikki/projects/llamenos-hotline/src/server/routes/contacts/bulk.ts`
- Evidence routes: `apps/worker/routes/evidence.ts`
- Contacts v2 routes: `apps/worker/routes/contacts-v2.ts`
