import XCTest

/// XCUITest suite for the authentication flow: login -> onboarding -> PIN set -> dashboard.
/// Also tests import flow and lock/unlock.
///
/// These tests interact with real SwiftUI controls via accessibility identifiers,
/// avoiding the issues Detox had with React Native's TextInput.
final class AuthFlowUITests: XCTestCase {

    private var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        // Reset state for clean test runs; skip hub validation for fake URLs
        app.launchArguments.append(contentsOf: ["--reset-keychain", "--test-skip-hub-validation"])
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

    /// Dismiss the keyboard if visible.
    private func dismissKeyboard() {
        // Tap on a non-interactive area to dismiss keyboard
        let coordinate = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
        coordinate.tap()
    }

    // MARK: - Login Screen

    func testLoginScreenShowsRequiredElements() {
        // Hub URL input should be visible (longer timeout for cold start after simulator reset)
        let hubURLInput = find("hub-url-input")
        XCTAssertTrue(hubURLInput.waitForExistence(timeout: 20), "Hub URL input should exist")

        // Create Identity button
        let createButton = find("create-identity")
        XCTAssertTrue(createButton.waitForExistence(timeout: 3), "Create Identity button should exist")

        // Link Device button (v3: device linking via QR/ECDH replaces nsec import)
        let linkButton = find("link-device")
        XCTAssertTrue(linkButton.waitForExistence(timeout: 3), "Link Device button should exist")
    }

    // MARK: - Onboarding Flow

    func testOnboardingFlowCreateIdentity() {
        // V3 device key model: tapping "Create New Identity" validates the hub URL
        // and navigates directly to the PIN set screen — no nsec display or backup step.
        let hubURLInput = find("hub-url-input")
        XCTAssertTrue(hubURLInput.waitForExistence(timeout: 5))
        hubURLInput.tap()
        hubURLInput.typeText("https://test-hub.example.org")
        dismissKeyboard()

        // Tap "Create New Identity"
        let createButton = find("create-identity")
        guard createButton.waitForExistence(timeout: 5) else {
            XCTFail("Create identity button should exist")
            return
        }
        createButton.tap()

        // PIN pad should appear directly (v3 flow: no onboarding/nsec step)
        let pinPad = find("pin-pad")
        XCTAssertTrue(
            pinPad.waitForExistence(timeout: 10),
            "PIN pad should appear after tapping Create New Identity (v3 direct-to-PIN flow)"
        )
    }

    // MARK: - PIN Set Flow

    func testPINSetEnterAndConfirm() {
        navigateToOnboarding()
        navigateToPINSet()

        // Enter 6-digit PIN: 123456
        enterPIN("12345678")

        // Should transition to confirm phase
        let pinPad = find("pin-pad")
        XCTAssertTrue(pinPad.exists, "PIN pad should still be visible for confirmation")

        // Confirm the same PIN: 123456
        enterPIN("12345678")

        // Should reach dashboard after successful PIN set
        let dashboardTitle = find("dashboard-title")
        XCTAssertTrue(
            dashboardTitle.waitForExistence(timeout: 10),
            "Dashboard should appear after successful PIN set"
        )
    }

    func testPINSetMismatchShowsError() {
        navigateToOnboarding()
        navigateToPINSet()

        // Enter first PIN: 123456
        enterPIN("12345678")

        // Enter different PIN for confirmation: 567890
        enterPIN("567890")

        // Error should be displayed
        let pinError = find("pin-error")
        XCTAssertTrue(
            pinError.waitForExistence(timeout: 3),
            "PIN mismatch error should be displayed"
        )

        // PIN pad should still be visible for retry
        let pinPad = find("pin-pad")
        XCTAssertTrue(pinPad.exists, "PIN pad should remain visible for retry")
    }

    // MARK: - Import Flow

    func testDeviceLinkFlow() {
        // V3: nsec import replaced by device linking (QR + ephemeral ECDH).
        // Tap "Link from Another Device" and verify the device link screen appears.
        let hubInput = find("hub-url-input")
        XCTAssertTrue(hubInput.waitForExistence(timeout: 20), "Hub URL input should exist")

        let linkButton = find("link-device")
        XCTAssertTrue(linkButton.waitForExistence(timeout: 5), "Link Device button should exist")
        linkButton.tap()

        // Device link view should appear
        let deviceLinkView = find("device-link-view")
        XCTAssertTrue(
            deviceLinkView.waitForExistence(timeout: 5),
            "Device link view should appear after tapping Link from Another Device"
        )

        // Cancel should return to login
        let cancelButton = find("cancel-device-link")
        if cancelButton.waitForExistence(timeout: 3) {
            cancelButton.tap()
            let createButton = find("create-identity")
            XCTAssertTrue(
                createButton.waitForExistence(timeout: 5),
                "Should return to login after cancel"
            )
        }
    }

