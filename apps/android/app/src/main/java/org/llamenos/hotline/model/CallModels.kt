package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * Re-export generated CallRecordResponse from protocol package.
 */
typealias CallRecord = org.llamenos.protocol.CallRecordResponse

/**
 * Active call — a call currently ringing or in progress.
 * Client-only type — not part of the generated API surface.
 */
@Serializable
data class ActiveCall(
    val id: String,
    val callerNumber: String? = null,
    val answeredBy: String? = null,
    val startedAt: String,
    val status: String,
)

/**
 * Paginated call history response from GET /calls/history.
 * Client-side wrapper.
 */
@Serializable
data class CallHistoryResponse(
    val calls: List<org.llamenos.protocol.CallRecordResponse>,
    val total: Int,
)

/**
 * Today's call count response from GET /calls/today-count.
 * Client-only type.
 */
@Serializable
data class CallCountResponse(
    val count: Int,
)
