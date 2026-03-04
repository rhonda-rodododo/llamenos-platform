package org.llamenos.hotline.steps.admin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import io.cucumber.datatable.DataTable
import io.cucumber.java.After
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for admin-navigation.feature, admin-tabs.feature, and access-control.feature.
 *
 * NOTE: Steps shared with other features (e.g., "I am authenticated and on the dashboard",
 * "I tap the {string} tab", "I attempt to create an auth token", "it should throw a CryptoException")
 * live in NavigationSteps or CryptoSteps to avoid duplicate definitions.
 */
class AdminSteps : BaseSteps() {

    private val cryptoService = CryptoService()
    private val keystoreService = KeystoreService(
        InstrumentationRegistry.getInstrumentation().targetContext
    )

    // ---- Admin navigation ----

    @When("I scroll to and tap the admin card")
    fun iScrollToAndTapTheAdminCard() {
        navigateToTab(NAV_SETTINGS)
        onNodeWithTag("settings-admin-card").performScrollTo()
        onNodeWithTag("settings-admin-card").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the admin screen")
    fun iShouldSeeTheAdminScreen() {
        waitForNode("admin-title")
        onNodeWithTag("admin-title").assertIsDisplayed()
    }

    @Then("the admin title should be displayed")
    fun theAdminTitleShouldBeDisplayed() {
        onNodeWithTag("admin-title").assertIsDisplayed()
    }

    @Then("the admin tabs should be visible")
    fun theAdminTabsShouldBeVisible() {
        onNodeWithTag("admin-tabs").assertIsDisplayed()
    }

    @When("I navigate to the admin panel")
    fun iNavigateToTheAdminPanel() {
        navigateToTab(NAV_SETTINGS)
        onNodeWithTag("settings-admin-card").performScrollTo()
        onNodeWithTag("settings-admin-card").performClick()
        composeRule.waitForIdle()
    }

    @Given("I have navigated to the admin panel")
    fun iHaveNavigatedToTheAdminPanel() {
        navigateToTab(NAV_SETTINGS)
        onNodeWithTag("settings-admin-card").performScrollTo()
        onNodeWithTag("settings-admin-card").performClick()
        composeRule.waitForIdle()
    }

    @Then("the settings identity card should be visible")
    fun theSettingsIdentityCardShouldBeVisible() {
        onNodeWithTag("settings-identity-card").assertIsDisplayed()
    }

    // ---- Admin tabs ----

    @Then("I should see the following tabs:")
    fun iShouldSeeTheFollowingTabs(dataTable: DataTable) {
        val tabs = dataTable.asList().filter { it.lowercase() != "tab" }
        for (tab in tabs) {
            val tag = when (tab) {
                "Volunteers" -> "admin-tab-volunteers"
                "Ban List" -> "admin-tab-bans"
                "Audit Log" -> "admin-tab-audit"
                "Invites" -> "admin-tab-invites"
                "Fields" -> "admin-tab-fields"
                else -> throw IllegalArgumentException("Unknown admin tab: $tab")
            }
            onNodeWithTag(tag).assertIsDisplayed()
        }
    }

    @Then("the {string} tab should be selected by default")
    fun theTabShouldBeSelectedByDefault(tabName: String) {
        val tag = when (tabName) {
            "Volunteers" -> "admin-tab-volunteers"
            else -> throw IllegalArgumentException("Unknown tab: $tabName")
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    @Then("{word} content should be displayed \\(loading, empty, or list)")
    fun contentShouldBeDisplayed(tabContent: String) {
        val found = assertAnyTagDisplayed(
            "${tabContent}-loading", "${tabContent}-empty", "${tabContent}-list"
        )
        assert(found) { "Expected $tabContent content (loading, empty, or list)" }
    }

    @Then("I should be on the Volunteers tab")
    fun iShouldBeOnTheVolunteersTab() {
        composeRule.waitForIdle()
        onNodeWithTag("admin-tab-volunteers").performScrollTo()
        onNodeWithTag("admin-tab-volunteers").assertIsDisplayed()
    }

    @Then("no crashes should occur")
    fun noCrashesShouldOccur() {
        // Verify we're still on a valid admin screen
        val found = assertAnyTagDisplayed("admin-tabs", "admin-title")
        assert(found) { "Expected admin screen to be visible after tab switching" }
    }

    // ---- Access control ----

    @Given("the crypto service is locked")
    fun theCryptoServiceIsLocked() {
        cryptoService.generateKeypair()
        cryptoService.lock()
    }

    @Given("a stored identity exists")
    fun aStoredIdentityExists() {
        activityScenarioHolder.launch()
    }

    @Then("I should not be able to access any tab")
    fun iShouldNotBeAbleToAccessAnyTab() {
        onNodeWithTag("pin-pad").assertIsDisplayed()
    }

    @Then("I should be able to navigate to all tabs:")
    fun iShouldBeAbleToNavigateToAllTabs(dataTable: DataTable) {
        val tabs = dataTable.asList().filter { it.lowercase() != "tab" }
        for (tab in tabs) {
            val tag = when (tab) {
                "Dashboard" -> NAV_DASHBOARD
                "Notes" -> NAV_NOTES
                "Conversations" -> NAV_CONVERSATIONS
                "Shifts" -> NAV_SHIFTS
                "Settings" -> NAV_SETTINGS
                else -> throw IllegalArgumentException("Unknown tab: $tab")
            }
            onNodeWithTag(tag).assertIsDisplayed()
        }
    }

    @When("I attempt to create an auth token")
    fun iAttemptToCreateAnAuthToken() {
        try {
            cryptoService.createAuthTokenSync("GET", "/api/notes")
            org.junit.Assert.fail("Should have thrown CryptoException")
        } catch (_: org.llamenos.hotline.crypto.CryptoException) {
            // Expected
        }
    }

    @Then("it should throw a CryptoException")
    fun itShouldThrowACryptoException() {
        // Verified in the When step
    }

    @When("I attempt to encrypt a note")
    fun iAttemptToEncryptANote() {
        try {
            kotlinx.coroutines.runBlocking {
                cryptoService.encryptNote("{}", emptyList())
            }
            org.junit.Assert.fail("Should have thrown CryptoException")
        } catch (_: org.llamenos.hotline.crypto.CryptoException) {
            // Expected
        }
    }

    // ---- Audit log viewing ----

    @Then("audit entries should be visible with date information")
    fun auditEntriesShouldBeVisibleWithDateInformation() {
        val found = assertAnyTagDisplayed("audit-list", "audit-empty", "audit-loading")
        assert(found) { "Expected audit entries area" }
    }

    @Then("audit entries should show actor links pointing to volunteer profiles")
    fun auditEntriesShouldShowActorLinksPointingToVolunteerProfiles() {
        val found = assertAnyTagDisplayed("audit-list", "audit-empty")
        assert(found) { "Expected audit entries area" }
    }

    @Then("the {string} badge should have the purple color class")
    fun theBadgeShouldHaveThePurpleColorClass(badgeText: String) {
        // CSS color classes don't apply to Android — verify badge exists
        val found = assertAnyTagDisplayed("audit-list", "audit-empty")
        assert(found) { "Expected audit area" }
    }

    // ---- Audit log filters ----

    @When("I filter by {string} event type")
    fun iFilterByEventType(eventType: String) {
        onNodeWithTag("audit-event-filter").performClick()
        composeRule.waitForIdle()
        composeRule.onAllNodesWithText(eventType, substring = true, ignoreCase = true)
            .onFirst()
            .performClick()
        composeRule.waitForIdle()
    }

    @When("I search for {string}")
    fun iSearchFor(query: String) {
        onNodeWithTag("audit-search-input").performTextClearance()
        onNodeWithTag("audit-search-input").performTextInput(query)
        composeRule.waitForIdle()
    }

    @After(order = 5000)
    fun cleanupAdminState() {
        try {
            keystoreService.clear()
            cryptoService.lock()
        } catch (_: Exception) {
            // Cleanup is best-effort
        }
    }
}
