---
epic: EP04
title: Analytics & Dashboards
status: specced
depends-on: []
phase: 3
---

# Spec: EP04 — Analytics & Dashboards

**Date:** 2026-05-11 (specced 2026-05-12)
**Status:** Specced

---

## Goal

Complete the analytics pipeline end-to-end: fill backend gaps (hourly distribution, per-user stats, personal stats, platform-scope routes), build the desktop analytics UI (recharts-based charts ported from v1 + new v2 conversation/shift cards), add mobile stat cards (iOS + Android), and wire i18n across all 13 locales.

EP04 has **no dependencies** — all required backend infrastructure (routes, service, schemas, permissions) already exists. It can be implemented in parallel with any other epic.

---

## Architecture Decisions

### 1. Chart library: recharts

v1 uses recharts 3.x. Port it directly — mature, React-only, lightweight, renders fine in Tauri's webview. No reason to introduce d3-based alternatives for 3-4 chart types.

### 1b. Data fetching: introduce @tanstack/react-query

v2 currently uses `useState` + `useEffect` + direct API calls. v1 uses React Query with lazy-loading, staleTime, and query key invalidation. EP04 introduces `@tanstack/react-query` as a new dependency — analytics data is a natural fit for declarative caching (multiple independent queries, date range changes triggering refetches, lazy-load on section open). This sets a pattern other features can adopt incrementally.

**Cache invalidation strategy:**
- Query keys include `hubId` + `dateRange` — switching hubs or changing date range automatically refetches
- `staleTime: 5 * 60_000` (5 minutes) for all analytics queries — data doesn't change fast enough to warrant shorter windows
- Personal stats on the dashboard use `staleTime: 60_000` (1 minute) since "calls today" should feel current
- No optimistic updates — analytics is read-only
- `enabled` flag on all hooks — queries only fire when the analytics section is open (lazy-load pattern from v1)
- `QueryClientProvider` wraps the app root; `QueryClient` configured once in a new `src/client/lib/query-client.ts`

### 2. Real-time health: polling (30s staleTime)

The system health page already polls at 30s. WebSocket adds complexity for a dashboard admins check occasionally. Consistent with existing patterns (useShiftStatus uses 60s). Upgrade to WS push later if usage demands it.

### 3. Platform analytics: same routes, optional hubId

v1 pattern: mount the same router at both hub-scoped and global paths. v2 service methods already accept `hubId` as first param — passing `undefined` removes the hub filter. No code duplication.

### 4. Mobile: full admin analytics, no chart libraries

