---
epic: EP06
phase: A1
title: "Entity System Unification — Events → Entity Types"
status: specced
depends-on: [EP01, EP03]
blocks: [EP06-A2, EP06-A3, EP06-A4]
---

# Spec: EP06-A1 — Entity System Unification

**Date:** 2026-05-12
**Status:** Specced

---

## Goal

Unify the split records/events data model into a single entity system where "events" are just entity type templates with date and location fields. Deprecate the `/api/events` surface entirely. Migrate mobile apps from legacy `/api/contacts` to v2 `/directory`. Establish the foundation all other EP06 phases build on.

---

## Architecture Decisions

### 1. Events become entity type templates, not a separate API

The current codebase has two parallel API surfaces (`/api/records` and `/api/events`) doing nearly the same thing with different schemas, different encryption tiers, and different sub-resource support. Events are just entities with temporal and spatial metadata.

**What changes:**
- The `case_records` table absorbs event-specific capabilities (date range fields, parent-child hierarchy already exists via `parentRecordId`)
- The `events` table is deprecated — existing event data migrates to `case_records` with an "Event" entity type
- The `/api/events` routes are deprecated — all CRUD goes through `/api/records`
- Entity type templates ship preconfigured entity types: "Event", "Case", "Incident Report", etc.
- Hubs that don't need events simply don't enable that template

**What stays the same:**
- Entity type `category` enum already includes `event` — this continues to identify event-typed entities
- All existing records API features (assignment, interactions, evidence, contacts, reports) become available to event entities
- Entity type configuration remains hub-admin territory

### 2. Temporal data via entity type date fields, not cleartext columns

**Current problem:** The events table stores `startDate`/`endDate` in cleartext. For a crisis response app, event timing (protest dates, incident timestamps) is operationally sensitive. A compromised server reveals when events happened.

**New approach:** Date values are encrypted in the entity's `fieldEnvelopes` tier. Server-side temporal queries use blind index date bucketing (already implemented in `packages/crypto/src/blind_index.rs`):
- `date_blind_indexes()` produces day/week/month bucket tokens
- Server filters by month or week bucket using blind index JSONB containment
- Client does precise date filtering after decryption
- Calendar views: server returns month-bucket results, client renders exact dates

**Entity type date field configuration:**
```json
{
  "name": "start_date",
  "label": "Start Date",
  "type": "date",
  "required": true,
  "indexable": true,
  "indexType": "date"
}
```

The `indexType: "date"` flag tells the client to compute day/week/month blind index tokens when creating or updating the entity. These tokens go into the `blindIndexes` JSONB column.

### 3. Location data via entity type location fields, encrypted

**Current problem:** Events store `locationApproximate` in cleartext and `locationPrecision` as a cleartext enum. For a crisis hotline tracking protest locations or incident sites, this is a direct threat vector.

**New approach:** Location values are encrypted in `fieldEnvelopes`. The entity type location field has client-side precision capping (already specced in cms-field-types). A blind-indexed region bucket (city-level hash) enables server-side geographic filtering without revealing coordinates.

**Entity type location field configuration:**
```json
{
  "name": "location",
  "label": "Location",
  "type": "location",
  "required": false,
  "indexable": true,
  "indexType": "location",
  "locationOptions": {
    "maxPrecision": "neighborhood",
    "allowGps": true,
    "allowAutocomplete": true
  }
}
```

### 4. Parent-child hierarchy generalized

`parentRecordId` already exists on `case_records`. Sub-events become sub-records. Entity type configuration controls whether hierarchy is enabled:

```json
{
  "allowSubRecords": true
}
```

This makes hierarchy available to any entity type — case sub-tasks, incident sub-events, etc.

### 5. Entity type templates

Templates are preconfigured entity type definitions shipped with the app. Hub admins can:
- Enable/disable templates for their hub
- Customize fields, statuses, severities on enabled templates
- Create entirely custom entity types from scratch

