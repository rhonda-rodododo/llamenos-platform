import Foundation

// MARK: - PINMode

/// The mode of the PIN pad: setting a new PIN or unlocking with an existing one.
enum PINMode: Equatable {
    /// User is creating a new PIN (enter + confirm).
    case set
    /// User is entering their PIN to unlock.
    case unlock
}

// MARK: - PINPhase

/// Sub-phases within PIN set mode.
enum PINPhase: Equatable {
    /// First entry of new PIN.
    case enter
    /// Confirming the new PIN matches.
    case confirm
}

// MARK: - PINLockout

/// Escalating lockout policy for failed PIN attempts.
/// Attempts 1-4: no lockout. 5-6: 30s. 7-8: 2min. 9: 10min. 10+: wipe all keys.
enum PINLockout {
    /// Compute the lockout duration for the given number of failed attempts.
    /// Returns nil for no lockout, 0 for wipe (terminal).
    static func lockoutDuration(forAttempts attempts: Int) -> TimeInterval? {
        switch attempts {
        case 0...4: return nil
        case 5...6: return 30
        case 7...8: return 120
        case 9: return 600
        default: return 0  // 10+ = wipe
        }
    }

    /// Whether the given attempt count triggers a full key wipe.
    static func shouldWipeKeys(forAttempts attempts: Int) -> Bool {
        return attempts >= 10
    }
}

// MARK: - PINViewModel

/// View model for PIN entry, both for setting a new PIN and unlocking with an existing one.
/// Handles the enter-then-confirm flow for new PINs, PIN validation, escalating lockout,
/// and biometric unlock via Keychain-stored PIN (C5/H7).
@Observable
final class PINViewModel {
    private let authService: AuthService
    private let keychainService: KeychainService
    private let onSuccess: () -> Void

    /// Current mode (set or unlock).
    let mode: PINMode

    /// Current PIN digits entered by the user.
    var pin: String = ""

    /// PIN length (6 or 8 digits).
    private(set) var maxLength: Int

    /// For set mode: the phase within the set flow.
    var phase: PINPhase = .enter

    /// The first PIN entry (during set mode), used for confirmation comparison.
    private var firstEntry: String?

    /// Error message to display.
    var errorMessage: String?

    /// Whether an async operation is in progress (PIN verification).
    var isLoading: Bool = false

    /// Number of failed unlock attempts. Persisted in Keychain (H7).
    private(set) var failedAttempts: Int = 0

    /// Lockout expiry time. Persisted in Keychain (H7).
    private(set) var lockoutUntil: Date = .distantPast

    /// Whether biometric unlock is available and enabled.
    var isBiometricAvailable: Bool {
        mode == .unlock && authService.isBiometricEnabled && BiometricPrompt.isAvailable
    }

    /// Title text for the current PIN entry state.
    var titleText: String {
        switch mode {
        case .set:
            switch phase {
            case .enter:
                return NSLocalizedString("pin_set_title", comment: "Create a PIN")
            case .confirm:
                return NSLocalizedString("pin_confirm_title", comment: "Confirm your PIN")
            }
        case .unlock:
            return NSLocalizedString("pin_unlock_title", comment: "Enter your PIN")
        }
    }

    /// Subtitle text providing additional context.
    var subtitleText: String {
        switch mode {
        case .set:
            switch phase {
            case .enter:
                return NSLocalizedString("pin_set_subtitle", comment: "Choose a 6-8 digit PIN to protect your key")
            case .confirm:
                return NSLocalizedString("pin_confirm_subtitle", comment: "Enter the same PIN again to confirm")
            }
        case .unlock:
            if isLockedOut {
                let remaining = Int(lockoutUntil.timeIntervalSinceNow.rounded(.up))
                return String(
                    format: NSLocalizedString("pin_lockout_remaining", comment: "Locked out. Try again in %d seconds."),
                    max(remaining, 0)
                )
            }
            if failedAttempts > 0 {
                return String(
                    format: NSLocalizedString("pin_unlock_attempts", comment: "%d failed attempts"),
                    failedAttempts
                )
            }
            return NSLocalizedString("pin_unlock_subtitle", comment: "Enter your PIN to unlock")
        }
    }

    /// Whether the user is temporarily locked out due to too many failed attempts.
    var isLockedOut: Bool {
        lockoutUntil > Date()
    }

    init(
        mode: PINMode,
        authService: AuthService,
        keychainService: KeychainService? = nil,
        maxLength: Int = 8,
        onSuccess: @escaping () -> Void
    ) {
        self.mode = mode
        self.authService = authService
        self.keychainService = keychainService ?? authService.keychainService
        self.maxLength = maxLength
        self.onSuccess = onSuccess

        // Restore lockout state from Keychain (H7)
        if mode == .unlock {
            loadLockoutState()
        }
    }

    // MARK: - Lockout State Persistence (H7)

    /// Load lockout state from Keychain on init.
    private func loadLockoutState() {
        failedAttempts = keychainService.getLockoutAttempts()
        lockoutUntil = keychainService.getLockoutUntil()
    }

    /// Persist lockout state to Keychain after a failed attempt.
    private func persistLockoutState() {
        keychainService.setLockoutAttempts(failedAttempts)
        keychainService.setLockoutUntil(lockoutUntil)
    }

