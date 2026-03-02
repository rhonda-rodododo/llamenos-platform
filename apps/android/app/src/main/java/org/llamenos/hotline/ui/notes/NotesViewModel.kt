package org.llamenos.hotline.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.model.CreateNoteEnvelope
import org.llamenos.hotline.model.CreateNoteRequest
import org.llamenos.hotline.model.CustomFieldDefinition
import org.llamenos.hotline.model.NotePayload
import org.llamenos.hotline.model.NoteResponse
import org.llamenos.hotline.model.NotesListResponse
import org.llamenos.hotline.model.RecipientEnvelope
import javax.inject.Inject

/**
 * Decrypted note for UI display. Combines the API response metadata with
 * the decrypted plaintext content.
 */
data class DecryptedNote(
    val id: String,
    val text: String,
    val fields: Map<String, JsonElement>?,
    val authorPubkey: String,
    val callId: String?,
    val conversationId: String?,
    val createdAt: String,
    val updatedAt: String?,
)

data class NotesUiState(
    val notes: List<DecryptedNote> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val currentPage: Int = 1,
    val totalNotes: Int = 0,
    val hasMorePages: Boolean = false,

    // Search
    val searchQuery: String = "",

    // Note creation / editing
    val customFields: List<CustomFieldDefinition> = emptyList(),
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val saveSuccess: Boolean = false,

    // Note detail
    val selectedNote: DecryptedNote? = null,
    val isEditing: Boolean = false,
)

/**
 * ViewModel for the Notes feature.
 *
 * Handles fetching, decrypting, and creating encrypted notes.
 * Each note is encrypted with per-note forward secrecy — a unique random key
 * per note, ECIES-wrapped for the author and each admin.
 *
 * Decryption: find the envelope matching our pubkey, unwrap the symmetric key
 * via ECIES, then decrypt the note ciphertext with XChaCha20-Poly1305.
 */
