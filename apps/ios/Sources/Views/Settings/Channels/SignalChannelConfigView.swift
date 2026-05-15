import SwiftUI

struct SignalChannelConfigView: View {
    let service: MessagingConfigService

    @State private var bridgeUrl = ""
    @State private var bridgeApiKey = ""
    @State private var webhookSecret = ""
    @State private var registeredNumber = ""
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Text(NSLocalizedString("signal_e2ee_note", comment: "E2EE note"))
                    .font(.caption)
                    .foregroundStyle(.blue)
            }

            Section(header: Text(NSLocalizedString("signal_bridge_setup", comment: "Bridge Setup"))) {
                TextField(NSLocalizedString("signal_bridge_url", comment: "Bridge URL"), text: $bridgeUrl)
                    .autocapitalization(.none)
                    .accessibilityIdentifier("signal-bridge-url")
                SecureField(NSLocalizedString("signal_bridge_api_key", comment: "Bridge API Key"), text: $bridgeApiKey)
                SecureField(NSLocalizedString("signal_webhook_secret", comment: "Webhook Secret"), text: $webhookSecret)
                TextField(NSLocalizedString("signal_registered_number", comment: "Registered Number"), text: $registeredNumber)
                    .accessibilityIdentifier("signal-registered-number")
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "signal", disabled: bridgeUrl.isEmpty) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving || bridgeUrl.isEmpty)
            }
        }
        .navigationTitle(NSLocalizedString("signal_title", comment: "Signal Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let sig = service.config?.signal else { return }
        bridgeUrl = sig.bridgeUrl
        bridgeApiKey = sig.bridgeApiKey
        webhookSecret = sig.webhookSecret
        registeredNumber = sig.registeredNumber
        autoResponse = sig.autoResponse ?? ""
        afterHoursResponse = sig.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig(["signal": [
                "bridgeUrl": bridgeUrl,
                "bridgeApiKey": bridgeApiKey,
                "webhookSecret": webhookSecret,
                "registeredNumber": registeredNumber,
                "autoResponse": autoResponse,
                "afterHoursResponse": afterHoursResponse,
            ]])
        } catch {
        }
        saving = false
    }
}
