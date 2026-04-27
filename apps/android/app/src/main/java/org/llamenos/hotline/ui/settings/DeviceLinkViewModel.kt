package org.llamenos.hotline.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.crypto.CryptoService
import javax.inject.Inject

/**
 * State machine steps for the device linking flow.
 */
enum class DeviceLinkStep {
    /** Camera is active, waiting for QR code scan. */
    SCANNING,
    /** QR scanned, connecting to ephemeral provisioning room. */
    CONNECTING,
    /** SAS verification code displayed for user confirmation. */
    VERIFYING,
    /** Receiving and decrypting provisioning data from the desktop. */
    IMPORTING,
    /** Device link completed successfully. */
    COMPLETE,
    /** An error occurred during the process. */
    ERROR,
}

data class DeviceLinkUiState(
    val step: DeviceLinkStep = DeviceLinkStep.SCANNING,
    val sasCode: String = "",
    val error: String? = null,
    val provisioningRoomId: String? = null,
    val relayUrl: String? = null,
)

/**
 * ViewModel for the device linking flow.
 *
 * Manages the state machine for linking this device to an existing identity
 * on a desktop app via QR code scanning and ephemeral ECDH key exchange.
 *
 * Flow:
 * 1. Scan QR code containing provisioning room ID + relay URL
 * 2. Generate ephemeral keypair and join the provisioning room
 * 3. Derive shared secret via ECDH with the desktop's ephemeral key
 * 4. Display SAS verification code for user to compare
 * 5. Receive encrypted provisioning data, decrypt with shared secret
 * 6. Create device keys linked to the same user identity
 */
@HiltViewModel
class DeviceLinkViewModel @Inject constructor(
    private val cryptoService: CryptoService,
    private val webSocketService: WebSocketService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DeviceLinkUiState())
    val uiState: StateFlow<DeviceLinkUiState> = _uiState.asStateFlow()

    private var ephemeralSecret: String? = null
    private var ephemeralPublic: String? = null
    private var sharedSecret: String? = null

    /**
     * Process a scanned QR code containing provisioning room data.
     *
     * Expected format: "llamenos:provision:<roomId>:<relayUrl>"
     *
     * Validates the relay URL host to reject private/internal network addresses
     * that could be used for SSRF or relay URL injection attacks.
     */
    fun onQRCodeScanned(rawValue: String) {
        val parts = rawValue.split(":")
        if (parts.size < 4 || parts[0] != "llamenos" || parts[1] != "provision") {
            _uiState.update {
                it.copy(
                    step = DeviceLinkStep.ERROR,
                    error = "Invalid QR code format",
                )
            }
            return
        }

        val roomId = parts[2]
        val relayUrl = parts.drop(3).joinToString(":")

        // Extract host from relay URL and validate
        val host = try {
            java.net.URI(relayUrl).host ?: ""
        } catch (_: Exception) {
            ""
        }

        if (host.isEmpty() || !isValidRelayHost(host)) {
            _uiState.update {
                it.copy(
                    step = DeviceLinkStep.ERROR,
                    error = "Invalid relay URL: private or reserved network address",
                )
            }
            return
        }

        _uiState.update {
            it.copy(
                step = DeviceLinkStep.CONNECTING,
                provisioningRoomId = roomId,
                relayUrl = relayUrl,
                error = null,
            )
        }

        connectToProvisioningRoom(roomId, relayUrl)
    }

    /**
     * Validate that a relay host is not a private/internal network address.
     *
     * Rejects:
     * - localhost, 127.0.0.1, ::1 (loopback)
     * - 10.x.x.x (RFC 1918 Class A)
     * - 172.16-31.x.x (RFC 1918 Class B)
     * - 192.168.x.x (RFC 1918 Class C)
     * - 169.254.x.x (link-local)
     * - fe80: (IPv6 link-local)
     *
     * @return true if the host is a valid public relay address
     */
    internal fun isValidRelayHost(host: String): Boolean {
        val lower = host.lowercase()
        if (lower == "localhost" || lower == "127.0.0.1" || lower == "::1") return false
        if (lower == "[::1]") return false

        val blockedPrefixes = listOf("10.", "192.168.", "169.254.", "fe80:") +
            (16..31).map { "172.$it." }
        return blockedPrefixes.none { lower.startsWith(it) }
    }

    /**
     * Connect to the ephemeral provisioning room and initiate ECDH.
     */
    private fun connectToProvisioningRoom(roomId: String, relayUrl: String) {
        viewModelScope.launch {
            try {
                // Generate our ephemeral keypair
                val (secret, public) = cryptoService.generateEphemeralKeypair()
                ephemeralSecret = secret
                ephemeralPublic = public

                // In production, we would:
                // 1. Connect to the relay at relayUrl
                // 2. Subscribe to events in the provisioning room
                // 3. Send our ephemeral public key
                // 4. Wait for the desktop's ephemeral public key
                // 5. Derive shared secret via ECDH

                // Simulate connection delay
                delay(1500)

                // Mock: derive shared secret with a placeholder "desktop" key
                val mockDesktopPublic = ByteArray(32).apply {
                    java.security.SecureRandom().nextBytes(this)
                }.joinToString("") { "%02x".format(it) }

                val derivedSecret = cryptoService.deriveSharedSecret(secret, mockDesktopPublic)
                sharedSecret = derivedSecret

                // Derive SAS code
                val sasCode = cryptoService.deriveSASCode(derivedSecret)

                _uiState.update {
                    it.copy(
                        step = DeviceLinkStep.VERIFYING,
                        sasCode = sasCode,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        step = DeviceLinkStep.ERROR,
                        error = e.message ?: "Failed to connect to provisioning room",
                    )
                }
            }
        }
    }

    /**
     * User has confirmed the SAS code matches. Proceed to import.
     */
    fun confirmSASCode() {
        val secret = sharedSecret ?: run {
            _uiState.update {
                it.copy(
                    step = DeviceLinkStep.ERROR,
                    error = "No shared secret available",
                )
            }
            return
        }

        _uiState.update { it.copy(step = DeviceLinkStep.IMPORTING) }

        viewModelScope.launch {
            try {
                // In production, we would:
                // 1. Send SAS confirmation to the provisioning room
                // 2. Wait for the encrypted nsec from the desktop
                // 3. Decrypt with shared secret
                // 4. Import into CryptoService

                // Simulate import delay
                delay(2000)

                // In production: decrypt provisioning data with shared secret,
                // then create device keys linked to the same user identity.
                // val provision = cryptoService.decryptWithSharedSecret(encryptedData, secret)

                _uiState.update {
                    it.copy(step = DeviceLinkStep.COMPLETE)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        step = DeviceLinkStep.ERROR,
                        error = e.message ?: "Failed to import identity",
                    )
                }
            }
        }
    }

    /**
     * Cancel the device linking process.
     */
    fun cancel() {
        ephemeralSecret = null
        ephemeralPublic = null
        sharedSecret = null
        _uiState.update { DeviceLinkUiState() }
    }

    /**
     * Retry after an error.
     */
    fun retry() {
        ephemeralSecret = null
        ephemeralPublic = null
        sharedSecret = null
        _uiState.update { DeviceLinkUiState() }
    }
}
