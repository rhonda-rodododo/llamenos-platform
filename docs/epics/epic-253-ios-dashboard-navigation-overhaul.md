# Epic 253: iOS Dashboard & Navigation Overhaul

## Problem

The dashboard and several views use Android-style patterns instead of native iOS design:

### Dashboard Issues
1. **Custom title bar hides NavigationStack** — `DashboardView` sets `.navigationBarHidden(true)` and renders its own `HStack` title bar with a lock icon. This loses the standard iOS large title behavior, search integration, and scroll-to-collapse.
2. **Stacked full-width cards** — All dashboard sections are `RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6))` cards in a `ScrollView > VStack`. This is a Material Design pattern. iOS uses `.insetGrouped` Lists or compact summary rows.
3. **Quick action navigation links** — Reports, Contacts, Blasts are full-width cards with chevrons. iOS uses compact List rows or a 2-column grid.
4. **Custom connection status pill** — Capsule with colored dot. iOS Settings uses simple `LabeledContent` rows for connection status.

### Shifts Issues
5. **Shifts uses ScrollView + VStack** instead of a List. The clock card is a manual `RoundedRectangle` — should be a prominent section in a List.
6. **Day sections are custom VStacks** — Should be proper List sections with headers.

### Admin Panel Issues
7. **5-segment segmented control** — `AdminTabView` uses `.pickerStyle(.segmented)` with 5 tabs (Volunteers, Bans, Audit Log, Invites, Fields). On iPhone, segment labels are truncated. iOS uses a List-based menu for 5+ options, or a sidebar on iPad.

### What's Already Good
- **NotesView**: Proper `NavigationStack`, `.navigationTitle(.large)`, `List(.plain)`, `ContentUnavailableView` for empty state, toolbar button — this is iOS-native.
- **ConversationsView**: Same pattern as NotesView — good.
- **SettingsView**: Proper grouped `List` with sections, `LabeledContent`, `NavigationLink`, `Toggle` — excellent iOS pattern.
- **LoginView**: Clean centered layout with `.borderedProminent` buttons — fine for auth flows.

## Scope

Redesign DashboardView, ShiftsView, and AdminTabView to use native iOS patterns. Do NOT touch views that are already well-designed (Notes, Conversations, Settings, Auth flows).

## Design Specifications

### DashboardView Redesign

**Pattern: Grouped List with summary sections**

Replace the ScrollView+VStack+Cards approach with a `List(.insetGrouped)`:

```swift
NavigationStack {
    List {
        // Identity section (compact)
        Section {
            LabeledContent("Identity") {
                Text(truncatedNpub)
                    .font(.system(.caption, design: .monospaced))
            }
            LabeledContent("Hub") {
                Text(hubURL)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            LabeledContent("Connection") {
                HStack(spacing: 6) {
                    Circle().fill(connectionColor).frame(width: 8, height: 8)
                    Text(connectionState.displayText)
                }
            }
        }

        // Shift status section
        Section("Shift") {
            HStack {
                Label(isOnShift ? "On Shift" : "Off Shift", systemImage: "clock.badge.checkmark")
                Spacer()
                if isOnShift {
                    Text(elapsedTime)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.green)
                }
            }
        }

        // Stats section (compact row)
        Section("Activity") {
            LabeledContent {
                Text("\(activeCallCount)")
                    .foregroundStyle(.blue)
            } label: {
                Label("Active Calls", systemImage: "phone.arrow.down.left")
            }
            LabeledContent {
                Text("\(recentNoteCount)")
                    .foregroundStyle(.orange)
            } label: {
                Label("Recent Notes", systemImage: "note.text")
            }
        }

        // Quick actions as NavigationLinks
        Section {
            NavigationLink { ReportsView() } label: {
                Label("Reports", systemImage: "doc.text.fill")
            }
            if appState.isAdmin {
                NavigationLink { ContactsView() } label: {
                    Label("Contacts", systemImage: "person.crop.circle.badge.clock")
                }
                NavigationLink { BlastsView() } label: {
                    Label("Message Blasts", systemImage: "megaphone.fill")
                }
            }
        }
    }
    .navigationTitle("Dashboard")
    .navigationBarTitleDisplayMode(.large)
    .refreshable { await vm.refresh() }
    .toolbar {
        ToolbarItem(placement: .primaryAction) {
            Button { appState.lockApp() } label: {
                Image(systemName: "lock.fill")
            }
        }
    }
}
```

