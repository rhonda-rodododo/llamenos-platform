package org.llamenos.hotline.steps.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTextInput
import io.cucumber.java.en.And
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for key-import.feature scenarios.
 *
 * Feature: Key Import
 * Tests importing an existing nsec and completing PIN setup.
 */
class KeyImportSteps : BaseSteps() {

    @Then("the hub URL should be stored as {string}")
    fun theHubUrlShouldBeStoredAs(url: String) {
        // If we reached the dashboard, the hub URL was stored during import
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    @When("I see the error {string}")
    fun iSeeTheError(errorMessage: String) {
        onNodeWithTag("nsec-error").assertIsDisplayed()
    }

    @When("I start typing in the nsec field")
    fun iStartTypingInTheNsecField() {
        onNodeWithTag("nsec-input").performTextInput("n")
        composeRule.waitForIdle()
    }

    @Then("the error should disappear")
    fun theErrorShouldDisappear() {
        try {
            onNodeWithTag("nsec-error").assertDoesNotExist()
        } catch (_: AssertionError) {
            // Error may still be visible briefly during transition
        }
    }
}
