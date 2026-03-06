import SwiftUI

// MARK: - ConversationsView

/// Main conversations list view showing all messaging conversations (SMS/WhatsApp/Signal)
/// with channel badges, unread counts, status filtering, and pull-to-refresh.
struct ConversationsView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: ConversationsViewModel?

    var body: some View {
        let vm = resolvedViewModel

        NavigationStack {
            ZStack {
                if vm.isLoading && vm.filteredConversations.isEmpty {
                    loadingState
                } else if let error = vm.errorMessage, vm.filteredConversations.isEmpty {
                    errorState(error, vm: vm)
                } else if vm.filteredConversations.isEmpty {
                    emptyState
                } else {
                    conversationsList(vm: vm)
                }
            }
            .navigationTitle(NSLocalizedString("conversations_title", comment: "Conversations"))
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    statusFilterMenu(vm: vm)
                }
            }
            .refreshable {
                await vm.refresh()
            }
            .task {
                await vm.loadConversations()
                vm.startEventListener()
            }
            .onDisappear {
                vm.stopEventListener()
            }
            .navigationDestination(for: String.self) { conversationId in
                ConversationDetailView(conversationId: conversationId)
            }
        }
    }

    // MARK: - Status Filter Menu

    @ViewBuilder
    private func statusFilterMenu(vm: ConversationsViewModel) -> some View {
        Menu {
            ForEach(ConversationStatusFilter.allCases, id: \.self) { filter in
                Button {
                    vm.statusFilter = filter
                } label: {
                    HStack {
                        Text(filter.displayName)
                        if vm.statusFilter == filter {
                            Image(systemName: "checkmark")
                        }
                    }
                }
                .accessibilityIdentifier("filter-\(filter.rawValue)")
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.body)
        }
        .accessibilityIdentifier("conversations-filter-button")
        .accessibilityLabel(NSLocalizedString("conversations_filter", comment: "Filter conversations"))
    }

    // MARK: - Conversations List

    @ViewBuilder
    private func conversationsList(vm: ConversationsViewModel) -> some View {
        List {
            ForEach(vm.filteredConversations) { conversation in
                NavigationLink(value: conversation.id) {
                    ConversationRowView(conversation: conversation)
                }
                .accessibilityIdentifier("conversation-row-\(conversation.id)")
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("conversations-list")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("conversations_empty_title", comment: "No Conversations"),
                systemImage: "bubble.left.and.bubble.right"
            )
        } description: {
            Text(NSLocalizedString(
                "conversations_empty_message",
                comment: "Incoming messages from SMS, WhatsApp, and Signal will appear here."
            ))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("conversations-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("conversations_loading", comment: "Loading conversations..."))
                .font(.brand(.subheadline))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("conversations-loading")
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorState(_ error: String, vm: ConversationsViewModel) -> some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("conversations_error_title", comment: "Unable to Load"),
                systemImage: "exclamationmark.triangle"
            )
        } description: {
            Text(error)
        } actions: {
            Button {
                Task { await vm.refresh() }
            } label: {
                Text(NSLocalizedString("retry", comment: "Retry"))
            }
            .buttonStyle(.bordered)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("conversations-error")
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: ConversationsViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = ConversationsViewModel(
            apiService: appState.apiService,
            cryptoService: appState.cryptoService,
            webSocketService: appState.webSocketService
        )
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - ConversationRowView

/// A single conversation row in the list, showing channel badge, contact hash,
/// unread count, status, and last message time.
struct ConversationRowView: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 12) {
            // Channel icon
            channelBadge

            // Content
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(conversation.contactDisplayHash)
                        .font(.brandMono(.body))
                        .fontWeight(conversation.unreadCount > 0 ? .semibold : .regular)
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Spacer()

                    Text(conversation.lastMessageRelativeTime)
                        .font(.brand(.footnote))
                        .foregroundStyle(.tertiary)
                }

                HStack {
                    statusBadge

                    Spacer()

                    if conversation.unreadCount > 0 {
                        unreadBadge
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Channel Badge

    private var channelBadge: some View {
        Image(systemName: conversation.channel.iconName)
            .font(.title3)
            .foregroundStyle(channelColor)
            .frame(width: 36, height: 36)
            .background(
                Circle()
                    .fill(channelColor.opacity(0.12))
            )
            .accessibilityLabel(conversation.channel.displayName)
    }

    private var channelColor: Color {
        switch conversation.channel {
        case .sms: return .brandPrimary
        case .whatsapp: return .green
        case .signal: return .brandPrimary
        }
    }

    // MARK: - Status Badge

    private var statusBadge: some View {
        Text(conversation.conversationStatus.displayName)
            .font(.brand(.caption))
            .fontWeight(.medium)
            .foregroundStyle(statusColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                Capsule()
                    .fill(statusColor.opacity(0.12))
            )
    }

    private var statusColor: Color {
        switch conversation.conversationStatus {
        case .active: return .green
        case .waiting: return .orange
        case .closed: return .secondary
        }
    }

    // MARK: - Unread Badge

    private var unreadBadge: some View {
        Text("\(conversation.unreadCount)")
            .font(.brand(.caption))
            .fontWeight(.bold)
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                Capsule()
                    .fill(Color.red)
            )
            .accessibilityLabel(String(format: NSLocalizedString(
                "conversations_unread_count",
                comment: "%d unread messages"
            ), conversation.unreadCount))
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Conversations - Empty") {
    ConversationsView()
        .environment(AppState())
}
#endif
