# EP06-A3: CMS Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the CMS intelligence layer: replace the +5 specialization stub with a real proportional scoring formula, wire auto-assignment at entity creation, implement contact notification dispatch (client-side rendering, server as dumb pipe), route assignment push notifications through the encrypted WebSocket relay, add the atomic report-to-entity conversion endpoint, and build mobile triage and assignment views.

**Architecture:** Extract scoring into `assignment-scorer.ts` (replaces `volunteer-scoring.ts`) with a four-component formula: workload (0–20) + language (0–15) + specialization (0–25 proportional) + availability (0–10). Entity type definitions gain `autoAssign`, `autoAssignThreshold`, `requiredSpecializations`, and `notifyContactsOnStatusChange` fields. Report-to-entity conversion runs in a single PostgreSQL transaction. Assignment events publish via the existing encrypted WebSocket relay (not Nostr). Mobile triage and assignment views are complete new screens on iOS and Android.

**Tech Stack:** Bun/Hono (backend), Drizzle ORM, Zod (protocol schemas), TypeScript/React (desktop), SwiftUI iOS 17+, Kotlin/Compose Android (minSdk 26, Hilt), playwright-bdd (BDD), vitest (unit), bun test

**Spec:** `docs/superpowers/specs/2026-05-12-EP06-A3-cms-intelligence-design.md`

---

## File Structure

### Backend (modify)
- `packages/protocol/schemas/entity-schema.ts` — add `autoAssign`, `autoAssignThreshold`, `requiredSpecializations`, `notifyContactsOnStatusChange` to entity type schemas
- `packages/protocol/schemas/records.ts` — add `convertFromReportBodySchema`, `convertFromReportResponseSchema`
- `packages/protocol/tools/schema-registry.ts` — register new schemas
- `apps/worker/lib/assignment-scorer.ts` — new file: real four-component scoring formula (replaces volunteer-scoring.ts)
- `apps/worker/lib/volunteer-scoring.ts` — delete (replaced by assignment-scorer.ts)
- `apps/worker/__tests__/unit/assignment-scorer.test.ts` — new unit tests for real formula
- `apps/worker/__tests__/unit/volunteer-scoring.test.ts` — delete (replaced)
- `apps/worker/routes/records.ts` — wire auto-assignment in create, add `POST /records/convert-from-report`, update suggest-assignees to pass `requiredSpecializations`
- `apps/worker/services/cases.ts` — add `convertFromReport()` method
- `apps/worker/__tests__/unit/routes/records.test.ts` — tests for auto-assignment and conversion endpoint

### Desktop (modify)
- `src/client/lib/api.ts` — add `convertReportToEntity()`, `notifyContacts()`
- `src/client/components/cases/assignment-dialog.tsx` — show per-component score breakdown with specialization match count
- `src/client/routes/triage.tsx` — replace disconnected create+link flow with atomic conversion button
- `src/client/components/cases/contact-notification-dialog.tsx` — new: post-status-change notification prompt

### iOS (modify + new)
- `apps/ios/Sources/ViewModels/AssignmentViewModel.swift` — new: fetch suggestions, assign volunteer
- `apps/ios/Sources/Views/Cases/AssignmentSheet.swift` — new: volunteer suggestion sheet
- `apps/ios/Sources/ViewModels/TriageViewModel.swift` — add `convertToEntity(report:entityTypeId:)` using atomic endpoint
- `apps/ios/Sources/Views/Cases/ContactNotificationSheet.swift` — new: bottom sheet after status change

### Android (modify + new)
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AssignmentViewModel.kt` — new
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AssignmentSheet.kt` — new composable
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/triage/TriageViewModel.kt` — update `convertToCase()` to call atomic endpoint
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/ContactNotificationSheet.kt` — new composable

### i18n (modify)
- `packages/i18n/locales/en.json` — add keys for scoring breakdown, assignment labels, conversion actions, notification prompts
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — matching translations

### BDD (new)
- `packages/test-specs/features/cms/assignment.feature`
- `packages/test-specs/features/cms/triage-conversion.feature`
- `tests/steps/backend/assignment.steps.ts`
- `tests/steps/backend/triage-conversion.steps.ts`

---

## Task 1: Protocol Schemas — Entity Type Assignment Fields

**Files:**
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/schemas/records.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1: Add assignment and notification fields to entity type definition**

In `packages/protocol/schemas/entity-schema.ts`, add the following fields to `entityTypeDefinitionSchema` after the `isArchived` field:

```typescript
  // Assignment intelligence (EP06-A3)
  autoAssign: z.boolean().optional().default(false),
  autoAssignThreshold: z.number().int().min(10).max(50).optional().default(30),
  requiredSpecializations: z.array(z.string().max(100)).max(20).optional().default([]),
  notifyContactsOnStatusChange: z.boolean().optional().default(false),
```

- [ ] **Step 2: Mirror fields in create and update body schemas**

In `createEntityTypeBodySchema`, add after `templateVersion`:

```typescript
  autoAssign: z.boolean().optional().default(false),
  autoAssignThreshold: z.number().int().min(10).max(50).optional().default(30),
  requiredSpecializations: z.array(z.string().max(100)).max(20).optional().default([]),
  notifyContactsOnStatusChange: z.boolean().optional().default(false),
```

In `updateEntityTypeBodySchema`, add after `isArchived`:

```typescript
  autoAssign: z.boolean().optional(),
  autoAssignThreshold: z.number().int().min(10).max(50).optional(),
  requiredSpecializations: z.array(z.string().max(100)).max(20).optional(),
  notifyContactsOnStatusChange: z.boolean().optional(),
```

- [ ] **Step 3: Add conversion request and response schemas to records.ts**

In `packages/protocol/schemas/records.ts`, append before the final export block:

```typescript
// --- Report-to-entity atomic conversion (EP06-A3) ---

export const convertFromReportBodySchema = z.object({
  reportId: z.string().uuid(),
  entityTypeId: z.string().uuid(),
  additionalFields: z.record(z.string(), z.unknown()).optional().default({}),
})

export const convertFromReportResponseSchema = z.object({
  recordId: z.string().uuid(),
  reportId: z.string().uuid(),
  entityTypeId: z.string().uuid(),
  caseNumber: z.string().optional(),
  autoAssigned: z.boolean(),
  assignedTo: z.array(z.string()).optional().default([]),
})

export type ConvertFromReportBody = z.infer<typeof convertFromReportBodySchema>
export type ConvertFromReportResponse = z.infer<typeof convertFromReportResponseSchema>
```

- [ ] **Step 4: Register new schemas in schema-registry.ts**

In `packages/protocol/tools/schema-registry.ts`, add to the registry map:

```typescript
convertFromReportBodySchema: convertFromReportBodySchema,
convertFromReportResponseSchema: convertFromReportResponseSchema,
```

Import them at the top from `@protocol/schemas/records`.

- [ ] **Step 5: Run codegen to verify**

