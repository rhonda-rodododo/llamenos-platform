# EP04: Analytics & Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the analytics pipeline end-to-end: backend gaps (3 new endpoints + platform routing), desktop analytics UI (recharts charts + React Query), full mobile admin analytics (iOS + Android), i18n, and comprehensive tests.

**Architecture:** Extend existing `AnalyticsService` with 3 new methods (hourly distribution, per-user stats, personal stats). Introduce `@tanstack/react-query` for desktop data fetching with lazy-loaded queries and 5-minute cache. Desktop gets recharts-based charts; mobile gets data-equivalent cards/tables (no chart libraries). Analytics routes already mounted at both hub-scoped and platform-scoped levels.

**Tech Stack:** Bun/Hono (backend), Drizzle ORM (queries), Zod (schemas), recharts (desktop charts), @tanstack/react-query (caching), SwiftUI (iOS), Kotlin/Compose (Android), playwright-bdd (E2E), vitest (unit)

**Spec:** `docs/superpowers/specs/2026-05-11-EP04-analytics-dashboards-design.md`

---

## File Structure

### Backend (modify)
- `packages/protocol/schemas/analytics.ts` — add 3 new Zod schemas (hourly, user stats, personal)
- `packages/protocol/tools/schema-registry.ts` — add new sub-schemas to EXCLUDED_SCHEMAS
- `apps/worker/services/analytics.ts` — add 3 new service methods
- `apps/worker/routes/analytics.ts` — add 3 new route handlers
- `apps/worker/__tests__/unit/analytics.test.ts` — unit tests for new methods

### Desktop (new + modify)
- `src/client/lib/query-client.ts` — QueryClient setup (new)
- `src/client/lib/queries/analytics.ts` — React Query hooks (new)
- `src/client/routes/__root.tsx` — add analytics nav link
- `src/client/routes/admin/analytics.tsx` — hub analytics page (new)
- `src/client/components/analytics/kpi-cards.tsx` — summary KPI cards (new)
- `src/client/components/analytics/call-volume-chart.tsx` — recharts stacked bar (new)
- `src/client/components/analytics/hourly-chart.tsx` — recharts horizontal bar (new)
- `src/client/components/analytics/conversation-chart.tsx` — channel breakdown bar chart (new)
- `src/client/components/analytics/shift-coverage.tsx` — weekly coverage grid (new)
- `src/client/components/analytics/user-stats-table.tsx` — sortable user table (new)
- `src/client/components/analytics/date-range-selector.tsx` — 7/30/custom toggle (new)
- `src/client/routes/index.tsx` — add personal stats card to dashboard

### iOS (new)
- `apps/ios/Sources/Services/AnalyticsService.swift` — API client
- `apps/ios/Sources/Views/Analytics/AnalyticsView.swift` — admin analytics screen
- `apps/ios/Sources/Views/Analytics/AnalyticsStatCards.swift` — dashboard stat cards
- `apps/ios/Sources/Views/Analytics/UserStatsListView.swift` — per-user activity list
- `apps/ios/Tests/LlamenosTests/AnalyticsServiceTests.swift` — unit tests
- `apps/ios/Tests/LlamenosUITests/AnalyticsUITests.swift` — XCUITests

### Android (new)
- `apps/android/app/src/main/kotlin/org/llamenos/app/api/AnalyticsRepository.kt` — API client
- `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreen.kt` — admin screen
- `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsStatCards.kt` — dashboard cards
- `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/UserStatsSection.kt` — per-user list
- `apps/android/app/src/test/kotlin/org/llamenos/app/api/AnalyticsRepositoryTest.kt` — unit tests
- `apps/android/app/src/androidTest/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreenTest.kt` — UI tests

### i18n (modify)
- `packages/i18n/locales/en.json` — add ~35 analytics keys
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — translations

### BDD (new)
- `packages/test-specs/features/admin/analytics.feature` — Gherkin scenarios
- `tests/steps/backend/analytics.steps.ts` — step definitions

### Playwright (new)
- `tests/analytics.spec.ts` — desktop E2E tests

---

## Task 1: Protocol Schemas — New Analytics Types

**Files:**
- Modify: `packages/protocol/schemas/analytics.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1: Add hourly distribution schemas**

Append to `packages/protocol/schemas/analytics.ts` before the `// --- Inferred types ---` section:

```typescript
// --- Hourly distribution ---

export const callHourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  count: z.number().int(),
})

export const hourlyDistributionResponseSchema = z.object({
  totalCalls: z.number().int(),
  buckets: z.array(callHourBucketSchema),
})

// --- Per-user stats ---

export const userStatEntrySchema = z.object({
  pubkey: z.string(),
  displayName: z.string().nullable(),
  callsAnswered: z.number().int(),
  avgDurationSeconds: z.number(),
  notesCreated: z.number().int(),
})

export const userStatsResponseSchema = z.object({
  users: z.array(userStatEntrySchema),
})

// --- Personal stats ---

export const personalStatsResponseSchema = z.object({
  callsToday: z.number().int(),
  callsThisPeriod: z.number().int(),
  avgDurationSeconds: z.number(),
  notesCreatedThisPeriod: z.number().int(),
})
```

- [ ] **Step 2: Add inferred type exports**

Add below the existing type exports at the end of the file:

```typescript
export type HourlyDistributionResponse = z.infer<typeof hourlyDistributionResponseSchema>
export type UserStatsResponse = z.infer<typeof userStatsResponseSchema>
export type PersonalStatsResponse = z.infer<typeof personalStatsResponseSchema>
```

- [ ] **Step 3: Exclude sub-component schemas from codegen**

In `packages/protocol/tools/schema-registry.ts`, add to the `EXCLUDED_SCHEMAS` set:

```typescript
'callHourBucketSchema',
'userStatEntrySchema',
```

These are inlined in their parent response schemas and should not generate standalone types.

- [ ] **Step 4: Run codegen to verify schemas compile**

