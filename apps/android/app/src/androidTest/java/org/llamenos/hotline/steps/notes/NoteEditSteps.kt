package org.llamenos.hotline.steps.notes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
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
        // In demo mode, a note may or may not exist.
        // The edit button test is structural — verify it appears on the detail screen.
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
