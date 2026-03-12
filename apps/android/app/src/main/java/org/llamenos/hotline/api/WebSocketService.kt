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
import org.llamenos.hotline.model.LlamenosEvent
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

    private val _typedEvents = MutableSharedFlow<LlamenosEvent>(extraBufferCapacity = 64)

    /** Typed application events parsed from Nostr relay messages. */
    val typedEvents: SharedFlow<LlamenosEvent> = _typedEvents.asSharedFlow()

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
        val filter = """{"kinds":[1000,1001,1002,1010,1011,20000],"#t":["llamenos:event"]}"""
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
                // Parse into typed event and emit on the typed flow
                parseTypedEvent(event.content)?.let { typed ->
                    _typedEvents.emit(typed)
                }
            }
        } catch (_: Exception) {
            // Malformed messages are silently dropped — relay may send
            // NOTICE or other non-EVENT messages we don't need to handle.
        }
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
                    obj["hasAvailable"]?.jsonPrimitive?.boolean ?: false
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
