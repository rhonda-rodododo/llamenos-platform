# CMS Smart Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three connected gaps in the smart assignment system: fix the specialization scoring stub, add `requiredSpecializations` to entity types, and wire auto-assignment to record creation.

**Architecture:** A shared `scoreVolunteer()` utility in `apps/worker/lib/assignment-scorer.ts` eliminates duplication between the suggestions route and a new `pickBestAssignee()` helper in `records.ts`. Auto-assignment runs in the `POST /` route handler after record creation — the service layer stays lean. All scoring reads live hub settings and entity type definitions fetched once before the per-user loop.

**Tech Stack:** Bun + Hono + Drizzle ORM + PostgreSQL, `bun-jsonb` custom column type, Zod 4 protocol schemas, playwright-bdd for backend BDD tests.

---

## File Map

| File | Change type | Purpose |
|------|-------------|---------|
| `apps/worker/db/schema/settings.ts` | Edit | Add `requiredSpecializations text[]` column to `entityTypeDefinitions` table definition |
| `apps/worker/db/migrate.ts` (or equivalent runner) | Edit or New | Run the new migration SQL |
| `apps/worker/lib/assignment-scorer.ts` | New | Shared `scoreVolunteer()` utility function |
| `apps/worker/routes/records.ts` | Edit | Fix suggestions scoring; extract `pickBestAssignee()` helper; wire auto-assign on POST |
| `packages/protocol/schemas/entity-schema.ts` | Edit | Add `requiredSpecializations` to `entityTypeDefinitionSchema`, `createEntityTypeBodySchema`, `updateEntityTypeBodySchema` |
| `apps/worker/services/settings.ts` | Edit | Map `requiredSpecializations` in `rowToEntityType()` |
| `src/client/lib/api.ts` | Edit | Add `specializations` and `maxCaseAssignments` to `updateUser()` param type |
| `src/client/routes/users_.$pubkey.tsx` | Edit | Add specializations tag-input and maxCaseAssignments number field to admin user edit form |
| `packages/test-specs/features/core/cms-assignment.feature` | Edit | Add new scenarios for specialization scoring, entity type `requiredSpecializations`, auto-assign guards |
| `tests/steps/backend/cms-assignment.steps.ts` | New | Backend-only BDD step definitions for the new feature scenarios |

---

## Task 1: Add `requiredSpecializations` to DB schema + protocol schema

**Files:**
- Modify: `apps/worker/db/schema/settings.ts:161-206`
- Modify: `packages/protocol/schemas/entity-schema.ts:96-145`
- Modify: `packages/protocol/schemas/entity-schema.ts:184-264`

### Steps

- [ ] **1.1 — Add column to Drizzle schema**

In `apps/worker/db/schema/settings.ts`, inside the `entityTypeDefinitions` `pgTable` call, add after `piiFields`:

```ts
requiredSpecializations: text('required_specializations')
  .array()
  .default(sql`'{}'::text[]`),
```

This follows the same pattern as `piiFields` and `closedStatuses` already in that table.

- [ ] **1.2 — Verify the migration approach**

Run:
```bash
cd ~/projects/llamenos && grep -r "drizzle-kit\|push\|migrate" package.json | head -10
```

Check whether this project uses `drizzle-kit push` (schema-push development flow) or SQL migration files. The project has no `apps/worker/db/migrations/` directory, which means it likely uses `drizzle-kit push` or a custom schema-push script. Confirm with:
```bash
grep -r "push\|migrate" apps/worker/package.json apps/worker/drizzle.config.* 2>/dev/null | head -10
```

- [ ] **1.3 — Apply migration to dev database**

If schema-push: run `bun run db:push` (or equivalent — check `package.json`).
If SQL migrations: create `apps/worker/db/migrations/add_entity_type_required_specializations.sql`:

```sql
ALTER TABLE entity_type_definitions
  ADD COLUMN IF NOT EXISTS required_specializations text[] DEFAULT '{}';
```

Then run the migration script.

- [ ] **1.4 — Add `requiredSpecializations` to protocol schema**

In `packages/protocol/schemas/entity-schema.ts`:

a) In `entityTypeDefinitionSchema` (line ~129), add after `piiFields`:
```ts
requiredSpecializations: z.array(z.string()).optional().default([]),
```

b) In `createEntityTypeBodySchema` (line ~184), add after the description of pii-related fields (or at the end before the closing brace):
```ts
requiredSpecializations: z.array(z.string().max(100)).optional().default([]),
```

c) In `updateEntityTypeBodySchema` (line ~227), add:
```ts
requiredSpecializations: z.array(z.string().max(100)).optional(),
```

Use `.optional().default([])` on the definition schema (never bare `.default([])`).

- [ ] **1.5 — Run codegen and typecheck**

```bash
cd ~/projects/llamenos && bun run codegen && bun run typecheck
```

Expected: 0 errors. If TypeScript errors appear because `EntityTypeDefinition` inferred type is missing the field somewhere, fix those now.

- [ ] **1.6 — Commit**

```bash
git add apps/worker/db/schema/settings.ts packages/protocol/schemas/entity-schema.ts
# Add migration file if created
git commit -m "feat(cms): add requiredSpecializations to entity type definitions"
```

