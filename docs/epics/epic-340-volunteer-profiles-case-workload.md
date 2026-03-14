# Epic 340: Volunteer Profiles with Case Workload & Specializations

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 319 (Record Entity)
**Branch**: `desktop`

## Summary

Extend the Volunteer model with specializations, case workload tracking, and team membership. Add a case assignments tab to the volunteer profile page. Enable template-driven role recommendations during invite creation. This closes the gap between the case management system and the identity/volunteer management system — currently cases have `assignedTo` pubkeys but volunteers have no reverse visibility into their assignments.

## Problem Statement

After implementing the CMS (Epics 315-332), there's a disconnect:
- Cases track `assignedTo: string[]` (volunteer pubkeys)
- But volunteers have NO visibility into their case assignments from their profile
- No way to see workload distribution across the team
- No specialization tracking (a DV-trained volunteer shouldn't auto-receive immigration cases)
- No capacity limits (a volunteer with 20 active cases shouldn't get more)
- The dashboard shows volunteer presence but not case workload

## Implementation

### 1. Extend Volunteer Type

Add to `apps/worker/types.ts` Volunteer interface:
```typescript
specializations?: string[]        // e.g., ["immigration", "domestic_violence", "legal_observer"]
maxCaseAssignments?: number       // Capacity limit (0 = unlimited)
teamId?: string                   // Team/group membership
supervisorPubkey?: string         // Who reviews this volunteer's cases
```

### 2. Case Assignment Reverse Index

Add endpoint: `GET /api/records?assignedTo={pubkey}` — already exists in CaseDO.
Add to volunteer detail page: new "Cases" tab showing assigned cases with status, type, last updated.

### 3. Volunteer Workload Dashboard Widget

On the admin dashboard, show a workload summary:
- Bar chart or table: volunteer name, active case count, capacity remaining
- Highlight overloaded volunteers (>80% capacity)
- Link to volunteer profile for details

### 4. Specialization-Based Assignment Suggestions

When assigning a case, if the entity type has recommended specializations:
- Show a "Suggested" badge next to volunteers whose specializations match
- Sort matching volunteers to the top of the assignment list

### 5. Template-Driven Role Recommendations

During invite creation, when templates are applied:
- Show suggested roles from the active templates
- Pre-check roles that match the invite's stated purpose
- "This volunteer will be able to: [list of capabilities from role permissions]"

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/types.ts` | Add specializations, maxCaseAssignments, teamId, supervisorPubkey |
| `apps/worker/durable-objects/identity-do.ts` | Handle new fields in volunteer CRUD |
| `apps/worker/routes/volunteers.ts` | Accept new fields in create/update |
| `src/client/routes/volunteers_.$pubkey.tsx` | Add Cases tab, specializations display |
| `src/client/routes/index.tsx` | Add workload widget to dashboard |
| `src/client/components/cases/assign-dialog.tsx` | Show specialization-based suggestions |

## Acceptance Criteria

- [ ] Volunteer profile shows "Cases" tab with assigned cases
- [ ] Specializations can be set and displayed
- [ ] Case assignment shows workload count next to volunteer names
- [ ] Template-suggested roles shown during invite creation
- [ ] Dashboard shows team workload overview
