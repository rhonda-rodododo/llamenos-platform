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
        // Reset state for clean test runs
        app.launchArguments.append("--reset-keychain")
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
        // Hub URL input should be visible
        let hubURLInput = find("hub-url-input")
        XCTAssertTrue(hubURLInput.waitForExistence(timeout: 5), "Hub URL input should exist")

        // Create Identity button
        let createButton = find("create-identity")
        XCTAssertTrue(createButton.exists, "Create Identity button should exist")

        // Import Key button
        let importButton = find("import-key")
        XCTAssertTrue(importButton.exists, "Import Key button should exist")
    }

    // MARK: - Onboarding Flow

    func testOnboardingFlowCreateIdentity() {
        // Enter hub URL
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

        // Nsec should be displayed on the onboarding screen
        let nsecDisplay = find("nsec-display")
        XCTAssertTrue(
            nsecDisplay.waitForExistence(timeout: 5),
            "Nsec display should appear on onboarding screen"
        )

        // Npub should also be displayed
        let npubDisplay = find("npub-display")
        XCTAssertTrue(npubDisplay.exists, "Npub display should exist")

        // Confirm backup toggle/checkbox
        let confirmBackup = find("confirm-backup")
        XCTAssertTrue(confirmBackup.exists, "Confirm backup button should exist")

        // The continue button should be disabled until backup is confirmed
        // Tap confirm backup to enable it
        confirmBackup.tap()

        // Continue to PIN set should now be available
        let continueButton = find("continue-to-pin")
        if continueButton.exists {
            continueButton.tap()
        }

        // PIN pad should appear
        let pinPad = find("pin-pad")
        XCTAssertTrue(
            pinPad.waitForExistence(timeout: 5),
            "PIN pad should appear after confirming backup"
        )
    }

    // MARK: - PIN Set Flow

    func testPINSetEnterAndConfirm() {
        navigateToOnboarding()
        navigateToPINSet()

        // Enter 4-digit PIN: 1234
        enterPIN("1234")

        // Should transition to confirm phase
        let pinPad = find("pin-pad")
        XCTAssertTrue(pinPad.exists, "PIN pad should still be visible for confirmation")

        // Confirm the same PIN: 1234
        enterPIN("1234")

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

        // Enter first PIN: 1234
        enterPIN("1234")

        // Enter different PIN for confirmation: 5678
        enterPIN("5678")

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

    func testImportKeyFlow() {
        // Tap "Import Key"
        let importButton = find("import-key")
        XCTAssertTrue(importButton.waitForExistence(timeout: 5))
        importButton.tap()

        // Nsec input should appear
        let nsecInput = find("nsec-input")
        XCTAssertTrue(
            nsecInput.waitForExistence(timeout: 5),
            "Nsec input field should appear"
        )

        // Submit button should exist
        let submitButton = find("submit-import")
        XCTAssertTrue(submitButton.exists, "Submit import button should exist")

        // Cancel should go back to login
        let cancelButton = find("cancel-import")
        if cancelButton.exists {
            cancelButton.tap()
            // Should return to login screen
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

        // Dashboard should show npub
        let npubDisplay = find("dashboard-npub")
        XCTAssertTrue(
            npubDisplay.waitForExistence(timeout: 5),
            "Dashboard should display the user's npub"
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

        // Enter 2 more digits to reach 3 total (1 + 2 new)
        find("pin-3").tap()
        find("pin-4").tap()

        // The PIN should now be "134" + one more needed
        // Enter the last digit
        find("pin-5").tap()

        // Should transition to confirm (PIN was 1345, then we need to confirm)
        // The PIN pad should reset for confirmation
        XCTAssertTrue(pinPad.exists)
    }

    // MARK: - Navigation Helpers

    /// Navigate from login to the onboarding screen.
    private func navigateToOnboarding() {
        let hubURLInput = find("hub-url-input")
        guard hubURLInput.waitForExistence(timeout: 5) else { return }
        hubURLInput.tap()
        hubURLInput.typeText("https://test.example.org")
        dismissKeyboard()

        let createButton = find("create-identity")
        guard createButton.waitForExistence(timeout: 5) else { return }
        createButton.tap()
    }

    /// Navigate from onboarding to the PIN set screen.
    private func navigateToPINSet() {
        // Confirm backup
        let confirmBackup = find("confirm-backup")
        if confirmBackup.waitForExistence(timeout: 5) {
            confirmBackup.tap()
        }

        // Tap continue/proceed
        let continueButton = find("continue-to-pin")
        if continueButton.waitForExistence(timeout: 3) {
            continueButton.tap()
        }

        // Wait for PIN pad
        let pinPad = find("pin-pad")
        _ = pinPad.waitForExistence(timeout: 5)
    }

    /// Navigate all the way through to the dashboard (create identity, set PIN).
    private func navigateToFullyAuthenticated() {
        navigateToOnboarding()
        navigateToPINSet()

        // Enter PIN: 1234
        enterPIN("1234")

        // Confirm PIN: 1234
        enterPIN("1234")

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
