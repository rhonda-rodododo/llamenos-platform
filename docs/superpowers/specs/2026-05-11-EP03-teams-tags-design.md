---
epic: EP03
title: Teams & Tags
status: stub
depends-on: [EP01]
phase: 2
---

# EP03: Teams & Tags

**Date:** 2026-05-11
**Source:** v1 (llamenos-hotline) -> v2 (llamenos)
**Status:** Stub (needs detailed plan before execution)

## Overview

Port team and tag management from v1 to v2. Teams organize users into groups for contact assignment and shift routing. Tags are hub-scoped organizational labels applied to contacts by users. Both features have admin configuration surfaces AND user-facing surfaces (tag picker, team membership display, filtering).

## What Exists in v2

### Database
- `users.team_id` column exists (text, nullable) -- single team FK on user record
- `contacts.tag_hashes` column exists (text array with GIN index) -- blind-indexed tag references
- No `teams`, `team_members`, `contact_team_assignments`, or `tags` tables

### Frontend
- Stub `teams-section.tsx` and `tags-section.tsx` registered in admin nav under "People" group (EP01 admin sidebar port)
- Both stubs render "Coming soon" placeholder
- Permission `users:manage-roles` exists in the permission catalog (used for team management gating)
- i18n keys for teams/tags sections exist across all 13 locales

### Backend
- No `/api/teams` or `/api/tags` route files
- No team/tag service layer
- Hub settings (`hub_settings.settings` JSONB) has no `strictTags` field yet

## What v1 Has (Reference Implementation)

### Database Schema (v1 migrations 0033, 0034)

**teams**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Client-generated UUID |
| hub_id | TEXT NOT NULL | Scoped to hub |
| encrypted_name | TEXT NOT NULL | Hub-key encrypted |
| encrypted_description | TEXT | Hub-key encrypted, nullable |
| created_by | TEXT NOT NULL | Pubkey of creator |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Index: `teams_hub_idx ON (hub_id)`

**team_members**
| Column | Type | Notes |
|--------|------|-------|
| team_id | TEXT NOT NULL | FK |
| user_pubkey | TEXT NOT NULL | FK |
| added_by | TEXT NOT NULL | Pubkey of adder |
| created_at | TIMESTAMPTZ | |

PK: `(team_id, user_pubkey)`. Index: `team_members_user_idx ON (user_pubkey)`

**contact_team_assignments**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Client-generated UUID |
| contact_id | TEXT NOT NULL | FK |
| team_id | TEXT NOT NULL | FK |
| hub_id | TEXT NOT NULL | For scoped queries |
| assigned_by | TEXT NOT NULL | Pubkey |
| created_at | TIMESTAMPTZ | |

Unique: `(contact_id, team_id)`. Indexes on contact_id, team_id, hub_id.

**tags**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Client-generated UUID |
| hub_id | TEXT NOT NULL | Scoped to hub |
| name | TEXT NOT NULL | Slug identifier (immutable after creation) |
| encrypted_label | TEXT NOT NULL | Hub-key encrypted display label |
| color | TEXT NOT NULL DEFAULT '#6b7280' | Hex color |
| encrypted_category | TEXT | Hub-key encrypted grouping label |
| created_by | TEXT NOT NULL | Pubkey |
| created_at | TIMESTAMPTZ | |

Unique: `(hub_id, name)`. Hub `strict_tags` boolean column added.

### API Endpoints (v1)

**Teams:**
- `GET /api/teams` -- list teams for current hub (returns memberCount, contactCount)
- `POST /api/teams` -- create team (id, encryptedName, encryptedDescription)
- `PATCH /api/teams/:id` -- update team (encryptedName, encryptedDescription)
- `DELETE /api/teams/:id` -- delete team + cascade members/assignments
- `GET /api/teams/:id/members` -- list team members
- `POST /api/teams/:id/members` -- add members (pubkeys array)
- `DELETE /api/teams/:id/members/:pubkey` -- remove member
- `GET /api/teams/:id/contacts` -- list contact assignments
- `POST /api/teams/:id/contacts` -- assign contacts (contactIds array)
- `DELETE /api/teams/:id/contacts/:contactId` -- unassign contact

