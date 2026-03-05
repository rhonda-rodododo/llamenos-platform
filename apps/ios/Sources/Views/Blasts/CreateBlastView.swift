import SwiftUI

// MARK: - CreateBlastView

struct CreateBlastView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var viewModel: BlastsViewModel

    @State private var name: String = ""
    @State private var message: String = ""
    @State private var smsEnabled: Bool = true
    @State private var whatsappEnabled: Bool = false

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (smsEnabled || whatsappEnabled)
    }

    private var selectedChannels: [String] {
        var channels: [String] = []
        if smsEnabled { channels.append("sms") }
        if whatsappEnabled { channels.append("whatsapp") }
        return channels
    }

    var body: some View {
        NavigationStack {
            Form {
                // Name
                Section {
                    TextField(
                        NSLocalizedString("blast_name_placeholder", comment: "Blast name"),
                        text: $name
                    )
                    .accessibilityIdentifier("blast-name-input")
                }

                // Message
                Section(NSLocalizedString("blast_message_section", comment: "Message")) {
                    TextEditor(text: $message)
                        .frame(minHeight: 100)
                        .accessibilityIdentifier("blast-message-input")
                }

                // Channels
                Section(NSLocalizedString("blast_channels_section", comment: "Channels")) {
                    Toggle(
                        NSLocalizedString("blast_channel_sms", comment: "SMS"),
                        isOn: $smsEnabled
                    )
                    .accessibilityIdentifier("blast-channel-sms")

                    Toggle(
                        NSLocalizedString("blast_channel_whatsapp", comment: "WhatsApp"),
                        isOn: $whatsappEnabled
                    )
                    .accessibilityIdentifier("blast-channel-whatsapp")
                }
            }
            .navigationTitle(NSLocalizedString("blast_create_title", comment: "New Blast"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("cancel", comment: "Cancel")) {
                        dismiss()
                    }
                    .accessibilityIdentifier("cancel-blast-create")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("blast_create_button", comment: "Create")) {
                        Task {
                            let success = await viewModel.createBlast(
                                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                                channels: selectedChannels
                            )
                            if success { dismiss() }
                        }
                    }
                    .disabled(!isFormValid || viewModel.isSending)
                    .accessibilityIdentifier("blast-submit-button")
                }
            }
        }
    }
}