---

## Task 2: Map `requiredSpecializations` in the settings service

**Files:**
- Modify: `apps/worker/services/settings.ts:2642-2683`

The `rowToEntityType()` private method maps DB rows to `EntityTypeDefinition`. It does not yet map `requiredSpecializations` because the column didn't exist.

### Steps

- [ ] **2.1 — Update `rowToEntityType` mapping**

In `apps/worker/services/settings.ts`, in the `rowToEntityType` method body, add after the `piiFields` line (~line 2670):

```ts
requiredSpecializations: r.requiredSpecializations ?? [],
```

- [ ] **2.2 — Update `createEntityType` and `updateEntityType` field whitelists**

Search for where `createEntityType` and `updateEntityType` build the insert/update objects:
```bash
grep -n "piiFields\|requiredSpecializations" apps/worker/services/settings.ts
```

In both `createEntityType` (~line 1888) and `updateEntityType` (~line 1977), wherever `piiFields` is passed through, add `requiredSpecializations` alongside it. The pattern is typically:
```ts
requiredSpecializations: (data.requiredSpecializations as string[]) ?? [],
```

- [ ] **2.3 — Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck
```

Expected: 0 errors.

- [ ] **2.4 — Commit**

```bash
git add apps/worker/services/settings.ts
git commit -m "feat(cms): map requiredSpecializations in settings service rowToEntityType"
```

---

## Task 3: Create the shared `scoreVolunteer()` utility

**Files:**
- Create: `apps/worker/lib/assignment-scorer.ts`

This is the new utility that both the suggestions route handler and `pickBestAssignee` will call. It encodes all scoring rules in one place.

### Steps

- [ ] **3.1 — Write the failing unit test**

The scorer has no test yet. Create `apps/worker/lib/assignment-scorer.test.ts`:

```ts
import { describe, it, expect } from 'bun:test'
import { scoreVolunteer } from './assignment-scorer'
import type { User } from '../types/infra'

const BASE_USER: User = {
  pubkey: 'aaa',
  name: 'Test',
  phone: '',
  roles: [],
  active: true,
  createdAt: '',
  encryptedSecretKey: '',
  transcriptionEnabled: false,
  spokenLanguages: [],
  uiLanguage: 'en',
  profileCompleted: true,
  onBreak: false,
  callPreference: 'browser',
}

describe('scoreVolunteer', () => {
  it('returns base score 50 for an on-shift user with no matching criteria', () => {
    const result = scoreVolunteer(BASE_USER, 0, [], undefined)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(80) // 50 base + 30 workload (0/20 utilization)
    expect(result!.reasons).toContain('On shift')
  })

  it('returns null when user is at capacity', () => {
    const user: User = { ...BASE_USER, maxCaseAssignments: 3 }
    const result = scoreVolunteer(user, 3, [], undefined)
    expect(result).toBeNull()
  })

  it('does not return null when maxCaseAssignments is 0 (unlimited)', () => {
    const user: User = { ...BASE_USER, maxCaseAssignments: 0 }
    const result = scoreVolunteer(user, 100, [], undefined)
    expect(result).not.toBeNull()
  })

  it('adds +15 for language match', () => {
    const user: User = { ...BASE_USER, spokenLanguages: ['es'] }
    const result = scoreVolunteer(user, 0, [], 'es')
    expect(result!.score).toBe(95) // 50 + 30 workload + 15 language
    expect(result!.reasons.some(r => r.includes('es'))).toBe(true)
  })

  it('adds +10 per matching specialization', () => {
    const user: User = { ...BASE_USER, specializations: ['legal_observer', 'immigration'] }
    const result = scoreVolunteer(user, 0, ['legal_observer', 'immigration', 'other'], undefined)
    expect(result!.score).toBe(100) // 50 + 30 + 10 + 10
    expect(result!.reasons.some(r => r.includes('legal_observer'))).toBe(true)
  })

  it('gives 0 specialization points when requiredSpecializations is empty', () => {
    const user: User = { ...BASE_USER, specializations: ['immigration'] }
    const result = scoreVolunteer(user, 0, [], undefined)
    expect(result!.score).toBe(80) // 50 + 30, no specialization bonus
  })

  it('gives 0 specialization points when user specializations do not match', () => {
    const user: User = { ...BASE_USER, specializations: ['unrelated'] }
    const result = scoreVolunteer(user, 0, ['legal_observer'], undefined)
    expect(result!.score).toBe(80) // Same as user with no specializations
    expect(result!.reasons.some(r => r.toLowerCase().includes('specializ'))).toBe(false)
  })

  it('reduces workload score as utilization increases', () => {
    const user1: User = { ...BASE_USER, maxCaseAssignments: 10 }
    const user2: User = { ...BASE_USER, maxCaseAssignments: 10 }
    const low = scoreVolunteer(user1, 1, [], undefined)
    const high = scoreVolunteer(user2, 7, [], undefined)
    expect(low!.score).toBeGreaterThan(high!.score)
  })
})
```

- [ ] **3.2 — Run the test to confirm it fails**

```bash
cd ~/projects/llamenos && bun test apps/worker/lib/assignment-scorer.test.ts
```

Expected: `Cannot find module './assignment-scorer'` (or similar). File does not exist yet.

- [ ] **3.3 — Create `apps/worker/lib/assignment-scorer.ts`**

```ts
import type { User } from '../types/infra'

