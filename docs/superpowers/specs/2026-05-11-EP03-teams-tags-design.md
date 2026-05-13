---
epic: EP03
title: Teams & Tags
status: specced
depends-on: [EP01]
phase: 2
---

# EP03: Teams & Tags

**Date:** 2026-05-12
**Source:** v1 (llamenos-hotline) → v2 (llamenos)
**Status:** Specced
**Depends on:** EP01 (Permission System & Role Management — provides admin shell, nav infrastructure, permission catalog)

## Summary

This epic delivers organizational infrastructure for grouping users and labeling contacts:

1. Four new Drizzle tables: `teams`, `teamMembers`, `contactTeamAssignments`, `tags` — replacing the single `users.team_id` column with a proper many-to-many model
2. Full CRUD API routes and service layer for teams and tags, scoped to hubs
3. New `teams` and `tags` permission domains in the permission catalog, with role-gated tag creation replacing the v1 `strictTags` boolean
4. Hub-key encryption for team names/descriptions and tag labels/categories; plaintext slugs and colors; HMAC blind indexes for tag references on contacts
5. Desktop admin UI for team and tag management (replacing existing stubs)
6. User-facing TagInput component (Command+Popover multi-select with inline create when permitted) and TagBadge component
7. Contact tagging integration and contact filtering by tag/team
8. React Query hooks with hub-key decryption for all team/tag data
9. Hash-chained audit log entries for all team and tag CRUD operations
10. iOS and Android tag picker and tag display on contacts (admin management is desktop-only initially)
11. Protocol schemas and codegen for cross-platform Team/Tag types

## Design Decisions

### D1: Remove `users.team_id`, use junction table only

The existing `users.team_id` column models a single-team relationship. The correct model is many-to-many via `teamMembers`. Since the app is pre-production with no data to migrate, we drop `users.team_id` entirely.

The `teamMembers` junction table uses a composite primary key `(teamId, userPubkey)` and supports queries in both directions: "which teams does user X belong to?" and "which users are in team Y?". Drizzle `relations()` declarations define the many-to-many relationship for typed query building.

### D2: Always create server-side tag records

When a user types a new tag name in the TagInput component, it always creates a first-class `tags` table record with an encrypted label, auto-generated slug, default color, and optional category. There are no orphaned slug-only references. The creation is transparent — the UI optimistically adds the tag while the POST request completes in the background.

This eliminates the split between "real" tags and inline-only slugs that would complicate search, filtering, and admin management.

### D3: Teams NOT used for shift routing in this epic

This epic builds team CRUD, membership management, and contact assignment infrastructure only. EP07 (Shift Management) will add the routing integration, using team IDs to compose ring groups. The `teams` table schema includes no routing-specific columns — EP07 will reference teams via foreign key from its own shift/ring-group tables.

**EP07 dependency note:** The `teams.id` column is the stable FK target. EP07 should join `teamMembers` to resolve which users belong to a ring group's team. The team model is intentionally minimal to avoid coupling organizational grouping with routing logic. **Important:** When EP07 adds FKs from ring groups/shifts to `teams.id`, it should add an `onDelete: 'restrict'` constraint or an application-level deletion guard to prevent deleting a team that's actively used in shift routing.

### D4: Audit log entries for all team/tag CRUD

Team membership changes affect contact assignment and call routing. Tag changes affect organizational taxonomy. All operations produce hash-chained audit entries via `AuditService.append()`.

New audit event types added to `EVENT_CATEGORIES`:

| Category | Events |
|----------|--------|
| `teams` | `teamCreated`, `teamUpdated`, `teamDeleted`, `teamMemberAdded`, `teamMemberRemoved`, `teamContactAssigned`, `teamContactUnassigned` |
| `tags` | `tagCreated`, `tagUpdated`, `tagDeleted` |

Each entry's `details` object includes the relevant IDs (team/tag ID, affected pubkeys or contact IDs) but never plaintext names or labels (those are encrypted).

### D5: Tag creation is role-gated via permissions

The v1 `strictTags` boolean is replaced by the permission system. Three new permissions in the `tags` domain control access:

| Permission | Description | Default roles |
|---|---|---|
| `tags:view` | View tags in picker and on contacts | volunteer, reviewer, hub-admin |
| `tags:create` | Create new tags (inline or via admin UI) | hub-admin |
| `tags:manage` | Edit and delete existing tags | hub-admin |

