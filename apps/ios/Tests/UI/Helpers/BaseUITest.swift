import XCTest

/// Base class for all BDD-aligned UI tests.
/// Provides shared setup, BDD step helpers (given/when/then), and navigation utilities.
class BaseUITest: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDown() {
        app = nil
        super.tearDown()
    }

    // MARK: - Launch Helpers

    /// Launch the app with a clean keychain (login screen).
    func launchClean() {
        app.launchArguments.append("--reset-keychain")
        app.launch()
    }

    /// Launch the app in a pre-authenticated volunteer state.
    func launchAuthenticated() {
        app.launchArguments.append(contentsOf: ["--reset-keychain", "--test-authenticated"])
        app.launch()
    }

    /// Launch the app in a pre-authenticated admin state.
    func launchAsAdmin() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
        ])
        app.launch()
    }

    // MARK: - BDD Step Helpers

    /// Wraps an action in an XCTContext activity for structured Given/When/Then reporting.
    func given(_ description: String, block: () throws -> Void) rethrows {
        try XCTContext.runActivity(named: "Given \(description)") { _ in
            try block()
        }
    }

    func when(_ description: String, block: () throws -> Void) rethrows {
        try XCTContext.runActivity(named: "When \(description)") { _ in
            try block()
        }
    }

    func then(_ description: String, block: () throws -> Void) rethrows {
        try XCTContext.runActivity(named: "Then \(description)") { _ in
            try block()
        }
    }

    func and(_ description: String, block: () throws -> Void) rethrows {
        try XCTContext.runActivity(named: "And \(description)") { _ in
            try block()
        }
    }

    // MARK: - Navigation

    /// Tab indices: 0=Dashboard, 1=Notes, 2=Conversations, 3=Shifts, 4=Settings
    func navigateToTab(index: Int) {
        let tabView = app.otherElements["main-tab-view"]
        guard tabView.waitForExistence(timeout: 10) else {
            XCTFail("Main tab view should be visible")
            return
        }

        let tabBar = app.tabBars.firstMatch
        guard tabBar.waitForExistence(timeout: 5) else {
            XCTFail("Tab bar should exist")
            return
        }

        let button = tabBar.buttons.element(boundBy: index)
        if button.exists {
            button.tap()
        }
    }

    func navigateToDashboard() { navigateToTab(index: 0) }
    func navigateToNotes() { navigateToTab(index: 1) }
    func navigateToConversations() { navigateToTab(index: 2) }
    func navigateToShifts() { navigateToTab(index: 3) }
    func navigateToSettings() { navigateToTab(index: 4) }

    func navigateToAdminPanel() {
        navigateToSettings()

        let adminButton = app.buttons["settings-admin-panel"].firstMatch
        guard adminButton.waitForExistence(timeout: 10) else {
            XCTFail("Admin panel button should exist for admin users")
            return
        }
        adminButton.tap()

        let adminTabView = app.otherElements["admin-tab-view"]
        _ = adminTabView.waitForExistence(timeout: 5)
    }

    // MARK: - PIN Helpers

    func enterPIN(_ pin: String) {
        for char in pin {
            let button = app.buttons["pin-\(char)"]
            if button.waitForExistence(timeout: 2) {
                button.tap()
            }
        }
    }

    /// Navigate through full onboarding: create identity, confirm backup, set PIN, reach dashboard.
    func completeOnboarding(hubURL: String = "https://test.example.org", pin: String = "1234") {
        // Enter hub URL
        let hubURLInput = app.textFields["hub-url-input"]
        if hubURLInput.waitForExistence(timeout: 5) {
            hubURLInput.tap()
            hubURLInput.typeText(hubURL)
        }

        // Create identity
        let createButton = app.buttons["create-identity"]
        if createButton.waitForExistence(timeout: 3) {
            createButton.tap()
        }

        // Confirm backup
        let confirmBackup = app.buttons["confirm-backup"].firstMatch
        if confirmBackup.waitForExistence(timeout: 5) {
            confirmBackup.tap()
        }

        // Continue to PIN
        let continueButton = app.buttons["continue-to-pin"].firstMatch
        if continueButton.waitForExistence(timeout: 3) {
            continueButton.tap()
        }

        // Wait for PIN pad
        let pinPad = app.otherElements["pin-pad"]
        _ = pinPad.waitForExistence(timeout: 5)

        // Enter PIN + confirm
        enterPIN(pin)
        enterPIN(pin)

        // Wait for dashboard
        let dashboardTitle = app.staticTexts["dashboard-title"].firstMatch
        _ = dashboardTitle.waitForExistence(timeout: 10)
    }

    // MARK: - Element Helpers

    /// Find any element by accessibility identifier, regardless of XCUIElement type.
    /// SwiftUI exposes elements as varying types (cells, groups, other, etc.)
    /// depending on container context. This helper avoids type-mismatch failures.
    func find(_ identifier: String) -> XCUIElement {
        return app.descendants(matching: .any)[identifier].firstMatch
    }

    /// Wait for an element by accessibility identifier, asserting it exists.
    @discardableResult
    func waitForElement(_ identifier: String, timeout: TimeInterval = 5) -> XCUIElement {
        let element = find(identifier)
        XCTAssertTrue(
            element.waitForExistence(timeout: timeout),
            "Element '\(identifier)' should exist within \(timeout)s"
        )
        return element
    }

    /// Check if any of the given elements exist (returns true if at least one is found).
    func anyElementExists(_ identifiers: [String], timeout: TimeInterval = 10) -> Bool {
        for (i, id) in identifiers.enumerated() {
            let element = find(id)
            let wait: TimeInterval = i == 0 ? timeout : 2
            if element.waitForExistence(timeout: wait) {
                return true
            }
        }
        return false
    }
}
