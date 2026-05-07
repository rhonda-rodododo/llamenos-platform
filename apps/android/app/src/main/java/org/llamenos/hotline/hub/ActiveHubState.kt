package org.llamenos.hotline.hub

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import org.llamenos.hotline.di.ApplicationScope
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single source of truth for the currently active hub ID.
 *
 * Both ApiService and HubRepository inject this to break the circular dependency
 * that would arise if either owned the other. Neither owns this class.
 *
 * Persists to DataStore Preferences. StateFlow backed by DataStore ensures
 * all collectors receive the latest value immediately on collect.
 */
@Singleton
class ActiveHubState @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    @ApplicationScope private val scope: CoroutineScope,
) {
    companion object {
        private val ACTIVE_HUB_KEY = stringPreferencesKey("activeHubId")
    }

    val activeHubId: StateFlow<String?> = dataStore.data
        .map { prefs -> prefs[ACTIVE_HUB_KEY] }
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _refreshTrigger = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /**
     * Emits when a forced refresh is requested, regardless of whether the hub ID changed.
     *
     * ViewModels subscribe to this to re-fetch hub-scoped data when external state
     * changes (e.g., a test simulates a new active call and needs the UI to pick it up).
     * This avoids the StateFlow conflation problem where setting the hub back to its
     * current value doesn't trigger a new emission.
     */
    val refreshTrigger: SharedFlow<Unit> = _refreshTrigger.asSharedFlow()

    suspend fun setActiveHub(hubId: String) {
        dataStore.edit { prefs -> prefs[ACTIVE_HUB_KEY] = hubId }
    }

    /**
     * Signal all subscribers to re-fetch their hub-scoped data.
     * Does not change the active hub ID — purely a refresh signal.
     */
    suspend fun triggerRefresh() {
        _refreshTrigger.emit(Unit)
    }

    suspend fun clearActiveHub() {
        dataStore.edit { prefs -> prefs.remove(ACTIVE_HUB_KEY) }
    }
}
