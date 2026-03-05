# Epic 254: iOS Detail & Create Form Polish

## Problem

Most list and detail views in the iOS app already follow proper iOS patterns (List, ContentUnavailableView, NavigationStack with large titles). However, a few areas need minor polish:

### Verified Good (no changes needed)
- **NotesView** — proper List(.plain), .navigationTitle(.large), ContentUnavailableView, toolbar
- **ConversationsView** — same pattern, with status filter menu
- **SettingsView** — grouped List with sections, LabeledContent, Toggle, Picker
- **ReportsView** — proper List with filter menu, ContentUnavailableView
- **BlastsView** — List(.insetGrouped) with subscriber stats section
- **ContactsView** — List with .searchable, pagination
- **ContactTimelineView** — List(.insetGrouped) with grouped sections
- **HelpView** — DisclosureGroup FAQ (correct iOS pattern)

### Create/Edit Forms Need Polish
1. **ReportCreateView** — May use manual VStack layout; should use `Form` for native grouped input
2. **CreateBlastView** — May use manual VStack layout; should use `Form`
3. **NoteCreateView** — May use manual VStack; should use `Form` with sections
4. **CustomFieldEditView** — Form for field creation/editing

### Date Parsing Duplication
5. **Duplicated `parseDate()` function** — `ReportRowView`, `BlastRowView`, `ContactRowView`, `TimelineEventRow` all have identical ISO8601 date parsing. Extract to a shared utility.

## Scope

This is a light-touch polish epic:
- Convert create/edit forms to use SwiftUI `Form`
- Extract shared date parsing utility
- Ensure all forms have consistent toolbar placement (Cancel/Save in navigation bar)

## Implementation Plan

### Step 1: Create shared DateFormatting utility
```swift
// apps/ios/Sources/Utilities/DateFormatting.swift
import Foundation

enum DateFormatting {
    private static let isoFull: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parseISO(_ string: String) -> Date? {
        isoFull.date(from: string) ?? isoBasic.date(from: string)
    }
}
```

Replace all inline `parseDate()` functions in row views with `DateFormatting.parseISO()`.

### Step 2: Convert create forms to Form

**Pattern for all create/edit sheets:**
```swift
NavigationStack {
    Form {
        Section("Details") {
            TextField("Title", text: $title)
            // ... fields
        }
        Section {
            TextEditor(text: $body)
                .frame(minHeight: 120)
        } header: {
            Text("Content")
        }
    }
    .navigationTitle("New Report")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button("Save") { ... }
                .disabled(!isValid)
        }
    }
}
```

### Step 3: Audit accessibility identifiers
Ensure all create forms have consistent identifiers for XCUITests.

## Files Modified
- `apps/ios/Sources/Views/Reports/ReportCreateView.swift` — Form layout
- `apps/ios/Sources/Views/Blasts/CreateBlastView.swift` — Form layout
- `apps/ios/Sources/Views/Notes/NoteCreateView.swift` — Form layout (if not already)
- `apps/ios/Sources/Views/Admin/CustomFieldEditView.swift` — verify Form usage
- `apps/ios/Sources/Views/Reports/ReportRowView` (inline in ReportsView.swift) — use DateFormatting
- `apps/ios/Sources/Views/Blasts/BlastRowView` (inline in BlastsView.swift) — use DateFormatting
- `apps/ios/Sources/Views/Contacts/ContactRowView` (inline in ContactsView.swift) — use DateFormatting
- `apps/ios/Sources/Views/Contacts/TimelineEventRow` (inline in ContactTimelineView.swift) — use DateFormatting
- New: `apps/ios/Sources/Utilities/DateFormatting.swift`

## XCUITest Migration — MANDATORY

Converting VStack to Form changes the SwiftUI view hierarchy, which can affect element discovery. All identifiers MUST be preserved.

### ReportFlowUITests.swift
Tests navigate to reports via `dashboard-reports-action`, then check:
- `create-report-button` — toolbar button, unchanged
- `report-title-input` — TextField, must keep identifier in Form
- `report-body-input` — TextEditor, must keep identifier in Form
- `report-submit-button` — toolbar/button, must keep identifier
- `cancel-report-create` — toolbar button, must keep identifier
- `reports-filter-button` — toolbar, unchanged

**Action:** After converting ReportCreateView to Form, verify all 6 tests in ReportFlowUITests pass.

### BlastsUITests.swift
Tests navigate via `dashboard-blasts-action`, then check:
- `blast-name-input` — TextField, must keep in Form
- `blast-message-input` — TextEditor, must keep in Form
- `blast-channel-sms` — Toggle, must keep in Form
- `blast-submit-button` — must keep
- `cancel-blast-create` — must keep

**Action:** After converting CreateBlastView to Form, verify all 7 tests in BlastsUITests pass.

### AdminCustomFieldsUITests.swift
Tests check field editor form elements:
- `field-label-input` — must keep in Form
- `field-type-picker` — must keep
- `field-context-picker` — must keep
- `field-required-toggle` — must keep
- `field-save-button` — must keep
- `cancel-field-edit` — must keep

**Action:** After verifying CustomFieldEditView Form usage, run all 6 tests.

### DateFormatting extraction
Pure refactor — no UI changes, no test impact.

### Test count target
All **107 XCUITests** must pass. Run:
```bash
xcodebuild test -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | grep --line-buffered -E '(Test Case|FAIL|pass|error:)'
```

## Dependencies
- **Epic 252 (Localization)** — should be done first for proper text
- **Epic 253 (Dashboard/Navigation)** — independent, can run in parallel

## Security Considerations
- No crypto or auth changes
