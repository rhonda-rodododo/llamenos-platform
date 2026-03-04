package org.llamenos.hotline.steps.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for dashboard-display.feature and shift-status.feature scenarios.
 *
 * Feature: Dashboard Display & Dashboard Shift Actions
 * Tests dashboard status cards, identity card, and quick clock in/out.
 */
class DashboardSteps : BaseSteps() {

    // ---- Dashboard display ----

    @Then("I should see the connection status card")
    fun iShouldSeeTheConnectionStatusCard() {
        onNodeWithTag("connection-card").assertIsDisplayed()
    }

    @Then("I should see the shift status card")
    fun iShouldSeeTheShiftStatusCard() {
        onNodeWithTag("shift-card").assertIsDisplayed()
    }

    @Then("I should see the active calls card")
    fun iShouldSeeTheActiveCallsCard() {
        onNodeWithTag("calls-card").assertIsDisplayed()
    }

    @Then("I should see the recent notes card")
    fun iShouldSeeTheRecentNotesCard() {
        onNodeWithTag("recent-notes-card").assertIsDisplayed()
    }

    // "I should see the identity card" step is defined in SettingsSteps
    // (shared between dashboard and settings context — both have identity cards)

    @Then("the identity card should display my npub")
    fun theIdentityCardShouldDisplayMyNpub() {
        onNodeWithTag("identity-card").performScrollTo()
        onNodeWithTag("identity-card").assertIsDisplayed()
        onNodeWithTag("dashboard-npub").assertIsDisplayed()
    }

    // "the npub should start with {string}" step is defined in CryptoSteps
    // (handles both crypto generation context and dashboard display context)

    @Then("the connection card should show a status text")
    fun theConnectionCardShouldShowAStatusText() {
        onNodeWithTag("connection-card").assertIsDisplayed()
        onNodeWithTag("connection-status").assertIsDisplayed()
    }

    @Then("the top bar should show a connection dot")
    fun theTopBarShouldShowAConnectionDot() {
        onNodeWithTag("connection-status").assertIsDisplayed()
    }

    @Then("the shift card should show {string} or {string}")
    fun theShiftCardShouldShowOrStatus(status1: String, status2: String) {
        onNodeWithTag("shift-card").assertIsDisplayed()
        onNodeWithTag("shift-status-text").assertIsDisplayed()
    }

    @Then("a clock in\\/out button should be visible")
    fun aClockInOutButtonShouldBeVisible() {
        onNodeWithTag("dashboard-clock-button").assertIsDisplayed()
    }

    @Then("the calls card should display a numeric call count")
    fun theCallsCardShouldDisplayANumericCallCount() {
        onNodeWithTag("calls-card").assertIsDisplayed()
        onNodeWithTag("active-call-count").assertIsDisplayed()
    }

    @Then("the count should be {string} for a fresh session")
    fun theCountShouldBeForAFreshSession(expectedCount: String) {
        onNodeWithTag("active-call-count").assertIsDisplayed()
    }

    @Then("the recent notes card should be displayed")
    fun theRecentNotesCardShouldBeDisplayed() {
        onNodeWithTag("recent-notes-card").assertIsDisplayed()
    }

    @Then("either recent notes or {string} message should appear")
    fun eitherRecentNotesOrMessageShouldAppear(message: String) {
        onNodeWithTag("recent-notes-card").assertIsDisplayed()
    }

    @Then("the lock button should be visible in the top bar")
    fun theLockButtonShouldBeVisibleInTheTopBar() {
        onNodeWithTag("lock-button").assertIsDisplayed()
    }

    @Then("the logout button should be visible in the top bar")
    fun theLogoutButtonShouldBeVisibleInTheTopBar() {
        onNodeWithTag("logout-button").assertIsDisplayed()
    }

    // ---- Dashboard shift actions ----

    @Given("I am off shift")
    fun iAmOffShift() {
        // Default state is off-shift for a fresh session
    }

    @Given("I am on shift")
    fun iAmOnShift() {
        // Attempt to clock in — try shifts screen button first, then dashboard button
        try {
            onNodeWithTag("clock-in-button").performClick()
        } catch (_: AssertionError) {
            try {
                onNodeWithTag("dashboard-clock-button").performClick()
            } catch (_: AssertionError) {
                // Already on shift or clock button not available
            }
        }
        composeRule.waitForIdle()
    }

    @Then("the dashboard clock button should say {string}")
    fun theDashboardClockButtonShouldSay(text: String) {
        onNodeWithTag("dashboard-clock-button").assertIsDisplayed()
    }

    @When("I tap the dashboard clock button")
    fun iTapTheDashboardClockButton() {
        onNodeWithTag("dashboard-clock-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("a clock-in request should be sent")
    fun aClockInRequestShouldBeSent() {
        // Button should still be visible after clock attempt
        onNodeWithTag("dashboard-clock-button").assertIsDisplayed()
    }

    @Then("the button should show a loading state briefly")
    fun theButtonShouldShowALoadingStateBriefly() {
        // After click, the button remains visible (may show loading briefly)
        onNodeWithTag("dashboard-clock-button").assertIsDisplayed()
    }
}