Admins always have tag creation. To allow volunteers to create tags inline (the v1 "non-strict" behavior), grant `tags:create` to the volunteer role. This is more flexible than a boolean toggle — different roles can have different tag creation rights.

The `TagInput` component checks `tags:create` permission to show/hide the inline creation option. No hub settings field needed.

Additionally, a `teams` permission domain controls team management:

| Permission | Description | Default roles |
|---|---|---|
| `teams:read` | View teams and membership | volunteer, reviewer, hub-admin |
| `teams:manage` | Create, edit, delete teams and manage membership | hub-admin |

### D5b: Tag categories are freeform encrypted text

Tag categories are not a fixed taxonomy. Admins type a category string when creating or editing a tag. Tags with the same decrypted category text group together in the tag picker UI. The category field is encrypted with the hub key — the server cannot group or sort by category. Grouping happens client-side after decryption.

## Architecture

### Database schema

**teams**

| Column | Type | Drizzle | Notes |
|--------|------|---------|-------|
| id | TEXT PK | `text('id').primaryKey()` | Client-generated UUID |
| hubId | TEXT NOT NULL | `text('hub_id').notNull()` | FK to hubs |
| encryptedName | TEXT NOT NULL | `text('encrypted_name').notNull()` | Hub-key encrypted |
| encryptedDescription | TEXT | `text('encrypted_description')` | Hub-key encrypted, nullable |
| createdBy | TEXT NOT NULL | `text('created_by').notNull()` | Pubkey of creator |
| createdAt | TIMESTAMPTZ | `timestamp('created_at', { withTimezone: true })` | |
| updatedAt | TIMESTAMPTZ | `timestamp('updated_at', { withTimezone: true })` | |

Indexes: `teams_hub_idx ON (hub_id)`

**teamMembers**

| Column | Type | Drizzle | Notes |
|--------|------|---------|-------|
| teamId | TEXT NOT NULL | `text('team_id').notNull()` | FK to teams |
| userPubkey | TEXT NOT NULL | `text('user_pubkey').notNull()` | FK to users |
| addedBy | TEXT NOT NULL | `text('added_by').notNull()` | Pubkey of adder |
| createdAt | TIMESTAMPTZ | `timestamp('created_at', { withTimezone: true })` | |

PK: `(teamId, userPubkey)`. Index: `team_members_user_idx ON (user_pubkey)`. FK: `teamId` references `teams.id` with `onDelete: 'cascade'`.

**contactTeamAssignments**

| Column | Type | Drizzle | Notes |
|--------|------|---------|-------|
| id | TEXT PK | `text('id').primaryKey()` | Client-generated UUID |
| contactId | TEXT NOT NULL | `text('contact_id').notNull()` | FK to contacts |
| teamId | TEXT NOT NULL | `text('team_id').notNull()` | FK to teams |
| hubId | TEXT NOT NULL | `text('hub_id').notNull()` | For scoped queries |
| assignedBy | TEXT NOT NULL | `text('assigned_by').notNull()` | Pubkey |
| createdAt | TIMESTAMPTZ | `timestamp('created_at', { withTimezone: true })` | |

Unique: `(contactId, teamId)`. Indexes on `contactId`, `teamId`, `hubId`. FK: `teamId` references `teams.id` with `onDelete: 'cascade'`.

**tags**

| Column | Type | Drizzle | Notes |
|--------|------|---------|-------|
| id | TEXT PK | `text('id').primaryKey()` | Client-generated UUID |
| hubId | TEXT NOT NULL | `text('hub_id').notNull()` | FK to hubs |
| name | TEXT NOT NULL | `text('name').notNull()` | Slug identifier (immutable after creation) |
| encryptedLabel | TEXT NOT NULL | `text('encrypted_label').notNull()` | Hub-key encrypted display label |
| color | TEXT NOT NULL DEFAULT '#6b7280' | `text('color').notNull().default('#6b7280')` | Hex color, plaintext |
| encryptedCategory | TEXT | `text('encrypted_category')` | Hub-key encrypted, nullable |
| createdBy | TEXT NOT NULL | `text('created_by').notNull()` | Pubkey |
| createdAt | TIMESTAMPTZ | `timestamp('created_at', { withTimezone: true })` | |

Unique: `(hubId, name)`.

