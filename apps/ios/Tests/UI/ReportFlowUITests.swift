import XCTest

/// BDD tests for the Reports feature (Epic 241).
/// Tests the reports list, creation flow, detail view, and admin actions.
final class ReportFlowUITests: BaseUITest {

    // MARK: - Helper: Navigate to Reports

    /// Navigate to the reports screen via the Dashboard quick action card.
    /// The quick actions section is below identity, shift, and activity sections in the List,
    /// so we must scroll down to find it.
    private func navigateToReports() {
        scrollAndTap("dashboard-reports-action")

        // Wait for reports content to appear
        _ = anyElementExists([
            "reports-list", "reports-empty-state", "reports-loading", "reports-error",
        ])
    }

    // MARK: - Scenario: Reports list shows content or empty state

    func testReportsListShowsContent() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I navigate to reports") {
            navigateToReports()
        }
        then("I should see the reports list or empty state") {
            let found = anyElementExists([
                "reports-list", "reports-empty-state", "reports-loading", "reports-error",
            ])
            XCTAssertTrue(found, "Reports view should show list, empty state, loading, or error")
        }
    }

    // MARK: - Scenario: Create report button exists

    func testCreateReportButtonExists() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I navigate to reports") {
            navigateToReports()
        }
        then("I should see the create report button") {
            let createButton = find("create-report-button")
            XCTAssertTrue(
                createButton.waitForExistence(timeout: 5),
                "Create report button should exist in toolbar"
            )
        }
    }

    // MARK: - Scenario: Create report flow opens sheet

    func testCreateReportFlowOpensSheet() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I navigate to reports and tap create") {
            navigateToReports()
            let createButton = find("create-report-button")
            XCTAssertTrue(createButton.waitForExistence(timeout: 5))
            createButton.tap()
        }
        then("I should see the report creation form") {
            let titleInput = find("report-title-input")
            XCTAssertTrue(
                titleInput.waitForExistence(timeout: 5),
                "Report title input should appear in create sheet"
            )

            let bodyInput = find("report-body-input")
            XCTAssertTrue(bodyInput.waitForExistence(timeout: 3), "Report body input should exist")

            let submitButton = find("report-submit-button")
            XCTAssertTrue(submitButton.exists, "Submit button should exist")

            let cancelButton = find("cancel-report-create")
            XCTAssertTrue(cancelButton.exists, "Cancel button should exist")
        }
    }

    // MARK: - Scenario: Cancel report creation

    func testCancelReportCreation() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I open the create report sheet and cancel") {
            navigateToReports()
            let createButton = find("create-report-button")
            XCTAssertTrue(createButton.waitForExistence(timeout: 5))
            createButton.tap()

            let titleInput = find("report-title-input")
            XCTAssertTrue(titleInput.waitForExistence(timeout: 5))

            let cancelButton = find("cancel-report-create")
            cancelButton.tap()
        }
        then("I should be back on the reports screen") {
            let createButton = find("create-report-button")
            XCTAssertTrue(
                createButton.waitForExistence(timeout: 5),
                "Create button should be visible after cancelling"
            )
        }
    }

    // MARK: - Scenario: Filter button exists

    func testFilterButtonExists() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I navigate to reports") {
            navigateToReports()
        }
        then("I should see the filter button") {
            let filterButton = find("reports-filter-button")
            XCTAssertTrue(
                filterButton.waitForExistence(timeout: 5),
                "Reports filter button should exist in toolbar"
            )
        }
    }

    // MARK: - Scenario: Dashboard has reports quick action

    func testDashboardHasReportsQuickAction() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        then("the dashboard should show a reports quick action") {
            let reportsAction = scrollToFind("dashboard-reports-action")
            XCTAssertTrue(
                reportsAction.exists,
                "Dashboard should have a reports quick action card"
            )
        }
    }

    // MARK: - Scenario: Empty state shows create button

    func testEmptyStateShowsCreateButton() {
        given("I am authenticated") {
            launchAuthenticated()
        }
        when("I navigate to reports") {
            navigateToReports()
        }
        then("the empty state should have a create button if no reports exist") {
            let emptyState = find("reports-empty-state")
            if emptyState.waitForExistence(timeout: 5) {
                let createFirst = find("create-first-report")
                XCTAssertTrue(createFirst.exists, "Empty state should have a create button")
            }
            // If reports exist, that's fine too
        }
    }
}
