import SwiftUI

/// Dedicated confirmation screen for the emergency data wipe.
/// Navigated to from SettingsView — uses a full screen for emphasis.
struct PanicWipeConfirmationView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.red)
                    .padding(.top, 40)

                Text(NSLocalizedString("panic_wipe_title", comment: "Emergency Data Wipe"))
                    .font(.brand(.title2))

                Text(NSLocalizedString(
                    "panic_wipe_message",
                    comment: "This will permanently delete ALL data including your identity keys. This cannot be undone. Make sure you have backed up your secret key."
                ))
                .font(.brand(.body))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

                VStack(spacing: 12) {
                    Button(role: .destructive) {
                        performPanicWipe()
                    } label: {
                        Text(NSLocalizedString("panic_wipe_confirm", comment: "Wipe All Data"))
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .accessibilityIdentifier("confirm-panic-wipe")

                    Button(role: .cancel) {
                        dismiss()
                    } label: {
                        Text(NSLocalizedString("cancel", comment: "Cancel"))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("cancel-panic-wipe")
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
            }
            .frame(maxWidth: .infinity)
        }
        .navigationTitle(NSLocalizedString("panic_wipe_title", comment: "Emergency Data Wipe"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func performPanicWipe() {
        // Haptic warning feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.warning)

        // 1. Clear keychain
        appState.keychainService.deleteAll()

        // 2. Lock crypto
        appState.cryptoService.lock()

        // 3. Clear UserDefaults
        if let bundleId = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleId)
        }

        // 4. Disconnect WebSocket
        appState.webSocketService.disconnect()

        // 5. Clear wake key
        appState.wakeKeyService.cleanup()

        // 6. Reset app state
        appState.isLocked = false
        appState.authStatus = .unauthenticated
        appState.userRole = .volunteer
        appState.unreadConversationCount = 0

        // 7. Clear URL cache
        URLCache.shared.removeAllCachedResponses()

        // 8. Clear cookies
        let storage = HTTPCookieStorage.shared
        storage.cookies?.forEach { storage.deleteCookie($0) }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Panic Wipe Confirmation") {
    NavigationStack {
        PanicWipeConfirmationView()
            .environment(AppState())
    }
}
#endif
