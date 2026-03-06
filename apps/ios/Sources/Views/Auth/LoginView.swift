import SwiftUI

// MARK: - LoginView

/// Initial login screen. Provides a hub URL text field and two paths:
/// - "Create New Identity" -> generates a keypair and shows the nsec for backup
/// - "Import Key" -> allows pasting an existing nsec
struct LoginView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var viewModel: AuthViewModel?

    var body: some View {
        let vm = resolvedViewModel

        ScrollView {
            VStack(spacing: 32) {
                // Logo and title
                VStack(spacing: 12) {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.brandPrimary)
                        .accessibilityHidden(true)

                    Text(NSLocalizedString("app_name", comment: "Llamenos"))
                        .font(.brand(.largeTitle))
                        .fontWeight(.bold)

                    Text(NSLocalizedString("login_subtitle", comment: "Secure crisis response hotline"))
                        .font(.brand(.subheadline))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)

                // Hub URL field
                VStack(alignment: .leading, spacing: 8) {
                    Text(NSLocalizedString("login_hub_url_label", comment: "Hub URL"))
                        .font(.brand(.caption))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    TextField(
                        NSLocalizedString("login_hub_url_placeholder", comment: "https://hub.example.org"),
                        text: Binding(
                            get: { vm.hubURL },
                            set: { vm.hubURL = $0 }
                        )
                    )
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityIdentifier("hub-url-input")
                }

                // Error message
                if let error = vm.errorMessage {
                    Text(error)
                        .font(.brand(.footnote))
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("login-error")
                }

                // Action buttons
                VStack(spacing: 16) {
                    Button {
                        vm.createNewIdentity()
                        if case .showingNsec(let nsec, let npub) = vm.currentStep {
                            router.showOnboarding(nsec: nsec, npub: npub)
                        }
                    } label: {
                        Text(NSLocalizedString("login_create_identity", comment: "Create New Identity"))
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("create-identity")

                    Button {
                        vm.startImport()
                        router.showImportKey()
                    } label: {
                        Text(NSLocalizedString("login_import_key", comment: "Import Existing Key"))
                            .fontWeight(.medium)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("import-key")
                }

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 24)
        }
        .navigationBarBackButtonHidden()
    }

    // MARK: - ViewModel Resolution

    /// Lazily creates the AuthViewModel using the AppState services.
    private var resolvedViewModel: AuthViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = AuthViewModel(authService: appState.authService, apiService: appState.apiService)
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - ImportKeyView

/// Nsec import screen. User pastes their existing nsec key.
/// Self-contained — creates its own AuthViewModel from the environment.
struct ImportKeyView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var viewModel: AuthViewModel?

    var body: some View {
        let vm = resolvedViewModel

        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 12) {
                    Image(systemName: "key.horizontal.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(Color.brandPrimary)
                        .accessibilityHidden(true)

                    Text(NSLocalizedString("import_title", comment: "Import Your Key"))
                        .font(.brand(.title2))
                        .fontWeight(.bold)

                    Text(NSLocalizedString("import_subtitle", comment: "Paste your nsec key to restore your identity"))
                        .font(.brand(.subheadline))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 20)

                // Nsec input
                VStack(alignment: .leading, spacing: 8) {
                    Text(NSLocalizedString("import_nsec_label", comment: "Secret Key (nsec)"))
                        .font(.brand(.caption))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    SecureField(
                        NSLocalizedString("import_nsec_placeholder", comment: "nsec1..."),
                        text: Binding(
                            get: { vm.nsecInput },
                            set: { vm.nsecInput = $0 }
                        )
                    )
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.brandMono(.body))
                    .accessibilityIdentifier("nsec-input")
                }

                // Error message
                if let error = vm.errorMessage {
                    Text(error)
                        .font(.brand(.footnote))
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("import-error")
                }

                // Security note
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundStyle(.green)
                        .font(.title3)

                    Text(NSLocalizedString(
                        "import_security_note",
                        comment: "Your key is encrypted with your PIN and stored in the iOS Keychain. It never leaves this device."
                    ))
                    .font(.brand(.footnote))
                    .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.green.opacity(0.1))
                )

                // Submit button
                Button {
                    vm.submitImport()
                    if vm.currentStep == .settingPIN {
                        router.showPINSet()
                    }
                } label: {
                    Text(NSLocalizedString("import_submit", comment: "Import Key"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.nsecInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("submit-import")

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 24)
        }
        .navigationTitle(NSLocalizedString("import_nav_title", comment: "Import Key"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(NSLocalizedString("cancel", comment: "Cancel")) {
                    vm.cancelImport()
                    router.goBack()
                }
                .accessibilityIdentifier("cancel-import")
            }
        }
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: AuthViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = AuthViewModel(authService: appState.authService, apiService: appState.apiService)
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Login") {
    NavigationStack {
        LoginView()
            .environment(AppState())
            .environment(Router())
    }
}
#endif
