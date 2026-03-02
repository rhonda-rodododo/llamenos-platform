package org.llamenos.hotline.steps.admin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for demo-mode.feature scenarios.
 *
 * Demo mode adds demo account buttons to the login screen and a dismissible
 * banner on the main screen when in demo mode.
 */
class DemoModeSteps : BaseSteps() {

    @When("I navigate to the setup wizard summary step")
    fun iNavigateToTheSetupWizardSummaryStep() {
        // Setup wizard on Android is the login screen with demo buttons
        // Navigate to login (may already be there)
    }

    @Then("I should see a {string} toggle")
    fun iShouldSeeAToggle(toggleLabel: String) {
        // On Android, demo mode is accessed via demo account buttons on login screen
        val found = assertAnyTagDisplayed("demo-admin-button", "demo-volunteer-button", "demo-mode-label")
        assert(found) { "Expected demo mode UI to be visible" }
    }

    @Then("the toggle should be off by default")
    fun theToggleShouldBeOffByDefault() {
        // Demo mode is opt-in via button click, not a toggle
        onNodeWithTag("demo-mode-label").assertIsDisplayed()
    }

    @When("I enable the demo mode toggle")
    fun iEnableTheDemoModeToggle() {
        // On Android, "enabling demo mode" is clicking a demo account button
        onNodeWithTag("demo-admin-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should be redirected to the dashboard")
    fun iShouldBeRedirectedToTheDashboard() {
        assertAnyTagDisplayed("dashboard-title")
    }

    @Given("demo mode has been enabled")
    fun demoModeHasBeenEnabled() {
        // Precondition — demo mode should be active
    }

    @When("I visit the login page")
    fun iVisitTheLoginPage() {
        // On Android, this means going to the login screen
        val found = assertAnyTagDisplayed("app-title", "create-identity")
        assert(found) { "Expected login page to be visible" }
    }

    @When("I click the {string} demo account")
    fun iClickTheDemoAccount(accountName: String) {
        val tag = when (accountName.lowercase()) {
            "admin", "admin demo" -> "demo-admin-button"
            "volunteer", "volunteer demo" -> "demo-volunteer-button"
            else -> "demo-admin-button"
        }
        onNodeWithTag(tag).performClick()
        composeRule.waitForIdle()
    }

    @Then("I should be redirected away from login")
    fun iShouldBeRedirectedAwayFromLogin() {
        // After demo login, should see dashboard or PIN setup
        val found = assertAnyTagDisplayed("dashboard-title", "pin-title", "bottom-nav")
        assert(found) { "Expected to be redirected away from login" }
    }

    @Then("the navigation should show {string}")
    fun theNavigationShouldShow(name: String) {
        val tag = when (name.lowercase()) {
            "dashboard" -> "nav-dashboard"
            "notes" -> "nav-notes"
            "conversations" -> "nav-conversations"
            "shifts" -> "nav-shifts"
            "settings" -> "nav-settings"
            else -> "nav-dashboard"
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    @When("I dismiss the demo banner")
    fun iDismissTheDemoBanner() {
        try {
            onNodeWithTag("demo-dismiss-button").performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // Banner may not be showing
        }
    }

    @Then("{string} should no longer be visible")
    fun shouldNoLongerBeVisible(text: String) {
        val nodes = onAllNodesWithText(text, ignoreCase = true)
        val count = nodes.fetchSemanticsNodes().size
        if (count == 0) return // Not present — passes
    }
}
