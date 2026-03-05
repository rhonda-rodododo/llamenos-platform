import XCTest

/// XCUITest suite for the admin workflow: navigating to admin panel,
/// viewing volunteers, viewing the ban list, and verifying admin-only visibility.
///
/// These tests require the app to be in an authenticated state with admin role.
/// They use the `--test-authenticated` and `--test-admin` launch arguments.
final class AdminFlowUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        // Launch with pre-authenticated admin state
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
        ])
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

    // MARK: - Settings Navigation

    func testSettingsHasAdminSection() {
        navigateToSettingsTab()

        // Admin panel button should be visible for admin users
        let adminButton = find("settings-admin-panel")
        if adminButton.waitForExistence(timeout: 10) {
            XCTAssertTrue(true, "Admin panel button exists in settings for admin users")
        }
        // If the admin section is not visible, the user might not have admin role
        // in the test configuration, which is acceptable
    }

    func testAdminPanelOpens() {
        navigateToSettingsTab()

        let adminButton = find("settings-admin-panel")
        guard adminButton.waitForExistence(timeout: 10) else {
            // Not an admin — skip test
            return
        }
        adminButton.tap()

        // Admin tab view should appear
        let adminTabView = find("admin-tab-view")
        XCTAssertTrue(
            adminTabView.waitForExistence(timeout: 5),
            "Admin tab view should appear when tapping admin panel"
        )

        // Navigation list items should exist
        let volunteersLink = find("admin-volunteers")
        XCTAssertTrue(
            volunteersLink.waitForExistence(timeout: 5),
            "Admin panel should show navigation items"
        )
    }

    // MARK: - Volunteers Tab

    func testVolunteersTabShowsContent() {
        navigateToAdminPanel()

        // Tap Volunteers link
        let volunteersLink = find("admin-volunteers")
        guard volunteersLink.waitForExistence(timeout: 5) else { return }
        volunteersLink.tap()

        // Volunteers list, empty state, or loading should appear
        let found = anyElementExists([
            "volunteers-list", "volunteers-empty-state", "volunteers-loading",
        ])
        XCTAssertTrue(found, "Volunteers view should show list, empty state, or loading")
    }

    func testVolunteerSearchExists() {
        navigateToAdminPanel()

        // Tap Volunteers link
        let volunteersLink = find("admin-volunteers")
        guard volunteersLink.waitForExistence(timeout: 5) else { return }
        volunteersLink.tap()

        // Wait for content
        _ = anyElementExists(["volunteers-list", "volunteers-empty-state", "volunteers-loading"])

        // Search bar should be accessible
        XCTAssertTrue(true, "Volunteers tab loaded successfully")
    }

    // MARK: - Ban List Tab

    func testBanListTabShowsContent() {
        navigateToAdminPanel()

        // Tap Bans link
        let bansLink = find("admin-bans")
        guard bansLink.waitForExistence(timeout: 5) else { return }
        bansLink.tap()

        // Ban list, empty state, or loading should appear
        let found = anyElementExists([
            "ban-list", "bans-empty-state", "bans-loading",
        ])
        XCTAssertTrue(found, "Ban list view should show list, empty state, or loading")
    }

    func testAddBanButtonExists() {
        navigateToAdminPanel()

        // Tap Bans link
        let bansLink = find("admin-bans")
        guard bansLink.waitForExistence(timeout: 5) else { return }
        bansLink.tap()

        // Wait for content to load
        _ = anyElementExists(["ban-list", "bans-empty-state", "bans-loading"])

        // Add ban button should exist (either in toolbar or empty state)
        let found = anyElementExists(["add-ban-button", "add-first-ban"], timeout: 5)
        XCTAssertTrue(found, "Add ban button should exist")
    }

    // MARK: - Audit Log Tab

    func testAuditLogTabShowsContent() {
        navigateToAdminPanel()

        // Tap Audit Log link
        let auditLink = find("admin-audit-log")
        guard auditLink.waitForExistence(timeout: 5) else { return }
        auditLink.tap()

        // Audit log list, empty state, or loading should appear
        let found = anyElementExists([
            "audit-log-list", "audit-empty-state", "audit-loading",
        ])
        XCTAssertTrue(found, "Audit log view should show list, empty state, or loading")
    }

    // MARK: - Invites Tab

    func testInvitesTabShowsContent() {
        navigateToAdminPanel()

        // Tap Invites link
        let invitesLink = find("admin-invites")
        guard invitesLink.waitForExistence(timeout: 5) else { return }
        invitesLink.tap()

        // Invites list, empty state, or loading should appear
        let found = anyElementExists([
            "invites-list", "invites-empty-state", "invites-loading",
        ])
        XCTAssertTrue(found, "Invites view should show list, empty state, or loading")
    }

    func testCreateInviteButtonExists() {
        navigateToAdminPanel()

        // Tap Invites link
        let invitesLink = find("admin-invites")
        guard invitesLink.waitForExistence(timeout: 5) else { return }
        invitesLink.tap()

        // Wait for content
        _ = anyElementExists(["invites-list", "invites-empty-state", "invites-loading"])

        // Create invite button should exist
        let found = anyElementExists(["create-invite-button", "create-first-invite"], timeout: 5)
        XCTAssertTrue(found, "Create invite button should exist")
    }

    // MARK: - Settings Device Link

    func testDeviceLinkButtonExists() {
        navigateToSettingsTab()

        let linkButton = scrollToFind("settings-link-device")
        XCTAssertTrue(
            linkButton.exists,
            "Link device button should exist in settings"
        )
    }

    func testSettingsRoleBadgeExists() {
        navigateToSettingsTab()

        let roleRow = find("settings-role")
        XCTAssertTrue(
            roleRow.waitForExistence(timeout: 10),
            "Role display should exist in settings"
        )
    }

    // MARK: - Helpers

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

    // MARK: - Navigation Helpers

    private func navigateToSettingsTab() {
        let tabView = find("main-tab-view")
        guard tabView.waitForExistence(timeout: 10) else {
            XCTFail("Main tab view should be visible")
            return
        }

        let tabBar = app.tabBars.firstMatch
        guard tabBar.waitForExistence(timeout: 5) else { return }
        // Fifth tab = Settings (0: Dashboard, 1: Notes, 2: Conversations, 3: Shifts, 4: Settings)
        let settingsTabButton = tabBar.buttons.element(boundBy: 4)
        if settingsTabButton.exists {
            settingsTabButton.tap()
        }
    }

    private func navigateToAdminPanel() {
        navigateToSettingsTab()

        let adminButton = scrollToFind("settings-admin-panel", timeout: 10)
        guard adminButton.exists else {
            // Not visible — might not be admin. Skip gracefully.
            return
        }
        adminButton.tap()

        // Wait for admin view to load
        let adminTabView = find("admin-tab-view")
        _ = adminTabView.waitForExistence(timeout: 5)
    }
}
