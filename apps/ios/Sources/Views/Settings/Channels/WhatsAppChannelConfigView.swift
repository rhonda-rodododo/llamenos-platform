import SwiftUI

struct WhatsAppChannelConfigView: View {
    let service: MessagingConfigService

    @State private var integrationMode = "twilio"
    @State private var phoneNumberId = ""
    @State private var businessAccountId = ""
    @State private var accessToken = ""
    @State private var verifyToken = ""
    @State private var appSecret = ""
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section(header: Text(NSLocalizedString("channels_whatsapp_integration_mode", comment: "Integration Mode"))) {
                Picker(NSLocalizedString("channels_whatsapp_integration_mode", comment: "Mode"), selection: $integrationMode) {
                    Text(NSLocalizedString("channels_whatsapp_mode_twilio", comment: "Via Twilio")).tag("twilio")
                    Text(NSLocalizedString("channels_whatsapp_mode_direct", comment: "Direct Meta API")).tag("direct")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("whatsapp-integration-mode")
            }

            if integrationMode == "direct" {
                Section(header: Text(NSLocalizedString("channels_whatsapp_direct_credentials", comment: "Meta API Credentials"))) {
                    TextField(NSLocalizedString("channels_whatsapp_phone_number_id", comment: "Phone Number ID"), text: $phoneNumberId)
                        .accessibilityIdentifier("whatsapp-phone-number-id")
                    TextField(NSLocalizedString("channels_whatsapp_business_account_id", comment: "Business Account ID"), text: $businessAccountId)
                    SecureField(NSLocalizedString("channels_whatsapp_access_token", comment: "Access Token"), text: $accessToken)
                    TextField(NSLocalizedString("channels_whatsapp_verify_token", comment: "Verify Token"), text: $verifyToken)
                    SecureField(NSLocalizedString("channels_whatsapp_app_secret", comment: "App Secret"), text: $appSecret)
                }
            } else {
                Section {
                    Text(NSLocalizedString("channels_whatsapp_twilio_note", comment: ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "whatsapp", disabled: false) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving)
            }
        }
        .navigationTitle(NSLocalizedString("channels_whatsapp_title", comment: "WhatsApp Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let wa = service.config?.whatsapp else { return }
        integrationMode = wa.integrationMode
        phoneNumberId = wa.phoneNumberId ?? ""
        businessAccountId = wa.businessAccountId ?? ""
        accessToken = wa.accessToken ?? ""
        verifyToken = wa.verifyToken ?? ""
        appSecret = wa.appSecret ?? ""
        autoResponse = wa.autoResponse ?? ""
        afterHoursResponse = wa.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        var updates: [String: Any] = [
            "integrationMode": integrationMode,
            "autoResponse": autoResponse,
            "afterHoursResponse": afterHoursResponse,
        ]
        if integrationMode == "direct" {
            updates["phoneNumberId"] = phoneNumberId
            updates["businessAccountId"] = businessAccountId
            updates["accessToken"] = accessToken
            updates["verifyToken"] = verifyToken
            updates["appSecret"] = appSecret
        }
        do {
            try await service.updateConfig(["whatsapp": updates])
        } catch {
        }
        saving = false
    }
}
