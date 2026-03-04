package org.llamenos.hotline.steps.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for emergency-wipe.feature.
 *
 * Tests the panic button that permanently erases all local data.
 * Background step "Given I am on the settings screen" is in SettingsSteps.
 */
class EmergencyWipeSteps : BaseSteps() {

    @Then("I should see the emergency wipe button")
    fun iShouldSeeTheEmergencyWipeButton() {
        onNodeWithTag("settings-panic-wipe-button").performScrollTo()
        onNodeWithTag("settings-panic-wipe-button").assertIsDisplayed()
    }

    @When("I tap the emergency wipe button")
    fun iTapTheEmergencyWipeButton() {
        onNodeWithTag("settings-panic-wipe-button").performScrollTo()
        onNodeWithTag("settings-panic-wipe-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the emergency wipe confirmation dialog")
    fun iShouldSeeTheEmergencyWipeConfirmationDialog() {
        waitForNode("panic-wipe-dialog")
        onNodeWithTag("panic-wipe-dialog").assertIsDisplayed()
    }

    @Then("the dialog should warn about permanent data loss")
    fun theDialogShouldWarnAboutPermanentDataLoss() {
        onNodeWithTag("panic-wipe-dialog").assertIsDisplayed()
    }

    @When("I confirm the emergency wipe")
    fun iConfirmTheEmergencyWipe() {
        onNodeWithTag("confirm-panic-wipe-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("all local data should be erased")
    fun allLocalDataShouldBeErased() {
        // After wipe, we should be navigated to the login screen
        waitForNode("create-identity", 10_000)
    }

    @Then("I should be returned to the login screen")
    fun iShouldBeReturnedToTheLoginScreen() {
        waitForNode("create-identity", 10_000)
        onNodeWithTag("create-identity").assertIsDisplayed()
    }

    @When("I cancel the emergency wipe")
    fun iCancelTheEmergencyWipe() {
        onNodeWithTag("cancel-panic-wipe-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("the confirmation dialog should close")
    fun theConfirmationDialogShouldClose() {
        waitForNode("settings-identity-card")
        onNodeWithTag("settings-identity-card").performScrollTo()
        onNodeWithTag("settings-identity-card").assertIsDisplayed()
    }

    @Then("I should still be on the settings screen")
    fun iShouldStillBeOnTheSettingsScreen() {
        waitForNode("settings-identity-card")
        onNodeWithTag("settings-identity-card").performScrollTo()
        onNodeWithTag("settings-identity-card").assertIsDisplayed()
    }
}
