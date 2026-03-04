package org.llamenos.hotline.steps.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for dashboard-break.feature.
 *
 * Tests the break toggle and banner on the dashboard.
 */
class DashboardBreakSteps : BaseSteps() {

    @Given("the volunteer is on shift")
    fun theVolunteerIsOnShift() {
        // Clock in via the dashboard clock button to get on shift
        try {
            onNodeWithTag("dashboard-clock-button").performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // Clock button may not be visible — shift state depends on server
        }
    }

    @Given("the volunteer is on break")
    fun theVolunteerIsOnBreak() {
        // Clock in first, then toggle break
        theVolunteerIsOnShift()
        try {
            onNodeWithTag("dashboard-break-button").performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // Break button only visible when on shift
        }
    }

    @Then("I should see the break toggle button")
    fun iShouldSeeTheBreakToggleButton() {
        onNodeWithTag("dashboard-break-button").assertIsDisplayed()
    }

    @Then("I should see the on-break banner")
    fun iShouldSeeTheOnBreakBanner() {
        onNodeWithTag("break-banner").assertIsDisplayed()
    }
}