Run: `bun run codegen`
Expected: Clean exit. `ConvertFromReportBody`, `ConvertFromReportResponse` generated for Swift/Kotlin. `EntityTypeDefinition` now includes `autoAssign`, `requiredSpecializations`, `notifyContactsOnStatusChange`.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/schemas/entity-schema.ts packages/protocol/schemas/records.ts packages/protocol/tools/schema-registry.ts
git commit -m "feat(protocol): add entity type assignment fields and report conversion schemas"
```

---

## Task 2: Backend — Real Specialization Scoring in assignment-scorer.ts

**Files:**
- Create: `apps/worker/lib/assignment-scorer.ts`
- Create: `apps/worker/__tests__/unit/assignment-scorer.test.ts`
- Delete: `apps/worker/lib/volunteer-scoring.ts`
- Delete: `apps/worker/__tests__/unit/volunteer-scoring.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `apps/worker/__tests__/unit/assignment-scorer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreVolunteers, type ScoringInput } from '../../lib/assignment-scorer'

type ScoringUser = ScoringInput['allUsers'][number]

function makeUser(overrides: Partial<ScoringUser> & { pubkey: string }): ScoringUser {
  return {
    active: true,
    onBreak: false,
    spokenLanguages: ['en'],
    specializations: [],
    maxCaseAssignments: null,
    ...overrides,
  }
}

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    allUsers: [],
    onShiftPubkeys: [],
    alreadyAssigned: [],
    activeCaseCounts: new Map(),
    requiredSpecializations: [],
    ...overrides,
  }
}

describe('scoreVolunteers — real formula', () => {
  it('workload: full score (20) when 0 of default 5 cases used', () => {
    const vol = makeUser({ pubkey: 'v1' })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
    }))
    // workload = max(0, 20 - 0*4) = 20
    // availability = 10 (on shift)
    // language = 0 (no need)
    // specialization = 0 (no required)
    expect(s.workloadScore).toBe(20)
    expect(s.availabilityScore).toBe(10)
    expect(s.score).toBe(30)
  })

  it('workload: decreases by 4 per active case, floors at 0', () => {
    const vol4 = makeUser({ pubkey: 'v4', maxCaseAssignments: null })
    const vol6 = makeUser({ pubkey: 'v6', maxCaseAssignments: null })
    const counts = new Map([['v4', 4], ['v6', 6]])

    const result = scoreVolunteers(makeInput({
      allUsers: [vol4, vol6],
      onShiftPubkeys: ['v4', 'v6'],
      activeCaseCounts: counts,
    }))

    const r4 = result.find(r => r.pubkey === 'v4')!
    const r6 = result.find(r => r.pubkey === 'v6')!
    // v4: max(0, 20 - 4*4) = 4
    expect(r4.workloadScore).toBe(4)
    // v6: max(0, 20 - 6*4) = 0
    expect(r6.workloadScore).toBe(0)
  })

  it('language: +15 when volunteer speaks requested language', () => {
    const vol = makeUser({ pubkey: 'v1', spokenLanguages: ['en', 'es'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      languageNeed: 'es',
    }))
    expect(s.languageScore).toBe(15)
  })

  it('language: 0 when no language need specified', () => {
    const vol = makeUser({ pubkey: 'v1', spokenLanguages: ['en', 'es'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
    }))
    expect(s.languageScore).toBe(0)
  })

  it('specialization: proportional — 2/4 required = score 12 or 13 (rounding)', () => {
    const vol = makeUser({ pubkey: 'v1', specializations: ['immigration', 'housing'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      requiredSpecializations: ['immigration', 'housing', 'mental-health', 'legal'],
    }))
    // 2/4 * 25 = 12.5 → rounded to 13
    expect(s.specializationScore).toBe(13)
  })

  it('specialization: 0 when requiredSpecializations is empty', () => {
    const vol = makeUser({ pubkey: 'v1', specializations: ['immigration'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      requiredSpecializations: [],
    }))
    expect(s.specializationScore).toBe(0)
  })

  it('specialization: full 25 when volunteer has all required specializations', () => {
    const vol = makeUser({ pubkey: 'v1', specializations: ['a', 'b', 'c'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      requiredSpecializations: ['a', 'b', 'c'],
    }))
    expect(s.specializationScore).toBe(25)
  })

  it('excludes volunteers at max capacity', () => {
    const vol = makeUser({ pubkey: 'full', maxCaseAssignments: 3 })
    const result = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['full'],
      activeCaseCounts: new Map([['full', 3]]),
    }))
    expect(result).toHaveLength(0)
  })

  it('excludes inactive, on-break, off-shift, and already-assigned', () => {
    const inactive = makeUser({ pubkey: 'i', active: false })
    const onBreak = makeUser({ pubkey: 'b', onBreak: true })
    const offShift = makeUser({ pubkey: 'o' })
    const assigned = makeUser({ pubkey: 'a' })
    const eligible = makeUser({ pubkey: 'e' })
    const result = scoreVolunteers(makeInput({
      allUsers: [inactive, onBreak, offShift, assigned, eligible],
      onShiftPubkeys: ['i', 'b', 'a', 'e'],
      alreadyAssigned: ['a'],
    }))
    expect(result).toHaveLength(1)
    expect(result[0].pubkey).toBe('e')
  })

  it('results sorted descending by total score', () => {
    const low = makeUser({ pubkey: 'low' })
    const high = makeUser({ pubkey: 'high', spokenLanguages: ['en', 'es'] })
    const result = scoreVolunteers(makeInput({
      allUsers: [low, high],
      onShiftPubkeys: ['low', 'high'],
      languageNeed: 'es',
    }))
    expect(result[0].pubkey).toBe('high')
    expect(result[0].score).toBeGreaterThan(result[1].score)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/worker && bun test __tests__/unit/assignment-scorer.test.ts`
Expected: FAIL — `Cannot find module '../../lib/assignment-scorer'`

- [ ] **Step 3: Create assignment-scorer.ts with real formula**

Create `apps/worker/lib/assignment-scorer.ts`:

```typescript
/**
 * Volunteer assignment scoring — real four-component formula.
 *
 * Replaces the +5 stub in volunteer-scoring.ts (EP06-A3).
 *
 * Score = workloadScore + languageScore + specializationScore + availabilityScore
 *
 * - workloadScore    = max(0, 20 - currentAssignments * 4)        — 0–20
 * - languageScore    = spokenLanguages.includes(caseLanguage) ? 15 : 0
 * - specializationScore = matched/required * 25 (rounded)         — 0–25
 * - availabilityScore   = isOnShift ? 10 : 0
 *
 * Volunteers at max capacity are excluded before scoring.
 * Server computes specialization match using blind-indexed tags (hashes match hashes).
 * No plaintext PII is accessed.
 */
import type { User } from '../types'

type ScoringUser = Pick<
  User,
  'pubkey' | 'active' | 'onBreak' | 'spokenLanguages' | 'maxCaseAssignments' | 'specializations'
>

export interface ScoringInput {
  allUsers: ScoringUser[]
  onShiftPubkeys: string[]
  alreadyAssigned: string[]
  activeCaseCounts: Map<string, number>
  /** Language tag the entity/case requires (optional) */
  languageNeed?: string
  /** Specialization tags required by the entity type (from entityType.requiredSpecializations) */
  requiredSpecializations: string[]
}

export interface VolunteerSuggestion {
  pubkey: string
  score: number
  workloadScore: number
  languageScore: number
  specializationScore: number
  availabilityScore: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
  matchedSpecializations: string[]
}

export function scoreVolunteers(input: ScoringInput): VolunteerSuggestion[] {
  const onShiftSet = new Set(input.onShiftPubkeys)
  const assignedSet = new Set(input.alreadyAssigned)
  const suggestions: VolunteerSuggestion[] = []

  for (const vol of input.allUsers) {
    if (!vol.active) continue
    if (vol.onBreak) continue
    if (!onShiftSet.has(vol.pubkey)) continue
    if (assignedSet.has(vol.pubkey)) continue

    const activeCaseCount = input.activeCaseCounts.get(vol.pubkey) ?? 0
    const maxCases = vol.maxCaseAssignments ?? 0
    if (maxCases > 0 && activeCaseCount >= maxCases) continue

    const reasons: string[] = ['On shift']

    // Workload: max(0, 20 - currentAssignments * 4)
    const workloadScore = Math.max(0, 20 - activeCaseCount * 4)
    if (activeCaseCount > 0) {
      reasons.push(`${activeCaseCount} active case${activeCaseCount !== 1 ? 's' : ''}`)
    }

    // Language: +15 if speaks required language
    const languageScore =
      input.languageNeed && vol.spokenLanguages?.includes(input.languageNeed) ? 15 : 0
    if (languageScore > 0) {
      reasons.push(`Speaks ${input.languageNeed}`)
    }

    // Specialization: matched/required * 25 (proportional, 0 if no requirements)
    const required = input.requiredSpecializations
    const volSpecs = vol.specializations ?? []
    const matchedSpecializations =
      required.length > 0 ? required.filter(s => volSpecs.includes(s)) : []
    const specializationScore =
      required.length > 0
        ? Math.round((matchedSpecializations.length / required.length) * 25)
        : 0
    if (matchedSpecializations.length > 0) {
      reasons.push(`${matchedSpecializations.length}/${required.length} specializations`)
    }

    // Availability: on shift (always true here, filtering above)
    const availabilityScore = 10

    const score = workloadScore + languageScore + specializationScore + availabilityScore

    suggestions.push({
      pubkey: vol.pubkey,
      score,
      workloadScore,
      languageScore,
      specializationScore,
      availabilityScore,
      reasons,
      activeCaseCount,
      maxCases: maxCases > 0 ? maxCases : 5,
      matchedSpecializations,
    })
  }

  suggestions.sort((a, b) => b.score - a.score)
  return suggestions
}
```

- [ ] **Step 4: Delete volunteer-scoring.ts and its test**

```bash
rm apps/worker/lib/volunteer-scoring.ts
rm apps/worker/__tests__/unit/volunteer-scoring.test.ts
```

- [ ] **Step 5: Update records.ts import**

In `apps/worker/routes/records.ts`, replace:
```typescript
import { scoreVolunteers } from '../lib/volunteer-scoring'
```
with:
```typescript
import { scoreVolunteers } from '../lib/assignment-scorer'
```

- [ ] **Step 6: Update suggest-assignees route to pass requiredSpecializations**

In `apps/worker/routes/records.ts`, update the `scoreVolunteers` call in the `suggest-assignees` handler to include `requiredSpecializations`:

```typescript
// Fetch entity type definition for requiredSpecializations
let requiredSpecializations: string[] = []
try {
  const entityType = await services.settings.getEntityTypeById(record.entityTypeId)
  requiredSpecializations = entityType.requiredSpecializations ?? []
} catch {
  // Entity type not found — proceed with no specialization requirements
}

const suggestions = scoreVolunteers({
  allUsers,
  onShiftPubkeys,
  alreadyAssigned: record.assignedTo,
  activeCaseCounts,
  languageNeed: c.req.query('language'),
  requiredSpecializations,
})
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/worker && bun test __tests__/unit/assignment-scorer.test.ts`
Expected: PASS

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 9: Commit**

```bash
git add apps/worker/lib/assignment-scorer.ts apps/worker/__tests__/unit/assignment-scorer.test.ts apps/worker/routes/records.ts
git commit -m "feat(backend): replace +5 specialization stub with real proportional scoring formula"
```

---

## Task 3: Backend — Auto-Assignment Wiring at Record Creation

**Files:**
- Modify: `apps/worker/routes/records.ts`
- Modify: `apps/worker/__tests__/unit/routes/records.test.ts`

- [ ] **Step 1: Write failing test for auto-assignment at creation**

Add to `apps/worker/__tests__/unit/routes/records.test.ts`:

