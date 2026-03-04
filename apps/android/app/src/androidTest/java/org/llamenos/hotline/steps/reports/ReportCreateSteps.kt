package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for report-create.feature.
 *
 * Tests the report creation FAB, form fields, and submit button state.
 */
class ReportCreateSteps : BaseSteps() {

    @Given("I navigate to the reports list")
    fun iNavigateToTheReportsList() {
        // Navigate to the reports screen via the dashboard quick action card
        navigateViaDashboardCard("reports-card")
        waitForNode("reports-title")
    }

    @Given("I navigate to the report creation form")
    fun iNavigateToTheReportCreationForm() {
        // Navigate to reports first, then tap the create FAB
        navigateViaDashboardCard("reports-card")
        waitForNode("report-create-fab")
        onNodeWithTag("report-create-fab").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the create report button")
    fun iShouldSeeTheCreateReportButton() {
        onNodeWithTag("report-create-fab").assertIsDisplayed()
    }

    @Then("I should see the report title input")
    fun iShouldSeeTheReportTitleInput() {
        waitForNode("report-title-input")
        onNodeWithTag("report-title-input").assertIsDisplayed()
    }

    @Then("I should see the report body input")
    fun iShouldSeeTheReportBodyInput() {
        onNodeWithTag("report-body-input").assertIsDisplayed()
    }

    @Then("I should see the report submit button")
    fun iShouldSeeTheReportSubmitButton() {
        onNodeWithTag("report-submit-button").assertIsDisplayed()
    }

    @Then("the report submit button should be disabled")
    fun theReportSubmitButtonShouldBeDisabled() {
        onNodeWithTag("report-submit-button").assertIsNotEnabled()
    }
}
