package org.llamenos.hotline.api

import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CertificatePinnerTest {

    @Test
    fun `certificate pinner does not contain REPLACE_AFTER_DEPLOYMENT placeholder`() {
        // Ensure old placeholder values from before deployment are gone.
        // If this test fails, ApiService.certificatePinner still has pre-deployment stubs.
        // Replace with real hashes — see docs/security/CERTIFICATE_PINS.md.
        //
        // Uses the public `pins` list rather than toString() to avoid
        // format-dependent parsing across OkHttp versions.
        val hasPlaceholder = ApiService.certificatePinner.pins.any { pin ->
            pin.toString().contains("REPLACE_AFTER_DEPLOYMENT")
        }
        assertFalse(
            hasPlaceholder,
            "CertificatePinner contains REPLACE_AFTER_DEPLOYMENT placeholder — " +
            "replace with real hashes. See docs/security/CERTIFICATE_PINS.md"
        )
    }

    @Test
    fun `certificate pinner has at least two pins for llamenos org`() {
        // Must have leaf + backup pin for *.llamenos.org.
        // Uses the public `pins` list for a reliable count instead of parsing toString().
        val count = ApiService.certificatePinner.pins.size
        assertTrue(
            count >= 2,
            "CertificatePinner must have at least 2 pins for *.llamenos.org " +
            "(leaf + backup CA). Found: $count"
        )
    }
}
