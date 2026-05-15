import SwiftUI

struct RCSChannelConfigView: View {
    let service: MessagingConfigService

    @State private var agentId = ""
    @State private var serviceAccountKey = ""
    @State private var webhookSecret = ""
    @State private var fallbackToSms = true
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section(header: Text(NSLocalizedString("rcs_agent_setup", comment: "Agent Setup"))) {
                TextField(NSLocalizedString("rcs_agent_id", comment: "Agent ID"), text: $agentId)
                    .autocapitalization(.none)
                    .accessibilityIdentifier("rcs-agent-id")

                VStack(alignment: .leading, spacing: 4) {
                    Text(NSLocalizedString("rcs_service_account_key", comment: "Service Account Key (JSON)"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $serviceAccountKey)
                        .font(.system(.caption, design: .monospaced))
                        .frame(minHeight: 80)
                        .accessibilityIdentifier("rcs-service-key")
                }

                SecureField(NSLocalizedString("rcs_webhook_secret", comment: "Webhook Secret"), text: $webhookSecret)
            }

            Section {
                Toggle(NSLocalizedString("rcs_fallback_to_sms", comment: "Fallback to SMS"), isOn: $fallbackToSms)
                Text(NSLocalizedString("rcs_fallback_to_sms_desc", comment: ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "rcs", disabled: agentId.isEmpty) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving || agentId.isEmpty)
            }
        }
        .navigationTitle(NSLocalizedString("rcs_title", comment: "RCS Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let rcs = service.config?.rcs else { return }
        agentId = rcs.agentId
        serviceAccountKey = rcs.serviceAccountKey
        webhookSecret = rcs.webhookSecret ?? ""
        fallbackToSms = rcs.fallbackToSms
        autoResponse = rcs.autoResponse ?? ""
        afterHoursResponse = rcs.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig(["rcs": [
                "agentId": agentId,
                "serviceAccountKey": serviceAccountKey,
                "webhookSecret": webhookSecret,
                "fallbackToSms": fallbackToSms,
                "autoResponse": autoResponse,
                "afterHoursResponse": afterHoursResponse,
            ]])
        } catch {
        }
        saving = false
    }
}
