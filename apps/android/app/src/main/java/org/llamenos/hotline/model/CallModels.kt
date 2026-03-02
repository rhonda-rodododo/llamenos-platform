package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * Encrypted call record as stored server-side and returned by GET /calls/history.
 *
 * Plaintext fields (callerLast4, timestamps, duration, status) are safe for ordering
 * and display. Sensitive metadata (answeredBy, callerNumber) is sealed inside
 * [encryptedContent] as XChaCha20-Poly1305 ciphertext. Each admin receives their
 * own [RecipientEnvelope] wrapping the per-record symmetric key via ECIES.
 */
@Serializable
data class CallRecord(
    val id: String,
    val callerLast4: String? = null,
    val startedAt: String,
    val endedAt: String? = null,
    val duration: Int? = null,
    val status: String,
    val hasTranscription: Boolean = false,
    val hasVoicemail: Boolean = false,
    val hasRecording: Boolean = false,
    val recordingSid: String? = null,
    val encryptedContent: String? = null,
    val adminEnvelopes: List<RecipientEnvelope>? = null,
)

/**
 * Active call — a call currently ringing or in progress.
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
 */
@Serializable
data class CallHistoryResponse(
    val calls: List<CallRecord>,
    val total: Int,
)

/**
 * Today's call count response from GET /calls/today-count.
 */
@Serializable
data class CallCountResponse(
    val count: Int,
)
