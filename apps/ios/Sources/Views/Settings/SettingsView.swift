import SwiftUI

// MARK: - AutoLockTimeout

/// Auto-lock timeout options.
enum AutoLockTimeout: Int, CaseIterable, Identifiable {
    case oneMinute = 60
    case fiveMinutes = 300
    case fifteenMinutes = 900
    case thirtyMinutes = 1800

    var id: Int { rawValue }

    var displayName: String {
        switch self {
        case .oneMinute: return NSLocalizedString("settings_lock_1min", comment: "1 minute")
        case .fiveMinutes: return NSLocalizedString("settings_lock_5min", comment: "5 minutes")
        case .fifteenMinutes: return NSLocalizedString("settings_lock_15min", comment: "15 minutes")
        case .thirtyMinutes: return NSLocalizedString("settings_lock_30min", comment: "30 minutes")
        }
    }
}

// MARK: - SupportedLanguage

/// Supported languages for the app, matching the 13 locales in the project.
struct SupportedLanguage: Identifiable, Hashable {
    let id: String  // locale code
    let name: String

    static let all: [SupportedLanguage] = [
        SupportedLanguage(id: "en", name: "English"),
        SupportedLanguage(id: "es", name: "Espanol"),
        SupportedLanguage(id: "zh", name: "Chinese"),
        SupportedLanguage(id: "tl", name: "Tagalog"),
        SupportedLanguage(id: "vi", name: "Tieng Viet"),
        SupportedLanguage(id: "ar", name: "Arabic"),
        SupportedLanguage(id: "fr", name: "Francais"),
        SupportedLanguage(id: "ht", name: "Kreyol Ayisyen"),
        SupportedLanguage(id: "ko", name: "Korean"),
        SupportedLanguage(id: "ru", name: "Russian"),
        SupportedLanguage(id: "hi", name: "Hindi"),
        SupportedLanguage(id: "pt", name: "Portugues"),
        SupportedLanguage(id: "de", name: "Deutsch"),
    ]
}

// MARK: - SettingsView