```typescript
describe('POST / — auto-assignment', () => {
  it('auto-assigns top-scoring volunteer when entityType.autoAssign=true and score meets threshold', async () => {
    const assignSpy = vi.fn().mockResolvedValue({ id: 'rec-1', assignedTo: ['vol-1'] })
    const createSpy = vi.fn().mockResolvedValue({ id: 'rec-1', entityTypeId: 'et-1', assignedTo: [] })
    const getEntityTypeSpy = vi.fn().mockResolvedValue({
      id: 'et-1',
      numberingEnabled: false,
      autoAssign: true,
      autoAssignThreshold: 30,
      requiredSpecializations: [],
    })
    const getCurrentVolunteersSpy = vi.fn().mockResolvedValue(['vol-1'])
    const getUsersSpy = vi.fn().mockResolvedValue({
      users: [{
        pubkey: 'vol-1',
        active: true,
        onBreak: false,
        spokenLanguages: ['en'],
        specializations: [],
        maxCaseAssignments: null,
      }],
    })
    const countByAssignmentSpy = vi.fn().mockResolvedValue({ count: 0 })
    const publishEventSpy = vi.fn()

    const { app } = createTestApp({
      permissions: ['cases:create'],
      hubId: 'hub-1',
      services: {
        cases: { create: createSpy, assign: assignSpy, countByAssignment: countByAssignmentSpy },
        settings: { getEntityTypeById: getEntityTypeSpy },
        shifts: { getCurrentVolunteers: getCurrentVolunteersSpy },
        identity: { getUsers: getUsersSpy },
        audit: { log: vi.fn() },
      },
    })

    const res = await app.request('/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityTypeId: 'et-1', title: 'Test', fields: {} }),
    })

    expect(res.status).toBe(201)
    expect(assignSpy).toHaveBeenCalledWith('rec-1', ['vol-1'])
  })

  it('skips auto-assignment when entityType.autoAssign=false', async () => {
    const assignSpy = vi.fn()
    const createSpy = vi.fn().mockResolvedValue({ id: 'rec-1', entityTypeId: 'et-2', assignedTo: [] })
    const getEntityTypeSpy = vi.fn().mockResolvedValue({
      id: 'et-2',
      numberingEnabled: false,
      autoAssign: false,
    })

    const { app } = createTestApp({
      permissions: ['cases:create'],
      hubId: 'hub-1',
      services: {
        cases: { create: createSpy, assign: assignSpy },
        settings: { getEntityTypeById: getEntityTypeSpy },
        audit: { log: vi.fn() },
      },
    })

    await app.request('/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityTypeId: 'et-2', title: 'Test', fields: {} }),
    })

    expect(assignSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/worker && bun test __tests__/unit/routes/records.test.ts --grep "auto-assignment"`
Expected: FAIL

- [ ] **Step 3: Wire auto-assignment into the record creation handler**

In `apps/worker/routes/records.ts`, update the `POST /` handler after record creation and before the `publishEvent` call:

```typescript
// Auto-assignment (EP06-A3): if entityType.autoAssign is enabled, score and assign
let autoAssigned = false
let autoAssignedTo: string[] = []
try {
  if (entityType?.autoAssign) {
    const threshold = entityType.autoAssignThreshold ?? 30
    const onShiftPubkeys = await services.shifts.getCurrentVolunteers(c.get('hubId') ?? '')
    const { users: allUsers } = await services.identity.getUsers()
    const activeCaseCounts = new Map<string, number>()
    for (const vol of allUsers) {
      if (!vol.active || vol.onBreak) continue
      const { count } = await services.cases.countByAssignment(vol.pubkey)
      activeCaseCounts.set(vol.pubkey, count)
    }
    const suggestions = scoreVolunteers({
      allUsers,
      onShiftPubkeys,
      alreadyAssigned: record.assignedTo ?? [],
      activeCaseCounts,
      requiredSpecializations: entityType.requiredSpecializations ?? [],
    })
    const best = suggestions[0]
    if (best && best.score >= threshold) {
      await services.cases.assign(record.id, [best.pubkey])
      autoAssigned = true
      autoAssignedTo = [best.pubkey]
      publishEvent(c.env, KIND_RECORD_ASSIGNED, {
        type: 'record:assigned',
        recordId: record.id,
        pubkeys: [best.pubkey],
        autoAssigned: true,
      })
    }
  }
} catch {
  // Auto-assignment is best-effort — never fail record creation
  logger.warn('Auto-assignment failed for record', { recordId: record.id })
}
```

Also update the `entityType` variable in the creation handler — it is currently only fetched inside a try/catch for case number generation. Hoist the `entityType` variable so the auto-assignment block can read it:

```typescript
let caseNumber: string | undefined
let entityType: Awaited<ReturnType<typeof services.settings.getEntityTypeById>> | undefined
try {
  entityType = await services.settings.getEntityTypeById(body.entityTypeId)
  if (entityType.numberingEnabled && entityType.numberPrefix) {
    const result = await services.settings.generateCaseNumber({
      prefix: entityType.numberPrefix,
      hubId: c.get('hubId') ?? '',
    })
    caseNumber = result.number
  }
} catch {
  // Entity type not found — proceed without case number or auto-assignment
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/worker && bun test __tests__/unit/routes/records.test.ts --grep "auto-assignment"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/routes/records.ts apps/worker/__tests__/unit/routes/records.test.ts
git commit -m "feat(backend): wire auto-assignment at record creation using real scoring formula"
```

---

## Task 4: Backend — Report-to-Entity Atomic Conversion Endpoint

**Files:**
- Modify: `apps/worker/services/cases.ts`
- Modify: `apps/worker/routes/records.ts`
- Modify: `apps/worker/__tests__/unit/routes/records.test.ts`

- [ ] **Step 1: Write failing test for conversion endpoint**

Add to `apps/worker/__tests__/unit/routes/records.test.ts`:

```typescript
describe('POST /convert-from-report', () => {
  it('creates record, links report, updates report status, returns ConvertFromReportResponse', async () => {
    const convertSpy = vi.fn().mockResolvedValue({
      recordId: 'rec-new',
      reportId: 'rpt-1',
      entityTypeId: 'et-1',
      caseNumber: 'CR-001',
      autoAssigned: false,
      assignedTo: [],
    })

    const { app } = createTestApp({
      permissions: ['cases:create', 'reports:triage'],
      hubId: 'hub-1',
      services: {
        cases: { convertFromReport: convertSpy },
        audit: { log: vi.fn() },
      },
    })

    const res = await app.request('/records/convert-from-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'rpt-1', entityTypeId: 'et-1' }),
    })

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.recordId).toBe('rec-new')
    expect(json.reportId).toBe('rpt-1')
    expect(convertSpy).toHaveBeenCalledWith({
      reportId: 'rpt-1',
      entityTypeId: 'et-1',
      additionalFields: {},
      hubId: 'hub-1',
      createdBy: expect.any(String),
    })
  })

  it('returns 403 when caller lacks reports:triage permission', async () => {
    const { app } = createTestApp({
      permissions: ['cases:create'],
      hubId: 'hub-1',
      services: { cases: { convertFromReport: vi.fn() }, audit: { log: vi.fn() } },
    })

    const res = await app.request('/records/convert-from-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'rpt-1', entityTypeId: 'et-1' }),
    })

    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/worker && bun test __tests__/unit/routes/records.test.ts --grep "convert-from-report"`
Expected: FAIL

- [ ] **Step 3: Add convertFromReport to CasesService**

In `apps/worker/services/cases.ts`, add the following method:

```typescript
async convertFromReport(params: {
  reportId: string
  entityTypeId: string
  additionalFields: Record<string, unknown>
  hubId: string
  createdBy: string
}): Promise<ConvertFromReportResponse> {
  const { reportId, entityTypeId, additionalFields, hubId, createdBy } = params

  return await this.db.transaction(async (tx) => {
    // 1. Fetch report — validates existence and access
    const reportRows = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, reportId))
      .limit(1)
    if (reportRows.length === 0) {
      throw new Error(`Report not found: ${reportId}`)
    }
    const report = reportRows[0]

    // 2. Fetch entity type for numbering config
    let caseNumber: string | undefined
    let entityType: EntityTypeDefinition | undefined
    try {
      entityType = await this.settingsService.getEntityTypeById(entityTypeId)
      if (entityType?.numberingEnabled && entityType.numberPrefix) {
        const result = await this.settingsService.generateCaseNumber({
          prefix: entityType.numberPrefix,
          hubId,
        })
        caseNumber = result.number
      }
    } catch {
      // Entity type not found — proceed without numbering
    }

    // 3. Build field values — strict name-based matching from report metadata
    const reportFields = (report.metadata as Record<string, unknown>) ?? {}
    const entityFields: Record<string, unknown> = { ...additionalFields }
    for (const [key, value] of Object.entries(reportFields)) {
      if (!(key in entityFields)) {
        entityFields[key] = value
      }
    }

    // 4. Create entity record
    const [newRecord] = await tx
      .insert(caseRecordsTable)
      .values({
        id: crypto.randomUUID(),
        hubId,
        entityTypeId,
        fields: entityFields,
        caseNumber,
        createdBy,
        assignedTo: [],
        status: entityType?.defaultStatus ?? '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    // 5. Link report to entity
    await tx.insert(reportCaseLinks).values({
      id: crypto.randomUUID(),
      reportId,
      recordId: newRecord.id,
      linkedAt: new Date(),
      linkedBy: createdBy,
    })

    // 6. Update report status to "converted"
    await tx
      .update(conversations)
      .set({ metadata: { ...(report.metadata as object), conversionStatus: 'completed' }, updatedAt: new Date() })
      .where(eq(conversations.id, reportId))

    // 7. Preserve original report content as first interaction
    await tx.insert(interactions).values({
      id: crypto.randomUUID(),
      recordId: newRecord.id,
      sourceType: 'report',
      sourceId: reportId,
      content: report.encryptedContent ?? {},
      createdBy,
      createdAt: new Date(),
    })

    return {
      recordId: newRecord.id,
      reportId,
      entityTypeId,
      caseNumber,
      autoAssigned: false,
      assignedTo: [],
    }
  })
}
```

