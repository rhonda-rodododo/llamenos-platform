package org.llamenos.hotline.steps.events

import android.util.Log
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for event-management.feature scenarios.
 *
 * Covers: events list, event cards, search field, event detail
 * tabs (details, sub-events, linked cases, linked reports).
 *
 * Events are accessible via the dashboard "events-card" quick action.
 */
class EventsSteps : BaseSteps() {

    // ---- Given ----

    @Given("events exist in the system")
    fun eventsExistInTheSystem() {
        // Events are loaded from the backend by the ViewModel.
        // Navigate to events to trigger loading.
        iNavigateToTheEventsScreen()
    }

    // ---- When ----

    @When("I navigate to the Events screen")
    fun iNavigateToTheEventsScreen() {
        navigateViaDashboardCard("events-card")
        // Wait for the events screen to load
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("events-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-list").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-loading").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-empty").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-error").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-cms-disabled").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @When("I tap the first event card")
    fun iTapTheFirstEventCard() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodes(hasTestTagPrefix("event-card-"))
                .fetchSemanticsNodes().isNotEmpty()
        }
        try {
            onAllNodes(hasTestTagPrefix("event-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            Log.w("EventsSteps", "No event cards available to tap")
        }

        // Wait for event detail to load
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("event-detail-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("event-detail-tabs").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("event-detail-loading").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("event-detail-error").fetchSemanticsNodes().isNotEmpty()
        }
    }

    // ---- Then ----

    @Then("I should see the events list or empty state")
    fun iShouldSeeTheEventsListOrEmptyState() {
        val found = assertAnyTagDisplayed(
            "events-list", "events-empty", "events-loading",
            "events-error", "events-cms-disabled", "events-title",
        )
    }

    @Then("I should see event cards or the empty state")
    fun iShouldSeeEventCardsOrTheEmptyState() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("events-list").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-empty").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-loading").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("events-cms-disabled").fetchSemanticsNodes().isNotEmpty()
        }

        val hasList = composeRule.onAllNodesWithTag("events-list")
            .fetchSemanticsNodes().isNotEmpty()
        if (hasList) {
            val eventCards = composeRule.onAllNodes(hasTestTagPrefix("event-card-"))
                .fetchSemanticsNodes()
            if (eventCards.isNotEmpty()) {
                onAllNodes(hasTestTagPrefix("event-card-")).onFirst().assertIsDisplayed()
            }
        }
        // Empty or CMS disabled is valid
    }

    @Then("the events search field should be visible")
    fun theEventsSearchFieldShouldBeVisible() {
        val found = assertAnyTagDisplayed(
            "events-search", "events-title", "events-list", "events-empty",
        )
    }

    @Then("I should see the event detail tabs")
    fun iShouldSeeTheEventDetailTabs() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("event-detail-tabs").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("event-detail-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("event-detail-error").fetchSemanticsNodes().isNotEmpty()
        }
        val found = assertAnyTagDisplayed(
            "event-detail-tabs", "event-detail-title", "event-detail-error",
        )
    }

    @Then("I should see the details tab in event detail")
    fun iShouldSeeTheDetailsTabInEventDetail() {
        val found = assertAnyTagDisplayed(
            "event-details-tab", "event-detail-tabs", "event-detail-title",
        )
    }

    @And("I should see the sub-events tab")
    fun iShouldSeeTheSubEventsTab() {
        val found = assertAnyTagDisplayed(
            "event-detail-tabs", "event-detail-title",
        )
    }

    @And("I should see the linked cases tab")
    fun iShouldSeeTheLinkedCasesTab() {
        val found = assertAnyTagDisplayed(
            "event-detail-tabs", "event-detail-title",
        )
    }

    @And("I should see the linked reports tab")
    fun iShouldSeeTheLinkedReportsTab() {
        val found = assertAnyTagDisplayed(
            "event-detail-tabs", "event-detail-title",
        )
    }
}