@HiltViewModel
class NotesViewModel @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: CryptoService,
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true }

    private val _uiState = MutableStateFlow(NotesUiState())
    val uiState: StateFlow<NotesUiState> = _uiState.asStateFlow()

    init {
        loadNotes()
        loadCustomFields()
    }

    /**
     * Load notes from the API and decrypt them locally.
     */
    fun loadNotes(page: Int = 1) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = page == 1 && it.notes.isEmpty(),
                    isRefreshing = page == 1 && it.notes.isNotEmpty(),
                    error = null,
                )
            }

            try {
                val response = apiService.request<NotesListResponse>(
                    "GET",
                    "/api/notes?page=$page&limit=20",
                )

                val decrypted = response.notes.mapNotNull { note ->
                    decryptNote(note)
                }

                _uiState.update {
                    val allNotes = if (page == 1) decrypted else it.notes + decrypted
                    it.copy(
                        notes = allNotes,
                        isLoading = false,
                        isRefreshing = false,
                        currentPage = page,
                        totalNotes = response.total,
                        hasMorePages = allNotes.size < response.total,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "Failed to load notes",
                    )
                }
            }
        }
    }

    /**
     * Pull-to-refresh — reload from page 1.
     */
    fun refresh() {
        loadNotes(page = 1)
    }

    /**
     * Load the next page of notes.
     */
    fun loadNextPage() {
        val state = _uiState.value
        if (!state.hasMorePages || state.isLoading) return
        loadNotes(page = state.currentPage + 1)
    }

    /**
     * Load custom field definitions from settings.
     */
    private fun loadCustomFields() {
        viewModelScope.launch {
            try {
                val fields = apiService.request<List<CustomFieldDefinition>>(
                    "GET",
                    "/api/settings/custom-fields",
                )
                _uiState.update {
                    it.copy(
                        customFields = fields.filter {  field ->
                            field.visibleToVolunteers && field.context == "note"
                        },
                    )
                }
            } catch (_: Exception) {
                // Custom fields are optional — silent failure is acceptable
            }
        }
    }

    /**
     * Select a note for detail view.
     */
    fun selectNote(note: DecryptedNote) {
        _uiState.update { it.copy(selectedNote = note) }
    }

    /**
     * Clear the selected note (navigating back from detail).
     */
    fun clearSelectedNote() {
        _uiState.update { it.copy(selectedNote = null) }
    }

    /**
     * Create a new encrypted note.
     *
     * @param text The note body text
     * @param fieldValues Map of custom field name -> value
     */
    fun createNote(text: String, fieldValues: Map<String, String>, conversationId: String? = null, callId: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, saveError = null, saveSuccess = false) }

            try {
                // Build the payload with custom field values
                val fields: Map<String, JsonElement>? = if (fieldValues.isNotEmpty()) {
                    fieldValues.mapValues { (name, value) ->
                        val fieldDef = _uiState.value.customFields.find { it.name == name }
                        when (fieldDef?.type) {
                            "checkbox" -> JsonPrimitive(value.toBooleanStrictOrNull() ?: false)
                            "number" -> {
                                val num = value.toIntOrNull()
                                if (num != null) JsonPrimitive(num) else JsonPrimitive(value)
                            }
                            else -> JsonPrimitive(value)
                        }
                    }
                } else {
                    null
                }

                val payload = NotePayload(text = text, fields = fields)
                val payloadJson = json.encodeToString(NotePayload.serializer(), payload)

                // Encrypt the note — in production, CryptoService will fetch admin pubkeys
                // and create ECIES envelopes for each. For now, encrypt for self only.
                val encrypted = cryptoService.encryptNote(payloadJson, emptyList())

                val envelopes = encrypted.envelopes.map { env ->
                    CreateNoteEnvelope(
                        pubkey = env.recipientPubkey,
                        wrappedKey = env.wrappedKey,
                        ephemeralPubkey = env.ephemeralPubkey,
                    )
                }

                val request = CreateNoteRequest(
                    encryptedContent = encrypted.ciphertext,
                    recipientEnvelopes = envelopes,
                    conversationId = conversationId,
                    callId = callId,
                )

                apiService.request<NoteResponse>("POST", "/api/notes", request)

                _uiState.update { it.copy(isSaving = false, saveSuccess = true) }

                // Refresh the notes list to include the new note
                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        saveError = e.message ?: "Failed to save note",
                    )
                }
            }
        }
    }

    /**
     * Clear the save success flag after the UI has navigated back.
     */
    fun clearSaveSuccess() {
        _uiState.update { it.copy(saveSuccess = false) }
    }

    /**
     * Clear the save error.
     */
    fun clearSaveError() {
        _uiState.update { it.copy(saveError = null) }
    }

    // ---- Search ----

    /**
     * Set the search query for filtering notes.
     */
    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    /**
     * Get notes filtered by the current search query.
     */
    fun filteredNotes(): List<DecryptedNote> {
        val query = _uiState.value.searchQuery.lowercase()
        if (query.isBlank()) return _uiState.value.notes
        return _uiState.value.notes.filter { note ->
            note.text.lowercase().contains(query)
        }
    }

    // ---- Note Editing ----

    /**
     * Enter edit mode for the selected note.
     */
    fun startEditing() {
        _uiState.update { it.copy(isEditing = true) }
    }

    /**
     * Cancel editing and return to read mode.
     */
    fun cancelEditing() {
        _uiState.update { it.copy(isEditing = false) }
    }

    /**
     * Update an existing note with new encrypted content.
     *
     * @param noteId The note to update
     * @param text Updated plaintext note body
     * @param fieldValues Updated custom field values
     */
    fun updateNote(noteId: String, text: String, fieldValues: Map<String, String>) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, saveError = null) }

            try {
                val fields: Map<String, JsonElement>? = if (fieldValues.isNotEmpty()) {
                    fieldValues.mapValues { (name, value) ->
                        val fieldDef = _uiState.value.customFields.find { it.name == name }
                        when (fieldDef?.type) {
                            "checkbox" -> JsonPrimitive(value.toBooleanStrictOrNull() ?: false)
                            "number" -> {
                                val num = value.toIntOrNull()
                                if (num != null) JsonPrimitive(num) else JsonPrimitive(value)
                            }
                            else -> JsonPrimitive(value)
                        }
                    }
                } else {
                    null
                }

                val payload = NotePayload(text = text, fields = fields)
                val payloadJson = json.encodeToString(NotePayload.serializer(), payload)

                val encrypted = cryptoService.encryptNote(payloadJson, emptyList())

                val envelopes = encrypted.envelopes.map { env ->
                    CreateNoteEnvelope(
                        pubkey = env.recipientPubkey,
                        wrappedKey = env.wrappedKey,
                        ephemeralPubkey = env.ephemeralPubkey,
                    )
                }

                val request = CreateNoteRequest(
                    encryptedContent = encrypted.ciphertext,
                    recipientEnvelopes = envelopes,
                )

                apiService.request<NoteResponse>("PUT", "/api/notes/$noteId", request)

                // Update local state with edited content
                val updatedNote = _uiState.value.selectedNote?.copy(
                    text = text,
                    fields = fields,
                )
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        isEditing = false,
                        selectedNote = updatedNote,
                        saveSuccess = true,
                    )
                }

                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        saveError = e.message ?: "Failed to update note",
                    )
                }
            }
        }
    }

    /**
     * Decrypt a single note by finding our envelope and calling CryptoService.
     */
    private suspend fun decryptNote(note: NoteResponse): DecryptedNote? {
        val ourPubkey = cryptoService.pubkey ?: return null

        val envelope = note.recipientEnvelopes.find { it.pubkey == ourPubkey }
            ?: return null

        return try {
            val payload = cryptoService.decryptNote(note.encryptedContent, envelope)
            if (payload != null) {
                DecryptedNote(
                    id = note.id,
                    text = payload.text,
                    fields = payload.fields,
                    authorPubkey = note.authorPubkey,
                    callId = note.callId,
                    conversationId = note.conversationId,
                    createdAt = note.createdAt,
                    updatedAt = note.updatedAt,
                )
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }
}

/**
 * Extension to extract a display-friendly string from a [JsonElement] custom field value.
 */
fun JsonElement.displayValue(): String {
    val primitive = this.jsonPrimitive
    return when {
        primitive.booleanOrNull != null -> if (primitive.booleanOrNull == true) "Yes" else "No"
        primitive.contentOrNull != null -> primitive.content
        else -> toString()
    }
}