**Key changes:**
- Remove `.navigationBarHidden(true)` and custom title bar
- Use `.navigationTitle("Dashboard")` with `.large` display mode
- Replace `RoundedRectangle` cards with List sections
- Quick actions become simple `NavigationLink` rows with `Label`
- Connection status, identity, hub URL become `LabeledContent` rows
- Lock button moves to toolbar (standard iOS placement)
- Recent notes remain as a compact count; tapping navigates to Notes tab

### ShiftsView Redesign

**Pattern: List with sections per day**

```swift
NavigationStack {
    List {
        // Clock in/out section (prominent)
        Section {
            VStack(spacing: 12) {
                HStack {
                    Label(isOnShift ? "On Shift" : "Off Shift",
                          systemImage: isOnShift ? "clock.badge.checkmark.fill" : "clock")
                    Spacer()
                    if isOnShift {
                        Text(elapsedTime).monospacedDigit().foregroundStyle(.green)
                    }
                }

                Button(isOnShift ? "Clock Out" : "Clock In") { ... }
                    .buttonStyle(.borderedProminent)
                    .tint(isOnShift ? .red : .green)
                    .frame(maxWidth: .infinity)
            }
        }

        // Each day is a section
        ForEach(shiftDays) { day in
            Section {
                ForEach(day.shifts) { shift in
                    ShiftRow(shift: shift, onSignUp: { ... })
                }
            } header: {
                HStack {
                    Text(day.name)
                    if day.isToday {
                        Text("Today")
                            .font(.caption2).bold()
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(.blue))
                    }
                }
            }
        }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("Shifts")
    .navigationBarTitleDisplayMode(.large)
    .refreshable { ... }
}
```

### AdminTabView Redesign

**Pattern: List-based menu navigation (replacing segmented control)**

The 5-segment picker is replaced with a navigation list:

```swift
NavigationStack {
    List {
        NavigationLink { VolunteersView(viewModel: vm) } label: {
            Label("Volunteers", systemImage: "person.2.fill")
        }
        .accessibilityIdentifier("admin-volunteers")

        NavigationLink { BanListView(viewModel: vm) } label: {
            Label("Ban List", systemImage: "hand.raised.fill")
        }
        .accessibilityIdentifier("admin-bans")

        NavigationLink { AuditLogView(viewModel: vm) } label: {
            Label("Audit Log", systemImage: "list.bullet.clipboard")
        }
        .accessibilityIdentifier("admin-audit-log")

        NavigationLink { InviteView(viewModel: vm) } label: {
            Label("Invites", systemImage: "envelope.badge.person.crop")
        }
        .accessibilityIdentifier("admin-invites")

        NavigationLink { CustomFieldsView(viewModel: vm) } label: {
            Label("Custom Fields", systemImage: "list.bullet.rectangle")
        }
        .accessibilityIdentifier("admin-custom-fields")
    }
    .navigationTitle("Admin")
    .navigationBarTitleDisplayMode(.large)
}
```

This pattern matches iOS Settings app — each admin section is a full navigation destination rather than a tab.

**Note:** The `AdminTab` enum can be kept for type-safety, but `.pickerStyle(.segmented)` and the `ZStack` content switch are removed. Each child view gets its own `NavigationLink` destination. The shared `AdminViewModel` is still passed to each child view.

## XCUITest Migration — MANDATORY

Every test file that touches Dashboard, Shifts, or Admin MUST be updated. Below is the complete selector migration plan.

### AdminTabView: Segmented Control → List Navigation

**Affected files:** `AdminFlowUITests.swift`, `AdminCustomFieldsUITests.swift`, `BaseUITest.swift`

