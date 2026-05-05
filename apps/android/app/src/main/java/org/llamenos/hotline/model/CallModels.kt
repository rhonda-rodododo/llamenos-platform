package org.llamenos.hotline.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Generated response types ────────────────────────────────────────────────

typealias CallRecord = org.llamenos.protocol.CallRecordResponse
typealias CallHistoryRecord = org.llamenos.protocol.CallHistoryResponseCall

/**
 * Active call — a call currently ringing or in progress.
 * Client-only type because the API returns `callId` (DB column name) whereas the
 * generated ActiveCallsResponseCall expects `id`. This data class handles the
 * actual wire format with @SerialName mapping.
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
 * Response from GET /api/calls/active — list of the volunteer's active calls.
 * Client-only type wrapping our custom ActiveCall (not the generated one).
 */
@Serializable
data class ActiveCallsResponse(
    val calls: List<ActiveCall>,
)

/**
 * Call history response from GET /calls/history.
 * Uses the generated CallHistoryResponse. Pagination fields are Double.
 */
typealias CallHistoryResponse = org.llamenos.protocol.CallHistoryResponse

/**
 * Today's call count response from GET /calls/today-count.
 * Uses the generated TodayCountResponse. Count is Double.
 */
typealias CallCountResponse = org.llamenos.protocol.TodayCountResponse

// ── Client-specific request types ───────────────────────────────────────────

/**
 * Request body for POST /api/calls/{callId}/ban.
 * Uses the generated BanCallerBody.
 */
typealias BanRequest = org.llamenos.protocol.BanCallerBody
