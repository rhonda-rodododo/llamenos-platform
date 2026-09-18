package org.llamenos.hotline.ui.reports

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.llamenos.hotline.R
import org.llamenos.hotline.model.LocationFieldValue
import org.llamenos.hotline.model.LocationResult
import org.llamenos.hotline.model.ReportTypeDefinitionField
import org.llamenos.protocol.SharedLocationPrecision

/**
 * JSON codec for [LocationFieldValue]. Deliberately separate from
 * [ReportsViewModel]'s field-values JSON (a flat `Map<String, String>`) — this
 * one round-trips the *value* stored at a single `location`-typed field's key,
 * matching the shape desktop's `LocationField` produces via
 * `JSON.stringify(loc)` (src/client/components/ui/location-field.tsx) and
 * consumes via `JSON.parse(value)` (src/client/components/cases/schema-form.tsx).
 */
private val locationValueJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
}

private val PRECISION_RANK = mapOf(
    SharedLocationPrecision.None to 0,
    SharedLocationPrecision.City to 1,
    SharedLocationPrecision.Neighborhood to 2,
    SharedLocationPrecision.Block to 3,
    SharedLocationPrecision.Exact to 4,
)

/**
 * Caps a raw geocoding [result] to the field's configured [maxPrecision], exactly
 * mirroring desktop's `capToPrecision` (src/client/components/ui/location-field.tsx).
 * A report type configured for city-level precision must not leak exact
 * coordinates into the encrypted field value.
 */
internal fun capLocationToPrecision(
    result: LocationResult,
    maxPrecision: SharedLocationPrecision,
): LocationFieldValue {
    val rank = PRECISION_RANK.getValue(maxPrecision)
    return LocationFieldValue(
        address = result.address,
        displayName = if (rank >= PRECISION_RANK.getValue(SharedLocationPrecision.Exact)) result.displayName else null,
        lat = if (rank >= PRECISION_RANK.getValue(SharedLocationPrecision.Block)) result.lat else null,
        lon = if (rank >= PRECISION_RANK.getValue(SharedLocationPrecision.Block)) result.lon else null,
    )
}

/** Parses a stored field value back into a [LocationFieldValue], or null if blank/invalid. */
internal fun parseLocationFieldValue(value: String): LocationFieldValue? {
    if (value.isBlank()) return null
    return try {
        locationValueJson.decodeFromString<LocationFieldValue>(value)
    } catch (_: Exception) {
        null
    }
}

/** Serializes a [LocationFieldValue] to the JSON string stored as the field's value. */
internal fun encodeLocationFieldValue(location: LocationFieldValue): String =
    locationValueJson.encodeToString(location)

/**
 * Location field picker for typed report creation.
 *
 * Renders an address search box backed by `POST /api/geocoding/autocomplete`
 * (the same endpoint and precision-capping behavior as desktop's `LocationField`),
 * showing suggestions the user can pick from. The committed value is a
 * JSON-encoded [LocationFieldValue] — structured, validated coordinates or a
 * place reference — never raw free text, so it round-trips identically through
 * the same E2EE field-values envelope desktop reads.
 *
 * When the report type disables autocomplete
 * (`field.locationOptions.allowAutocomplete == false`), typed text is committed
 * as an address-only [LocationFieldValue] (no coordinates) via an explicit
 * confirm action, rather than silently discarding it.
 */
@Composable
fun LocationPickerField(
    field: ReportTypeDefinitionField,
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    onSearch: suspend (String) -> List<LocationResult>,
    modifier: Modifier = Modifier,
) {
    val maxPrecision = field.locationOptions?.maxPrecision ?: SharedLocationPrecision.Exact
    val allowAutocomplete = field.locationOptions?.allowAutocomplete ?: true

    val currentLocation = remember(value) { parseLocationFieldValue(value) }
    var query by remember(field.name) { mutableStateOf(currentLocation?.address ?: "") }
    var suggestions by remember { mutableStateOf<List<LocationResult>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchJob by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()

    fun clear() {
        query = ""
        suggestions = emptyList()
        searchJob?.cancel()
        onValueChange("")
    }

    fun select(result: LocationResult) {
        val picked = capLocationToPrecision(result, maxPrecision)
        query = picked.address
        suggestions = emptyList()
        onValueChange(encodeLocationFieldValue(picked))
    }

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = query,
            onValueChange = { newQuery ->
                query = newQuery
                if (allowAutocomplete) {
                    searchJob?.cancel()
                    if (newQuery.length < 3) {
                        suggestions = emptyList()
                        isSearching = false
                    } else {
                        searchJob = scope.launch {
                            delay(300)
                            isSearching = true
                            suggestions = onSearch(newQuery)
                            isSearching = false
                        }
                    }
                } else {
                    // Manual-entry mode: the address isn't committed as a field
                    // value until the user explicitly confirms it below, so a
                    // half-typed address is never submitted as if it were final.
                    onValueChange("")
                }
            },
            label = { Text(label) },
            placeholder = { Text(stringResource(R.string.location_search_placeholder)) },
            singleLine = true,
            trailingIcon = {
                when {
                    isSearching -> CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                    query.isNotBlank() -> IconButton(
                        onClick = ::clear,
                        modifier = Modifier.testTag("field-${field.name}-clear"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Clear,
                            contentDescription = stringResource(R.string.common_clear),
                        )
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("field-${field.name}"),
        )

        if (allowAutocomplete && suggestions.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("field-${field.name}-suggestions"),
            ) {
                suggestions.forEachIndexed { index, result ->
                    Text(
                        text = result.address,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { select(result) }
                            .padding(vertical = 10.dp, horizontal = 4.dp)
                            .testTag("field-${field.name}-option-$index"),
                    )
                }
            }
        } else if (allowAutocomplete && !isSearching && query.length >= 3 && currentLocation?.address != query) {
            Text(
                text = stringResource(R.string.location_no_result),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(start = 4.dp, top = 4.dp)
                    .testTag("field-${field.name}-no-results"),
            )
        }

        if (!allowAutocomplete && query.isNotBlank() && currentLocation?.address != query) {
            TextButton(
                onClick = {
                    onValueChange(encodeLocationFieldValue(LocationFieldValue(address = query.trim())))
                },
                modifier = Modifier.testTag("field-${field.name}-confirm"),
            ) {
                Text(stringResource(R.string.location_confirm_location))
            }
        }

        currentLocation?.let { loc ->
            val coords = if (loc.lat != null && loc.lon != null) {
                " (%.4f, %.4f)".format(loc.lat, loc.lon)
            } else {
                ""
            }
            Text(
                text = "${loc.address}$coords",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                modifier = Modifier
                    .padding(start = 4.dp, top = 4.dp)
                    .testTag("field-${field.name}-selected"),
            )
        }
    }
}
