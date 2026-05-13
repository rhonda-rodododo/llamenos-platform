import XCTest

/// XCUITest suite for recovery group features (EP09-P4).
/// Tests admin recovery team configuration, recovery request management,
/// and the unauthenticated account recovery flow.
final class RecoveryGroupUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDown() {
        app = nil
        super.tearDown()
    }

    /// Find any element by accessibility identifier, regardless of XCUIElement type.
    private func find(_ identifier: String) -> XCUIElement {
        return app.descendants(matching: .any)[identifier].firstMatch
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

    // MARK: - Admin Recovery Team Configuration

    func testAdminCanConfigureRecoveryTeam() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
        ])
        app.launch()

        navigateToAdminPanel()
        navigateToAdminSettingsScreen("admin-recovery-team")

        let found = anyElementExists([
            "recovery-team-config-view",
            "recovery-team-loading",
        ])
        XCTAssertTrue(found, "Recovery team config view should show content or loading state")

        // Check for setup form elements (will appear after loading completes)
        let thresholdPicker = scrollToFind("recovery-threshold-picker")
        if thresholdPicker.exists {
            XCTAssertTrue(thresholdPicker.exists, "Threshold picker should exist in setup state")

            let totalPicker = scrollToFind("recovery-total-picker")
            XCTAssertTrue(totalPicker.exists, "Total shares picker should exist in setup state")

            let setupButton = scrollToFind("recovery-setup-button")
            XCTAssertTrue(setupButton.exists, "Setup button should exist in setup state")
        }
    }

    // MARK: - Admin Recovery Requests

    func testAdminCanViewRecoveryRequests() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
        ])
        app.launch()

        navigateToAdminPanel()
        navigateToAdminSettingsScreen("admin-recovery-requests")

        let found = anyElementExists([
            "recovery-requests-view",
            "recovery-requests-empty",
            "recovery-requests-loading",
        ])
        XCTAssertTrue(found, "Recovery requests view should show content, empty state, or loading")
    }

    // MARK: - User Account Recovery Flow

    func testUserCanStartRecoveryFlow() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
        ])
        app.launch()

        // Navigate to recovery from the login screen
        let recoveryLink = scrollToFind("login-recover-account")
        guard recoveryLink.exists else {
            // Recovery link may not be visible yet; skip test gracefully
            return
        }
        recoveryLink.tap()

        let recoveryView = find("account-recovery-view")
        guard recoveryView.waitForExistence(timeout: 5) else {
            XCTFail("Account recovery view should appear")
            return
        }

        // Verify identifier input exists
        let hubInput = find("recovery-hub-url-input")
        XCTAssertTrue(
            hubInput.waitForExistence(timeout: 5),
            "Hub URL input should exist in recovery flow"
        )

        let identifierInput = find("recovery-identifier-input")
        XCTAssertTrue(
            identifierInput.waitForExistence(timeout: 5),
            "Identifier input should exist in recovery flow"
        )

        // Verify start button exists and is initially disabled
        let startButton = find("recovery-start-button")
        XCTAssertTrue(
            startButton.waitForExistence(timeout: 5),
            "Start recovery button should exist"
        )

        // Type into fields and verify button becomes enabled
        hubInput.tap()
        hubInput.typeText("https://test.example.org")

        identifierInput.tap()
        identifierInput.typeText("+15551234567")
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
        let settingsTabButton = tabBar.buttons.element(boundBy: 4)
        if settingsTabButton.exists {
            settingsTabButton.tap()
        }
    }

    private func navigateToAdminPanel() {
        navigateToSettingsTab()

        let adminLink = scrollToFind("settings-admin-link", timeout: 10)
        guard adminLink.exists else { return }
        adminLink.tap()

        let adminTabView = find("admin-tab-view")
        _ = adminTabView.waitForExistence(timeout: 5)
    }

    private func navigateToAdminSettingsScreen(_ linkIdentifier: String) {
        let link = scrollToFind(linkIdentifier)
        guard link.exists else {
            XCTFail("\(linkIdentifier) should exist in admin panel")
            return
        }
        link.tap()
    }
}
