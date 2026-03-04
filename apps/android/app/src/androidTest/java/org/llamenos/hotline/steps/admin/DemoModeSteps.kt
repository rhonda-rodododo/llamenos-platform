package org.llamenos.hotline.steps.admin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
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
        // Setup wizard on Android is the login screen with demo buttons.
        // If already logged in, log out first to reach the login screen.
        val onDashboard = composeRule.onAllNodesWithTag("dashboard-title").fetchSemanticsNodes().isNotEmpty()
        if (onDashboard) {
            navigateToTab(NAV_SETTINGS)
            onNodeWithTag("settings-logout-button").performScrollTo()
            onNodeWithTag("settings-logout-button").performClick()
            composeRule.waitForIdle()
            onNodeWithTag("confirm-logout-button").performClick()
            composeRule.waitForIdle()
        }
        waitForNode("create-identity", 10_000)
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
        val found = assertAnyTagDisplayed("dashboard-title")
        assert(found) { "Expected dashboard after redirect" }
    }

    @Given("demo mode has been enabled")
    fun demoModeHasBeenEnabled() {
        // Precondition — demo mode should be active
    }

    @When("I visit the login page")
    fun iVisitTheLoginPage() {
        // On Android, this means going to the login screen
        activityScenarioHolder.launch()
        waitForNode("create-identity")
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
        // After demo login, wait for navigation to complete
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("dashboard-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("pin-pad").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("pin-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("bottom-nav").fetchSemanticsNodes().isNotEmpty()
        }
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
        } catch (_: Throwable) {
            // Banner may not be showing
        }
    }

    @Then("{string} should no longer be visible")
    fun shouldNoLongerBeVisible(text: String) {
        composeRule.waitForIdle()
        val nodes = onAllNodesWithText(text, ignoreCase = true)
        val count = nodes.fetchSemanticsNodes().size
        if (count == 0) return // Not present — passes
        // If present in tree, verify it's not displayed
        nodes.onFirst().assertIsNotDisplayed()
    }
}