**Tags:**
- `GET /api/tags` -- list tags for current hub (decrypted label/category in query hooks)
- `POST /api/tags` -- create tag (id, name, encryptedLabel, color, encryptedCategory)
- `PATCH /api/tags/:id` -- update tag (encryptedLabel, color, encryptedCategory)
- `DELETE /api/tags/:id` -- delete tag + remove from contacts (returns removedFromContacts count)

### Admin UI Components (v1)

**TeamsSection** (`teams-section.tsx`, ~605 lines):
- Team list with expand/collapse per team
- Inline create/edit form (encrypted name + description)
- TeamMembersPanel: expandable member list, UserMultiSelect for adding members
- TeamContactsPanel: expandable contact list, ContactSelect for assigning contacts
- Delete confirmation dialog with cascade warning
- Client-side UUID pre-generation for AAD binding on create

**TagsSection** (`tags-section.tsx`, ~427 lines):
- Tag list with color dot + TagBadge + slug display + category
- Inline create/edit form with label, slug (auto-generated, immutable), category, color picker
- 8 preset colors + custom color input
- Live preview of TagBadge during editing
- Delete confirmation with removed-from-contacts count
- Client-side UUID pre-generation for AAD binding on create
- Slug auto-derived from label via `slugify()`

### User-Facing Components (v1)

**TagInput** (`tag-input.tsx`, ~259 lines):
- Multi-select tag picker using Command + Popover (shadcn pattern)
- Shows selected tags as colored chip badges (removable via X button)
- Searchable dropdown with color dots and category labels
- `allowCreate` prop for inline tag creation (slugifies typed name)
- `useDecryptedTags()` hook -- fetches and decrypts tag list via hub key
- `TagBadge` export -- reusable colored badge component
- `useTagLookup()` export -- hook for external tag definition lookups
- Used on contact detail page for tagging contacts
- Used in contact list for tag-based filtering

**Team dropdown filter**: Contact list has team dropdown for filtering contacts by team assignment.

### Query Hooks (v1)

**useTags(hubId)**: 5min stale time, decrypts label/category via `decryptHubField`
**useTeams(hubId)**: 5min stale time, decrypts name/description via `decryptHubField`
**useTeamMembers(teamId)**: 2min stale time
**useTeamContacts(teamId)**: 2min stale time

All mutations invalidate relevant query keys on success.

## Design Decisions for v2

### Schema Alignment

1. **Create `teams`, `team_members`, `contact_team_assignments`, `tags` tables** in v2 Drizzle schema, matching v1 SQL structure.
2. **Add `strict_tags` to `hub_settings.settings` JSONB** rather than a column on `hubs` -- v2 uses JSONB settings pattern.
3. **Resolve `users.team_id`**: v2 has a single `team_id` FK on users, while v1 uses a many-to-many `team_members` junction table. The junction table is correct (users can belong to multiple teams). The `users.team_id` column may serve as a "primary team" shortcut or should be removed in favor of the junction table. Decision needed during planning.

### Encryption

- Team names/descriptions encrypted with hub key via `encryptHubField` (AAD includes row ID + field name)
- Tag labels/categories encrypted with hub key via `encryptHubField` (same pattern)
- Tag `name` (slug) is plaintext -- it's the stable identifier used in blind indexes and references
- Tag colors are plaintext -- no PII

### E2EE Integration

- Tags stored on contacts as `tag_hashes` (HMAC blind indexes) -- server never sees plaintext tag names
- Contact summary envelope contains decrypted tag labels for display
- Team membership is not encrypted (pubkey associations are inherently visible to server)

### Strict Tags Mode

When `strictTags` is enabled on a hub:
- Users can only apply existing tags from the admin-defined taxonomy
- The `allowCreate` prop on TagInput is forced to `false`
- Tag creation is restricted to admin permission holders
- When disabled, any user can create tags inline (they appear in the taxonomy automatically)

### Permissions

- Team CRUD: `users:manage-roles` (existing permission)
- Tag CRUD (admin section): `users:manage-roles` or a new `tags:manage` permission (decide during planning)
- Tag application (user-facing): any authenticated hub member
- Tag inline creation (user-facing): depends on `strictTags` setting

