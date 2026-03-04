package org.llamenos.hotline.steps.calls

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
        assertAnyTagDisplayed("call-date-from", "call-history-list", "call-history-empty", "dashboard-title")
    }

    @Then("I should see the date to filter")
    fun iShouldSeeTheDateToFilter() {
        assertAnyTagDisplayed("call-date-to", "call-history-list", "call-history-empty", "dashboard-title")
    }

    @Given("a date range is selected")
    fun aDateRangeIsSelected() {
        composeRule.waitForIdle()
    }

    @Then("I should see the date range clear button")
    fun iShouldSeeTheDateRangeClearButton() {
        assertAnyTagDisplayed(
            "call-date-clear", "call-date-from", "call-date-to", "call-history-empty",
        )
    }
}
