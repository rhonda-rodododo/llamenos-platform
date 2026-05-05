package org.llamenos.hotline.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Re-export generated CallRecordResponse from protocol package.
 */
typealias CallRecord = org.llamenos.protocol.CallRecordResponse

/**
 * Active call — a call currently ringing or in progress.
 * Client-only type — not part of the generated API surface.
 * The generated ActiveCallsResponseCall has a different shape (callerLast4 instead of callerNumber,
 * includes hasRecording/hasTranscription/hasVoicemail/duration/endedAt which are not needed here).
 */
@Serializable
data class ActiveCall(
    @SerialName("callId") val id: String,
    val callerNumber: String? = null,
    val answeredBy: String? = null,
    val startedAt: String,
    val status: String,
)

/**
 * Paginated call history response from GET /calls/history.
 * Client-side wrapper — the generated CallHistoryResponse uses Double for pagination fields
 * and a nested CallHistoryResponseCall type. This uses Int and the generated CallRecordResponse.
 */
@Serializable
data class CallHistoryResponse(
    val calls: List<org.llamenos.protocol.CallRecordResponse>,
    val total: Int,
)

/**
 * Today's call count response from GET /calls/today-count.
 * Client-only type using Int instead of the generated TodayCountResponse (Double).
 */
@Serializable
data class CallCountResponse(
    val count: Int,
)

/**
 * Response from GET /api/calls/active — list of the volunteer's active calls.
 * Client-only type — the generated ActiveCallsResponse uses ActiveCallsResponseCall
 * which has a different shape from our client ActiveCall.
 */
@Serializable
data class ActiveCallsResponse(
    val calls: List<ActiveCall>,
)

/**
 * Request body for POST /api/calls/{callId}/ban.
 * Client-specific shape — uses 'reason: String' (non-nullable) vs the generated
 * BanCallerBody which has 'reason: String? = null'.
 */
@Serializable
data class BanRequest(
    val reason: String,
)
