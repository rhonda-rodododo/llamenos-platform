package org.llamenos.hotline.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Re-export generated API types from protocol package.
 */
typealias NoteResponse = org.llamenos.protocol.NoteResponse
typealias RecipientEnvelope = org.llamenos.protocol.RecipientEnvelope
typealias CreateNoteBody = org.llamenos.protocol.CreateNoteBody
typealias CreateReplyBody = org.llamenos.protocol.CreateReplyBody

/**
 * Decrypted note payload — the plaintext content inside an encrypted note.
 *
 * The [text] field is the main note body. [fields] holds optional custom field
 * values keyed by field definition name. This is NOT an API type — it's the
 * plaintext content after ECIES unwrap + XChaCha20-Poly1305 decryption.
 */
@Serializable
data class NotePayload(
    val text: String,
    val fields: Map<String, JsonElement>? = null,
)

/**
 * Paginated notes list response from GET /api/notes.
 * Client-side wrapper — the API returns notes array + pagination metadata.
 */
@Serializable
data class NotesListResponse(
    val notes: List<org.llamenos.protocol.NoteResponse>,
    val total: Int,
    val page: Int,
)

/**
 * Response from GET /api/notes/:id/replies.
 */
@Serializable
data class NoteRepliesResponse(
    val replies: List<NoteReply>,
)

/**
 * A reply in a note thread.
 */
@Serializable
data class NoteReply(
    val id: String,
    val noteId: String,
    val authorPubkey: String,
    val encryptedContent: String,
    val readerEnvelopes: List<org.llamenos.protocol.RecipientEnvelope>,
    val createdAt: String,
)
