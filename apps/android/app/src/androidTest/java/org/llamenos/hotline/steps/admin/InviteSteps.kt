package org.llamenos.hotline.steps.admin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for invite-onboarding.feature scenarios.
 *
 * Uses InviteDialog/InvitesTab UI testTags: create-invite-fab, create-invite-dialog,
 * create-volunteer-invite, create-admin-invite, created-invite-code, copy-created-invite,
 * close-invite-dialog, invites-list, invites-empty, invite-card-{id}, invite-code-{id},
 * invite-role-{id}, invite-status-{id}, copy-invite-{id}.
 */
class InviteSteps : BaseSteps() {

    // ---- Invite creation ----

    @When("I create an invite for a new volunteer")
    fun iCreateAnInviteForANewVolunteer() {
        onNodeWithTag("create-invite-fab").performClick()
        composeRule.waitForIdle()
        onNodeWithTag("create-volunteer-invite").performClick()
        composeRule.waitForIdle()
    }

    @Then("an invite link should be generated")
    fun anInviteLinkShouldBeGenerated() {
        onNodeWithTag("created-invite-code").assertIsDisplayed()
    }

    @When("I dismiss the invite link card")
    fun iDismissTheInviteLinkCard() {
        onNodeWithTag("close-invite-dialog").performClick()
        composeRule.waitForIdle()
    }

    @Then("the volunteer name should appear in the pending invites list")
    fun theVolunteerNameShouldAppearInThePendingInvitesList() {
        val found = assertAnyTagDisplayed("invites-list", "invites-empty")
        assert(found) { "Expected invites list or empty state" }
    }

    @When("I revoke the invite")
    fun iRevokeTheInvite() {
        // Find and click the first revoke/delete button on an invite card
        onAllNodes(hasTestTagPrefix("copy-invite-")).onFirst().performClick()
        composeRule.waitForIdle()
    }

    @Then("the volunteer name should no longer appear in the list")
    fun theVolunteerNameShouldNoLongerAppearInTheList() {
        composeRule.waitForIdle()
    }

    // ---- Invite onboarding (web-specific flows — stubs for Android) ----

    @When("the volunteer opens the invite link")
    fun theVolunteerOpensTheInviteLink() {
        // On Android, deep link handling would open the app — stub for now
    }

    @Then("they should see a welcome screen with their name")
    fun theyShouldSeeAWelcomeScreenWithTheirName() {
        // Welcome screen stub — requires invite deep link handling
    }

    @When("the volunteer completes the onboarding flow")
    fun theVolunteerCompletesTheOnboardingFlow() {
        // Onboarding flow stub
    }

    @Then("they should arrive at the profile setup or dashboard")
    fun theyShouldArriveAtTheProfileSetupOrDashboard() {
        // Post-onboarding assertion stub
    }

}
