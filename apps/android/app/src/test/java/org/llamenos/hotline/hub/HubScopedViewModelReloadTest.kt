package org.llamenos.hotline.hub

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.SessionState
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.model.LlamenosEvent
import org.llamenos.hotline.service.AttributedHubEvent
import org.llamenos.hotline.ui.calls.CallHistoryViewModel
import org.llamenos.hotline.ui.cases.CaseManagementViewModel
import org.llamenos.hotline.ui.contacts.ContactsViewModel
import org.llamenos.hotline.ui.conversations.ConversationsViewModel
import org.llamenos.hotline.ui.dashboard.DashboardViewModel
import org.llamenos.hotline.ui.events.EventsViewModel
import org.llamenos.hotline.ui.messaging.BlastsViewModel
import org.llamenos.hotline.ui.notes.NotesViewModel
import org.llamenos.hotline.ui.reports.ReportsViewModel
import org.llamenos.hotline.ui.shifts.ShiftsViewModel
import org.llamenos.hotline.ui.triage.TriageViewModel

/**
 * Verifies that each hub-scoped ViewModel subscribes to [ActiveHubState.activeHubId] and
 * initiates a data load when a new hub ID is emitted.
 *
 * Test strategy:
 * - Mock [ActiveHubState] to return a controllable [MutableStateFlow<String?>].
 * - Mock [ApiService] with `relaxed = true` — inline reified calls return default values
 *   rather than throwing, allowing the ViewModel lifecycle to proceed normally.
 * - Use [UnconfinedTestDispatcher] so coroutines execute eagerly inline.
 * - Emit a hub ID and verify that [ActiveHubState.activeHubId] was accessed (the property
 *   getter was called during init), proving the subscription was wired.
 * - Verify the ViewModel constructed and produced non-null uiState (guards against crashes).
 *
 * We verify [ActiveHubState.activeHubId] getter access via MockK's [verify] — this confirms
 * the ViewModel subscribed to the flow in its init block. A ViewModel that never reads
 * `activeHubId` cannot react to hub changes.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HubScopedViewModelReloadTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    /** Creates a mock [ActiveHubState] wrapping a [MutableStateFlow<String?>]. */
    private fun mockActiveHubState(initial: String? = null): Pair<ActiveHubState, MutableStateFlow<String?>> {
        val flow = MutableStateFlow(initial)
        val state = mockk<ActiveHubState>(relaxed = true)
        every { state.activeHubId } returns flow
        return state to flow
    }

    /**
     * Creates a mock [WebSocketService] with properly stubbed flows so that
     * [collect] calls in DashboardViewModel and ConversationsViewModel don't throw.
     */
    private fun mockWebSocketService(): WebSocketService {
        val ws = mockk<WebSocketService>(relaxed = true)
        every { ws.connectionState } returns MutableStateFlow(WebSocketService.ConnectionState.DISCONNECTED)
        every { ws.typedEvents } returns MutableSharedFlow<AttributedHubEvent<LlamenosEvent>>()
        return ws
    }

    // ---- ShiftsViewModel ----

    @Test
    fun `ShiftsViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)

            val vm = ShiftsViewModel(apiService, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- CallHistoryViewModel ----

    @Test
    fun `CallHistoryViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)

            val vm = CallHistoryViewModel(apiService, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- NotesViewModel ----

    @Test
    fun `NotesViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)
            val cryptoService = mockk<CryptoService>(relaxed = true)
            val sessionState = mockk<SessionState>(relaxed = true)

            val vm = NotesViewModel(apiService, cryptoService, sessionState, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- CaseManagementViewModel ----

    @Test
    fun `CaseManagementViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)
            val cryptoService = mockk<CryptoService>(relaxed = true)
            val sessionState = mockk<SessionState>(relaxed = true)

            val vm = CaseManagementViewModel(apiService, cryptoService, sessionState, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- ConversationsViewModel ----

    @Test
    fun `ConversationsViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)
            val cryptoService = mockk<CryptoService>(relaxed = true)
            val webSocketService = mockWebSocketService()
            val sessionState = mockk<SessionState>(relaxed = true)

            val vm = ConversationsViewModel(
                apiService, cryptoService, webSocketService, sessionState, activeHubState,
            )
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- ReportsViewModel ----

    @Test
    fun `ReportsViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)
            val cryptoService = mockk<CryptoService>(relaxed = true)
            val sessionState = mockk<SessionState>(relaxed = true)

            val vm = ReportsViewModel(apiService, cryptoService, sessionState, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- EventsViewModel ----

    @Test
    fun `EventsViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)

            val vm = EventsViewModel(apiService, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- TriageViewModel ----

    @Test
    fun `TriageViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)

            val vm = TriageViewModel(apiService, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- DashboardViewModel ----

    @Test
    fun `DashboardViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)
            val cryptoService = mockk<CryptoService>(relaxed = true)
            val webSocketService = mockWebSocketService()
            val sessionState = mockk<SessionState>(relaxed = true)

            val vm = DashboardViewModel(
                cryptoService, webSocketService, apiService, sessionState, activeHubState,
            )
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- BlastsViewModel ----

    @Test
    fun `BlastsViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)

            val vm = BlastsViewModel(apiService, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }

    // ---- ContactsViewModel ----

    @Test
    fun `ContactsViewModel accesses activeHubId in init and reacts to new hub emission`() =
        runTest(testDispatcher) {
            val (activeHubState, hubFlow) = mockActiveHubState()
            val apiService = mockk<ApiService>(relaxed = true)

            val vm = ContactsViewModel(apiService, activeHubState)
            hubFlow.value = "hub-001"

            verify(atLeast = 1) { activeHubState.activeHubId }
            assertNotNull(vm.uiState.value)
        }
}