    // MARK: - Dashboard

    func testDashboardShowsIdentityAndLockButton() {
        navigateToFullyAuthenticated()

        // Dashboard should show identity (hex signing pubkey in v3)
        let npubDisplay = find("dashboard-identity")
        XCTAssertTrue(
            npubDisplay.waitForExistence(timeout: 5),
            "Dashboard should display the user's identity"
        )

        // Lock button should exist
        let lockButton = find("lock-app")
        XCTAssertTrue(lockButton.exists, "Lock button should exist on dashboard")

        // Shift status card should exist
        let shiftCard = find("shift-status-card")
        XCTAssertTrue(shiftCard.exists, "Shift status card should exist")
    }

    func testLockButtonTransitionsToPINUnlock() {
        navigateToFullyAuthenticated()

        // Tap lock
        let lockButton = find("lock-app")
        XCTAssertTrue(lockButton.waitForExistence(timeout: 5))
        lockButton.tap()

        // PIN pad should appear (PIN unlock screen)
        let pinPad = find("pin-pad")
        XCTAssertTrue(
            pinPad.waitForExistence(timeout: 5),
            "PIN pad should appear after locking"
        )
    }

    // MARK: - PIN Pad Interaction

    func testPINPadDigitButtons() {
        navigateToOnboarding()
        navigateToPINSet()

        // Wait for PIN pad to be fully rendered
        let pinPad = find("pin-pad")
        guard pinPad.waitForExistence(timeout: 5) else {
            XCTFail("PIN pad should exist")
            return
        }

        // Verify all digit buttons exist
        for digit in 0...9 {
            let button = find("pin-\(digit)")
            XCTAssertTrue(button.exists, "PIN button \(digit) should exist")
        }

        // Verify backspace button exists
        let backspace = find("pin-backspace")
        XCTAssertTrue(backspace.exists, "Backspace button should exist")
    }

    func testPINPadBackspace() {
        navigateToOnboarding()
        navigateToPINSet()

        // Wait for PIN pad
        let pinPad = find("pin-pad")
        guard pinPad.waitForExistence(timeout: 5) else {
            XCTFail("PIN pad should exist")
            return
        }

        // Enter 2 digits
        find("pin-1").tap()
        find("pin-2").tap()

        // Backspace
        find("pin-backspace").tap()

        // Enter more digits to reach 6 total (1 remaining + 5 new)
        find("pin-3").tap()
        find("pin-4").tap()
        find("pin-5").tap()
        find("pin-6").tap()
        find("pin-7").tap()

        // Should transition to confirm (PIN was "13456 7", 6 digits → auto-complete)
        // The PIN pad should reset for confirmation
        XCTAssertTrue(pinPad.exists)
    }

    // MARK: - Navigation Helpers

    /// Navigate from login to the onboarding screen.
    private func navigateToOnboarding() {
        let hubURLInput = find("hub-url-input")
        guard hubURLInput.waitForExistence(timeout: 20) else { return }
        hubURLInput.tap()
        hubURLInput.typeText("https://test.example.org")
        dismissKeyboard()

        let createButton = find("create-identity")
        guard createButton.waitForExistence(timeout: 5) else { return }
        createButton.tap()
    }

    /// Wait for the PIN set screen (v3: navigateToOnboarding already lands here).
    private func navigateToPINSet() {
        // V3: create-identity navigates directly to PINSetView — just wait for pin-pad.
        let pinPad = find("pin-pad")
        _ = pinPad.waitForExistence(timeout: 10)
    }

    /// Navigate all the way through to the dashboard (create identity, set PIN).
    private func navigateToFullyAuthenticated() {
        navigateToOnboarding()
        navigateToPINSet()

        // Enter PIN: 123456
        enterPIN("12345678")

        // Confirm PIN: 123456
        enterPIN("12345678")

        // Wait for dashboard
        let dashboardTitle = find("dashboard-title")
        _ = dashboardTitle.waitForExistence(timeout: 10)
    }

    /// Enter a PIN by tapping digit buttons.
    private func enterPIN(_ pin: String) {
        for char in pin {
            let button = find("pin-\(char)")
            if button.waitForExistence(timeout: 2) {
                button.tap()
            }
        }
    }
}