/// Settings tab showing identity info, hub connection details, device linking,
/// notification preferences, language selection, admin access, lock/logout actions,
/// and app version.
struct SettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var showLogoutConfirmation: Bool = false
    @State private var showCopyConfirmation: Bool = false
    @State private var showDeviceLink: Bool = false
    @State private var selectedAutoLockTimeout: AutoLockTimeout = .fiveMinutes
    @State private var isBiometricEnabled: Bool = false
    @State private var callSoundsEnabled: Bool = true
    @State private var messageAlertsEnabled: Bool = true
    @State private var selectedLanguage: String = "en"

    var body: some View {
        NavigationStack {
            List {
                #if DEBUG
                // Test-only navigation shortcut for elements deep in the list.
                // SwiftUI List cell recycling breaks NavigationLink taps via XCUITest
                // for cells that require scrolling. This provides a reliable tap target.
                if ProcessInfo.processInfo.arguments.contains("--test-authenticated") {
                    Section {
                        NavigationLink(value: "panic-wipe") {
                            Label {
                                Text(NSLocalizedString("settings_panic_wipe", comment: "Emergency Wipe"))
                                    .foregroundStyle(.red)
                            } icon: {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                        .accessibilityIdentifier("test-panic-wipe")
                    }
                }
                #endif

                // Identity section
                identitySection

                // Hub connection section
                hubSection

                // WebSocket connection section
                connectionSection

                // Device linking section
                deviceLinkSection

                // Notification preferences section
                notificationPreferencesSection

                // Language section
                languageSection

                // Security section
                securitySection

                // Admin section (visible only to admins)
                if appState.isAdmin {
                    adminSection
                }

                // Actions section
                actionsSection

                // Emergency section
                emergencySection

                // Help section
                helpSection

                // App info section
                appInfoSection
            }
            .navigationTitle(NSLocalizedString("settings_title", comment: "Settings"))
            .navigationBarTitleDisplayMode(.large)
            .alert(
                NSLocalizedString("logout_confirm_title", comment: "Logout"),
                isPresented: $showLogoutConfirmation
            ) {
                Button(NSLocalizedString("cancel", comment: "Cancel"), role: .cancel) {}
                Button(NSLocalizedString("logout_confirm_action", comment: "Logout"), role: .destructive) {
                    appState.didLogout()
                }
            } message: {
                Text(NSLocalizedString(
                    "logout_confirm_message",
                    comment: "This will remove your identity from this device. Make sure you have backed up your secret key."
                ))
            }
            .sheet(isPresented: $showDeviceLink) {
                DeviceLinkView()
            }
            .overlay(alignment: .bottom) {
                if showCopyConfirmation {
                    copyConfirmationBanner
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .onAppear {
                isBiometricEnabled = appState.authService.isBiometricEnabled
            }
            .navigationDestination(for: String.self) { destination in
                switch destination {
                case "admin":
                    AdminTabView()
                case "help":
                    HelpView()
                case "panic-wipe":
                    PanicWipeConfirmationView()
                case "reports":
                    ReportsView()
                default:
                    EmptyView()
                }
            }
        }
    }

    // MARK: - Identity Section

    private var identitySection: some View {
        Section {
            if let npub = appState.cryptoService.npub {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(truncatedNpub(npub))
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        Button {
                            UIPasteboard.general.string = npub
                            showCopyFeedback()
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption)
                                .foregroundStyle(.tint)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("copy-npub")
                        .accessibilityLabel(NSLocalizedString("settings_copy_npub", comment: "Copy npub"))
                    }
                } label: {
                    Label {
                        Text(NSLocalizedString("settings_npub", comment: "Public Key"))
                    } icon: {
                        Image(systemName: "key.horizontal.fill")
                            .foregroundStyle(.tint)
                    }
                }
                .accessibilityIdentifier("settings-npub")
            }

            if let pubkey = appState.cryptoService.pubkey {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(truncatedPubkey(pubkey))
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        Button {
                            UIPasteboard.general.string = pubkey
                            showCopyFeedback()
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("copy-pubkey")
                    }
                } label: {
                    Label {
                        Text(NSLocalizedString("settings_pubkey", comment: "Hex Pubkey"))
                    } icon: {
                        Image(systemName: "number")
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("settings-pubkey")
            }

            // Role badge
            LabeledContent {
                Text(appState.userRole.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(appState.isAdmin ? .purple : .blue)
            } label: {
                Label {
                    Text(NSLocalizedString("settings_role", comment: "Role"))
                } icon: {
                    Image(systemName: appState.isAdmin ? "shield.fill" : "person.fill")
                        .foregroundStyle(appState.isAdmin ? .purple : .blue)
                }
            }
            .accessibilityIdentifier("settings-role")
        } header: {
            Text(NSLocalizedString("settings_identity_header", comment: "Identity"))
        }
    }

    // MARK: - Hub Section

    private var hubSection: some View {
        Section {
            if let hubURL = appState.authService.hubURL {
                LabeledContent {
                    Text(hubURL)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                } label: {
                    Label {
                        Text(NSLocalizedString("settings_hub_url", comment: "Hub URL"))
                    } icon: {
                        Image(systemName: "link")
                            .foregroundStyle(.blue)
                    }
                }
                .accessibilityIdentifier("settings-hub-url")
            } else {
                LabeledContent {
                    Text(NSLocalizedString("settings_not_configured", comment: "Not configured"))
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                } label: {
                    Label {
                        Text(NSLocalizedString("settings_hub_url", comment: "Hub URL"))
                    } icon: {
                        Image(systemName: "link")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } header: {
            Text(NSLocalizedString("settings_hub_header", comment: "Hub"))
        }
    }

    // MARK: - Connection Section

    private var connectionSection: some View {
        Section {
            LabeledContent {
                HStack(spacing: 6) {
                    Circle()
                        .fill(connectionColor)
                        .frame(width: 8, height: 8)
                    Text(appState.webSocketService.connectionState.displayText)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                }
            } label: {
                Label {
                    Text(NSLocalizedString("settings_connection", comment: "Relay Connection"))
                } icon: {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .foregroundStyle(.purple)
                }
            }
            .accessibilityIdentifier("settings-connection")

            LabeledContent {
                Text("\(appState.webSocketService.eventCount)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            } label: {
                Label {
                    Text(NSLocalizedString("settings_events", comment: "Events Received"))
                } icon: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text(NSLocalizedString("settings_connection_header", comment: "Connection"))
        }
    }

    // MARK: - Device Link Section

    private var deviceLinkSection: some View {
        Section {
            Button {
                showDeviceLink = true
            } label: {
                Label {
                    Text(NSLocalizedString("settings_link_device", comment: "Link Device"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "qrcode.viewfinder")
                        .foregroundStyle(.tint)
                }
            }
            .accessibilityIdentifier("settings-link-device")
        } header: {
            Text(NSLocalizedString("settings_devices_header", comment: "Devices"))
        } footer: {
            Text(NSLocalizedString(
                "settings_link_device_footer",
                comment: "Scan a QR code from your desktop app to securely transfer your identity to this device."
            ))
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
                        .foregroundStyle(.blue)
                }
            }
            .accessibilityIdentifier("settings-call-sounds")

            Toggle(isOn: $messageAlertsEnabled) {
                Label {
                    Text(NSLocalizedString("settings_message_alerts", comment: "Message Alerts"))
                } icon: {
                    Image(systemName: "bell.badge")
                        .foregroundStyle(.orange)
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
                        .foregroundStyle(.tint)
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
                        .foregroundStyle(.orange)
                }
            }
            .accessibilityIdentifier("settings-auto-lock-picker")

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

    // MARK: - Admin Section

    private var adminSection: some View {
        Section {
            NavigationLink(value: "admin") {
                Label {
                    Text(NSLocalizedString("settings_admin", comment: "Admin Panel"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "shield.lefthalf.filled")
                        .foregroundStyle(.purple)
                }
            }
            .accessibilityIdentifier("settings-admin-panel")
        } header: {
            Text(NSLocalizedString("settings_admin_header", comment: "Administration"))
        } footer: {
            Text(NSLocalizedString(
                "settings_admin_footer",
                comment: "Manage volunteers, ban list, audit log, and invites."
            ))
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        Section {
            Button {
                appState.lockApp()
            } label: {
                Label {
                    Text(NSLocalizedString("settings_lock", comment: "Lock App"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(.orange)
                }
            }
            .accessibilityIdentifier("settings-lock-app")

            Button(role: .destructive) {
                showLogoutConfirmation = true
            } label: {
                Label {
                    Text(NSLocalizedString("settings_logout", comment: "Logout"))
                } icon: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(.red)
                }
            }
            .accessibilityIdentifier("settings-logout")
        } header: {
            Text(NSLocalizedString("settings_actions_header", comment: "Actions"))
        }
    }

    // MARK: - Emergency Section

    private var emergencySection: some View {
        Section {
            NavigationLink(value: "panic-wipe") {
                Label {
                    Text(NSLocalizedString("settings_panic_wipe", comment: "Emergency Wipe"))
                        .foregroundStyle(.red)
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
            .accessibilityIdentifier("settings-panic-wipe")
        } footer: {
            Text(NSLocalizedString(
                "settings_emergency_footer",
                comment: "Permanently deletes all data from this device including your identity keys."
            ))
        }
    }

    // MARK: - Help Section

    private var helpSection: some View {
        Section {
            NavigationLink(value: "help") {
                Label {
                    Text(NSLocalizedString("settings_help", comment: "Help & FAQ"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "questionmark.circle")
                        .foregroundStyle(.tint)
                }
            }
            .accessibilityIdentifier("settings-help")
        }
    }

    // MARK: - App Info Section

    private var appInfoSection: some View {
        Section {
            LabeledContent {
                Text(appVersion)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } label: {
                Label {
                    Text(NSLocalizedString("settings_version", comment: "Version"))
                } icon: {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityIdentifier("settings-version")

            LabeledContent {
                Text(buildNumber)
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            } label: {
                Label {
                    Text(NSLocalizedString("settings_build", comment: "Build"))
                } icon: {
                    Image(systemName: "hammer")
                        .foregroundStyle(.tertiary)
                }
            }
        } header: {
            Text(NSLocalizedString("settings_about_header", comment: "About"))
        } footer: {
            Text(NSLocalizedString("settings_footer", comment: "Llamenos - Secure Crisis Response"))
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 8)
        }
    }

    // MARK: - Copy Confirmation

    private var copyConfirmationBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text(NSLocalizedString("copied_to_clipboard", comment: "Copied to clipboard"))
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .shadow(radius: 8)
        )
        .padding(.bottom, 16)
        .accessibilityIdentifier("copy-confirmation")
    }

    // MARK: - Helpers

    private var connectionColor: Color {
        switch appState.webSocketService.connectionState {
        case .connected: return .green
        case .connecting, .reconnecting: return .yellow
        case .disconnected: return .red
        }
    }

    private func truncatedNpub(_ npub: String) -> String {
        guard npub.count > 20 else { return npub }
        return "\(npub.prefix(12))...\(npub.suffix(6))"
    }

    private func truncatedPubkey(_ pubkey: String) -> String {
        guard pubkey.count > 16 else { return pubkey }
        return "\(pubkey.prefix(8))...\(pubkey.suffix(6))"
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    private func showCopyFeedback() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        withAnimation(.easeInOut(duration: 0.3)) {
            showCopyConfirmation = true
        }

        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation(.easeInOut(duration: 0.3)) {
                showCopyConfirmation = false
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Settings") {
    SettingsView()
        .environment(AppState())
}
#endif
