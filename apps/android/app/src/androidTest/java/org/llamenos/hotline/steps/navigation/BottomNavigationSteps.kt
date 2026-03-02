package org.llamenos.hotline.steps.navigation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for bottom-navigation.feature scenarios.
 *
 * Feature: Bottom Navigation
 * Tests tab visibility and switching.
 */
class BottomNavigationSteps : BaseSteps() {

    @Then("I should see the Dashboard tab")
    fun iShouldSeeTheDashboardTab() {
        onNodeWithTag(NAV_DASHBOARD).assertIsDisplayed()
    }

    @Then("I should see the Notes tab")
    fun iShouldSeeTheNotesTab() {
        onNodeWithTag(NAV_NOTES).assertIsDisplayed()
    }

    @Then("I should see the Conversations tab")
    fun iShouldSeeTheConversationsTab() {
        onNodeWithTag(NAV_CONVERSATIONS).assertIsDisplayed()
    }

    @Then("I should see the Shifts tab")
    fun iShouldSeeTheShiftsTab() {
        onNodeWithTag(NAV_SHIFTS).assertIsDisplayed()
    }

    @Then("I should see the Settings tab")
    fun iShouldSeeTheSettingsTab() {
        onNodeWithTag(NAV_SETTINGS).assertIsDisplayed()
    }

    @Then("I should see the shifts screen")
    fun iShouldSeeTheShiftsScreen() {
        onNodeWithTag("clock-card").assertIsDisplayed()
    }

    @Then("I should see the notes screen")
    fun iShouldSeeTheNotesScreen() {
        onNodeWithTag("create-note-fab").assertIsDisplayed()
    }

    @Then("I should see the settings screen")
    fun iShouldSeeTheSettingsScreen() {
        onNodeWithTag("settings-identity-card").assertIsDisplayed()
    }

    @Then("I should see the conversation filters")
    fun iShouldSeeTheConversationFilters() {
        onNodeWithTag("conversation-filters").assertIsDisplayed()
    }

    @Then("I should see the create note FAB")
    fun iShouldSeeTheCreateNoteFab() {
        onNodeWithTag("create-note-fab").assertIsDisplayed()
    }
}
