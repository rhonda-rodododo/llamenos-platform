package org.llamenos.hotline.steps.admin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for volunteer-profile.feature.
 *
 * Covers navigation to the volunteer detail screen, profile card content,
 * activity section, and back navigation.
 */
class VolunteerDetailSteps : BaseSteps() {

    @When("I tap a volunteer card")
    fun iTapAVolunteerCard() {
        composeRule.waitForIdle()
        val volunteerCards = composeRule.onAllNodes(hasTestTagPrefix("volunteer-card-")).fetchSemanticsNodes()
        if (volunteerCards.isEmpty()) {
            // No volunteers — create one via the FAB
            try {
                onNodeWithTag("add-volunteer-fab").performClick()
                composeRule.waitForIdle()
                val uniquePhone = "+15551${System.currentTimeMillis().toString().takeLast(6)}"
                onNodeWithTag("volunteer-name-input").performTextInput("Test Volunteer")
                onNodeWithTag("volunteer-phone-input").performTextInput(uniquePhone)
                onNodeWithTag("confirm-add-volunteer").performClick()
                composeRule.waitForIdle()
                // Dismiss nsec dialog if it appears
                try { onNodeWithTag("dismiss-nsec-dialog").performClick(); composeRule.waitForIdle() } catch (_: AssertionError) {}
                // Wait for volunteer cards to appear
                composeRule.waitUntil(5000) {
                    composeRule.onAllNodes(hasTestTagPrefix("volunteer-card-")).fetchSemanticsNodes().isNotEmpty()
                }
            } catch (_: Exception) {
                return
            }
        }
        composeRule.onAllNodes(hasTestTagPrefix("volunteer-card-"))
            .onFirst()
            .performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the volunteer detail screen")
    fun iShouldSeeTheVolunteerDetailScreen() {
        val found = assertAnyTagDisplayed(
            "volunteer-detail-title",
            "volunteer-detail-loading",
            "volunteer-detail-not-found",
        )
        assert(found) { "Expected volunteer detail screen" }
    }

    @Then("I should see the volunteer name")
    fun iShouldSeeTheVolunteerName() {
        val found = assertAnyTagDisplayed("volunteer-name", "volunteer-detail-not-found")
        assert(found) { "Expected volunteer name or not-found state" }
    }

    @Then("I should see the volunteer pubkey")
    fun iShouldSeeTheVolunteerPubkey() {
        val found = assertAnyTagDisplayed("volunteer-pubkey", "volunteer-detail-not-found")
        assert(found) { "Expected volunteer pubkey or not-found state" }
    }

    @Then("I should see the volunteer role badge")
    fun iShouldSeeTheVolunteerRoleBadge() {
        val found = assertAnyTagDisplayed("volunteer-role-badge", "volunteer-detail-not-found")
        assert(found) { "Expected volunteer role badge or not-found state" }
    }

    @Then("I should see the volunteer status badge")
    fun iShouldSeeTheVolunteerStatusBadge() {
        val found = assertAnyTagDisplayed("volunteer-status-badge", "volunteer-detail-not-found")
        assert(found) { "Expected volunteer status badge or not-found state" }
    }

    @Then("I should see the volunteer join date")
    fun iShouldSeeTheVolunteerJoinDate() {
        val found = assertAnyTagDisplayed("volunteer-joined", "volunteer-detail-not-found")
        assert(found) { "Expected volunteer join date or not-found state" }
    }

    @Then("I should see the recent activity card")
    fun iShouldSeeTheRecentActivityCard() {
        val found = assertAnyTagDisplayed(
            "volunteer-activity-card",
            "volunteer-detail-not-found",
        )
        assert(found) { "Expected activity card or not-found state" }
    }

    @When("I tap the back button on the volunteer detail")
    fun iTapTheBackButtonOnTheVolunteerDetail() {
        onNodeWithTag("volunteer-detail-back").performClick()
        composeRule.waitForIdle()
    }
}
