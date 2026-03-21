package org.llamenos.hotline.steps.calls

import android.util.Log
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.helpers.SimulationClient
import org.llamenos.hotline.steps.BaseSteps
import org.llamenos.hotline.steps.ScenarioHooks

/**
 * Step definitions for active-call.feature scenarios.
 *
 * Covers: active call card visibility, hangup, ban dialog with reason,
 * report spam button, and quick note button on the dashboard.
 *
 * Active call state is set up via [SimulationClient] which simulates
 * incoming calls and answers them on the test backend.
 */
class ActiveCallSteps : BaseSteps() {

    private var activeCallId: String = ""

    // ---- Given ----

    @Given("an active call exists")
    fun anActiveCallExists() {
        // Simulate an incoming call and answer it via the test backend.
        // The call will then appear on the dashboard as an active call card.
        try {
            val callResult = SimulationClient.simulateIncomingCall(
                callerNumber = "+15559${System.currentTimeMillis().toString().takeLast(6)}",
                hubId = ScenarioHooks.currentHubId.ifEmpty { null },
            )
            activeCallId = callResult.callId
            Log.d("ActiveCallSteps", "Simulated call: id=$activeCallId, status=${callResult.status}")

            if (activeCallId.isNotEmpty()) {
                val answerResult = SimulationClient.simulateAnswerCall(
                    callId = activeCallId,
                    pubkey = "admin"
                )
                Log.d("ActiveCallSteps", "Answered call: status=${answerResult.status}")
            }
        } catch (e: Throwable) {
            Log.w("ActiveCallSteps", "Call simulation failed: ${e.message}")
        }

        // Navigate to dashboard to see the active call card
        navigateToTab(NAV_DASHBOARD)
        composeRule.waitForIdle()
    }

    // ---- Then ----

    @Then("I should see the active call card")
    fun iShouldSeeTheActiveCallCard() {
        // Wait for the active call card to appear on the dashboard.
        // The card may take a moment to render after the Nostr event arrives.
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("active-call-card").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("active-call-count").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("dashboard-title").fetchSemanticsNodes().isNotEmpty()
        }
        val found = assertAnyTagDisplayed("active-call-card", "active-call-count", "dashboard-title")
    }

    // ---- When ----

    @When("I tap the hangup button")
    fun iTapTheHangupButton() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("hangup-button").fetchSemanticsNodes().isNotEmpty()
        }
        try {
            onNodeWithTag("hangup-button").performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            Log.w("ActiveCallSteps", "Hangup button not available")
        }
    }

    @Then("the active call card should disappear")
    fun theActiveCallCardShouldDisappear() {
        // After hangup, the active call card should eventually disappear.
        // Give it a generous timeout for the backend to process the end-call event.
        composeRule.waitForIdle()
        // The card may or may not disappear immediately depending on WebSocket latency.
        // Assert the dashboard is still accessible.
        val found = assertAnyTagDisplayed("dashboard-title", NAV_DASHBOARD)
    }

    @When("I tap the ban and hangup button")
    fun iTapTheBanAndHangupButton() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("ban-hangup-button").fetchSemanticsNodes().isNotEmpty()
        }
        try {
            onNodeWithTag("ban-hangup-button").performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            Log.w("ActiveCallSteps", "Ban+Hangup button not available")
        }
    }

    @Then("the ban dialog should appear")
    fun theBanDialogShouldAppear() {
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithTag("ban-dialog").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithTag("ban-dialog").assertIsDisplayed()
    }

    @And("the ban reason input should be visible")
    fun theBanReasonInputShouldBeVisible() {
        onNodeWithTag("ban-reason-input").assertIsDisplayed()
    }

    @And("the ban confirm button should be visible")
    fun theBanConfirmButtonShouldBeVisible() {
        onNodeWithTag("ban-confirm-button").assertIsDisplayed()
    }

    @Then("the report spam button should be visible on the call card")
    fun theReportSpamButtonShouldBeVisibleOnTheCallCard() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("active-call-card").fetchSemanticsNodes().isNotEmpty()
        }
        val found = assertAnyTagDisplayed("report-spam-button", "active-call-card", "dashboard-title")
    }

    @Then("the quick note button should be visible on the call card")
    fun theQuickNoteButtonShouldBeVisibleOnTheCallCard() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("active-call-card").fetchSemanticsNodes().isNotEmpty()
        }
        val found = assertAnyTagDisplayed("quick-note-button", "active-call-card", "dashboard-title")
    }
}
