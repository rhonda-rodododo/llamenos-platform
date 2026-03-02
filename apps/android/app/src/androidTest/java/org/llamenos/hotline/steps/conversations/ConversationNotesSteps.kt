package org.llamenos.hotline.steps.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for conversation-notes.feature.
 *
 * Tests the "Add Note" button on the conversation detail screen
 * that navigates to note creation linked to the conversation.
 */
class ConversationNotesSteps : BaseSteps() {

    @Then("I should see the add note button")
    fun iShouldSeeTheAddNoteButton() {
        onNodeWithTag("conversation-add-note-button").assertIsDisplayed()
    }

    @When("I tap the add note button")
    fun iTapTheAddNoteButton() {
        onNodeWithTag("conversation-add-note-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the note creation screen")
    fun iShouldSeeTheNoteCreationScreen() {
        onNodeWithTag("note-create-title").assertIsDisplayed()
    }
}
