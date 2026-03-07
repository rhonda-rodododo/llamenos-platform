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
        case .oneMinute: return NSLocalizedString("settings_lock1min", comment: "1 minute")
        case .fiveMinutes: return NSLocalizedString("settings_lock5min", comment: "5 minutes")
        case .fifteenMinutes: return NSLocalizedString("settings_lock15min", comment: "15 minutes")
        case .thirtyMinutes: return NSLocalizedString("settings_lock30min", comment: "30 minutes")
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

/// Settings navigation hub. Sub-pages handle Account and Preferences details.
struct SettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var showLogoutConfirmation: Bool = false

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

                // Identity card summary
                identityCardSection

                // Navigation links to sub-pages
                navigationSection

                // Actions section (lock, logout)
                actionsSection

                // Emergency section
                emergencySection

                // App info section
                appInfoSection
            }
            .listStyle(.insetGrouped)
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
            .navigationDestination(for: String.self) { destination in
                switch destination {
                case "account":
                    AccountSettingsView()
                case "preferences":
                    PreferencesSettingsView()
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

    // MARK: - Identity Card Section

    private var identityCardSection: some View {
        Section {
            HStack(spacing: 14) {
                if let npub = appState.cryptoService.npub {
                    GeneratedAvatar(hash: npub, size: 48)
                } else {
                    GeneratedAvatar(hash: "unknown", size: 48)
                }

                VStack(alignment: .leading, spacing: 4) {
                    if let npub = appState.cryptoService.npub {
                        Text(npub.truncatedNpub())
                            .font(.brandMono(.subheadline))
                            .foregroundStyle(Color.brandForeground)
                            .lineLimit(1)
                            .accessibilityIdentifier("settings-npub")
                    }

                    HStack(spacing: 8) {
                        BadgeView(
                            text: appState.userRole.displayName,
                            icon: appState.isAdmin ? "shield.fill" : "person.fill",
                            color: appState.isAdmin ? Color.brandDarkTeal : Color.brandPrimary,
                            style: .subtle
                        )
                        .accessibilityIdentifier("settings-role")

                        if let hubURL = appState.authService.hubURL {
                            Text(hubURL)
                                .font(.brand(.caption2))
                                .foregroundStyle(Color.brandMutedForeground)
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .accessibilityIdentifier("settings-hub-url")
                        }
                    }
                }

                Spacer()

                HStack(spacing: 6) {
                    Circle()
                        .fill(appState.webSocketService.connectionState.color)
                        .frame(width: 8, height: 8)
                    Text(appState.webSocketService.connectionState.displayText)
                        .font(.brand(.caption2))
                        .foregroundStyle(Color.brandMutedForeground)
                }
                .accessibilityIdentifier("settings-connection")
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Navigation Section

    private var navigationSection: some View {
        Section {
            NavigationLink(value: "account") {
                Label {
                    Text(NSLocalizedString("settings_account_title", comment: "Account"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "person.crop.circle")
                        .foregroundStyle(Color.brandPrimary)
                }
            }
            .accessibilityIdentifier("settings-account-link")

            NavigationLink(value: "preferences") {
                Label {
                    Text(NSLocalizedString("settings_preferences_title", comment: "Preferences"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "gearshape")
                        .foregroundStyle(Color.brandPrimary)
                }
            }
            .accessibilityIdentifier("settings-preferences-link")

            if appState.isAdmin {
                NavigationLink(value: "admin") {
                    Label {
                        Text(NSLocalizedString("settings_admin", comment: "Admin Panel"))
                            .foregroundStyle(.primary)
                    } icon: {
                        Image(systemName: "shield.lefthalf.filled")
                            .foregroundStyle(Color.brandDarkTeal)
                    }
                }
                .accessibilityIdentifier("settings-admin-link")
            }

            NavigationLink(value: "help") {
                Label {
                    Text(NSLocalizedString("settings_help", comment: "Help & FAQ"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "questionmark.circle")
                        .foregroundStyle(Color.brandPrimary)
                }
            }
            .accessibilityIdentifier("settings-help")
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
                        .foregroundStyle(Color.brandAccent)
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
                        .foregroundStyle(Color.brandDestructive)
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.brandDestructive)
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

    // MARK: - App Info Section

    private var appInfoSection: some View {
        Section {
            LabeledContent {
                Text(appVersion)
                    .font(.brand(.subheadline))
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
                    .font(.brand(.subheadline))
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

    // MARK: - Helpers

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Settings") {
    SettingsView()
        .environment(AppState())
}
#endif
