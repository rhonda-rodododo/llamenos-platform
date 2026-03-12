package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * Re-export generated ShiftResponse from protocol package.
 * The generated type includes the full API shape (id, name, startTime, endTime,
 * days as List<Double>, volunteerPubkeys, createdAt).
 */
typealias ShiftResponse = org.llamenos.protocol.ShiftResponse

/**
 * Current shift status for the authenticated volunteer.
 * Client-specific shape for the /api/shifts/status endpoint.
 *
 * Note: The generated MyStatusResponse has a different shape (nested
 * currentShift/nextShift objects). This client type uses flat fields
 * matching the app's UI expectations.
 */
@Serializable
data class ShiftStatusResponse(
    val isOnShift: Boolean,
    val onBreak: Boolean = false,
    val shiftId: String? = null,
    val startedAt: String? = null,
    val activeCallCount: Int? = null,
    val recentNoteCount: Int? = null,
    val callsToday: Int? = null,
)

/**
 * Response from clock-in / clock-out endpoints.
 * Client-only type — not part of the generated API surface.
 */
@Serializable
data class ClockResponse(
    val success: Boolean,
    val shiftId: String? = null,
)

/**
 * Paginated shifts list response from GET /api/shifts.
 * Client-side wrapper — the API returns shifts array + count.
 */
@Serializable
data class ShiftsListResponse(
    val shifts: List<org.llamenos.protocol.ShiftResponse>,
    val total: Int,
)