| Old Pattern | New Pattern |
|---|---|
| `find("admin-tab-picker")` → tap segments by index | `find("admin-volunteers").tap()` / `find("admin-bans").tap()` etc. |
| `tabPicker.buttons.element(boundBy: 1).tap()` (bans) | `find("admin-bans").tap()` |
| `tabPicker.buttons.element(boundBy: 2).tap()` (audit) | `find("admin-audit-log").tap()` |
| `tabPicker.buttons.element(boundBy: 3).tap()` (invites) | `find("admin-invites").tap()` |
| `tabPicker.buttons.element(boundBy: 4).tap()` (fields) | `find("admin-custom-fields").tap()` |
| `find("admin-tab-view")` existence check | Keep — the admin list view still uses this identifier |

**BaseUITest.swift `navigateToAdminPanel()`:** Currently navigates to Settings → taps `settings-admin-panel` → waits for `admin-tab-view`. This still works but no longer waits for `admin-tab-picker`. Update:
```swift
func navigateToAdminPanel() {
    navigateToSettings()
    let adminButton = scrollToFind("settings-admin-panel", maxSwipes: 5, timeout: 10)
    guard adminButton.exists else {
        XCTFail("Admin panel button should exist for admin users")
        return
    }
    adminButton.tap()
    let adminView = find("admin-tab-view")
    _ = adminView.waitForExistence(timeout: 5)
}
```

**AdminCustomFieldsUITests.swift `navigateToCustomFields()`:** Replace segmented picker tap with NavigationLink tap:
```swift
private func navigateToCustomFields() {
    navigateToAdminPanel()
    let customFieldsLink = find("admin-custom-fields")
    guard customFieldsLink.waitForExistence(timeout: 5) else {
        XCTFail("Custom Fields link should exist in admin panel")
        return
    }
    customFieldsLink.tap()
    _ = anyElementExists(["custom-fields-list", "custom-fields-empty-state", "custom-fields-loading"])
}
```

**AdminFlowUITests.swift — ALL tab navigation tests:** Replace every `tabPicker.buttons.element(boundBy: N)` with the named identifier:
```swift
// BEFORE (testBanListTabShowsContent)
let tabPicker = find("admin-tab-picker")
let segments = tabPicker.buttons
segments.element(boundBy: 1).tap()

// AFTER
let bansLink = find("admin-bans")
guard bansLink.waitForExistence(timeout: 5) else { return }
bansLink.tap()
```

**AdminFlowUITests.swift `testAdminPanelOpens()`:** Remove `admin-tab-picker` assertion, replace with checking that admin list items exist:
```swift
// BEFORE
let tabPicker = find("admin-tab-picker")
XCTAssertTrue(tabPicker.waitForExistence(timeout: 3))

// AFTER
let volunteersLink = find("admin-volunteers")
XCTAssertTrue(volunteersLink.waitForExistence(timeout: 5),
    "Admin panel should show navigation items")
```

### DashboardView: Card Layout → List Layout

**Affected files:** `DashboardUITests.swift`, `BlastsUITests.swift`, `ReportFlowUITests.swift`, `ContactsUITests.swift`

| Old Identifier | Status | Notes |
|---|---|---|
| `dashboard-title` | KEEP — add `.accessibilityIdentifier("dashboard-title")` to a List row or keep on nav title | Tests check existence only |
| `connection-status` | KEEP on LabeledContent row | Tests use `anyElementExists` |
| `shift-status-card` | KEEP on shift Section | Tests check existence |
| `lock-app` | KEEP — moves to toolbar button | Tests tap this |
| `dashboard-npub` | KEEP on identity LabeledContent | Tests check existence |
| `active-calls-card` | KEEP on activity Section | Tests check existence |
| `recent-notes-card` | KEEP on notes row | Tests check existence |
| `dashboard-reports-action` | KEEP on NavigationLink | `ReportFlowUITests` navigates via this |
| `dashboard-contacts-action` | KEEP on NavigationLink | `ContactsUITests` navigates via this |
| `dashboard-blasts-action` | KEEP on NavigationLink | `BlastsUITests` navigates via this |

**Critical:** `BlastsUITests`, `ReportFlowUITests`, and `ContactsUITests` all navigate to their features via dashboard quick action identifiers. These MUST be preserved on the new NavigationLink rows.

