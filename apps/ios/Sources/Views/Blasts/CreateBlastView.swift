import SwiftUI

// MARK: - CreateBlastView

struct CreateBlastView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var viewModel: BlastsViewModel

    @State private var name: String = ""
    @State private var message: String = ""
    @State private var smsEnabled: Bool = true
    @State private var whatsappEnabled: Bool = false
    @State private var signalEnabled: Bool = false
    @State private var showSchedulePicker: Bool = false
    @State private var scheduledDate: Date = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (smsEnabled || whatsappEnabled || signalEnabled)
    }

    private var selectedChannels: [String] {
        var channels: [String] = []
        if smsEnabled { channels.append("sms") }
        if whatsappEnabled { channels.append("whatsapp") }
        if signalEnabled { channels.append("signal") }
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
                        .font(.brand(.body))
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

                    Toggle(
                        NSLocalizedString("blast_channel_signal", comment: "Signal"),
                        isOn: $signalEnabled
                    )
                    .accessibilityIdentifier("blast-channel-signal")
                }

                // Schedule
                if showSchedulePicker {
                    Section(NSLocalizedString("blast_schedule_section", comment: "Schedule")) {
                        DatePicker(
                            NSLocalizedString("blast_schedule_date", comment: "Send at"),
                            selection: $scheduledDate,
                            in: Date()...,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .accessibilityIdentifier("blast-schedule-picker")
                    }
                }

                // Actions
                Section {
                    Button {
                        Task {
                            let success = await viewModel.createBlast(
                                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                                channels: selectedChannels
                            )
                            if success { dismiss() }
                        }
                    } label: {
                        Label(
                            NSLocalizedString("blast_send_now", comment: "Send Now"),
                            systemImage: "paperplane.fill"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(!isFormValid || viewModel.isSending)
                    .accessibilityIdentifier("blast-send-button")

                    Button {
                        showSchedulePicker.toggle()
                    } label: {
                        Label(
                            showSchedulePicker
                                ? NSLocalizedString("blast_hide_schedule", comment: "Hide Schedule")
                                : NSLocalizedString("blast_schedule", comment: "Schedule for Later"),
                            systemImage: "clock.fill"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .accessibilityIdentifier("blast-schedule-button")

                    if showSchedulePicker {
                        Button {
                            Task {
                                let success = await viewModel.createBlast(
                                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                    message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                                    channels: selectedChannels
                                )
                                if success {
                                    // Schedule the created blast
                                    if let blast = viewModel.blasts.first(where: { $0.name == name.trimmingCharacters(in: .whitespacesAndNewlines) }) {
                                        await viewModel.scheduleBlast(id: blast.id, at: scheduledDate)
                                    }
                                    dismiss()
                                }
                            }
                        } label: {
                            Label(
                                NSLocalizedString("blast_confirm_schedule", comment: "Confirm Schedule"),
                                systemImage: "clock.badge.checkmark"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .disabled(!isFormValid || viewModel.isSending)
                        .accessibilityIdentifier("blast-confirm-schedule")
                    }
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
            }
        }
    }
}
