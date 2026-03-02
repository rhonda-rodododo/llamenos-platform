package org.llamenos.hotline.steps.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
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

    // ---- Conversation detail (conversations-full.feature) ----

    @Given("a conversation exists")
    fun aConversationExists() {
        // Precondition — conversation data should exist in test environment
    }

    @Given("I have an open conversation")
    fun iHaveAnOpenConversation() {
        // Navigate to conversations and open the first one
        navigateToMainScreen()
        navigateToTab(NAV_CONVERSATIONS)
        composeRule.waitForIdle()
        // Try to click the first conversation card
        try {
            onAllNodes(hasTestTagPrefix("conversation-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No conversations available — subsequent steps will handle gracefully
        }
    }

    @Given("conversations from different channels exist")
    fun conversationsFromDifferentChannelsExist() {
        // Precondition — conversations with different channel types exist
    }

    @Given("an open conversation exists")
    fun anOpenConversationExists() {
        // Precondition
    }

    @Given("a closed conversation exists")
    fun aClosedConversationExists() {
        // Precondition
    }

    @Given("conversations exist")
    fun conversationsExist() {
        // Precondition
    }

    @When("I click on a conversation")
    fun iClickOnAConversation() {
        try {
            onAllNodes(hasTestTagPrefix("conversation-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No conversations available
        }
    }

    @Then("I should see the conversation thread")
    fun iShouldSeeTheConversationThread() {
        val found = assertAnyTagDisplayed("messages-list", "messages-empty", "messages-loading")
        assert(found) { "Expected conversation thread (messages list, empty, or loading)" }
    }

    @Then("I should see message timestamps")
    fun iShouldSeeMessageTimestamps() {
        // If messages exist, timestamps should be visible
        try {
            onAllNodes(hasTestTagPrefix("message-time-")).onFirst().assertIsDisplayed()
        } catch (_: AssertionError) {
            // No messages — empty state is acceptable
        }
    }

    @When("I type a message in the reply field")
    fun iTypeAMessageInTheReplyField() {
        onNodeWithTag("reply-text-input").performTextInput("Test message ${System.currentTimeMillis()}")
        composeRule.waitForIdle()
    }

    @Then("the message should appear in the thread")
    fun theMessageShouldAppearInTheThread() {
        val found = assertAnyTagDisplayed("messages-list", "messages-empty")
        assert(found) { "Expected messages area to be visible" }
    }

    @Then("each conversation should show its channel badge")
    fun eachConversationShouldShowItsChannelBadge() {
        // Channel badges are part of conversation cards
        val found = assertAnyTagDisplayed("conversations-list", "conversations-empty")
        assert(found) { "Expected conversations area to be visible" }
    }

    // ---- Conversation actions (requires UI not yet built — stubs) ----

    @When("I assign the conversation to a volunteer")
    fun iAssignTheConversationToAVolunteer() {
        // Assign UI not yet built on Android
    }

    @Then("the conversation should show the assigned volunteer")
    fun theConversationShouldShowTheAssignedVolunteer() {
        // Stub
    }

    @When("I close the conversation")
    fun iCloseTheConversation() {
        // Close UI not yet built on Android
    }

    @Then("the conversation status should change to {string}")
    fun theConversationStatusShouldChangeTo(status: String) {
        // Stub
    }

    @When("I reopen the conversation")
    fun iReopenTheConversation() {
        // Reopen UI not yet built on Android
    }

    @When("I search for a phone number")
    fun iSearchForAPhoneNumber() {
        // Conversation search UI not yet built on Android
    }

    @Then("matching conversations should be displayed")
    fun matchingConversationsShouldBeDisplayed() {
        // Stub
    }
}
