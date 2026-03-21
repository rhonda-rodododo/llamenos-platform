import SwiftUI

/// Account settings sub-page: identity, hub URL, connection status, device linking.
struct AccountSettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var showCopyConfirmation: Bool = false
    @State private var showDeviceLink: Bool = false

    var body: some View {
        List {
            // Identity section
            identitySection

            // Hub connection section
            hubSection

            // WebSocket connection section
            connectionSection

            // Device linking section
            deviceLinkSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle(NSLocalizedString("settings_account_title", comment: "Account"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showDeviceLink) {
            DeviceLinkView()
        }
        .overlay(alignment: .bottom) {
            if showCopyConfirmation {
                copyConfirmationBanner
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Identity Section

    private var identitySection: some View {
        Section {
            // Avatar + identity card header
            if let npub = appState.cryptoService.npub {
                HStack(spacing: 14) {
                    GeneratedAvatar(hash: npub, size: 56)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(npub.truncatedNpub())
                            .font(.brandMono(.subheadline))
                            .foregroundStyle(Color.brandForeground)
                            .lineLimit(1)

                        BadgeView(
                            text: appState.userRole.displayName,
                            icon: appState.isAdmin ? "shield.fill" : "person.fill",
                            color: appState.isAdmin ? Color.brandDarkTeal : Color.brandPrimary,
                            style: .subtle
                        )
                    }
                }
                .padding(.vertical, 4)
                .accessibilityIdentifier("settings-role")
            }

            if let npub = appState.cryptoService.npub {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(npub.truncatedNpub())
                            .font(.brandMono(.body))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        Button {
                            UIPasteboard.general.string = npub
                            showCopyFeedback()
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption)
                                .foregroundStyle(Color.brandPrimary)
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
                            .foregroundStyle(Color.brandPrimary)
                    }
                }
                .accessibilityIdentifier("settings-npub")
            }

            if let pubkey = appState.cryptoService.pubkey {
                LabeledContent {
                    HStack(spacing: 8) {
                        Text(pubkey.truncatedPubkey())
                            .font(.brandMono(.caption))
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
                        .font(.brand(.subheadline))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                } label: {
                    Label {
                        Text(NSLocalizedString("settings_hub_url", comment: "Hub URL"))
                    } icon: {
                        Image(systemName: "link")
                            .foregroundStyle(Color.brandPrimary)
                    }
                }
                .accessibilityIdentifier("settings-hub-url")
            } else {
                LabeledContent {
                    Text(NSLocalizedString("settings_not_configured", comment: "Not configured"))
                        .font(.brand(.subheadline))
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
                        .fill(appState.webSocketService.connectionState.color)
                        .frame(width: 8, height: 8)
                    Text(appState.webSocketService.connectionState.displayText)
                        .font(.brand(.subheadline))
                        .foregroundStyle(.primary)
                }
            } label: {
                Label {
                    Text(NSLocalizedString("settings_connection", comment: "Relay Connection"))
                } icon: {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .foregroundStyle(Color.brandDarkTeal)
                }
            }
            .accessibilityIdentifier("settings-connection")

            LabeledContent {
                Text("\(appState.webSocketService.eventCount)")
                    .font(.brand(.subheadline))
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
                        .foregroundStyle(Color.brandPrimary)
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

    // MARK: - Helpers

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

    // MARK: - Copy Confirmation

    private var copyConfirmationBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text(NSLocalizedString("copied_to_clipboard", comment: "Copied to clipboard"))
                .font(.brand(.subheadline))
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
}

// MARK: - Preview

#if DEBUG
#Preview("Account Settings") {
    NavigationStack {
        AccountSettingsView()
            .environment(AppState(hubContext: HubContext()))
    }
}
#endif
