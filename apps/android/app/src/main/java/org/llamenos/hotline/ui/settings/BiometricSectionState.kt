package org.llamenos.hotline.ui.settings

import javax.crypto.Cipher

/**
 * Everything the "Biometric Unlock" section in [SettingsScreen] needs to
 * render, hoisted out into a plain data class so the screen itself stays a
 * pure, defaultable composable (no Hilt ViewModel dependency) — matching the
 * existing [SettingsScreen] convention used by screenshot tests.
 */
data class BiometricSectionState(
    val enrolled: Boolean = false,
    val verifyingPin: Boolean = false,
    val pinError: String? = null,
    val statusMessage: String? = null,
    val enrollCipher: Cipher? = null,
)

/** User-driven events from the "Biometric Unlock" section, bubbled up to the ViewModel. */
sealed interface BiometricSectionEvent {
    /** User submitted their PIN to authorize enrollment. */
    data class SubmitPin(val pin: String) : BiometricSectionEvent

    /** User backed out of the PIN-entry dialog before submitting. */
    data object DismissPinDialog : BiometricSectionEvent

    /** The BiometricPrompt enrollment auth succeeded with this cipher. */
    data class EnrollSucceeded(val cipher: Cipher) : BiometricSectionEvent

    /** The BiometricPrompt enrollment auth was cancelled or failed. */
    data object EnrollCancelled : BiometricSectionEvent

    /** User turned biometric unlock off. */
    data object Disable : BiometricSectionEvent
}
