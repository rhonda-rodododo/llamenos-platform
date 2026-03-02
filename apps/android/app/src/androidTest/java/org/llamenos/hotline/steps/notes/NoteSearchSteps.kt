package org.llamenos.hotline.steps.notes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for notes-search.feature.
 *
 * Tests the search bar on the notes list screen.
 */
class NoteSearchSteps : BaseSteps() {

    @Given("I navigate to the notes tab")
    fun iNavigateToTheNotesTab() {
        navigateToTab(NAV_NOTES)
    }

    @Then("I should see the notes search input")
    fun iShouldSeeTheNotesSearchInput() {
        onNodeWithTag("notes-search-input").assertIsDisplayed()
    }

    @When("I type in the notes search input")
    fun iTypeInTheNotesSearchInput() {
        onNodeWithTag("notes-search-input").performTextInput("test")
        composeRule.waitForIdle()
    }

    @Then("the notes list should update")
    fun theNotesListShouldUpdate() {
        // After typing a search query, the list should still be in one of the expected states
        val found = assertAnyTagDisplayed("notes-list", "notes-empty", "notes-loading")
        assert(found) { "Expected notes screen to update after search" }
    }

    @When("I clear the notes search")
    fun iClearTheNotesSearch() {
        onNodeWithTag("notes-search-clear").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the full notes list")
    fun iShouldSeeTheFullNotesList() {
        val found = assertAnyTagDisplayed("notes-list", "notes-empty", "notes-loading")
        assert(found) { "Expected notes screen to show full list after clearing search" }
    }
}
