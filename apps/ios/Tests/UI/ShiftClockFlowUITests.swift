import XCTest

/// Behavioral XCUITests for volunteer shift clock-in/out against the live test
/// backend (issue #753). Unlike ShiftFlowUITests (offline existence checks), every
/// test here asserts server-confirmed resulting state: the clock button swap only
/// happens after the backend records the clock-in, and ringing eligibility is
/// asserted against the server's active roster (GET /api/shifts/active) via the
/// hidden `dashboard-roster-membership` element.
///
/// Fixture role: eligibility tests use `role-hub-admin` because `role-volunteer`
/// currently lacks the `shifts:set-availability` permission server-side
/// (packages/shared/permissions.ts) — a backend gap tracked separately and out of
/// iOS scope. The error-honesty test below uses the volunteer identity/role and
/// asserts the app never shows a false on-shift state, whichever way the backend
/// responds.
final class ShiftClockFlowUITests: BaseUITest {

    // MARK: - Clock In

    func testClockInUpdatesShiftsTabState() {
        launchAsHubMemberWithShift(roleIds: ["role-hub-admin"])

        when("the volunteer clocks in from the Shifts tab") {
            navigateToShifts()
            waitForElement("clock-in-button", timeout: 15).tap()
        }

        then("the shifts tab reflects the on-shift state") {
            waitForElement("clock-out-button", timeout: 15)
            waitForElement("shift-status-label")
            waitForElement("shift-elapsed-time")
            waitForElement("shifts-current-shift")
        }
    }

    // MARK: - Clock Out

    func testClockOutConfirmationRestoresOffShiftState() {
        launchAsHubMemberWithShift(roleIds: ["role-hub-admin"])
        navigateToShifts()
        waitForElement("clock-in-button", timeout: 15).tap()
        waitForElement("clock-out-button", timeout: 15)

        when("clock out is started but cancelled") {
            find("clock-out-button").tap()
            waitForElement("clock-out-cancel", timeout: 5).tap()
        }

        then("the volunteer remains on shift") {
            waitForElement("clock-out-button", timeout: 5)
        }

        when("clock out is confirmed") {
            find("clock-out-button").tap()
            waitForElement("clock-out-confirm", timeout: 5).tap()
        }

        then("the volunteer is off shift again") {
            waitForElement("clock-in-button", timeout: 15)
        }
    }

    // MARK: - Dashboard Integration

    func testDashboardReflectsClockInAndShowsActiveShift() {
        launchAsHubMemberWithShift(roleIds: ["role-hub-admin"])
        navigateToDashboard()
        waitForElement("dashboard-clock-in-button", timeout: 15)
        screenshot("dashboard-before-clock-in")

        when("the volunteer clocks in from the dashboard") {
            find("dashboard-clock-in-button").tap()
        }

        then("the dashboard shows the on-shift state and the active shift") {
            waitForElement("dashboard-clock-out-button", timeout: 15)
            waitForElement("dashboard-current-shift", timeout: 10)
            waitForElement("shift-elapsed-timer", timeout: 10)
            screenshot("dashboard-after-clock-in")
        }
    }

    // MARK: - Ringing Eligibility (Roster Membership)

    func testClockInAddsToRosterAndClockOutRemoves() {
        launchAsHubMemberWithShift(roleIds: ["role-hub-admin"])

        then("the volunteer is not in the ringing roster before clock-in") {
            navigateToDashboard()
            XCTAssertTrue(
                waitForRosterMembership("not-member", timeout: 20),
                "Volunteer must not be in the active roster before clock-in"
            )
        }

        when("the volunteer clocks in") {
            navigateToShifts()
            waitForElement("clock-in-button", timeout: 15).tap()
            waitForElement("clock-out-button", timeout: 15)
        }

        then("the volunteer becomes eligible for parallel ringing") {
            navigateToDashboard()
            XCTAssertTrue(
                waitForRosterMembership("member", timeout: 20),
                "Clock-in must add the volunteer to the server's active roster (ringing eligibility)"
            )
        }

        when("the volunteer clocks out") {
            navigateToShifts()
            find("clock-out-button").tap()
            waitForElement("clock-out-confirm", timeout: 5).tap()
            waitForElement("clock-in-button", timeout: 15)
        }

        then("the volunteer is removed from the ringing roster") {
            navigateToDashboard()
            XCTAssertTrue(
                waitForRosterMembership("not-member", timeout: 20),
                "Clock-out must remove the volunteer from the server's active roster"
            )
        }
    }

    // MARK: - Error Honesty

    /// A volunteer without clock permission (or any clock-in failure) must see a
    /// clear error and remain off-shift — never a false success. Asserts the two
    /// honest outcomes (success, or error + still off-shift) and rejects the
    /// dishonest ones (success state alongside an error, or silent failure).
    func testClockInFailureNeverShowsFalseSuccess() {
        launchAsVolunteerWithAPI()
        _ = addSelfToHub(roleIds: ["role-volunteer"])

        navigateToShifts()
        guard find("clock-in-button").waitForExistence(timeout: 15) else {
            XCTFail("Clock-in button should exist for a volunteer")
            return
        }
        find("clock-in-button").tap()

        let clockedIn = find("clock-out-button").waitForExistence(timeout: 15)
        if !clockedIn {
            // Give the error element a chance to appear after the failed attempt
            _ = find("shifts-error").waitForExistence(timeout: 10)
        }
        let errorShown = find("shifts-error").exists

        XCTAssertFalse(
            clockedIn && errorShown,
            "UI must never show on-shift state and an error at the same time"
        )
        XCTAssertTrue(
            clockedIn || errorShown,
            "A failed clock-in must surface a clear error — silent failure is not acceptable"
        )
        if !clockedIn {
            XCTAssertTrue(
                find("clock-in-button").exists,
                "After a failed clock-in the volunteer must remain clocked out"
            )
        }
    }

    // MARK: - Helpers

    /// Poll the hidden roster-membership element until it reports the expected
    /// value. The app refreshes it on clock operations and dashboard refresh, so
    /// polling tolerates the round-trip without fixed sleeps.
    private func waitForRosterMembership(_ expected: String, timeout: TimeInterval) -> Bool {
        let element = find("dashboard-roster-membership")
        let predicate = NSPredicate(format: "label == %@", expected)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
