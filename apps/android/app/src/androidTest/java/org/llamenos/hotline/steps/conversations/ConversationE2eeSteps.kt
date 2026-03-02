package org.llamenos.hotline.steps.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for conversation-e2ee.feature.
 *
 * Tests the E2EE encryption indicator on the conversation detail screen.
 */
class ConversationE2eeSteps : BaseSteps() {

    @Then("I should see the E2EE encryption indicator")
    fun iShouldSeeTheE2eeEncryptionIndicator() {
        onNodeWithTag("e2ee-indicator").assertIsDisplayed()
    }

    @Then("the indicator should display {string}")
    fun theIndicatorShouldDisplay(expectedText: String) {
        onNodeWithTag("e2ee-indicator").assertTextContains(expectedText, substring = true)
    }
}
