# Epic 346: iOS CMS BDD Tests (XCUITest)

## Overview
Comprehensive XCUITests for all CMS features on iOS, covering case CRUD, contact linking, status changes, timeline, and evidence.

## Test Files
- `apps/ios/Tests/UI/CaseManagementUITests.swift` — Case list, detail tabs, status changes, pagination
- `apps/ios/Tests/UI/CaseContactsUITests.swift` — Contact linking, search
- `apps/ios/Tests/UI/CaseTriageUITests.swift` — Triage queue, case conversion
- `apps/ios/Tests/UI/CaseAssignmentUITests.swift` — Assignment dialog

## Pattern
BDD-style with given/when/then blocks:
```swift
func testCaseListShowsEntityTypeTabs() {
    // Given: CMS is enabled with jail-support template
    launchAsAdmin()
    // When: I navigate to the Cases tab
    navigateToTab("Cases")
    // Then: entity type tabs should be visible
    XCTAssertTrue(find("case-type-tabs").waitForExistence(timeout: 10))
}
```

## Coverage
- Case list with entity type tabs
- Case detail with template field rendering
- Status pill interaction
- Timeline with comments
- Contacts tab with linked contacts
- Evidence tab with classification
- Assignment flow
- Pull-to-refresh
- Empty state

## Gate
`bun run ios:uitest` — all CMS XCUITests pass
