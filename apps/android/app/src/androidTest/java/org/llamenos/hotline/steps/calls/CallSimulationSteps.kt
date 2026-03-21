package org.llamenos.hotline.steps.calls

import android.util.Log
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.llamenos.hotline.helpers.SimulationClient
import org.llamenos.hotline.helpers.SimulationClient.CallSimulationResponse
import org.llamenos.hotline.helpers.SimulationClient.MessageSimulationResponse
import org.llamenos.hotline.steps.BaseSteps
import org.llamenos.hotline.steps.ScenarioHooks

/**
 * Cucumber step definitions for simulated call and message scenarios.
 *
 * These steps use [SimulationClient] to drive the test simulation endpoints
 * in `apps/worker/routes/dev.ts`, allowing E2E tests to trigger incoming
 * calls and messages without a real telephony provider.
 *
 * State is shared within a scenario via instance fields.
 */
class CallSimulationSteps : BaseSteps() {

    companion object {
        private const val TAG = "CallSimulationSteps"
    }

    // ---- Scenario state ----

    private var lastCallResponse: CallSimulationResponse? = null
    private var lastMessageResponse: MessageSimulationResponse? = null
    private var lastCallId: String? = null
    private var lastConversationId: String? = null
    private var lastMessageId: String? = null
    private var lastStatus: String? = null

    // ─── Incoming Call Steps ────────────────────────────────────────

