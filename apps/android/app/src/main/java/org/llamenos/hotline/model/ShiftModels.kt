package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A scheduled shift as returned by the API.
 *
 * [days] contains day-of-week indices (0 = Sunday, 6 = Saturday).
 * [status] is one of "available", "assigned", or "completed".
 */
@Serializable
data class ShiftResponse(
    val id: String,
    val startTime: String,
    val endTime: String,
    val days: List<Int>,
    val volunteerId: String? = null,
    val status: String,
)

/**
 * Current shift status for the authenticated volunteer.
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
 */
@Serializable
data class ClockResponse(
    val success: Boolean,
    val shiftId: String? = null,
)

/**
 * Paginated shifts list response from GET /api/shifts.
 */
@Serializable
data class ShiftsListResponse(
    val shifts: List<ShiftResponse>,
    val total: Int,
)