**Drop column:** Remove `users.team_id` from `apps/worker/db/schema/users.ts`.

### Encryption

- **Team name/description**: Symmetric AEAD (AES-256-GCM) with the hub's shared symmetric key. Domain separation label: `LABEL_TEAM_ENCRYPT` (new, added to `crypto-labels.json`). AAD: `(teamId, fieldName)` where fieldName is `'name'` or `'description'`. Client encrypts before sending, server stores ciphertext, client decrypts on fetch. The encryption utility should be factored into a shared `encryptHubField(plaintext, hubKey, label, aad)` / `decryptHubField(ciphertext, hubKey, label, aad)` helper (create if not already present — EP01's hub role encryption may have established this pattern).
- **Tag label/category**: Same symmetric AEAD pattern with hub key. Domain separation label: `LABEL_TAG_ENCRYPT` (new). AAD: `(tagId, fieldName)` where fieldName is `'label'` or `'category'`.
- **Tag slug (`name`)**: Plaintext. This is an acceptable trade-off: slugs are sanitized identifiers (e.g., `urgent-response`) needed for the `(hubId, name)` uniqueness constraint and for computing HMAC blind indexes on contacts. The server can see the tag taxonomy's slugs but cannot see which contacts have which tags (that mapping uses HMAC blind indexes). Slugs derived from sensitive labels (e.g., `ice-encounter`) do leak semantic information — admins should be advised to use opaque slugs for sensitive tags.
- **Tag color**: Plaintext. No PII.
- **Tag references on contacts**: Existing `contacts.tagHashes` column stores HMAC blind indexes using `HMAC_CONTACT_TAG` label (already in crypto-labels.json). Server never sees plaintext tag names in the association.
- **Team membership**: Not encrypted. Pubkey associations are inherently visible to the server.

New domain separation labels to add to `packages/protocol/crypto-labels.json`:

| Label | Value |
|-------|-------|
| `LABEL_TEAM_ENCRYPT` | `llamenos:team-field:v1` |
| `LABEL_TAG_ENCRYPT` | `llamenos:tag-field:v1` |

### Component hierarchy (desktop admin)

```
AdminShell
├── TeamsSection (admin-sections/teams-section.tsx)
│   ├── TeamList (expand/collapse per team)
│   │   └── TeamCard (encrypted name, member count, contact count)
│   ├── TeamCreateForm (name, description — encrypts on submit)
│   ├── TeamMembersPanel (UserMultiSelect for adding, list with remove)
│   ├── TeamContactsPanel (ContactSelect for assigning, list with remove)
│   └── TeamDeleteDialog (cascade warning)
│
└── TagsSection (admin-sections/tags-section.tsx)
    ├── TagList (color dot, TagBadge, slug, category grouping)
    ├── TagCreateForm (label → auto-slug, color picker, category)
    │   ├── ColorPicker (8 presets + custom hex input)
    │   └── TagBadge (live preview)
    ├── TagEditForm (label, color, category — slug immutable)
    └── TagDeleteDialog (removed-from-contacts count)
```

### Component hierarchy (user-facing)

```
TagInput (src/client/components/tag-input.tsx)
├── Popover + Command (shadcn pattern)
│   ├── CommandInput (search/filter)
│   ├── CommandGroup (grouped by decrypted category)
│   │   └── CommandItem (color dot + label)
│   └── CommandGroup "Create" (shown when tags:create permitted)
│       └── CommandItem "Create '{typed}'" (auto-slugify)
├── Selected tags (TagBadge chips with X remove)
└── Props: hubId, value, onChange, allowCreate (derived from permission check)

TagBadge (reusable)
├── Colored dot + label text
└── Optional remove button (X)
```

### API endpoints

