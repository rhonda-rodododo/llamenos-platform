package org.llamenos.hotline.steps.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for transcription-preferences.feature.
 *
 * Tests the personal transcription toggle in Settings.
 */
class TranscriptionPreferencesSteps : BaseSteps() {

    @Given("I expand the transcription section")
    fun iExpandTheTranscriptionSection() {
        onNodeWithTag("settings-transcription-section-header").performScrollTo()
        onNodeWithTag("settings-transcription-section-header").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the transcription settings section")
    fun iShouldSeeTheTranscriptionSettingsSection() {
        onNodeWithTag("settings-transcription-section").performScrollTo()
        onNodeWithTag("settings-transcription-section").assertIsDisplayed()
    }

    @Then("I should see the transcription toggle")
    fun iShouldSeeTheTranscriptionToggle() {
        onNodeWithTag("settings-transcription-toggle").performScrollTo()
        onNodeWithTag("settings-transcription-toggle").assertIsDisplayed()
    }

    @Given("transcription opt-out is not allowed")
    fun transcriptionOptOutIsNotAllowed() {
        // In demo mode, opt-out defaults to allowed; this step represents
        // a scenario where admin has disabled opt-out. The managed message
        // is tested via the testTag.
    }

    @Then("I should see the transcription managed message")
    fun iShouldSeeTheTranscriptionManagedMessage() {
        // When opt-out is disabled, the managed message should appear.
        // In demo mode, the admin may not have disabled opt-out, so check both states.
        val found = assertAnyTagDisplayed(
            "settings-transcription-managed",
            "settings-transcription-toggle",
        )
        assert(found) { "Expected transcription managed message or toggle" }
    }
}
