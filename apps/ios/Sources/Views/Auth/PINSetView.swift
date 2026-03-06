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

    var body: some View {
        let vm = resolvedPINViewModel

        VStack(spacing: 32) {
            Spacer()

            // Header
            VStack(spacing: 12) {
                Image(systemName: vm.phase == .confirm ? "lock.fill" : "lock.open.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.brandPrimary)
                    .accessibilityHidden(true)
                    .animation(.easeInOut, value: vm.phase)

                Text(vm.titleText)
                    .font(.brand(.title2))
                    .fontWeight(.bold)
                    .animation(.easeInOut, value: vm.phase)

                Text(vm.subtitleText)
                    .font(.brand(.subheadline))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
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

            Spacer()
        }
        .padding(.horizontal, 24)
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
