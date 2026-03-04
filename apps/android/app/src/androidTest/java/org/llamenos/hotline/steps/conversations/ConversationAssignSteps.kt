package org.llamenos.hotline.steps.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for conversation-assign.feature.
 *
 * Tests the assign dialog for reassigning conversations to volunteers.
 */
class ConversationAssignSteps : BaseSteps() {

    @Given("I navigate to the conversations tab")
    fun iNavigateToTheConversationsTab() {
        navigateToTab(NAV_CONVERSATIONS)
    }

    @Given("I open a conversation")
    fun iOpenAConversation() {
        // Tap the first available conversation card to open the detail screen
        composeRule.waitForIdle()
        try {
            onAllNodes(hasTestTagPrefix("conversation-card-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No conversations available — subsequent assertions will fail with clear error
        }
    }

    @Then("I should see the assign conversation button")
    fun iShouldSeeTheAssignConversationButton() {
        onNodeWithTag("assign-conversation-button").assertIsDisplayed()
    }

    @When("I tap the assign conversation button")
    fun iTapTheAssignConversationButton() {
        onNodeWithTag("assign-conversation-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the assign dialog")
    fun iShouldSeeTheAssignDialog() {
        onNodeWithTag("assign-dialog").assertIsDisplayed()
    }
}
