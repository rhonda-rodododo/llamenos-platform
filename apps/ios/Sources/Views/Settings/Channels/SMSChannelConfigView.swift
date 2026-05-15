import SwiftUI

struct SMSChannelConfigView: View {
    let service: MessagingConfigService

    @State private var enabled = false
    @State private var contentMode = "notification-only"
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Toggle(NSLocalizedString("channels_shared_enable_channel", comment: "Enable SMS"), isOn: $enabled)
                    .accessibilityIdentifier("sms-enabled-toggle")
            }

            Section(header: Text(NSLocalizedString("channels_sms_content_mode", comment: "Content Mode"))) {
                Picker(NSLocalizedString("channels_sms_content_mode", comment: "Content Mode"), selection: $contentMode) {
                    Text(NSLocalizedString("channels_sms_content_mode_full", comment: "Full content")).tag("full")
                    Text(NSLocalizedString("channels_sms_content_mode_notification", comment: "Notification only")).tag("notification-only")
                }
                .pickerStyle(.segmented)

                Text(contentMode == "notification-only"
                    ? NSLocalizedString("channels_sms_content_mode_notification_help", comment: "")
                    : NSLocalizedString("channels_sms_content_mode_full_help", comment: ""))
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "sms", disabled: !enabled) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving {
                        ProgressView()
                    } else {
                        Text(NSLocalizedString("common_save", comment: "Save"))
                    }
                }
                .disabled(saving)
            }

            A2pRegistrationView(service: service)
        }
        .navigationTitle(NSLocalizedString("channels_sms_title", comment: "SMS Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let sms = service.config?.sms else { return }
        enabled = sms.enabled
        autoResponse = sms.autoResponse ?? ""
        afterHoursResponse = sms.afterHoursResponse ?? ""
        contentMode = service.config?.smsContentMode ?? "notification-only"
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig([
                "sms": ["enabled": enabled, "autoResponse": autoResponse, "afterHoursResponse": afterHoursResponse],
                "smsContentMode": contentMode,
            ])
        } catch {
        }
        saving = false
    }
}
