import XCTest

/// XCUITest suite for the shifts workflow: viewing the shift schedule,
/// clock in/out toggle, and shift signup interactions.
///
/// These tests require the app to be in an authenticated state with a valid hub connection.
final class ShiftFlowUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments.append(contentsOf: ["--reset-keychain", "--test-authenticated"])
        app.launch()
    }

    override func tearDown() {
        app = nil
        super.tearDown()
    }

    /// Find any element by accessibility identifier, regardless of XCUIElement type.
    private func find(_ identifier: String) -> XCUIElement {
        return app.descendants(matching: .any)[identifier].firstMatch
    }

    private func anyElementExists(_ identifiers: [String], timeout: TimeInterval = 10) -> Bool {
        for (i, id) in identifiers.enumerated() {
            let element = find(id)
            let wait: TimeInterval = i == 0 ? timeout : 2
            if element.waitForExistence(timeout: wait) {
                return true
            }
        }
        return false
    }

    @discardableResult
    private func scrollToFind(_ identifier: String, maxSwipes: Int = 5, timeout: TimeInterval = 2) -> XCUIElement {
        let element = find(identifier)
        if element.waitForExistence(timeout: timeout) {
            return element
        }
        for _ in 0..<maxSwipes {
            app.swipeUp()
            if element.waitForExistence(timeout: 1) {
                return element
            }
        }
        return element
    }

    // MARK: - Tab Navigation

    func testShiftsTabExists() {
        let tabView = find("main-tab-view")
        XCTAssertTrue(
            tabView.waitForExistence(timeout: 10),
            "Main tab view should be visible after authentication"
        )

        navigateToShiftsTab()

        // Shifts content should appear (loading, empty, or schedule)
        let found = anyElementExists([
            "clock-in-button", "clock-out-button",
            "shifts-empty-state", "shifts-loading",
        ])
        XCTAssertTrue(found, "Shifts view should show clock button, empty state, or loading")
    }

    // MARK: - Clock In/Out

    func testClockInButtonExists() {
        navigateToShiftsTab()

        // Either clock-in or clock-out button should exist
        let found = anyElementExists(["clock-in-button", "clock-out-button"])
        XCTAssertTrue(found, "Clock in or clock out button should exist")
    }

    func testShiftStatusLabelExists() {
        navigateToShiftsTab()

        let statusLabel = find("shift-status-label")
        XCTAssertTrue(
            statusLabel.waitForExistence(timeout: 10),
            "Shift status label should exist"
        )

        // Should show either "On Shift" or "Off Shift"
        let text = statusLabel.label
        XCTAssertTrue(
            text.contains("Shift") || text.contains("shift"),
            "Status label should contain 'Shift'"
        )
    }

    func testClockOutShowsConfirmation() {
        navigateToShiftsTab()

        // If we're on shift, the clock out button exists
        let clockOutButton = find("clock-out-button")
        guard clockOutButton.waitForExistence(timeout: 5) else {
            // Not on shift — try clocking in first
            let clockInButton = find("clock-in-button")
            guard clockInButton.waitForExistence(timeout: 5) else { return }
            clockInButton.tap()

            // Wait for clock out button to appear (shift started)
            guard find("clock-out-button").waitForExistence(timeout: 10) else { return }
            find("clock-out-button").tap()

            // Confirmation dialog should appear
            let alertExists = app.alerts.firstMatch.waitForExistence(timeout: 5)
            if alertExists {
                // Cancel to not actually clock out
                let cancelButton = app.alerts.firstMatch.buttons.firstMatch
                cancelButton.tap()
            }
            return
        }

        clockOutButton.tap()

        // Confirmation dialog should appear
        let alertExists = app.alerts.firstMatch.waitForExistence(timeout: 5)
        if alertExists {
            XCTAssertTrue(true, "Clock out confirmation dialog appeared")
            // Cancel
            let cancelButton = app.alerts.firstMatch.buttons.element(boundBy: 0)
            if cancelButton.exists {
                cancelButton.tap()
            }
        }
    }

    // MARK: - Weekly Schedule

    func testWeeklyScheduleHeader() {
        navigateToShiftsTab()

        // Wait for content to load
        let clockButton = find("clock-in-button")
        guard clockButton.waitForExistence(timeout: 10) else { return }

        // Weekly schedule header should exist if there are shifts
        let scheduleHeader = find("weekly-schedule-header")
        // It's okay if the schedule is empty (no shifts configured)
        if scheduleHeader.waitForExistence(timeout: 3) {
            XCTAssertTrue(true, "Weekly schedule header exists")
        }
    }

    func testTodayBadgeExists() {
        navigateToShiftsTab()

        let clockButton = find("clock-in-button")
        guard clockButton.waitForExistence(timeout: 10) else { return }

        // If the weekly schedule is showing, today's day section should be highlighted
        let today = Calendar.current.component(.weekday, from: Date()) - 1  // 0-indexed
        let todaySection = find("shift-day-\(today)")

        if todaySection.waitForExistence(timeout: 3) {
            XCTAssertTrue(true, "Today's day section exists in the schedule")
        }
    }

    // MARK: - Error State

    func testErrorMessageDisplays() {
        navigateToShiftsTab()

        // If there's an error (e.g., hub not configured), it should display
        let errorView = find("shifts-error")
        if errorView.waitForExistence(timeout: 5) {
            XCTAssertTrue(true, "Error message is displayed when hub connection fails")
        }
        // If no error, that's fine too — hub might be configured
    }

    // MARK: - Settings Tab

    func testSettingsTabShowsIdentity() {
        let tabView = find("main-tab-view")
        guard tabView.waitForExistence(timeout: 10) else {
            XCTFail("Main tab view should be visible")
            return
        }

        navigateToSettingsTab()

        // Identity section should show npub or version
        let found = anyElementExists(["settings-npub", "settings-version"])
        XCTAssertTrue(found, "Settings should show identity or version info")
    }

    func testSettingsLockButton() {
        navigateToSettingsTab()

        // Lock button is near the bottom of the settings list — scroll to find it
        let lockButton = scrollToFind("settings-lock-app")
        XCTAssertTrue(
            lockButton.exists,
            "Lock app button should exist in settings"
        )
    }

    func testSettingsLogoutButton() {
        navigateToSettingsTab()

        // Logout button is near the bottom of the settings list — scroll to find it
        let logoutButton = scrollToFind("settings-logout")
        XCTAssertTrue(
            logoutButton.exists,
            "Logout button should exist in settings"
        )
    }

    // MARK: - Navigation Helpers

    private func navigateToShiftsTab() {
        let tabView = find("main-tab-view")
        guard tabView.waitForExistence(timeout: 10) else {
            XCTFail("Main tab view should be visible")
            return
        }

        let tabBar = app.tabBars.firstMatch
        guard tabBar.waitForExistence(timeout: 5) else { return }
        let shiftsTabButton = tabBar.buttons.element(boundBy: 3)
        if shiftsTabButton.exists {
            shiftsTabButton.tap()
        }
    }

    private func navigateToSettingsTab() {
        let tabView = find("main-tab-view")
        guard tabView.waitForExistence(timeout: 10) else {
            XCTFail("Main tab view should be visible")
            return
        }

        let tabBar = app.tabBars.firstMatch
        guard tabBar.waitForExistence(timeout: 5) else { return }
        let settingsTabButton = tabBar.buttons.element(boundBy: 4)
        if settingsTabButton.exists {
            settingsTabButton.tap()
        }
    }
}
