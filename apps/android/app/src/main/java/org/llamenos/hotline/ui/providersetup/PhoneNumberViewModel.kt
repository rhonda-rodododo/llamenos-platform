package org.llamenos.hotline.ui.providersetup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ProviderSetupRepository
import org.llamenos.protocol.AvailableNumber
import org.llamenos.protocol.NumberProvisionRequest
import org.llamenos.protocol.NumberSearchQuery
import org.llamenos.protocol.OwnedNumber
import org.llamenos.protocol.ProviderType
import javax.inject.Inject

@HiltViewModel
class PhoneNumberViewModel @Inject constructor(
    private val repository: ProviderSetupRepository,
) : ViewModel() {

    private val _ownedNumbers = MutableStateFlow<List<OwnedNumber>>(emptyList())
    val ownedNumbers: StateFlow<List<OwnedNumber>> = _ownedNumbers.asStateFlow()

    private val _isLoadingOwned = MutableStateFlow(false)
    val isLoadingOwned: StateFlow<Boolean> = _isLoadingOwned.asStateFlow()

    private val _ownedError = MutableStateFlow<String?>(null)
    val ownedError: StateFlow<String?> = _ownedError.asStateFlow()

    private val _searchResults = MutableStateFlow<List<AvailableNumber>>(emptyList())
    val searchResults: StateFlow<List<AvailableNumber>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _searchError = MutableStateFlow<String?>(null)
    val searchError: StateFlow<String?> = _searchError.asStateFlow()

    private val _isProvisioning = MutableStateFlow(false)
    val isProvisioning: StateFlow<Boolean> = _isProvisioning.asStateFlow()

    private val _provisionError = MutableStateFlow<String?>(null)
    val provisionError: StateFlow<String?> = _provisionError.asStateFlow()

    private val _provisionSuccess = MutableStateFlow<OwnedNumber?>(null)
    val provisionSuccess: StateFlow<OwnedNumber?> = _provisionSuccess.asStateFlow()

    fun loadOwnedNumbers(provider: String) {
        viewModelScope.launch {
            _isLoadingOwned.value = true
            _ownedError.value = null
            val result = repository.listPhoneNumbers(provider)
            result.fold(
                onSuccess = { numbers ->
                    _ownedNumbers.value = numbers
                    _isLoadingOwned.value = false
                },
                onFailure = { error ->
                    _ownedError.value = error.message ?: "Failed to load phone numbers"
                    _isLoadingOwned.value = false
                },
            )
        }
    }

    fun searchNumbers(
        provider: String,
        countryCode: String = "US",
        areaCode: String? = null,
        contains: String? = null,
    ) {
        viewModelScope.launch {
            _isSearching.value = true
            _searchError.value = null
            _searchResults.value = emptyList()

            val providerType = try {
                ProviderType.valueOf(provider.replaceFirstChar { it.uppercase() })
            } catch (_: IllegalArgumentException) {
                _searchError.value = "Invalid provider type"
                _isSearching.value = false
                return@launch
            }

            val query = NumberSearchQuery(
                providerType = providerType,
                countryCode = countryCode,
                areaCode = areaCode,
                contains = contains,
            )
            val result = repository.searchPhoneNumbers(query)
            result.fold(
                onSuccess = { numbers ->
                    _searchResults.value = numbers
                    _isSearching.value = false
                },
                onFailure = { error ->
                    _searchError.value = error.message ?: "Failed to search phone numbers"
                    _isSearching.value = false
                },
            )
        }
    }

    fun provisionNumber(
        phoneNumber: String,
        provider: String,
        friendlyName: String? = null,
        autoConfigureWebhooks: Boolean = true,
    ) {
        viewModelScope.launch {
            _isProvisioning.value = true
            _provisionError.value = null
            _provisionSuccess.value = null

            val providerType = try {
                ProviderType.valueOf(provider.replaceFirstChar { it.uppercase() })
            } catch (_: IllegalArgumentException) {
                _provisionError.value = "Invalid provider type"
                _isProvisioning.value = false
                return@launch
            }

            val request = NumberProvisionRequest(
                phoneNumber = phoneNumber,
                providerType = providerType,
                friendlyName = friendlyName,
                autoConfigureWebhooks = autoConfigureWebhooks,
            )
            val result = repository.provisionPhoneNumber(request)
            result.fold(
                onSuccess = { number ->
                    _provisionSuccess.value = number
                    _isProvisioning.value = false
                    loadOwnedNumbers(provider)
                },
                onFailure = { error ->
                    _provisionError.value = error.message ?: "Failed to provision number"
                    _isProvisioning.value = false
                },
            )
        }
    }

    fun clearProvisionSuccess() {
        _provisionSuccess.value = null
    }

    fun clearProvisionError() {
        _provisionError.value = null
    }

    fun clearSearchError() {
        _searchError.value = null
    }

    fun clearOwnedError() {
        _ownedError.value = null
    }
}
