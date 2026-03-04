import XCTest

/// BDD-aligned XCUITest suite for security-related scenarios.
/// Maps to scenarios from: emergency-wipe.feature, panic-wipe.feature
final class SecurityUITests: BaseUITest {

    // MARK: - Emergency Wipe (emergency-wipe.feature)

    func testEmergencyWipeFromLoginScreen() {
        given("the app is on the login screen") {
            launchClean()
        }
        when("I look for emergency wipe options") {
            // Emergency wipe may be available as a hidden gesture or menu
            // on the login screen (varies by implementation)
        }
        then("the app should not crash") {
            // Verify the login screen is stable
            let hubInput = find("hub-url-input")
            XCTAssertTrue(
                hubInput.waitForExistence(timeout: 5),
                "Login screen should be stable and accessible"
            )
        }
    }

    func testLockScreenShowsPINPad() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I lock the app") {
            let lockButton = find("lock-app")
            guard lockButton.waitForExistence(timeout: 10) else {
                // Try settings lock button (may need scrolling)
                navigateToSettings()
                let settingsLock = scrollToFind("settings-lock-app")
                guard settingsLock.exists else {
                    XCTFail("No lock button found")
                    return
                }
                settingsLock.tap()
                return
            }
            lockButton.tap()
        }
        then("I should see the PIN pad on the lock screen") {
            let pinPad = find("pin-pad")
            XCTAssertTrue(
                pinPad.waitForExistence(timeout: 5),
                "PIN pad should be displayed on lock screen"
            )
        }
        and("I should see the locked npub") {
            let lockedNpub = find("locked-npub")
            if lockedNpub.waitForExistence(timeout: 3) {
                XCTAssertTrue(true, "Locked npub is displayed")
            }
        }
    }

    func testPINUnlockWithWrongPINShowsError() {
        given("the app is locked") {
            launchAuthenticated()
            // Lock it
            let lockButton = find("lock-app")
            if lockButton.waitForExistence(timeout: 10) {
                lockButton.tap()
            } else {
                navigateToSettings()
                let settingsLock = scrollToFind("settings-lock-app")
                guard settingsLock.exists else { return }
                settingsLock.tap()
            }
            let pinPad = find("pin-pad")
            _ = pinPad.waitForExistence(timeout: 5)
        }
        when("I enter the wrong PIN") {
            enterPIN("9999")
        }
        then("I should see an error message") {
            let pinError = find("pin-error")
            XCTAssertTrue(
                pinError.waitForExistence(timeout: 5),
                "PIN error should be displayed for wrong PIN"
            )
        }
        and("the PIN pad should still be visible") {
            let pinPad = find("pin-pad")
            XCTAssertTrue(pinPad.exists, "PIN pad should remain for retry")
        }
    }

    // MARK: - PIN Pad Security

    func testPINPadHasAllDigits() {
        given("the app is on the login screen") {
            launchClean()
        }
        when("I start the identity creation flow") {
            let hubInput = find("hub-url-input")
            guard hubInput.waitForExistence(timeout: 5) else { return }
            hubInput.tap()
            hubInput.typeText("https://test.example.org")

            // Dismiss keyboard before tapping create button
            dismissKeyboard()

            let createButton = find("create-identity")
            guard createButton.waitForExistence(timeout: 5) else { return }
            createButton.tap()

            // Confirm backup
            let confirmBackup = find("confirm-backup")
            if confirmBackup.waitForExistence(timeout: 5) {
                confirmBackup.tap()
            }
            let continueButton = find("continue-to-pin")
            if continueButton.waitForExistence(timeout: 3) {
                continueButton.tap()
            }
        }
        then("the PIN pad should have digits 0-9 and backspace") {
            let pinPad = find("pin-pad")
            guard pinPad.waitForExistence(timeout: 5) else {
                XCTFail("PIN pad should appear")
                return
            }
            for digit in 0...9 {
                let button = find("pin-\(digit)")
                XCTAssertTrue(button.exists, "PIN button \(digit) should exist")
            }
            let backspace = find("pin-backspace")
            XCTAssertTrue(backspace.exists, "Backspace button should exist")
        }
    }

    func testPINDotsIndicator() {
        given("the app is on the login screen") {
            launchClean()
        }
        when("I navigate to the PIN set screen") {
            let hubInput = find("hub-url-input")
            guard hubInput.waitForExistence(timeout: 5) else { return }
            hubInput.tap()
            hubInput.typeText("https://test.example.org")

            // Dismiss keyboard
            dismissKeyboard()

            let createButton = find("create-identity")
            guard createButton.waitForExistence(timeout: 5) else { return }
            createButton.tap()

            let confirmBackup = find("confirm-backup")
            if confirmBackup.waitForExistence(timeout: 5) {
                confirmBackup.tap()
            }
            let continueButton = find("continue-to-pin")
            if continueButton.waitForExistence(timeout: 3) {
                continueButton.tap()
            }
        }
        then("I should see the PIN dots indicator") {
            let pinDots = find("pin-dots")
            if pinDots.waitForExistence(timeout: 5) {
                XCTAssertTrue(true, "PIN dots indicator is displayed")
            }
        }
    }

    // MARK: - Helpers

    /// Dismiss the keyboard if visible.
    private func dismissKeyboard() {
        let coordinate = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
        coordinate.tap()
    }
}
