package org.llamenos.hotline.ui.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.model.ContactDetail
import org.llamenos.hotline.model.ContactDetailResponse
import org.llamenos.hotline.model.ContactRelationship
import org.llamenos.hotline.model.ContactRelationshipsResponse
import javax.inject.Inject

data class ContactDetailUiState(
    val contactHash: String = "",
    val contact: ContactDetail? = null,
    val relationships: List<ContactRelationship> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingRelationships: Boolean = false,
    val error: String? = null,
)

/**
 * ViewModel for the contact profile detail screen.
 *
 * Loads contact detail from GET /contacts/{hash} and relationships from
 * GET /contacts/{hash}/relationships.
 */
@HiltViewModel
class ContactDetailViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ContactDetailUiState())
    val uiState: StateFlow<ContactDetailUiState> = _uiState.asStateFlow()

    fun loadContact(contactHash: String) {
        if (contactHash == _uiState.value.contactHash && _uiState.value.contact != null) return

        _uiState.update { it.copy(contactHash = contactHash, isLoading = true, error = null) }

        viewModelScope.launch {
            val contactDeferred = async { loadContactDetail(contactHash) }
            val relationshipsDeferred = async { loadRelationships(contactHash) }
            contactDeferred.await()
            relationshipsDeferred.await()
        }
    }

    private suspend fun loadContactDetail(contactHash: String) {
        try {
            val response = apiService.request<ContactDetailResponse>(
                "GET",
                apiService.hp("/api/contacts/$contactHash"),
            )
            _uiState.update {
                it.copy(
                    contact = response.contact,
                    isLoading = false,
                )
            }
        } catch (e: Exception) {
            _uiState.update {
                it.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load contact",
                )
            }
        }
    }

    private suspend fun loadRelationships(contactHash: String) {
        _uiState.update { it.copy(isLoadingRelationships = true) }
        try {
            val response = apiService.request<ContactRelationshipsResponse>(
                "GET",
                apiService.hp("/api/contacts/$contactHash/relationships"),
            )
            _uiState.update {
                it.copy(
                    relationships = response.relationships,
                    isLoadingRelationships = false,
                )
            }
        } catch (_: Exception) {
            // Relationships are optional
            _uiState.update { it.copy(isLoadingRelationships = false) }
        }
    }
}
