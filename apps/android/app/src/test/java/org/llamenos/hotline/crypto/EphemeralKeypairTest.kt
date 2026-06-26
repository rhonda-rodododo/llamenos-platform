package org.llamenos.hotline.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * Unit tests for [EphemeralKeyResult] — the HIGH-A3 refactored ephemeral key type.
 *
 * After the HIGH-A3 security fix, ephemeral secret key material never crosses JNI.
 * [EphemeralKeyResult] only exposes the public key hex. These tests verify that
 * contract holds at the type level.
 */
class EphemeralKeypairTest {

    @Test
    fun `EphemeralKeyResult exposes only publicKeyHex`() {
        val result = EphemeralKeyResult("ab01cd02")
        assertEquals("ab01cd02", result.publicKeyHex)
    }

    @Test
    fun `EphemeralKeyResult has no secret or private key fields`() {
        // EphemeralKeyResult is a data class; its constructor fields define its shape.
        // Java reflection on declared fields confirms only publicKeyHex exists.
        val fields = EphemeralKeyResult::class.java.declaredFields
            .filter { !it.isSynthetic }
            .map { it.name }
        assertEquals(listOf("publicKeyHex"), fields)
        // Ensure no field name suggests secret material leaked to JVM
        fields.forEach { name ->
            assertFalse(
                "Field '$name' suggests secret key material leaked to JVM",
                name.contains("secret", ignoreCase = true) ||
                    name.contains("private", ignoreCase = true),
            )
        }
    }

    @Test
    fun `EphemeralKeyResult is a data class with correct copy semantics`() {
        val original = EphemeralKeyResult("aabbccdd")
        val copy = original.copy(publicKeyHex = "11223344")
        assertEquals("aabbccdd", original.publicKeyHex)
        assertEquals("11223344", copy.publicKeyHex)
    }

    @Test
    fun `EphemeralKeyResult equality is based on publicKeyHex`() {
        val a = EphemeralKeyResult("deadbeef")
        val b = EphemeralKeyResult("deadbeef")
        val c = EphemeralKeyResult("cafebabe")
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        assertFalse(a == c)
    }
}
