package org.llamenos.hotline.ui.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.hotline.model.ContactSummary
import org.llamenos.hotline.model.ContactSearchResponse
import org.llamenos.hotline.model.ContactsListResponse
import javax.inject.Inject

data class ContactsUiState(
    val contacts: List<ContactSummary> = emptyList(),
    val total: Int = 0,
    val currentPage: Int = 1,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val searchQuery: String = "",
    val contactTypes: List<String> = emptyList(),
    val selectedContactType: String? = null,
)

/**
 * ViewModel for the contacts screen.
 *
 * Loads paginated contact summaries from GET /contacts. Each contact
 * shows aggregated interaction counts (calls, conversations, notes, reports).
 * Supports trigram search via GET /contacts/search and type filtering.
 */
@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val apiService: ApiService,
    private val activeHubState: ActiveHubState,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ContactsUiState())
    val uiState: StateFlow<ContactsUiState> = _uiState.asStateFlow()

    init {
        activeHubState.activeHubId
            .filterNotNull()
            .onEach { loadContacts() }
            .launchIn(viewModelScope)
    }

    fun loadContacts(page: Int = 1) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = page == 1 && it.contacts.isEmpty(),
                    isRefreshing = page == 1 && it.contacts.isNotEmpty(),
                    error = null,
                )
            }
            try {
                val state = _uiState.value
                val search = state.searchQuery

                // Use trigram search endpoint if there's a search query
                if (search.isNotBlank() && page == 1) {
                    val query = buildString {
                        append(apiService.hp("/api/contacts/search"))
                        append("?q=$search")
                        state.selectedContactType?.let {
                            append("&contactType=$it")
                        }
                    }
                    val response = apiService.request<ContactSearchResponse>(
                        "GET",
                        query,
                    )
                    _uiState.update {
                        it.copy(
                            contacts = response.contacts,
                            total = response.total,
                            currentPage = 1,
                            isLoading = false,
                            isRefreshing = false,
                        )
                    }
                } else {
                    val query = buildString {
                        append(apiService.hp("/api/contacts"))
                        append("?page=$page&limit=50")
                        if (search.isNotBlank()) {
                            append("&search=$search")
                        }
                        state.selectedContactType?.let {
                            append("&contactType=$it")
                        }
                    }
                    val response = apiService.request<ContactsListResponse>(
                        "GET",
                        query,
                    )
                    _uiState.update {
                        it.copy(
                            contacts = if (page == 1) response.contacts else it.contacts + response.contacts,
                            total = response.total,
                            currentPage = page,
                            isLoading = false,
                            isRefreshing = false,
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "Failed to load contacts",
                    )
                }
            }
        }
    }

    fun refresh() {
        _uiState.update { it.copy(searchQuery = "", selectedContactType = null) }
        loadContacts(page = 1)
    }

    fun loadNextPage() {
        val state = _uiState.value
        if (state.contacts.size < state.total && !state.isLoading) {
            loadContacts(page = state.currentPage + 1)
        }
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        loadContacts(page = 1)
    }

    fun setContactTypeFilter(contactType: String?) {
        _uiState.update { it.copy(selectedContactType = contactType, contacts = emptyList(), total = 0) }
        loadContacts(page = 1)
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