**`DashboardUITests.testDashboardShowsDashboardTitle()`:** Currently looks for `find("dashboard-title")`. In the new List-based layout, SwiftUI's `.navigationTitle("Dashboard")` doesn't get this identifier. Must either:
- Add an explicit `.accessibilityIdentifier("dashboard-title")` to the nav bar (tricky)
- OR keep a hidden element with this identifier
- OR update the test to check for the navigation title via `app.navigationBars["Dashboard"].exists`

**Recommended:** Update DashboardUITests to use `app.navigationBars.firstMatch` check since we're adopting proper `.navigationTitle`:
```swift
func testDashboardShowsDashboardTitle() {
    then("I should see the dashboard title") {
        let navBar = app.navigationBars.firstMatch
        XCTAssertTrue(navBar.waitForExistence(timeout: 10), "Navigation bar should exist")
    }
}
```

### ShiftsView: Card Layout → List Layout

**Affected files:** `ShiftFlowUITests.swift`

| Old Identifier | Status | Notes |
|---|---|---|
| `shift-status-label` | KEEP on status HStack | Tests check text content |
| `clock-in-button` / `clock-out-button` | KEEP on Button | Tests tap these |
| `shift-elapsed-time` | KEEP on timer Text | Tests may check existence |
| `weekly-schedule-header` | KEEP on section header or label | Tests check existence |
| `shift-day-{index}` | KEEP on Section | Tests check day sections |
| `shift-card-{id}` | KEEP on row | Tests check existence |
| `signup-shift-{id}` | KEEP on signup Button | Tests may tap |
| `shifts-empty-state` / `shifts-loading` / `shifts-error` | KEEP | Tests check existence |

**Note:** `ShiftFlowUITests` does NOT inherit from `BaseUITest` — it has its own `find()`, `anyElementExists()`, and `scrollToFind()` helpers inline. These still work with the List layout since they search by identifier.

### Quick Action Navigation (Dashboard → Feature Views)

**BlastsUITests, ContactsUITests, ReportFlowUITests** all navigate via dashboard quick actions. With the new List layout:
- Quick actions are NavigationLinks in a Section (not cards in a ScrollView)
- `scrollToFind` and `scrollAndTap` still work with List rows
- BUT: List rows may be visible without scrolling since they're more compact than cards
- Test helpers remain valid — just faster since less scrolling needed

### Test Count Target
All **107 XCUITests** must pass after changes. Run full suite:
```bash
xcodebuild test -scheme Llamenos -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | grep --line-buffered -E '(Test Case|FAIL|pass|error:)'
```

## Files Modified
- `apps/ios/Sources/Views/Dashboard/DashboardView.swift` — complete rewrite
- `apps/ios/Sources/Views/Shifts/ShiftsView.swift` — rewrite to List-based
- `apps/ios/Sources/Views/Admin/AdminTabView.swift` — replace segmented with List nav
- `apps/ios/Sources/Views/Admin/AdminViewModel.swift` — may need to adjust for separate nav destinations
- `apps/ios/Tests/UI/AdminCustomFieldsUITests.swift` — rewrite `navigateToCustomFields()`, remove segmented picker references
- `apps/ios/Tests/UI/AdminFlowUITests.swift` — rewrite all tab navigation to use named identifiers
- `apps/ios/Tests/UI/DashboardUITests.swift` — update `dashboard-title` test for navigation bar
- `apps/ios/Tests/UI/BlastsUITests.swift` — verify quick action navigation still works (likely no changes)
- `apps/ios/Tests/UI/ReportFlowUITests.swift` — verify quick action navigation still works (likely no changes)
- `apps/ios/Tests/UI/ContactsUITests.swift` — verify quick action navigation still works (likely no changes)
- `apps/ios/Tests/UI/ShiftFlowUITests.swift` — verify identifiers preserved (likely no changes)
- `apps/ios/Tests/UI/Helpers/BaseUITest.swift` — update `navigateToAdminPanel()` to remove picker wait

## Dependencies
- **Epic 252 (Localization)** should be done first so we use proper localized strings, not raw keys
- But can be done in parallel if needed — localization keys don't change, just the values resolve

## Security Considerations
- No crypto or auth changes
- Lock button moves to toolbar but same `appState.lockApp()` call
- Admin role guard remains (`if appState.isAdmin`)
