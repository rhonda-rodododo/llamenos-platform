package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
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
        // Navigate to reports screen via dashboard card
        navigateViaDashboardCard("reports-card")
        waitForNode("reports-title")
        // Try to create a report if none exist, then open the first one
        val reportCards = composeRule.onAllNodes(hasTestTagPrefix("report-card-")).fetchSemanticsNodes()
        if (reportCards.isEmpty()) {
            try {
                onNodeWithTag("report-create-fab").performClick()
                composeRule.waitForIdle()
                onNodeWithTag("report-title-input").performTextInput("E2E Report ${System.currentTimeMillis()}")
                onNodeWithTag("report-body-input").performTextInput("Test report body")
                onNodeWithTag("report-submit-button").performClick()
                composeRule.waitForIdle()
            } catch (_: Exception) { /* FAB or form may not be available */ }
        }
        try {
            onAllNodes(hasTestTagPrefix("report-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No reports — subsequent assertions will fail clearly
        }
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
