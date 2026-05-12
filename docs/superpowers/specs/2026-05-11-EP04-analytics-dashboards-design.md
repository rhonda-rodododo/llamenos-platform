---
epic: EP04
title: Analytics & Dashboards
status: stub
depends-on: []
phase: 3
---

# EP04: Analytics & Dashboards

**Date:** 2026-05-11
**Source:** v1 (llamenos-hotline) -> v2 (llamenos-platform)

## Overview

Port the v1 analytics dashboard to v2 and extend it with v2's richer backend capabilities. v1 had a single cross-hub analytics section with call volume, hourly distribution, and per-user stats. v2 already has a more comprehensive backend (call metrics, conversation metrics, shift coverage, system health) but zero frontend to render it.

## v1 Implementation Summary

### Frontend (Desktop)

1. **`analytics-section.tsx`**: Admin-only dashboard with three chart cards:
   - **Call Volume** (LineChart, recharts): daily total + answered over 7/30 day toggle
   - **Hour of Day** (BarChart, recharts): 24-bucket hourly distribution
   - **Per-User Activity** (HTML table): sorted by calls answered, shows name/pubkey, call count, avg duration, notes created
2. **Dashboard personal stats**: "Calls answered today" card on homepage for all authenticated users (`useCallsTodayCount`)
3. **React Query hooks** (`lib/queries/analytics.ts`):
   - `useCallAnalytics(days, enabled)` — hub-scoped call volume
   - `useCallHoursAnalytics(enabled)` — hub-scoped hourly distribution
   - `useUserStatsAnalytics(enabled)` — hub-scoped per-user stats
   - `useGlobalCallAnalytics` / `useGlobalCallHoursAnalytics` / `useGlobalUserStatsAnalytics` — platform-scoped (super-admin)
   - All lazy-loaded (enabled=false until section opens), 5-minute staleTime
4. **API endpoints** (v1): `/analytics/calls`, `/analytics/hours`, `/analytics/users` — mounted both hub-scoped and global

### v1 Data Shapes

- `CallVolumeDay`: `{ date, count, answered, voicemail }`
- `CallHourBucket`: `{ hour: number, count: number }`
- `UserStatEntry`: `{ pubkey, name, callsAnswered, avgDuration, notesCreated }`

## v2 Current State

### Backend (Complete)

v2's backend is significantly ahead of v1. Four analytics endpoints exist with full Drizzle queries and unit tests:

| Endpoint | Schema | Description |
|----------|--------|-------------|
| `GET /api/analytics/calls` | `callMetricsResponseSchema` | Total/answered/unanswered/abandoned, answer rate, avg duration, daily `byPeriod` breakdown |
| `GET /api/analytics/conversations` | `conversationMetricsResponseSchema` | Conversation counts by status, message totals, avg response time, breakdown by channel |
| `GET /api/analytics/shifts` | `shiftMetricsResponseSchema` | Shift count, volunteer count, weekly hours covered, 7-day coverage slots |
| `GET /api/analytics/health` | `analyticsSystemHealthResponseSchema` | Active calls, waiting conversations, active volunteers, service statuses |

All endpoints are hub-scoped, gated by `audit:read` permission, with `?from=ISO&to=ISO` date range query params. Zod schemas live in `packages/protocol/schemas/analytics.ts`.

**Missing from backend:** platform-scoped (cross-hub) analytics aggregation routes, per-user stats endpoint, hourly distribution endpoint, personal "calls today" endpoint.

### Frontend (Stub Only)

- No analytics section component exists in v2 (not even a stub file)
- No React Query hooks for analytics
- No chart library installed (recharts or alternative)
- No i18n keys for analytics in `packages/i18n`
- Admin sidebar nav config references analytics (hub: `analytics` requiring `calls:read-history` + `audit:read`; platform: `platform-analytics`) but these point to nothing

### Protocol Schemas (Complete)

`packages/protocol/schemas/analytics.ts` defines Zod schemas for all four response types. These are the source of truth for codegen.

## Gap Analysis

### Must Port from v1

| Item | v1 Location | v2 Target |
|------|-------------|-----------|
| Call volume line chart (daily) | `analytics-section.tsx` | `src/client/components/admin-sections/analytics-section.tsx` |
| Hourly distribution bar chart | `analytics-section.tsx` | Same file |
| Per-user activity table | `analytics-section.tsx` | Same file |
| 7/30 day range toggle | `analytics-section.tsx` | Same file |
| Dashboard "calls today" card | `routes/index.tsx` | Dashboard route |
| React Query analytics hooks | `lib/queries/analytics.ts` | `src/client/lib/queries/analytics.ts` |
| Global (platform) analytics hooks | `lib/queries/analytics.ts` | Same file, separate query keys |

### Must Build New (v2-only)

