package org.llamenos.hotline.steps.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for calls-today.feature.
 */
class CallsTodaySteps : BaseSteps() {

    @Then("I should see the calls today count on the dashboard")
    fun iShouldSeeTheCallsTodayCountOnTheDashboard() {
        onNodeWithTag("calls-today-count").assertIsDisplayed()
    }

    @When("I pull to refresh the dashboard")
    fun iPullToRefreshTheDashboard() {
        // Swipe down to trigger pull-to-refresh
        // For now just verify the count is displayed after load
        composeRule.waitForIdle()
    }
}
