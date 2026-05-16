# EP04 — Analytics & Dashboards — Completion Plan

## Scope

### Already Done (~85%)
- All backend analytics endpoints (calls, conversations, shifts, health, hours, users, personal stats)
- Analytics service with all aggregation methods
- Protocol schemas
- Hub analytics page with KPI cards, charts, tables
- Platform analytics page (cross-hub)
- React Query hooks with proper staleTime
- Chart components (call-volume, hourly, conversation, shift-coverage, user-stats-table)
- Date range selector, KPI cards
- Dashboard personal stats card
- i18n keys complete across `analytics.*` namespace
- BDD: `analytics.feature` — 6 scenarios all passing

### Remaining Work
- Platform-scoped routes (analytics without hubId for cross-hub aggregation) — may need verification
- iOS analytics views — entirely missing
- Android analytics views — entirely missing

## Tasks (ordered by dependency)

### Task 1: Verify platform-scoped analytics routes
- **Platform**: backend
- **Files**:
  - `apps/worker/routes/analytics.ts` — verify platform-scope mounting
- **What**: Confirm that analytics endpoints are mounted at both hub-scoped (`/api/hubs/:hubId/analytics/*`) and platform-scoped (`/api/analytics/*`) paths. Platform routes should pass `undefined` as hubId to service methods for cross-hub aggregation. Platform routes require super-admin permission. If not yet implemented, add the platform-scope mounting.
- **Spec reference**: Architecture Decision 3 (Platform analytics: same routes, optional hubId)
- **Acceptance**: Platform-scoped analytics endpoints return cross-hub data; require super-admin auth

### Task 2: iOS dashboard stat cards
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Dashboard/AnalyticsStatCards.swift` (new)
  - `apps/ios/Sources/Services/AnalyticsService.swift` (new)
- **What**: Dashboard stat cards for all authenticated users: "Calls Today" (large number), "Answer Rate" (percentage with color: green >80%, yellow >50%, red <=50%), "Avg Duration" (formatted Xm Ys). Uses `/api/me/stats` endpoint. Integrate into the main dashboard view. Pull-to-refresh support.
- **Spec reference**: Mobile Design — iOS (Dashboard stat cards)
- **Acceptance**: Stat cards render on iOS dashboard with live data; color-coded answer rate; pull-to-refresh works

### Task 3: iOS admin analytics screen
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Analytics/AnalyticsView.swift` (new)
  - `apps/ios/Sources/Views/Analytics/KPICardsView.swift` (new)
  - `apps/ios/Sources/Views/Analytics/ConversationMetricsView.swift` (new)
  - `apps/ios/Sources/Views/Analytics/ShiftCoverageView.swift` (new)
  - `apps/ios/Sources/Views/Analytics/UserActivityListView.swift` (new)
- **What**: Full admin analytics screen gated by `audit:read` permission. Sections: (1) Summary KPI cards (total calls, answer rate, avg duration, total conversations), (2) Conversation metrics (message volume by channel, avg response time), (3) Shift coverage (coverage percentage, volunteer count, gap indicators), (4) Per-user activity list (name, calls answered, avg duration, notes created — sortable). 7/30 day segmented control + custom date picker via sheet. Pull-to-refresh. Navigation entry in admin section.
- **Spec reference**: Mobile Design — iOS (Admin analytics screen)
- **Acceptance**: Full analytics screen renders with all sections; date range toggle works; permission-gated; pull-to-refresh

### Task 4: iOS analytics tests
- **Platform**: iOS
- **Files**:
  - `apps/ios/Tests/LlamenosTests/AnalyticsServiceTests.swift` (new)
  - `apps/ios/Tests/LlamenosUITests/AnalyticsUITests.swift` (new)
- **What**: Unit tests: API response parsing, date formatting, KPI value formatting (duration → "Xm Ys", rate → "X%"). UI tests: dashboard stat cards render, admin analytics screen shows sections, non-admin doesn't see analytics, 7/30 toggle changes data, pull-to-refresh works.
- **Spec reference**: Testing — iOS Tests
- **Acceptance**: All unit and UI tests pass

### Task 5: Android dashboard stat cards
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/dashboard/AnalyticsStatCards.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/api/AnalyticsRepository.kt` (new)
- **What**: Dashboard stat cards using Material 3 `ElevatedCard`/`OutlinedCard`. Same data as iOS: calls today, answer rate (color-coded), avg duration. Uses `/api/me/stats`. Integrate into main dashboard screen. Pull-to-refresh via `pullRefresh` modifier.
- **Spec reference**: Mobile Design — Android (Dashboard stat cards)
- **Acceptance**: Stat cards render on Android dashboard; Material 3 styling; pull-to-refresh

### Task 6: Android admin analytics screen
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/KPIRow.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/ConversationMetricsSection.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/ShiftCoverageSection.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/UserActivityList.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/analytics/AnalyticsViewModel.kt` (new)
- **What**: Material 3 admin analytics screen with LazyColumn layout. KPI row using `FlowRow` for responsive sizing. Conversation + shift sections as expandable cards. Per-user activity using `LazyColumn` with sortable headers. 7/30 day chip group + custom date picker dialog. Pull-to-refresh. Hilt-injected ViewModel. NavGraph destination gated by `audit:read`.
- **Spec reference**: Mobile Design — Android
- **Acceptance**: Full analytics screen; all sections render; date range works; permission-gated

### Task 7: Android analytics tests
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/test/kotlin/org/llamenos/app/api/AnalyticsRepositoryTest.kt` (new)
  - `apps/android/app/src/androidTest/kotlin/org/llamenos/app/ui/AnalyticsScreenTest.kt` (new)
- **What**: Unit tests: API response parsing, date formatting, KPI value formatting. UI tests: dashboard stat cards render, admin screen shows all sections, permission gating, date range chip toggle, pull-to-refresh.
- **Spec reference**: Testing — Android Tests
- **Acceptance**: All unit and UI tests pass
