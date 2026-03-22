package org.llamenos.hotline.service

import android.content.Context
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.hotline.telephony.LinphoneService

@OptIn(ExperimentalCoroutinesApi::class)
class PushServiceTest {

    private val activeHubState = mockk<ActiveHubState>(relaxed = true)
    private val context = mockk<Context>(relaxed = true)
    private val testDispatcher = UnconfinedTestDispatcher()
    private val scope = TestScope(testDispatcher)
    private val linphoneService = LinphoneService(context, activeHubState, scope)

    @Test
    fun `shift reminder wake payload does NOT register call hub mapping`() = runTest(testDispatcher) {
        val router = PushNotificationRouter(linphoneService)
        router.routeWakePayload(type = "shift_reminder", hubId = "hub-001", callId = "call-001")
        assert(linphoneService.pendingCallHubIdForTesting("call-001") == null) {
            "shift_reminder must not store a pending call hub mapping"
        }
    }

    @Test
    fun `announcement wake payload does NOT register call hub mapping`() = runTest(testDispatcher) {
        val router = PushNotificationRouter(linphoneService)
        router.routeWakePayload(type = "announcement", hubId = "hub-001", callId = "call-002")
        assert(linphoneService.pendingCallHubIdForTesting("call-002") == null) {
            "announcement must not store a pending call hub mapping"
        }
    }

    @Test
    fun `incoming call wake payload stores pending call hub with correct hub`() = runTest(testDispatcher) {
        val router = PushNotificationRouter(linphoneService)
        router.routeWakePayload(type = "incoming_call", hubId = "hub-B", callId = "call-xyz")
        val stored = linphoneService.pendingCallHubIdForTesting("call-xyz")
        assert(stored == "hub-B") { "Expected hub-B but got $stored" }
    }
}
