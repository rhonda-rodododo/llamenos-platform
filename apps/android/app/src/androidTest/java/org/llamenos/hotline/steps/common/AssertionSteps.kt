package org.llamenos.hotline.steps.common

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Generic assertion step definitions used across multiple features.
 *
 * Handles "I should see" and "I should remain on" patterns that are
 * shared between many scenarios.
 */
class AssertionSteps : BaseSteps() {

    @Then("I should see the PIN unlock screen")
    fun iShouldSeeThePinUnlockScreen() {
        waitForNode("pin-pad")
        onNodeWithTag("pin-pad").assertIsDisplayed()
    }

    @Then("I should see the PIN setup screen")
    fun iShouldSeeThePinSetupScreen() {
        waitForNode("pin-pad")
        onNodeWithTag("pin-pad").assertIsDisplayed()
    }

    @Then("I should remain on the login screen")
    fun iShouldRemainOnTheLoginScreen() {
        onNodeWithTag("app-title").assertIsDisplayed()
    }

    @Then("I should return to the login screen")
    fun iShouldReturnToTheLoginScreen() {
        onNodeWithTag("app-title").assertIsDisplayed()
        onNodeWithTag("create-identity").assertIsDisplayed()
    }

    @Then("I should return to the notes list")
    fun iShouldReturnToTheNotesList() {
        onNodeWithTag("create-note-fab").assertIsDisplayed()
    }

    @Then("I should return to the settings screen")
    fun iShouldReturnToTheSettingsScreen() {
        onNodeWithTag("settings-profile-section").assertIsDisplayed()
    }

    @Then("I should arrive at the dashboard")
    fun iShouldArriveAtTheDashboard() {
        waitForNode("dashboard-title")
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }
}
