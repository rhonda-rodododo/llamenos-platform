---
epic: EP06
title: "CMS/CRM — Unified Entity System"
status: specced
depends-on: [EP01, EP03]
phase: 4
---

# EP06: CMS/CRM — Unified Entity System

## Scope

Contact management, unified entity management (cases, events, incidents — all as configurable entity types), evidence chain of custody, triage/intake workflows, entity type configuration, smart assignment, automation, bulk operations, merge, cross-hub visibility, and contact import.

**Key architectural decision (2026-05-12):** Events are NOT a separate API surface. Events are entity type templates with date and location fields. The `/api/events` surface is deprecated; all entity CRUD goes through `/api/records`. Calendar is a display type for date-bearing entities.

## Phase Decomposition

EP06 is decomposed into 4 implementation phases with dependency ordering:

| Phase | Title | Spec | Depends On |
|-------|-------|------|------------|
| A1 | Entity System Unification | `2026-05-12-EP06-A1-entity-system-unification-design.md` | EP01, EP03 |
| A2 | CMS Write UX | `2026-05-12-EP06-A2-cms-write-ux-design.md` | A1 |
| A3 | CMS Intelligence | `2026-05-12-EP06-A3-cms-intelligence-design.md` | A1 |
| A4 | Advanced CMS | `2026-05-12-EP06-A4-cms-advanced-design.md` | A2 |

```
A1 (Entity Unification) ─┬─→ A2 (Write UX) ──→ A4 (Advanced)
                          └─→ A3 (Intelligence)
```

**A2 and A3 can run in parallel** after A1 completes.

## What Changed from Original Stub

### Architectural shift: Events → Entity Types
- `/api/events` deprecated — events become records with `category: "event"` entity type
- Event dates move from cleartext columns to encrypted entity type fields with blind index date bucketing (threat model improvement)
- Event location moves from cleartext to encrypted location field with blind-indexed region buckets
- `parentEventId` → `parentRecordId` (already exists on records)
- Sub-events → sub-records (generic parent-child hierarchy)
- Single encryption tier → 3-tier model (aligned with records)

### Mobile hub admin = full capability
- Entity type configuration, field definition editing, report type management available on mobile
- Only platform-level settings remain desktop-only
- Triage and assignment views added to mobile

### Threat model hardening
- Event dates no longer stored in cleartext (blind index date bucketing)
- Event locations no longer stored in cleartext (encrypted + blind-indexed region)
- Entity type definitions encrypted with hub key (operational metadata protection)
- Contact notification dispatch uses client-side rendering (server as dumb pipe)
- No data export in any form — custom report display types serve that purpose

### Nostr fully removed
- All real-time events via encrypted WebSocket relay (`ws-events.ts`)
- Assignment notifications, status changes, etc. all via WebSocket
- No Nostr references in active code

### New features added
- Entity type templates (shipped preconfigured types)
- Custom report display types (table, calendar, timeline)
- Contact batch import (client-side encryption)
- Contact bulk operations (in-app only, no export)

## Superseded Specs

The following specs were written before the entity unification decision. They contain detailed implementation guidance that is still valuable as reference but must be read in context of the unification:

| Old Spec | Status | Notes |
|----------|--------|-------|
| `2026-03-21-cms-contact-management.md` | Reference | Contact write and merge flows still applicable |
| `2026-03-21-cms-advanced-ui.md` | Reference | Evidence custody and cross-hub detail still applicable |
| `2026-03-21-cms-automation.md` | Reference | Notification and conversion flows still applicable |
| `2026-03-21-cms-field-types.md` | Reference | Location and file field types still applicable |
| `2026-03-21-cms-smart-assignment.md` | Reference | Scoring formula still applicable |
| `2026-03-21-events-architecture.md` | **Superseded** | Events API consolidation replaced by full deprecation |

## Gap Coverage

| Gap | Description | Phase |
|-----|-------------|-------|
| 1 | Mobile v2 directory migration | A1 |
| 2 | Contact write UI (all platforms) | A2 |
| 3 | Contact merge | A4 |
| 4 | Entity merge | A4 |
| 5 | Events API consolidation | A1 (deprecation) |
| 6 | Evidence custody chain UI | A4 |
| 7 | Report type field editor | A2 |
| 8 | Location and file field types | A2 |
| 9 | Smart assignment | A3 |
| 10 | CMS automation | A3 |
| 11 | Bulk contact operations | A4 |
| 12 | Cross-hub visibility | A4 |
| 13 | Client API gaps | A1 + A2 |
| NEW | Entity type templates | A1 |
| NEW | Contact batch import | A4 |
| NEW | Custom report display types | A4 |
| NEW | Mobile entity type admin | A2 |
| NEW | Mobile triage + assignment | A3 |
| NEW | Event date/location encryption | A1 (threat model) |

## V1 Features Ported

| v1 Feature | v2 Status | Phase |
|---|---|---|
| Contact CRUD with E2EE | Backend done, UI completing | A2 |
| Contact auto-link on calls | Already ported (Epic 326) | — |
| Caller identification (screen pop) | Already ported | — |
| Firehose/triage LLM extraction | Already ported | — |
| Contact import (batch) | Planned, client-side encryption | A4 |
| Contact merge | Planned, client-side re-encryption | A4 |
| Bulk contact operations | Planned, in-app only | A4 |
| Contact outreach/notifications | Route exists, UI planned | A3 |
| Contact relationships | Backend done, write UI planned | A2 |
| Contact teams/groups | Backend done (affinity groups), UI planned | A2 |
| Custom fields + report types | Backend done, editor planned | A2 |
| Intake/triage workflow | Backend + triage UI exist, conversion planned | A3 |
| Notes system | Replaced by interactions system | — |
| Event management | Unified into entity types | A1 |
