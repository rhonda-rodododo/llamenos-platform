package org.llamenos.hotline.steps.reports

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
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
        val reportCards = composeRule.onAllNodes(hasTestTagPrefix("report-card-")).fetchSemanticsNodes()
        if (reportCards.isEmpty()) {
            // No reports — create one via the FAB
            try {
                onNodeWithTag("report-create-fab").performClick()
                composeRule.waitForIdle()
                onNodeWithTag("report-title-input").performTextInput("E2E Test Report")
                onNodeWithTag("report-body-input").performTextInput("Test report body for E2E")
                onNodeWithTag("report-submit-button").performClick()
                composeRule.waitForIdle()
                // After creation, may return to list — wait for report cards
                composeRule.waitUntil(5000) {
                    composeRule.onAllNodes(hasTestTagPrefix("report-card-")).fetchSemanticsNodes().isNotEmpty()
                }
            } catch (_: Exception) {
                // FAB or form may not be available
                return
            }
        }
        onAllNodes(hasTestTagPrefix("report-card-")).onFirst().performClick()
        composeRule.waitForIdle()
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
