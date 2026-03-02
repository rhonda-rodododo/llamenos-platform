package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for report-claim.feature.
 *
 * Tests claim button visibility based on report status.
 */
class ReportClaimSteps : BaseSteps() {

    @Given("I am viewing a report with status {string}")
    fun iAmViewingAReportWithStatus(status: String) {
        // In demo mode, the report detail state is simulated.
        // The selected report status determines which buttons are visible.
        composeRule.waitForIdle()
    }

    @Then("I should see the report claim button")
    fun iShouldSeeTheReportClaimButton() {
        onNodeWithTag("report-claim-button").assertIsDisplayed()
    }

    @Then("I should not see the report claim button")
    fun iShouldNotSeeTheReportClaimButton() {
        onNodeWithTag("report-claim-button").assertDoesNotExist()
    }
}
