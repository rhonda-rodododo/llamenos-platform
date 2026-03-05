import SwiftUI

// MARK: - AdminTabView

/// Container view for admin management screens. Provides a segmented picker
/// for switching between Volunteers, Ban List, Audit Log, and Invites.
struct AdminTabView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: AdminViewModel?
    @State private var selectedTab: AdminTab = .volunteers

    var body: some View {
        let vm = resolvedViewModel

        VStack(spacing: 0) {
            // Segmented tab picker
            Picker(
                NSLocalizedString("admin_section", comment: "Admin Section"),
                selection: $selectedTab
            ) {
                ForEach(AdminTab.allCases, id: \.self) { tab in
                    Label(tab.title, systemImage: tab.icon)
                        .tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .accessibilityIdentifier("admin-tab-picker")

            // Tab content
            ZStack {
                switch selectedTab {
                case .volunteers:
                    VolunteersView(viewModel: vm)
                case .bans:
                    BanListView(viewModel: vm)
                case .auditLog:
                    AuditLogView(viewModel: vm)
                case .invites:
                    InviteView(viewModel: vm)
                case .customFields:
                    CustomFieldsView(viewModel: vm)
                }
            }
        }
        .navigationTitle(NSLocalizedString("admin_title", comment: "Admin"))
        .navigationBarTitleDisplayMode(.large)
        .alert(
            NSLocalizedString("admin_delete_confirm_title", comment: "Confirm Deletion"),
            isPresented: Binding(
                get: { vm.showDeleteConfirmation },
                set: { vm.showDeleteConfirmation = $0 }
            )
        ) {
            Button(NSLocalizedString("cancel", comment: "Cancel"), role: .cancel) {
                vm.cancelDelete()
            }
            Button(NSLocalizedString("delete", comment: "Delete"), role: .destructive) {
                Task { await vm.executeDelete() }
            }
        } message: {
            Text(NSLocalizedString(
                "admin_delete_confirm_message",
                comment: "Are you sure you want to delete this item? This action cannot be undone."
            ))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("admin-tab-view")
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: AdminViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = AdminViewModel(
            apiService: appState.apiService,
            cryptoService: appState.cryptoService
        )
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Admin Tab View") {
    NavigationStack {
        AdminTabView()
            .environment(AppState())
    }
}
#endif
