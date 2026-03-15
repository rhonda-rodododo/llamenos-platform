# Epic 344: iOS CMS Case Management Views

## Overview
Build case management screens for iOS (SwiftUI) following existing TypedReportCreateView patterns.

## Screens
1. **CaseListView** — Entity type tabs (from template), filterable list with status pills, pull-to-refresh
2. **CaseDetailView** — Read-only detail with template-driven field rendering, tabs (Details/Timeline/Contacts/Evidence)
3. **QuickStatusSheet** — Status picker sheet with template-defined status options and colors
4. **AddCommentSheet** — Textarea + encrypt + POST interaction

## Architecture
- Follow `TypedReportCreateView.swift` for template-driven field rendering
- `APIService.swift` Schnorr auth pattern for all API calls (GET/POST/PATCH)
- `CryptoService` singleton for E2EE (summary-tier only for volunteers)
- @Observable ViewModel pattern matching `ReportsViewModel`
- Navigation via existing tab/navigation patterns

## API Endpoints
- `GET /api/settings/cms/entity-types` — fetch entity types for tabs
- `GET /api/records?entityTypeId=...&statusHash=...&page=...` — fetch records
- `GET /api/records/:id` — fetch single record detail
- `PATCH /api/records/:id` — update status
- `POST /api/records/:id/interactions` — add comment
- `GET /api/records/:id/contacts` — linked contacts
- `GET /api/records/:id/evidence` — evidence items

## New Files
- `apps/ios/Sources/Views/Cases/CaseListView.swift`
- `apps/ios/Sources/Views/Cases/CaseDetailView.swift`
- `apps/ios/Sources/Views/Cases/QuickStatusSheet.swift`
- `apps/ios/Sources/Views/Cases/AddCommentSheet.swift`
- `apps/ios/Sources/ViewModels/CaseManagementViewModel.swift`
- `apps/ios/Sources/Models/CaseRecord.swift`

## Accessibility
- Every interactive element gets `.accessibilityIdentifier()` for XCUITest
- Standard identifiers: `case-list`, `case-card-{id}`, `case-detail-header`, `case-status-pill`, `case-tab-{name}`, `case-timeline`, `case-contacts-tab`, `case-evidence-tab`, `case-comment-input`, `case-comment-submit`

## Gate
`bun run ios:build` passes, case list renders with template-driven tabs
