import SwiftUI

/// PIN unlock screen: user enters their PIN (+ optional biometric) to unlock
/// a stored identity. Shown on app launch when encrypted keys exist, or after
/// background lock timeout.
struct PINUnlockView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var pinViewModel: PINViewModel?
    @State private var hasAttemptedBiometric: Bool = false

    var body: some View {
        let vm = resolvedPINViewModel

        VStack(spacing: 24) {
            Spacer()

            // Header
            VStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.brandPrimary)
                    .accessibilityHidden(true)

                Text(vm.titleText)
                    .font(.title2)
                    .fontWeight(.bold)

                // Show which identity is locked (truncated npub)
                if let npub = appState.cryptoService.npub {
                    Text(truncatedNpub(npub))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("locked-npub")
                }

                Text(vm.subtitleText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            // Error message
            if let error = vm.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
                    .accessibilityIdentifier("pin-error")
            }

            // PIN pad
            PINPadView(
                pin: Binding(
                    get: { vm.pin },
                    set: { vm.pin = $0 }
                ),
                maxLength: vm.maxLength,
                onComplete: { completedPIN in
                    vm.onPINComplete(completedPIN)
                }
            )

            // Biometric button (if available and enabled)
            if vm.isBiometricAvailable {
                BiometricButton {
                    handleBiometricUnlock()
                }
                .padding(.top, 8)
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .loadingOverlay(
            isPresented: vm.isLoading,
            message: NSLocalizedString("pin_unlock_verifying", comment: "Verifying...")
        )
        .navigationBarBackButtonHidden()
        .onAppear {
            attemptBiometricOnAppear()
        }
    }

    // MARK: - Biometric Unlock

    private func handleBiometricUnlock() {
        Task {
            let success = await BiometricPrompt.authenticate()
            if success {
                // After biometric auth succeeds, the Keychain item protected with
                // .biometryCurrentSet becomes accessible. In the current architecture,
                // biometric verifies identity — the actual nsec decryption still
                // requires the PIN. A production enhancement would store the PIN
                // itself behind biometric protection in the Keychain.
                //
                // For now, biometric success is a convenience UX signal.
                // The PIN entry still handles the actual crypto unlock.
            }
        }
    }

    // MARK: - Auto-Biometric on Appear

    private func attemptBiometricOnAppear() {
        guard !hasAttemptedBiometric,
              appState.authService.isBiometricEnabled,
              BiometricPrompt.isAvailable else {
            return
        }
        hasAttemptedBiometric = true
        handleBiometricUnlock()
    }

    // MARK: - Helpers

    /// Truncate npub for display: "npub1abc...xyz"
    private func truncatedNpub(_ npub: String) -> String {
        guard npub.count > 20 else { return npub }
        let prefix = npub.prefix(12)
        let suffix = npub.suffix(6)
        return "\(prefix)...\(suffix)"
    }

    // MARK: - ViewModel Resolution

    private var resolvedPINViewModel: PINViewModel {
        if let vm = pinViewModel {
            return vm
        }
        let vm = PINViewModel(
            mode: .unlock,
            authService: appState.authService,
            maxLength: 4,
            onSuccess: {
                appState.didUnlock()
                // Router will auto-navigate via authStatus change
            }
        )
        DispatchQueue.main.async {
            self.pinViewModel = vm
        }
        return vm
    }
}

// MARK: - Preview

#if DEBUG
#Preview("PIN Unlock View") {
    NavigationStack {
        PINUnlockView()
            .environment(AppState())
            .environment(Router())
    }
}
#endif
