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
        val pinnerStr = ApiService.certificatePinner.toString()
        assertFalse(
            pinnerStr.contains("REPLACE_AFTER_DEPLOYMENT"),
            "CertificatePinner contains REPLACE_AFTER_DEPLOYMENT placeholder — " +
            "replace with real hashes. See docs/security/CERTIFICATE_PINS.md"
        )
    }

    @Test
    fun `certificate pinner has at least two pins for llamenos org`() {
        // Must have leaf + backup pin for *.llamenos.org.
        val pinnerStr = ApiService.certificatePinner.toString()
        val count = pinnerStr.split("sha256/").size - 1
        assertTrue(
            count >= 2,
            "CertificatePinner must have at least 2 pins for *.llamenos.org " +
            "(leaf + backup CA). Found: $count"
        )
    }
}
