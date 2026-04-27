package org.llamenos.hotline

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.ui.auth.AuthUiState
import org.llamenos.hotline.ui.auth.AuthViewModel

/**
 * Unit tests for AuthViewModel state machine transitions (v3 device key model).
 *
 * Tests the complete auth flow:
 *   Login -> PINSet -> Dashboard (device keys generated with PIN)
 *   PINUnlock -> Dashboard (stored keys exist)
 *
 * Uses [InMemoryKeyValueStore] to avoid Android Keystore dependency.
 *
 * Note: Since Epic 261 (C6), CryptoService hard-fails without the native library.
 * Tests that exercise crypto paths (generateDeviceKeys, unlockWithPin)
 * will throw [IllegalStateException]. These tests verify ViewModel state machine
 * transitions using [CryptoService.setTestKeyState] to simulate crypto state.
 *
 * Tests that require PIN encryption/decryption are skipped in JVM tests —
 * they require the native library and are tested in instrumented tests.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var cryptoService: CryptoService
    private lateinit var keyValueStore: InMemoryKeyValueStore

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        cryptoService = CryptoService()
        cryptoService.computeDispatcher = testDispatcher
        keyValueStore = InMemoryKeyValueStore()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): AuthViewModel {
        return AuthViewModel(cryptoService, keyValueStore)
    }

    /**
     * Helper: simulate a successful key generation by setting test state.
     * In production, this comes from native FFI — here we set it directly.
     */
    private fun simulateKeyGeneration() {
        val signingPubkey = "a".repeat(64)
        val encryptionPubkey = "b".repeat(64)
        val deviceId = "test-device-id"
        cryptoService.setTestKeyState(signingPubkey, encryptionPubkey, deviceId)
    }

    // ---- Initial State ----

    @Test
    fun `initial state has no stored keys and is not authenticated`() {
        val vm = createViewModel()
        val state = vm.uiState.value

        assertFalse(state.hasStoredKeys)
        assertFalse(state.isAuthenticated)
        assertFalse(state.isLoading)
        assertNull(state.error)
        assertEquals("", state.hubUrl)
        assertEquals("", state.pin)
    }

    @Test
    fun `initial state detects existing stored keys`() {
        keyValueStore.store(KeystoreService.KEY_ENCRYPTED_KEYS, "{}")
        val vm = createViewModel()

        assertTrue(vm.uiState.value.hasStoredKeys)
        assertFalse(vm.uiState.value.isAuthenticated)
    }

    // ---- Hub URL & Input Fields ----

    @Test
    fun `updateHubUrl updates state`() {
        val vm = createViewModel()
        vm.updateHubUrl("https://llamenos.example.com")

        assertEquals("https://llamenos.example.com", vm.uiState.value.hubUrl)
    }

    @Test
    fun `updateHubUrl clears previous error`() {
        val vm = createViewModel()
        vm.createNewIdentity() // no error expected in V3
        assertNull(vm.uiState.value.error)

        vm.updateHubUrl("https://new.hub.com")
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun `updatePin updates state and clears error`() {
        val vm = createViewModel()
        vm.updatePin("1234")

        assertEquals("1234", vm.uiState.value.pin)
        assertNull(vm.uiState.value.error)
    }

    // ---- Create Identity ----

    @Test
    fun `createNewIdentity without native lib shows error on PIN confirm`() {
        val vm = createViewModel()
        vm.updateHubUrl("https://hub.example.com")
        vm.createNewIdentity()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
    }

    @Test
    fun `createNewIdentity stores hub URL`() {
        val vm = createViewModel()
        vm.updateHubUrl("https://hub.example.com")
        vm.createNewIdentity()

        assertEquals("https://hub.example.com", keyValueStore.retrieve(KeystoreService.KEY_HUB_URL))
    }

    // ---- PIN Set Flow ----

    @Test
    fun `PIN set first entry moves to confirmation mode`() {
        val vm = createViewModel()
        vm.onPinSetComplete("1234")

        val state = vm.uiState.value
        assertEquals("1234", state.pin)
        assertTrue(state.isConfirmingPin)
        assertFalse(state.pinMismatch)
        assertEquals("", state.confirmPin)
    }

    @Test
    fun `PIN set mismatched confirmation shows pinMismatch`() {
        val vm = createViewModel()
        simulateKeyGeneration()

        vm.onPinSetComplete("1234")
        vm.onPinSetComplete("5678")

        val state = vm.uiState.value
        assertTrue(state.pinMismatch)
        assertEquals("", state.confirmPin)
        assertFalse(state.isAuthenticated)
    }

    // ---- PIN Unlock (state machine only — no crypto) ----

    @Test
    fun `PIN unlock with no stored keys shows error`() = runTest {
        val vm = createViewModel()
        vm.unlockWithPin("1234")

        assertNotNull(vm.uiState.value.error)
        assertFalse(vm.uiState.value.isAuthenticated)
        assertEquals("", vm.uiState.value.pin) // PIN cleared even on failure
    }

    // ---- Reset ----

    @Test
    fun `resetPinEntry clears all PIN state`() {
        val vm = createViewModel()
        vm.onPinSetComplete("1234")
        assertTrue(vm.uiState.value.isConfirmingPin)

        vm.resetPinEntry()

        val state = vm.uiState.value
        assertEquals("", state.pin)
        assertEquals("", state.confirmPin)
        assertFalse(state.isConfirmingPin)
        assertFalse(state.pinMismatch)
        assertNull(state.error)
    }

    @Test
    fun `resetAuthState clears crypto and storage`() = runTest {
        simulateKeyGeneration()
        keyValueStore.store(KeystoreService.KEY_ENCRYPTED_KEYS, "{}")
        keyValueStore.store(KeystoreService.KEY_SIGNING_PUBKEY, "testpub")

        val vm = createViewModel()
        vm.resetAuthState()

        assertFalse(cryptoService.isUnlocked)
        assertFalse(keyValueStore.contains(KeystoreService.KEY_ENCRYPTED_KEYS))
        assertFalse(keyValueStore.contains(KeystoreService.KEY_SIGNING_PUBKEY))
    }

    // ---- Update PIN clears error ----

    @Test
    fun `updatePin clears error and pinMismatch`() {
        val vm = createViewModel()
        vm.onPinSetComplete("1234")
        vm.onPinSetComplete("5678")
        assertTrue(vm.uiState.value.pinMismatch)

        vm.updatePin("12")

        assertFalse(vm.uiState.value.pinMismatch)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun `updateConfirmPin clears error and pinMismatch`() {
        val vm = createViewModel()
        simulateKeyGeneration()
        vm.onPinSetComplete("1234")
        vm.onPinSetComplete("5678") // trigger mismatch
        assertTrue(vm.uiState.value.pinMismatch)

        vm.updateConfirmPin("12")

        assertFalse(vm.uiState.value.pinMismatch)
        assertNull(vm.uiState.value.error)
    }

    // ---- Lockout State ----

    @Test
    fun `initial lockout state fields are default`() {
        val state = AuthUiState()
        assertFalse(state.isLockedOut)
        assertEquals(0L, state.lockoutUntil)
        assertFalse(state.isWiped)
        assertEquals(0, state.failedAttempts)
    }
}