export interface VolunteerScore {
  pubkey: string
  score: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
}

/**
 * Score a single volunteer for case assignment eligibility.
 *
 * Returns null if the volunteer should be excluded (at capacity).
 * The caller is responsible for pre-filtering inactive, on-break, and off-shift
 * users before calling this function.
 *
 * Scoring breakdown:
 *   50  — base (on shift)
 *   0-30 — workload: (1 - utilization) * 30, using effectiveMax = maxCases || 20
 *   +15  — language match: vol.spokenLanguages includes languageNeed
 *   +10 per matching specialization (only when requiredSpecializations is non-empty)
 */
export function scoreVolunteer(
  vol: User,
  activeCaseCount: number,
  requiredSpecializations: string[],
  languageNeed: string | undefined,
): VolunteerScore | null {
  const maxCases = vol.maxCaseAssignments ?? 0

  // Capacity gate: exclude users at or over their max (0 = unlimited)
  if (maxCases > 0 && activeCaseCount >= maxCases) {
    return null
  }

  let score = 50
  const reasons: string[] = ['On shift']

  // Workload score (0–30 points): lower utilization = higher score
  const effectiveMax = maxCases > 0 ? maxCases : 20
  const utilization = activeCaseCount / effectiveMax
  const workloadPoints = Math.round((1 - Math.min(utilization, 1)) * 30)
  score += workloadPoints
  reasons.push(`${activeCaseCount}/${effectiveMax} cases`)

  // Language match (+15)
  if (languageNeed && vol.spokenLanguages?.includes(languageNeed)) {
    score += 15
    reasons.push(`Speaks ${languageNeed}`)
  }

  // Specialization match (+10 per match, only when entity type declares requirements)
  if (requiredSpecializations.length > 0 && vol.specializations?.length) {
    const matches = vol.specializations.filter(s => requiredSpecializations.includes(s))
    if (matches.length > 0) {
      score += matches.length * 10
      reasons.push(`Specialization match: ${matches.join(', ')}`)
    }
  }

  return {
    pubkey: vol.pubkey,
    score,
    reasons,
    activeCaseCount,
    maxCases: effectiveMax,
  }
}
```

- [ ] **3.4 — Run the test to confirm it passes**

```bash
cd ~/projects/llamenos && bun test apps/worker/lib/assignment-scorer.test.ts
```

Expected: all 8 tests PASS.

- [ ] **3.5 — Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck
```

Expected: 0 errors.

- [ ] **3.6 — Commit**

```bash
git add apps/worker/lib/assignment-scorer.ts apps/worker/lib/assignment-scorer.test.ts
git commit -m "feat(cms): add scoreVolunteer shared utility with full unit test coverage"
```

---

## Task 4: Fix specialization scoring in the suggestions route

**Files:**
- Modify: `apps/worker/routes/records.ts:626-719`

Replace the per-user scoring inline code with calls to `scoreVolunteer()`. Fetch the entity type's `requiredSpecializations` once before the loop.

### Steps

- [ ] **4.1 — Refactor the suggestions route handler**

In `apps/worker/routes/records.ts`, update the `GET /:id/suggest-assignees` handler:

a) Add import at the top of the file (after the existing imports):
```ts
import { scoreVolunteer } from '../lib/assignment-scorer'
```

b) Replace the entire scoring block (lines ~662–716, from `const suggestions: Array<...>` to `suggestions.sort(...)`) with:

```ts
// Fetch entity type required specializations once (not inside the loop)
let entityTypeRequiredSpecializations: string[] = []
if (record.entityTypeId) {
  try {
    const entityType = await services.settings.getEntityTypeById(record.entityTypeId)
    entityTypeRequiredSpecializations = entityType.requiredSpecializations ?? []
  } catch {
    // Entity type not found — proceed without specialization scoring
  }
}

const languageNeed = c.req.query('language')

// 4. Score each eligible volunteer
const suggestions: Array<{
  pubkey: string
  score: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
}> = []

for (const vol of allUsers) {
  if (!vol.active) continue
  if (vol.onBreak) continue
  if (!onShiftSet.has(vol.pubkey)) continue
  if (alreadyAssigned.has(vol.pubkey)) continue

  const { count: activeCaseCount } = await services.cases.countByAssignment(vol.pubkey)

  const scored = scoreVolunteer(
    vol,
    activeCaseCount,
    entityTypeRequiredSpecializations,
    languageNeed,
  )
  if (scored === null) continue // at capacity

  suggestions.push(scored)
}

suggestions.sort((a, b) => b.score - a.score)
```

