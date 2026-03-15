# Epic 345: Android CMS Case Management Views

## Overview
Build case management screens for Android (Compose) following existing TypedReportCreateScreen patterns.

## Screens
1. **CaseListScreen** — Entity type tabs via ScrollableTabRow, filtered list with status chips, pull-to-refresh
2. **CaseDetailScreen** — Detail with template field sections, tab row for Overview/Timeline/Contacts/Evidence
3. **QuickStatusSheet** — ModalBottomSheet with status options
4. **AddCommentSheet** — ModalBottomSheet with OutlinedTextField, encrypt + POST

## Architecture
- Follow `TypedReportCreateScreen.kt` for template-driven field rendering
- `ApiService.kt` with `AuthInterceptor` for all API calls
- Hilt DI for ViewModel injection
- Compose Material 3 + testTag for all elements
- kotlinx.serialization for models

## New Files
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CaseListScreen.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CaseDetailScreen.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/QuickStatusSheet.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/AddCommentSheet.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/cases/CaseManagementViewModel.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/model/CaseModels.kt`

## Test Tags
Every interactive element: `testTag("case-list")`, `testTag("case-card-{id}")`, `testTag("case-detail-header")`, `testTag("case-status-pill")`, `testTag("case-tab-{name}")`, `testTag("case-timeline")`, `testTag("case-comment-input")`, `testTag("case-comment-submit")`

## Gate
`bun run test:android` compiles, case list renders with template-driven tabs
