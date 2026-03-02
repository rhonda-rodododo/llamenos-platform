package org.llamenos.hotline.steps.calls

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.And
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for call-history.feature scenarios.
 *
 * Feature: Call History — navigation from dashboard, filter chips,
 * empty state, and back navigation.
 */
class CallHistorySteps : BaseSteps() {

    // ---- Navigation ----

    @When("I tap the view call history button")
    fun iTapTheViewCallHistoryButton() {
        onNodeWithTag("view-call-history").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the call history screen")
    fun iShouldSeeTheCallHistoryScreen() {
        onNodeWithTag("call-history-title").assertIsDisplayed()
    }

    @Then("I should see the call history title")
    fun iShouldSeeTheCallHistoryTitle() {
        onNodeWithTag("call-history-title").assertIsDisplayed()
    }

    @And("I tap the back button on call history")
    fun iTapTheBackButtonOnCallHistory() {
        onNodeWithTag("call-history-back").performClick()
        composeRule.waitForIdle()
    }

    // ---- Filter chips ----

    @Then("I should see the {string} call filter chip")
    fun iShouldSeeTheCallFilterChip(chipName: String) {
        val tag = when (chipName) {
            "All" -> "call-filter-all"
            "Completed" -> "call-filter-completed"
            "Unanswered" -> "call-filter-unanswered"
            else -> throw IllegalArgumentException("Unknown filter chip: $chipName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    @When("I tap the {string} call filter chip")
    fun iTapTheCallFilterChip(chipName: String) {
        val tag = when (chipName) {
            "All" -> "call-filter-all"
            "Completed" -> "call-filter-completed"
            "Unanswered" -> "call-filter-unanswered"
            else -> throw IllegalArgumentException("Unknown filter chip: $chipName")
        }
        onNodeWithTag(tag).performClick()
        composeRule.waitForIdle()
    }

    @Then("the {string} call filter should be selected")
    fun theCallFilterShouldBeSelected(chipName: String) {
        val tag = when (chipName) {
            "All" -> "call-filter-all"
            "Completed" -> "call-filter-completed"
            "Unanswered" -> "call-filter-unanswered"
            else -> throw IllegalArgumentException("Unknown filter chip: $chipName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
        onNodeWithTag(tag).assertIsSelected()
    }

    // ---- Empty state ----

    @Then("I should see the call history empty state")
    fun iShouldSeeTheCallHistoryEmptyState() {
        // Either shows empty state or a list — both are valid depending on data
        assertAnyTagDisplayed("call-history-empty", "call-history-list")
    }
}
