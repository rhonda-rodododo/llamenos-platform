package org.llamenos.hotline.steps.hubs

import android.util.Log
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.filter
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onChildren
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import dagger.hilt.android.EntryPointAccessors
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.LlamenosApp
import org.llamenos.hotline.di.CryptoEntryPoint
import org.llamenos.hotline.helpers.SimulationClient
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for hub-switch.feature scenarios.
 *
 * Covers: second hub creation, hub switching via tap, active indicator
 * updates, and hub-scoped data reload (notes screen).
 *
 * ScenarioHooks @Before(order = 1) already creates one hub and sets
 * [ScenarioHooks.currentHubId]. This class creates a second hub so the
 * hub list contains two entries to switch between.
 */
class HubSwitchSteps : BaseSteps() {

    // ---- Given ----

    @Given("the app is launched with two test hubs")
    fun launchWithTwoHubs() {
        // ScenarioHooks @Before(order = 1) already created the first hub.
        // Create a second hub so the list has two entries.
        val hub2 = SimulationClient.createTestHub("android-test-hub-2-${System.currentTimeMillis()}")
        check(hub2.id.isNotEmpty()) {
            "Failed to create second test hub: ${hub2.error}"
        }
        Log.d("HubSwitchSteps", "Created second hub: ${hub2.id}")

        // Launch the app (creates identity and navigates to dashboard).
        navigateToMainScreen()

        // Promote the test user to super-admin so GET /api/hubs returns ALL hubs
        // (non-super-admin users only see hubs they are members of, and
        // test-create-hub doesn't add members).
        val entryPoint = EntryPointAccessors.fromApplication(
            LlamenosApp.instance,
            CryptoEntryPoint::class.java,
        )
        val signingPubkey = entryPoint.cryptoService().signingPubkeyHex
        check(signingPubkey != null) {
            "No signing pubkey available — identity creation may have failed"
        }

        // Promote to global super-admin so GET /api/hubs returns ALL hubs in the list.
        val promoteResult = SimulationClient.promoteToAdmin(signingPubkey)
        Log.d("HubSwitchSteps", "Promoted to admin: ok=${promoteResult.ok}, error=${promoteResult.error}")
        check(promoteResult.ok || promoteResult.error == null) {
            "Admin promotion failed: ${promoteResult.error}"
        }

        // Add the test user as a member of hub2 so HubRepository.switchHub() can
        // call getHubKey(hub2.id) without a permission error. Global super-admin role
        // alone is not sufficient — hub key distribution requires hub membership.
        val memberResult = SimulationClient.addHubMember(signingPubkey, hub2.id)
        Log.d("HubSwitchSteps", "Added as hub2 member: ok=${memberResult.ok}, error=${memberResult.error}")
        check(memberResult.ok || memberResult.error == null) {
            "Adding hub2 member failed: ${memberResult.error}"
        }
    }

    @Given("I am on the hub management screen")
    fun navigateToHubManagement() {
        // Hub list is accessed via the "hubs-card" quick action on the Dashboard
        navigateViaDashboardCard("hubs-card")

        // Wait for the hub list screen to load. Include "hubs-title" (TopAppBar)
        // as it's always rendered immediately after navigation completes.
        composeRule.waitUntil(20_000) {
            composeRule.onAllNodesWithTag("hubs-title").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("hubs-list").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("hubs-loading").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("hubs-empty").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("hubs-error").fetchSemanticsNodes().isNotEmpty()
        }
    }

    // ---- When ----

    @When("I tap the second hub in the list")
    fun tapSecondHub() {
        // Wait for at least two hub-row nodes to appear
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("hub-row").fetchSemanticsNodes().size >= 2
        }
        composeRule.onAllNodesWithTag("hub-row")[1].performClick()
        composeRule.waitForIdle()
    }

    @And("I navigate to the notes screen")
    fun navigateToNotes() {
        navigateToTab(NAV_NOTES)
        composeRule.waitForIdle()
    }

    // ---- Then / And ----

    @Then("the second hub shows the active indicator")
    fun secondHubShowsActiveIndicator() {
        // Wait for the active indicator to appear on the second hub-row.
        // Hub switching persists via DataStore which is async — give it time.
        composeRule.waitUntil(15_000) {
            val hubRows = composeRule.onAllNodesWithTag("hub-row").fetchSemanticsNodes()
            if (hubRows.size < 2) return@waitUntil false
            composeRule.onAllNodesWithTag("hub-row")[1]
                .onChildren()
                .filter(hasTestTag("hub-active-indicator"))
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onAllNodesWithTag("hub-row")[1]
            .onChildren()
            .filter(hasTestTag("hub-active-indicator"))
            .also { it[0].assertIsDisplayed() }
    }

    @And("the first hub no longer shows the active indicator")
    fun firstHubNoLongerShowsActiveIndicator() {
        val indicatorNodes = composeRule.onAllNodesWithTag("hub-row")[0]
            .onChildren()
            .filter(hasTestTag("hub-active-indicator"))
            .fetchSemanticsNodes()
        check(indicatorNodes.isEmpty()) {
            "Expected no hub-active-indicator on first hub-row after switching, but found ${indicatorNodes.size}"
        }
    }

    @Then("the notes screen loads without error")
    fun notesScreenLoadsWithoutError() {
        // Give the hub state time to propagate to all subscribers
        Thread.sleep(1_000)
        composeRule.waitUntil(15_000) {
            composeRule.onAllNodesWithTag("notes-list").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("notes-empty").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("empty-state").fetchSemanticsNodes().isNotEmpty()
        }
        // Assert no error banner is present
        val errorNodes = composeRule.onAllNodesWithTag("notes-error").fetchSemanticsNodes() +
            composeRule.onAllNodesWithTag("error-message").fetchSemanticsNodes()
        check(errorNodes.isEmpty()) {
            "Notes screen showed an error after hub switch (${errorNodes.size} error node(s) found)"
        }
    }
}
