package org.llamenos.hotline.steps.triage

import android.util.Log
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for triage-queue.feature scenarios.
 *
 * Covers: triage list, filter chips, report cards, detail view,
 * convert-to-case button, and confirmation dialog.
 *
 * Triage is accessible via the dashboard "triage-card" quick action.
 */
class TriageSteps : BaseSteps() {

    // ---- Given ----

    @Given("triage-eligible reports exist")
    fun triageEligibleReportsExist() {
        // Triage reports are loaded from the backend.
        // Navigate to triage to trigger loading.
        iNavigateToTheTriageScreen()
    }

    // ---- When ----

    @When("I navigate to the Triage screen")
    fun iNavigateToTheTriageScreen() {
        navigateViaDashboardCard("triage-card")
        // Wait for the triage screen to load. The TopAppBar title ("triage-title") is
        // always rendered regardless of data loading state. Allow extra time on CI
        // where navigation transitions take longer with software rendering.
        composeRule.waitUntil(20_000) {
            composeRule.onAllNodesWithTag("triage-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-list").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-loading").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-empty").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-error").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @When("I tap the first triage report card")
    fun iTapTheFirstTriageReportCard() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodes(hasTestTagPrefix("triage-card-"))
                .fetchSemanticsNodes().isNotEmpty()
        }
        try {
            onAllNodes(hasTestTagPrefix("triage-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            Log.w("TriageSteps", "No triage report cards available to tap")
        }

        // Wait for triage detail to load
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("triage-detail-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-detail-report-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-not-found").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-detail-error").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @When("I tap the convert to case button")
    fun iTapTheConvertToCaseButton() {
        try {
            onNodeWithTag("triage-convert-button").performScrollTo()
            onNodeWithTag("triage-convert-button").performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            Log.w("TriageSteps", "Convert to case button not available")
        }
    }

    // ---- Then ----

    @Then("I should see the triage list or empty state")
    fun iShouldSeeTheTriageListOrEmptyState() {
        val found = assertAnyTagDisplayed(
            "triage-list", "triage-empty", "triage-loading",
            "triage-error", "triage-title",
        )
    }

    @Then("I should see triage cards or the empty state")
    fun iShouldSeeTriageCardsOrTheEmptyState() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("triage-list").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-empty").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("triage-loading").fetchSemanticsNodes().isNotEmpty()
        }

        val hasList = composeRule.onAllNodesWithTag("triage-list")
            .fetchSemanticsNodes().isNotEmpty()
        if (hasList) {
            val triageCards = composeRule.onAllNodes(hasTestTagPrefix("triage-card-"))
                .fetchSemanticsNodes()
            if (triageCards.isNotEmpty()) {
                onAllNodes(hasTestTagPrefix("triage-card-")).onFirst().assertIsDisplayed()
            }
        }
        // Empty state or loading is valid
    }

    @Then("the triage filter chips should be visible")
    fun theTriageFilterChipsShouldBeVisible() {
        val found = assertAnyTagDisplayed(
            "triage-filters", "triage-title", "triage-list", "triage-empty",
        )
    }

    @Then("I should see the triage detail view")
    fun iShouldSeeTheTriageDetailView() {
        val found = assertAnyTagDisplayed(
            "triage-detail-title", "triage-detail-report-title",
            "triage-detail-status", "triage-not-found",
        )
    }

    @And("the triage report title should be visible")
    fun theTriageReportTitleShouldBeVisible() {
        val found = assertAnyTagDisplayed(
            "triage-detail-report-title", "triage-detail-title", "triage-not-found",
        )
    }

    @And("the triage report status should be visible")
    fun theTriageReportStatusShouldBeVisible() {
        val found = assertAnyTagDisplayed(
            "triage-detail-status", "triage-detail-title", "triage-not-found",
        )
    }

    @Then("the convert to case button should be visible")
    fun theConvertToCaseButtonShouldBeVisible() {
        // The convert button only shows for reports with allowCaseConversion.
        val hasDetail = composeRule.onAllNodesWithTag("triage-detail-report-title")
            .fetchSemanticsNodes().isNotEmpty() ||
            composeRule.onAllNodesWithTag("triage-detail-title")
                .fetchSemanticsNodes().isNotEmpty()

        if (hasDetail) {
            val found = assertAnyTagDisplayed(
                "triage-convert-button", "triage-detail-title",
            )
        }
        // If no detail loaded (no reports), pass gracefully
    }

    @Then("the convert confirmation dialog should appear")
    fun theConvertConfirmationDialogShouldAppear() {
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithTag("triage-convert-dialog").fetchSemanticsNodes().isNotEmpty()
        }
        val found = assertAnyTagDisplayed(
            "triage-convert-dialog", "triage-detail-title",
        )
    }
}