Run: `bun run codegen`
Expected: Clean exit, no errors. New types `HourlyDistributionResponse`, `UserStatsResponse`, `PersonalStatsResponse` generated for Swift/Kotlin.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/schemas/analytics.ts packages/protocol/tools/schema-registry.ts
git commit -m "feat(protocol): add hourly distribution, user stats, and personal stats analytics schemas"
```

---

## Task 2: Backend Service — Hourly Distribution

**Files:**
- Modify: `apps/worker/services/analytics.ts`
- Modify: `apps/worker/__tests__/unit/analytics.test.ts`

- [ ] **Step 1: Write failing test for getHourlyDistribution**

Add to `apps/worker/__tests__/unit/analytics.test.ts`:

```typescript
describe('getHourlyDistribution', () => {
  it('returns 24 buckets with counts, filling zeros for missing hours', async () => {
    const { db, service } = setup()
    // Mock returns rows for hours 9, 10, 14 only
    db.$setSelectResults([
      [
        { hour: 9, count: 5 },
        { hour: 10, count: 12 },
        { hour: 14, count: 3 },
      ],
    ])
    const result = await service.getHourlyDistribution('hub-1', {
      from: new Date('2026-05-01'),
      to: new Date('2026-05-07'),
    })
    expect(result.buckets).toHaveLength(24)
    expect(result.buckets[9]).toEqual({ hour: 9, count: 5 })
    expect(result.buckets[10]).toEqual({ hour: 10, count: 12 })
    expect(result.buckets[0]).toEqual({ hour: 0, count: 0 })
    expect(result.totalCalls).toBe(20)
  })

  it('aggregates across hubs when hubId is undefined', async () => {
    const { db, service } = setup()
    db.$setSelectResults([[{ hour: 12, count: 8 }]])
    const result = await service.getHourlyDistribution(undefined, {
      from: new Date('2026-05-01'),
      to: new Date('2026-05-07'),
    })
    expect(result.buckets[12]).toEqual({ hour: 12, count: 8 })
    expect(result.totalCalls).toBe(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/worker && bun test __tests__/unit/analytics.test.ts`
Expected: FAIL — `service.getHourlyDistribution is not a function`

- [ ] **Step 3: Implement getHourlyDistribution**

Add to the `AnalyticsService` class in `apps/worker/services/analytics.ts`, after the `getCallMetrics` section:

```typescript
// =========================================================================
// Hourly Distribution
// =========================================================================

async getHourlyDistribution(
  hubId: string | undefined,
  range?: Partial<DateRange>,
): Promise<{
  totalCalls: number
  buckets: Array<{ hour: number; count: number }>
}> {
  const { from, to } = { ...defaultRange(), ...range }

  const rows = await this.db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${callRecords.startedAt})::int`,
      count: count(),
    })
    .from(callRecords)
    .where(
      and(
        hubId ? eq(callRecords.hubId, hubId) : undefined,
        gte(callRecords.startedAt, from),
        lte(callRecords.startedAt, to),
      ),
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${callRecords.startedAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${callRecords.startedAt})`)

  const hourMap = new Map(rows.map((r) => [r.hour, r.count]))
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourMap.get(hour) ?? 0,
  }))
  const totalCalls = rows.reduce((sum, r) => sum + r.count, 0)

  return { totalCalls, buckets }
}
```

Also update the method signature type. Add the import for the `notes` table at the top of the file (will be needed in Task 3):

```typescript
import { activeCalls, callRecords, conversations, shifts, users } from '../db/schema'
```

Change to:

```typescript
import { activeCalls, callRecords, conversations, notes, shifts, users } from '../db/schema'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/worker && bun test __tests__/unit/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/services/analytics.ts apps/worker/__tests__/unit/analytics.test.ts
git commit -m "feat(analytics): add hourly call distribution service method with unit tests"
```

---

## Task 3: Backend Service — Per-User Stats

**Files:**
- Modify: `apps/worker/services/analytics.ts`
- Modify: `apps/worker/__tests__/unit/analytics.test.ts`

- [ ] **Step 1: Write failing test for getUserStats**

Add to the test file:

```typescript
describe('getUserStats', () => {
  it('returns per-user stats sorted by calls answered desc', async () => {
    const { db, service } = setup()
    // First query: call stats joined with users
    // Second query: notes count
    db.$setSelectResults([
      [
        { pubkey: 'pk-alice', displayName: 'Alice', callsAnswered: 15, avgDuration: 180 },
        { pubkey: 'pk-bob', displayName: 'Bob', callsAnswered: 8, avgDuration: 120 },
      ],
      [
        { authorPubkey: 'pk-alice', notesCount: 10 },
        { authorPubkey: 'pk-bob', notesCount: 3 },
      ],
    ])
    const result = await service.getUserStats('hub-1', {
      from: new Date('2026-05-01'),
      to: new Date('2026-05-07'),
    })
    expect(result.users).toHaveLength(2)
    expect(result.users[0]).toEqual({
      pubkey: 'pk-alice',
      displayName: 'Alice',
      callsAnswered: 15,
      avgDurationSeconds: 180,
      notesCreated: 10,
    })
    expect(result.users[1].callsAnswered).toBe(8)
  })

  it('handles users with no notes', async () => {
    const { db, service } = setup()
    db.$setSelectResults([
      [{ pubkey: 'pk-carol', displayName: null, callsAnswered: 5, avgDuration: 90 }],
      [], // no notes
    ])
    const result = await service.getUserStats('hub-1', {
      from: new Date('2026-05-01'),
      to: new Date('2026-05-07'),
    })
    expect(result.users[0].notesCreated).toBe(0)
    expect(result.users[0].displayName).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/worker && bun test __tests__/unit/analytics.test.ts`
Expected: FAIL — `service.getUserStats is not a function`

- [ ] **Step 3: Implement getUserStats**

Add to `AnalyticsService` class in `apps/worker/services/analytics.ts`:

```typescript
// =========================================================================
// Per-User Stats
// =========================================================================

async getUserStats(
  hubId: string | undefined,
  range?: Partial<DateRange>,
): Promise<{
  users: Array<{
    pubkey: string
    displayName: string | null
    callsAnswered: number
    avgDurationSeconds: number
    notesCreated: number
  }>
}> {
  const { from, to } = { ...defaultRange(), ...range }

  // Call stats: count answered calls + avg duration per user
  const callStats = await this.db
    .select({
      pubkey: callRecords.answeredByPubkey,
      displayName: users.displayName,
      callsAnswered: count(),
      avgDuration: sql<number>`COALESCE(AVG(${callRecords.duration}), 0)`.mapWith(Number),
    })
    .from(callRecords)
    .leftJoin(users, eq(callRecords.answeredByPubkey, users.pubkey))
    .where(
      and(
        hubId ? eq(callRecords.hubId, hubId) : undefined,
        eq(callRecords.status, 'completed'),
        gte(callRecords.startedAt, from),
        lte(callRecords.startedAt, to),
        sql`${callRecords.answeredByPubkey} IS NOT NULL`,
      ),
    )
    .groupBy(callRecords.answeredByPubkey, users.displayName)
    .orderBy(sql`COUNT(*) DESC`)

  // Notes count per user in the same date range
  const noteCounts = await this.db
    .select({
      authorPubkey: notes.authorPubkey,
      notesCount: count(),
    })
    .from(notes)
    .where(
      and(
        hubId ? eq(notes.hubId, hubId) : undefined,
        gte(notes.createdAt, from),
        lte(notes.createdAt, to),
      ),
    )
    .groupBy(notes.authorPubkey)

  const noteMap = new Map(noteCounts.map((n) => [n.authorPubkey, n.notesCount]))

  return {
    users: callStats.map((row) => ({
      pubkey: row.pubkey!,
      displayName: row.displayName ?? null,
      callsAnswered: row.callsAnswered,
      avgDurationSeconds: Math.round(row.avgDuration),
      notesCreated: noteMap.get(row.pubkey!) ?? 0,
    })),
  }
}
```

Note: This requires `callRecords` to have an `answeredByPubkey` column. Check the schema — if the column is named differently (e.g., `answeredBy` or stored in a different table), adjust accordingly. The `notes` import was added in Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/worker && bun test __tests__/unit/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/services/analytics.ts apps/worker/__tests__/unit/analytics.test.ts
git commit -m "feat(analytics): add per-user call stats service method with unit tests"
```

---

## Task 4: Backend Service — Personal Stats

**Files:**
- Modify: `apps/worker/services/analytics.ts`
- Modify: `apps/worker/__tests__/unit/analytics.test.ts`

- [ ] **Step 1: Write failing test for getPersonalStats**

```typescript
describe('getPersonalStats', () => {
  it('returns personal stats for a single user', async () => {
    const { db, service } = setup()
    // Calls today, calls in period, notes in period
    db.$setSelectResults([
      [{ callsToday: 3 }],
      [{ callsInPeriod: 25, avgDuration: 210 }],
      [{ notesCount: 12 }],
    ])
    const result = await service.getPersonalStats('hub-1', 'pk-alice', {
      from: new Date('2026-05-01'),
      to: new Date('2026-05-07'),
    })
    expect(result).toEqual({
      callsToday: 3,
      callsThisPeriod: 25,
      avgDurationSeconds: 210,
      notesCreatedThisPeriod: 12,
    })
  })

  it('returns zeros when user has no activity', async () => {
    const { db, service } = setup()
    db.$setSelectResults([
      [{ callsToday: 0 }],
      [{ callsInPeriod: 0, avgDuration: 0 }],
      [{ notesCount: 0 }],
    ])
    const result = await service.getPersonalStats('hub-1', 'pk-newuser')
    expect(result.callsToday).toBe(0)
    expect(result.callsThisPeriod).toBe(0)
    expect(result.notesCreatedThisPeriod).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/worker && bun test __tests__/unit/analytics.test.ts`
Expected: FAIL — `service.getPersonalStats is not a function`

- [ ] **Step 3: Implement getPersonalStats**

Add to `AnalyticsService` class:

```typescript
// =========================================================================
// Personal Stats
// =========================================================================

async getPersonalStats(
  hubId: string,
  userPubkey: string,
  range?: Partial<DateRange>,
): Promise<{
  callsToday: number
  callsThisPeriod: number
  avgDurationSeconds: number
  notesCreatedThisPeriod: number
}> {
  const { from, to } = { ...defaultRange(), ...range }

  // Calls today — always uses today's date regardless of range
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [todayRow] = await this.db
    .select({ callsToday: count() })
    .from(callRecords)
    .where(
      and(
        eq(callRecords.hubId, hubId),
        eq(callRecords.answeredByPubkey, userPubkey),
        eq(callRecords.status, 'completed'),
        gte(callRecords.startedAt, todayStart),
      ),
    )

  // Calls + avg duration in the requested date range
  const [periodRow] = await this.db
    .select({
      callsInPeriod: count(),
      avgDuration: sql<number>`COALESCE(AVG(${callRecords.duration}), 0)`.mapWith(Number),
    })
    .from(callRecords)
    .where(
      and(
        eq(callRecords.hubId, hubId),
        eq(callRecords.answeredByPubkey, userPubkey),
        eq(callRecords.status, 'completed'),
        gte(callRecords.startedAt, from),
        lte(callRecords.startedAt, to),
      ),
    )

  // Notes in the requested date range
  const [notesRow] = await this.db
    .select({ notesCount: count() })
    .from(notes)
    .where(
      and(
        eq(notes.hubId, hubId),
        eq(notes.authorPubkey, userPubkey),
        gte(notes.createdAt, from),
        lte(notes.createdAt, to),
      ),
    )

  return {
    callsToday: todayRow?.callsToday ?? 0,
    callsThisPeriod: periodRow?.callsInPeriod ?? 0,
    avgDurationSeconds: Math.round(periodRow?.avgDuration ?? 0),
    notesCreatedThisPeriod: notesRow?.notesCount ?? 0,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/worker && bun test __tests__/unit/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/services/analytics.ts apps/worker/__tests__/unit/analytics.test.ts
git commit -m "feat(analytics): add personal stats service method with unit tests"
```

---

## Task 5: Backend Routes — Wire New Endpoints

**Files:**
- Modify: `apps/worker/routes/analytics.ts`

- [ ] **Step 1: Add schema imports**

Update the import block in `apps/worker/routes/analytics.ts`:

```typescript
import {
  analyticsDateRangeQuerySchema,
  callMetricsResponseSchema,
  conversationMetricsResponseSchema,
  shiftMetricsResponseSchema,
  analyticsSystemHealthResponseSchema,
  hourlyDistributionResponseSchema,
  userStatsResponseSchema,
  personalStatsResponseSchema,
} from '@protocol/schemas/analytics'
```

- [ ] **Step 2: Add GET /hours endpoint**

Append before `export default analytics`:

```typescript
// ── GET /api/analytics/hours ──

analytics.get(
  '/hours',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Hourly call distribution (24 buckets)',
    responses: {
      200: {
        description: 'Call counts grouped by hour of day',
        content: { 'application/json': { schema: resolver(hourlyDistributionResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', analyticsDateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? undefined
    const service = await getAnalyticsService()
    const range = parseDateRange(c.req.valid('query'))
    return c.json(await service.getHourlyDistribution(hubId, range))
  },
)
```

- [ ] **Step 3: Add GET /users endpoint**

```typescript
// ── GET /api/analytics/users ──

analytics.get(
  '/users',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Per-user call and note statistics',
    responses: {
      200: {
        description: 'User activity stats sorted by calls answered',
        content: { 'application/json': { schema: resolver(userStatsResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('audit:read'),
  validator('query', analyticsDateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? undefined
    const service = await getAnalyticsService()
    const range = parseDateRange(c.req.valid('query'))
    return c.json(await service.getUserStats(hubId, range))
  },
)
```

- [ ] **Step 4: Add GET /me/stats endpoint**

This one is different — it uses the authenticated user's pubkey, not admin permission. It needs to be mounted on a separate router or added to an existing user-scoped router.

Add a new route file or add to analytics router with different permission:

```typescript
// ── GET /api/analytics/me ──

analytics.get(
  '/me',
  describeRoute({
    tags: ['Analytics'],
    summary: 'Personal call and note stats for the authenticated user',
    responses: {
      200: {
        description: 'Personal activity stats',
        content: { 'application/json': { schema: resolver(personalStatsResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  // No requirePermission — any authenticated user can access their own stats
  validator('query', analyticsDateRangeQuerySchema),
  async (c) => {
    const hubId = c.get('hubId') ?? ''
    const userPubkey = c.get('pubkey') ?? ''
    const service = await getAnalyticsService()
    const range = parseDateRange(c.req.valid('query'))
    return c.json(await service.getPersonalStats(hubId, userPubkey, range))
  },
)
```

Note: The `/me` endpoint must be placed BEFORE any `/:param` routes to avoid being captured as a parameter. Since analytics routes don't use path params, ordering doesn't matter here — but verify the mount order.

- [ ] **Step 5: Fix existing route handlers to pass undefined for platform scope**

The existing handlers use `c.get('hubId') ?? ''` which passes an empty string. Update all handlers (calls, conversations, shifts, health, and the new ones) to use `c.get('hubId') ?? undefined` so platform-scope requests correctly aggregate across all hubs.

Replace in all existing handlers:
```typescript
const hubId = c.get('hubId') ?? ''
```
with:
```typescript
const hubId = c.get('hubId') ?? undefined
```

The service methods already accept `hubId: string | undefined` and conditionally apply the hub filter.

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 7: Commit**

```bash
git add apps/worker/routes/analytics.ts
git commit -m "feat(analytics): add hourly, user stats, and personal stats endpoints"
```

---

## Task 6: i18n — Analytics Keys

**Files:**
- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`

- [ ] **Step 1: Add English analytics keys**

Add the `analytics` namespace to `packages/i18n/locales/en.json`. Find the appropriate alphabetical position (after `admin` section, before `auth` or `bans`):

```json
"analytics": {
  "title": "Analytics",
  "description": "Call activity, messaging, and team performance metrics.",
  "nav": "Analytics",
  "dateRange": {
    "7days": "7 days",
    "30days": "30 days",
    "custom": "Custom",
    "from": "From",
    "to": "To"
  },
  "summary": {
    "totalCalls": "Total Calls",
    "answerRate": "Answer Rate",
    "avgDuration": "Avg Duration",
    "totalConversations": "Total Conversations"
  },
  "callVolume": {
    "title": "Call Volume",
    "answered": "Answered",
    "unanswered": "Unanswered",
    "abandoned": "Abandoned",
    "noData": "No call data for this range."
  },
  "hours": {
    "title": "Calls by Hour",
    "noData": "No hourly data available."
  },
  "conversations": {
    "title": "Conversations",
    "byChannel": "By Channel",
    "avgResponseTime": "Avg Response Time",
    "avgMessages": "Avg Messages",
    "noData": "No conversation data available."
  },
  "shifts": {
    "title": "Shift Coverage",
    "coverage": "Coverage",
    "covered": "Covered",
    "uncovered": "Uncovered",
    "noData": "No shift data available."
  },
  "users": {
    "title": "Volunteer Activity",
    "name": "Name",
    "callsAnswered": "Calls Answered",
    "avgDuration": "Avg Duration",
    "notesCreated": "Notes Created",
    "noData": "No volunteer activity recorded."
  },
  "personal": {
    "callsToday": "Calls Today",
    "callsThisPeriod": "Calls This Period",
    "avgDuration": "Avg Duration",
    "notesCreated": "Notes Created"
  },
  "platform": {
    "title": "Platform Analytics",
    "description": "Cross-hub aggregated metrics.",
    "crossHub": "All Hubs"
  }
}
```

- [ ] **Step 2: Add translations to all 12 non-English locales**

Add the `analytics` namespace to each of the 12 locale files with appropriate translations. Use the same key structure as English. For each locale, translate the user-facing strings. Example for Spanish (`es.json`):

```json
"analytics": {
  "title": "Analíticas",
  "description": "Actividad de llamadas, mensajería y métricas de equipo.",
  "nav": "Analíticas",
  "dateRange": {
    "7days": "7 días",
    "30days": "30 días",
    "custom": "Personalizado",
    "from": "Desde",
    "to": "Hasta"
  },
  "summary": {
    "totalCalls": "Total de Llamadas",
    "answerRate": "Tasa de Respuesta",
    "avgDuration": "Duración Promedio",
    "totalConversations": "Total de Conversaciones"
  },
  "callVolume": {
    "title": "Volumen de Llamadas",
    "answered": "Contestadas",
    "unanswered": "Sin contestar",
    "abandoned": "Abandonadas",
    "noData": "No hay datos de llamadas para este rango."
  },
  "hours": {
    "title": "Llamadas por Hora",
    "noData": "No hay datos por hora disponibles."
  },
  "conversations": {
    "title": "Conversaciones",
    "byChannel": "Por Canal",
    "avgResponseTime": "Tiempo Promedio de Respuesta",
    "avgMessages": "Promedio de Mensajes",
    "noData": "No hay datos de conversaciones disponibles."
  },
  "shifts": {
    "title": "Cobertura de Turnos",
    "coverage": "Cobertura",
    "covered": "Cubierto",
    "uncovered": "Sin cubrir",
    "noData": "No hay datos de turnos disponibles."
  },
  "users": {
    "title": "Actividad de Voluntarios",
    "name": "Nombre",
    "callsAnswered": "Llamadas Contestadas",
    "avgDuration": "Duración Promedio",
    "notesCreated": "Notas Creadas",
    "noData": "No se registró actividad de voluntarios."
  },
  "personal": {
    "callsToday": "Llamadas Hoy",
    "callsThisPeriod": "Llamadas Este Período",
    "avgDuration": "Duración Promedio",
    "notesCreated": "Notas Creadas"
  },
  "platform": {
    "title": "Analíticas de Plataforma",
    "description": "Métricas agregadas de todos los centros.",
    "crossHub": "Todos los Centros"
  }
}
```

Repeat for all 12 locales (es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de).

- [ ] **Step 3: Run i18n codegen and validation**

Run: `bun run i18n:codegen && bun run i18n:validate`
Expected: Clean exit, all locales pass validation, iOS .strings + Android strings.xml + Kotlin I18n.kt regenerated.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add analytics keys to all 13 locales"
```

---

## Task 7: Desktop — React Query Setup

**Files:**
- Create: `src/client/lib/query-client.ts`
- Modify: `src/client/routes/__root.tsx`
- Modify: `package.json` (add dependency)

- [ ] **Step 1: Install @tanstack/react-query**

Run: `bun add @tanstack/react-query`

- [ ] **Step 2: Create QueryClient configuration**

Create `src/client/lib/query-client.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,       // 5 minutes
      gcTime: 10 * 60_000,         // 10 minutes (garbage collect)
      retry: 1,
      refetchOnWindowFocus: false,  // Tauri app, not a browser tab
    },
  },
})
```

- [ ] **Step 3: Wrap app root with QueryClientProvider**

In `src/client/routes/__root.tsx`, add imports:

```typescript
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
```

Wrap the root component's JSX return with `<QueryClientProvider client={queryClient}>...</QueryClientProvider>`. Find the outermost wrapper in the `RootComponent` function and wrap it:

```typescript
return (
  <QueryClientProvider client={queryClient}>
    {/* existing root layout JSX */}
  </QueryClientProvider>
)
```

- [ ] **Step 4: Add analytics nav link to admin section**

In the admin nav section of `__root.tsx` (after the system NavLink), add:

```typescript
<NavLink to="/admin/analytics" icon={<BarChart3 className="h-4 w-4" />}>{t('analytics.nav')}</NavLink>
```

Add the import for `BarChart3` to the existing Lucide import line:

```typescript
import { ..., BarChart3, ... } from 'lucide-react'
```

Note: No permission gate on the nav link — the route component itself checks `audit:read`. This keeps the nav simpler since `isAdmin` already gates the entire admin section.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 6: Commit**

```bash
git add src/client/lib/query-client.ts src/client/routes/__root.tsx package.json bun.lock
git commit -m "feat(desktop): add @tanstack/react-query with QueryClientProvider and analytics nav link"
```

---

## Task 8: Desktop — React Query Analytics Hooks

**Files:**
- Create: `src/client/lib/queries/analytics.ts`

- [ ] **Step 1: Create the analytics hooks file**

Create `src/client/lib/queries/analytics.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/api'
import type {
  CallMetricsResponse,
  ConversationMetricsResponse,
  ShiftMetricsResponse,
  AnalyticsSystemHealthResponse,
  HourlyDistributionResponse,
  UserStatsResponse,
  PersonalStatsResponse,
} from '@protocol/schemas/analytics'

// ── Types ──

export interface DateRange {
  from: string  // ISO datetime
  to: string    // ISO datetime
}

function dateRangeParams(range?: DateRange): string {
  if (!range) return ''
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// ── Query Keys ──

export const analyticsKeys = {
  callMetrics: (dateRange?: DateRange) => ['analytics', 'calls', dateRange] as const,
  conversationMetrics: (dateRange?: DateRange) => ['analytics', 'conversations', dateRange] as const,
  shiftMetrics: () => ['analytics', 'shifts'] as const,
  systemHealth: () => ['analytics', 'health'] as const,
  hourlyDistribution: (dateRange?: DateRange) => ['analytics', 'hours', dateRange] as const,
  userStats: (dateRange?: DateRange) => ['analytics', 'users', dateRange] as const,
  personal: () => ['analytics', 'personal'] as const,
  platform: {
    callMetrics: (dateRange?: DateRange) => ['analytics', 'platform', 'calls', dateRange] as const,
    conversationMetrics: (dateRange?: DateRange) => ['analytics', 'platform', 'conversations', dateRange] as const,
    hourlyDistribution: (dateRange?: DateRange) => ['analytics', 'platform', 'hours', dateRange] as const,
    userStats: (dateRange?: DateRange) => ['analytics', 'platform', 'users', dateRange] as const,
  },
} as const

// ── Hub-Scoped Hooks ──

export function useCallMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.callMetrics(dateRange),
    queryFn: () => request<CallMetricsResponse>(`/analytics/calls${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function useConversationMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.conversationMetrics(dateRange),
    queryFn: () => request<ConversationMetricsResponse>(`/analytics/conversations${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function useShiftMetrics(enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.shiftMetrics(),
    queryFn: () => request<ShiftMetricsResponse>('/analytics/shifts'),
    enabled,
  })
}

export function useSystemHealth(enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.systemHealth(),
    queryFn: () => request<AnalyticsSystemHealthResponse>('/analytics/health'),
    staleTime: 30_000, // 30s for real-time-ish health
    enabled,
  })
}

export function useHourlyDistribution(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.hourlyDistribution(dateRange),
    queryFn: () => request<HourlyDistributionResponse>(`/analytics/hours${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function useUserStats(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.userStats(dateRange),
    queryFn: () => request<UserStatsResponse>(`/analytics/users${dateRangeParams(dateRange)}`),
    enabled,
  })
}

// ── Personal Stats ──

export function usePersonalStats(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.personal(),
    queryFn: () => request<PersonalStatsResponse>('/analytics/me'),
    staleTime: 60_000, // 1 minute — "calls today" should feel current
    enabled,
  })
}

// ── Platform-Scoped Hooks (super-admin, cross-hub) ──
// These hit the same endpoints but without hub prefix.
// The API client's request() function automatically prefixes hub-scoped paths.
// Platform routes use a different base path — check how the API client handles this.
// If request() always prefixes with the active hub, you may need a separate
// platformRequest() or a flag to skip the hub prefix.

export function usePlatformCallMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.callMetrics(dateRange),
    queryFn: () => request<CallMetricsResponse>(`/analytics/calls${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function usePlatformConversationMetrics(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.conversationMetrics(dateRange),
    queryFn: () => request<ConversationMetricsResponse>(`/analytics/conversations${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function usePlatformHourlyDistribution(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.hourlyDistribution(dateRange),
    queryFn: () => request<HourlyDistributionResponse>(`/analytics/hours${dateRangeParams(dateRange)}`),
    enabled,
  })
}

export function usePlatformUserStats(dateRange?: DateRange, enabled = false) {
  return useQuery({
    queryKey: analyticsKeys.platform.userStats(dateRange),
    queryFn: () => request<UserStatsResponse>(`/analytics/users${dateRangeParams(dateRange)}`),
    enabled,
  })
}
```

Note: The platform hooks need investigation at implementation time — check how `request()` in `api.ts` handles hub-scoped vs platform-scoped paths. The `authenticated` router mounts analytics without a hub prefix, so platform requests must skip the hub ID injection. Look for existing patterns (e.g., `listHubs()` already calls a platform-scoped endpoint).

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/queries/analytics.ts
git commit -m "feat(desktop): add React Query hooks for all analytics endpoints"
```

---

## Task 9: Desktop — Analytics Page Components

**Files:**
- Create: `src/client/components/analytics/date-range-selector.tsx`
- Create: `src/client/components/analytics/kpi-cards.tsx`
- Create: `src/client/components/analytics/call-volume-chart.tsx`
- Create: `src/client/components/analytics/hourly-chart.tsx`
- Create: `src/client/components/analytics/conversation-chart.tsx`
- Create: `src/client/components/analytics/shift-coverage.tsx`
- Create: `src/client/components/analytics/user-stats-table.tsx`

This is the largest task. It creates the 7 component files that compose the analytics page.

- [ ] **Step 1: Install recharts**

Run: `bun add recharts`

- [ ] **Step 2: Create DateRangeSelector component**

Create `src/client/components/analytics/date-range-selector.tsx`:

```typescript
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DateRange } from '@/lib/queries/analytics'

type Preset = '7d' | '30d' | 'custom'

interface DateRangeSelectorProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
}

function daysAgo(days: number): DateRange {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  function selectPreset(p: Preset) {
    setPreset(p)
    if (p === '7d') onChange(daysAgo(7))
    else if (p === '30d') onChange(daysAgo(30))
  }

  function applyCustom() {
    if (customFrom && customTo) {
      onChange({
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo).toISOString(),
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="date-range-selector">
      <Button
        variant={preset === '7d' ? 'default' : 'outline'}
        size="sm"
        onClick={() => selectPreset('7d')}
      >
        {t('analytics.dateRange.7days')}
      </Button>
      <Button
        variant={preset === '30d' ? 'default' : 'outline'}
        size="sm"
        onClick={() => selectPreset('30d')}
      >
        {t('analytics.dateRange.30days')}
      </Button>
      <Button
        variant={preset === 'custom' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setPreset('custom')}
      >
        {t('analytics.dateRange.custom')}
      </Button>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-36"
          />
          <Button size="sm" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create KPI cards component**

Create `src/client/components/analytics/kpi-cards.tsx`:

```typescript
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Clock, MessageSquare, Percent } from 'lucide-react'
import type { CallMetricsResponse, ConversationMetricsResponse } from '@protocol/schemas/analytics'

interface KpiCardsProps {
  callMetrics?: CallMetricsResponse
  conversationMetrics?: ConversationMetricsResponse
  loading: boolean
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function KpiCards({ callMetrics, conversationMetrics, loading }: KpiCardsProps) {
  const { t } = useTranslation()

  const kpis = [
    {
      label: t('analytics.summary.totalCalls'),
      value: callMetrics?.totalCalls ?? 0,
      icon: Phone,
    },
    {
      label: t('analytics.summary.answerRate'),
      value: formatRate(callMetrics?.answerRate ?? 0),
      icon: Percent,
    },
    {
      label: t('analytics.summary.avgDuration'),
      value: formatDuration(callMetrics?.avgDurationSeconds ?? 0),
      icon: Clock,
    },
    {
      label: t('analytics.summary.totalConversations'),
      value: conversationMetrics?.totalConversations ?? 0,
      icon: MessageSquare,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="kpi-cards">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <kpi.icon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{loading ? '—' : kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create call volume chart**

Create `src/client/components/analytics/call-volume-chart.tsx`:

```typescript
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { CallMetricsResponse } from '@protocol/schemas/analytics'

interface CallVolumeChartProps {
  data?: CallMetricsResponse['byPeriod']
  loading: boolean
}

export function CallVolumeChart({ data, loading }: CallVolumeChartProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.length === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.callVolume.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.callVolume.noData')}</p></CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="call-volume-chart">
      <CardHeader><CardTitle>{t('analytics.callVolume.title')}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <XAxis
                dataKey="period"
                tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                fontSize={12}
              />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="answered" stackId="a" fill="#22c55e" name={t('analytics.callVolume.answered')} />
              <Bar dataKey="unanswered" stackId="a" fill="#f59e0b" name={t('analytics.callVolume.unanswered')} />
              <Bar dataKey="abandoned" stackId="a" fill="#ef4444" name={t('analytics.callVolume.abandoned')} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Create hourly distribution chart**

Create `src/client/components/analytics/hourly-chart.tsx`:

```typescript
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { HourlyDistributionResponse } from '@protocol/schemas/analytics'

interface HourlyChartProps {
  data?: HourlyDistributionResponse['buckets']
  loading: boolean
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

export function HourlyChart({ data, loading }: HourlyChartProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.every((b) => b.count === 0))) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.hours.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.hours.noData')}</p></CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="hourly-chart">
      <CardHeader><CardTitle>{t('analytics.hours.title')}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical">
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis
                type="category"
                dataKey="hour"
                tickFormatter={formatHour}
                fontSize={11}
                width={45}
              />
              <Tooltip labelFormatter={formatHour} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Create conversation metrics chart**

Create `src/client/components/analytics/conversation-chart.tsx`:

```typescript
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { ConversationMetricsResponse } from '@protocol/schemas/analytics'

interface ConversationChartProps {
  data?: ConversationMetricsResponse
  loading: boolean
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function ConversationChart({ data, loading }: ConversationChartProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.totalConversations === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.conversations.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.conversations.noData')}</p></CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="conversation-chart">
      <CardHeader><CardTitle>{t('analytics.conversations.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">{t('analytics.conversations.avgResponseTime')}: </span>
            <span className="font-medium">{formatSeconds(data?.avgResponseTimeSeconds ?? null)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('analytics.conversations.avgMessages')}: </span>
            <span className="font-medium">{data?.avgMessagesPerConversation ?? 0}</span>
          </div>
        </div>
        {loading ? (
          <div className="h-48 animate-pulse rounded bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.byChannel}>
              <XAxis dataKey="channel" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="messages" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Messages" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Create shift coverage component**

Create `src/client/components/analytics/shift-coverage.tsx`:

```typescript
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ShiftMetricsResponse } from '@protocol/schemas/analytics'

interface ShiftCoverageProps {
  data?: ShiftMetricsResponse
  loading: boolean
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ShiftCoverage({ data, loading }: ShiftCoverageProps) {
  const { t } = useTranslation()

  if (!loading && (!data || data.coverageSlots.length === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.shifts.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.shifts.noData')}</p></CardContent>
      </Card>
    )
  }

  // Group slots by day
  const slotsByDay = new Map<number, typeof data.coverageSlots>()
  for (const slot of data?.coverageSlots ?? []) {
    const existing = slotsByDay.get(slot.dayOfWeek) ?? []
    existing.push(slot)
    slotsByDay.set(slot.dayOfWeek, existing)
  }

  return (
    <Card data-testid="shift-coverage">
      <CardHeader>
        <CardTitle>{t('analytics.shifts.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {data?.weeklyHoursCovered ?? 0}h/week · {data?.totalVolunteersScheduled ?? 0} volunteers
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, dayIndex) => {
              const slots = slotsByDay.get(dayIndex) ?? []
              const covered = slots.some((s) => s.isCovered)
              return (
                <div key={dayIndex} className="text-center">
                  <p className="mb-1 text-xs font-medium">{label}</p>
                  <div
                    className={`rounded p-2 text-xs ${
                      slots.length === 0
                        ? 'bg-muted text-muted-foreground'
                        : covered
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {slots.length === 0
                      ? '—'
                      : slots.map((s) => `${s.startTime}–${s.endTime}`).join(', ')}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 8: Create user stats table**

Create `src/client/components/analytics/user-stats-table.tsx`:

```typescript
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { UserStatsResponse } from '@protocol/schemas/analytics'

interface UserStatsTableProps {
  data?: UserStatsResponse['users']
  loading: boolean
}

type SortKey = 'callsAnswered' | 'avgDurationSeconds' | 'notesCreated'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function UserStatsTable({ data, loading }: UserStatsTableProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>('callsAnswered')
  const [sortAsc, setSortAsc] = useState(false)

  if (!loading && (!data || data.length === 0)) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('analytics.users.title')}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{t('analytics.users.noData')}</p></CardContent>
      </Card>
    )
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortAsc ? diff : -diff
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortAsc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />
      : null

  return (
    <Card data-testid="user-stats-table">
      <CardHeader><CardTitle>{t('analytics.users.title')}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">{t('analytics.users.name')}</th>
                <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort('callsAnswered')}>
                  {t('analytics.users.callsAnswered')} <SortIcon col="callsAnswered" />
                </th>
                <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort('avgDurationSeconds')}>
                  {t('analytics.users.avgDuration')} <SortIcon col="avgDurationSeconds" />
                </th>
                <th className="cursor-pointer pb-2" onClick={() => toggleSort('notesCreated')}>
                  {t('analytics.users.notesCreated')} <SortIcon col="notesCreated" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((user) => (
                <tr key={user.pubkey} className="border-b last:border-0">
                  <td className="py-2 pr-4">{user.displayName ?? user.pubkey.slice(0, 12)}</td>
                  <td className="py-2 pr-4 font-medium">{user.callsAnswered}</td>
                  <td className="py-2 pr-4">{formatDuration(user.avgDurationSeconds)}</td>
                  <td className="py-2">{user.notesCreated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 9: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 10: Commit**

```bash
git add src/client/components/analytics/ package.json bun.lock
git commit -m "feat(desktop): add analytics chart and table components with recharts"
```

---

## Task 10: Desktop — Analytics Route Page

**Files:**
- Create: `src/client/routes/admin/analytics.tsx`

- [ ] **Step 1: Create the analytics page**

Create `src/client/routes/admin/analytics.tsx`:

```typescript
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import {
  useCallMetrics,
  useConversationMetrics,
  useShiftMetrics,
  useHourlyDistribution,
  useUserStats,
  type DateRange,
} from '@/lib/queries/analytics'
import { DateRangeSelector } from '@/components/analytics/date-range-selector'
import { KpiCards } from '@/components/analytics/kpi-cards'
import { CallVolumeChart } from '@/components/analytics/call-volume-chart'
import { HourlyChart } from '@/components/analytics/hourly-chart'
import { ConversationChart } from '@/components/analytics/conversation-chart'
import { ShiftCoverage } from '@/components/analytics/shift-coverage'
import { UserStatsTable } from '@/components/analytics/user-stats-table'

export const Route = createFileRoute('/admin/analytics')({
  component: AnalyticsPage,
})

function AnalyticsPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  // All queries enabled — page is only rendered when navigated to
  const enabled = hasPermission('audit:read')
  const callMetrics = useCallMetrics(dateRange, enabled)
  const conversationMetrics = useConversationMetrics(dateRange, enabled)
  const shiftMetrics = useShiftMetrics(enabled)
  const hourly = useHourlyDistribution(dateRange, enabled)
  const userStats = useUserStats(dateRange, enabled)

  if (!hasPermission('audit:read')) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('common.accessDenied')}
      </div>
    )
  }

  const loading = callMetrics.isLoading || conversationMetrics.isLoading

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" data-testid="page-title">{t('analytics.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('analytics.description')}</p>
        </div>
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      <KpiCards
        callMetrics={callMetrics.data}
        conversationMetrics={conversationMetrics.data}
        loading={loading}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CallVolumeChart
          data={callMetrics.data?.byPeriod}
          loading={callMetrics.isLoading}
        />
        <HourlyChart
          data={hourly.data?.buckets}
          loading={hourly.isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ConversationChart
          data={conversationMetrics.data}
          loading={conversationMetrics.isLoading}
        />
        <ShiftCoverage
          data={shiftMetrics.data}
          loading={shiftMetrics.isLoading}
        />
      </div>

      <UserStatsTable
        data={userStats.data?.users}
        loading={userStats.isLoading}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 3: Commit**

```bash
git add src/client/routes/admin/analytics.tsx
git commit -m "feat(desktop): add analytics admin page with all chart sections"
```

---

## Task 10b: Desktop — Platform Analytics Page (Super-Admin)

**Files:**
- Create: `src/client/routes/admin/platform-analytics.tsx`

The platform analytics page reuses all chart components from Task 9 but fetches data via the platform-scoped hooks (no hubId). Only super-admins see this page.

- [ ] **Step 1: Create the platform analytics route**

Create `src/client/routes/admin/platform-analytics.tsx` — same structure as `admin/analytics.tsx` but using `usePlatformCallMetrics`, `usePlatformConversationMetrics`, `usePlatformHourlyDistribution`, `usePlatformUserStats` from `@/lib/queries/analytics`. Add a heading showing `t('analytics.platform.title')` and `t('analytics.platform.crossHub')` badge. Gate with platform-level permission check.

```typescript
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import {
  usePlatformCallMetrics,
  usePlatformConversationMetrics,
  usePlatformHourlyDistribution,
  usePlatformUserStats,
  type DateRange,
} from '@/lib/queries/analytics'
import { DateRangeSelector } from '@/components/analytics/date-range-selector'
import { KpiCards } from '@/components/analytics/kpi-cards'
import { CallVolumeChart } from '@/components/analytics/call-volume-chart'
import { HourlyChart } from '@/components/analytics/hourly-chart'
import { ConversationChart } from '@/components/analytics/conversation-chart'
import { UserStatsTable } from '@/components/analytics/user-stats-table'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/admin/platform-analytics')({
  component: PlatformAnalyticsPage,
})

function PlatformAnalyticsPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const enabled = hasPermission('system:manage-hubs') // super-admin
  const callMetrics = usePlatformCallMetrics(dateRange, enabled)
  const conversationMetrics = usePlatformConversationMetrics(dateRange, enabled)
  const hourly = usePlatformHourlyDistribution(dateRange, enabled)
  const userStats = usePlatformUserStats(dateRange, enabled)

  if (!enabled) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('common.accessDenied')}
      </div>
    )
  }

  const loading = callMetrics.isLoading || conversationMetrics.isLoading

  return (
    <div className="space-y-6" data-testid="platform-analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{t('analytics.platform.title')}</h1>
          <Badge variant="outline">{t('analytics.platform.crossHub')}</Badge>
        </div>
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      <KpiCards callMetrics={callMetrics.data} conversationMetrics={conversationMetrics.data} loading={loading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CallVolumeChart data={callMetrics.data?.byPeriod} loading={callMetrics.isLoading} />
        <HourlyChart data={hourly.data?.buckets} loading={hourly.isLoading} />
      </div>

      <ConversationChart data={conversationMetrics.data} loading={conversationMetrics.isLoading} />
      <UserStatsTable data={userStats.data?.users} loading={userStats.isLoading} />
    </div>
  )
}
```

- [ ] **Step 2: Add platform analytics nav link in __root.tsx**

In the platform/super-admin nav section (near the hubs link), add:

```typescript
{hasPermission('system:manage-hubs') && (
  <NavLink to="/admin/platform-analytics" icon={<BarChart3 className="h-4 w-4" />}>
    {t('analytics.platform.title')}
  </NavLink>
)}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 4: Commit**

```bash
git add src/client/routes/admin/platform-analytics.tsx src/client/routes/__root.tsx
git commit -m "feat(desktop): add platform analytics page for super-admins"
```

---

## Task 11: Desktop — Dashboard Personal Stats Card

**Files:**
- Modify: `src/client/routes/index.tsx`

- [ ] **Step 1: Add personal stats to dashboard**

In `src/client/routes/index.tsx`, import the personal stats hook:

```typescript
import { usePersonalStats } from '@/lib/queries/analytics'
```

Inside the `DashboardPage` component, add the hook call:

```typescript
const personalStats = usePersonalStats(isAuthenticated)
```

Add a stats card section in the dashboard JSX. Find the appropriate location (near the existing "Calls Today" display if one exists, or after the shift status section):

```typescript
{personalStats.data && (
  <Card data-testid="personal-stats-card">
    <CardContent className="flex items-center gap-4 p-4">
      <div className="text-center">
        <p className="text-3xl font-bold">{personalStats.data.callsToday}</p>
        <p className="text-xs text-muted-foreground">{t('analytics.personal.callsToday')}</p>
      </div>
      <div className="h-8 border-l" />
      <div className="text-center">
        <p className="text-lg font-semibold">{personalStats.data.callsThisPeriod}</p>
        <p className="text-xs text-muted-foreground">{t('analytics.personal.callsThisPeriod')}</p>
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold">
          {Math.floor(personalStats.data.avgDurationSeconds / 60)}m {personalStats.data.avgDurationSeconds % 60}s
        </p>
        <p className="text-xs text-muted-foreground">{t('analytics.personal.avgDuration')}</p>
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold">{personalStats.data.notesCreatedThisPeriod}</p>
        <p className="text-xs text-muted-foreground">{t('analytics.personal.notesCreated')}</p>
      </div>
    </CardContent>
  </Card>
)}
```

Also import `Card` and `CardContent` if not already imported:

```typescript
import { Card, CardContent } from '@/components/ui/card'
```

- [ ] **Step 2: Remove existing callsToday useState/useEffect if present**

Check if the dashboard already has a manual `getCallsTodayCount()` fetch. If so, replace it with the `usePersonalStats` hook data. Remove the old `useState` for callsToday and the `useEffect` that fetches it — the React Query hook handles caching and refetching.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: Clean exit

- [ ] **Step 4: Commit**

```bash
git add src/client/routes/index.tsx
git commit -m "feat(desktop): add personal stats card to dashboard using React Query"
```

---

## Task 12: Backend BDD Tests

**Files:**
- Create: `packages/test-specs/features/admin/analytics.feature`
- Create: `tests/steps/backend/analytics.steps.ts`

- [ ] **Step 1: Create feature file**

Create `packages/test-specs/features/admin/analytics.feature`:

```gherkin
@backend
Feature: Analytics API
  As an admin
  I want to view analytics about call activity, volunteer performance, and messaging
  So that I can monitor hub operations and identify trends

  Scenario: Hub admin fetches hourly call distribution
    Given I am authenticated as a hub admin
    And the hub has call records across multiple hours
    When I fetch hourly distribution for the last 7 days
    Then I receive 24 hour buckets
    And the total across buckets matches the call count

  Scenario: Hub admin fetches per-user stats
    Given I am authenticated as a hub admin
    And volunteers have answered calls and created notes
    When I fetch user stats for the last 30 days
    Then users are sorted by calls answered descending
    And each user entry includes callsAnswered, avgDurationSeconds, and notesCreated

  Scenario: Authenticated user fetches personal stats
    Given I am authenticated as a volunteer
    And I have answered 3 calls today
    When I fetch my personal stats
    Then callsToday is 3
    And the response does not include other users' data

  Scenario: Non-admin user gets 403 on analytics endpoints
    Given I am authenticated as a volunteer without audit:read
    When I try to fetch call metrics
    Then I receive a 403 Forbidden response

  Scenario: Analytics date range filters results
    Given I am authenticated as a hub admin
    And there are calls from May 1 through May 10
    When I fetch call metrics from May 5 to May 7
    Then only calls within that range are included

  Scenario: Platform admin fetches cross-hub metrics
    Given I am authenticated as a platform admin
    And there are calls in hub-A and hub-B
    When I fetch platform-scoped call metrics
    Then the totals aggregate across both hubs
```

- [ ] **Step 2: Create step definitions**

Create `tests/steps/backend/analytics.steps.ts`:

```typescript
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'

interface AnalyticsState {
  response?: any
  statusCode?: number
}

const STATE_KEY = 'analytics'

function getAnalyticsState(world: Record<string, unknown>): AnalyticsState {
  return getState<AnalyticsState>(world, STATE_KEY)
}

Before({ tags: '@backend' }, async ({ world }) => {
  setState(world, STATE_KEY, {})
})

Given('the hub has call records across multiple hours', async ({ request, world }) => {
  // Insert test call records via API or direct DB setup
  // Implementation depends on test helper patterns — check fixtures.ts for createCallRecord helpers
})

When('I fetch hourly distribution for the last 7 days', async ({ request, world }) => {
  const from = new Date()
  from.setDate(from.getDate() - 7)
  const res = await request.get(`/api/analytics/hours?from=${from.toISOString()}`)
  const state = getAnalyticsState(world)
  state.statusCode = res.status()
  state.response = await res.json()
})

Then('I receive 24 hour buckets', async ({ world }) => {
  const { response } = getAnalyticsState(world)
  expect(response.buckets).toHaveLength(24)
  // Verify hours 0-23 are all present
  for (let i = 0; i < 24; i++) {
    expect(response.buckets[i].hour).toBe(i)
  }
})

Then('the total across buckets matches the call count', async ({ world }) => {
  const { response } = getAnalyticsState(world)
  const summedCount = response.buckets.reduce((sum: number, b: { count: number }) => sum + b.count, 0)
  expect(summedCount).toBe(response.totalCalls)
})

When('I fetch user stats for the last 30 days', async ({ request, world }) => {
  const res = await request.get('/api/analytics/users')
  const state = getAnalyticsState(world)
  state.statusCode = res.status()
  state.response = await res.json()
})

Then('users are sorted by calls answered descending', async ({ world }) => {
  const { response } = getAnalyticsState(world)
  const users = response.users
  for (let i = 1; i < users.length; i++) {
    expect(users[i - 1].callsAnswered).toBeGreaterThanOrEqual(users[i].callsAnswered)
  }
})

Then('each user entry includes callsAnswered, avgDurationSeconds, and notesCreated', async ({ world }) => {
  const { response } = getAnalyticsState(world)
  for (const user of response.users) {
    expect(user).toHaveProperty('callsAnswered')
    expect(user).toHaveProperty('avgDurationSeconds')
    expect(user).toHaveProperty('notesCreated')
  }
})

When('I fetch my personal stats', async ({ request, world }) => {
  const res = await request.get('/api/analytics/me')
  const state = getAnalyticsState(world)
  state.statusCode = res.status()
  state.response = await res.json()
})

Then('callsToday is {int}', async ({ world }, expected: number) => {
  const { response } = getAnalyticsState(world)
  expect(response.callsToday).toBe(expected)
})

When('I try to fetch call metrics', async ({ request, world }) => {
  const res = await request.get('/api/analytics/calls')
  const state = getAnalyticsState(world)
  state.statusCode = res.status()
})

Then('I receive a 403 Forbidden response', async ({ world }) => {
  const { statusCode } = getAnalyticsState(world)
  expect(statusCode).toBe(403)
})
```

Note: Some Given steps (setting up call records, volunteer data) depend on existing test helper functions. Check `tests/steps/backend/fixtures.ts` and `tests/api-helpers.ts` for available helpers. Implement the data setup steps using the same patterns as other feature files.

- [ ] **Step 3: Run BDD tests**

Run: `bun run test:backend:bdd -- --grep "Analytics"`
Expected: Scenarios pass (or identify needed test data helpers to implement)

- [ ] **Step 4: Commit**

```bash
git add packages/test-specs/features/admin/analytics.feature tests/steps/backend/analytics.steps.ts
git commit -m "test(backend): add BDD scenarios for analytics endpoints"
```

---

## Task 13: Desktop — Playwright E2E Tests

**Files:**
- Create: `tests/analytics.spec.ts`

- [ ] **Step 1: Create Playwright test file**

Create `tests/analytics.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Analytics', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    // Mock the analytics API responses
    await page.route('**/api/analytics/calls*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCalls: 150,
          answeredCalls: 120,
          unansweredCalls: 20,
          abandonedCalls: 10,
          answerRate: 0.8,
          avgDurationSeconds: 245,
          byPeriod: [
            { period: '2026-05-10', total: 30, answered: 25, unanswered: 3, abandoned: 2 },
            { period: '2026-05-11', total: 35, answered: 28, unanswered: 5, abandoned: 2 },
          ],
        }),
      })
    })

    await page.route('**/api/analytics/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalConversations: 45,
          activeConversations: 5,
          waitingConversations: 2,
          closedConversations: 38,
          totalMessages: 320,
          avgMessagesPerConversation: 7.1,
          avgResponseTimeSeconds: 90,
          byChannel: [
            { channel: 'sms', total: 20, active: 2, messages: 150 },
            { channel: 'whatsapp', total: 15, active: 2, messages: 100 },
            { channel: 'signal', total: 10, active: 1, messages: 70 },
          ],
        }),
      })
    })

    await page.route('**/api/analytics/shifts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalShifts: 5,
          totalVolunteersScheduled: 8,
          weeklyHoursCovered: 40,
          coverageSlots: [],
        }),
      })
    })

    await page.route('**/api/analytics/hours*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCalls: 150,
          buckets: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: i < 8 ? 2 : i < 20 ? 10 : 3 })),
        }),
      })
    })

    await page.route('**/api/analytics/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            { pubkey: 'pk-1', displayName: 'Alice', callsAnswered: 50, avgDurationSeconds: 300, notesCreated: 25 },
            { pubkey: 'pk-2', displayName: 'Bob', callsAnswered: 35, avgDurationSeconds: 180, notesCreated: 12 },
          ],
        }),
      })
    })

    await page.route('**/api/analytics/me*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          callsToday: 5,
          callsThisPeriod: 42,
          avgDurationSeconds: 210,
          notesCreatedThisPeriod: 18,
        }),
      })
    })
  })

  test('analytics page renders KPI cards and charts', async ({ page }) => {
    // Navigate requires admin auth — use storage state or login helper
    await page.goto('/admin/analytics')
    const analyticsPage = page.getByTestId('analytics-page')
    await expect(analyticsPage).toBeVisible({ timeout: 10000 })

    // KPI cards
    const kpiCards = page.getByTestId('kpi-cards')
    await expect(kpiCards).toBeVisible()
    await expect(kpiCards).toContainText('150')   // total calls
    await expect(kpiCards).toContainText('80%')   // answer rate

    // Charts
    await expect(page.getByTestId('call-volume-chart')).toBeVisible()
    await expect(page.getByTestId('hourly-chart')).toBeVisible()
    await expect(page.getByTestId('conversation-chart')).toBeVisible()
    await expect(page.getByTestId('shift-coverage')).toBeVisible()
    await expect(page.getByTestId('user-stats-table')).toBeVisible()
  })

  test('date range toggle refetches data', async ({ page }) => {
    await page.goto('/admin/analytics')
    await expect(page.getByTestId('analytics-page')).toBeVisible({ timeout: 10000 })

    const selector = page.getByTestId('date-range-selector')
    await selector.getByText('7 days').click()
    // Verify the button is active (has default variant)
    await expect(selector.getByText('7 days')).toHaveClass(/default/)
  })

  test('user stats table sorts by column', async ({ page }) => {
    await page.goto('/admin/analytics')
    await expect(page.getByTestId('user-stats-table')).toBeVisible({ timeout: 10000 })

    // Default sort: callsAnswered desc — Alice (50) first
    const firstRow = page.getByTestId('user-stats-table').locator('tbody tr').first()
    await expect(firstRow).toContainText('Alice')
    await expect(firstRow).toContainText('50')
  })

  test('dashboard shows personal stats card', async ({ page }) => {
    await page.goto('/')
    const statsCard = page.getByTestId('personal-stats-card')
    await expect(statsCard).toBeVisible({ timeout: 10000 })
    await expect(statsCard).toContainText('5')  // callsToday
  })
})
```

Note: These tests require admin auth. Check existing Playwright tests for how auth state is set up — likely via `storageState` or a `beforeAll` login flow. Adapt the `beforeEach` to include auth setup following the project's existing pattern.

- [ ] **Step 2: Run Playwright tests**

Run: `bun run test -- --grep "Analytics"`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/analytics.spec.ts
git commit -m "test(desktop): add Playwright E2E tests for analytics page"
```

---

## Task 14: iOS — Analytics Service and Views

**Files:**
- Create: `apps/ios/Sources/Services/AnalyticsService.swift`
- Create: `apps/ios/Sources/Views/Analytics/AnalyticsView.swift`
- Create: `apps/ios/Sources/Views/Analytics/AnalyticsStatCards.swift`
- Create: `apps/ios/Sources/Views/Analytics/UserStatsListView.swift`
- Create: `apps/ios/Tests/LlamenosTests/AnalyticsServiceTests.swift`
- Create: `apps/ios/Tests/LlamenosUITests/AnalyticsUITests.swift`

- [ ] **Step 1: Create AnalyticsService**

Create `apps/ios/Sources/Services/AnalyticsService.swift`:

```swift
import Foundation

@Observable
final class AnalyticsService {
    private let apiClient: APIClient

    var personalStats: PersonalStatsResponse?
    var callMetrics: CallMetricsResponse?
    var conversationMetrics: ConversationMetricsResponse?
    var hourlyDistribution: HourlyDistributionResponse?
    var userStats: UserStatsResponse?
    var shiftMetrics: ShiftMetricsResponse?
    var isLoading = false

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchPersonalStats() async throws {
        let response: PersonalStatsResponse = try await apiClient.get("/analytics/me")
        personalStats = response
    }

    func fetchCallMetrics(from: Date? = nil, to: Date? = nil) async throws {
        isLoading = true
        defer { isLoading = false }
        var params: [String: String] = [:]
        if let from { params["from"] = ISO8601DateFormatter().string(from: from) }
        if let to { params["to"] = ISO8601DateFormatter().string(from: to) }
        let response: CallMetricsResponse = try await apiClient.get("/analytics/calls", query: params)
        callMetrics = response
    }

    func fetchConversationMetrics(from: Date? = nil, to: Date? = nil) async throws {
        var params: [String: String] = [:]
        if let from { params["from"] = ISO8601DateFormatter().string(from: from) }
        if let to { params["to"] = ISO8601DateFormatter().string(from: to) }
        let response: ConversationMetricsResponse = try await apiClient.get("/analytics/conversations", query: params)
        conversationMetrics = response
    }

    func fetchUserStats(from: Date? = nil, to: Date? = nil) async throws {
        var params: [String: String] = [:]
        if let from { params["from"] = ISO8601DateFormatter().string(from: from) }
        if let to { params["to"] = ISO8601DateFormatter().string(from: to) }
        let response: UserStatsResponse = try await apiClient.get("/analytics/users", query: params)
        userStats = response
    }

    func fetchShiftMetrics() async throws {
        let response: ShiftMetricsResponse = try await apiClient.get("/analytics/shifts")
        shiftMetrics = response
    }

    func fetchAll(from: Date? = nil, to: Date? = nil) async {
        isLoading = true
        defer { isLoading = false }
        async let calls: () = fetchCallMetrics(from: from, to: to)
        async let convos: () = fetchConversationMetrics(from: from, to: to)
        async let users: () = fetchUserStats(from: from, to: to)
        async let shifts: () = fetchShiftMetrics()
        _ = try? await (calls, convos, users, shifts)
    }
}
```

Note: `APIClient`, response types (`PersonalStatsResponse`, `CallMetricsResponse`, etc.) should come from generated protocol types. Check existing iOS services for the exact API client pattern — adapt the `get()` method signature accordingly.

- [ ] **Step 2: Create AnalyticsStatCards (dashboard)**

Create `apps/ios/Sources/Views/Analytics/AnalyticsStatCards.swift`:

```swift
import SwiftUI

struct AnalyticsStatCards: View {
    let stats: PersonalStatsResponse?

    var body: some View {
        if let stats {
            HStack(spacing: 16) {
                StatCard(
                    value: "\(stats.callsToday)",
                    label: String(localized: "analytics.personal.callsToday")
                )
                StatCard(
                    value: formatRate(stats),
                    label: String(localized: "analytics.summary.avgDuration")
                )
                StatCard(
                    value: formatDuration(stats.avgDurationSeconds),
                    label: String(localized: "analytics.personal.avgDuration")
                )
            }
        }
    }

    private func formatDuration(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return m > 0 ? "\(m)m \(s)s" : "\(s)s"
    }

    private func formatRate(_ stats: PersonalStatsResponse) -> String {
        "\(stats.callsThisPeriod)"
    }
}

struct StatCard: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2.bold())
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 3: Create AnalyticsView (admin screen)**

Create `apps/ios/Sources/Views/Analytics/AnalyticsView.swift`:

```swift
import SwiftUI

struct AnalyticsView: View {
    @State private var service: AnalyticsService
    @State private var selectedRange: DateRangePreset = .thirtyDays

    enum DateRangePreset: String, CaseIterable {
        case sevenDays = "7d"
        case thirtyDays = "30d"

        var dateRange: (from: Date, to: Date) {
            let to = Date()
            let from: Date
            switch self {
            case .sevenDays: from = Calendar.current.date(byAdding: .day, value: -7, to: to)!
            case .thirtyDays: from = Calendar.current.date(byAdding: .day, value: -30, to: to)!
            }
            return (from, to)
        }

        var label: String {
            switch self {
            case .sevenDays: String(localized: "analytics.dateRange.7days")
            case .thirtyDays: String(localized: "analytics.dateRange.30days")
            }
        }
    }

    init(apiClient: APIClient) {
        _service = State(initialValue: AnalyticsService(apiClient: apiClient))
    }

    var body: some View {
        List {
            // Date range picker
            Section {
                Picker("Range", selection: $selectedRange) {
                    ForEach(DateRangePreset.allCases, id: \.self) { preset in
                        Text(preset.label).tag(preset)
                    }
                }
                .pickerStyle(.segmented)
            }

            // KPI Summary
            if let metrics = service.callMetrics {
                Section(String(localized: "analytics.title")) {
                    KPIRow(label: String(localized: "analytics.summary.totalCalls"), value: "\(metrics.totalCalls)")
                    KPIRow(label: String(localized: "analytics.summary.answerRate"), value: "\(Int(metrics.answerRate * 100))%")
                    KPIRow(label: String(localized: "analytics.summary.avgDuration"), value: formatDuration(metrics.avgDurationSeconds))
                }
            }

            // Conversation metrics
            if let convos = service.conversationMetrics {
                Section(String(localized: "analytics.conversations.title")) {
                    KPIRow(label: String(localized: "analytics.summary.totalConversations"), value: "\(convos.totalConversations)")
                    KPIRow(label: String(localized: "analytics.conversations.avgResponseTime"),
                           value: convos.avgResponseTimeSeconds.map { formatDuration(Int($0)) } ?? "—")
                    KPIRow(label: String(localized: "analytics.conversations.avgMessages"), value: "\(convos.avgMessagesPerConversation)")
                }
            }

            // Shift coverage
            if let shifts = service.shiftMetrics {
                Section(String(localized: "analytics.shifts.title")) {
                    KPIRow(label: String(localized: "analytics.shifts.coverage"), value: "\(shifts.weeklyHoursCovered)h/week")
                    KPIRow(label: "Volunteers", value: "\(shifts.totalVolunteersScheduled)")
                }
            }

            // Per-user activity
            if let users = service.userStats?.users, !users.isEmpty {
                Section(String(localized: "analytics.users.title")) {
                    UserStatsListView(users: users)
                }
            }
        }
        .navigationTitle(String(localized: "analytics.title"))
        .refreshable { await loadData() }
        .task { await loadData() }
        .onChange(of: selectedRange) { _, _ in Task { await loadData() } }
    }

    private func loadData() async {
        let range = selectedRange.dateRange
        await service.fetchAll(from: range.from, to: range.to)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return m > 0 ? "\(m)m \(s)s" : "\(s)s"
    }
}

private struct KPIRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
        }
    }
}
```

- [ ] **Step 4: Create UserStatsListView**

Create `apps/ios/Sources/Views/Analytics/UserStatsListView.swift`:

```swift
import SwiftUI

struct UserStatsListView: View {
    let users: [UserStatEntry]

    var body: some View {
        ForEach(users, id: \.pubkey) { user in
            VStack(alignment: .leading, spacing: 4) {
                Text(user.displayName ?? String(user.pubkey.prefix(12)))
                    .fontWeight(.medium)
                HStack(spacing: 16) {
                    Label("\(user.callsAnswered)", systemImage: "phone.fill")
                    Label(formatDuration(user.avgDurationSeconds), systemImage: "clock")
                    Label("\(user.notesCreated)", systemImage: "note.text")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }

    private func formatDuration(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return m > 0 ? "\(m)m \(s)s" : "\(s)s"
    }
}
```

- [ ] **Step 5: Write unit tests**

Create `apps/ios/Tests/LlamenosTests/AnalyticsServiceTests.swift`:

```swift
import XCTest
@testable import Llamenos

final class AnalyticsServiceTests: XCTestCase {
    func testFormatDuration() {
        // Test the duration formatting utility
        XCTAssertEqual(formatDuration(0), "0s")
        XCTAssertEqual(formatDuration(45), "45s")
        XCTAssertEqual(formatDuration(125), "2m 5s")
        XCTAssertEqual(formatDuration(3600), "60m 0s")
    }

    func testPersonalStatsDecoding() throws {
        let json = """
        {"callsToday":3,"callsThisPeriod":25,"avgDurationSeconds":210,"notesCreatedThisPeriod":12}
        """.data(using: .utf8)!
        let stats = try JSONDecoder().decode(PersonalStatsResponse.self, from: json)
        XCTAssertEqual(stats.callsToday, 3)
        XCTAssertEqual(stats.callsThisPeriod, 25)
        XCTAssertEqual(stats.avgDurationSeconds, 210)
        XCTAssertEqual(stats.notesCreatedThisPeriod, 12)
    }

    func testCallMetricsDecoding() throws {
        let json = """
        {"totalCalls":100,"answeredCalls":80,"unansweredCalls":15,"abandonedCalls":5,"answerRate":0.8,"avgDurationSeconds":200,"byPeriod":[]}
        """.data(using: .utf8)!
        let metrics = try JSONDecoder().decode(CallMetricsResponse.self, from: json)
        XCTAssertEqual(metrics.totalCalls, 100)
        XCTAssertEqual(metrics.answerRate, 0.8)
    }
}

private func formatDuration(_ seconds: Int) -> String {
    let m = seconds / 60
    let s = seconds % 60
    return m > 0 ? "\(m)m \(s)s" : "\(s)s"
}
```

- [ ] **Step 6: Write XCUITests**

Create `apps/ios/Tests/LlamenosUITests/AnalyticsUITests.swift`:

```swift
import XCTest

final class AnalyticsUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launch()
        // Login as admin — follow existing XCUITest login pattern
    }

    func testDashboardStatCardsRender() {
        // Verify stat cards appear on the dashboard
        XCTAssertTrue(app.staticTexts["analytics.personal.callsToday"].waitForExistence(timeout: 10))
    }

    func testAnalyticsScreenShowsKPIs() {
        // Navigate to analytics
        app.buttons["analytics.nav"].tap()
        XCTAssertTrue(app.staticTexts["analytics.title"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["analytics.summary.totalCalls"].exists)
        XCTAssertTrue(app.staticTexts["analytics.summary.answerRate"].exists)
    }

    func testDateRangeSegmentControl() {
        app.buttons["analytics.nav"].tap()
        XCTAssertTrue(app.staticTexts["analytics.title"].waitForExistence(timeout: 10))
        // Tap 7 days segment
        app.buttons["analytics.dateRange.7days"].tap()
        // Verify data refreshes (KPIs still visible)
        XCTAssertTrue(app.staticTexts["analytics.summary.totalCalls"].exists)
    }
}
```

Note: Adapt the navigation and login patterns to match the existing iOS XCUITest infrastructure.

- [ ] **Step 7: Run iOS tests**

Run: `bun run ios:test`
Expected: Unit tests pass. UI tests pass on simulator.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Sources/Services/AnalyticsService.swift apps/ios/Sources/Views/Analytics/ apps/ios/Tests/
git commit -m "feat(ios): add analytics service, views, and tests"
```

---

## Task 15: Android — Analytics Repository and Screens

**Files:**
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/api/AnalyticsRepository.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreen.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsStatCards.kt`
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/UserStatsSection.kt`
- Create: `apps/android/app/src/test/kotlin/org/llamenos/app/api/AnalyticsRepositoryTest.kt`
- Create: `apps/android/app/src/androidTest/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreenTest.kt`

- [ ] **Step 1: Create AnalyticsRepository**

Create `apps/android/app/src/main/kotlin/org/llamenos/app/api/AnalyticsRepository.kt`:

```kotlin
package org.llamenos.app.api

import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AnalyticsRepository @Inject constructor(
    private val apiClient: ApiClient,
) {
    suspend fun getPersonalStats(): PersonalStatsResponse =
        apiClient.get("/analytics/me")

    suspend fun getCallMetrics(from: String? = null, to: String? = null): CallMetricsResponse =
        apiClient.get("/analytics/calls", buildDateQuery(from, to))

    suspend fun getConversationMetrics(from: String? = null, to: String? = null): ConversationMetricsResponse =
        apiClient.get("/analytics/conversations", buildDateQuery(from, to))

    suspend fun getUserStats(from: String? = null, to: String? = null): UserStatsResponse =
        apiClient.get("/analytics/users", buildDateQuery(from, to))

    suspend fun getShiftMetrics(): ShiftMetricsResponse =
        apiClient.get("/analytics/shifts")

    private fun buildDateQuery(from: String?, to: String?): Map<String, String> =
        buildMap {
            from?.let { put("from", it) }
            to?.let { put("to", it) }
        }
}
```

Note: Adapt the `ApiClient` interface and response type names to match the existing Android API pattern. Generated types from codegen should be available as `@Serializable` data classes.

- [ ] **Step 2: Create AnalyticsStatCards (dashboard)**

Create `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsStatCards.kt`:

```kotlin
package org.llamenos.app.ui.analytics

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.llamenos.app.R
import org.llamenos.app.api.PersonalStatsResponse

@Composable
fun AnalyticsStatCards(
    stats: PersonalStatsResponse?,
    modifier: Modifier = Modifier,
) {
    if (stats == null) return

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StatCard(
            value = "${stats.callsToday}",
            label = stringResource(R.string.analytics_personal_callsToday),
            modifier = Modifier.weight(1f),
        )
        StatCard(
            value = "${stats.callsThisPeriod}",
            label = stringResource(R.string.analytics_personal_callsThisPeriod),
            modifier = Modifier.weight(1f),
        )
        StatCard(
            value = formatDuration(stats.avgDurationSeconds),
            label = stringResource(R.string.analytics_personal_avgDuration),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatCard(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    OutlinedCard(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}
```

- [ ] **Step 3: Create UserStatsSection**

Create `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/UserStatsSection.kt`:

```kotlin
package org.llamenos.app.ui.analytics

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.llamenos.app.api.UserStatEntry

@Composable
fun UserStatsSection(
    users: List<UserStatEntry>,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        users.forEach { user ->
            ListItem(
                headlineContent = {
                    Text(user.displayName ?: user.pubkey.take(12), fontWeight = FontWeight.Medium)
                },
                supportingContent = {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("${user.callsAnswered} calls")
                        Text(formatDuration(user.avgDurationSeconds))
                        Text("${user.notesCreated} notes")
                    }
                },
            )
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}
```

- [ ] **Step 4: Create AnalyticsScreen (admin)**

Create `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreen.kt`:

```kotlin
package org.llamenos.app.ui.analytics

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.app.R

enum class DateRangePreset(val days: Int, val labelRes: Int) {
    SEVEN_DAYS(7, R.string.analytics_dateRange_7days),
    THIRTY_DAYS(30, R.string.analytics_dateRange_30days),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(
    viewModel: AnalyticsViewModel = hiltViewModel(),
) {
    var selectedRange by remember { mutableStateOf(DateRangePreset.THIRTY_DAYS) }
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(selectedRange) {
        viewModel.loadAnalytics(selectedRange.days)
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.analytics_title)) })
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Date range chips
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DateRangePreset.entries.forEach { preset ->
                        FilterChip(
                            selected = selectedRange == preset,
                            onClick = { selectedRange = preset },
                            label = { Text(stringResource(preset.labelRes)) },
                        )
                    }
                }
            }

            // KPI cards
            uiState.callMetrics?.let { metrics ->
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        KpiCard(stringResource(R.string.analytics_summary_totalCalls), "${metrics.totalCalls}", Modifier.weight(1f))
                        KpiCard(stringResource(R.string.analytics_summary_answerRate), "${(metrics.answerRate * 100).toInt()}%", Modifier.weight(1f))
                    }
                }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        KpiCard(stringResource(R.string.analytics_summary_avgDuration), formatDuration(metrics.avgDurationSeconds), Modifier.weight(1f))
                        uiState.conversationMetrics?.let { convos ->
                            KpiCard(stringResource(R.string.analytics_summary_totalConversations), "${convos.totalConversations}", Modifier.weight(1f))
                        }
                    }
                }
            }

            // User stats
            uiState.userStats?.users?.takeIf { it.isNotEmpty() }?.let { users ->
                item {
                    Text(
                        stringResource(R.string.analytics_users_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
                item { UserStatsSection(users) }
            }
        }
    }
}

@Composable
private fun KpiCard(label: String, value: String, modifier: Modifier = Modifier) {
    ElevatedCard(modifier = modifier) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}
```

Note: This references an `AnalyticsViewModel` — create it as a Hilt `@HiltViewModel` that holds `AnalyticsRepository` and exposes `uiState: StateFlow<AnalyticsUiState>`. Follow the existing ViewModel pattern in the Android app.

- [ ] **Step 5: Write unit tests**

Create `apps/android/app/src/test/kotlin/org/llamenos/app/api/AnalyticsRepositoryTest.kt`:

```kotlin
package org.llamenos.app.api

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class AnalyticsRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `personal stats response decodes correctly`() {
        val raw = """{"callsToday":3,"callsThisPeriod":25,"avgDurationSeconds":210,"notesCreatedThisPeriod":12}"""
        val stats = json.decodeFromString<PersonalStatsResponse>(raw)
        assertEquals(3, stats.callsToday)
        assertEquals(25, stats.callsThisPeriod)
        assertEquals(210, stats.avgDurationSeconds)
        assertEquals(12, stats.notesCreatedThisPeriod)
    }

    @Test
    fun `call metrics response decodes correctly`() {
        val raw = """{"totalCalls":100,"answeredCalls":80,"unansweredCalls":15,"abandonedCalls":5,"answerRate":0.8,"avgDurationSeconds":200,"byPeriod":[]}"""
        val metrics = json.decodeFromString<CallMetricsResponse>(raw)
        assertEquals(100, metrics.totalCalls)
        assertEquals(0.8, metrics.answerRate, 0.01)
    }

    @Test
    fun `format duration handles minutes and seconds`() {
        assertEquals("0s", formatDuration(0))
        assertEquals("45s", formatDuration(45))
        assertEquals("2m 5s", formatDuration(125))
    }
}

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}m ${s}s" else "${s}s"
}
```

- [ ] **Step 6: Write Compose UI tests**

Create `apps/android/app/src/androidTest/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreenTest.kt`:

```kotlin
package org.llamenos.app.ui.analytics

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.llamenos.app.api.PersonalStatsResponse

class AnalyticsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun statCardsRenderWithData() {
        val stats = PersonalStatsResponse(
            callsToday = 5,
            callsThisPeriod = 42,
            avgDurationSeconds = 210,
            notesCreatedThisPeriod = 18,
        )
        composeTestRule.setContent {
            AnalyticsStatCards(stats = stats)
        }
        composeTestRule.onNodeWithText("5").assertIsDisplayed()
        composeTestRule.onNodeWithText("42").assertIsDisplayed()
        composeTestRule.onNodeWithText("3m 30s").assertIsDisplayed()
    }

    @Test
    fun statCardsHiddenWhenNull() {
        composeTestRule.setContent {
            AnalyticsStatCards(stats = null)
        }
        composeTestRule.onAllNodes(hasText("Calls")).assertCountEquals(0)
    }
}
```

- [ ] **Step 7: Run Android tests**

Run: `bun run test:android`
Expected: Unit tests and UI tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/android/app/src/main/kotlin/org/llamenos/app/api/AnalyticsRepository.kt \
  apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/ \
  apps/android/app/src/test/ apps/android/app/src/androidTest/
git commit -m "feat(android): add analytics repository, screens, and tests"
```

---

## Task 16: Update Epic Index

**Files:**
- Modify: `docs/superpowers/specs/2026-05-11-v1-port-epic-index.md`

- [ ] **Step 1: Update EP04 status**

Change EP04's row in the epic map table:

```markdown
| EP04 | [Analytics & Dashboards](2026-05-11-EP04-analytics-dashboards-design.md) | 3 | — | Specced + Planned |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-11-v1-port-epic-index.md
git commit -m "docs: update EP04 status to specced + planned in epic index"
```
