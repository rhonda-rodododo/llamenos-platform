# Epic 241: iOS Reports

## Summary

Implement the full Reports feature for iOS — create, list, detail, claim, and close reports. Reports are a core volunteer/reporter workflow: volunteers file reports about incidents, admins can assign and close them. Reports use the same E2EE envelope system as notes (per-report random key, ECIES-wrapped for each reader).

## Context

- **Android has**: ReportsScreen (list + filters), ReportCreateScreen (title + category + E2EE body), ReportDetailScreen (metadata + claim + close actions)
- **iOS has**: Nothing — no Report model, no views, no tests
- **Backend**: Reports are stored as `Conversation` records with `metadata.type = "report"` in RecordsDO. Same encrypted envelope pattern as notes.
- **API routes**: `GET/POST /api/reports`, `GET/PATCH /api/reports/:id`, `POST /api/reports/:id/assign`, `GET /api/reports/categories`

## Data Models

### Report.swift (new file in Sources/Models/)

```swift
struct Report: Identifiable, Decodable {
    let id: String
    let channelType: String       // always "reports"
    let contactIdentifierHash: String?
    let assignedTo: String?
    let status: String            // "waiting", "active", "closed"
    let createdAt: String
    let updatedAt: String?
    let lastMessageAt: String?
    let messageCount: Int
    let metadata: ReportMetadata?

    var reportTitle: String { metadata?.reportTitle ?? "Untitled Report" }
    var reportCategory: String? { metadata?.reportCategory }
    var statusEnum: ReportStatus { ReportStatus(rawValue: status) ?? .waiting }
}

struct ReportMetadata: Decodable {
    let type: String?
    let reportTitle: String?
    let reportCategory: String?
    let linkedCallId: String?
    let reportId: String?
}

enum ReportStatus: String, CaseIterable {
    case waiting, active, closed

    var displayName: String { /* localized */ }
    var color: Color { /* waiting=orange, active=blue, closed=gray */ }
    var icon: String { /* clock, person.fill, checkmark.circle */ }
}

enum ReportStatusFilter: String, CaseIterable {
    case all, waiting, active, closed
    var displayName: String { /* localized */ }
}
```

## Views

### ReportsView.swift — List Screen

iOS-native design using `List` + `.searchable` + toolbar filter menu:
- **Toolbar**: Filter button (menu with status chips) + Create button (plus icon)
- **List rows**: Title, status dot, category badge (if set), message count, relative timestamp
- **Empty state**: ContentUnavailableView with "No Reports" + "Create First Report" button
- **Loading/error states**: Same pattern as NotesView
- **Pull-to-refresh**: `.refreshable { await viewModel.loadReports() }`
- **Accessibility**: `reports-list`, `reports-empty-state`, `reports-loading`, `create-report-button`, `reports-filter-button`

### ReportCreateView.swift — Create Sheet

Presented as a sheet from ReportsView:
- **Title**: TextField (required)
- **Category**: Picker from server-defined categories (optional)
- **Body**: TextEditor (required, multi-line)
- **Submit**: Encrypts body with E2EE envelope, POSTs to API
- **Accessibility**: `report-title-input`, `report-category-picker`, `report-body-input`, `report-submit-button`

### ReportDetailView.swift — Detail Screen

Pushed via NavigationLink from list:
- **Header**: Title (large), status chip, category chip
- **Metadata card**: Created date, assigned volunteer (truncated pubkey), message count
- **Action buttons**:
  - Claim (when status == "waiting"): POST `/api/reports/:id/assign`
  - Close (when status == "active" and admin): PATCH `/api/reports/:id` with `{ status: "closed" }`
- **Accessibility**: `report-title`, `report-status`, `report-category`, `report-claim-button`, `report-close-button`, `report-metadata`

## ViewModel

### ReportsViewModel.swift (new file in Sources/ViewModels/)

```swift
@Observable
final class ReportsViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService

    var reports: [Report] = []
    var categories: [String] = []
    var selectedFilter: ReportStatusFilter = .all
    var isLoading = false
    var isCreating = false
    var errorMessage: String?

    var filteredReports: [Report] {
        guard selectedFilter != .all else { return reports }
        return reports.filter { $0.status == selectedFilter.rawValue }
    }

    func loadReports() async { /* GET /api/reports?limit=50&status=... */ }
    func loadCategories() async { /* GET /api/reports/categories */ }
    func createReport(title: String, category: String?, body: String) async -> Bool { /* encrypt + POST */ }
    func claimReport(id: String) async { /* POST /api/reports/:id/assign */ }
    func closeReport(id: String) async { /* PATCH /api/reports/:id */ }
}
```

## Navigation

Add `.reports` and `.reportDetail(id)` to the Route enum. Add a Reports tab or embed in the existing navigation.

**Option**: Reports can be accessed via:
- Dashboard quick action button (like Android)
- Or added as a section within the Notes tab (since they share similar patterns)

Recommended: Add to Dashboard as a quick action card + accessible from Settings or a "More" menu. Don't add a 6th tab.

## Encryption

Reports use the same encryption as notes (see `NoteCreateView.swift` for reference):
1. Generate random 32-byte `reportKey`
2. Encrypt body JSON with XChaCha20-Poly1305
3. For each admin pubkey, wrap `reportKey` via ECIES
4. Send `encryptedContent` + `readerEnvelopes[]` to API

## BDD Tests — ReportFlowUITests.swift

```
Scenario: Reports list shows empty state
  Given I am authenticated with API
  Then I should see the reports empty state

Scenario: Create a new report
  Given I am authenticated with API
  When I navigate to create report
  And I fill in report title "Test Report"
  And I fill in report body "This is a test report body"
  And I submit the report
  Then I should see "Test Report" in the reports list

Scenario: Report detail shows metadata
  Given I am authenticated with API
  And a report "Test Report" exists
  When I tap on "Test Report"
  Then I should see the report title
  And I should see the report status

Scenario: Claim a waiting report
  Given I am authenticated as admin with API
  And a report exists with status "waiting"
  When I view the report detail
  And I tap claim
  Then the report status should change to "active"

Scenario: Close an active report
  Given I am authenticated as admin with API
  And a report exists with status "active"
  When I view the report detail
  And I tap close
  Then the report status should change to "closed"
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `Sources/Models/Report.swift` | Create |
| `Sources/ViewModels/ReportsViewModel.swift` | Create |
| `Sources/Views/Reports/ReportsView.swift` | Create |
| `Sources/Views/Reports/ReportCreateView.swift` | Create |
| `Sources/Views/Reports/ReportDetailView.swift` | Create |
| `Sources/Navigation/Router.swift` | Modify — add report routes |
| `Sources/Views/Dashboard/DashboardView.swift` | Modify — add reports quick action |
| `Tests/UI/ReportFlowUITests.swift` | Create |

## Dependencies

- Epic 240 (Docker test infra) for BDD tests against live API
- Existing E2EE encryption in CryptoService
- Server `/api/reports` routes (already implemented in RecordsDO)