Import `ConvertFromReportResponse` from `@protocol/schemas/records` and ensure the DB table imports include `interactions` and `reportCaseLinks`.

- [ ] **Step 4: Add conversion route to records.ts**

In `apps/worker/routes/records.ts`, add before the `/:id` GET route (so it is not captured by the param route):

```typescript
// --- Convert report to entity (atomic, EP06-A3) ---
records.post('/convert-from-report',
  describeRoute({
    tags: ['Records'],
    summary: 'Atomically convert a triage report to a case entity',
    responses: {
      201: {
        description: 'Entity created from report',
        content: {
          'application/json': {
            schema: resolver(convertFromReportResponseSchema),
          },
        },
      },
      ...authErrors,
      404: { description: 'Report not found' },
    },
  }),
  requirePermission('reports:triage'),
  validator('json', convertFromReportBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const body = c.req.valid('json')

    const result = await services.cases.convertFromReport({
      ...body,
      hubId: c.get('hubId') ?? '',
      createdBy: pubkey,
    })

    publishEvent(c.env, KIND_RECORD_CREATED, {
      type: 'record:created',
      recordId: result.recordId,
      entityTypeId: result.entityTypeId,
      caseNumber: result.caseNumber,
      fromReport: body.reportId,
    })

    await audit(services.audit, 'recordCreatedFromReport', pubkey, {
      recordId: result.recordId,
      reportId: body.reportId,
      entityTypeId: body.entityTypeId,
    })

    return c.json(result, 201)
  },
)
```

Also add imports at top of `records.ts`:
```typescript
import { convertFromReportBodySchema, convertFromReportResponseSchema } from '@protocol/schemas/records'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/worker && bun test __tests__/unit/routes/records.test.ts --grep "convert-from-report"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/services/cases.ts apps/worker/routes/records.ts apps/worker/__tests__/unit/routes/records.test.ts
git commit -m "feat(backend): add atomic report-to-entity conversion endpoint with transaction"
```

---

## Task 5: Backend — WebSocket Assignment Event Enrichment

**Files:**
- Modify: `apps/worker/routes/records.ts`
- Modify: `apps/worker/lib/ws-events.ts`

The `publishEvent` call in the assign route already fires `KIND_RECORD_ASSIGNED`. The event payload needs `hubId` and `entityTypeId` added to match the spec's minimal payload. No new event type is needed — the existing `record:assigned` type is used.

- [ ] **Step 1: Update assignment event payload in the assign route**

In `apps/worker/routes/records.ts`, update the `publishEvent` call in the `POST /:id/assign` handler:

```typescript
publishEvent(c.env, KIND_RECORD_ASSIGNED, {
  type: 'record:assigned',
  recordId: id,
  pubkeys: body.pubkeys,
  hubId: c.get('hubId') ?? '',
  entityTypeId: record.entityTypeId,
})
```

Fetch the record before the assign call to have `entityTypeId`:

```typescript
const record = await services.cases.get(id)
const result = await services.cases.assign(id, body.pubkeys)
```

- [ ] **Step 2: Same update for unassign event**

```typescript
publishEvent(c.env, KIND_RECORD_ASSIGNED, {
  type: 'record:unassigned',
  recordId: id,
  pubkey: body.pubkey,
  hubId: c.get('hubId') ?? '',
  entityTypeId: record.entityTypeId,
})
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 4: Commit**

```bash
git add apps/worker/routes/records.ts
git commit -m "feat(backend): enrich assignment WebSocket events with hubId and entityTypeId"
```

---

## Task 6: Desktop — Assignment Dialog Score Breakdown

**Files:**
- Modify: `src/client/components/cases/assignment-dialog.tsx`
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Update AssignmentSuggestion type in api.ts**

In `src/client/lib/api.ts`, find the `AssignmentSuggestion` type. Update it to include the new per-component fields exported from the protocol:

```typescript
export interface AssignmentSuggestion {
  pubkey: string
  score: number
  workloadScore: number
  languageScore: number
  specializationScore: number
  availabilityScore: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
  matchedSpecializations: string[]
}
```

- [ ] **Step 2: Update assignment-dialog.tsx to show score breakdown**

In `src/client/components/cases/assignment-dialog.tsx`, replace the score badge area with a detailed breakdown. Find the existing Badge showing `{s.score}` and replace the info section with:

```tsx
<div className="flex-1 min-w-0">
  <div className="flex items-center gap-1.5">
    <span className="text-sm font-medium truncate font-mono">
      {s.pubkey.slice(0, 12)}...
    </span>
    <Badge variant="secondary" className="text-[10px] gap-0.5 shrink-0">
      <Star className="h-2.5 w-2.5" />
      {s.score}
    </Badge>
  </div>
  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
    <span
      data-testid="workload-indicator"
      className="flex items-center gap-1 text-[10px] text-muted-foreground"
      title={t('assignment.workloadLabel', { defaultValue: 'Workload score' })}
    >
      <Users className="h-2.5 w-2.5" />
      {s.activeCaseCount}/{s.maxCases}
    </span>
    {s.specializationScore > 0 && (
      <Badge
        data-testid="specialization-score"
        variant="outline"
        className="text-[10px]"
        title={t('assignment.specializationLabel', { defaultValue: 'Specialization match' })}
      >
        <BookOpen className="h-2.5 w-2.5 mr-0.5" />
        {s.matchedSpecializations.length}/{s.matchedSpecializations.length + (s.specializationScore < 25 ? 1 : 0)} spec
      </Badge>
    )}
    {s.languageScore > 0 && (
      <Badge data-testid="language-match" variant="outline" className="text-[10px]">
        <Globe className="h-2.5 w-2.5 mr-0.5" />
        {t('assignment.languageMatch', { defaultValue: 'Language match' })}
      </Badge>
    )}
  </div>
</div>
```

Add `BookOpen` to the lucide-react import.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 4: Commit**

```bash
git add src/client/components/cases/assignment-dialog.tsx src/client/lib/api.ts
git commit -m "feat(desktop): show per-component score breakdown in assignment dialog"
```

---

## Task 7: Desktop — Triage Atomic Conversion + Client API Functions

**Files:**
- Modify: `src/client/lib/api.ts`
- Modify: `src/client/routes/triage.tsx`
- Create: `src/client/components/cases/contact-notification-dialog.tsx`

- [ ] **Step 1: Add convertReportToEntity and notifyContacts to api.ts**

In `src/client/lib/api.ts`, append:

```typescript
// --- Report-to-entity atomic conversion (EP06-A3) ---

export interface ConvertFromReportParams {
  reportId: string
  entityTypeId: string
  additionalFields?: Record<string, unknown>
}

export interface ConvertFromReportResult {
  recordId: string
  reportId: string
  entityTypeId: string
  caseNumber?: string
  autoAssigned: boolean
  assignedTo: string[]
}

export async function convertReportToEntity(params: ConvertFromReportParams): Promise<ConvertFromReportResult> {
  return request<ConvertFromReportResult>(hp('/records/convert-from-report'), {
    method: 'POST',
    body: JSON.stringify({
      reportId: params.reportId,
      entityTypeId: params.entityTypeId,
      additionalFields: params.additionalFields ?? {},
    }),
  })
}

// --- Contact notification dispatch (EP06-A3) ---

export interface NotifyContactParams {
  recordId: string
  notifications: Array<{
    /** HMAC-hashed contact identifier (one-way, server can dispatch without correlating) */
    recipientHash: string
    channel: 'sms' | 'signal' | 'whatsapp' | 'telegram'
    message: string
  }>
}

export async function notifyContacts(params: NotifyContactParams): Promise<{ results: Array<{ recipientHash: string; success: boolean; error?: string }> }> {
  return request(hp(`/records/${params.recordId}/notify-contacts`), {
    method: 'POST',
    body: JSON.stringify({ notifications: params.notifications }),
  })
}
```

- [ ] **Step 2: Replace disconnected triage conversion with atomic endpoint**

In `src/client/routes/triage.tsx`, find the `handleConvertToCase` or equivalent function that currently does a multi-step create+link flow. Replace it with a call to `convertReportToEntity`:

```typescript
import { convertReportToEntity, listEntityTypes } from '@/lib/api'

// ...inside component:
const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([])
const [showEntityTypePicker, setShowEntityTypePicker] = useState(false)
const [converting, setConverting] = useState(false)

// Load case entity types on mount
useEffect(() => {
  listEntityTypes({ category: 'case' })
    .then(({ entityTypes: types }) => setEntityTypes(types))
    .catch(() => {})
}, [])

const handleConvertToEntity = useCallback(async (report: Report, entityTypeId: string) => {
  setConverting(true)
  try {
    const result = await convertReportToEntity({
      reportId: report.id,
      entityTypeId,
    })
    toast(t('triage.converted', {
      defaultValue: 'Converted to entity',
      context: result.caseNumber ? `Case ${result.caseNumber} created` : undefined,
    }), 'success')
    fetchReports()
  } catch {
    toast(t('triage.convertError', { defaultValue: 'Failed to convert report' }), 'error')
  } finally {
    setConverting(false)
    setShowEntityTypePicker(false)
  }
}, [fetchReports, toast, t])
```

Update the triage detail panel to show the "Convert to Entity" button (replacing any existing "Create Case" button) using `data-testid="convert-to-entity-btn"`.

- [ ] **Step 3: Create ContactNotificationDialog component**

Create `src/client/components/cases/contact-notification-dialog.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { notifyContacts } from '@/lib/api'
import { useToast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Bell } from 'lucide-react'

