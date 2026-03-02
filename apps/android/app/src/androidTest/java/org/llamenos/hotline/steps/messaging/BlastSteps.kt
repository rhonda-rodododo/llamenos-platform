package org.llamenos.hotline.steps.messaging

import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for blasts.feature scenarios.
 *
 * Blasts UI is not yet built on Android (Epic 230).
 * These are stub step definitions.
 */
class BlastSteps : BaseSteps() {

    @When("I compose a blast message")
    fun iComposeABlastMessage() {
        // Blasts UI not yet built — stub
    }

    @When("I select recipients")
    fun iSelectRecipients() {
        // Stub
    }

    @Then("the blast should appear in the blast list")
    fun theBlastShouldAppearInTheBlastList() {
        // Stub
    }

    @Then("I should see the recipient selection interface")
    fun iShouldSeeTheRecipientSelectionInterface() {
        // Stub
    }

    @Then("I should be able to select individual volunteers")
    fun iShouldBeAbleToSelectIndividualVolunteers() {
        // Stub
    }

    @Then("I should be able to select all volunteers")
    fun iShouldBeAbleToSelectAllVolunteers() {
        // Stub
    }

    @When("I set a future send time")
    fun iSetAFutureSendTime() {
        // Stub
    }

    @Then("the blast should appear as {string}")
    fun theBlastShouldAppearAs(status: String) {
        // Stub
    }

    @Given("a blast has been sent")
    fun aBlastHasBeenSent() {
        // Precondition
    }

    @Then("I should see the delivery status for the blast")
    fun iShouldSeeTheDeliveryStatusForTheBlast() {
        // Stub
    }
}
