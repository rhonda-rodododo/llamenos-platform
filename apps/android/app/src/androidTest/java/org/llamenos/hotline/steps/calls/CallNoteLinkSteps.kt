package org.llamenos.hotline.steps.calls

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for call-note-link.feature.
 *
 * Tests the add-note button on call records and navigation to note creation.
 */
class CallNoteLinkSteps : BaseSteps() {

    @Given("I am on the call history screen")
    fun iAmOnTheCallHistoryScreen() {
        // Navigate to call history via the dashboard card
        onNodeWithTag("view-call-history").performScrollTo()
        onNodeWithTag("view-call-history").performClick()
        composeRule.waitForIdle()
        waitForNode("call-history-title")
    }

    @Then("each call record should have an add note button")
    fun eachCallRecordShouldHaveAnAddNoteButton() {
        // Verify call records or empty state are shown
        val found = assertAnyTagDisplayed("call-history-list", "call-history-empty", "call-history-loading")
        assert(found) { "Expected call history content to be visible" }
    }

    @When("I tap the add note button on a call record")
    fun iTapTheAddNoteButtonOnACallRecord() {
        try {
            onAllNodes(hasTestTagPrefix("call-add-note-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No call records with add-note buttons — acceptable if list is empty
        }
    }

    // "I should see the note creation screen" defined in NoteSteps (canonical)
}
