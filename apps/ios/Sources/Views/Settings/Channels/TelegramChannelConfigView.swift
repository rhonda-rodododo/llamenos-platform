import SwiftUI

struct TelegramChannelConfigView: View {
    let service: MessagingConfigService

    @State private var enabled = false
    @State private var botToken = ""
    @State private var botUsername = ""
    @State private var webhookSecret = ""
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Toggle(NSLocalizedString("channels_shared_enable_channel", comment: "Enable Telegram"), isOn: $enabled)
                    .accessibilityIdentifier("telegram-enabled-toggle")
            }

            Section(header: Text(NSLocalizedString("channels_telegram_bot_setup", comment: "Bot Setup"))) {
                SecureField(NSLocalizedString("channels_telegram_bot_token", comment: "Bot Token"), text: $botToken)
                    .accessibilityIdentifier("telegram-bot-token")
                Text(NSLocalizedString("channels_telegram_bot_token_help", comment: ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextField(NSLocalizedString("channels_telegram_bot_username", comment: "Bot Username"), text: $botUsername)
                    .accessibilityIdentifier("telegram-bot-username")

                SecureField(NSLocalizedString("channels_telegram_webhook_secret", comment: "Webhook Secret"), text: $webhookSecret)
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "telegram", disabled: !enabled || botToken.isEmpty) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving || botToken.isEmpty)
            }
        }
        .navigationTitle(NSLocalizedString("channels_telegram_title", comment: "Telegram Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let tg = service.config?.telegram else { return }
        enabled = tg.enabled
        botToken = tg.botToken
        botUsername = tg.botUsername ?? ""
        webhookSecret = tg.webhookSecret ?? ""
        autoResponse = tg.autoResponse ?? ""
        afterHoursResponse = tg.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig(["telegram": [
                "enabled": enabled,
                "botToken": botToken,
                "botUsername": botUsername,
                "webhookSecret": webhookSecret,
                "autoResponse": autoResponse,
                "afterHoursResponse": afterHoursResponse,
            ]])
        } catch {
        }
        saving = false
    }
}
