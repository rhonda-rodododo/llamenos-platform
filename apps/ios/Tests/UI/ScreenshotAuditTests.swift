import XCTest

/// Visual audit test — screenshots every major screen for manual review.
/// Run with: xcodebuild test -only-testing:LlamenosUITests/ScreenshotAuditTests
final class ScreenshotAuditTests: BaseUITest {

    override func setUp() {
        super.setUp()
        launchAsAdmin()
    }

    // MARK: - Dashboard

    func testScreenshotDashboard() {
        let dashboard = find("dashboard-title")
        _ = dashboard.waitForExistence(timeout: 10)
        screenshot("01-dashboard")
    }

    func testScreenshotDashboardConnectionCard() {
        let card = find("dashboard-connection-card")
        _ = card.waitForExistence(timeout: 10)
        screenshot("01b-dashboard-connection-card")
    }

    // MARK: - Notes

    func testScreenshotNotes() {
        navigateToNotes()
        sleep(2)
        screenshot("02-notes")
    }

    func testScreenshotNotesEmptyState() {
        navigateToNotes()
        let empty = find("notes-empty-state")
        if empty.waitForExistence(timeout: 5) {
            screenshot("02b-notes-empty")
        }
    }

    func testScreenshotNoteCreate() {
        navigateToNotes()
        sleep(1)
        let createButton = find("create-note-button")
        if createButton.waitForExistence(timeout: 5) {
            createButton.tap()
            sleep(1)
            screenshot("02c-note-create")
        }
    }

    // MARK: - Conversations

    func testScreenshotConversations() {
        navigateToConversations()
        sleep(2)
        screenshot("03-conversations")
    }

    func testScreenshotConversationsEmptyState() {
        navigateToConversations()
        let empty = find("conversations-empty-state")
        if empty.waitForExistence(timeout: 5) {
            screenshot("03b-conversations-empty")
        }
    }

    // MARK: - Shifts

    func testScreenshotShifts() {
        navigateToShifts()
        sleep(2)
        screenshot("04-shifts")
    }

    func testScreenshotShiftsEmptyState() {
        navigateToShifts()
        let empty = find("shifts-empty-state")
        if empty.waitForExistence(timeout: 5) {
            screenshot("04b-shifts-empty")
        }
    }

    // MARK: - Settings

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

        // Scroll to see device link section
        app.swipeUp()
        sleep(1)
        screenshot("06b-account-settings-scrolled")
    }

    func testScreenshotPreferences() {
        navigateToPreferencesSettings()
        sleep(2)
        screenshot("07-preferences")
    }

    // MARK: - Admin Panel

    func testScreenshotAdminPanel() {
        navigateToAdminPanel()
        sleep(2)
        screenshot("08-admin-panel")
    }

    func testScreenshotAdminVolunteers() {
        navigateToAdminPanel()
        sleep(1)
        let volunteersLink = find("admin-volunteers")
        if volunteersLink.waitForExistence(timeout: 5) {
            volunteersLink.tap()
            sleep(2)
            screenshot("08b-admin-volunteers")
        }
    }

    func testScreenshotAdminBanList() {
        navigateToAdminPanel()
        sleep(1)
        let bansLink = find("admin-bans")
        if bansLink.waitForExistence(timeout: 5) {
            bansLink.tap()
            sleep(2)
            screenshot("08c-admin-bans")
        }
    }

    func testScreenshotAdminAuditLog() {
        navigateToAdminPanel()
        sleep(1)
        let auditLink = find("admin-audit-log")
        if auditLink.waitForExistence(timeout: 5) {
            auditLink.tap()
            sleep(2)
            screenshot("08d-admin-audit")
        }
    }

    func testScreenshotAdminInvites() {
        navigateToAdminPanel()
        sleep(1)
        let invitesLink = find("admin-invites")
        if invitesLink.waitForExistence(timeout: 5) {
            invitesLink.tap()
            sleep(2)
            screenshot("08e-admin-invites")
        }
    }

    func testScreenshotAdminCustomFields() {
        navigateToAdminPanel()
        sleep(1)
        let fieldsLink = find("admin-custom-fields")
        if fieldsLink.waitForExistence(timeout: 5) {
            fieldsLink.tap()
            sleep(2)
            screenshot("08f-admin-custom-fields")
        }
    }

    // MARK: - Help

    func testScreenshotHelp() {
        navigateToSettings()
        let helpLink = find("settings-help")
        if helpLink.waitForExistence(timeout: 5) {
            helpLink.tap()
            sleep(2)
            screenshot("09-help")

            // Scroll to see more FAQ sections
            app.swipeUp()
            sleep(1)
            screenshot("09b-help-scrolled")

            app.swipeUp()
            sleep(1)
            screenshot("09c-help-scrolled-2")
        }
    }

    // MARK: - Panic Wipe

    func testScreenshotPanicWipe() {
        navigateToSettings()
        let panicLink = scrollToFind("settings-panic-wipe")
        if panicLink.exists {
            panicLink.tap()
            sleep(2)
            screenshot("10-panic-wipe")
        }
    }

    // MARK: - Reports (via Dashboard Quick Action)

    func testScreenshotReports() {
        let reportsAction = find("dashboard-reports-action")
        if reportsAction.waitForExistence(timeout: 10) {
            reportsAction.tap()
            sleep(2)
            screenshot("11-reports")
        }
    }

    // MARK: - Contacts (via Dashboard Quick Action, admin only)

    func testScreenshotContacts() {
        let contactsAction = find("dashboard-contacts-action")
        if contactsAction.waitForExistence(timeout: 10) {
            contactsAction.tap()
            sleep(2)
            screenshot("12-contacts")
        }
    }

    // MARK: - Blasts (via Dashboard Quick Action, admin only)

    func testScreenshotBlasts() {
        let blastsAction = find("dashboard-blasts-action")
        if blastsAction.waitForExistence(timeout: 10) {
            blastsAction.tap()
            sleep(2)
            screenshot("13-blasts")
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

// MARK: - Auth Flow Screenshots (clean launch required)

/// Separate test class for auth flow screens since they require a clean (unauthenticated) launch.
final class AuthScreenshotAuditTests: BaseUITest {

    func testScreenshotLoginScreen() {
        launchClean()
        sleep(2)
        screenshot("20-login")
    }

    func testScreenshotPINUnlockScreen() {
        // Launch authenticated to get past onboarding, then lock
        launchAuthenticated()
        let dashboard = find("dashboard-title")
        _ = dashboard.waitForExistence(timeout: 10)

        // Lock the app
        let lockButton = find("lock-app")
        if lockButton.waitForExistence(timeout: 5) {
            lockButton.tap()
            sleep(1)
            screenshot("21-pin-unlock")
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
