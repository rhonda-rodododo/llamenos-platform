import SwiftUI

/// Main dashboard screen shown after successful authentication. Displays the
/// volunteer's identity, shift status with elapsed timer, connection status indicator,
/// recent notes preview, active calls count, and subscribes to WebSocket events
/// for real-time updates.
struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var viewModel: DashboardViewModel?

    var body: some View {
        let vm = resolvedViewModel

        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Title bar with lock button
                    titleBar

                    // Connection status + Identity
                    headerSection(vm: vm)

                    // Shift status card with timer
                    shiftStatusCard(vm: vm)

                    // Active calls card
                    activeCallsCard(vm: vm)

                    // Recent notes preview
                    recentNotesCard(vm: vm)

                    // Reports quick action
                    reportsQuickAction

                    // Admin-only quick actions
                    if appState.isAdmin {
                        contactsQuickAction
                        blastsQuickAction
                    }

                    // Error message
                    if let error = vm.errorMessage {
                        errorCard(error)
                    }

                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 20)
            }
            .navigationBarHidden(true)
            .refreshable {
                await vm.refresh()
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

    // MARK: - Title Bar

    private var titleBar: some View {
        HStack {
            Text(NSLocalizedString("dashboard_title", comment: "Dashboard"))
                .font(.title2)
                .fontWeight(.bold)
                .accessibilityIdentifier("dashboard-title")

            Spacer()

            Button {
                appState.lockApp()
            } label: {
                Image(systemName: "lock.fill")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("lock-app")
        }
        .padding(.top, 4)
    }

    // MARK: - Header Section

    @ViewBuilder
    private func headerSection(vm: DashboardViewModel) -> some View {
        HStack(spacing: 12) {
            // Identity
            Image(systemName: "person.circle.fill")
                .font(.system(size: 40))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                if let npub = appState.cryptoService.npub {
                    Text(truncatedNpub(npub))
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.primary)
                        .accessibilityIdentifier("dashboard-npub")
                }

                if let hubURL = appState.authService.hubURL {
                    Text(hubURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .accessibilityIdentifier("dashboard-hub-url")
                }
            }

            Spacer()

            // Connection status indicator
            connectionIndicator
        }
        .padding(.top, 8)
    }

    // MARK: - Connection Indicator

    private var connectionIndicator: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(connectionColor)
                .frame(width: 8, height: 8)
                .overlay(
                    Circle()
                        .stroke(connectionColor.opacity(0.3), lineWidth: 3)
                )

            Text(appState.webSocketService.connectionState.displayText)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(Color(.systemGray6))
        )
        .accessibilityIdentifier("connection-status")
    }

    private var connectionColor: Color {
        switch appState.webSocketService.connectionState {
        case .connected: return .green
        case .connecting, .reconnecting: return .yellow
        case .disconnected: return .red
        }
    }

    // MARK: - Shift Status Card

    @ViewBuilder
    private func shiftStatusCard(vm: DashboardViewModel) -> some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "clock.badge.checkmark")
                    .font(.title3)
                    .foregroundStyle(.green)

                Text(NSLocalizedString("dashboard_shift_status", comment: "Shift Status"))
                    .font(.headline)

                Spacer()

                shiftStatusBadge(vm.shiftStatus)
            }

            HStack {
                Circle()
                    .fill(vm.isOnShift ? Color.green : Color.secondary.opacity(0.3))
                    .frame(width: 10, height: 10)

                Text(vm.isOnShift
                    ? NSLocalizedString("dashboard_on_shift", comment: "On Shift")
                    : NSLocalizedString("dashboard_off_shift", comment: "Off Shift")
                )
                .font(.subheadline)
                .foregroundStyle(vm.isOnShift ? .primary : .secondary)
                .accessibilityIdentifier("shift-status-text")

                Spacer()

                // Elapsed timer when on shift
                if vm.isOnShift {
                    Text(vm.elapsedTimeDisplay)
                        .font(.system(.body, design: .monospaced))
                        .fontWeight(.medium)
                        .foregroundStyle(.green)
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("shift-elapsed-timer")
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("shift-status-card")
    }

    // MARK: - Active Calls Card

    @ViewBuilder
    private func activeCallsCard(vm: DashboardViewModel) -> some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "phone.arrow.down.left")
                    .font(.title3)
                    .foregroundStyle(.blue)

                Text(NSLocalizedString("dashboard_active_calls", comment: "Active Calls"))
                    .font(.headline)

                Spacer()

                Text("\(vm.activeCallCount)")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(.blue)
                    .contentTransition(.numericText())
                    .accessibilityIdentifier("active-call-count")
            }

            if vm.activeCallCount == 0 {
                Text(NSLocalizedString("dashboard_no_active_calls", comment: "No active calls"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("active-calls-card")
    }

    // MARK: - Recent Notes Card

    @ViewBuilder
    private func recentNotesCard(vm: DashboardViewModel) -> some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "note.text")
                    .font(.title3)
                    .foregroundStyle(.orange)

                Text(NSLocalizedString("dashboard_recent_notes", comment: "Recent Notes"))
                    .font(.headline)

                Spacer()

                Text("\(vm.recentNoteCount)")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(.orange)
                    .contentTransition(.numericText())
                    .accessibilityIdentifier("recent-note-count")
            }

            if vm.recentNotes.isEmpty {
                if vm.recentNoteCount == 0 {
                    Text(NSLocalizedString("dashboard_no_notes", comment: "No notes yet"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                VStack(spacing: 8) {
                    ForEach(vm.recentNotes) { note in
                        recentNoteRow(note)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("recent-notes-card")
    }

    @ViewBuilder
    private func recentNoteRow(_ note: RecentNotePreview) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(note.preview)
                .font(.caption)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 2) {
                Text(note.createdAt.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                HStack(spacing: 4) {
                    if note.hasCall {
                        Image(systemName: "phone.fill")
                            .font(.caption2)
                            .foregroundStyle(.blue)
                    }
                    if note.hasConversation {
                        Image(systemName: "message.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                    }
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemBackground).opacity(0.6))
        )
        .accessibilityIdentifier("recent-note-\(note.id)")
    }

    // MARK: - Reports Quick Action

    private var reportsQuickAction: some View {
        NavigationLink {
            ReportsView()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "doc.text.fill")
                    .font(.title3)
                    .foregroundStyle(.indigo)

                VStack(alignment: .leading, spacing: 2) {
                    Text(NSLocalizedString("dashboard_reports", comment: "Reports"))
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(NSLocalizedString("dashboard_reports_subtitle", comment: "File or review incident reports"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("dashboard-reports-action")
    }

    // MARK: - Contacts Quick Action

    private var contactsQuickAction: some View {
        NavigationLink {
            ContactsView()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.badge.clock")
                    .font(.title3)
                    .foregroundStyle(.teal)

                VStack(alignment: .leading, spacing: 2) {
                    Text(NSLocalizedString("dashboard_contacts", comment: "Contacts"))
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(NSLocalizedString("dashboard_contacts_subtitle", comment: "View caller interaction history"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("dashboard-contacts-action")
    }

    // MARK: - Blasts Quick Action

    private var blastsQuickAction: some View {
        NavigationLink {
            BlastsView()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "megaphone.fill")
                    .font(.title3)
                    .foregroundStyle(.pink)

                VStack(alignment: .leading, spacing: 2) {
                    Text(NSLocalizedString("dashboard_blasts", comment: "Message Blasts"))
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(NSLocalizedString("dashboard_blasts_subtitle", comment: "Send broadcast messages to subscribers"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("dashboard-blasts-action")
    }

    // MARK: - Error Card

    @ViewBuilder
    private func errorCard(_ error: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(error)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.orange.opacity(0.1))
        )
        .accessibilityIdentifier("dashboard-error")
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
