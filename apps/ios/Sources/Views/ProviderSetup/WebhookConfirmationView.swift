import SwiftUI

// MARK: - WebhookConfirmationView

/// Displays the webhook URLs that have been configured for a phone number.
struct WebhookConfirmationView: View {
    let state: WebhookConfigState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            statusSection
            if state.configured {
                urlsSection
            }
            doneSection
        }
        .navigationTitle(NSLocalizedString("webhook_config_title", comment: "Webhooks Configured"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(NSLocalizedString("action_done", comment: "Done")) {
                    dismiss()
                }
            }
        }
        .accessibilityIdentifier("webhook-confirmation-view")
    }

    // MARK: - Sections

    private var statusSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: state.configured ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(state.configured ? Color.green : Color.brandDestructive)

                VStack(alignment: .leading, spacing: 2) {
                    Text(
                        state.configured
                            ? NSLocalizedString("webhook_configured_success", comment: "Webhooks configured successfully")
                            : NSLocalizedString("webhook_configured_partial", comment: "Webhook configuration incomplete")
                    )
                    .font(.brand(.headline))

                    Text(NSLocalizedString("webhook_configured_desc", comment: "Incoming calls and messages will be routed through Llamenos."))
                        .font(.brand(.caption))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var urlsSection: some View {
        if let voiceURL = state.voiceIncoming {
            Section {
                webhookURLRow(
                    label: NSLocalizedString("webhook_voice_url", comment: "Voice Incoming"),
                    url: voiceURL,
                    icon: "phone.fill"
                )
            } header: {
                Text(NSLocalizedString("webhook_voice_header", comment: "Voice"))
            }
        }

        if let smsURL = state.sms {
            Section {
                webhookURLRow(
                    label: NSLocalizedString("webhook_sms_url", comment: "SMS"),
                    url: smsURL,
                    icon: "message.fill"
                )
            } header: {
                Text(NSLocalizedString("webhook_sms_header", comment: "SMS"))
            }
        }

        if let statusURL = state.voiceStatus {
            Section {
                webhookURLRow(
                    label: NSLocalizedString("webhook_status_url", comment: "Status Callback"),
                    url: statusURL,
                    icon: "arrow.triangle.2.circlepath"
                )
            } header: {
                Text(NSLocalizedString("webhook_status_header", comment: "Status"))
            }
        }
    }

    private func webhookURLRow(label: String, url: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(label, systemImage: icon)
                .font(.brand(.caption))
                .foregroundStyle(.secondary)

            HStack {
                Text(url)
                    .font(.brandMono(.caption))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)

                Spacer()

                Button {
                    UIPasteboard.general.string = url
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                        .foregroundStyle(Color.brandPrimary)
                }
                .accessibilityLabel(NSLocalizedString("a11y_copy_to_clipboard", comment: "Copy to clipboard"))
            }
        }
    }

    private var doneSection: some View {
        Section {
            Text(NSLocalizedString("webhook_setup_complete_footer", comment: "Your provider is now configured to route calls and messages through Llamenos. You can view and update these settings at any time in the admin panel."))
                .font(.brand(.footnote))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Webhooks Configured") {
    NavigationStack {
        WebhookConfirmationView(
            state: WebhookConfigState(
                configured: true,
                sms: "https://app.llamenos.org/webhooks/sms",
                voiceIncoming: "https://app.llamenos.org/webhooks/voice",
                voiceStatus: "https://app.llamenos.org/webhooks/voice/status"
            )
        )
    }
}
#endif
