package org.llamenos.hotline.model

import org.llamenos.protocol.CallRecordResponse
import org.llamenos.protocol.ShiftResponse

/**
 * Extension properties and functions on generated protocol types.
 *
 * These adapt the generated API types for UI display and backward
 * compatibility with existing Android client code.
 */

// ---- ShiftResponse Extensions ----

/**
 * Convert the Double-typed day indices from the generated ShiftResponse
 * to Int values suitable for display formatting.
 */
val ShiftResponse.dayIndices: List<Int>
    get() = days.map { it.toInt() }

/**
 * Derive a display status from the generated ShiftResponse.
 * The generated type doesn't have a status field — it contains
 * volunteerPubkeys which indicates assignment.
 */
val ShiftResponse.displayStatus: String
    get() = if (volunteerPubkeys.isEmpty()) "available" else "assigned"

// ---- CallRecordResponse Extensions ----

/**
 * Duration as Int (seconds), converting from the generated Double? type.
 */
val CallRecordResponse.durationSeconds: Int?
    get() = duration?.toInt()

/**
 * Safe boolean accessors for nullable Boolean? fields.
 */
val CallRecordResponse.hasVoicemailFlag: Boolean
    get() = hasVoicemail == true

val CallRecordResponse.hasTranscriptionFlag: Boolean
    get() = hasTranscription == true

val CallRecordResponse.hasRecordingFlag: Boolean
    get() = hasRecording == true
