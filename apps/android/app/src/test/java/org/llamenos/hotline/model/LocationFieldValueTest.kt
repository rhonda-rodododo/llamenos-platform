package org.llamenos.hotline.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cross-platform wire-shape tests for [LocationFieldValue].
 *
 * A `location`-typed report field's value is a JSON string stored inside the
 * report's encrypted field-values map (see `ReportsViewModel.createTypedReport`).
 * Desktop produces/consumes this same string via `JSON.stringify(loc)` /
 * `JSON.parse(value)` with its own `LocationFieldValue` interface
 * (src/client/components/ui/location-field.tsx):
 *
 * ```ts
 * export interface LocationFieldValue {
 *   address: string
 *   displayName?: string
 *   lat?: number
 *   lon?: number
 * }
 * ```
 *
 * These tests pin the Android type to that exact shape at the JSON level —
 * the acceptance bar from issue #768 ("a shape mismatch here would be
 * silent") — without needing a live desktop process: a literal JSON string in
 * the exact form desktop's `JSON.stringify` would emit is decoded here, and a
 * value built and encoded here is asserted to contain only the fields desktop
 * expects, with the exact key names desktop's `JSON.parse` reads by.
 *
 * This does not exercise the HPKE encrypt/decrypt path itself — that requires
 * either a device with the native crypto library linked or a live desktop
 * process, neither of which is available in a host-JVM unit test (see
 * [org.llamenos.hotline.CryptoServiceTest]: `nativeLibLoaded` is always false
 * here). [org.llamenos.hotline.ui.reports.ReportsViewModelCryptoLabelTest]
 * covers the other half of the cross-platform risk: that Android encrypts
 * report field values (including this JSON) under the same label
 * (`LABEL_MESSAGE`) desktop uses to decrypt them.
 */
class LocationFieldValueTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `decodes a desktop-produced exact-precision JSON string`() {
        // Exactly what desktop's JSON.stringify({ address, displayName, lat, lon }) emits.
        val desktopJson = """{"address":"350 5th Ave, New York, NY","displayName":"Empire State Building","lat":40.7484,"lon":-73.9857}"""

        val decoded = json.decodeFromString<LocationFieldValue>(desktopJson)

        assertEquals("350 5th Ave, New York, NY", decoded.address)
        assertEquals("Empire State Building", decoded.displayName)
        assertEquals(40.7484, decoded.lat)
        assertEquals(-73.9857, decoded.lon)
    }

    @Test
    fun `decodes a desktop-produced block-precision JSON string with no displayName`() {
        // capToPrecision() on desktop omits displayName below 'exact' precision —
        // the key is absent from the JSON entirely, not null.
        val desktopJson = """{"address":"350 5th Ave, New York, NY","lat":40.7484,"lon":-73.9857}"""

        val decoded = json.decodeFromString<LocationFieldValue>(desktopJson)

        assertEquals("350 5th Ave, New York, NY", decoded.address)
        assertNull(decoded.displayName)
        assertEquals(40.7484, decoded.lat)
    }

    @Test
    fun `decodes a desktop-produced city-precision JSON string with only an address`() {
        // capToPrecision() on desktop omits lat/lon/displayName below 'block' precision.
        val desktopJson = """{"address":"New York, NY"}"""

        val decoded = json.decodeFromString<LocationFieldValue>(desktopJson)

        assertEquals("New York, NY", decoded.address)
        assertNull(decoded.displayName)
        assertNull(decoded.lat)
        assertNull(decoded.lon)
    }

    @Test
    fun `encodes with the exact key names desktop's JSON_parse expects`() {
        val value = LocationFieldValue(
            address = "1600 Pennsylvania Ave NW, Washington, DC",
            displayName = "The White House",
            lat = 38.8977,
            lon = -77.0365,
        )

        val encoded = Json.encodeToString(value)
        val reparsed = json.decodeFromString<Map<String, kotlinx.serialization.json.JsonElement>>(encoded)

        assertTrue("encoded JSON must use the key 'address'", reparsed.containsKey("address"))
        assertTrue("encoded JSON must use the key 'displayName' (not display_name)", reparsed.containsKey("displayName"))
        assertTrue("encoded JSON must use the key 'lat'", reparsed.containsKey("lat"))
        assertTrue("encoded JSON must use the key 'lon' (not lng/longitude)", reparsed.containsKey("lon"))
        assertEquals(setOf("address", "displayName", "lat", "lon"), reparsed.keys)
    }

    @Test
    fun `round-trips address-only values through encode then decode`() {
        val original = LocationFieldValue(address = "Manual address, no coordinates")

        val roundTripped = json.decodeFromString<LocationFieldValue>(Json.encodeToString(original))

        assertEquals(original, roundTripped)
    }

    @Test
    fun `round-trips full values through encode then decode`() {
        val original = LocationFieldValue(
            address = "1 Infinite Loop, Cupertino, CA",
            displayName = "Apple Park",
            lat = 37.3349,
            lon = -122.0090,
        )

        val roundTripped = json.decodeFromString<LocationFieldValue>(Json.encodeToString(original))

        assertEquals(original, roundTripped)
    }
}
