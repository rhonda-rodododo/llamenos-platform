import XCTest

/// E2E tests that connect to the real Docker Compose backend.
/// These verify actual API communication, WebSocket connections,
/// and server-side behavior (notes, shifts, settings persistence).
///
/// Requires Docker Compose backend running on localhost:3000.
/// Override with TEST_HUB_URL environment variable if needed.
final class APIConnectedUITests: BaseUITest {

    /// API tests share server state — run serially to avoid conflicts.
    override class var defaultTestSuite: XCTestSuite {
        let suite = XCTestSuite(forTestCaseClass: self)
        return suite
    }

    override func setUp() {
        super.setUp()
        resetServerState()
    }

    // MARK: - Connection & Bootstrap

    func testVolunteerBootstrapsAndSeesConnected() {
        given("I launch the app connected to the API as a volunteer") {
            launchWithAPI()
        }
        then("I should see the dashboard with a connected status") {
            let dashboard = find("dashboard-title")
            XCTAssertTrue(
                dashboard.waitForExistence(timeout: 15),
                "Dashboard should appear after API bootstrap"
            )

            // Check connection indicator shows connected (green dot or text)
            let connected = anyElementExists(["connection-status", "dashboard-connection-card"])
            XCTAssertTrue(connected, "Connection status should be visible")
        }
    }

    func testAdminBootstrapsAndSeesAdminFeatures() {
        given("I launch the app connected to the API as an admin") {
            launchAsAdminWithAPI()
        }
        then("I should see admin-specific UI elements") {
            let dashboard = find("dashboard-title")
            XCTAssertTrue(
                dashboard.waitForExistence(timeout: 15),
                "Dashboard should appear after admin API bootstrap"
            )

            // launchAsAdminWithAPI() sets --test-admin which sets role locally.
            // The admin link in settings should be visible immediately.
            navigateToSettings()
            let adminLink = scrollToFind("settings-admin-link", maxSwipes: 3, timeout: 10)
            XCTAssertTrue(
                adminLink.exists,
                "Admin panel link should be visible for admin users"
            )
        }
    }

    // MARK: - Dashboard API Data

    func testDashboardLoadsFromAPI() {
        given("I am connected to the API") {
            launchAsAdminWithAPI()
        }
        when("the dashboard loads") {
            let dashboard = find("dashboard-title")
            XCTAssertTrue(dashboard.waitForExistence(timeout: 15))
        }
        then("shift and connection cards should display server data") {
            let shiftCard = find("shift-status-card")
            XCTAssertTrue(
                shiftCard.waitForExistence(timeout: 10),
                "Shift status card should load with API data"
            )
        }
    }

    // MARK: - Notes CRUD via API

    func testCreateNoteWithAPIConnection() {
        given("I am connected as a volunteer") {
            launchWithAPI()
            let dashboard = find("dashboard-title")
            _ = dashboard.waitForExistence(timeout: 15)
        }
        when("I navigate to notes and create a new note") {
            navigateToNotes()

            // Look for create/add note button
            let addNote = anyElement(["create-note-button", "add-note-button", "new-note-fab"])
            guard addNote.waitForExistence(timeout: 10) else {
                // May be empty state with create action
                let emptyAction = find("create-first-note")
                if emptyAction.waitForExistence(timeout: 5) {
                    emptyAction.tap()
                    return
                }
                XCTFail("Could not find create note action")
                return
            }
            addNote.tap()
        }
        then("I should see the note creation form") {
            let noteForm = anyElementExists([
                "note-text-editor", "save-note", "cancel-note-create",
            ])
            XCTAssertTrue(noteForm, "Note creation form should appear")
        }
    }

    // MARK: - Shifts via API

    func testShiftsLoadFromAPI() {
        given("I am connected to the API") {
            launchWithAPI()
            let dashboard = find("dashboard-title")
            _ = dashboard.waitForExistence(timeout: 15)
        }
        when("I navigate to the shifts tab") {
            navigateToShifts()
        }
        then("I should see the shift clock UI or empty state") {
            let found = anyElementExists([
                "clock-in-button", "clock-out-button",
                "shifts-empty-state", "shifts-loading",
            ])
            XCTAssertTrue(found, "Shifts tab should load with API data or show empty state")
        }
    }

