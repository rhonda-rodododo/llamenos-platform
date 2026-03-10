import XCTest

/// Visual audit test — screenshots every major screen for manual review.
/// Run with: xcodebuild test -only-testing:LlamenosUITests/ScreenshotAuditTests
final class ScreenshotAuditTests: BaseUITest {

    override func setUp() {
        super.setUp()
        launchAsAdmin()
    }

    func testScreenshotDashboard() {
        let dashboard = find("dashboard-title")
        _ = dashboard.waitForExistence(timeout: 10)
        screenshot("01-dashboard")
    }

    func testScreenshotNotes() {
        navigateToNotes()
        sleep(2)
        screenshot("02-notes")
    }

    func testScreenshotConversations() {
        navigateToConversations()
        sleep(2)
        screenshot("03-conversations")
    }

    func testScreenshotShifts() {
        navigateToShifts()
        sleep(2)
        screenshot("04-shifts")
    }

    func testScreenshotSettings() {
        navigateToSettings()
        sleep(2)
        screenshot("05-settings")

        // Scroll down to see more
        app.swipeUp()
        sleep(1)
        screenshot("05b-settings-scrolled")
    }

    func testScreenshotAccountSettings() {
        navigateToAccountSettings()
        sleep(2)
        screenshot("06-account-settings")
    }

    func testScreenshotPreferences() {
        navigateToPreferencesSettings()
        sleep(2)
        screenshot("07-preferences")
    }

    func testScreenshotAdminPanel() {
        navigateToAdminPanel()
        sleep(2)
        screenshot("08-admin-panel")
    }

    func testScreenshotHelp() {
        navigateToSettings()
        let helpLink = find("settings-help")
        if helpLink.waitForExistence(timeout: 5) {
            helpLink.tap()
            sleep(2)
            screenshot("09-help")
        }
    }

    func testScreenshotPanicWipe() {
        navigateToSettings()
        let panicLink = scrollToFind("settings-panic-wipe")
        if panicLink.exists {
            panicLink.tap()
            sleep(2)
            screenshot("10-panic-wipe")
        }
    }

    // MARK: - Screenshot Helper

    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
