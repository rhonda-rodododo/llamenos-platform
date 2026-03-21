import SwiftUI

/// PIN unlock screen: user enters their PIN (+ optional biometric) to unlock
/// a stored identity. Shown on app launch when encrypted keys exist, or after
/// background lock timeout.
struct PINUnlockView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var pinViewModel: PINViewModel?
    @State private var hasAttemptedBiometric: Bool = false
    @State private var shakeOnError = false
    @State private var breatheScale: CGFloat = 1.0
    @State private var biometricPulse: CGFloat = 1.0

    var body: some View {
        let vm = resolvedPINViewModel

        VStack(spacing: 24) {
            Spacer()

            // Header
            VStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.brandPrimary)
                    .scaleEffect(breatheScale)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 3).repeatForever(autoreverses: true)) {
                            breatheScale = 1.03
                        }
                    }
                    .accessibilityHidden(true)

                Text(vm.titleText)
                    .font(.brand(.title2))
                    .fontWeight(.bold)

                // Show which identity is locked (truncated npub)
                if let npub = appState.cryptoService.npub {
                    BrandCard {
                        CopyableField(
                            label: NSLocalizedString("identity_label", comment: "Identity"),
                            value: npub,
                            truncated: true
                        )
                    }
                    .accessibilityIdentifier("locked-npub")
                }

                Text(vm.subtitleText)
                    .font(.brand(.subheadline))
                    .foregroundStyle(.secondary)
            }

            // Error message
            if let error = vm.errorMessage {
                Text(error)
                    .font(.brand(.footnote))
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
                shake: $shakeOnError,
                onComplete: { completedPIN in
                    vm.onPINComplete(completedPIN)
                }
            )

            // Biometric button (if available and enabled)
            if vm.isBiometricAvailable {
                BiometricButton {
                    handleBiometricUnlock()
                }
                .scaleEffect(biometricPulse)
                .onAppear {
                    withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
                        biometricPulse = 1.05
                    }
                }
                .padding(.top, 8)
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .background(
            LinearGradient(
                colors: [Color.brandPrimary.opacity(0.05), Color.clear],
                startPoint: .top,
                endPoint: .center
            )
            .ignoresSafeArea()
        )
        .onChange(of: vm.errorMessage) { _, newValue in
            if newValue != nil {
                shakeOnError = true
            }
        }
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

    // MARK: - ViewModel Resolution

    private var resolvedPINViewModel: PINViewModel {
        if let vm = pinViewModel {
            return vm
        }
        let storedLength = appState.authService.keychainService.getPINLength()
        let vm = PINViewModel(
            mode: .unlock,
            authService: appState.authService,
            maxLength: storedLength,
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
            .environment(AppState(hubContext: HubContext()))
            .environment(Router())
    }
}
#endif