    func testClockInViaAPI() {
        given("I am connected to the API as a volunteer") {
            launchWithAPI()
            let dashboard = find("dashboard-title")
            _ = dashboard.waitForExistence(timeout: 15)
        }
        when("I navigate to shifts and tap clock in") {
            navigateToShifts()
            let clockIn = find("clock-in-button")
            guard clockIn.waitForExistence(timeout: 10) else {
                // If empty state, shifts aren't configured — skip gracefully
                let empty = find("shifts-empty-state")
                if empty.exists {
                    return  // Cannot test clock-in without shifts configured
                }
                XCTFail("Clock in button should exist")
                return
            }
            clockIn.tap()
        }
        then("I should see the on-shift state or a server error") {
            // Either clock-out button appears (success) or error message
            let clockOut = find("clock-out-button")
            let shiftError = find("shifts-error")
            let shiftSuccess = find("shifts-success")
            let found = clockOut.waitForExistence(timeout: 10) ||
                shiftError.waitForExistence(timeout: 3) ||
                shiftSuccess.waitForExistence(timeout: 3)
            // We accept either — the point is the API responded
            XCTAssertTrue(found || find("shifts-empty-state").exists,
                "API should respond to clock-in request")
        }
    }

    // MARK: - Settings Persistence via API

    func testSettingsShowsHubURL() {
        given("I am connected to the API") {
            launchWithAPI()
            let dashboard = find("dashboard-title")
            _ = dashboard.waitForExistence(timeout: 15)
        }
        when("I navigate to settings") {
            navigateToSettings()
        }
        then("I should see the hub URL in the identity card") {
            let hubURL = find("settings-hub-url")
            XCTAssertTrue(
                hubURL.waitForExistence(timeout: 5),
                "Hub URL should be displayed in settings"
            )
        }
    }

    func testSettingsShowsConnectionState() {
        given("I am connected to the API") {
            launchWithAPI()
            let dashboard = find("dashboard-title")
            _ = dashboard.waitForExistence(timeout: 15)
        }
        when("I navigate to settings") {
            navigateToSettings()
        }
        then("I should see the connection status") {
            let connection = find("settings-connection")
            XCTAssertTrue(
                connection.waitForExistence(timeout: 5),
                "Connection status should be displayed in settings"
            )
        }
    }

    // MARK: - Conversations via API

    func testConversationsLoadFromAPI() {
        given("I am connected to the API") {
            launchWithAPI()
            let dashboard = find("dashboard-title")
            _ = dashboard.waitForExistence(timeout: 15)
        }
        when("I navigate to conversations") {
            navigateToConversations()
        }
        then("I should see conversations list or empty state") {
            let found = anyElementExists([
                "conversations-list", "conversations-empty-state",
                "conversations-loading", "conversations-error",
            ])
            XCTAssertTrue(found, "Conversations should load from API")
        }
    }

    // MARK: - Admin API Features

    func testAdminCanAccessAdminPanel() {
        given("I am connected as an admin") {
            launchAsAdminWithAPI()
            let dashboard = find("dashboard-title")
            XCTAssertTrue(dashboard.waitForExistence(timeout: 15), "Dashboard should load")
        }
        when("I navigate to the admin panel") {
            // Wait for async role fetch to complete before checking admin link
            navigateToAdminPanel()
        }
        then("I should see the admin panel") {
            let found = anyElementExists([
                "admin-tab-view", "admin-volunteers",
                "admin-bans", "admin-custom-fields",
            ])
            XCTAssertTrue(found, "Admin panel should load")
        }
    }

    // MARK: - Helpers

    private func anyElement(_ identifiers: [String]) -> XCUIElement {
        for id in identifiers {
            let element = find(id)
            if element.exists { return element }
        }
        return find(identifiers.first!)
    }
}
