package org.llamenos.hotline.api

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeyValueStore
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.hotline.hub.HubActivityService
import org.llamenos.hotline.model.LlamenosEvent
import org.llamenos.hotline.service.AttributedHubEvent
import org.llamenos.protocol.CryptoLabels
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Nostr relay WebSocket connection for real-time event delivery.
 *
 * Connects to the hub's Nostr relay and subscribes to encrypted events
 * tagged with `["t", "llamenos:event"]`. All event content is encrypted
 * with the hub key — the relay cannot distinguish event types.
 *
 * Implements automatic reconnection with exponential backoff.
 */
@Singleton
class WebSocketService @Inject constructor(
    private val cryptoService: CryptoService,
    private val keystoreService: KeyValueStore,
    private val activeHubState: ActiveHubState,
    private val hubActivityService: HubActivityService,
) {

    @Serializable
    data class NostrEvent(
        val id: String = "",
        val pubkey: String = "",
        val created_at: Long = 0,
        val kind: Int = 0,
        val tags: List<List<String>> = emptyList(),
        val content: String = "",
        val sig: String = "",
    )

    enum class ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        RECONNECTING,
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }

    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _events = MutableSharedFlow<NostrEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<NostrEvent> = _events.asSharedFlow()

    private val _typedEvents = MutableSharedFlow<AttributedHubEvent<LlamenosEvent>>(extraBufferCapacity = 64)

    /**
     * Typed application events parsed from Nostr relay messages.
     *
     * Each event is wrapped in [AttributedHubEvent] carrying the [ActiveHubState.activeHubId]
     * that was current at the moment the event was received. Subscribers should use
     * [AttributedHubEvent.hubId] to route or discard events from non-active hubs.
     */
    val typedEvents: SharedFlow<AttributedHubEvent<LlamenosEvent>> = _typedEvents.asSharedFlow()

    /** Server event encryption key, set after authentication via GET /api/auth/me. */
    var serverEventKeyHex: String? = null

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // No read timeout for WebSocket
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    /**
     * Connect to the Nostr relay at the hub's WebSocket endpoint.
     * Automatically subscribes to llamenos events after connection.
     */
    fun connect() {
        if (_connectionState.value == ConnectionState.CONNECTED ||
            _connectionState.value == ConnectionState.CONNECTING
        ) {
            return
        }

        val hubUrl = keystoreService.retrieve(KeystoreService.KEY_HUB_URL) ?: return
        val relayUrl = hubUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/') + "/relay"

        _connectionState.value = ConnectionState.CONNECTING

        val request = Request.Builder()
            .url(relayUrl)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connectionState.value = ConnectionState.CONNECTED
                reconnectAttempt = 0
                subscribe(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                _connectionState.value = ConnectionState.DISCONNECTED
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scheduleReconnect()
            }
        })
    }

    /**
     * Disconnect from the relay and cancel any pending reconnection.
     */
    fun disconnect() {
        scope.launch {
            reconnectJob?.cancelAndJoin()
            reconnectJob = null
        }
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        serverEventKeyHex = null
        _connectionState.value = ConnectionState.DISCONNECTED
        reconnectAttempt = 0
    }

    /**
     * Send a Nostr event to the relay.
     */
    fun send(event: NostrEvent): Boolean {
        val ws = webSocket ?: return false
        val eventJson = json.encodeToString(NostrEvent.serializer(), event)
        val message = """["EVENT",$eventJson]"""
        return ws.send(message)
    }

    private fun subscribe(ws: WebSocket) {
        // Subscribe to Llamenos event kinds tagged for this hub
        val subscriptionId = "llamenos-${System.currentTimeMillis()}"
        val filter = """{"kinds":[1000,1001,1002,1010,1011,20000],"#t":["${CryptoLabels.NOSTR_EVENT_TAG}"]}"""
        val message = """["REQ","$subscriptionId",$filter]"""
        ws.send(message)
    }

    private fun handleMessage(text: String) {
        try {
            // Nostr relay messages are JSON arrays: ["EVENT", <sub_id>, <event>]
            val parsed = json.parseToJsonElement(text)
            val array = parsed as? kotlinx.serialization.json.JsonArray ?: return

            if (array.size < 3) return

            val type = (array[0] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return
            if (type != "EVENT") return

            val eventElement = array[2]
            val event = json.decodeFromJsonElement(NostrEvent.serializer(), eventElement)

            scope.launch {
                _events.emit(event)
                // Attribute the event to its hub via key-trial decryption across all cached hub keys.
                val attributed = decryptEvent(event.content) ?: return@launch
                _typedEvents.emit(attributed)
                hubActivityService.handle(attributed)
            }
        } catch (_: Exception) {
            // Malformed messages are silently dropped — relay may send
            // NOTICE or other non-EVENT messages we don't need to handle.
        }
    }

    /**
     * Attribute an encrypted Nostr event to its hub by trying all cached hub keys.
     *
     * Iterates [CryptoService.allHubKeys], attempting [CryptoService.decryptServerEvent]
     * with each key's hex representation. The first key that successfully decrypts the
     * content determines the [AttributedHubEvent.hubId]. Falls back to [serverEventKeyHex]
     * if no hub key matches (e.g. during early auth before hub keys are loaded).
     *
     * @param encryptedContent Hex-encoded ciphertext from the Nostr event content field
     * @return [AttributedHubEvent] with the originating hub ID, or null if no key works
     */
    private fun decryptEvent(encryptedContent: String): AttributedHubEvent<LlamenosEvent>? {
        // Try each cached hub key — first successful decryption identifies the hub.
        for ((hubId, keyBytes) in cryptoService.allHubKeys()) {
            val keyHex = keyBytes.joinToString("") { "%02x".format(it) }
            val plaintext = cryptoService.decryptServerEvent(encryptedContent, keyHex) ?: continue
            val event = parseTypedEvent(plaintext) ?: continue
            return AttributedHubEvent(hubId = hubId, event = event)
        }
        // Fall back to serverEventKeyHex for events received before hub keys are loaded.
        val keyHex = serverEventKeyHex ?: return null
        val plaintext = cryptoService.decryptServerEvent(encryptedContent, keyHex) ?: return null
        val event = parseTypedEvent(plaintext) ?: return null
        val hubId = activeHubState.activeHubId.value ?: ""
        return AttributedHubEvent(hubId = hubId, event = event)
    }

    /**
     * Parse the decrypted event content JSON into a typed [LlamenosEvent].
     * Returns null for unparseable content (graceful forward compatibility).
     */
    private fun parseTypedEvent(content: String): LlamenosEvent? {
        return try {
            val obj = json.parseToJsonElement(content).jsonObject
            val type = obj["type"]?.jsonPrimitive?.content ?: return null

            when (type) {
                "call:ring" -> LlamenosEvent.CallRing(
                    obj["callId"]?.jsonPrimitive?.content ?: return null
                )
                "call:update" -> {
                    val callId = obj["callId"]?.jsonPrimitive?.content ?: return null
                    val status = obj["status"]?.jsonPrimitive?.content ?: return null
                    if (status == "completed") LlamenosEvent.CallEnded(callId)
                    else LlamenosEvent.CallUpdate(callId, status)
                }
                "voicemail:new" -> LlamenosEvent.VoicemailNew(
                    obj["callId"]?.jsonPrimitive?.content ?: return null
                )
                "presence:summary" -> LlamenosEvent.PresenceSummary(
                    obj["hasAvailable"]?.jsonPrimitive?.content?.toBoolean() ?: false
                )
                "message:new" -> LlamenosEvent.MessageNew(
                    obj["conversationId"]?.jsonPrimitive?.content ?: return null
                )
                "conversation:assigned" -> LlamenosEvent.ConversationAssigned(
                    obj["conversationId"]?.jsonPrimitive?.content ?: return null,
                    obj["assignedTo"]?.jsonPrimitive?.content
                )
                "conversation:closed" -> LlamenosEvent.ConversationClosed(
                    obj["conversationId"]?.jsonPrimitive?.content ?: return null
                )
                else -> LlamenosEvent.Unknown(type)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun scheduleReconnect() {
        reconnectJob = scope.launch {
            _connectionState.value = ConnectionState.RECONNECTING
            reconnectAttempt++

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
            val delayMs = minOf(1000L * (1L shl minOf(reconnectAttempt - 1, 4)), 30_000L)
            delay(delayMs)

            connect()
        }
    }
}
