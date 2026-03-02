package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for report-close.feature.
 *
 * Tests close button visibility based on report status.
 */
class ReportCloseSteps : BaseSteps() {

    @Then("I should see the report close button")
    fun iShouldSeeTheReportCloseButton() {
        onNodeWithTag("report-close-button").assertIsDisplayed()
    }

    @Then("I should not see the report close button")
    fun iShouldNotSeeTheReportCloseButton() {
        onNodeWithTag("report-close-button").assertDoesNotExist()
    }
}