- [ ] **4.2 — Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck
```

Expected: 0 errors. The `User` type from `types/infra.ts` is what `allUsers` returns, and `scoreVolunteer` accepts that type.

- [ ] **4.3 — Commit**

```bash
git add apps/worker/routes/records.ts
git commit -m "fix(cms): replace specialization scoring stub with entity-type-aware scoreVolunteer"
```

---

## Task 5: Wire auto-assignment to record creation

**Files:**
- Modify: `apps/worker/routes/records.ts:383-426`

Add a `pickBestAssignee()` private helper function and call it from the `POST /` handler.

### Steps

- [ ] **5.1 — Add `pickBestAssignee` helper to `records.ts`**

Add this function near the top of the route file, after the imports but before the route definitions (or just before the `POST /` handler). It uses the already-imported `services` type — since it's a standalone function that receives services as a parameter, TypeScript will infer the type from usage.

```ts
/**
 * Attempt to pick the best available assignee for a newly created record.
 * Returns null (no error) when:
 *  - autoAssignment is disabled on the hub
 *  - no users are currently on shift
 *  - all on-shift users are at capacity
 */
async function pickBestAssignee(
  services: ReturnType<typeof import('../services').createServices>,
  hubId: string,
  record: { entityTypeId?: string | null },
): Promise<string | null> {
  // Guard: read hub setting first
  const hubSettings = await services.settings.getHubSettings(hubId)
  if (!hubSettings.autoAssignment) {
    return null
  }

  // Get currently on-shift users
  const onShiftPubkeys = await services.shifts.getCurrentVolunteers(hubId)
  if (onShiftPubkeys.length === 0) {
    return null
  }

  // Load all user profiles
  const { users: allUsers } = await services.identity.getUsers()
  const onShiftSet = new Set(onShiftPubkeys)

  // Fetch entity type required specializations once
  let requiredSpecializations: string[] = []
  if (record.entityTypeId) {
    try {
      const entityType = await services.settings.getEntityTypeById(record.entityTypeId)
      requiredSpecializations = entityType.requiredSpecializations ?? []
    } catch {
      // Unknown entity type — proceed without specialization scoring
    }
  }

  // Score all eligible on-shift users
  const candidates: Array<{ pubkey: string; score: number }> = []

  for (const vol of allUsers) {
    if (!vol.active) continue
    if (vol.onBreak) continue
    if (!onShiftSet.has(vol.pubkey)) continue

    const { count: activeCaseCount } = await services.cases.countByAssignment(vol.pubkey)

    const scored = scoreVolunteer(vol, activeCaseCount, requiredSpecializations, undefined)
    if (scored === null) continue // at capacity

    candidates.push({ pubkey: vol.pubkey, score: scored.score })
  }

  if (candidates.length === 0) {
    return null
  }

  // Return pubkey of top scorer
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].pubkey
}
```

**Important**: Look at the actual `services` type used in the route context to get the correct import/type. The `ReturnType<typeof import('../services').createServices>` form is illustrative — match what the rest of the file uses. The `services` parameter type should match `c.get('services')`.

- [ ] **5.2 — Call `pickBestAssignee` from the `POST /` handler**

In `apps/worker/routes/records.ts`, in the `POST /` handler, after the `publishNostrEvent` call for `KIND_RECORD_CREATED` and before the `audit()` call, add:

```ts
// Auto-assignment: attempt to assign to best on-shift volunteer
if (record.assignedTo.length === 0) {
  const hubId = c.get('hubId') ?? ''
  const assignee = await pickBestAssignee(services, hubId, record).catch(e => {
    console.error('[records] Auto-assignment pick failed:', e)
    return null
  })
  if (assignee) {
    await services.cases.assign(record.id, [assignee]).catch(e => {
      console.error('[records] Auto-assignment assign failed:', e)
    })
    record = { ...record, assignedTo: [assignee] }
    publishNostrEvent(c.env, KIND_RECORD_ASSIGNED, {
      type: 'record:assigned',
      recordId: record.id,
      assignedTo: assignee,
      autoAssigned: true,
    }).catch(e => { console.error('[records] Auto-assignment Nostr publish failed:', e) })
  }
}
```

Check whether `record` is `const` or `let` at the point of creation — change it to `let` if needed so `record = { ...record, assignedTo: [assignee] }` is valid.

- [ ] **5.3 — Typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck
```

Expected: 0 errors. If the `services` type is wrong for `pickBestAssignee`, look at how `c.get('services')` is typed in the other route handlers in this file and match it.

- [ ] **5.4 — Commit**

```bash
git add apps/worker/routes/records.ts
git commit -m "feat(cms): wire auto-assignment to POST /records — pickBestAssignee helper"
```

---

## Task 6: Desktop admin UI — specializations and maxCaseAssignments

**Files:**
- Modify: `src/client/lib/api.ts:340-352`
- Modify: `src/client/routes/users_.$pubkey.tsx`

### Steps

- [ ] **6.1 — Expand `updateUser()` param type in `api.ts`**

In `src/client/lib/api.ts`, update `updateUser()` to include the two fields:

```ts
export async function updateUser(pubkey: string, data: Partial<{
  name: string
  phone: string
  roles: string[]
  active: boolean
  supportedMessagingChannels: string[]
  messagingEnabled: boolean
  specializations: string[]
  maxCaseAssignments: number
}>) {
  return request<User>(`/users/${pubkey}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
