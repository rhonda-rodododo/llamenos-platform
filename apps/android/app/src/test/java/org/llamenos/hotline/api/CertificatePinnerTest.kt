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
    fun `default pin hashes contain at least two entries`() {
        // Must have at least 2 distinct CA pins for backup (RFC 7469 §2.5 recommendation).
        // Pinning is now dynamic: certificatePinner starts as CertificatePinner.DEFAULT and
        // is built per-hostname via buildPinner(). Verify DEFAULT_PIN_HASHES directly.
        val count = ApiService.DEFAULT_PIN_HASHES.size
        assertTrue(
            count >= 2,
            "ApiService.DEFAULT_PIN_HASHES must have at least 2 pins (ISRG Root X1 + X2). Found: $count"
        )
    }

    @Test
    fun `buildPinner returns pinner with default hashes for public hostname`() {
        // Verify buildPinner() applies all DEFAULT_PIN_HASHES to the given hostname.
        val hostname = "app.example.org"
        val pinner = ApiService.buildPinner(hostname)
        val pinCount = pinner.pins.size
        assertTrue(
            pinCount >= 2,
            "buildPinner must produce a pinner with at least 2 pins. Found: $pinCount"
        )
    }
}
