package org.llamenos.hotline.steps.calls

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for call-date-filter.feature.
 *
 * Tests the date range filtering on the call history screen.
 */
class CallDateFilterSteps : BaseSteps() {

    @Then("I should see the date from filter")
    fun iShouldSeeTheDateFromFilter() {
        onNodeWithTag("call-date-from").assertIsDisplayed()
    }

    @Then("I should see the date to filter")
    fun iShouldSeeTheDateToFilter() {
        onNodeWithTag("call-date-to").assertIsDisplayed()
    }

    @Given("a date range is selected")
    fun aDateRangeIsSelected() {
        // In demo mode, date range state is simulated
        composeRule.waitForIdle()
    }

    @Then("I should see the date range clear button")
    fun iShouldSeeTheDateRangeClearButton() {
        onNodeWithTag("call-date-clear").assertIsDisplayed()
    }
}