```

- [ ] **6.2 — Add state for new fields in `users_.$pubkey.tsx`**

In the `UserProfilePage` component, add:
```ts
const [specializations, setSpecializations] = useState<string[]>([])
const [maxCaseAssignments, setMaxCaseAssignments] = useState<number | undefined>(undefined)
const [specializationInput, setSpecializationInput] = useState('')
const [savingCmsProfile, setSavingCmsProfile] = useState(false)
```

Initialize from the loaded user in the `useEffect` that calls `listUsers()`:
```ts
setSpecializations(found?.specializations ?? [])
setMaxCaseAssignments(found?.maxCaseAssignments)
```

- [ ] **6.3 — Add CMS profile section to the admin edit form**

Find the section of `users_.$pubkey.tsx` where admin-only settings (roles, active toggle, etc.) are rendered. Add a new `Card` section — admin-only, rendered when `isAdmin` — with the two new fields.

The `User` type used in `users_.$pubkey.tsx` comes from `@/lib/api`. Check its definition:
```bash
grep -n "specializations\|maxCaseAssignments" src/client/lib/api.ts
```

If `User` doesn't include these fields yet, they come from `apps/worker/types/infra.ts` indirectly. The `listUsers()` API response returns the full user object — `specializations` and `maxCaseAssignments` are already returned by the API. However the `User` type in `api.ts` may not declare them. Add them to the local type or import from protocol if there's a shared type.

```tsx
{isAdmin && (
  <Card>
    <CardHeader>
      <CardTitle>{t('user.cmsProfile', 'Case Management Profile')}</CardTitle>
      <CardDescription>
        {t('user.cmsProfileDesc', 'Specializations and case capacity limit affect smart assignment scoring.')}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* Specializations tag input */}
      <div className="space-y-2">
        <Label htmlFor="specializations-input">{t('user.specializations', 'Specializations')}</Label>
        <div className="flex gap-2">
          <input
            id="specializations-input"
            data-testid="specializations-input"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder={t('user.addSpecialization', 'Add tag and press Enter')}
            value={specializationInput}
            onChange={e => setSpecializationInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && specializationInput.trim()) {
                e.preventDefault()
                const tag = specializationInput.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100)
                if (!specializations.includes(tag)) {
                  setSpecializations([...specializations, tag])
                }
                setSpecializationInput('')
              }
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1" data-testid="specializations-tags">
          {specializations.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => setSpecializations(specializations.filter(s => s !== tag))}
                className="hover:text-destructive"
              >×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Max concurrent cases */}
      <div className="space-y-2">
        <Label htmlFor="max-case-assignments">{t('user.maxCaseAssignments', 'Max concurrent cases')}</Label>
        <input
          id="max-case-assignments"
          data-testid="max-case-assignments-input"
          type="number"
          min={0}
          placeholder={t('user.unlimited', '0 = unlimited')}
          className="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={maxCaseAssignments ?? ''}
          onChange={e => setMaxCaseAssignments(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">{t('user.maxCaseAssignmentsHint', '0 or empty means unlimited')}</p>
      </div>

      {/* Save button */}
      <Button
        data-testid="save-cms-profile-btn"
        disabled={savingCmsProfile}
        onClick={async () => {
          setSavingCmsProfile(true)
          try {
            await updateUser(pubkey, {
              specializations,
              maxCaseAssignments: maxCaseAssignments ?? 0,
            })
            toast(t('user.cmsProfileSaved', 'CMS profile saved'), 'success')
          } catch {
            toast(t('common.error'), 'error')
          } finally {
            setSavingCmsProfile(false)
          }
        }}
      >
        {savingCmsProfile ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
      </Button>
    </CardContent>
  </Card>
)}
```

- [ ] **6.4 — Typecheck and build**

```bash
cd ~/projects/llamenos && bun run typecheck && bun run build
```

Expected: 0 errors.

- [ ] **6.5 — Commit**

```bash
git add src/client/lib/api.ts src/client/routes/users_.\$pubkey.tsx
git commit -m "feat(cms): add specializations tag-input and maxCaseAssignments to admin user edit form"
```

---

## Task 7: Backend BDD tests for new scenarios

**Files:**
- Modify: `packages/test-specs/features/core/cms-assignment.feature`
- Create: `tests/steps/backend/cms-assignment.steps.ts`

The existing `cms-assignment.feature` already has some scenarios. We need to add the new scenarios from the spec's verification gates that cover the real scoring logic and auto-assignment.

### Steps

- [ ] **7.1 — Write the new failing feature scenarios**

In `packages/test-specs/features/core/cms-assignment.feature`, ADD the following scenarios after the existing content (do not remove existing scenarios):

```gherkin
  @backend
  Scenario: specialization match raises score above user with no matching specializations
    Given case management is enabled
    And an entity type "spec_test_type" with required specializations "legal_observer" exists
    And volunteer A has specialization "legal_observer" and is on shift
    And volunteer B has no specializations and is on shift
    And an unassigned record of type "spec_test_type" exists
    When I request GET /records/:id/suggest-assignees
    Then the response status should be 200
    And volunteer A should have a higher score than volunteer B

  @backend
  Scenario: user with non-matching specializations scores same as user with no specializations
    Given case management is enabled
    And an entity type "spec_test_type2" with required specializations "legal_observer" exists
    And volunteer A has specialization "unrelated_skill" and is on shift
    And volunteer B has no specializations and is on shift
    And an unassigned record of type "spec_test_type2" exists
    When I request GET /records/:id/suggest-assignees
    Then the response status should be 200
    And volunteer A should have the same score as volunteer B

  @backend
  Scenario: entity type with no requiredSpecializations gives zero specialization points
    Given case management is enabled
    And an entity type "no_spec_type" with no required specializations exists
    And volunteer A has specialization "legal_observer" and is on shift
    And an unassigned record of type "no_spec_type" exists
    When I request GET /records/:id/suggest-assignees
    Then the response status should be 200
    And the suggestions should not mention specialization match reasons

  @backend
  Scenario: auto-assignment assigns record to top-scored on-shift user
    Given case management is enabled
    And auto-assignment is enabled for the hub
    And volunteer A is on shift with capacity
    And an entity type "auto_test" exists
    When a new record of type "auto_test" is created via API
    Then the record should have exactly 1 assignee
    And the assignee should be volunteer A

  @backend
  Scenario: auto-assignment skips when no users are on shift
    Given case management is enabled
    And auto-assignment is enabled for the hub
    And no volunteers are on shift
    And an entity type "auto_empty" exists
    When a new record of type "auto_empty" is created via API
    Then the record should have 0 assignees

  @backend
  Scenario: auto-assignment disabled means record is created unassigned
    Given case management is enabled
    And auto-assignment is disabled for the hub
    And volunteer A is on shift with capacity
    And an entity type "auto_off" exists
    When a new record of type "auto_off" is created via API
    Then the record should have 0 assignees

  @backend
  Scenario: at-capacity user is excluded from auto-assignment
    Given case management is enabled
    And auto-assignment is enabled for the hub
    And volunteer A is on shift but at max case capacity
    And no other volunteers are on shift
    And an entity type "cap_test" exists
    When a new record of type "cap_test" is created via API
    Then the record should have 0 assignees
```

- [ ] **7.2 — Run BDD tests to confirm new scenarios fail (missing steps)**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | grep -E "FAIL|undefined|missing|Error" | head -30
```

Expected: errors about undefined step definitions.

- [ ] **7.3 — Create `tests/steps/backend/cms-assignment.steps.ts`**

This file implements the backend-only step definitions for the new scenarios. It follows the same pattern as `tests/steps/backend/cms.steps.ts` — using the `workerHub` fixture for isolation, `apiPost`/`apiGet`/`apiPatch` helpers, and the `world` key/value store.

```ts
/**
 * Backend BDD step definitions for smart case assignment (spec 2026-03-21).
 * Tests scoring, auto-assignment wiring, and specialization matching at the API level.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import {
  createEntityTypeViaApi,
  updateEntityTypeViaApi,
  createRecordViaApi,
  createVolunteerViaApi,
  apiGet,
  apiPut,
  apiPatch,
  ADMIN_NSEC,
} from '../../api-helpers'

// ── State ─────────────────────────────────────────────────────────────

interface AssignmentState {
  entityTypeId?: string
  recordId?: string
  suggestions?: Array<{ pubkey: string; score: number; reasons: string[] }>
  volunteerAPubkey?: string
  volunteerBPubkey?: string
  volunteerANsec?: string
  volunteerBNsec?: string
  createdRecord?: Record<string, unknown>
}

const KEY = 'cms_assignment'

function s(world: Record<string, unknown>): AssignmentState {
  return getState<AssignmentState>(world, KEY) ?? {}
}

function set(world: Record<string, unknown>, update: Partial<AssignmentState>): void {
  setState(world, KEY, { ...s(world), ...update })
}

Before({ tags: '@backend' }, async ({ world }) => {
  setState(world, KEY, {})
})

// ── Given ─────────────────────────────────────────────────────────────

Given(
  'an entity type {string} with required specializations {string} exists',
  async ({ request, world, workerHub }, name: string, spec: string) => {
    // Create entity type then patch requiredSpecializations
    const et = await createEntityTypeViaApi(request, { name, hubId: workerHub })
    const etId = (et as { id: string }).id
    await updateEntityTypeViaApi(request, etId, { requiredSpecializations: [spec] })
    set(world, { entityTypeId: etId })
  },
)

Given(
  'an entity type {string} with no required specializations exists',
  async ({ request, world, workerHub }, name: string) => {
    const et = await createEntityTypeViaApi(request, { name, hubId: workerHub })
    set(world, { entityTypeId: (et as { id: string }).id })
  },
)

Given(
  'an entity type {string} exists',
  async ({ request, world, workerHub }, name: string) => {
    const et = await createEntityTypeViaApi(request, { name, hubId: workerHub })
    set(world, { entityTypeId: (et as { id: string }).id })
  },
)

Given(
  'volunteer A has specialization {string} and is on shift',
  async ({ request, world, workerHub }, spec: string) => {
    const { nsec, pubkey } = await createVolunteerViaApi(request)
    // Set specializations via admin PATCH
    await apiPatch(request, `/users/${pubkey}`, { specializations: [spec] }, ADMIN_NSEC)
    // Add to fallback (on-shift) group
    await apiPut(request, `/settings/fallback-group`, { userPubkeys: [pubkey] }, ADMIN_NSEC)
    set(world, { volunteerAPubkey: pubkey, volunteerANsec: nsec })
  },
)

Given(
  'volunteer B has no specializations and is on shift',
  async ({ request, world, workerHub }) => {
    const existing = s(world).volunteerAPubkey
    const { nsec, pubkey } = await createVolunteerViaApi(request)
    // Add both to fallback group
    const pubkeys = [existing, pubkey].filter(Boolean) as string[]
    await apiPut(request, `/settings/fallback-group`, { userPubkeys: pubkeys }, ADMIN_NSEC)
    set(world, { volunteerBPubkey: pubkey, volunteerBNsec: nsec })
  },
)

Given('volunteer A is on shift with capacity', async ({ request, world }) => {
  const { pubkey } = await createVolunteerViaApi(request)
  await apiPut(request, `/settings/fallback-group`, { userPubkeys: [pubkey] }, ADMIN_NSEC)
  set(world, { volunteerAPubkey: pubkey })
})

Given('no volunteers are on shift', async ({ request, workerHub }) => {
  // Set fallback group to empty list
  await apiPut(request, `/settings/fallback-group`, { userPubkeys: [] }, ADMIN_NSEC)
})

Given('volunteer A is on shift but at max case capacity', async ({ request, world }) => {
  const { pubkey } = await createVolunteerViaApi(request)
  // maxCaseAssignments = 1, then assign 1 existing record to fill them up
  await apiPatch(request, `/users/${pubkey}`, { maxCaseAssignments: 1 }, ADMIN_NSEC)
  const entityTypeId = s(world).entityTypeId
  if (entityTypeId) {
    // Create and assign a record to fill this volunteer's capacity
    const fillerRecord = await createRecordViaApi(request, entityTypeId)
    const fillerId = (fillerRecord as { id: string }).id
    await apiPost(request, `/records/${fillerId}/assign`, { pubkeys: [pubkey] }, ADMIN_NSEC)
  }
  await apiPut(request, `/settings/fallback-group`, { userPubkeys: [pubkey] }, ADMIN_NSEC)
  set(world, { volunteerAPubkey: pubkey })
})

Given('auto-assignment is enabled for the hub', async ({ request }) => {
  await apiPut(request, '/settings/cms/auto-assignment', { enabled: true }, ADMIN_NSEC)
})

Given('auto-assignment is disabled for the hub', async ({ request }) => {
  await apiPut(request, '/settings/cms/auto-assignment', { enabled: false }, ADMIN_NSEC)
})

Given('an unassigned record of type {string} exists', async ({ request, world }) => {
  const entityTypeId = s(world).entityTypeId
  if (!entityTypeId) throw new Error('No entity type ID in state — run entity type step first')
  const record = await createRecordViaApi(request, entityTypeId)
  set(world, { recordId: (record as { id: string }).id })
})

// ── When ──────────────────────────────────────────────────────────────

When('I request GET /records/:id/suggest-assignees', async ({ request, world }) => {
  const recordId = s(world).recordId
  if (!recordId) throw new Error('No record ID in state')
  const { data } = await apiGet<{ suggestions: Array<{ pubkey: string; score: number; reasons: string[] }> }>(
    request,
    `/records/${recordId}/suggest-assignees`,
    ADMIN_NSEC,
  )
  set(world, { suggestions: data?.suggestions ?? [] })
})

When('a new record of type {string} is created via API', async ({ request, world }) => {
  const entityTypeId = s(world).entityTypeId
  if (!entityTypeId) throw new Error('No entity type ID in state')
  const record = await createRecordViaApi(request, entityTypeId)
  set(world, { recordId: (record as { id: string }).id, createdRecord: record as Record<string, unknown> })
})

// ── Then ──────────────────────────────────────────────────────────────

Then('volunteer A should have a higher score than volunteer B', async ({ world }) => {
  const { suggestions, volunteerAPubkey, volunteerBPubkey } = s(world)
  expect(suggestions).toBeDefined()
  const a = suggestions!.find(s => s.pubkey === volunteerAPubkey)
  const b = suggestions!.find(s => s.pubkey === volunteerBPubkey)
  expect(a).toBeDefined()
  expect(b).toBeDefined()
  expect(a!.score).toBeGreaterThan(b!.score)
})

Then('volunteer A should have the same score as volunteer B', async ({ world }) => {
  const { suggestions, volunteerAPubkey, volunteerBPubkey } = s(world)
  expect(suggestions).toBeDefined()
  const a = suggestions!.find(s => s.pubkey === volunteerAPubkey)
  const b = suggestions!.find(s => s.pubkey === volunteerBPubkey)
  expect(a).toBeDefined()
  expect(b).toBeDefined()
  expect(a!.score).toBe(b!.score)
})

Then('the suggestions should not mention specialization match reasons', async ({ world }) => {
  const { suggestions } = s(world)
  expect(suggestions).toBeDefined()
  for (const suggestion of suggestions!) {
    for (const reason of suggestion.reasons) {
      expect(reason.toLowerCase()).not.toContain('specialization match')
    }
  }
})

Then('the record should have exactly 1 assignee', async ({ request, world }) => {
  const recordId = s(world).recordId
  expect(recordId).toBeDefined()
  const { data } = await apiGet<{ assignedTo: string[] }>(request, `/records/${recordId}`, ADMIN_NSEC)
  expect(data?.assignedTo).toHaveLength(1)
})

Then('the assignee should be volunteer A', async ({ request, world }) => {
  const { recordId, volunteerAPubkey } = s(world)
  expect(recordId).toBeDefined()
  // Re-fetch the record to get the current state after auto-assignment
  const { data } = await apiGet<{ assignedTo: string[] }>(request, `/records/${recordId}`, ADMIN_NSEC)
  const assignedTo = data?.assignedTo ?? []
  if (assignedTo.length > 0) {
    expect(assignedTo[0]).toBe(volunteerAPubkey)
  }
})

Then('the record should have 0 assignees', async ({ request, world }) => {
  const recordId = s(world).recordId
  expect(recordId).toBeDefined()
  const { data } = await apiGet<{ assignedTo: string[] }>(request, `/records/${recordId}`, ADMIN_NSEC)
  expect(data?.assignedTo ?? []).toHaveLength(0)
})
```

**Note:** Check the actual API helper signatures in `tests/api-helpers.ts` before finalizing this file. In particular:
- Confirm `apiPost`, `apiPut`, `apiPatch` signatures match existing usage
- Confirm `createVolunteerViaApi` returns `{ nsec, pubkey }` or adjust accordingly
- Confirm the `/cms/records/` vs `/records/` path prefix used in this project

Run:
```bash
grep -n "export async function apiPost\|export async function apiPut\|export async function apiPatch" tests/api-helpers.ts
grep -n "createVolunteerViaApi\|createUserViaApi" tests/api-helpers.ts | head -5
```

- [ ] **7.4 — Register the new steps file in the BDD config**

Check how other `tests/steps/backend/` files are registered:
```bash
grep -n "cms-assignment\|steps/backend" playwright.config.ts | head -10
```

If there's a glob pattern like `tests/steps/backend/**/*.ts`, the file is auto-discovered. If explicit paths are listed, add the new file.

- [ ] **7.5 — Run BDD tests to confirm new scenarios pass**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd
```

Expected: all new `@backend` scenarios PASS, no regressions in existing scenarios.

- [ ] **7.6 — Commit**

```bash
git add packages/test-specs/features/core/cms-assignment.feature tests/steps/backend/cms-assignment.steps.ts
git commit -m "test(cms): BDD scenarios for specialization scoring and auto-assignment"
```

---

## Task 8: Final verification and cleanup

### Steps

- [ ] **8.1 — Run full typecheck and build**

```bash
cd ~/projects/llamenos && bun run typecheck && bun run build
```

Expected: 0 errors, clean build.

- [ ] **8.2 — Run unit tests**

```bash
cd ~/projects/llamenos && bun test apps/worker/lib/assignment-scorer.test.ts
```

Expected: all PASS.

- [ ] **8.3 — Run backend BDD**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd
```

Expected: all scenarios PASS including the new ones. No regressions.

- [ ] **8.4 — Run Android unit tests**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest
```

Expected: all PASS (Android is not directly affected, but this confirms no shared type breakage propagated).

- [ ] **8.5 — Run codegen check**

```bash
cd ~/projects/llamenos && bun run codegen:check
```

Expected: no drift. If drift is detected, run `bun run codegen` and commit the updated generated files.

- [ ] **8.6 — Final commit if any cleanup needed**

```bash
git add -p  # Review any stragglers
git commit -m "chore(cms): post-integration cleanup and codegen sync"
```

---

## Verification Checklist (from spec)

- [ ] BDD: `GET /suggest-assignees` returns user with matching specializations ranked above user with none (same entity type)
- [ ] BDD: Two users, same specializations, different workload — lower workload ranks first
- [ ] BDD: User at `maxCaseAssignments` capacity excluded from suggestions
- [ ] BDD: `requiredSpecializations` empty on entity type → specialization scoring contributes 0
- [ ] BDD: User with non-matching specializations scores same as user with no specializations (stub fully removed)
- [ ] Unit: `scoreVolunteer()` covers all score components
- [ ] BDD: `POST /records` with `autoAssignment=true` → `assignedTo` is set to top-scored on-shift user
- [ ] BDD: `POST /records` with no on-shift users → created unassigned, no error
- [ ] BDD: `POST /records` with `autoAssignment=false` → created unassigned
- [ ] BDD: `POST /records` with only at-capacity users → created unassigned
- [ ] API: `PATCH /users/:pubkey` with `specializations: ["legal-observer"]` → user response includes the tag
- [ ] API: `GET /users/:pubkey` includes `specializations` in response
- [ ] Desktop: specializations field saves and displays correctly
- [ ] Desktop: `maxCaseAssignments=0` displays as "unlimited"
- [ ] `bun run codegen` succeeds
- [ ] `bun run codegen:check` passes
- [ ] `bun run typecheck` passes
- [ ] No regressions in existing BDD suite
- [ ] Android unit tests pass