export interface NotifiableContact {
  id: string
  displayName: string
  recipientHash: string
  availableChannels: Array<'sms' | 'signal' | 'whatsapp' | 'telegram'>
}

interface ContactNotificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  contacts: NotifiableContact[]
  statusLabel: string
  caseNumber?: string
  hubName: string
}

export function ContactNotificationDialog({
  open,
  onOpenChange,
  recordId,
  contacts,
  statusLabel,
  caseNumber,
  hubName,
}: ContactNotificationDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [channels, setChannels] = useState<Record<string, 'sms' | 'signal' | 'whatsapp' | 'telegram'>>({})
  const [sending, setSending] = useState(false)

  // Render message template client-side (E2EE: server never sees rendered message + identity together)
  const renderMessage = useCallback(() => {
    return t('notifications.statusChangeTemplate', {
      defaultValue: 'Your case {{caseNumber}} at {{hubName}} has been updated. New status: {{status}}.',
      caseNumber: caseNumber ?? 'N/A',
      hubName,
      status: statusLabel,
    })
  }, [t, caseNumber, hubName, statusLabel])

  const toggleContact = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSend = useCallback(async () => {
    if (selected.size === 0) return
    setSending(true)
    const message = renderMessage()
    const notifications = Array.from(selected).map(contactId => {
      const contact = contacts.find(c => c.id === contactId)!
      return {
        recipientHash: contact.recipientHash,
        channel: channels[contactId] ?? contact.availableChannels[0] ?? 'sms',
        message,
      }
    })
    try {
      await notifyContacts({ recordId, notifications })
      toast(t('notifications.sent', { defaultValue: 'Notifications sent' }), 'success')
      onOpenChange(false)
    } catch {
      toast(t('notifications.sendError', { defaultValue: 'Failed to send notifications' }), 'error')
    } finally {
      setSending(false)
    }
  }, [selected, contacts, channels, recordId, renderMessage, toast, t, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="contact-notification-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notifications.title', { defaultValue: 'Notify Contacts?' })}</DialogTitle>
          <DialogDescription>
            {t('notifications.description', {
              defaultValue: 'Send a status update to linked contacts. Messages are rendered on your device.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          <p className="text-xs text-muted-foreground px-1 italic">
            {renderMessage()}
          </p>
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <Checkbox
                id={contact.id}
                data-testid="contact-checkbox"
                checked={selected.has(contact.id)}
                onCheckedChange={() => toggleContact(contact.id)}
              />
              <label htmlFor={contact.id} className="flex-1 text-sm cursor-pointer">
                {contact.displayName}
              </label>
              {selected.has(contact.id) && contact.availableChannels.length > 1 && (
                <Select
                  value={channels[contact.id] ?? contact.availableChannels[0]}
                  onValueChange={(v) => setChannels(prev => ({ ...prev, [contact.id]: v as typeof prev[string] }))}
                >
                  <SelectTrigger className="w-28 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contact.availableChannels.map(ch => (
                      <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          {contacts.length === 0 && (
            <p data-testid="no-contacts" className="text-sm text-muted-foreground text-center py-4">
              {t('notifications.noContacts', { defaultValue: 'No linked contacts found.' })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('notifications.skip', { defaultValue: 'Skip' })}
          </Button>
          <Button
            data-testid="send-notifications-btn"
            disabled={selected.size === 0 || sending}
            onClick={handleSend}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4 mr-1.5" />}
            {t('notifications.send', { defaultValue: 'Send' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/api.ts src/client/routes/triage.tsx src/client/components/cases/contact-notification-dialog.tsx
git commit -m "feat(desktop): atomic triage conversion, contact notification dialog, new API functions"
```

---

## Task 8: iOS — Assignment Sheet

**Files:**
- Create: `apps/ios/Sources/ViewModels/AssignmentViewModel.swift`
- Create: `apps/ios/Sources/Views/Cases/AssignmentSheet.swift`

- [ ] **Step 1: Create AssignmentViewModel.swift**

Create `apps/ios/Sources/ViewModels/AssignmentViewModel.swift`:

```swift
import Foundation

// MARK: - Volunteer suggestion model

struct VolunteerSuggestion: Decodable, Identifiable, Sendable {
    var id: String { pubkey }
    let pubkey: String
    let score: Int
    let workloadScore: Int
    let languageScore: Int
    let specializationScore: Int
    let availabilityScore: Int
    let reasons: [String]
    let activeCaseCount: Int
    let maxCases: Int
    let matchedSpecializations: [String]
}

struct SuggestAssigneesResponse: Decodable, Sendable {
    let suggestions: [VolunteerSuggestion]
}

// MARK: - AssignmentViewModel

@Observable
final class AssignmentViewModel {
    private let apiService: APIService

    var suggestions: [VolunteerSuggestion] = []
    var isLoading = false
    var isAssigning = false
    var errorMessage: String?

    init(apiService: APIService) {
        self.apiService = apiService
    }

    func loadSuggestions(for recordId: String, language: String? = nil) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            var path = apiService.hp("/api/records/\(recordId)/suggest-assignees")
            if let lang = language {
                path += "?language=\(lang)"
            }
            let response: SuggestAssigneesResponse = try await apiService.request(method: "GET", path: path)
            suggestions = response.suggestions
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func assign(recordId: String, pubkey: String) async -> Bool {
        isAssigning = true
        errorMessage = nil
        do {
            let body = ["pubkeys": [pubkey]]
            let _: CaseRecord = try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/records/\(recordId)/assign"),
                body: body
            )
            isAssigning = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isAssigning = false
            return false
        }
    }
}
```

- [ ] **Step 2: Create AssignmentSheet.swift**

Create `apps/ios/Sources/Views/Cases/AssignmentSheet.swift`:

```swift
import SwiftUI

struct AssignmentSheet: View {
    let recordId: String
    let onAssigned: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: AssignmentViewModel

    init(recordId: String, apiService: APIService, onAssigned: @escaping () -> Void) {
        self.recordId = recordId
        self.onAssigned = onAssigned
        _viewModel = State(wrappedValue: AssignmentViewModel(apiService: apiService))
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.suggestions.isEmpty {
                    ContentUnavailableView(
                        NSLocalizedString("assignment_no_volunteers", comment: "No available volunteers"),
                        systemImage: "person.slash",
                        description: Text(NSLocalizedString("assignment_no_volunteers_hint", comment: "Make sure volunteers are on-shift and have capacity."))
                    )
                } else {
                    List(viewModel.suggestions) { suggestion in
                        SuggestionRow(suggestion: suggestion) {
                            Task {
                                let success = await viewModel.assign(recordId: recordId, pubkey: suggestion.pubkey)
                                if success {
                                    onAssigned()
                                    dismiss()
                                }
                            }
                        }
                        .disabled(viewModel.isAssigning)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(NSLocalizedString("assignment_title", comment: "Assign Volunteer"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common_cancel", comment: "Cancel")) { dismiss() }
                }
            }
        }
        .task { await viewModel.loadSuggestions(for: recordId) }
    }
}

private struct SuggestionRow: View {
    let suggestion: VolunteerSuggestion
    let onAssign: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(suggestion.pubkey.prefix(4))
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .frame(width: 36, height: 36)
                .background(Color.accentColor.opacity(0.1), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(suggestion.pubkey.prefix(12) + "...")
                        .font(.caption.monospaced())
                    Label("\(suggestion.score)", systemImage: "star.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 6) {
                    Label("\(suggestion.activeCaseCount)/\(suggestion.maxCases)", systemImage: "tray.2")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if suggestion.languageScore > 0 {
                        Label(NSLocalizedString("assignment_language_match", comment: "Language"), systemImage: "globe")
                            .font(.caption2)
                            .foregroundStyle(.blue)
                    }
                    if suggestion.specializationScore > 0 {
                        Label("\(suggestion.matchedSpecializations.count) spec", systemImage: "checkmark.seal")
                            .font(.caption2)
                            .foregroundStyle(.green)
                    }
                }
            }

            Spacer()

            Button(NSLocalizedString("assignment_assign_btn", comment: "Assign"), action: onAssign)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .accessibilityIdentifier("suggestion-row")
    }
}
```

- [ ] **Step 3: Build to verify**

Run: `bun run ios:build`
Expected: Build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Sources/ViewModels/AssignmentViewModel.swift apps/ios/Sources/Views/Cases/AssignmentSheet.swift
git commit -m "feat(ios): add assignment suggestion sheet with real score breakdown"
```

---

## Task 9: iOS — Triage Atomic Conversion + Contact Notification Sheet

**Files:**
- Modify: `apps/ios/Sources/ViewModels/TriageViewModel.swift`
- Create: `apps/ios/Sources/Views/Cases/ContactNotificationSheet.swift`

- [ ] **Step 1: Update TriageViewModel to use atomic conversion endpoint**

The existing `convertToCase` method in `apps/ios/Sources/ViewModels/TriageViewModel.swift` calls `POST /api/reports/:id/convert-to-case`. Replace it with the atomic endpoint `POST /api/records/convert-from-report`. Also add an entity type picker step.

Replace the entire `convertToCase` method and add a new one:

```swift
// Remove old ConvertReportToCaseRequest/ConvertReportToCaseResponse local types
// (they are now generated by protocol codegen)

/// Convert a triage report to a full entity record using the atomic conversion endpoint.
///
/// - Parameters:
///   - report: The report to convert.
///   - entityTypeId: The target entity type ID selected by the user.
/// - Returns: `true` if conversion succeeded.
@discardableResult
func convertToEntity(report: ClientReportResponse, entityTypeId: String) async -> Bool {
    isActionInProgress = true
    errorMessage = nil

    do {
        let body = ConvertFromReportBody(
            reportId: report.id,
            entityTypeId: entityTypeId,
            additionalFields: nil
        )
        let _: ConvertFromReportResponse = try await apiService.request(
            method: "POST",
            path: apiService.hp("/api/records/convert-from-report"),
            body: body
        )
        await refresh()
        isActionInProgress = false
        return true
    } catch {
        errorMessage = error.localizedDescription
        isActionInProgress = false
        return false
    }
}
```

- [ ] **Step 2: Create ContactNotificationSheet.swift**

Create `apps/ios/Sources/Views/Cases/ContactNotificationSheet.swift`:

```swift
import SwiftUI

struct ContactForNotification: Identifiable {
    let id: String
    let displayName: String
    let recipientHash: String
    let availableChannels: [String]
}

struct ContactNotificationSheet: View {
    let recordId: String
    let contacts: [ContactForNotification]
    let statusLabel: String
    let caseNumber: String?
    let hubName: String
    let apiService: APIService
    @Environment(\.dismiss) private var dismiss

    @State private var selected: Set<String> = []
    @State private var channels: [String: String] = [:]
    @State private var isSending = false
    @State private var error: String?

    private var renderedMessage: String {
        let cn = caseNumber ?? "N/A"
        return String(
            format: NSLocalizedString("notifications_status_change_template", comment: ""),
            cn, hubName, statusLabel
        )
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(renderedMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .italic()
                }

                Section(NSLocalizedString("notifications_contacts_section", comment: "Contacts")) {
                    ForEach(contacts) { contact in
                        HStack {
                            Toggle(contact.displayName, isOn: Binding(
                                get: { selected.contains(contact.id) },
                                set: { on in
                                    if on { selected.insert(contact.id) }
                                    else { selected.remove(contact.id) }
                                }
                            ))
                            .toggleStyle(.checkmark)

                            if selected.contains(contact.id) && contact.availableChannels.count > 1 {
                                Picker("", selection: Binding(
                                    get: { channels[contact.id] ?? contact.availableChannels[0] },
                                    set: { channels[contact.id] = $0 }
                                )) {
                                    ForEach(contact.availableChannels, id: \.self) { ch in
                                        Text(ch).tag(ch)
                                    }
                                }
                                .pickerStyle(.menu)
                                .labelsHidden()
                            }
                        }
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle(NSLocalizedString("notifications_title", comment: "Notify Contacts?"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("notifications_skip", comment: "Skip")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("notifications_send", comment: "Send")) {
                        Task { await send() }
                    }
                    .disabled(selected.isEmpty || isSending)
                }
            }
            .overlay {
                if isSending { ProgressView() }
            }
        }
    }

    private func send() async {
        isSending = true
        error = nil
        let notifications = selected.compactMap { contactId -> [String: String]? in
            guard let contact = contacts.first(where: { $0.id == contactId }) else { return nil }
            return [
                "recipientHash": contact.recipientHash,
                "channel": channels[contactId] ?? contact.availableChannels.first ?? "sms",
                "message": renderedMessage,
            ]
        }
        do {
            let _: [String: String] = try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/records/\(recordId)/notify-contacts"),
                body: ["notifications": notifications]
            )
            isSending = false
            dismiss()
        } catch let err {
            error = err.localizedDescription
            isSending = false
        }
    }
}
```

- [ ] **Step 3: Build to verify**

Run: `bun run ios:build`
Expected: Build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Sources/ViewModels/TriageViewModel.swift apps/ios/Sources/Views/Cases/ContactNotificationSheet.swift
git commit -m "feat(ios): atomic triage conversion via new endpoint, contact notification sheet"
```

---

## Task 10: Android — Assignment Sheet

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AssignmentViewModel.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AssignmentSheet.kt`

- [ ] **Step 1: Create AssignmentViewModel.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AssignmentViewModel.kt`:

```kotlin
package org.llamenos.hotline.ui.cases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import javax.inject.Inject

data class VolunteerSuggestion(
    val pubkey: String,
    val score: Int,
    val workloadScore: Int,
    val languageScore: Int,
    val specializationScore: Int,
    val availabilityScore: Int,
    val reasons: List<String>,
    val activeCaseCount: Int,
    val maxCases: Int,
    val matchedSpecializations: List<String>,
)

data class SuggestAssigneesResponse(
    val suggestions: List<VolunteerSuggestion>,
)

data class AssignmentUiState(
    val suggestions: List<VolunteerSuggestion> = emptyList(),
    val isLoading: Boolean = false,
    val isAssigning: Boolean = false,
    val error: String? = null,
    val assignedSuccess: Boolean = false,
)

@HiltViewModel
class AssignmentViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AssignmentUiState())
    val uiState: StateFlow<AssignmentUiState> = _uiState.asStateFlow()

    fun loadSuggestions(recordId: String, language: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                var path = apiService.hp("/api/records/$recordId/suggest-assignees")
                if (language != null) path += "?language=$language"
                val response = apiService.request<SuggestAssigneesResponse>("GET", path)
                _uiState.update { it.copy(suggestions = response.suggestions, isLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun assign(recordId: String, pubkey: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isAssigning = true, error = null) }
            try {
                apiService.request<Map<String, Any>>(
                    "POST",
                    apiService.hp("/api/records/$recordId/assign"),
                    body = mapOf("pubkeys" to listOf(pubkey)),
                )
                _uiState.update { it.copy(isAssigning = false, assignedSuccess = true) }
                onSuccess()
            } catch (e: Exception) {
                _uiState.update { it.copy(isAssigning = false, error = e.message) }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
```

- [ ] **Step 2: Create AssignmentSheet.kt composable**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AssignmentSheet.kt`:

```kotlin
package org.llamenos.hotline.ui.cases

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.app.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignmentSheet(
    recordId: String,
    onDismiss: () -> Unit,
    onAssigned: () -> Unit,
    viewModel: AssignmentViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(recordId) {
        viewModel.loadSuggestions(recordId)
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Text(
                text = stringResource(R.string.assignment_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 12.dp),
            )

            when {
                uiState.isLoading -> {
                    Box(modifier = Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                uiState.suggestions.isEmpty() -> {
                    Text(
                        text = stringResource(R.string.assignment_no_volunteers),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 32.dp).fillMaxWidth().wrapContentWidth(),
                    )
                }
                else -> {
                    LazyColumn(modifier = Modifier.heightIn(max = 400.dp)) {
                        items(uiState.suggestions) { suggestion ->
                            SuggestionItem(
                                suggestion = suggestion,
                                isAssigning = uiState.isAssigning,
                                onAssign = {
                                    viewModel.assign(recordId, suggestion.pubkey) {
                                        onAssigned()
                                        onDismiss()
                                    }
                                },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }

            uiState.error?.let { err ->
                Text(
                    text = err,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SuggestionItem(
    suggestion: VolunteerSuggestion,
    isAssigning: Boolean,
    onAssign: () -> Unit,
) {
    ListItem(
        modifier = Modifier.semantics { contentDescription = "suggestion-row" },
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(suggestion.pubkey.take(12) + "...", style = MaterialTheme.typography.bodySmall)
                AssistChip(
                    onClick = {},
                    label = { Text("${suggestion.score}", style = MaterialTheme.typography.labelSmall) },
                )
            }
        },
        supportingContent = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${suggestion.activeCaseCount}/${suggestion.maxCases} cases",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (suggestion.languageScore > 0) {
                    Text(
                        stringResource(R.string.assignment_language_match),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                if (suggestion.specializationScore > 0) {
                    Text(
                        "${suggestion.matchedSpecializations.size} spec",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }
        },
        trailingContent = {
            FilledTonalButton(
                onClick = onAssign,
                enabled = !isAssigning,
            ) {
                Text(stringResource(R.string.assignment_assign_btn))
            }
        },
    )
}
```

- [ ] **Step 3: Build to verify**

Run: `bun run test:android`
Expected: Unit tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/
git commit -m "feat(android): add assignment suggestion sheet with real score breakdown"
```

---

## Task 11: Android — Triage Atomic Conversion + Contact Notification Sheet

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/triage/TriageViewModel.kt`
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/ContactNotificationSheet.kt`

- [ ] **Step 1: Update TriageViewModel to use atomic conversion endpoint**

In `apps/android/app/src/main/java/org/llamenos/hotline/ui/triage/TriageViewModel.kt`, update `convertToCase` to call `POST /api/records/convert-from-report`:

Replace the existing `convertToCase` method and its request/response model references:

```kotlin
// Updated TriageUiState — add entityTypePicker support
data class TriageUiState(
    val reports: List<Report> = emptyList(),
    val total: Int = 0,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val selectedFilter: TriageStatusFilter = TriageStatusFilter.PENDING,
    val reportTypes: List<ReportTypeDefinition> = emptyList(),
    val isConverting: Boolean = false,
    val selectedReport: Report? = null,
    val lastConvertedRecordId: String? = null,
)

/**
 * Convert a report to an entity record using the atomic conversion endpoint.
 */
fun convertToEntity(report: Report, entityTypeId: String) {
    viewModelScope.launch {
        _uiState.update { it.copy(isConverting = true, error = null) }
        try {
            val body = mapOf(
                "reportId" to report.id,
                "entityTypeId" to entityTypeId,
                "additionalFields" to emptyMap<String, Any>(),
            )
            val response = apiService.request<Map<String, Any>>(
                "POST",
                apiService.hp("/api/records/convert-from-report"),
                body = body,
            )
            val recordId = response["recordId"] as? String
            _uiState.update {
                it.copy(isConverting = false, selectedReport = null, lastConvertedRecordId = recordId)
            }
            loadTriageQueue()
        } catch (e: Exception) {
            _uiState.update {
                it.copy(isConverting = false, error = e.message ?: "Failed to convert report")
            }
        }
    }
}
```

- [ ] **Step 2: Create ContactNotificationSheet.kt**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/ContactNotificationSheet.kt`:

```kotlin
package org.llamenos.hotline.ui.cases

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.llamenos.app.R
import org.llamenos.hotline.api.ApiService

data class NotifiableContact(
    val id: String,
    val displayName: String,
    val recipientHash: String,
    val availableChannels: List<String>,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactNotificationSheet(
    recordId: String,
    contacts: List<NotifiableContact>,
    statusLabel: String,
    caseNumber: String?,
    hubName: String,
    apiService: ApiService,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf(setOf<String>()) }
    var channels by remember { mutableStateOf(mapOf<String, String>()) }
    var isSending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val renderedMessage = remember(caseNumber, hubName, statusLabel) {
        "Case ${caseNumber ?: "N/A"} at $hubName has been updated. New status: $statusLabel."
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(
                text = stringResource(R.string.notifications_title),
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = renderedMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(12.dp))

            LazyColumn(modifier = Modifier.heightIn(max = 320.dp)) {
                items(contacts) { contact ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Checkbox(
                                checked = contact.id in selected,
                                onCheckedChange = { on ->
                                    selected = if (on) selected + contact.id else selected - contact.id
                                },
                            )
                            Text(contact.displayName, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (contact.id in selected && contact.availableChannels.size > 1) {
                            var expanded by remember { mutableStateOf(false) }
                            ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                                OutlinedTextField(
                                    value = channels[contact.id] ?: contact.availableChannels[0],
                                    onValueChange = {},
                                    readOnly = true,
                                    modifier = Modifier.width(120.dp).menuAnchor(MenuAnchorType.PrimaryNotEditable),
                                    textStyle = MaterialTheme.typography.labelSmall,
                                )
                                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                    contact.availableChannels.forEach { ch ->
                                        DropdownMenuItem(
                                            text = { Text(ch) },
                                            onClick = {
                                                channels = channels + (contact.id to ch)
                                                expanded = false
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }
                    HorizontalDivider()
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }

            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.notifications_skip)) }
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            isSending = true
                            error = null
                            try {
                                val notifications = selected.mapNotNull { id ->
                                    contacts.find { it.id == id }?.let { c ->
                                        mapOf(
                                            "recipientHash" to c.recipientHash,
                                            "channel" to (channels[id] ?: c.availableChannels.firstOrNull() ?: "sms"),
                                            "message" to renderedMessage,
                                        )
                                    }
                                }
                                apiService.request<Map<String, Any>>(
                                    "POST",
                                    apiService.hp("/api/records/$recordId/notify-contacts"),
                                    body = mapOf("notifications" to notifications),
                                )
                                isSending = false
                                onDismiss()
                            } catch (e: Exception) {
                                error = e.message
                                isSending = false
                            }
                        }
                    },
                    enabled = selected.isNotEmpty() && !isSending,
                ) {
                    if (isSending) CircularProgressIndicator(modifier = Modifier.size(16.dp))
                    else Text(stringResource(R.string.notifications_send))
                }
            }
        }
    }
}
```

- [ ] **Step 3: Build to verify**

Run: `bun run test:android`
Expected: Unit tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/triage/TriageViewModel.kt apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/ContactNotificationSheet.kt
git commit -m "feat(android): atomic triage conversion via new endpoint, contact notification sheet"
```

---

## Task 12: i18n — Scoring Labels, Assignment, Conversion, Notifications

**Files:**
- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`

- [ ] **Step 1: Add English keys**

In `packages/i18n/locales/en.json`, add the following sections. Place `"assignment"` near the existing `"cases"` section, and `"notifications"` as a new top-level section:

```json
"assignment": {
  "title": "Assign Volunteer",
  "assignBtn": "Assign",
  "noVolunteers": "No available volunteers",
  "noVolunteersHint": "Make sure volunteers are on-shift and have capacity.",
  "workloadLabel": "Workload",
  "languageMatch": "Language match",
  "specializationLabel": "Specialization match",
  "scoreBreakdown": "Score breakdown",
  "autoAssignedBadge": "Auto-assigned"
},
"notifications": {
  "title": "Notify Contacts?",
  "description": "Send a status update to linked contacts. Messages are rendered on your device.",
  "contactsSection": "Contacts",
  "send": "Send",
  "skip": "Skip",
  "sent": "Notifications sent",
  "sendError": "Failed to send notifications",
  "noContacts": "No linked contacts found.",
  "statusChangeTemplate": "Your case {{caseNumber}} at {{hubName}} has been updated. New status: {{status}}."
}
```

Also add to the `"triage"` section:

```json
"convertToEntity": "Convert to Entity",
"converted": "Converted to entity",
"convertError": "Failed to convert report",
"selectEntityType": "Select entity type",
"entityTypePlaceholder": "Choose a type...",
"convertConfirmEntityType": "Convert as {{typeName}}"
```

- [ ] **Step 2: Propagate keys to all 12 other locale files**

For each locale in `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`, add the same keys with English values as fallback (translators will update):

```json
"assignment": { ... same keys as en.json ... },
"notifications": { ... same keys as en.json ... }
```

And the new triage keys in the `"triage"` section.

- [ ] **Step 3: Add Android string resources**

In `apps/android/app/src/main/res/values/strings.xml` (generated output path — run codegen), the keys map to:
- `assignment_title`, `assignment_assign_btn`, `assignment_no_volunteers`, `assignment_no_volunteers_hint`, `assignment_language_match`
- `notifications_title`, `notifications_send`, `notifications_skip`

Run: `bun run i18n:codegen`
Expected: Android strings.xml updated, iOS .strings updated.

- [ ] **Step 4: Validate**

Run: `bun run i18n:validate:all`
Expected: No missing keys reported across desktop, iOS, Android.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/locales/
git commit -m "feat(i18n): add assignment scoring, triage conversion, and contact notification strings"
```

---

## Task 13: BDD Tests

**Files:**
- Create: `packages/test-specs/features/cms/assignment.feature`
- Create: `packages/test-specs/features/cms/triage-conversion.feature`
- Create: `tests/steps/backend/assignment.steps.ts`
- Create: `tests/steps/backend/triage-conversion.steps.ts`

- [ ] **Step 1: Create assignment.feature**

Create `packages/test-specs/features/cms/assignment.feature`:

```gherkin
@backend
Feature: CMS Case Assignment
  As a hub admin
  I want intelligent volunteer suggestions based on workload, language, and specializations
  So that cases are routed to the most appropriate available volunteer

  Background:
    Given I am authenticated as a hub admin
    And the hub has case management enabled
    And volunteers are on shift with varying workloads

  Scenario: Assignment suggestions use real specialization scoring
    Given an entity type requires specializations "immigration" and "housing"
    And volunteer "vol-a" has specializations "immigration" and "housing"
    And volunteer "vol-b" has no specializations
    When I fetch assignment suggestions for a case of that entity type
    Then "vol-a" ranks above "vol-b"
    And "vol-a" specializationScore is 25
    And "vol-b" specializationScore is 0

  Scenario: Auto-assignment occurs when score meets threshold
    Given an entity type has autoAssign enabled with threshold 30
    And volunteer "vol-a" is on shift with 0 active cases
    When I create a new case of that entity type
    Then the case is assigned to "vol-a"
    And a "record:assigned" WebSocket event is published with autoAssigned=true

  Scenario: Auto-assignment is skipped when no volunteer meets threshold
    Given an entity type has autoAssign enabled with threshold 50
    And all on-shift volunteers have 5 or more active cases
    When I create a new case of that entity type
    Then the case has no assignee
    And no WebSocket assignment event is published

  Scenario: Assignment endpoint publishes WebSocket event with hubId and entityTypeId
    Given a case exists in the hub
    And volunteer "vol-x" is on shift
    When I assign "vol-x" to the case
    Then a "record:assigned" WebSocket event is published
    And the event contains "hubId"
    And the event contains "entityTypeId"
```

- [ ] **Step 2: Create triage-conversion.feature**

Create `packages/test-specs/features/cms/triage-conversion.feature`:

```gherkin
@backend
Feature: Triage Report-to-Entity Conversion
  As a hub admin with reports:triage permission
  I want to atomically convert triage reports to case entities
  So that the report is linked, status is updated, and original content is preserved

  Background:
    Given I am authenticated as a hub admin with "reports:triage" permission
    And the hub has case management enabled
    And an entity type "Crisis Case" exists with category "case"

  Scenario: Atomic conversion creates entity and updates report in one transaction
    Given a triage report "rpt-1" exists with conversionStatus "pending"
    When I POST to /records/convert-from-report with reportId "rpt-1" and entityTypeId for "Crisis Case"
    Then the response status is 201
    And a new case record is created
    And report "rpt-1" conversionStatus is "completed"
    And the new record has a "report" interaction linking to "rpt-1"

  Scenario: Report fields are copied to entity by name matching
    Given a triage report "rpt-2" has metadata field "severity" = "high"
    And entity type "Crisis Case" has a field named "severity"
    When I convert report "rpt-2" to a "Crisis Case"
    Then the created entity record has "severity" = "high"

  Scenario: Unmatched report fields are preserved in the interaction, not the entity
    Given a triage report "rpt-3" has metadata field "callerAlias" = "anonymous-42"
    And entity type "Crisis Case" has no field named "callerAlias"
    When I convert report "rpt-3" to a "Crisis Case"
    Then the created entity record does not have field "callerAlias" at top level
    And the interaction record preserves "callerAlias" in its content

  Scenario: Conversion requires reports:triage permission
    Given I am authenticated as a volunteer without "reports:triage"
    When I POST to /records/convert-from-report
    Then the response status is 403
```

- [ ] **Step 3: Create assignment.steps.ts**

Create `tests/steps/backend/assignment.steps.ts`:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { ApiContext } from '../support/api-context'

Given('an entity type requires specializations {string} and {string}', async function (this: ApiContext, spec1: string, spec2: string) {
  const res = await this.api.post('/settings/cms/entity-types', {
    name: 'test_specialized',
    label: 'Test Specialized',
    labelPlural: 'Test Specialized Items',
    category: 'case',
    statuses: [{ value: 'open', label: 'Open' }],
    defaultStatus: 'open',
    requiredSpecializations: [spec1, spec2],
  })
  expect(res.status).toBe(201)
  this.entityTypeId = res.body.id
})

When('I fetch assignment suggestions for a case of that entity type', async function (this: ApiContext) {
  // Create a case first
  const caseRes = await this.api.post('/records', {
    entityTypeId: this.entityTypeId,
    fields: {},
  })
  expect(caseRes.status).toBe(201)
  this.caseId = caseRes.body.id

  const res = await this.api.get(`/records/${this.caseId}/suggest-assignees`)
  expect(res.status).toBe(200)
  this.suggestions = res.body.suggestions
})

Then('{string} ranks above {string}', function (this: ApiContext, higher: string, lower: string) {
  const higherIdx = this.suggestions.findIndex((s: { pubkey: string }) => s.pubkey === this.volunteers[higher])
  const lowerIdx = this.suggestions.findIndex((s: { pubkey: string }) => s.pubkey === this.volunteers[lower])
  expect(higherIdx).toBeGreaterThanOrEqual(0)
  expect(lowerIdx).toBeGreaterThanOrEqual(0)
  expect(higherIdx).toBeLessThan(lowerIdx)
})

Then('{string} specializationScore is {int}', function (this: ApiContext, volunteer: string, expectedScore: number) {
  const suggestion = this.suggestions.find((s: { pubkey: string }) => s.pubkey === this.volunteers[volunteer])
  expect(suggestion).toBeDefined()
  expect(suggestion.specializationScore).toBe(expectedScore)
})

When('I create a new case of that entity type', async function (this: ApiContext) {
  const res = await this.api.post('/records', {
    entityTypeId: this.entityTypeId,
    fields: {},
  })
  expect(res.status).toBe(201)
  this.createdRecord = res.body
})

Then('the case is assigned to {string}', async function (this: ApiContext, volunteer: string) {
  // Poll briefly for the assignment to complete (auto-assignment is async post-creation)
  const res = await this.api.get(`/records/${this.createdRecord.id}`)
  expect(res.body.assignedTo).toContain(this.volunteers[volunteer])
})

Then('a {string} WebSocket event is published with autoAssigned=true', function (this: ApiContext, eventType: string) {
  const event = this.capturedWsEvents?.find((e: { type: string; autoAssigned?: boolean }) => e.type === eventType && e.autoAssigned === true)
  expect(event).toBeDefined()
})
```

- [ ] **Step 4: Create triage-conversion.steps.ts**

Create `tests/steps/backend/triage-conversion.steps.ts`:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { ApiContext } from '../support/api-context'

Given('a triage report {string} exists with conversionStatus {string}', async function (this: ApiContext, reportId: string, status: string) {
  const res = await this.api.post('/reports', {
    reportTypeId: this.reportTypeId,
    content: { body: 'Test report content' },
    metadata: { conversionStatus: status },
  })
  expect(res.status).toBe(201)
  this.reports = { ...this.reports, [reportId]: res.body.id }
})

When('I POST to \\/records\\/convert-from-report with reportId {string} and entityTypeId for {string}', async function (this: ApiContext, reportAlias: string, entityTypeLabel: string) {
  const reportId = this.reports[reportAlias]
  const entityTypeId = this.entityTypes[entityTypeLabel]
  const res = await this.api.post('/records/convert-from-report', {
    reportId,
    entityTypeId,
    additionalFields: {},
  })
  this.lastResponse = res
})

Then('the response status is {int}', function (this: ApiContext, status: number) {
  expect(this.lastResponse.status).toBe(status)
})

Then('a new case record is created', async function (this: ApiContext) {
  expect(this.lastResponse.body.recordId).toBeDefined()
  const res = await this.api.get(`/records/${this.lastResponse.body.recordId}`)
  expect(res.status).toBe(200)
  this.convertedRecord = res.body
})

Then('report {string} conversionStatus is {string}', async function (this: ApiContext, reportAlias: string, expectedStatus: string) {
  const reportId = this.reports[reportAlias]
  const res = await this.api.get(`/reports/${reportId}`)
  expect(res.body.metadata?.conversionStatus).toBe(expectedStatus)
})

Then('the new record has a {string} interaction linking to {string}', async function (this: ApiContext, interactionType: string, reportAlias: string) {
  const reportId = this.reports[reportAlias]
  const res = await this.api.get(`/records/${this.convertedRecord.id}/interactions`)
  const interaction = res.body.interactions.find((i: { sourceType: string; sourceId: string }) => i.sourceType === interactionType && i.sourceId === reportId)
  expect(interaction).toBeDefined()
})
```

- [ ] **Step 5: Run BDD tests**

Run: `bun run test:backend:bdd --tags @backend`
Expected: All scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add packages/test-specs/features/cms/ tests/steps/backend/assignment.steps.ts tests/steps/backend/triage-conversion.steps.ts
git commit -m "test(bdd): add assignment scoring and triage conversion BDD scenarios"
```

---

## Task 14: Verification Gate

- [ ] **Step 1: Run full backend unit test suite**

Run: `cd apps/worker && bun test`
Expected: All tests pass. No references to `volunteer-scoring` (deleted).

- [ ] **Step 2: Typecheck all TypeScript**

Run: `bun run typecheck`
Expected: Clean exit.

- [ ] **Step 3: Run iOS build and tests**

Run: `bun run ios:build && bun run ios:test`
Expected: Build succeeds. Unit tests pass.

- [ ] **Step 4: Run Android build and tests**

Run: `bun run test:android`
Expected: Unit tests pass, lint clean, APK builds.

- [ ] **Step 5: Run codegen + i18n validation**

Run: `bun run codegen && bun run i18n:validate:all`
Expected: Clean codegen. All platforms validate string refs.

- [ ] **Step 6: Run backend BDD**

Run: `bun run test:backend:bdd`
Expected: All BDD scenarios green.

- [ ] **Step 7: Run desktop E2E**

Run: `bun run test:desktop`
Expected: Playwright E2E passes (triage and assignment flows covered by existing or new tests).

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat(EP06-A3): CMS intelligence — real scoring, auto-assignment, conversion endpoint, mobile triage/assignment"
```

---

## Summary of Changes

| Area | Change |
|------|--------|
| `packages/protocol/schemas/entity-schema.ts` | Add `autoAssign`, `autoAssignThreshold`, `requiredSpecializations`, `notifyContactsOnStatusChange` |
| `packages/protocol/schemas/records.ts` | Add `convertFromReportBodySchema`, `convertFromReportResponseSchema` |
| `apps/worker/lib/assignment-scorer.ts` | New: real four-component formula replacing +5 stub |
| `apps/worker/lib/volunteer-scoring.ts` | Deleted (replaced by assignment-scorer.ts) |
| `apps/worker/routes/records.ts` | Auto-assignment in create, new conversion route, enriched WebSocket event payloads |
| `apps/worker/services/cases.ts` | New `convertFromReport()` transactional method |
| `src/client/lib/api.ts` | New `convertReportToEntity()`, `notifyContacts()`, updated `AssignmentSuggestion` type |
| `src/client/components/cases/assignment-dialog.tsx` | Per-component score breakdown |
| `src/client/routes/triage.tsx` | Atomic conversion button wired to new endpoint |
| `src/client/components/cases/contact-notification-dialog.tsx` | New: client-side rendered notification dispatch UI |
| iOS `AssignmentViewModel.swift` + `AssignmentSheet.swift` | New: volunteer suggestion sheet |
| iOS `TriageViewModel.swift` | Updated to atomic conversion endpoint |
| iOS `ContactNotificationSheet.swift` | New: post-status-change notification bottom sheet |
| Android `AssignmentViewModel.kt` + `AssignmentSheet.kt` | New: volunteer suggestion sheet |
| Android `TriageViewModel.kt` | Updated to atomic conversion endpoint |
| Android `ContactNotificationSheet.kt` | New: post-status-change notification bottom sheet |
| `packages/i18n/locales/*.json` | New `assignment.*`, `notifications.*`, and triage conversion keys (13 locales) |
