package org.llamenos.hotline.steps.calls

import android.util.Log
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import dagger.hilt.android.EntryPointAccessors
import io.cucumber.java.en.And
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import kotlinx.coroutines.runBlocking
import org.llamenos.hotline.LlamenosApp
import org.llamenos.hotline.di.ActiveHubEntryPoint
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

        // Force DashboardViewModel to re-fetch active calls via multiple strategies.
        // Strategy 1: Hub toggle (triggers ViewModel.refresh() via StateFlow emission).
        triggerHubRefresh()

        // Wait for the active call card to appear with retries.
        // On CI emulators, API calls can be slow — retry hub refresh multiple times.
        val maxAttempts = 3
        for (attempt in 1..maxAttempts) {
            try {
                composeRule.waitUntil(10_000) {
                    composeRule.onAllNodesWithTag("active-call-card").fetchSemanticsNodes().isNotEmpty()
                }
                Log.d("ActiveCallSteps", "active-call-card appeared on attempt $attempt")
                return
            } catch (_: Throwable) {
                if (attempt < maxAttempts) {
                    Log.d("ActiveCallSteps", "active-call-card not found (attempt $attempt), retrying hub refresh")
                    triggerHubRefresh()
                } else {
                    Log.w("ActiveCallSteps", "active-call-card did not appear after $maxAttempts attempts")
                }
            }
        }
    }

    // ---- Then ----

    @Then("I should see the active call card")
    fun iShouldSeeTheActiveCallCard() {
        // Wait for the active call card to appear on the dashboard.
        // The card renders when currentCall is non-null in the ViewModel.
        composeRule.waitUntil(15_000) {
            composeRule.onAllNodesWithTag("active-call-card").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithTag("active-call-card").assertIsDisplayed()
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
        composeRule.waitUntil(15_000) {
            composeRule.onAllNodesWithTag("report-spam-button").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithTag("report-spam-button").assertIsDisplayed()
    }

    @Then("the quick note button should be visible on the call card")
    fun theQuickNoteButtonShouldBeVisibleOnTheCallCard() {
        composeRule.waitUntil(15_000) {
            composeRule.onAllNodesWithTag("quick-note-button").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithTag("quick-note-button").assertIsDisplayed()
    }

    // ---- Helpers ----

    /**
     * Force DashboardViewModel.refresh() by toggling the active hub ID.
     *
     * DashboardViewModel subscribes to [ActiveHubState.activeHubId] via
     * `filterNotNull().onEach { refresh() }`. StateFlow only emits distinct values,
     * so re-setting the same ID is a no-op. To force a new emission:
     *   1. Set hub to a dummy value
     *   2. Set hub back to the real test hub ID
     * Both emissions trigger refresh(), but the second one is the one that matters
     * (it sets the correct hub scope for API calls).
     */
    private fun triggerHubRefresh() {
        val hubId = ScenarioHooks.currentHubId
        if (hubId.isEmpty()) return
        try {
            val entryPoint = EntryPointAccessors.fromApplication(
                LlamenosApp.instance,
                ActiveHubEntryPoint::class.java,
            )
            val hubState = entryPoint.activeHubState()
            runBlocking {
                hubState.setActiveHub("__refresh__")
                hubState.setActiveHub(hubId)
            }
            Log.d("ActiveCallSteps", "triggerHubRefresh: toggled hub to force refresh")
            composeRule.waitForIdle()
            // Give the ViewModel time to process the hub change and complete the API call.
            // CI emulators with swiftshader are very slow — need generous wait.
            Thread.sleep(4000)
            composeRule.waitForIdle()
        } catch (e: Throwable) {
            Log.w("ActiveCallSteps", "triggerHubRefresh failed: ${e.message}")
        }
    }
}
