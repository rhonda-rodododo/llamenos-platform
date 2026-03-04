package org.llamenos.hotline.steps.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for dashboard-help-nav.feature.
 *
 * Tests the dashboard help card and navigation to the help screen.
 */
class DashboardHelpNavSteps : BaseSteps() {

    @Then("I should see the help card")
    fun iShouldSeeTheHelpCard() {
        onNodeWithTag("help-card").performScrollTo()
        onNodeWithTag("help-card").assertIsDisplayed()
    }

    @When("I tap the help card")
    fun iTapTheHelpCard() {
        onNodeWithTag("help-card").performScrollTo()
        onNodeWithTag("help-card").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the help screen")
    fun iShouldSeeTheHelpScreen() {
        waitForNode("help-screen")
        onNodeWithTag("help-screen").assertIsDisplayed()
    }
}
