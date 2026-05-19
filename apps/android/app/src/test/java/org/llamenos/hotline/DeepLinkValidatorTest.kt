package org.llamenos.hotline

import android.net.Uri
import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DeepLinkValidatorTest {

    @Test
    fun `oauth callback is in allowlist`() {
        assertTrue(DeepLinkValidator.isAllowed(Uri.parse("llamenos://oauth/callback?state=abc&status=success")))
    }

    @Test
    fun `unknown host is rejected`() {
        assertFalse(DeepLinkValidator.isAllowed(Uri.parse("llamenos://malicious/steal")))
    }

    @Test
    fun `call deep link is in allowlist`() {
        assertTrue(DeepLinkValidator.isAllowed(Uri.parse("llamenos://call/answer?callId=xyz")))
    }

    @Test
    fun `hub deep link is in allowlist`() {
        assertTrue(DeepLinkValidator.isAllowed(Uri.parse("llamenos://hub/switch?hubId=hub-001")))
    }

    @Test
    fun `http scheme is rejected`() {
        assertFalse(DeepLinkValidator.isAllowed(Uri.parse("http://llamenos.org/oauth/callback")))
    }

    @Test
    fun `null URI is rejected`() {
        assertFalse(DeepLinkValidator.isAllowed(null))
    }

    @Test
    fun `hub requires confirmation`() {
        assertTrue(DeepLinkValidator.requiresConfirmation(Uri.parse("llamenos://hub/switch?hubId=hub-001")))
    }

    @Test
    fun `oauth does not require confirmation`() {
        assertFalse(DeepLinkValidator.requiresConfirmation(Uri.parse("llamenos://oauth/callback")))
    }

    @Test
    fun `call does not require confirmation`() {
        assertFalse(DeepLinkValidator.requiresConfirmation(Uri.parse("llamenos://call/answer")))
    }
}
