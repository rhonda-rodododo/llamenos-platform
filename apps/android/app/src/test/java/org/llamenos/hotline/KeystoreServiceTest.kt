package org.llamenos.hotline

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.crypto.PinLockoutState

class KeystoreServiceTest {

    @Test
    fun `storage key constants are defined correctly`() {
        assertEquals("encrypted-keys", KeystoreService.KEY_ENCRYPTED_KEYS)
        assertEquals("hub-url", KeystoreService.KEY_HUB_URL)
        assertEquals("device-id", KeystoreService.KEY_DEVICE_ID)
        assertEquals("signing-pubkey", KeystoreService.KEY_SIGNING_PUBKEY)
        assertEquals("encryption-pubkey", KeystoreService.KEY_ENCRYPTION_PUBKEY)
        assertEquals("biometric-enabled", KeystoreService.KEY_BIOMETRIC_ENABLED)
    }

    @Test
    fun `lockout key constants are defined correctly`() {
        assertEquals("failed_attempts", KeystoreService.KEY_FAILED_ATTEMPTS)
        assertEquals("lockout_until", KeystoreService.KEY_LOCKOUT_UNTIL)
    }

    @Test
    fun `max attempts is 10`() {
        assertEquals(10, KeystoreService.MAX_ATTEMPTS)
    }

    @Test
    fun `key constants are unique`() {
        val keys = listOf(
            KeystoreService.KEY_ENCRYPTED_KEYS,
            KeystoreService.KEY_HUB_URL,
            KeystoreService.KEY_DEVICE_ID,
            KeystoreService.KEY_SIGNING_PUBKEY,
            KeystoreService.KEY_ENCRYPTION_PUBKEY,
            KeystoreService.KEY_BIOMETRIC_ENABLED,
            KeystoreService.KEY_FAILED_ATTEMPTS,
            KeystoreService.KEY_LOCKOUT_UNTIL,
        )
        val uniqueKeys = keys.toSet()
        assertEquals(
            "All storage keys must be unique",
            keys.size,
            uniqueKeys.size,
        )
    }

    @Test
    fun `key constants do not contain spaces or special characters`() {
        val keys = listOf(
            KeystoreService.KEY_ENCRYPTED_KEYS,
            KeystoreService.KEY_HUB_URL,
            KeystoreService.KEY_DEVICE_ID,
            KeystoreService.KEY_SIGNING_PUBKEY,
            KeystoreService.KEY_ENCRYPTION_PUBKEY,
            KeystoreService.KEY_BIOMETRIC_ENABLED,
            KeystoreService.KEY_FAILED_ATTEMPTS,
            KeystoreService.KEY_LOCKOUT_UNTIL,
        )
        keys.forEach { key ->
            assertTrue(
                "Key '$key' should match pattern [a-z][a-z_-]*",
                key.matches(Regex("[a-z][a-z_-]*")),
            )
        }
    }

    @Test
    fun `PinLockoutState Unlocked contains attempts remaining`() {
        val state = PinLockoutState.Unlocked(attemptsRemaining = 7)
        assertEquals(7, state.attemptsRemaining)
    }

    @Test
    fun `PinLockoutState LockedOut contains until timestamp`() {
        val until = System.currentTimeMillis() + 30_000L
        val state = PinLockoutState.LockedOut(until = until)
        assertEquals(until, state.until)
    }

    @Test
    fun `PinLockoutState Wiped is a singleton`() {
        val state = PinLockoutState.Wiped
        assertTrue(state is PinLockoutState.Wiped)
    }

    @Test
    fun `lockout escalation schedule is correct`() {
        val expectedLockoutMs = mapOf(
            1 to 0L,
            2 to 0L,
            3 to 0L,
            4 to 0L,
            5 to 30_000L,
            6 to 30_000L,
            7 to 120_000L,
            8 to 120_000L,
            9 to 600_000L,
        )

        for ((attempts, expectedMs) in expectedLockoutMs) {
            val lockoutMs = when (attempts) {
                in 1..4 -> 0L
                in 5..6 -> 30_000L
                in 7..8 -> 120_000L
                9 -> 600_000L
                else -> -1L
            }
            assertEquals(
                "Attempt $attempts should have ${expectedMs}ms lockout",
                expectedMs,
                lockoutMs,
            )
        }

        val wipeAttempts = listOf(10, 11, 20, 100)
        for (attempts in wipeAttempts) {
            val lockoutMs = when (attempts) {
                in 1..4 -> 0L
                in 5..6 -> 30_000L
                in 7..8 -> 120_000L
                9 -> 600_000L
                else -> -1L
            }
            assertEquals(
                "Attempt $attempts should trigger wipe (-1)",
                -1L,
                lockoutMs,
            )
        }
    }
}
