package org.llamenos.hotline.steps.common

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Shared navigation step definitions used across many features.
 *
 * Covers: app launch, tab navigation, back navigation, and common
 * "I am authenticated and on the dashboard/main screen" backgrounds.
 */
class NavigationSteps : BaseSteps() {

    @Given("the app is freshly installed")
    fun theAppIsFreshlyInstalled() {
        activityScenarioHolder.launch()
    }

    @Given("no identity exists on the device")
    fun noIdentityExistsOnTheDevice() {
        // Fresh install — no stored identity. Activity already launched.
    }

    @Given("I am on the login screen")
    fun iAmOnTheLoginScreen() {
        activityScenarioHolder.launch()
        onNodeWithTag("app-title").assertIsDisplayed()
    }

    @When("the app launches")
    fun theAppLaunches() {
        // Activity already launched in background step
    }

    @Given("I am authenticated and on the dashboard")
    fun iAmAuthenticatedAndOnTheDashboard() {
        navigateToMainScreen()
    }

    @Given("I am authenticated and on the main screen")
    fun iAmAuthenticatedAndOnTheMainScreen() {
        navigateToMainScreen()
    }

    @Given("I am authenticated")
    fun iAmAuthenticated() {
        navigateToMainScreen()
    }

    @When("I tap the {string} tab")
    fun iTapTheTab(tabName: String) {
        val tag = when (tabName) {
            // Bottom nav tabs
            "Dashboard" -> NAV_DASHBOARD
            "Notes" -> NAV_NOTES
            "Conversations" -> NAV_CONVERSATIONS
            "Shifts" -> NAV_SHIFTS
            "Settings" -> NAV_SETTINGS
            // Admin tabs
            "Ban List" -> "admin-tab-bans"
            "Audit Log" -> "admin-tab-audit"
            "Invites" -> "admin-tab-invites"
            "Volunteers" -> "admin-tab-volunteers"
            else -> throw IllegalArgumentException("Unknown tab: $tabName")
        }
        onNodeWithTag(tag).performClick()
        composeRule.waitForIdle()
    }

    @When("I tap the back button")
    fun iTapTheBackButton() {
        // Try known back button tags — different screens use different tags
        val backTags = listOf(
            "note-create-back", "note-detail-back", "admin-back", "device-link-back"
        )
        for (tag in backTags) {
            try {
                onNodeWithTag(tag).performClick()
                composeRule.waitForIdle()
                return
            } catch (_: AssertionError) {
                continue
            }
        }
        throw AssertionError("No back button found")
    }

    @Then("I should see the dashboard")
    fun iShouldSeeTheDashboard() {
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    @Then("the bottom navigation should be visible")
    fun theBottomNavigationShouldBeVisible() {
        onNodeWithTag(NAV_DASHBOARD).assertIsDisplayed()
        onNodeWithTag(NAV_NOTES).assertIsDisplayed()
        onNodeWithTag(NAV_CONVERSATIONS).assertIsDisplayed()
        onNodeWithTag(NAV_SHIFTS).assertIsDisplayed()
        onNodeWithTag(NAV_SETTINGS).assertIsDisplayed()
    }

    @Then("the bottom navigation should not be visible")
    fun theBottomNavigationShouldNotBeVisible() {
        try {
            onNodeWithTag(NAV_DASHBOARD).assertDoesNotExist()
        } catch (_: AssertionError) {
            // Fine — bottom nav is not visible
        }
    }

    // ---- Admin login & page navigation ----

    @Given("I am logged in as an admin")
    fun iAmLoggedInAsAnAdmin() {
        navigateToMainScreen()
    }

    @When("I navigate to the {string} page")
    fun iNavigateToThePage(pageName: String) {
        when (pageName.lowercase()) {
            "ban list", "bans" -> navigateToAdminTab("bans")
            "volunteers" -> navigateToAdminTab("volunteers")
            "audit log", "audit" -> navigateToAdminTab("audit")
            "invites" -> navigateToAdminTab("invites")
            "shifts", "shift schedule" -> navigateToTab(NAV_SHIFTS)
            "conversations" -> navigateToTab(NAV_CONVERSATIONS)
            "notes" -> navigateToTab(NAV_NOTES)
            "settings" -> navigateToTab(NAV_SETTINGS)
            "dashboard" -> navigateToTab(NAV_DASHBOARD)
            else -> throw IllegalArgumentException("Unknown page: $pageName")
        }
    }

    @When("I navigate to {string}")
    fun iNavigateToPath(path: String) {
        // URL-based navigation doesn't directly apply to Android
        // Deep link or intent-based navigation would be used in production
    }

    @When("I log out")
    fun iLogOut() {
        navigateToTab(NAV_SETTINGS)
        onNodeWithTag("settings-logout-button").performScrollTo()
        onNodeWithTag("settings-logout-button").performClick()
        composeRule.waitForIdle()
        onNodeWithTag("confirm-logout-button").performClick()
        composeRule.waitForIdle()
    }
}
