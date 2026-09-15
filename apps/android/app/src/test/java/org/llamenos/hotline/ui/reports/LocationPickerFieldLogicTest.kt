package org.llamenos.hotline.ui.reports

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.llamenos.hotline.model.LocationFieldValue
import org.llamenos.hotline.model.LocationResult
import org.llamenos.protocol.SharedLocationPrecision

/**
 * Unit tests for the location field's precision-capping and (de)serialization
 * helpers in [LocationPickerField], mirroring desktop's `capToPrecision` and
 * `JSON.stringify`/`JSON.parse` usage in
 * src/client/components/ui/location-field.tsx and
 * src/client/components/cases/schema-form.tsx.
 */
class LocationPickerFieldLogicTest {

    private fun result(
        address: String = "350 5th Ave, New York, NY",
        lat: Double = 40.7484,
        lon: Double = -73.9857,
        displayName: String? = "Empire State Building",
    ) = LocationResult(address = address, lat = lat, lon = lon, displayName = displayName)

    @Test
    fun `exact precision retains address, displayName, and coordinates`() {
        val capped = capLocationToPrecision(result(), SharedLocationPrecision.Exact)

        assertEquals("350 5th Ave, New York, NY", capped.address)
        assertEquals("Empire State Building", capped.displayName)
        assertEquals(40.7484, capped.lat)
        assertEquals(-73.9857, capped.lon)
    }

    @Test
    fun `block precision retains coordinates but drops displayName`() {
        val capped = capLocationToPrecision(result(), SharedLocationPrecision.Block)

        assertEquals("350 5th Ave, New York, NY", capped.address)
        assertNull(capped.displayName)
        assertEquals(40.7484, capped.lat)
        assertEquals(-73.9857, capped.lon)
    }

    @Test
    fun `neighborhood precision drops coordinates and displayName`() {
        val capped = capLocationToPrecision(result(), SharedLocationPrecision.Neighborhood)

        assertEquals("350 5th Ave, New York, NY", capped.address)
        assertNull(capped.displayName)
        assertNull(capped.lat)
        assertNull(capped.lon)
    }

    @Test
    fun `city precision drops coordinates and displayName`() {
        val capped = capLocationToPrecision(result(), SharedLocationPrecision.City)

        assertNull(capped.displayName)
        assertNull(capped.lat)
        assertNull(capped.lon)
    }

    @Test
    fun `none precision retains only the address`() {
        val capped = capLocationToPrecision(result(), SharedLocationPrecision.None)

        assertEquals("350 5th Ave, New York, NY", capped.address)
        assertNull(capped.displayName)
        assertNull(capped.lat)
        assertNull(capped.lon)
    }

    @Test
    fun `parseLocationFieldValue returns null for a blank stored value`() {
        assertNull(parseLocationFieldValue(""))
        assertNull(parseLocationFieldValue("   "))
    }

    @Test
    fun `parseLocationFieldValue returns null for invalid JSON instead of throwing`() {
        // Legacy free-text values from before this field type had a picker
        // (or any other malformed stored value) must not crash the form.
        assertNull(parseLocationFieldValue("123 Main St (not JSON)"))
    }

    @Test
    fun `encode then parse round-trips a picked location`() {
        val picked = capLocationToPrecision(result(), SharedLocationPrecision.Exact)

        val encoded = encodeLocationFieldValue(picked)
        val parsed = parseLocationFieldValue(encoded)

        assertEquals(picked, parsed)
    }

    @Test
    fun `encode then parse round-trips an address-only manual entry`() {
        val manual = LocationFieldValue(address = "Corner of Main and 5th")

        val parsed = parseLocationFieldValue(encodeLocationFieldValue(manual))

        assertEquals(manual, parsed)
    }
}
