# v1 → v2 Feature Port: Epic Index

**Date:** 2026-05-11
**Status:** Stub specs complete, awaiting prioritization and detailed planning

## Overview

This is the master index for porting remaining v1 features to v2. Each epic is a self-contained bundle of related features with its own spec, plan, and implementation cycle.

**Important architectural notes:**
- All access control is **permission-based** (PBAC), never role-based. `requiredRole` is being removed.
- Many features have **dual surfaces**: user-facing (accessible by permission) + admin configuration
- The v2 API **is** the identity provider — no external IDP (authentik, etc.)
- v2 uses **HPKE** (not ECIES), **per-device Ed25519/X25519 keys** (not nsec), **sigchain** device authorization
- All encrypted fields use **domain separation labels** from `crypto-labels.json`

## Epic Map

| Epic | Title | Phase | Depends On | Status |
|------|-------|-------|------------|--------|
| EP01 | [Permission System & Role Management](2026-05-11-EP01-permission-role-management-design.md) | 1 | — | Stub |
| EP02 | [Device & Identity Management](2026-05-11-EP02-device-management-design.md) | 2 | EP01 | Stub |
| EP03 | [Teams & Tags](2026-05-11-EP03-teams-tags-design.md) | 2 | EP01 | Stub |
| EP04 | [Analytics & Dashboards](2026-05-11-EP04-analytics-dashboards-design.md) | 3 | — | Stub |
| EP05 | [Messaging Channels & Blast System](2026-05-11-EP05-messaging-blast-system-design.md) | 3 | EP01 | Stub |
| EP06 | [CMS/CRM — Contacts, Cases, Events, Evidence](2026-05-11-EP06-cms-crm-design.md) | 4 | EP01, EP03 | Stub |
| EP07 | [Shift Management](2026-05-11-EP07-shift-management-design.md) | 2 | EP01, EP03 | Stub |
| EP08 | [Platform Operations & Compliance](2026-05-11-EP08-platform-ops-compliance-design.md) | 3 | EP01 | Stub |
| EP09 | [Recovery Group & Key Escrow](2026-05-11-EP09-recovery-group-design.md) | 5 | EP01, EP02 | Stub |

## Dependency Graph

```
EP01 (Permissions) ─┬─→ EP02 (Devices) ──→ EP09 (Recovery)
                    ├─→ EP03 (Teams/Tags) ─┬→ EP06 (CMS/CRM)
                    │                       └→ EP07 (Shifts)
                    ├─→ EP05 (Messaging/Blasts)
                    └─→ EP08 (Platform Ops)

EP04 (Analytics) ── independent
```

## Phase Sequencing

### Phase 1: Foundation
- **EP01**: Permission system migration + role management UI
  - Remove `requiredRole` from nav config, replace with granular permissions
  - Platform Roles editor, Hub Roles editor enhancement
  - Mobile role views (iOS/Android)

### Phase 2: Core Hub Features
- **EP02**: Device management (user-facing + admin verification)
- **EP03**: Teams & tags (admin config + user-facing tag picker, team filtering)
- **EP07**: Shift management (overrides, ring groups, mobile schedule views)

### Phase 3: Platform & Channels
- **EP04**: Analytics dashboards (hub + platform scope, charts)
- **EP05**: Messaging channels (SMS config) + blast system buildout
- **EP08**: Platform settings, GDPR erasure, retention policies, cross-hub views

### Phase 4: CRM
- **EP06**: CMS/CRM completion (contacts write UI, events API fix, evidence custody, merge, bulk ops)

### Phase 5: Advanced Crypto
- **EP09**: Recovery group (Shamir threshold ceremony, key escrow)

## Cross-Cutting Concerns

### v1 Reference Codebase
- Location: `/home/rikki/projects/llamenos-hotline/`
- **Local main is 10 commits behind and 6 commits ahead of origin/main** — should be reconciled before relying on it for detailed feature audits
- Key directories: `src/client/components/admin-sections/`, `src/server/routes/`, `src/server/db/schema/`

### Existing v2 Specs (pre-dating this epic index)
| Spec | Relevant Epics |
|------|---------------|
| `2026-03-19-user-pbac-alignment` | EP01 |
| `2026-05-03-device-observability-ux` | EP02 |
| `2026-03-21-cms-*` (6 specs) | EP06 |
| `2026-03-21-events-architecture` | EP06 |
| `2026-04-27-blast-broadcast-service` | EP05 |
| `2026-04-27-signal-messaging-channel` | EP05 |

### Platform Matrix
| Feature | Desktop | iOS | Android | Backend |
|---------|---------|-----|---------|---------|
| EP01 Permissions | Migrate nav | Role viewer | Role viewer | Add perms |
| EP02 Devices | Full CRUD | Session mgmt | Session mgmt | Enhance |
| EP03 Teams/Tags | Full CRUD + picker | Picker + admin | Picker + admin | New routes |
| EP04 Analytics | Charts | Simplified | Simplified | Add endpoints |
| EP05 Messaging | SMS config + blast | Blast viewer | Blast viewer | Mostly done |
| EP06 CMS/CRM | Write UI + merge | Write UI | Write UI | Merge endpoint |
| EP07 Shifts | Overrides + ring groups | Schedule view | Schedule view | Override routes |
| EP08 Platform Ops | Full admin | Desktop only | Desktop only | GDPR system |
| EP09 Recovery | Ceremony UI | Enrollment | Enrollment | Shamir + DB |

## How to Use This Index

1. Pick an epic to work on (respect dependency order)
2. Start a new session with the prompt below
3. The session will brainstorm → spec → plan → self-review
4. Update this index as epics move from stub → specced → planned → implemented

### Session Prompt Template

```
Spec and plan EP{XX} from the v1→v2 feature port.

Read the stub spec at docs/superpowers/specs/2026-05-11-EP{XX}-{name}-design.md
and the master index at docs/superpowers/specs/2026-05-11-v1-port-epic-index.md.

The stub has v1 reference paths, v2 current state, gap analysis, and open questions.
v1 codebase is at ../llamenos-hotline for reference.

Key constraints:
- No backwards compatibility — this is pre-production
- Permission-based access only, no requiredRole
- v2 uses HPKE (not ECIES), per-device Ed25519/X25519 keys, sigchain
- Many features are user-facing with admin config surfaces, not admin-only
- Cross-platform: desktop (React), iOS (SwiftUI), Android (Compose)

Flesh out the stub into a full spec, resolve the open questions,
then create an implementation plan. Self-review both before finishing.
```
