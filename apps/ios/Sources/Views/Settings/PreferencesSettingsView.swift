import SwiftUI

/// Preferences settings sub-page: notifications, language, security.
struct PreferencesSettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var isBiometricEnabled: Bool = false

    /// M26: Auto-lock timeout persisted via @AppStorage, shared with LlamenosApp.
    @AppStorage("autoLockTimeout") private var autoLockTimeoutValue: TimeInterval = 300
    @State private var selectedAutoLockTimeout: AutoLockTimeout = .fiveMinutes
    @State private var callSoundsEnabled: Bool = true
    @State private var messageAlertsEnabled: Bool = true
    @State private var selectedLanguage: String = "en"

    var body: some View {
        List {
            // Notification preferences section
            notificationPreferencesSection

            // Language section
            languageSection

            // Security section
            securitySection
        }
        .listStyle(.insetGrouped)
        .navigationTitle(NSLocalizedString("settings_preferences_title", comment: "Preferences"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            isBiometricEnabled = appState.authService.isBiometricEnabled
            // M26: Restore auto-lock timeout from @AppStorage
            if let timeout = AutoLockTimeout(rawValue: Int(autoLockTimeoutValue)) {
                selectedAutoLockTimeout = timeout
            }
        }
    }

    // MARK: - Notification Preferences Section

    private var notificationPreferencesSection: some View {
        Section {
            Toggle(isOn: $callSoundsEnabled) {
                Label {
                    Text(NSLocalizedString("settings_call_sounds", comment: "Call Sounds"))
                } icon: {
                    Image(systemName: "phone.arrow.down.left")
                        .foregroundStyle(Color.brandPrimary)
                }
            }
            .accessibilityIdentifier("settings-call-sounds")

            Toggle(isOn: $messageAlertsEnabled) {
                Label {
                    Text(NSLocalizedString("settings_message_alerts", comment: "Message Alerts"))
                } icon: {
                    Image(systemName: "bell.badge")
                        .foregroundStyle(Color.brandAccent)
                }
            }
            .accessibilityIdentifier("settings-message-alerts")
        } header: {
            Text(NSLocalizedString("settings_notifications_header", comment: "Notifications"))
        }
    }

    // MARK: - Language Section

    private var languageSection: some View {
        Section {
            Picker(selection: $selectedLanguage) {
                ForEach(SupportedLanguage.all) { language in
                    Text(language.name).tag(language.id)
                }
            } label: {
                Label {
                    Text(NSLocalizedString("settings_language", comment: "Language"))
                } icon: {
                    Image(systemName: "globe")
                        .foregroundStyle(Color.brandPrimary)
                }
            }
            .accessibilityIdentifier("settings-language-picker")
        } header: {
            Text(NSLocalizedString("settings_language_header", comment: "Language"))
        }
    }

    // MARK: - Security Section

    private var securitySection: some View {
        Section {
            Picker(selection: $selectedAutoLockTimeout) {
                ForEach(AutoLockTimeout.allCases) { timeout in
                    Text(timeout.displayName).tag(timeout)
                }
            } label: {
                Label {
                    Text(NSLocalizedString("settings_auto_lock", comment: "Auto-Lock Timeout"))
                } icon: {
                    Image(systemName: "timer")
                        .foregroundStyle(Color.brandAccent)
                }
            }
            .accessibilityIdentifier("settings-auto-lock-picker")
            // M26: Persist timeout to @AppStorage so LlamenosApp reads the same value
            .onChange(of: selectedAutoLockTimeout) { _, newValue in
                autoLockTimeoutValue = TimeInterval(newValue.rawValue)
            }

            Toggle(isOn: $isBiometricEnabled) {
                Label {
                    Text(NSLocalizedString("settings_biometric", comment: "Biometric Unlock"))
                } icon: {
                    Image(systemName: "faceid")
                        .foregroundStyle(.green)
                }
            }
            .accessibilityIdentifier("settings-biometric-toggle")
            .onChange(of: isBiometricEnabled) { _, newValue in
                try? appState.authService.setBiometricEnabled(newValue)
            }
        } header: {
            Text(NSLocalizedString("settings_security_header", comment: "Security"))
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Preferences") {
    NavigationStack {
        PreferencesSettingsView()
            .environment(AppState(hubContext: HubContext()))
    }
}
#endif
