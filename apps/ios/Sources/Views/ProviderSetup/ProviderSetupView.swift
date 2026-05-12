import SwiftUI

// MARK: - ProviderSetupView

/// Main provider selection and connection flow.
/// Shows a grid of supported providers; tapping one enters the connection sub-flow.
struct ProviderSetupView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: ProviderSetupViewModel
    @State private var phoneNumberVM: PhoneNumberViewModel
    @State private var showPhoneNumbers: Bool = false
    @State private var showWebhookConfirmation: Bool = false
    @State private var webhookState: WebhookConfigState?
    @State private var webhookError: String?

    init(appState: AppState) {
        let service = ProviderSetupService(api: appState.apiService)
        _viewModel = State(initialValue: ProviderSetupViewModel(service: service, hubContext: appState.hubContext))
        _phoneNumberVM = State(initialValue: PhoneNumberViewModel(service: service, hubContext: appState.hubContext))
    }

    var body: some View {
        NavigationStack {
            Group {
                if let selected = viewModel.selectedProvider {
                    providerDetailView(selected)
                } else {
                    providerGridView
                }
            }
            .navigationTitle(NSLocalizedString("provider_setup_title", comment: "Provider Setup"))
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if viewModel.selectedProvider != nil {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            viewModel.selectedProvider = nil
                        } label: {
                            Label(NSLocalizedString("back", comment: "Back"), systemImage: "chevron.left")
                        }
                    }
                }
            }
            .sheet(isPresented: $showPhoneNumbers) {
                if let provider = viewModel.selectedProvider {
                    NavigationStack {
                        PhoneNumberSelectionView(
                            viewModel: phoneNumberVM,
                            provider: provider.id,
                            onSelected: { number in
                                phoneNumberVM.selectedNumber = number
                                showPhoneNumbers = false
                                configureWebhooks(for: provider.id, number: number)
                            }
                        )
                    }
                }
            }
            .sheet(isPresented: $showWebhookConfirmation) {
                if let state = webhookState {
                    NavigationStack {
                        WebhookConfirmationView(state: state)
                    }
                }
            }
            .alert(
                NSLocalizedString("provider_webhook_error_title", comment: "Webhook Configuration Failed"),
                isPresented: Binding(
                    get: { webhookError != nil },
                    set: { if !$0 { webhookError = nil } }
                )
            ) {
                Button(NSLocalizedString("ok", comment: "OK"), role: .cancel) {}
            } message: {
                if let msg = webhookError {
                    Text(msg)
                }
            }
        }
        .accessibilityIdentifier("provider-setup-view")
    }

    // MARK: - Provider Grid

    private var providerGridView: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                ForEach(viewModel.providers) { provider in
                    ProviderCard(provider: provider) {
                        viewModel.selectProvider(provider)
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Provider Detail

    @ViewBuilder
    private func providerDetailView(_ provider: ProviderInfo) -> some View {
        if provider.supportsOAuth {
            OAuthProviderView(viewModel: viewModel, provider: provider) {
                showPhoneNumbers = true
                Task { await phoneNumberVM.loadOwnedNumbers(provider: provider.id) }
            }
        } else {
            APIKeyProviderView(viewModel: viewModel, provider: provider) {
                showPhoneNumbers = true
                Task { await phoneNumberVM.loadOwnedNumbers(provider: provider.id) }
            }
        }
    }

    // MARK: - Webhook configuration

    private func configureWebhooks(for provider: ProviderType, number: OwnedNumber) {
        let service = ProviderSetupService(api: appState.apiService)
        Task {
            do {
                let state = try await service.configureWebhooks(
                    provider: provider,
                    numberId: number.id,
                    enableSms: true,
                    hubId: appState.hubContext.activeHubId
                )
                await MainActor.run {
                    webhookState = state
                    showWebhookConfirmation = true
                }
            } catch {
                await MainActor.run {
                    webhookError = error.localizedDescription
                }
            }
        }
    }
}

// MARK: - ProviderCard

private struct ProviderCard: View {
    let provider: ProviderInfo
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: provider.icon)
                        .font(.title2)
                        .foregroundStyle(Color.brandPrimary)

                    Spacer()
                }

                Text(provider.displayName)
                    .font(.brand(.headline))
                    .foregroundStyle(.primary)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(provider.capabilities.prefix(3), id: \.self) { cap in
                            Text(cap.shortLabel)
                                .font(.brand(.caption2))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.brandPrimary.opacity(0.1))
                                .foregroundStyle(Color.brandPrimary)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("provider-card-\(provider.id.rawValue)")
    }
}

// MARK: - ProviderStatusIndicator

struct ProviderStatusIndicator: View {
    let status: ProviderStatus

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusText)
                .font(.brand(.caption))
                .foregroundStyle(statusColor)
        }
    }

    private var statusColor: Color {
        switch status {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return Color(.systemGray)
        case .error: return Color.brandDestructive
        }
    }

    private var statusText: String {
        switch status {
        case .connected: return NSLocalizedString("provider_status_connected", comment: "Connected")
        case .connecting: return NSLocalizedString("provider_status_connecting", comment: "Connecting")
        case .disconnected: return NSLocalizedString("provider_status_disconnected", comment: "Disconnected")
        case .error: return NSLocalizedString("provider_status_error", comment: "Error")
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Provider Setup") {
    ProviderSetupView(appState: AppState(hubContext: HubContext()))
}
#endif
