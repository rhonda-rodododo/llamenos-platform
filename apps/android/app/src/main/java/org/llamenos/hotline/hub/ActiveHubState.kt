package org.llamenos.hotline.hub

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
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

    suspend fun setActiveHub(hubId: String) {
        dataStore.edit { prefs -> prefs[ACTIVE_HUB_KEY] = hubId }
    }

    suspend fun clearActiveHub() {
        dataStore.edit { prefs -> prefs.remove(ACTIVE_HUB_KEY) }
    }
}
