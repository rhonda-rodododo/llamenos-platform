import SwiftUI

struct ChannelConfigListView: View {
    @Environment(AppState.self) private var appState
    @State private var messagingService: MessagingConfigService?

    var body: some View {
        List {
            if let service = messagingService {
                if service.isLoading {
                    ProgressView()
                } else if let error = service.error {
                    Text(error)
                        .foregroundStyle(.red)
                } else {
                    ForEach(MessagingChannelType.allCases) { channel in
                        NavigationLink(value: channel) {
                            HStack {
                                Image(systemName: channel.iconName)
                                    .frame(width: 24)
                                    .foregroundStyle(.secondary)
                                VStack(alignment: .leading) {
                                    Text(channel.displayName)
                                    Text(channelStatus(channel))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(NSLocalizedString("channels_title", comment: "Messaging Channels"))
        .navigationDestination(for: MessagingChannelType.self) { channel in
            channelConfigView(for: channel)
        }
        .task {
            let service = MessagingConfigService(api: appState.apiService)
            messagingService = service
            await service.loadConfig()
        }
    }

    @ViewBuilder
    private func channelConfigView(for channel: MessagingChannelType) -> some View {
        if let service = messagingService {
            switch channel {
            case .sms:
                SMSChannelConfigView(service: service)
            case .whatsapp:
                WhatsAppChannelConfigView(service: service)
            case .signal:
                SignalChannelConfigView(service: service)
            case .telegram:
                TelegramChannelConfigView(service: service)
            case .rcs:
                RCSChannelConfigView(service: service)
            }
        }
    }

    private func channelStatus(_ channel: MessagingChannelType) -> String {
        guard let config = messagingService?.config else {
            return NSLocalizedString("settings_not_configured", comment: "Not configured")
        }
        let isEnabled = config.enabledChannels.contains(channel.rawValue)
        return isEnabled
            ? NSLocalizedString("common_enabled", comment: "Enabled")
            : NSLocalizedString("common_disabled", comment: "Disabled")
    }
}
