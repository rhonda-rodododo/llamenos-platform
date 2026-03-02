package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onNodeWithTag
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
        // In demo mode, navigate to reports via dashboard
        composeRule.waitForIdle()
    }

    @Given("I navigate to the report creation form")
    fun iNavigateToTheReportCreationForm() {
        // In demo mode, the form is navigated to via the FAB
        composeRule.waitForIdle()
    }

    @Then("I should see the create report button")
    fun iShouldSeeTheCreateReportButton() {
        onNodeWithTag("report-create-fab").assertIsDisplayed()
    }

    @Then("I should see the report title input")
    fun iShouldSeeTheReportTitleInput() {
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
