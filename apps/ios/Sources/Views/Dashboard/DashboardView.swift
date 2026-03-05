import SwiftUI

/// Main dashboard screen shown after successful authentication. Uses a native iOS
/// grouped List layout with summary sections, connection status, shift info,
/// activity stats, and quick action navigation links.
struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var viewModel: DashboardViewModel?
    @State private var quickActionDestination: QuickActionDestination?

    var body: some View {
        let vm = resolvedViewModel

        NavigationStack {
            List {
                // Identity & connection section
                identitySection

                // Quick actions (placed early for reachability)
                quickActionsSection

                // Shift status section
                shiftSection(vm: vm)

                // Activity stats section
                activitySection(vm: vm)

                // Recent notes preview
                if !vm.recentNotes.isEmpty {
                    recentNotesSection(vm: vm)
                }

                // Error message
                if let error = vm.errorMessage {
                    Section {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityIdentifier("dashboard-error")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(NSLocalizedString("dashboard_title", comment: "Dashboard"))
            .navigationBarTitleDisplayMode(.large)
            .accessibilityIdentifier("dashboard-title")
            .refreshable {
                await vm.refresh()
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        appState.lockApp()
                    } label: {
                        Image(systemName: "lock.fill")
                    }
                    .accessibilityIdentifier("lock-app")
                }
            }
            .navigationDestination(item: $quickActionDestination) { destination in
                switch destination {
                case .reports:
                    ReportsView()
                case .contacts:
                    ContactsView()
                case .blasts:
                    BlastsView()
                }
            }
            .task {
                await vm.loadDashboard()
                vm.startEventListener()
            }
            .onDisappear {
                vm.stopEventListener()
            }
        }
    }

    // MARK: - Identity Section

    private var identitySection: some View {
        Section {
            if let npub = appState.cryptoService.npub {
                LabeledContent {
                    Text(truncatedNpub(npub))
                        .font(.system(.caption, design: .monospaced))
                        .accessibilityIdentifier("dashboard-npub")
                } label: {
                    Label(
                        NSLocalizedString("dashboard_identity", comment: "Identity"),
                        systemImage: "person.circle.fill"
                    )
                }
            }

            if let hubURL = appState.authService.hubURL {
                LabeledContent {
                    Text(hubURL)
                        .font(.caption)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .accessibilityIdentifier("dashboard-hub-url")
                } label: {
                    Label(
                        NSLocalizedString("dashboard_hub", comment: "Hub"),
                        systemImage: "server.rack"
                    )
                }
            }

            LabeledContent {
                HStack(spacing: 6) {
                    Circle()
                        .fill(connectionColor)
                        .frame(width: 8, height: 8)
                    Text(appState.webSocketService.connectionState.displayText)
                        .font(.caption)
                }
            } label: {
                Label(
                    NSLocalizedString("dashboard_connection", comment: "Connection"),
                    systemImage: "wifi"
                )
            }
            .accessibilityIdentifier("connection-status")
        }
    }

    // MARK: - Shift Section

    @ViewBuilder
    private func shiftSection(vm: DashboardViewModel) -> some View {
        Section(NSLocalizedString("dashboard_shift_status", comment: "Shift")) {
            HStack {
                Label(
                    vm.isOnShift
                        ? NSLocalizedString("dashboard_on_shift", comment: "On Shift")
                        : NSLocalizedString("dashboard_off_shift", comment: "Off Shift"),
                    systemImage: "clock.badge.checkmark"
                )
                .accessibilityIdentifier("shift-status-text")

                Spacer()

                shiftStatusBadge(vm.shiftStatus)

                if vm.isOnShift {
                    Text(vm.elapsedTimeDisplay)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.green)
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("shift-elapsed-timer")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("shift-status-card")
    }

    // MARK: - Activity Section

    @ViewBuilder
    private func activitySection(vm: DashboardViewModel) -> some View {
        Section(NSLocalizedString("dashboard_activity", comment: "Activity")) {
            LabeledContent {
                Text("\(vm.activeCallCount)")
                    .fontWeight(.bold)
                    .foregroundStyle(Color.brandPrimary)
                    .contentTransition(.numericText())
                    .accessibilityIdentifier("active-call-count")
            } label: {
                Label(
                    NSLocalizedString("dashboard_active_calls", comment: "Active Calls"),
                    systemImage: "phone.arrow.down.left"
                )
            }
            .accessibilityIdentifier("active-calls-card")

            LabeledContent {
                Text("\(vm.recentNoteCount)")
                    .fontWeight(.bold)
                    .foregroundStyle(Color.brandAccent)
                    .contentTransition(.numericText())
                    .accessibilityIdentifier("recent-note-count")
            } label: {
                Label(
                    NSLocalizedString("dashboard_recent_notes", comment: "Recent Notes"),
                    systemImage: "note.text"
                )
            }
            .accessibilityIdentifier("recent-notes-card")
        }
    }

    // MARK: - Recent Notes Section

    @ViewBuilder
    private func recentNotesSection(vm: DashboardViewModel) -> some View {
        Section(NSLocalizedString("dashboard_recent_notes", comment: "Recent Notes")) {
            ForEach(vm.recentNotes) { note in
                HStack(alignment: .top, spacing: 10) {
                    Text(note.preview)
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(alignment: .trailing, spacing: 2) {
                        Text(note.createdAt.formatted(date: .omitted, time: .shortened))
                            .font(.footnote)
                            .foregroundStyle(.tertiary)

                        HStack(spacing: 4) {
                            if note.hasCall {
                                Image(systemName: "phone.fill")
                                    .font(.caption2)
                                    .foregroundStyle(Color.brandPrimary)
                            }
                            if note.hasConversation {
                                Image(systemName: "message.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                }
                .accessibilityIdentifier("recent-note-\(note.id)")
            }
        }
    }

    // MARK: - Quick Actions Section

    private var quickActionsSection: some View {
        Section {
            Button {
                quickActionDestination = .reports
            } label: {
                HStack {
                    Label(
                        NSLocalizedString("dashboard_reports", comment: "Reports"),
                        systemImage: "doc.text.fill"
                    )
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .foregroundStyle(.primary)
            .accessibilityIdentifier("dashboard-reports-action")

            if appState.isAdmin {
                Button {
                    quickActionDestination = .contacts
                } label: {
                    HStack {
                        Label(
                            NSLocalizedString("dashboard_contacts", comment: "Contacts"),
                            systemImage: "person.crop.circle.badge.clock"
                        )
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .foregroundStyle(.primary)
                .accessibilityIdentifier("dashboard-contacts-action")

                Button {
                    quickActionDestination = .blasts
                } label: {
                    HStack {
                        Label(
                            NSLocalizedString("dashboard_blasts", comment: "Message Blasts"),
                            systemImage: "megaphone.fill"
                        )
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .foregroundStyle(.primary)
                .accessibilityIdentifier("dashboard-blasts-action")
            }
        }
    }

    // MARK: - Quick Action Destination

    enum QuickActionDestination: Hashable {
        case reports
        case contacts
        case blasts
    }

    // MARK: - Connection Color

    private var connectionColor: Color {
        switch appState.webSocketService.connectionState {
        case .connected: return .green
        case .connecting, .reconnecting: return .yellow
        case .disconnected: return .red
        }
    }

    // MARK: - Shift Status Badge

    @ViewBuilder
    private func shiftStatusBadge(_ status: ShiftStatus) -> some View {
        switch status {
        case .onShift:
            Text(NSLocalizedString("badge_on_shift", comment: "On Shift"))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.green)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.green.opacity(0.15)))
        case .onCall:
            Text(NSLocalizedString("badge_on_call", comment: "On Call"))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.blue)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.blue.opacity(0.15)))
        case .offShift:
            Text(NSLocalizedString("badge_off_shift", comment: "Off Shift"))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color(.systemGray5)))
        case .loading:
            ProgressView()
                .scaleEffect(0.7)
        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.red)
        }
    }

    // MARK: - Helpers

    private func truncatedNpub(_ npub: String) -> String {
        guard npub.count > 20 else { return npub }
        let prefix = npub.prefix(12)
        let suffix = npub.suffix(6)
        return "\(prefix)...\(suffix)"
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: DashboardViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = DashboardViewModel(
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

// MARK: - Preview

#if DEBUG
#Preview("Dashboard - Off Shift") {
    NavigationStack {
        DashboardView()
            .environment(AppState())
            .environment(Router())
    }
}
#endif
