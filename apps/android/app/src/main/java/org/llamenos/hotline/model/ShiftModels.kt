package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

// ── Generated re-exports ────────────────────────────────────────────────────

typealias ShiftResponse = org.llamenos.protocol.Shift

/**
 * Shifts list response from GET /api/shifts.
 * Uses the generated ShiftListResponse.
 */
typealias ShiftsListResponse = org.llamenos.protocol.ShiftListResponse

// ── Client-specific types ───────────────────────────────────────────────────

/**
 * Current shift status for the authenticated volunteer.
 * Client-specific shape for the /api/shifts/status endpoint.
 * The generated MyStatusResponse has a different shape (nested objects).
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
