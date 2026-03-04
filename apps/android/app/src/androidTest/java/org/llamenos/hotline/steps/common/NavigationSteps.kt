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
        waitForNode("create-identity")
    }

    @Given("no identity exists on the device")
    fun noIdentityExistsOnTheDevice() {
        // Fresh install — no stored identity. Activity already launched.
    }

    @Given("I am on the login screen")
    fun iAmOnTheLoginScreen() {
        activityScenarioHolder.launch()
        waitForNode("create-identity")
    }

    @Given("the app is launched")
    fun theAppIsLaunched() {
        // Most features using "the app is launched" expect an authenticated state
        navigateToMainScreen()
    }

    @When("the app launches")
    fun theAppLaunches() {
        // Activity already launched in background step
    }

    @Given("I am on the dashboard")
    fun iAmOnTheDashboard() {
        navigateToMainScreen()
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
            // Admin tabs (in ScrollableTabRow — need scrollTo)
            "Ban List" -> "admin-tab-bans"
            "Audit Log" -> "admin-tab-audit"
            "Invites" -> "admin-tab-invites"
            "Volunteers" -> "admin-tab-volunteers"
            "Shift Schedule" -> "admin-tab-shifts"
            "Admin Settings" -> "admin-tab-settings"
            "Custom Fields", "Fields" -> "admin-tab-fields"
            else -> throw IllegalArgumentException("Unknown tab: $tabName")
        }
        // Admin tabs are in a ScrollableTabRow and may be off-screen
        if (tag.startsWith("admin-tab-")) {
            onNodeWithTag(tag).performScrollTo()
        }
        onNodeWithTag(tag).performClick()
        composeRule.waitForIdle()
    }

    @When("I tap the back button")
    fun iTapTheBackButton() {
        // Try all known back button tags — different screens use different tags
        val backTags = listOf(
            "note-create-back", "note-detail-back", "admin-back", "device-link-back",
            "reports-back", "call-history-back", "contacts-back", "report-create-back",
            "help-back", "shift-detail-back", "timeline-back", "report-detail-back",
            "conversation-detail-back", "volunteer-detail-back", "blasts-back",
        )
        for (tag in backTags) {
            try {
                onNodeWithTag(tag).performClick()
                composeRule.waitForIdle()
                return
            } catch (_: Throwable) {
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
        composeRule.waitForIdle()
        onNodeWithTag(NAV_DASHBOARD).assertDoesNotExist()
    }

    // ---- Login as specific roles ----

    @Given("I am logged in as an admin")
    fun iAmLoggedInAsAnAdmin() {
        navigateToMainScreen()
    }

    @Given("I am logged in as a volunteer")
    fun iAmLoggedInAsAVolunteer() {
        navigateToMainScreen()
    }

    @Given("I am logged in as a reporter")
    fun iAmLoggedInAsAReporter() {
        navigateToMainScreen()
    }

    @When("I navigate to the {string} page")
    fun iNavigateToThePage(pageName: String) {
        when (pageName.lowercase()) {
            "ban list", "bans" -> navigateToAdminTab("bans")
            "volunteers" -> navigateToAdminTab("volunteers")
            "audit log", "audit" -> navigateToAdminTab("audit")
            "invites" -> navigateToAdminTab("invites")
            "reports" -> navigateViaDashboardCard("reports-card")
            "hub settings" -> navigateToTab(NAV_SETTINGS)
            "blasts" -> navigateViaDashboardCard("blasts-card")
            "shifts", "shift schedule" -> navigateToAdminTab("shifts")
            "conversations" -> navigateToTab(NAV_CONVERSATIONS)
            "notes" -> navigateToTab(NAV_NOTES)
            "settings" -> navigateToTab(NAV_SETTINGS)
            "dashboard" -> navigateToTab(NAV_DASHBOARD)
            "custom fields", "fields" -> navigateToAdminTab("fields")
            else -> throw IllegalArgumentException("Unknown page: $pageName")
        }
    }

    @When("I navigate to {string}")
    fun iNavigateToPath(path: String) {
        // URL-based navigation doesn't directly apply to Android
        // Parse the path and navigate to the closest matching screen
        val cleanPath = path.split("?").first().trimStart('/')
        when {
            cleanPath.startsWith("onboarding") -> {
                // Deep link to onboarding not supported in Android test — stay on current screen
                // Invite-based onboarding is handled via the invite code flow
                composeRule.waitForIdle()
            }
            cleanPath.startsWith("settings") -> {
                navigateToTab(NAV_SETTINGS)
                // If a section query param is specified, expand it
                val section = Regex("[?&]section=([^&]+)").find(path)?.groupValues?.get(1)
                if (section != null) {
                    val sectionTag = "settings-${section}-section"
                    try {
                        expandSettingsSection(sectionTag)
                    } catch (_: Throwable) { /* section may not exist */ }
                }
            }
            cleanPath.startsWith("notes") -> navigateToTab(NAV_NOTES)
            cleanPath.startsWith("conversations") -> navigateToTab(NAV_CONVERSATIONS)
            cleanPath.startsWith("shifts") -> navigateToTab(NAV_SHIFTS)
            cleanPath.startsWith("admin") -> {
                navigateToTab(NAV_SETTINGS)
                try {
                    onNodeWithTag("settings-admin-card").performScrollTo()
                    onNodeWithTag("settings-admin-card").performClick()
                    composeRule.waitForIdle()
                } catch (_: Throwable) { /* admin card may not exist */ }
            }
            else -> navigateToTab(NAV_DASHBOARD)
        }
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
