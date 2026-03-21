package org.llamenos.hotline.hub

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.llamenos.hotline.model.LlamenosEvent
import org.llamenos.hotline.service.AttributedHubEvent

class HubActivityServiceTest {

    private val svc = HubActivityService()

    private fun attributed(hubId: String, event: LlamenosEvent) =
        AttributedHubEvent(hubId, event)

    @Test
    fun `call ring increments activeCallCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        assertEquals(1, svc.state("hub-001").activeCallCount)
    }

    @Test
    fun `call answered decrements activeCallCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.CallAnswered("call-1", "volunteer-1")))
        assertEquals(0, svc.state("hub-001").activeCallCount)
    }

    @Test
    fun `call ended decrements activeCallCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.CallEnded("call-1")))
        assertEquals(0, svc.state("hub-001").activeCallCount)
    }

    @Test
    fun `voicemail new decrements activeCallCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.VoicemailNew("call-1")))
        assertEquals(0, svc.state("hub-001").activeCallCount)
    }

    @Test
    fun `activeCallCount never goes negative`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallEnded("call-1")))
        assertEquals(0, svc.state("hub-001").activeCallCount)
    }

    @Test
    fun `shift started sets isOnShift`() {
        svc.handle(attributed("hub-001", LlamenosEvent.ShiftUpdate("shift-1", "started")))
        assertTrue(svc.state("hub-001").isOnShift)
    }

    @Test
    fun `shift ended clears isOnShift`() {
        svc.handle(attributed("hub-001", LlamenosEvent.ShiftUpdate("shift-1", "started")))
        svc.handle(attributed("hub-001", LlamenosEvent.ShiftUpdate("shift-1", "ended")))
        assertFalse(svc.state("hub-001").isOnShift)
    }

    @Test
    fun `unknown shift status leaves isOnShift unchanged`() {
        svc.handle(attributed("hub-001", LlamenosEvent.ShiftUpdate("shift-1", "paused")))
        assertFalse(svc.state("hub-001").isOnShift)
    }

    @Test
    fun `message new increments unreadMessageCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.MessageNew("conv-1")))
        assertEquals(1, svc.state("hub-001").unreadMessageCount)
    }

    @Test
    fun `conversation assigned increments unreadConversationCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.ConversationAssigned("conv-1", null)))
        assertEquals(1, svc.state("hub-001").unreadConversationCount)
    }

    @Test
    fun `conversation closed decrements unreadConversationCount`() {
        svc.handle(attributed("hub-001", LlamenosEvent.ConversationAssigned("conv-1", null)))
        svc.handle(attributed("hub-001", LlamenosEvent.ConversationClosed("conv-1")))
        assertEquals(0, svc.state("hub-001").unreadConversationCount)
    }

    @Test
    fun `unreadConversationCount never goes negative`() {
        svc.handle(attributed("hub-001", LlamenosEvent.ConversationClosed("conv-1")))
        assertEquals(0, svc.state("hub-001").unreadConversationCount)
    }

    @Test
    fun `markHubOpened clears unread counts`() {
        svc.handle(attributed("hub-001", LlamenosEvent.MessageNew("conv-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.ConversationAssigned("conv-1", null)))
        svc.markHubOpened("hub-001")
        assertEquals(0, svc.state("hub-001").unreadMessageCount)
        assertEquals(0, svc.state("hub-001").unreadConversationCount)
    }

    @Test
    fun `markHubOpened does not affect activeCallCount or isOnShift`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.ShiftUpdate("shift-1", "started")))
        svc.markHubOpened("hub-001")
        assertEquals(1, svc.state("hub-001").activeCallCount)
        assertTrue(svc.state("hub-001").isOnShift)
    }

    @Test
    fun `states for different hubs are isolated`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        assertEquals(1, svc.state("hub-001").activeCallCount)
        assertEquals(0, svc.state("hub-002").activeCallCount)
    }

    @Test
    fun `multiple rings accumulate correctly`() {
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-2")))
        svc.handle(attributed("hub-001", LlamenosEvent.CallRing("call-3")))
        assertEquals(3, svc.state("hub-001").activeCallCount)
    }

    @Test
    fun `irrelevant events leave state unchanged`() {
        val before = svc.state("hub-001")
        svc.handle(attributed("hub-001", LlamenosEvent.PresenceSummary(true)))
        svc.handle(attributed("hub-001", LlamenosEvent.NoteCreated("note-1")))
        svc.handle(attributed("hub-001", LlamenosEvent.Unknown("some:future:event")))
        assertEquals(before, svc.state("hub-001"))
    }
}