Hub admins need full mobile capabilities. Mobile admin analytics includes all KPI cards, conversation metrics, shift coverage data, per-user activity tables, and date range selection — everything desktop has except recharts visualizations (which only render in Tauri's webview). Non-admin users see personal stat cards on their dashboard. No Swift Charts or Vico dependencies — data is presented as cards, lists, and tables.

### 5. Date range: 7/30d toggle + custom picker

Port v1's 7/30 day toggle as primary UX. Add a "Custom" option revealing a date range picker — v2 backend already supports `from/to` ISO params.

### 6. No data export

CSV/PDF/file export is **permanently out of scope** — exporting decrypted analytics data to files creates data leakage vectors. Data stays within the app's controlled rendering context. This is a security constraint, not a deferral.

---

## Current State

### What Exists

**Backend (apps/worker/):**
- `routes/analytics.ts` — 4 hub-scoped endpoints: `/api/analytics/calls`, `/conversations`, `/shifts`, `/health`
- `services/analytics.ts` — AnalyticsService with Drizzle queries (call metrics, conversation metrics, shift metrics, system health)
- `__tests__/unit/analytics.test.ts` — unit tests for all 4 service methods
- `routes/metrics.ts` — Prometheus-compatible metrics export + JSON summary
- All endpoints gated by `audit:read` permission, support `?from=ISO&to=ISO` date range

**Protocol schemas (packages/protocol/schemas/analytics.ts):**
- `callMetricsResponseSchema` (totalCalls, answeredCalls, unansweredCalls, abandonedCalls, answerRate, avgDurationSeconds, byPeriod[])
- `conversationMetricsResponseSchema` (totals, avgResponseTimeSeconds, byChannel[])
- `shiftMetricsResponseSchema` (totalShifts, totalVolunteersScheduled, weeklyHoursCovered, coverageSlots[])
- `analyticsSystemHealthResponseSchema` (activeCallCount, waitingConversationCount, activeVolunteerCount, services[])
- `analyticsDateRangeQuerySchema` (from?, to?)

**Desktop client (src/client/):**
- System health page exists (`routes/admin/system.tsx`) — polls every 30s, shows 6 status cards
- Dashboard (`routes/index.tsx`) shows active calls, shift status, calls today
- No analytics section component
- No React Query hooks for analytics
- No chart library installed

**i18n:** No analytics-specific keys in packages/i18n (dashboard keys exist but cover shift/call status, not charts)

**iOS / Android:** No analytics views

### What Is Missing

1. **Backend: 3 new endpoints** — hourly distribution, per-user stats, personal stats
2. **Backend: platform-scope routes** — mount analytics without hub context for cross-hub aggregation
3. **Desktop: analytics section** — recharts-based charts (call volume, hourly distribution, per-user table, conversation metrics, shift coverage)
4. **Desktop: React Query hooks** — lazy-loaded queries for all analytics endpoints
5. **Desktop: platform analytics** — cross-hub aggregation for super-admins
6. **Desktop: dashboard personal stats** — "calls answered today" card for all authenticated users
7. **Mobile: stat cards** — simplified analytics on iOS and Android dashboards
8. **i18n: analytics keys** — all 13 locales

---

## Scope

### In Scope

- 3 new backend endpoints + protocol schemas + unit tests
- Platform-scope analytics route mounting (cross-hub)
- Desktop analytics section with recharts (port v1 + new v2 cards)
- Desktop platform analytics section for super-admins
- React Query hooks for all analytics data
- Dashboard "calls answered today" card
- Date range: 7/30d toggle + custom date picker
- iOS: dashboard stat cards + full admin analytics screen (KPIs, conversations, shifts, per-user table)
- Android: dashboard stat cards + full admin analytics screen (same as iOS)
- i18n keys across all 13 locales
- Playwright E2E tests for desktop analytics
- BDD tests for new backend endpoints

- `@tanstack/react-query` as new dependency + QueryClientProvider setup
- Playwright E2E tests for desktop analytics
- BDD tests for new backend endpoints
- iOS XCUITest + unit tests for analytics views
- Android Compose UI tests + unit tests for analytics screens

### Permanently Out of Scope

- CSV/PDF/file export (security: data leakage)
- Native chart libraries on mobile (Swift Charts, Vico) — data shown as cards/tables
- WebSocket push for real-time health
- Predictive analytics / ML
- Alerting / threshold notifications

---

## Backend Design

### New Endpoints

#### `GET /api/analytics/hours`

Hourly call distribution over the date range. Groups calls by `EXTRACT(HOUR FROM started_at)`, fills all 24 buckets (0-padded for hours with zero calls).

**Permission:** `audit:read`
**Query:** `?from=ISO&to=ISO` (defaults to last 30 days)

```typescript
// packages/protocol/schemas/analytics.ts
export const callHourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  count: z.number().int(),
})

export const hourlyDistributionResponseSchema = z.object({
  totalCalls: z.number(),
  buckets: z.array(callHourBucketSchema),
})
```

**Service method:** `getHourlyDistribution(hubId: string | undefined, dateRange: { from: Date; to: Date }): Promise<HourlyDistributionResponse>`

SQL: `SELECT EXTRACT(HOUR FROM started_at)::int AS hour, COUNT(*)::int AS count FROM call_records WHERE hub_id = $1 AND started_at BETWEEN $2 AND $3 GROUP BY hour ORDER BY hour`

Post-process: fill missing hours with `{ hour, count: 0 }`.

#### `GET /api/analytics/users`

Per-user call statistics over the date range. Joins call_records with users table (or audit_log). Returns sorted by calls answered descending.

**Permission:** `audit:read`
**Query:** `?from=ISO&to=ISO` (defaults to last 30 days)

```typescript
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
```

**Service method:** `getUserStats(hubId: string | undefined, dateRange: { from: Date; to: Date }): Promise<UserStatsResponse>`

Note: In v1, avgDuration always returned 0 because duration is encrypted. v2 has `duration` as a plaintext integer on `call_records` — we can compute real averages. Display names come from the `users` table (display_name column), not decrypted audit entries.

#### `GET /api/me/stats`

Personal stats for the authenticated user's dashboard. No admin permission required — users see only their own data.

**Permission:** Authenticated (no special permission)
**Query:** `?from=ISO&to=ISO` (defaults to last 30 days). `callsToday` always counts today regardless of `from/to` — it's a hardcoded "today" counter alongside the range-based stats.

```typescript
export const personalStatsResponseSchema = z.object({
  callsToday: z.number().int(),
  callsThisPeriod: z.number().int(),
  avgDurationSeconds: z.number(),
  notesCreatedThisPeriod: z.number().int(),
})
```

**Service method:** `getPersonalStats(hubId: string, userPubkey: string, dateRange: { from: Date; to: Date }): Promise<PersonalStatsResponse>`

### Platform-Scope Route Mounting

Mount the same analytics router at the platform level (no hubId in path). Service methods already accept `hubId: string | undefined` — passing `undefined` aggregates across all hubs.

```
Hub-scoped:      GET /api/hubs/:hubId/analytics/calls
Platform-scoped: GET /api/analytics/calls
```

Platform routes require super-admin permission (platform-level `audit:read`). The personal stats endpoint (`/api/me/stats`) remains hub-scoped only — personal stats without hub context is meaningless.

---

## Desktop Frontend Design

### Analytics Section Component

`src/client/components/admin-sections/analytics-section.tsx`

Registered in the admin sidebar nav under the hub group. Requires `calls:read-history` + `audit:read` permissions (already configured in nav config).

**Layout:** Vertical stack of card sections, each independently loading.

**Cards:**

1. **Summary KPIs** — 4 metric tiles: Total Calls, Answer Rate (%), Avg Duration, Total Conversations. Rendered as `<Card>` with large number + small label. Data from `callMetricsResponse` + `conversationMetricsResponse`.

2. **Call Volume Chart** — recharts `<BarChart>` with stacked bars (answered/unanswered/abandoned) per day. 7/30/Custom date range toggle above the chart. Ported from v1's `call-volume-chart.tsx`.

3. **Hourly Distribution Chart** — recharts `<BarChart>` (horizontal) showing 24-hour call distribution. Uses new `/analytics/hours` endpoint.

4. **Conversation Metrics** — recharts `<BarChart>` showing message volume by channel (SMS, WhatsApp, Signal, etc.) + stat tiles for avg response time and messages per conversation. New in v2.

5. **Shift Coverage** — Visual representation of `coverageSlots[]` from `/analytics/shifts`. Weekly grid/heatmap showing covered vs uncovered time slots. New in v2.

6. **Per-User Activity Table** — Sortable table: user name, calls answered, avg duration, notes created. Uses new `/analytics/users` endpoint. Ported from v1's `user-stats-table.tsx`.

### Platform Analytics Section

`src/client/components/admin-sections/platform-analytics-section.tsx`

Same structure as hub analytics but hits platform-scoped routes (no hubId). Shows cross-hub aggregation. Registered under the platform nav group. Super-admin only.

### React Query Hooks

`src/client/lib/queries/analytics.ts`

All hooks lazy-loaded (`enabled` param, default `false`). 5-minute staleTime. Separate query key namespaces for hub vs platform scope.

```typescript
// Hub-scoped
useCallMetrics(dateRange, enabled?)
useConversationMetrics(dateRange, enabled?)
useShiftMetrics(enabled?)
useSystemHealth(enabled?)
useHourlyDistribution(dateRange, enabled?)
useUserStats(dateRange, enabled?)

// Platform-scoped (super-admin)
usePlatformCallMetrics(dateRange, enabled?)
usePlatformConversationMetrics(dateRange, enabled?)
usePlatformHourlyDistribution(dateRange, enabled?)
usePlatformUserStats(dateRange, enabled?)

// Personal (any authenticated user)
usePersonalStats(dateRange?)
```

Query keys follow the existing pattern from `src/client/lib/queries/keys.ts`:

```typescript
analytics: {
  callMetrics: (hubId: string, dateRange?: DateRange) => ['analytics', 'calls', hubId, dateRange],
  conversationMetrics: (hubId: string, dateRange?: DateRange) => ['analytics', 'conversations', hubId, dateRange],
  shiftMetrics: (hubId: string) => ['analytics', 'shifts', hubId],
  systemHealth: (hubId: string) => ['analytics', 'health', hubId],
  hourlyDistribution: (hubId: string, dateRange?: DateRange) => ['analytics', 'hours', hubId, dateRange],
  userStats: (hubId: string, dateRange?: DateRange) => ['analytics', 'users', hubId, dateRange],
  platform: {
    callMetrics: (dateRange?: DateRange) => ['analytics', 'platform', 'calls', dateRange],
    conversationMetrics: (dateRange?: DateRange) => ['analytics', 'platform', 'conversations', dateRange],
    hourlyDistribution: (dateRange?: DateRange) => ['analytics', 'platform', 'hours', dateRange],
    userStats: (dateRange?: DateRange) => ['analytics', 'platform', 'users', dateRange],
  },
  personal: (hubId: string) => ['analytics', 'personal', hubId],
}
```

### Dashboard Enhancement

Add a "Calls Answered Today" card to the existing dashboard (`src/client/routes/index.tsx`) for all authenticated users. Uses `usePersonalStats()` with today's date range. Shows: calls today count + optional comparison to recent average.

### Date Range Component

Shared `<DateRangeSelector>` component used by both hub and platform analytics:
- 3 toggle buttons: "7 days" | "30 days" | "Custom"
- Custom reveals a date range picker (two date inputs or a calendar popover using shadcn DatePicker)
- State lifted to parent, passed as `dateRange` to hooks

---

## Mobile Design

Hub admins need full analytics capabilities on mobile. Both platforms consume the same API endpoints and protocol types (generated via codegen). No chart libraries — data is presented as cards, lists, and tables.

### iOS (SwiftUI)

**Dashboard stat cards** (all authenticated users):
- "Calls Today" — large number
- "Answer Rate" — percentage with color indicator (green >80%, yellow >50%, red <=50%)
- "Avg Duration" — formatted as Xm Ys
- Uses `/api/me/stats` for the authenticated user's own data

**Admin analytics screen** (requires `audit:read`):
- Summary KPI cards: total calls, answer rate, avg duration, total conversations
- Conversation metrics section: message volume by channel, avg response time
- Shift coverage section: coverage percentage, volunteer count, gap indicators
- Per-user activity list: name, calls answered, avg duration, notes created (sortable)
- 7/30 day segmented control for date range (custom picker via sheet)
- Pull-to-refresh for manual reload

**Navigation:** Tab or list item in admin section, gated by `audit:read` permission.

### Android (Kotlin/Compose)

Mirror the iOS design using Material 3 components:
- Dashboard stat cards using `ElevatedCard` / `OutlinedCard`
- Admin analytics screen with LazyColumn layout
- KPI row using `FlowRow` for responsive card sizing
- Conversation + shift sections as expandable cards
- Per-user activity using `LazyColumn` with sortable headers
- 7/30 day chip group + custom date picker dialog
- Pull-to-refresh via `pullRefresh` modifier

**Navigation:** NavGraph destination in admin section, gated by `audit:read` permission.

### Mobile Unit + UI Tests

Both platforms need tests covering:
- **Unit tests:** API response parsing, date formatting, stat calculations
- **UI tests (XCUITest / Compose):** KPI cards render with data, user activity list populates, date range toggle changes displayed data, permission gating hides analytics from non-admins

---

## i18n

Add `analytics.*` namespace to all 13 locales in `packages/i18n/locales/`. Keys needed:

```
analytics.title
analytics.description
analytics.dateRange.7days
analytics.dateRange.30days
analytics.dateRange.custom
analytics.dateRange.from
analytics.dateRange.to

analytics.summary.totalCalls
analytics.summary.answerRate
analytics.summary.avgDuration
analytics.summary.totalConversations

analytics.callVolume.title
analytics.callVolume.answered
analytics.callVolume.unanswered
analytics.callVolume.abandoned
analytics.callVolume.noData

analytics.hours.title
analytics.hours.noData

analytics.conversations.title
analytics.conversations.byChannel
analytics.conversations.avgResponseTime
analytics.conversations.avgMessages
analytics.conversations.noData

analytics.shifts.title
analytics.shifts.coverage
analytics.shifts.covered
analytics.shifts.uncovered
analytics.shifts.noData

analytics.users.title
analytics.users.name
analytics.users.callsAnswered
analytics.users.avgDuration
analytics.users.notesCreated
analytics.users.noData

analytics.personal.callsToday
analytics.personal.callsThisPeriod
analytics.personal.avgDuration
analytics.personal.notesCreated

analytics.platform.title
analytics.platform.description
analytics.platform.crossHub
```

~35 keys. Add English first, then translate to remaining 12 locales. Run `bun run i18n:codegen` after adding keys.

---

## Permissions

| Scope | Required Permission | Audience |
|-------|-------------------|----------|
| Hub analytics (all charts) | `calls:read-history` + `audit:read` | Hub admins |
| Platform analytics (cross-hub) | Platform-level `audit:read` | Super-admins |
| Personal stats (calls today) | Authenticated | All users |
| System health / metrics | `metrics:read` | Hub admins |

No new permissions needed — the existing catalog covers all access patterns.

---

## Testing

### Backend Unit Tests

Extend `apps/worker/__tests__/unit/analytics.test.ts`:
- `getHourlyDistribution()` returns 24 buckets, fills zeros for missing hours
- `getHourlyDistribution()` filters by hub when hubId provided
- `getUserStats()` returns users sorted by callsAnswered desc
- `getUserStats()` computes real avgDurationSeconds from call_records
- `getUserStats()` includes notesCreated count
- `getPersonalStats()` returns only the requesting user's data
- `getPersonalStats()` callsToday always counts today regardless of date range
- Platform-scope methods aggregate across hubs when hubId is undefined

### Backend BDD

Feature file: `packages/test-specs/features/admin/analytics.feature`

- Scenario: hub admin fetches hourly distribution for last 7 days → 24 buckets returned
- Scenario: hub admin fetches per-user stats → sorted by calls answered desc
- Scenario: authenticated user fetches personal stats → sees only own data
- Scenario: platform admin fetches cross-hub call metrics → aggregates all hubs
- Scenario: non-admin user gets 403 on hub analytics endpoints
- Scenario: analytics date range filters results correctly
- Scenario: personal stats callsToday reflects today's calls only

### Desktop Playwright E2E

- Test: analytics nav link visible only to users with `audit:read` permission
- Test: analytics section renders KPI summary cards with data
- Test: call volume chart renders with stacked bars (mock API response)
- Test: date range toggle switches between 7/30/custom and refetches data
- Test: per-user activity table populates and sorts by column click
- Test: platform analytics section visible only to super-admins
- Test: dashboard shows personal "calls today" card for all authenticated users
- Test: analytics queries lazy-load (not fetched until section opened)

### iOS Tests

**Unit tests (XCTest):**
- AnalyticsService parses call metrics response correctly
- AnalyticsService parses personal stats response correctly
- Date range formatting produces correct ISO strings
- KPI value formatting (duration → "Xm Ys", rate → "X%")

**UI tests (XCUITest):**
- Dashboard stat cards render with data
- Admin analytics screen shows KPI cards, conversation metrics, user activity list
- Non-admin user does not see analytics nav item
- 7/30 day segment control changes displayed data
- Pull-to-refresh reloads analytics data

### Android Tests

**Unit tests (JUnit):**
- AnalyticsRepository parses call metrics response correctly
- AnalyticsRepository parses personal stats response correctly
- Date formatting and KPI value formatting

**UI tests (Compose):**
- Dashboard stat cards render with data
- Admin analytics screen shows all sections
- Permission gating hides analytics from non-admins
- Date range chip toggle updates content
- Pull-to-refresh triggers data reload

---

## Key Files

### Existing (Modify)
- `apps/worker/routes/analytics.ts` — add 3 new endpoints + platform mount
- `apps/worker/services/analytics.ts` — add 3 new service methods
- `packages/protocol/schemas/analytics.ts` — add 3 new Zod schemas
- `packages/protocol/tools/schema-registry.ts` — register new schemas
- `src/client/routes/index.tsx` — add personal stats card to dashboard
- `packages/i18n/locales/*.json` — add analytics keys to all 13 locales

### New (Create)
- `src/client/lib/query-client.ts` — QueryClient setup + QueryClientProvider integration
- `src/client/lib/queries/analytics.ts` — React Query hooks for all analytics endpoints
- `src/client/routes/admin/analytics.tsx` — hub analytics route (TanStack file-based)
- `src/client/components/analytics/` — chart components (call-volume, hourly, conversation, shift-coverage, user-table, date-range-selector)
- `apps/ios/Sources/Views/Analytics/AnalyticsView.swift` — admin analytics screen
- `apps/ios/Sources/Views/Analytics/AnalyticsStatCards.swift` — dashboard stat cards
- `apps/ios/Sources/Services/AnalyticsService.swift` — API client for analytics
- `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreen.kt` — admin analytics
- `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsStatCards.kt` — dashboard cards
- `apps/android/app/src/main/kotlin/org/llamenos/app/api/AnalyticsRepository.kt` — API client
- `packages/test-specs/features/admin/analytics.feature` — BDD scenarios
- `tests/steps/backend/analytics.steps.ts` — BDD step definitions

---

## References

### v1 (Port Source)
- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-sections/analytics-section.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/components/dashboard/call-volume-chart.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/components/dashboard/call-hours-chart.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/components/dashboard/user-stats-table.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/analytics.ts`
- `/home/rikki/projects/llamenos-hotline/src/server/routes/analytics.ts`
- `/home/rikki/projects/llamenos-hotline/src/server/services/records.ts` (getCallVolumeByDay, getCallHourDistribution, getUserCallStats)

### v2 (Existing)
- `apps/worker/routes/analytics.ts`
- `apps/worker/services/analytics.ts`
- `apps/worker/__tests__/unit/analytics.test.ts`
- `packages/protocol/schemas/analytics.ts`
- `src/client/routes/admin/system.tsx` (system health page — do not duplicate)