    @Given("an incoming call from {string}")
    fun anIncomingCallFrom(callerNumber: String) {
        Log.d(TAG, "Simulating incoming call from $callerNumber")
        val response = SimulationClient.simulateIncomingCall(
            callerNumber = callerNumber,
            hubId = ScenarioHooks.currentHubId.ifEmpty { null },
        )
        lastCallResponse = response
        lastCallId = response.callId
        lastStatus = response.status
        assertTrue(
            "Incoming call simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
        assertTrue("callId should not be blank", response.callId.isNotBlank())
        Log.d(TAG, "Incoming call created: callId=${response.callId}, status=${response.status}")
    }

    @Given("an incoming call from {string} in {string}")
    fun anIncomingCallFromInLanguage(callerNumber: String, language: String) {
        Log.d(TAG, "Simulating incoming call from $callerNumber (language=$language)")
        val response = SimulationClient.simulateIncomingCall(
            callerNumber = callerNumber,
            language = language,
            hubId = ScenarioHooks.currentHubId.ifEmpty { null },
        )
        lastCallResponse = response
        lastCallId = response.callId
        lastStatus = response.status
        assertTrue(
            "Incoming call simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
    }

    @Given("an incoming call from {string} for hub {string}")
    fun anIncomingCallFromForHub(callerNumber: String, hubId: String) {
        Log.d(TAG, "Simulating incoming call from $callerNumber (hubId=$hubId)")
        val response = SimulationClient.simulateIncomingCall(
            callerNumber = callerNumber,
            hubId = hubId,
        )
        lastCallResponse = response
        lastCallId = response.callId
        lastStatus = response.status
        assertTrue(
            "Incoming call simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
    }

    // ─── Answer Call Steps ──────────────────────────────────────────

    @When("the volunteer answers the call")
    fun theVolunteerAnswersTheCall() {
        val callId = requireNotNull(lastCallId) { "No active call — use 'Given an incoming call from ...' first" }
        // Use a test pubkey — in a full E2E flow this would come from the authenticated volunteer
        val testPubkey = "0000000000000000000000000000000000000000000000000000000000000001"
        Log.d(TAG, "Simulating answer for callId=$callId with pubkey=$testPubkey")
        val response = SimulationClient.simulateAnswerCall(callId, testPubkey)
        lastCallResponse = response
        lastStatus = response.status
        assertTrue(
            "Answer call simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
        Log.d(TAG, "Call answered: status=${response.status}")
    }

    @When("the volunteer with pubkey {string} answers the call")
    fun theVolunteerWithPubkeyAnswersTheCall(pubkey: String) {
        val callId = requireNotNull(lastCallId) { "No active call — use 'Given an incoming call from ...' first" }
        Log.d(TAG, "Simulating answer for callId=$callId with pubkey=$pubkey")
        val response = SimulationClient.simulateAnswerCall(callId, pubkey)
        lastCallResponse = response
        lastStatus = response.status
        assertTrue(
            "Answer call simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
    }

    // ─── End Call Steps ─────────────────────────────────────────────

    @When("the call is ended")
    fun theCallIsEnded() {
        val callId = requireNotNull(lastCallId) { "No active call — use 'Given an incoming call from ...' first" }
        Log.d(TAG, "Simulating end for callId=$callId")
        val response = SimulationClient.simulateEndCall(callId)
        lastCallResponse = response
        lastStatus = response.status
        assertTrue(
            "End call simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
        Log.d(TAG, "Call ended: status=${response.status}")
    }

    // ─── Voicemail Steps ────────────────────────────────────────────

    @When("the call goes to voicemail")
    fun theCallGoesToVoicemail() {
        val callId = requireNotNull(lastCallId) { "No active call — use 'Given an incoming call from ...' first" }
        Log.d(TAG, "Simulating voicemail for callId=$callId")
        val response = SimulationClient.simulateVoicemail(callId)
        lastCallResponse = response
        lastStatus = response.status
        assertTrue(
            "Voicemail simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
        Log.d(TAG, "Call sent to voicemail: status=${response.status}")
    }

    // ─── Incoming Message Steps ─────────────────────────────────────

    @Given("an incoming SMS from {string} with body {string}")
    fun anIncomingSmsFromWithBody(senderNumber: String, body: String) {
        Log.d(TAG, "Simulating incoming SMS from $senderNumber")
        val response = SimulationClient.simulateIncomingMessage(
            senderNumber = senderNumber,
            body = body,
            channel = "sms",
        )
        lastMessageResponse = response
        lastConversationId = response.conversationId
        lastMessageId = response.messageId
        assertTrue(
            "Incoming SMS simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
        Log.d(TAG, "SMS received: conversationId=${response.conversationId}, messageId=${response.messageId}")
    }

    @Given("an incoming WhatsApp message from {string} with body {string}")
    fun anIncomingWhatsAppMessageFromWithBody(senderNumber: String, body: String) {
        Log.d(TAG, "Simulating incoming WhatsApp from $senderNumber")
        val response = SimulationClient.simulateIncomingMessage(
            senderNumber = senderNumber,
            body = body,
            channel = "whatsapp",
        )
        lastMessageResponse = response
        lastConversationId = response.conversationId
        lastMessageId = response.messageId
        assertTrue(
            "Incoming WhatsApp simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
    }

    @Given("an incoming {string} message from {string} with body {string}")
    fun anIncomingMessageFromWithBody(channel: String, senderNumber: String, body: String) {
        Log.d(TAG, "Simulating incoming $channel message from $senderNumber")
        val response = SimulationClient.simulateIncomingMessage(
            senderNumber = senderNumber,
            body = body,
            channel = channel,
        )
        lastMessageResponse = response
        lastConversationId = response.conversationId
        lastMessageId = response.messageId
        assertTrue(
            "Incoming $channel message simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
    }

    // ─── Delivery Status Steps ──────────────────────────────────────

    @When("the message delivery status changes to {string}")
    fun theMessageDeliveryStatusChangesTo(status: String) {
        val conversationId = requireNotNull(lastConversationId) {
            "No active conversation — use 'Given an incoming SMS/message ...' first"
        }
        val messageId = requireNotNull(lastMessageId) {
            "No active message — use 'Given an incoming SMS/message ...' first"
        }
        Log.d(TAG, "Simulating delivery status=$status for message=$messageId in conversation=$conversationId")
        val response = SimulationClient.simulateDeliveryStatus(conversationId, messageId, status)
        lastStatus = status
        assertTrue(
            "Delivery status simulation failed: ${response.error ?: "unknown"}",
            response.ok,
        )
    }

    // ─── Assertion Steps ────────────────────────────────────────────

    @Then("the call status should be {string}")
    fun theCallStatusShouldBe(expectedStatus: String) {
        assertNotNull("No call response available", lastCallResponse)
        assertEquals(
            "Expected call status '$expectedStatus' but got '${lastStatus}'",
            expectedStatus,
            lastStatus,
        )
    }

    @Then("a call ID should be returned")
    fun aCallIdShouldBeReturned() {
        assertNotNull("No call response available", lastCallResponse)
        assertTrue(
            "callId should not be blank",
            lastCallResponse!!.callId.isNotBlank(),
        )
    }

    @Then("a conversation ID should be returned")
    fun aConversationIdShouldBeReturned() {
        assertNotNull("No message response available", lastMessageResponse)
        assertTrue(
            "conversationId should not be blank",
            lastMessageResponse!!.conversationId.isNotBlank(),
        )
    }

    @Then("a message ID should be returned")
    fun aMessageIdShouldBeReturned() {
        assertNotNull("No message response available", lastMessageResponse)
        assertTrue(
            "messageId should not be blank",
            lastMessageResponse!!.messageId.isNotBlank(),
        )
    }

    @Then("the simulation should succeed")
    fun theSimulationShouldSucceed() {
        val callOk = lastCallResponse?.ok == true
        val msgOk = lastMessageResponse?.ok == true
        assertTrue(
            "Expected at least one simulation response to be ok",
            callOk || msgOk,
        )
    }
}
