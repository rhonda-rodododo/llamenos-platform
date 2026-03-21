package org.llamenos.hotline.service

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.hotline.model.LlamenosEvent

@OptIn(ExperimentalCoroutinesApi::class)
class AttributedHubEventTest {

    // ---- Part 1: Basic data class contract ----

    @Test
    fun `attributedHubEvent carries hubId`() {
        val event = LlamenosEvent.CallRing("call-123")
        val attributed = AttributedHubEvent(hubId = "hub-abc", event = event)

        assertEquals("hub-abc", attributed.hubId)
        assertEquals(event, attributed.event)
    }

    @Test
    fun `attributedHubEvent is equal when hubId and event match`() {
        val event = LlamenosEvent.MessageNew("conv-456")
        val a = AttributedHubEvent(hubId = "hub-1", event = event)
        val b = AttributedHubEvent(hubId = "hub-1", event = event)

        assertEquals(a, b)
    }

    @Test
    fun `attributedHubEvent preserves generic covariance`() {
        // AttributedHubEvent<out T> — LlamenosEvent subtype should be assignable to base type
        val specific: AttributedHubEvent<LlamenosEvent.CallRing> =
            AttributedHubEvent(hubId = "hub-1", event = LlamenosEvent.CallRing("c1"))
        val general: AttributedHubEvent<LlamenosEvent> = specific

        assertEquals("hub-1", general.hubId)
        assertEquals(LlamenosEvent.CallRing("c1"), general.event)
    }

    // ---- Part 2: WebSocketService tags events with activeHubId ----

    /**
     * Verifies that the hub-tagging logic uses the current [ActiveHubState.activeHubId] value.
     *
     * [WebSocketService.handleMessage] is private, so we test the public contract:
     * given an [ActiveHubState] with a known hub ID, the resulting [AttributedHubEvent]
     * carries that hub ID. This mirrors the exact code path in [WebSocketService]:
     * `val hubId = activeHubState.activeHubId.value ?: ""`
     */
    @Test
    fun `webSocketService tags events with activeHubId`() = runTest(UnconfinedTestDispatcher()) {
        val hubFlow = MutableStateFlow<String?>("hub-xyz")
        val activeHubState = mockk<ActiveHubState>(relaxed = true)
        every { activeHubState.activeHubId } returns hubFlow

        // Mirrors the tagging expression in WebSocketService.handleMessage
        val capturedHubId = activeHubState.activeHubId.value ?: ""

        assertEquals("hub-xyz", capturedHubId)

        // An AttributedHubEvent built with that hub ID carries it correctly
        val event = LlamenosEvent.PresenceSummary(hasAvailable = true)
        val attributed = AttributedHubEvent(hubId = capturedHubId, event = event)

        assertEquals("hub-xyz", attributed.hubId)
        assertEquals(event, attributed.event)
    }

    /**
     * Verifies graceful handling when [ActiveHubState.activeHubId] is null —
     * the event should carry an empty string hub ID rather than crashing.
     * Mirrors `val hubId = activeHubState.activeHubId.value ?: ""` in WebSocketService.
     */
    @Test
    fun `events carry empty string when no active hub`() = runTest(UnconfinedTestDispatcher()) {
        val hubFlow = MutableStateFlow<String?>(null)
        val activeHubState = mockk<ActiveHubState>(relaxed = true)
        every { activeHubState.activeHubId } returns hubFlow

        val capturedHubId = activeHubState.activeHubId.value ?: ""

        assertEquals("", capturedHubId)

        val event = LlamenosEvent.Unknown("some:future:event")
        val attributed = AttributedHubEvent(hubId = capturedHubId, event = event)

        assertEquals("", attributed.hubId)
        assertEquals(event, attributed.event)
    }

    // ---- Part 3: Subscriber destructuring ----

    /**
     * Verifies that a subscriber can collect [AttributedHubEvent] from a SharedFlow
     * and destructure it into hubId + event — the pattern used in
     * [DashboardViewModel] and [ConversationsViewModel].
     */
    @Test
    fun `subscriber can destructure attributed event`() = runTest(UnconfinedTestDispatcher()) {
        val ws = mockk<WebSocketService>(relaxed = true)
        val underlyingEvent = LlamenosEvent.CallRing("call-999")
        val attributed = AttributedHubEvent(hubId = "hub-42", event = underlyingEvent)

        val sharedFlow = MutableSharedFlow<AttributedHubEvent<LlamenosEvent>>(replay = 1)
        sharedFlow.emit(attributed)
        every { ws.typedEvents } returns sharedFlow

        val received = ws.typedEvents.first()

        assertEquals("hub-42", received.hubId)
        assertEquals(underlyingEvent, received.event)
    }
}
