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

    // MARK: - Hub URL

    /// The test hub URL, read from environment or defaulting to the Linux dev machine on LAN.
    var testHubURL: String {
        ProcessInfo.processInfo.environment["TEST_HUB_URL"]
            ?? "http://192.168.50.95:3000"
    }

    // MARK: - Launch Helpers

    /// Launch the app with a clean keychain (login screen).
    func launchClean() {
        app.launchArguments.append("--reset-keychain")
        app.launch()
    }

    /// Launch the app in a pre-authenticated volunteer state (no API connection).
    func launchAuthenticated() {
        app.launchArguments.append(contentsOf: ["--reset-keychain", "--test-authenticated"])
        app.launch()
    }

    /// Launch the app in a pre-authenticated admin state (no API connection).
    func launchAsAdmin() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
        ])
        app.launch()
    }

    /// Launch the app connected to the live Docker API as a volunteer.
    /// The identity is registered with the server via bootstrap.
    func launchWithAPI() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-hub-url", testHubURL,
            "--test-register",
        ])
        app.launch()
    }

    /// Launch the app connected to the live Docker API as an admin.
    /// The identity is bootstrapped as admin on the server.
    func launchAsAdminWithAPI() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-admin",
            "--test-hub-url", testHubURL,
            "--test-register",
        ])
        app.launch()
    }

    // MARK: - Server State

    /// Reset the test server state by calling POST /api/test-reset.
    /// Call this in setUp() before launching the app for API-connected tests.
    func resetServerState() {
        guard let url = URL(string: "\(testHubURL)/api/test-reset") else {
            XCTFail("Invalid test hub URL: \(testHubURL)")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15

        let expectation = XCTestExpectation(description: "Reset test state")
        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error {
                // Server might not be running — don't fail, just warn
                print("⚠️ Test reset failed: \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                print("⚠️ Test reset returned \(http.statusCode)")
            }
            expectation.fulfill()
        }.resume()
        wait(for: [expectation], timeout: 20)
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
        let tabView = find("main-tab-view")
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

        let adminButton = scrollToFind("settings-admin-panel", maxSwipes: 5, timeout: 10)
        guard adminButton.exists else {
            XCTFail("Admin panel button should exist for admin users")
            return
        }
        adminButton.tap()

        let adminTabView = find("admin-tab-view")
        _ = adminTabView.waitForExistence(timeout: 5)
    }

    // MARK: - PIN Helpers

    func enterPIN(_ pin: String) {
        for char in pin {
            let button = find("pin-\(char)")
            if button.waitForExistence(timeout: 2) {
                button.tap()
            }
        }
    }

    /// Navigate through full onboarding: create identity, confirm backup, set PIN, reach dashboard.
    func completeOnboarding(hubURL: String = "https://test.example.org", pin: String = "1234") {
        // Enter hub URL
        let hubURLInput = find("hub-url-input")
        if hubURLInput.waitForExistence(timeout: 5) {
            hubURLInput.tap()
            hubURLInput.typeText(hubURL)
            dismissKeyboard()
        }

        // Create identity
        let createButton = find("create-identity")
        if createButton.waitForExistence(timeout: 3) {
            createButton.tap()
        }

        // Confirm backup
        let confirmBackup = find("confirm-backup")
        if confirmBackup.waitForExistence(timeout: 5) {
            confirmBackup.tap()
        }

        // Continue to PIN
        let continueButton = find("continue-to-pin")
        if continueButton.waitForExistence(timeout: 3) {
            continueButton.tap()
        }

        // Wait for PIN pad
        let pinPad = find("pin-pad")
        _ = pinPad.waitForExistence(timeout: 5)

        // Enter PIN + confirm
        enterPIN(pin)
        enterPIN(pin)

        // Wait for dashboard
        let dashboardTitle = find("dashboard-title")
        _ = dashboardTitle.waitForExistence(timeout: 10)
    }

    /// Dismiss the keyboard by tapping a neutral area of the screen.
    func dismissKeyboard() {
        let coordinate = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
        coordinate.tap()
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

    /// Scroll down in the current view to find an element that may be off-screen.
    /// Swipes up on the app's main scrollable area until the element is found or max attempts reached.
    @discardableResult
    func scrollToFind(_ identifier: String, maxSwipes: Int = 5, timeout: TimeInterval = 2) -> XCUIElement {
        let element = find(identifier)
        if element.waitForExistence(timeout: timeout) {
            return element
        }

        // Try swiping up to scroll down
        for _ in 0..<maxSwipes {
            app.swipeUp()
            if element.waitForExistence(timeout: 1) {
                return element
            }
        }
        return element
    }

    /// Scroll down until an element is visible (hittable) on screen.
    /// Unlike `scrollToFind` which uses `exists` (true for off-screen elements
    /// in SwiftUI Lists), this checks `isHittable` to guarantee visibility.
    @discardableResult
    func scrollToVisible(_ identifier: String, maxSwipes: Int = 10) -> XCUIElement {
        let element = find(identifier)

        // Check if already visible
        if element.waitForExistence(timeout: 2) && element.isHittable {
            return element
        }

        // Scroll until visible
        for _ in 0..<maxSwipes {
            app.swipeUp()
            if element.waitForExistence(timeout: 1) && element.isHittable {
                return element
            }
        }
        return element
    }

    /// Scroll until an element is hittable (visible on screen), then tap it.
    /// Use this for elements deep in scrollable lists that may exist in the
    /// hierarchy but are off-screen and can't be tapped.
    func scrollAndTap(_ identifier: String, maxSwipes: Int = 8) {
        let element = find(identifier)

        // Check if already hittable
        if element.waitForExistence(timeout: 2) && element.isHittable {
            element.tap()
            return
        }

        // Scroll until hittable
        for _ in 0..<maxSwipes {
            app.swipeUp()
            if element.waitForExistence(timeout: 1) && element.isHittable {
                element.tap()
                return
            }
        }

        // Last resort: tap even if not confirmed hittable
        if element.exists {
            element.tap()
        } else {
            XCTFail("Element '\(identifier)' not found after \(maxSwipes) swipes")
        }
    }
}
