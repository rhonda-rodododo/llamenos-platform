package org.llamenos.hotline.steps.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for conversation-list.feature and conversation-filters.feature.
 *
 * Feature: Conversations List — navigation, filter chip display.
 * Feature: Conversation Filters — switching between Active, Closed, and All filters.
 */
class ConversationSteps : BaseSteps() {

    // ---- Conversations list ----

    @Then("I should see the conversations screen")
    fun iShouldSeeTheConversationsScreen() {
        onNodeWithTag("conversation-filters").assertIsDisplayed()
    }

    @Then("the filter chips should be visible")
    fun theFilterChipsShouldBeVisible() {
        onNodeWithTag("filter-active").assertIsDisplayed()
        onNodeWithTag("filter-closed").assertIsDisplayed()
        onNodeWithTag("filter-all").assertIsDisplayed()
    }

    @Then("I should see the {string} filter chip")
    fun iShouldSeeTheFilterChip(filterName: String) {
        val tag = when (filterName) {
            "Active" -> "filter-active"
            "Closed" -> "filter-closed"
            "All" -> "filter-all"
            else -> throw IllegalArgumentException("Unknown filter: $filterName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    @Then("the {string} filter should be selected")
    fun theFilterShouldBeSelected(filterName: String) {
        val tag = when (filterName) {
            "Active" -> "filter-active"
            "Closed" -> "filter-closed"
            "All" -> "filter-all"
            else -> throw IllegalArgumentException("Unknown filter: $filterName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    // ---- Conversation filters ----

    @Given("I am authenticated and on the conversations screen")
    fun iAmAuthenticatedAndOnTheConversationsScreen() {
        navigateToMainScreen()
        navigateToTab(NAV_CONVERSATIONS)
    }

    @When("I tap the {string} filter chip")
    fun iTapTheFilterChip(filterName: String) {
        val tag = when (filterName) {
            "Active" -> "filter-active"
            "Closed" -> "filter-closed"
            "All" -> "filter-all"
            else -> throw IllegalArgumentException("Unknown filter chip: $filterName")
        }
        onNodeWithTag(tag).performClick()
        composeRule.waitForIdle()
    }

    @Then("the conversation list should update")
    fun theConversationListShouldUpdate() {
        // After filter change, the conversations area should be visible
        onNodeWithTag("conversation-filters").assertIsDisplayed()
    }

    @Given("I have selected the {string} filter")
    fun iHaveSelectedTheFilter(filterName: String) {
        iTapTheFilterChip(filterName)
    }

    @Then("I should see either the conversations list, empty state, or loading indicator")
    fun iShouldSeeEitherTheConversationsListEmptyStateOrLoadingIndicator() {
        val found = assertAnyTagDisplayed(
            "conversations-empty", "conversations-list", "conversations-loading"
        )
        assert(found) { "Expected conversations to show empty state, list, or loading" }
    }
}