**Teams:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/teams` | `teams:read` | List teams for current hub (includes memberCount, contactCount) |
| POST | `/api/teams` | `teams:manage` | Create team |
| PATCH | `/api/teams/:id` | `teams:manage` | Update team name/description |
| DELETE | `/api/teams/:id` | `teams:manage` | Delete team + cascade members/assignments |
| GET | `/api/teams/:id/members` | `teams:read` | List team members |
| POST | `/api/teams/:id/members` | `teams:manage` | Add members (pubkeys array) |
| DELETE | `/api/teams/:id/members/:pubkey` | `teams:manage` | Remove member |
| GET | `/api/teams/:id/contacts` | `teams:read` | List contact assignments |
| POST | `/api/teams/:id/contacts` | `teams:manage` | Assign contacts (contactIds array) |
| DELETE | `/api/teams/:id/contacts/:contactId` | `teams:manage` | Unassign contact |

**Tags:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/tags` | `tags:view` | List tags for current hub |
| POST | `/api/tags` | `tags:create` | Create tag. Returns 409 if slug conflicts with existing tag in same hub — client should offer to select the existing tag instead. |
| PATCH | `/api/tags/:id` | `tags:manage` | Update tag (label, color, category) |
| DELETE | `/api/tags/:id` | `tags:manage` | Delete tag + remove from contacts. Server computes `HMAC(slug, hubBlindIndexKey)` to find matching entries in `contacts.tagHashes` arrays and removes them. Returns `{ removedFromContacts: number }`. |

### React Query hooks

| Hook | Stale time | Invalidated by |
|------|-----------|----------------|
| `useTeams(hubId)` | 5min | team create/update/delete mutations |
| `useTeamMembers(teamId)` | 2min | member add/remove mutations |
| `useTeamContacts(teamId)` | 2min | contact assign/unassign mutations |
| `useTags(hubId)` | 5min | tag create/update/delete mutations |

All list hooks decrypt encrypted fields client-side using the hub key before returning data. Decryption uses the appropriate domain separation label and AAD.

### Backend changes summary

| Change | File | Detail |
|--------|------|--------|
| Teams schema | `apps/worker/db/schema/teams.ts` (new) | `teams`, `teamMembers`, `contactTeamAssignments` tables |
| Tags schema | `apps/worker/db/schema/tags.ts` (new) | `tags` table |
| Drop `team_id` | `apps/worker/db/schema/users.ts` | Remove `teamId` column |
| Export schemas | `apps/worker/db/schema/index.ts` | Add new table exports |
| Teams routes | `apps/worker/routes/teams.ts` (new) | 10 endpoints |
| Tags routes | `apps/worker/routes/tags.ts` (new) | 4 endpoints |
| Teams service | `apps/worker/services/teams.ts` (new) | CRUD + membership + contacts |
| Tags service | `apps/worker/services/tags.ts` (new) | CRUD + contact cleanup on delete |
| Mount routes | `apps/worker/index.ts` | Register `/api/teams` and `/api/tags` |
| Audit categories | `apps/worker/services/audit.ts` | Add `teams` and `tags` to `EVENT_CATEGORIES` |
| 5 new permissions | `packages/shared/permissions.ts` | `tags:view`, `tags:create`, `tags:manage`, `teams:read`, `teams:manage` |
| Default role updates | `packages/shared/permissions.ts` | Add team/tag permissions to hub-admin, volunteer, reviewer |
| Permission group labels | `packages/shared/permissions.ts` | Add `teams: 'Teams'`, `tags: 'Tags'` entries to `PERMISSION_GROUP_LABELS` (map created by EP01) |
| 2 crypto labels | `packages/protocol/crypto-labels.json` | `LABEL_TEAM_ENCRYPT`, `LABEL_TAG_ENCRYPT` |
| Protocol schemas | `packages/protocol/schemas/team.ts`, `tag.ts` (new) | Zod schemas for API request/response types |
| Schema registry | `packages/protocol/tools/schema-registry.ts` | Register Team/Tag schemas |

## Scope

### In scope

- Create `teams`, `teamMembers`, `contactTeamAssignments`, `tags` Drizzle tables
- Drop `users.team_id` column
- Add `tags:view`, `tags:create`, `tags:manage`, `teams:read`, `teams:manage` permissions to catalog
- Update default roles: hub-admin gets `teams:*` and `tags:*`; volunteer and reviewer get `teams:read` and `tags:view`
- Add `LABEL_TEAM_ENCRYPT` and `LABEL_TAG_ENCRYPT` to `crypto-labels.json` + run codegen
- Backend routes and services for full team and tag CRUD
- Hash-chained audit entries for all team/tag operations
- Desktop admin TeamsSection (replace stub): list, create, edit, delete, member management, contact assignment
- Desktop admin TagsSection (replace stub): list, create, edit, delete, 8 preset colors + custom, category field, live preview
- TagInput component (Command+Popover multi-select, permission-gated inline create)
- TagBadge component (reusable colored badge)
- Contact detail page tag integration
- Contact list filtering by tag and team
- React Query hooks for teams and tags with hub-key decryption
- Protocol Zod schemas for Team, Tag, TeamMember, ContactTeamAssignment types
- iOS SwiftUI: tag picker component, tag display on contacts
- Android Compose: tag picker component, tag display on contacts
- i18n: verify existing keys, add any missing team/tag UI strings across all 13 locales

