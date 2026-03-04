package org.llamenos.hotline.steps.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.And
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for dashboard-blasts-nav.feature scenarios.
 *
 * Feature: Dashboard Blasts Navigation — access blasts screen from
 * the dashboard card and back navigation.
 */
class DashboardBlastsNavSteps : BaseSteps() {

    @Then("I should see the blasts card on the dashboard")
    fun iShouldSeeTheBlastsCardOnTheDashboard() {
        onNodeWithTag("blasts-card").performScrollTo()
        onNodeWithTag("blasts-card").assertIsDisplayed()
    }

    @When("I tap the view blasts button")
    fun iTapTheViewBlastsButton() {
        onNodeWithTag("blasts-card").performScrollTo()
        onNodeWithTag("blasts-card").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the blasts screen")
    fun iShouldSeeTheBlastsScreen() {
        waitForNode("blasts-title")
        onNodeWithTag("blasts-title").assertIsDisplayed()
    }

    @And("I tap the back button on blasts")
    fun iTapTheBackButtonOnBlasts() {
        onNodeWithTag("blasts-back").performClick()
        composeRule.waitForIdle()
    }
}
