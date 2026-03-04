package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for report-detail.feature scenarios.
 *
 * Feature: Report Detail — navigation from report list, metadata display,
 * status badge, and back navigation.
 */
class ReportDetailSteps : BaseSteps() {

    // ---- Navigation ----

    @When("I tap the first report card")
    fun iTapTheFirstReportCard() {
        composeRule.waitForIdle()
        try {
            onAllNodes(hasTestTagPrefix("report-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No report cards available — subsequent assertions will fail clearly
        }
    }

    @Then("I should see the report detail screen")
    fun iShouldSeeTheReportDetailScreen() {
        waitForNode("report-detail-title")
        onNodeWithTag("report-detail-title").assertIsDisplayed()
    }

    @When("I tap the back button on report detail")
    fun iTapTheBackButtonOnReportDetail() {
        onNodeWithTag("report-detail-back").performClick()
        composeRule.waitForIdle()
    }

    // ---- Content ----

    @Then("I should see the report metadata card")
    fun iShouldSeeTheReportMetadataCard() {
        onNodeWithTag("report-metadata-card").assertIsDisplayed()
    }

    @Then("I should see the report status badge")
    fun iShouldSeeTheReportStatusBadge() {
        onNodeWithTag("report-detail-status").assertIsDisplayed()
    }
}