### Out of scope

- Team-based shift routing (EP07)
- Team-based case assignment rules (future)
- Tag analytics / usage statistics
- Bulk tag import/export
- Tag merge (combining two tags into one)
- Mobile admin team/tag management (desktop-only initially)
- Contact-to-contact relationships via teams
- Tag-based notification rules

## Dependencies

- **Requires:** EP01 merged (permission catalog, role editor, admin shell infrastructure)
- **Blocks:** EP07 (Shift Management) — needs teams model for ring group composition
- **Coordinates with:** EP02 (Device & Identity Management) — user profile shows team membership
- **Coordinates with:** Contact management features — contact detail page integrates TagInput and team assignment display

## Platform Coverage

| Platform | Work needed |
|----------|-------------|
| **Backend** | 4 new tables, 2 route files, 2 service files, audit categories, permission updates |
| **Desktop** | Replace team/tag admin stubs, TagInput + TagBadge components, contact integration, React Query hooks |
| **iOS** | SwiftUI tag picker, tag display on contacts (read-only team display) |
| **Android** | Compose tag picker, tag display on contacts (read-only team display) |
| **Protocol** | 2 crypto labels, Zod schemas for team/tag types, codegen for Swift/Kotlin |

## Security Considerations

- **Team names reveal organizational structure**: A team named "Deportation Rapid Response" or "ICE Watch East LA" exposes operational intent. All team names and descriptions are hub-key encrypted. The server stores only ciphertext.
- **Tag labels are strategically sensitive**: Tags like "detained", "undocumented", "ICE encounter" applied to contacts are implicating. Tag labels and categories are hub-key encrypted. Only the slug (a sanitized identifier like `ice-encounter`) and color are plaintext.
- **HMAC blind indexes for tag-contact associations**: The server cannot determine which tag is applied to which contact. The `tagHashes` column stores HMAC outputs using `HMAC_CONTACT_TAG` with the hub's blind index key. Tag search and filtering happen via hash comparison.
- **Domain separation labels**: Two new labels (`LABEL_TEAM_ENCRYPT`, `LABEL_TAG_ENCRYPT`) prevent cross-context decryption. A ciphertext produced for a team name cannot be decrypted as a tag label, even with the same hub key.
- **AAD binding**: Each encrypted field includes `(recordId, fieldName)` as additional authenticated data. This prevents ciphertext relocation attacks — moving an encrypted team name to a different team record or to a description field will fail authentication.
- **Permission-gated creation**: Tag creation requires explicit `tags:create` permission rather than a boolean toggle. This integrates with the PBAC system from EP01 and allows fine-grained control per role.
- **Audit trail**: All team and tag operations are hash-chained. Tampering with the audit log (e.g., to hide that a sensitive tag was deleted) is detectable via chain verification.

## Open Questions (Resolved)

1. **Should `users.team_id` be kept as "primary team" or removed?** → Removed entirely. Junction table (`teamMembers`) is the only team membership model. Pre-production, no migration needed.

2. **Should inline tag creation produce server-side records?** → Yes, always. Every tag — whether created in the admin UI or inline via TagInput — becomes a first-class record in the `tags` table with encrypted label, color, and category. No orphaned slug references.

3. **Should teams be usable for shift routing in this epic?** → No. This epic builds team CRUD and membership only. EP07 (Shift Management) adds routing integration. The team model is designed for EP07 to reference via FK.

4. **Do we need audit log entries for team/tag CRUD?** → Yes. All operations (create, update, delete teams; add/remove members; assign/unassign contacts; create, update, delete tags) produce hash-chained audit entries.

5. **Should tag categories be a fixed taxonomy or freeform text?** → Freeform encrypted text, same as v1. Tag creation is role-gated via `tags:create` permission (not a boolean `strictTags` toggle). Admins always have it; granting `tags:create` to other roles enables inline creation for those roles.
