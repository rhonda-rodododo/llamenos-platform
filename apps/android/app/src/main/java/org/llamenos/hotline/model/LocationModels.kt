package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

// ── Generated re-exports ────────────────────────────────────────────────────

/**
 * A single geocoding suggestion returned by POST /api/geocoding/autocomplete,
 * /geocode, and /reverse. Generated from packages/protocol/schemas/geocoding.ts.
 */
typealias LocationResult = org.llamenos.protocol.LocationResult

// ── Client-specific types ───────────────────────────────────────────────────

/**
 * Structured value stored for a `location`-typed report/entity field.
 *
 * This mirrors the shape produced by the desktop client's `LocationFieldValue`
 * (src/client/components/ui/location-field.tsx) exactly — same field names,
 * same optionality — so that a location captured on one platform decodes
 * cleanly on the other. The value is stored as the JSON-encoded string of
 * this type inside the report's field-values map (see [ReportTypeDefinitionField]
 * `locationOptions` for precision/autocomplete configuration), which in turn
 * is JSON-encoded as a whole and E2EE-encrypted with the rest of the report
 * fields — never sent to the server in plaintext, and never geocoded further
 * than [ReportTypeDefinitionField.locationOptions]'s `maxPrecision` allows.
 */
@Serializable
data class LocationFieldValue(
    val address: String,
    val displayName: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
)

/**
 * Request body for POST /api/geocoding/autocomplete.
 *
 * This endpoint is not hub-scoped (mounted only on the top-level `authenticated`
 * router in apps/worker/app.ts, not `hubScoped`) — call it with the bare
 * `/api/geocoding/autocomplete` path, without [org.llamenos.hotline.api.ApiService.hp].
 */
@Serializable
data class GeocodingAutocompleteRequest(
    val query: String,
    val limit: Int = 5,
)
