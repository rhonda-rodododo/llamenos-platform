import SwiftUI

/// PIN set screen: user creates a new PIN (enter + confirm) using PINPadView.
/// This screen is shown during onboarding after identity creation or import.
/// After successful PIN set and confirmation, the identity is encrypted and
/// persisted to the Keychain via PINViewModel.
struct PINSetView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var pinViewModel: PINViewModel?
    @State private var shakeOnError = false
    @State private var lockRotation: Double = 0

    var body: some View {
        let vm = resolvedPINViewModel

        VStack(spacing: 24) {
            StepIndicator(totalSteps: 3, currentStep: 3)
                .padding(.top, 8)

            // Header
            VStack(spacing: 12) {
                Image(systemName: vm.phase == .confirm ? "lock.fill" : "lock.open.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.brandPrimary)
                    .rotationEffect(.degrees(lockRotation))
                    .accessibilityHidden(true)
                    .animation(.easeInOut, value: vm.phase)

                Text(vm.titleText)
                    .font(.brand(.title2))
                    .fontWeight(.bold)
                    .contentTransition(.opacity)
                    .animation(.easeInOut, value: vm.phase)

                Text(vm.subtitleText)
                    .font(.brand(.subheadline))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .contentTransition(.opacity)
                    .animation(.easeInOut, value: vm.phase)
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

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .onChange(of: vm.phase) { _, newPhase in
            if newPhase == .confirm {
                withAnimation(.spring()) { lockRotation = 360 }
            }
        }
        .onChange(of: vm.errorMessage) { _, newValue in
            if newValue != nil {
                shakeOnError = true
            }
        }
        .loadingOverlay(
            isPresented: vm.isLoading,
            message: NSLocalizedString("pin_set_encrypting", comment: "Encrypting your key...")
        )
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    router.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityIdentifier("back-button")
                .accessibilityLabel(NSLocalizedString("navigation_back", comment: "Back"))
            }
        }
    }

    // MARK: - ViewModel Resolution

    private var resolvedPINViewModel: PINViewModel {
        if let vm = pinViewModel {
            return vm
        }
        let vm = PINViewModel(
            mode: .set,
            authService: appState.authService,
            maxLength: 4,
            onSuccess: {
                appState.didCompleteOnboarding()
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
#Preview("PIN Set View") {
    NavigationStack {
        PINSetView()
            .environment(AppState())
            .environment(Router())
    }
}
#endif
