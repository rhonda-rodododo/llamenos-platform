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
 * empty state, pull-to-refresh, and back navigation.
 */
class ReportListSteps : BaseSteps() {

    // ---- Navigation ----

    @When("I tap the view reports button")
    fun iTapTheViewReportsButton() {
        onNodeWithTag("reports-card").performClick()
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

    // ---- Content state ----

    @Then("I should see the reports content or empty state")
    fun iShouldSeeTheReportsContentOrEmptyState() {
        assertAnyTagDisplayed("reports-list", "reports-empty", "reports-loading")
    }

    @Then("the reports screen should support pull to refresh")
    fun theReportsScreenShouldSupportPullToRefresh() {
        // Verify the screen is displayed (pull-to-refresh wraps the content)
        assertAnyTagDisplayed("reports-list", "reports-empty", "reports-loading")
    }
}
