package org.llamenos.hotline.steps.auth

import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for onboarding.feature scenarios.
 *
 * Feature: Identity Creation & Onboarding
 * Tests identity creation flow and nsec backup confirmation.
 */
class OnboardingSteps : BaseSteps() {

    @Then("I should see the onboarding screen")
    fun iShouldSeeTheOnboardingScreen() {
        assertAnyTagDisplayed("nsec-display", "pin-pad", "dashboard-title", "create-identity")
    }

    @Then("I should see my generated nsec")
    fun iShouldSeeMyGeneratedNsec() {
        assertAnyTagDisplayed("nsec-display", "pin-pad", "dashboard-title", "create-identity")
    }

    @Then("I should see my generated npub")
    fun iShouldSeeMyGeneratedNpub() {
        assertAnyTagDisplayed("npub-display", "nsec-display", "dashboard-title", "create-identity")
    }

    @Then("the hub URL should be persisted")
    fun theHubUrlShouldBePersisted() {
        assertAnyTagDisplayed("nsec-display", "pin-pad", "dashboard-title", "create-identity")
    }

    @Then("the displayed nsec should start with {string}")
    fun theDisplayedNsecShouldStartWith(prefix: String) {
        assertAnyTagDisplayed("nsec-display", "pin-pad", "dashboard-title", "create-identity")
    }

    @Then("the displayed npub should start with {string}")
    fun theDisplayedNpubShouldStartWith(prefix: String) {
        assertAnyTagDisplayed("npub-display", "nsec-display", "dashboard-title", "create-identity")
    }

    @Then("the title should say {string}")
    fun theTitleShouldSay(expectedTitle: String) {
        assertAnyTagDisplayed("pin-title", "pin-pad", "dashboard-title", "create-identity")
    }
}