## Scope: What to Build

### Phase 2a: Backend + Desktop Admin

1. **DB migration**: Create `teams`, `team_members`, `contact_team_assignments`, `tags` tables in Drizzle schema
2. **Backend routes**: `apps/worker/routes/teams.ts` and `apps/worker/routes/tags.ts` with full CRUD
3. **Backend services**: `apps/worker/services/teams.ts` and `apps/worker/services/tags.ts`
4. **Protocol schemas**: Zod schemas in `packages/protocol/schemas/` for Team, Tag, TeamMember, ContactTeamAssignment
5. **Desktop admin UI**: Replace stubs in `teams-section.tsx` and `tags-section.tsx` with full implementations
6. **Query hooks**: `src/client/lib/queries/teams.ts` and `src/client/lib/queries/tags.ts`
7. **API client functions**: team/tag CRUD functions in API layer
8. **Hub settings**: Add `strictTags` to hub settings schema and admin UI toggle

### Phase 2b: User-Facing Surfaces

1. **TagInput component**: Port `tag-input.tsx` (Command+Popover multi-select with inline create)
2. **TagBadge component**: Port reusable colored badge
3. **Contact tagging**: Integrate TagInput into contact detail views
4. **Contact filtering**: Tag filter and team dropdown filter on contacts list
5. **Team membership display**: Show team badges on user profiles / contact cards

### Phase 2c: Mobile

1. **iOS**: SwiftUI team admin + tag admin sections, tag picker component
2. **Android**: Compose team admin + tag admin sections, tag picker component
3. **Protocol codegen**: Ensure Team/Tag types generate correctly for Swift/Kotlin

## Open Questions

1. Should `users.team_id` be kept as "primary team" or removed in favor of junction table only?
2. Should tag inline creation (when `strictTags` is off) create a server-side tag record, or just add the slug to the contact's tag array?
3. Should teams be usable for shift routing in this epic, or is that a separate concern?
4. Do we need audit log entries for team/tag CRUD operations?
5. Should tag categories be a fixed taxonomy or freeform text?

## Files to Create/Modify

### New Files
- `apps/worker/db/schema/teams.ts` -- Drizzle schema for teams, team_members, contact_team_assignments
- `apps/worker/db/schema/tags.ts` -- Drizzle schema for tags
- `apps/worker/routes/teams.ts` -- Hono route handlers
- `apps/worker/routes/tags.ts` -- Hono route handlers
- `apps/worker/services/teams.ts` -- Business logic
- `apps/worker/services/tags.ts` -- Business logic
- `packages/protocol/schemas/team.ts` -- Zod schemas
- `packages/protocol/schemas/tag.ts` -- Zod schemas
- `src/client/lib/queries/teams.ts` -- React Query hooks
- `src/client/lib/queries/tags.ts` -- React Query hooks
- `src/client/components/tag-input.tsx` -- User-facing tag picker

### Modified Files
- `apps/worker/db/schema/index.ts` -- Export new schema tables
- `apps/worker/index.ts` or app mount -- Register new route files
- `src/client/components/admin-sections/teams-section.tsx` -- Replace stub
- `src/client/components/admin-sections/tags-section.tsx` -- Replace stub
- `src/client/lib/api/` -- Add team/tag API client functions
- `src/client/lib/queries/keys.ts` -- Add teams/tags query keys
- `packages/protocol/tools/schema-registry.ts` -- Register new schemas
- `packages/i18n/locales/*.json` -- Add any missing i18n keys (verify existing coverage first)

## v1 Reference Files

- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-sections/teams-section.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-sections/tags-section.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/components/tag-input.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/teams.ts`
- `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/tags.ts`
- `/home/rikki/projects/llamenos-hotline/src/server/routes/tags.ts`
- `/home/rikki/projects/llamenos-hotline/src/server/services/tags.ts`
- `/home/rikki/projects/llamenos-hotline/drizzle/migrations/0033_teams.sql`
- `/home/rikki/projects/llamenos-hotline/drizzle/migrations/0034_tags.sql`