**Shipped templates:**
- **Case** — default: statuses (open/in_progress/resolved/closed), severity levels, assignment enabled, interactions enabled
- **Event** — default: date range fields (start/end), optional location, sub-records enabled, no assignment by default
- **Incident Report** — default: triage-oriented, severity, category, auto-converts from reports
- **Contact Note** — default: minimal, links to contact, no assignment

Templates are defined in `packages/protocol/schemas/entity-templates.ts` as Zod schemas and shipped via codegen to all platforms. Hub admins modify instances — templates are the starting point, not a constraint.

### 6. Permission unification

Current state: `cases:*` (14 permissions) and `events:*` (5 permissions) are separate sets. After unification:
- `cases:*` permissions apply to ALL entity types. The `cases:*` naming is retained — renaming to `entities:*` is out of scope for EP06 (would touch every permission check across 4 platforms for zero functional gain; can be done as a standalone rename epic if desired).
- `events:*` permissions become aliases that map to their `cases:*` equivalents: `events:create` → `cases:create`, `events:read` → `cases:read-all`, `events:update` → `cases:update`, `events:delete` → `cases:delete`, `events:link` → `cases:link`. Pre-production, so these aliases can be removed after migration.
- Entity type configuration can restrict which permissions apply (e.g., "Event" template disables `cases:assign` by default since events aren't typically assigned)

### 7. Encryption tier alignment

Events currently use 1-tier E2EE (`encryptedDetails`/`detailEnvelopes`). Records use 3-tier (summary/fields/pii). After unification:
- All entities use the 3-tier model
- Event data migrates: `encryptedDetails` → `encryptedSummary` (name, description, status go to summary tier)
- Event-specific fields (location, organizers, attendance) → `encryptedFields` (field tier)
- No PII tier needed for events by default, but available if entity type configures `piiFields`

### 8. Mobile v2 directory migration

Both iOS and Android still use legacy `/api/contacts` (phone-hash model). Before any CMS write UI can ship, mobile must migrate to v2 `/directory` with:
- E2EE encrypted profiles (hub key encryption)
- Blind index computation client-side (name trigrams, tag hashes)
- Search via trigram blind indexes for partial matching
- Offline-first: queue encrypted payloads locally, sync on reconnect

### 9. Client API unification

`src/client/lib/api.ts` has separate record and event functions. After unification:
- All entity CRUD goes through record functions
- Event-specific API functions removed
- New functions added for entity type template management
- Entity type filtering replaces the events/records distinction in list views

---

## Current State

### What Exists (records/entity system)
- **Backend:** Full CRUD, 3-tier E2EE, assignment, interactions, evidence, contacts, reports, sub-records, case numbering, blind indexes
- **Entity type definitions:** Schema supports `date`, `location`, `file`, `text`, `number`, `select`, `multiselect`, `checkbox`, `textarea` field types with blind index configuration
- **Entity schema admin route:** `apps/worker/routes/entity-schema.ts` — CRUD for entity type definitions
- **Desktop:** Cases list/detail with entity type filters, create/update dialogs, assignment, evidence, timeline
- **iOS/Android:** Case list/detail views, limited CRUD

### What Exists (events — to be deprecated)
- **Backend:** Full CRUD, 1-tier E2EE, sub-events, record/report linking — but NO assignment, NO interactions, NO evidence, NO contacts, NO custom fields
- **Desktop `events.tsx`:** Uses records API incorrectly (known bug)
- **Android:** Uses records API incorrectly, events stored unencrypted (E2EE regression)
- **iOS:** Uses correct events API but doesn't populate `eventTypeHash`/`statusHash`

### What Exists (blind indexes)
- **Rust:** `blind_index.rs` — HMAC-SHA256 exact match, date bucketing (day/week/month), name trigrams, canonical normalization
- **Crypto labels:** `HMAC_CONTACT_NAME`, `HMAC_CONTACT_TAG`, `HMAC_CASE_STATUS`, `HMAC_CASE_SEVERITY`, `HMAC_CASE_CATEGORY`, `HMAC_EVENT_TYPE` — all defined
- **Backend services:** `ContactsService` and `CasesService` already use blind indexes + trigram tokens

### What Exists (WebSocket relay)
- **Server:** `ws-manager.ts` + `ws-events.ts` — AES-256-GCM encrypted, epoch-keyed, Ed25519-signed events with fan-out and rate limiting
- **Client:** `src/client/lib/relay/` — RelayConnection with reconnect, deduplication, React hooks
- All real-time notifications route through this — no Nostr

### What Exists (mobile contacts)
- **iOS:** `ContactsView.swift`, `ContactDetailView.swift` — read-only, uses legacy `/api/contacts` (phone-hash model)
- **Android:** `ContactsScreen.kt`, `ContactDetailScreen.kt` — read-only, uses legacy `/api/contacts`
- Neither platform uses v2 `/directory` or computes blind indexes

---

## Gaps This Phase Addresses

| # | Gap | From EP06 Stub |
|---|-----|----------------|
| 1 | Mobile v2 directory migration | Gap 1 |
| 2 | Client API unification (events → records) | Gap 13 (partial) |
| 3 | Events API deprecation + data migration | Gap 5 (reframed) |
| 4 | Entity type templates system | New |
| 5 | Date/location field blind indexing | New (threat model) |
| 6 | Event encryption upgrade (1-tier → 3-tier) | Security improvement |
| 7 | Permission unification (events → cases) | New |

---

## Threat Model Considerations

### Date/time as sensitive data
Event timing reveals operational patterns. A court order or server breach exposing cleartext dates could identify when protests happened, when incidents were reported, and when volunteers were active. Blind index date bucketing at week/month granularity provides server-side query capability without cleartext date exposure.

### Location as high-value target
GPS coordinates of incidents, protest sites, or safe houses are the highest-value target for adversaries. All location data encrypted in field envelopes. Server sees only blind-indexed city-level region buckets (if entity type enables location indexing). Client-side precision capping prevents accidental over-precision storage.

### Contact PII on mobile
Mobile devices are higher-risk targets (theft, border crossing, device seizure). Contact PII must be:
- Encrypted at rest in device storage (iOS Keychain, Android EncryptedSharedPreferences)
- Never cached in plaintext — decrypt only for display, immediately discard
- Blind index tokens computed client-side — server never receives plaintext to index

### Entity type metadata leakage
Entity type names and field configurations are hub-specific operational metadata. An adversary learning that a hub has entity types named "Deportation Case" or "Police Brutality Incident" reveals the hub's mission. Entity type definitions should be encrypted with the hub key — the server stores encrypted entity type configs and serves them as opaque blobs.

### No data export
No CSV, PDF, or file export of entity data. Custom report display types (table, calendar, timeline) render within the app's controlled context. Bulk operations are in-app mutations (tag, group assign) — never extraction.

---

## Implementation Scope

### Backend
1. **Entity type templates table + routes** — seed templates (Case, Event, Incident Report, Contact Note), CRUD for hub-specific customizations
2. **Events → records migration** — SQL migration moving event data to `case_records` with entity type assignment, encryption tier upgrade (1→3)
3. **Deprecate events routes** — mark as deprecated, redirect to records equivalents
4. **Date blind index support in CasesService** — accept `indexType: "date"` fields, compute day/week/month buckets via `date_blind_indexes()`
5. **Location blind index support** — city-level region bucket for location fields with `indexType: "location"`
6. **Permission aliasing** — `events:*` → `cases:*` redirect during transition

### Desktop
7. **Remove `events.tsx`** — replace with entity type–filtered records view
8. **Update client API** — remove event-specific functions, add entity type template management functions: `listEntityTemplates()`, `enableTemplate(hubId, templateId)`, `customizeEntityType(hubId, entityTypeId, overrides)`, `disableTemplate(hubId, templateId)`
9. **Entity type template picker** — new entity creation selects from available templates
10. **Calendar display type** — date-bearing entities rendered in month/week calendar view (read-only display, not a separate route)
11. **Admin migration UI** — one-time admin action in hub settings to migrate existing events to the entity type system (shows progress: X of Y entities re-encrypted)

### iOS
11. **v2 directory migration** — switch from `/api/contacts` to `/directory`, add blind index computation via CryptoService UniFFI bindings
12. **Remove events-specific views** — replace with entity type–filtered record views
13. **Contact search** — trigram blind index search via v2 directory

### Android
14. **v2 directory migration** — switch from `/api/contacts` to `/directory`, add blind index computation via JNI crypto
15. **Remove events-specific views** — replace with entity type–filtered record views
16. **Fix E2EE regression** — entities (formerly events) now use 3-tier encryption via CryptoService
17. **Contact search** — trigram blind index search via v2 directory

### Protocol / Codegen
18. **Entity type template schemas** — Zod schemas for shipped templates in `packages/protocol/schemas/entity-templates.ts`
19. **Deprecate events schemas** — mark as deprecated, keep for migration reference
20. **Add entity template crypto label** — `LABEL_ENTITY_TYPE_DEFINITION` for encrypting entity type configs with hub key

### i18n
21. **Entity template labels** — all 13 locales: template names, default field labels, default status labels

---

## Migration Strategy

### Data migration (events → records)
1. Create "Event" entity type for each hub that has events
2. For each event row:
   - Create corresponding `case_records` row
   - Map `encryptedDetails`/`detailEnvelopes` → `encryptedSummary`/`summaryEnvelopes`
   - Date fields → `encryptedFields`/`fieldEnvelopes` (requires client-side re-encryption to add date blind indexes)
   - `parentEventId` → `parentRecordId`
   - Migrate linked records and reports
3. Mark events table as deprecated (keep for rollback window)

**Client-side re-encryption requirement:** Date fields moving from cleartext to encrypted requires a client (admin) to:
- Read each event's cleartext dates
- Encrypt dates into field envelopes
- Compute date blind indexes
- Upload the re-encrypted entity

This is a one-time admin migration action, not a server-side batch job (E2EE constraint — server can't encrypt).

### API deprecation
- Events routes return `301` with `Location` header pointing to records equivalent
- Events routes accept old payload shape, transform server-side to records format (6-month sunset)
- Pre-production: can be aggressive — remove events routes entirely after migration, no 6-month sunset needed

---

## Dependencies

- **EP01 (Permissions):** Permission constants must exist. Entity type permission configuration depends on the role/permission system being in place.
- **EP03 (Teams/Tags):** Team-based entity type access depends on teams existing. Tags used for entity categorization.
- **packages/crypto blind_index.rs:** Already complete — no crypto changes needed.

---

## Open Questions — Resolved

**Q: Should entity type definitions be encrypted?**
A: Yes. Entity type names and field labels reveal hub mission. Encrypt with hub key, store as opaque blob. Server needs `entityTypeId` (UUID) for routing but never sees the definition content.

**Q: What about entity type definitions needed for server-side validation?**
A: Server validates structural constraints (field count limits, status array length) using the schema shape, not the content. Field values are already encrypted — server can't validate them anyway. The entity type definition encryption means the server can't read field labels or names, but it doesn't need to.

**Q: Calendar view — separate route or display mode?**
A: Display mode within the entity list view. A "Calendar" tab alongside "Table" and "Timeline" tabs. Filtered by entity types that have date fields. Not a separate route — it's a rendering mode for the same data.

**Q: Should the events migration be online or offline?**
A: Pre-production, so offline is fine. Admin runs a migration action from the admin settings. The app shows progress (X of Y entities re-encrypted). No prod traffic to worry about.

---

## References

- Existing spec: `2026-03-21-events-architecture.md` — superseded by this unification approach
- Entity type schema: `packages/protocol/schemas/entity-schema.ts`
- Blind index implementation: `packages/crypto/src/blind_index.rs`
- Crypto labels: `packages/protocol/crypto-labels.json`
- Records API: `apps/worker/routes/records.ts`
- Events API: `apps/worker/routes/events.ts` (to be deprecated)
