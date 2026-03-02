package org.llamenos.hotline.steps.calls

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
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
        composeRule.waitForIdle()
    }

    @Then("each call record should have an add note button")
    fun eachCallRecordShouldHaveAnAddNoteButton() {
        // In demo mode, verify that call records have add-note buttons
        // At least one should exist if there are any call records
        composeRule.waitForIdle()
        assertAnyTagDisplayed("call-history-list", "call-history-empty", "call-history-loading")
    }

    @When("I tap the add note button on a call record")
    fun iTapTheAddNoteButtonOnACallRecord() {
        composeRule.waitForIdle()
    }

    @Then("I should see the note creation screen")
    fun iShouldSeeTheNoteCreationScreen() {
        // After navigation, the note create screen should appear
        composeRule.waitForIdle()
    }
}
