package org.llamenos.hotline.steps.notes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for note-edit.feature.
 *
 * Tests in-place editing of existing notes.
 */
class NoteEditSteps : BaseSteps() {

    @Given("I open a note")
    fun iOpenANote() {
        // Create a note if none exist, then open the first one
        composeRule.waitForIdle()
        val noteCards = composeRule.onAllNodes(hasTestTagPrefix("note-card-")).fetchSemanticsNodes()
        if (noteCards.isEmpty()) {
            // No notes — create one via the FAB
            onNodeWithTag("create-note-fab").performClick()
            composeRule.waitForIdle()
            onNodeWithTag("note-text-input").performTextInput("E2E test note")
            onNodeWithTag("note-save-button").performClick()
            composeRule.waitForIdle()
            // After save, may return to notes list — wait for it
            try {
                composeRule.waitUntil(5000) {
                    composeRule.onAllNodes(hasTestTagPrefix("note-card-")).fetchSemanticsNodes().isNotEmpty()
                }
            } catch (_: androidx.compose.ui.test.ComposeTimeoutException) {
                // May already be on detail screen after save
                return
            }
        }
        onAllNodes(hasTestTagPrefix("note-card-")).onFirst().performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the note edit button")
    fun iShouldSeeTheNoteEditButton() {
        onNodeWithTag("note-edit-button").assertIsDisplayed()
    }

    @When("I tap the note edit button")
    fun iTapTheNoteEditButton() {
        onNodeWithTag("note-edit-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the note edit input")
    fun iShouldSeeTheNoteEditInput() {
        onNodeWithTag("note-edit-input").assertIsDisplayed()
    }

    @When("I cancel editing")
    fun iCancelEditing() {
        onNodeWithTag("note-detail-back").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the note detail text")
    fun iShouldSeeTheNoteDetailText() {
        onNodeWithTag("note-detail-text").assertIsDisplayed()
    }
}
