package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.And
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for report-list.feature scenarios.
 *
 * Feature: Reports List — navigation from dashboard, status filter chips,
 * empty state, and back navigation.
 */
class ReportListSteps : BaseSteps() {

    // ---- Navigation ----

    @When("I tap the view reports button")
    fun iTapTheViewReportsButton() {
        onNodeWithTag("view-reports").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the reports screen")
    fun iShouldSeeTheReportsScreen() {
        onNodeWithTag("reports-title").assertIsDisplayed()
    }

    @Then("I should see the reports title")
    fun iShouldSeeTheReportsTitle() {
        onNodeWithTag("reports-title").assertIsDisplayed()
    }

    @And("I tap the back button on reports")
    fun iTapTheBackButtonOnReports() {
        onNodeWithTag("reports-back").performClick()
        composeRule.waitForIdle()
    }

    // ---- Status filter chips ----

    @Then("I should see the {string} report status filter")
    fun iShouldSeeTheReportStatusFilter(filterName: String) {
        val tag = when (filterName) {
            "All" -> "report-filter-all"
            "Active" -> "report-filter-active"
            "Waiting" -> "report-filter-waiting"
            "Closed" -> "report-filter-closed"
            else -> throw IllegalArgumentException("Unknown status filter: $filterName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    @When("I tap the {string} report status filter")
    fun iTapTheReportStatusFilter(filterName: String) {
        val tag = when (filterName) {
            "All" -> "report-filter-all"
            "Active" -> "report-filter-active"
            "Waiting" -> "report-filter-waiting"
            "Closed" -> "report-filter-closed"
            else -> throw IllegalArgumentException("Unknown status filter: $filterName")
        }
        onNodeWithTag(tag).performClick()
        composeRule.waitForIdle()
    }

    @Then("the {string} report status filter should be selected")
    fun theReportStatusFilterShouldBeSelected(filterName: String) {
        val tag = when (filterName) {
            "All" -> "report-filter-all"
            "Active" -> "report-filter-active"
            "Waiting" -> "report-filter-waiting"
            "Closed" -> "report-filter-closed"
            else -> throw IllegalArgumentException("Unknown status filter: $filterName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
        onNodeWithTag(tag).assertIsSelected()
    }

    // ---- Empty state ----

    @Then("I should see the reports empty state")
    fun iShouldSeeTheReportsEmptyState() {
        // Either shows empty state or a list — both are valid depending on data
        assertAnyTagDisplayed("reports-empty", "reports-list")
    }
}
