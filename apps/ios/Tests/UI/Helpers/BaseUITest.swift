import XCTest

/// Base class for all BDD-aligned UI tests.
/// Provides shared setup, BDD step helpers (given/when/then), and navigation utilities.
///
/// Each test gets an isolated hub created via POST /api/test-create-hub in setUp().
/// The hub ID is stored in `testHubId` and passed to the app via --test-hub-id.
class BaseUITest: XCTestCase {
    var app: XCUIApplication!

    /// Isolated hub created for this test. Set in setUp() via createTestHub().
    var testHubId: String = ""

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        testHubId = createTestHub()
    }

    override func tearDown() {
        app = nil
        super.tearDown()
    }

    // MARK: - Hub URL

    /// The test hub URL, read from environment or defaulting to localhost (Docker Compose).
    var testHubURL: String {
        ProcessInfo.processInfo.environment["TEST_HUB_URL"]
            ?? "http://localhost:3000"
    }

    // MARK: - Test Secret

    /// The test secret, matching DEV_RESET_SECRET / E2E_TEST_SECRET in docker-compose.test.yml.
    private var testSecret: String {
        ProcessInfo.processInfo.environment["E2E_TEST_SECRET"]
            ?? ProcessInfo.processInfo.environment["TEST_RESET_SECRET"]
            ?? "test-reset-secret"
    }

    // MARK: - Hub Isolation

    /// Create a fresh isolated hub for this test run.
    /// Returns the hub ID, or empty string on failure (with XCTFail).
    func createTestHub() -> String {
        let hubName = "ios-test-\(Int(Date().timeIntervalSince1970 * 1000))"
        guard let url = URL(string: "\(testHubURL)/api/test-create-hub") else {
            XCTFail("Invalid test hub URL: \(testHubURL)")
            return ""
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(testSecret, forHTTPHeaderField: "X-Test-Secret")
        request.timeoutInterval = 15
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["name": hubName])

        var hubId = ""
        let semaphore = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let error {
                print("Warning: createTestHub failed: \(error.localizedDescription)")
                return
            }
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? -1
                print("Warning: createTestHub returned \(code)")
                return
            }
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let id = json["id"] as? String {
                hubId = id
            }
        }.resume()
        _ = semaphore.wait(timeout: .now() + 15)
        XCTAssertFalse(hubId.isEmpty, "createTestHub returned empty hub ID — is the backend running?")
        return hubId
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

    /// Launch the app connected to the live Docker API as admin.
    /// Uses the admin mock identity (matches ADMIN_PUBKEY in Docker .env)
    /// and registers via /api/auth/bootstrap.
    func launchWithAPI() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-hub-url", testHubURL,
            "--test-hub-id", testHubId,
            "--test-register",
        ])
        app.launch()
    }

    /// Launch the app connected to the live Docker API as a volunteer.
    /// Uses a separate volunteer keypair. The admin is bootstrapped first,
    /// then the user is created via POST /api/users.
    func launchAsVolunteerWithAPI() {
        app.launchArguments.append(contentsOf: [
            "--reset-keychain",
            "--test-authenticated",
            "--test-volunteer-identity",
            "--test-hub-url", testHubURL,
            "--test-hub-id", testHubId,
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
            "--test-hub-id", testHubId,
            "--test-register",
        ])
        app.launch()
    }

    // MARK: - Server State (deprecated)

    /// Deprecated: hub isolation via createTestHub() in setUp() replaces this.
    /// Each test gets its own fresh hub — no global reset needed.
    func resetServerState() {
        fatalError("resetServerState() is removed — hub isolation via createTestHub() in setUp() provides per-test isolation. Remove this call.")
    }

    // MARK: - Simulation Helpers

    /// Simulate an incoming call via the test simulation API.
    /// Returns (callId, status) on success, or nil values on failure.
    @discardableResult
    func simulateIncomingCall(callerNumber: String = "+15551234567") -> (callId: String, status: String) {
        return simulationRequest(
            endpoint: "incoming-call",
            body: ["callerNumber": callerNumber],
            extractKeys: ("callId", "status")
        )
    }

    /// Simulate answering a call via the test simulation API.
    /// Returns the call status string.
    @discardableResult
    func simulateAnswerCall(callId: String, pubkey: String) -> String {
        let result = simulationRequest(
            endpoint: "answer-call",
            body: ["callId": callId, "pubkey": pubkey],
            extractKeys: ("status", "status")
        )
        return result.0
    }

    /// Simulate ending a call via the test simulation API.
    /// Returns the call status string.
    @discardableResult
    func simulateEndCall(callId: String) -> String {
        let result = simulationRequest(
            endpoint: "end-call",
            body: ["callId": callId],
            extractKeys: ("status", "status")
        )
        return result.0
    }

    /// Simulate a voicemail (unanswered call) via the test simulation API.
    /// Returns the call status string.
    @discardableResult
    func simulateVoicemail(callId: String) -> String {
        let result = simulationRequest(
            endpoint: "voicemail",
            body: ["callId": callId],
            extractKeys: ("status", "status")
        )
        return result.0
    }

    /// Simulate an incoming message via the test simulation API.
    /// Returns (conversationId, messageId) on success.
    @discardableResult
    func simulateIncomingMessage(
        senderNumber: String = "+15559876543",
        body: String = "Test message",
        channel: String = "sms"
    ) -> (conversationId: String, messageId: String) {
        return simulationRequest(
            endpoint: "incoming-message",
            body: ["senderNumber": senderNumber, "body": body, "channel": channel],
            extractKeys: ("conversationId", "messageId")
        )
    }

    /// Generic simulation request helper using synchronous URLSession + DispatchSemaphore.
    private func simulationRequest(
        endpoint: String,
        body: [String: String],
        extractKeys: (String, String)
    ) -> (String, String) {
        guard let url = URL(string: "\(testHubURL)/api/test-simulate/\(endpoint)") else {
            XCTFail("Invalid simulation URL for endpoint: \(endpoint)")
            return ("", "")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(testSecret, forHTTPHeaderField: "X-Test-Secret")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            XCTFail("Failed to serialize simulation request body: \(error)")
            return ("", "")
        }

        var resultFirst = ""
        var resultSecond = ""
        let semaphore = DispatchSemaphore(value: 0)

        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }

            if let error {
                print("Warning: Simulation request '\(endpoint)' failed: \(error.localizedDescription)")
                return
            }
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? -1
                print("Warning: Simulation request '\(endpoint)' returned \(code)")
                return
            }
            guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                print("Warning: Simulation request '\(endpoint)' returned invalid JSON")
                return
            }

            resultFirst = json[extractKeys.0] as? String ?? ""
            resultSecond = json[extractKeys.1] as? String ?? ""
        }.resume()

        let timeout = semaphore.wait(timeout: .now() + 20)
        if timeout == .timedOut {
            print("Warning: Simulation request '\(endpoint)' timed out")
        }
        return (resultFirst, resultSecond)
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

    /// Tab indices: 0=Dashboard, 1=Notes, 2=Cases, 3=Conversations, 4=Shifts, 5=Settings
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
    func navigateToCases() { navigateToTab(index: 2) }
    func navigateToConversations() { navigateToTab(index: 3) }
    func navigateToShifts() { navigateToTab(index: 4) }
    func navigateToSettings() { navigateToTab(index: 5) }

    func navigateToAdminPanel() {
        navigateToSettings()

        let adminLink = scrollToFind("settings-admin-link", maxSwipes: 5, timeout: 10)
        guard adminLink.exists else {
            XCTFail("Admin panel link should exist for admin users")
            return
        }
        adminLink.tap()

        let adminTabView = find("admin-tab-view")
        _ = adminTabView.waitForExistence(timeout: 5)
    }

    func navigateToAccountSettings() {
        navigateToSettings()

        let accountLink = find("settings-account-link")
        guard accountLink.waitForExistence(timeout: 5) else {
            XCTFail("Account settings link should exist")
            return
        }
        accountLink.tap()
    }

    func navigateToPreferencesSettings() {
        navigateToSettings()

        let preferencesLink = find("settings-preferences-link")
        guard preferencesLink.waitForExistence(timeout: 5) else {
            XCTFail("Preferences settings link should exist")
            return
        }
        preferencesLink.tap()
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
    func completeOnboarding(hubURL: String = "https://test.example.org", pin: String = "123456") {
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
