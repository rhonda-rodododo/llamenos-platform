package org.llamenos.hotline.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Generated response types ────────────────────────────────────────────────

typealias CallRecord = org.llamenos.protocol.CallRecordResponse
typealias CallHistoryRecord = org.llamenos.protocol.CallHistoryResponseCall

/**
 * Active call. Uses the generated ActiveCallsResponseCall which is a superset
 * (includes callerLast4, hasRecording, etc.). Extension properties in
 * Extensions.kt provide backward-compatible accessors.
 */
typealias ActiveCall = org.llamenos.protocol.ActiveCallsResponseCall

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

/**
 * Response from GET /api/calls/active.
 * Uses the generated ActiveCallsResponse.
 */
typealias ActiveCallsResponse = org.llamenos.protocol.ActiveCallsResponse

// ── Client-specific request types ───────────────────────────────────────────

/**
 * Request body for POST /api/calls/{callId}/ban.
 * Uses the generated BanCallerBody.
 */
typealias BanRequest = org.llamenos.protocol.BanCallerBody