| Item | Description |
|------|-------------|
| Conversation metrics card | Channel breakdown, response time, message volume (v2 backend supports it, v1 didn't have messaging) |
| Shift coverage visualization | Weekly coverage heatmap/timeline from `shifts` endpoint |
| System health dashboard | Service status, active calls/conversations/volunteers (real-time or near-real-time) |
| Platform analytics section | Cross-hub aggregation UI for super-admins (separate nav item `platform-analytics`) |
| Backend: hourly distribution endpoint | v2 backend lacks `/analytics/hours` — add SQL query grouping by `EXTRACT(HOUR FROM started_at)` |
| Backend: per-user stats endpoint | v2 backend lacks `/analytics/users` — add SQL query joining call_records + users |
| Backend: personal stats endpoint | v2 backend lacks `/api/me/stats` or similar for dashboard "calls today" |
| Backend: platform-scoped routes | Mount analytics routes without hub context for cross-hub aggregation |
| i18n keys | Add analytics.* keys to all 13 locales via `packages/i18n` |
| Mobile views | Simplified analytics for iOS (SwiftUI charts) and Android (Compose charts) |

## Architecture Decisions (To Be Made)

1. **Chart library**: recharts (v1 choice, mature, React-native) vs. alternatives (visx, nivo, Chart.js). recharts is the simplest port path.
2. **Real-time health**: WebSocket push for system health metrics vs. polling with short staleTime?
3. **Platform analytics backend**: Separate route group or same routes with optional `hubId`? v1 mounted the same router twice (hub-scoped + global). v2 already passes `hubId` conditionally.
4. **Mobile chart strategy**: Native charting (Swift Charts for iOS, Vico/MPAndroidChart for Android) vs. simplified stat cards without charts on mobile?
5. **Date range UX**: v1 used 7/30 day toggle buttons. v2 backend supports arbitrary `from/to` ISO dates. Offer date picker for custom ranges?
6. **Export**: CSV/PDF export of analytics data? Not in v1 but commonly requested.

## Implementation Scope

### Phase 1: Backend Completion

- Add `/api/analytics/hours` endpoint (hourly distribution)
- Add `/api/analytics/users` endpoint (per-user stats)
- Add `/api/me/stats` endpoint (personal dashboard stats, non-admin)
- Mount analytics routes at both hub-scoped and platform-scoped paths
- Add Zod schemas for new endpoints to `packages/protocol/schemas/analytics.ts`
- Unit tests for new service methods

### Phase 2: Desktop Frontend

- Install recharts (or chosen chart library)
- Create `analytics-section.tsx` with call volume, hourly, and per-user charts (port from v1)
- Add conversation metrics and shift coverage cards (new, using v2 backend data)
- Create React Query hooks (`useCallMetrics`, `useConversationMetrics`, `useShiftMetrics`, `useSystemHealth`, `useHourlyDistribution`, `useUserStats`)
- Create platform analytics section for super-admin nav
- Add "calls answered today" card to dashboard homepage
- Add system health status indicators
- Add i18n keys to all 13 locales
- Wire into admin sidebar registry for both `analytics` and `platform-analytics` nav items

### Phase 3: Mobile

- iOS: SwiftUI analytics view with Swift Charts (iOS 16+) or stat cards
- Android: Compose analytics screen with Vico charts or stat cards
- Both: personal stats on dashboard, simplified admin analytics

### Phase 4: Polish

- Date range picker for custom ranges
- Loading skeletons (v1 already had pulse animations)
- Empty states with guidance
- Accessibility (chart descriptions, table headers)
- BDD tests for analytics endpoints
- Playwright E2E tests for desktop analytics UI

## Permissions

| Scope | Required Permission | Notes |
|-------|-------------------|-------|
| Hub analytics | `calls:read-history` + `audit:read` | Both required (nav config) |
| Platform analytics | Super-admin only | Platform nav group |
| Personal stats | Authenticated | Any logged-in user sees own stats |

## Key Files

### v1 (Reference)
- `/home/rikki/projects/llamenos-hotline/src/client/components/admin-sections/analytics-section.tsx`
- `/home/rikki/projects/llamenos-hotline/src/client/lib/queries/analytics.ts`
- `/home/rikki/projects/llamenos-hotline/src/client/routes/index.tsx` (dashboard personal stats)

### v2 (Existing)
- `apps/worker/routes/analytics.ts` — 4 endpoints (calls, conversations, shifts, health)
- `apps/worker/services/analytics.ts` — AnalyticsService with Drizzle queries
- `apps/worker/__tests__/unit/analytics.test.ts` — unit tests
- `packages/protocol/schemas/analytics.ts` — Zod schemas for response types

### v2 (To Create)
- `src/client/components/admin-sections/analytics-section.tsx` — hub analytics UI
- `src/client/components/admin-sections/platform-analytics-section.tsx` — platform analytics UI
- `src/client/lib/queries/analytics.ts` — React Query hooks
- i18n keys in `packages/i18n/locales/*.json`