    /// Clear lockout state on successful unlock.
    private func clearLockoutState() {
        failedAttempts = 0
        lockoutUntil = .distantPast
        keychainService.clearLockoutState()
    }

    // MARK: - PIN Length

    /// Update the max PIN length. Only valid during set mode, enter phase.
    func updateMaxLength(_ newLength: Int) {
        guard mode == .set, phase == .enter else { return }
        maxLength = newLength
    }

    // MARK: - PIN Completion

    /// Called when the user finishes entering a PIN (all digits entered).
    func onPINComplete(_ enteredPIN: String) {
        errorMessage = nil

        switch mode {
        case .set:
            handleSetPIN(enteredPIN)
        case .unlock:
            handleUnlockPIN(enteredPIN)
        }
    }

    // MARK: - Set PIN Flow

    private func handleSetPIN(_ enteredPIN: String) {
        switch phase {
        case .enter:
            // Validate PIN format
            do {
                try authService.validatePIN(enteredPIN)
            } catch {
                errorMessage = error.localizedDescription
                pin = ""
                return
            }

            // Store first entry and move to confirm phase
            firstEntry = enteredPIN
            pin = ""
            phase = .confirm

        case .confirm:
            guard let firstEntry else {
                errorMessage = NSLocalizedString("error_pin_internal", comment: "Internal error. Please try again.")
                resetToEnter()
                return
            }

            // Check PINs match
            guard enteredPIN == firstEntry else {
                errorMessage = NSLocalizedString("error_pin_mismatch", comment: "PINs do not match. Try again.")
                resetToEnter()
                return
            }

            // PINs match — generate device keys and encrypt with this PIN atomically
            isLoading = true
            do {
                let enableBiometric = BiometricPrompt.isAvailable
                _ = try authService.createNewIdentity(pin: enteredPIN, enableBiometric: enableBiometric)

                isLoading = false
                onSuccess()
            } catch {
                isLoading = false
                errorMessage = error.localizedDescription
                resetToEnter()
            }
        }
    }

    // MARK: - Unlock PIN Flow

    private func handleUnlockPIN(_ enteredPIN: String) {
        guard !isLockedOut else {
            errorMessage = NSLocalizedString("error_pin_locked_out", comment: "Too many attempts. Please wait.")
            return
        }

        isLoading = true
        do {
            try authService.unlockWithPIN(enteredPIN)
            isLoading = false
            clearLockoutState()
            onSuccess()
        } catch {
            isLoading = false
            failedAttempts += 1
            pin = ""

            // Apply escalating lockout (H7)
            handleFailedAttempt()
        }
    }

    /// Apply escalating lockout policy after a failed PIN attempt (H7).
    private func handleFailedAttempt() {
        if PINLockout.shouldWipeKeys(forAttempts: failedAttempts) {
            // Terminal: wipe all keys
            errorMessage = NSLocalizedString(
                "error_pin_wiped",
                comment: "Too many failed attempts. All keys have been wiped for security."
            )
            clearLockoutState()
            authService.logout()
            return
        }

        if let duration = PINLockout.lockoutDuration(forAttempts: failedAttempts) {
            lockoutUntil = Date().addingTimeInterval(duration)
            errorMessage = String(
                format: NSLocalizedString(
                    "error_pin_lockout_duration",
                    comment: "Too many failed attempts. Locked for %d seconds."
                ),
                Int(duration)
            )
        } else {
            errorMessage = NSLocalizedString("error_pin_incorrect", comment: "Incorrect PIN. Please try again.")
        }

        persistLockoutState()
    }

    // MARK: - Biometric Unlock (C5)

    /// Attempt biometric unlock. Retrieves the PIN from biometric-protected Keychain
    /// and uses it to decrypt device keys — no manual PIN entry needed.
    func attemptBiometricUnlock() {
        guard isBiometricAvailable else { return }

        Task { @MainActor in
            do {
                if let pin = try keychainService.retrievePINWithBiometric() {
                    // Use the biometric-retrieved PIN to unlock
                    isLoading = true
                    do {
                        try authService.unlockWithPIN(pin)
                        isLoading = false
                        clearLockoutState()
                        onSuccess()
                    } catch {
                        isLoading = false
                        // Biometric succeeded but PIN failed (key may have been re-encrypted
                        // with a different PIN). Fall back to manual PIN entry.
                        errorMessage = NSLocalizedString(
                            "error_biometric_pin_mismatch",
                            comment: "Biometric unlock failed. Please enter your PIN."
                        )
                    }
                }
                // nil = user cancelled biometric prompt or no stored PIN — fall back to PIN pad
            } catch {
                // Keychain error — fall back to PIN pad silently
                errorMessage = nil
            }
        }
    }

    // MARK: - Reset

    /// Reset to the initial enter phase (after mismatch or error).
    private func resetToEnter() {
        firstEntry = nil
        pin = ""
        phase = .enter
    }

    /// Full reset of the view model.
    func reset() {
        pin = ""
        firstEntry = nil
        phase = .enter
        errorMessage = nil
        isLoading = false
        failedAttempts = 0
        lockoutUntil = .distantPast
    }
}
