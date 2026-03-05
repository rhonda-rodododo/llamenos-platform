import SwiftUI

// MARK: - AdminTabView

/// Container view for admin management screens. Provides a list-based navigation
/// menu (replacing the segmented picker) for Volunteers, Ban List, Audit Log,
/// Invites, and Custom Fields.
struct AdminTabView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: AdminViewModel?

    var body: some View {
        let vm = resolvedViewModel

        List {
            NavigationLink {
                VolunteersView(viewModel: vm)
            } label: {
                Label(
                    NSLocalizedString("admin_tab_volunteers", comment: "Volunteers"),
                    systemImage: "person.3.fill"
                )
            }
            .accessibilityIdentifier("admin-volunteers")

            NavigationLink {
                BanListView(viewModel: vm)
            } label: {
                Label(
                    NSLocalizedString("admin_tab_bans", comment: "Ban List"),
                    systemImage: "hand.raised.fill"
                )
            }
            .accessibilityIdentifier("admin-bans")

            NavigationLink {
                AuditLogView(viewModel: vm)
            } label: {
                Label(
                    NSLocalizedString("admin_tab_audit", comment: "Audit Log"),
                    systemImage: "list.clipboard.fill"
                )
            }
            .accessibilityIdentifier("admin-audit-log")

            NavigationLink {
                InviteView(viewModel: vm)
            } label: {
                Label(
                    NSLocalizedString("admin_tab_invites", comment: "Invites"),
                    systemImage: "envelope.open.fill"
                )
            }
            .accessibilityIdentifier("admin-invites")

            NavigationLink {
                CustomFieldsView(viewModel: vm)
            } label: {
                Label(
                    NSLocalizedString("admin_tab_fields", comment: "Custom Fields"),
                    systemImage: "list.bullet.rectangle.fill"
                )
            }
            .accessibilityIdentifier("admin-custom-fields")
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
#Preview("Admin Panel") {
    NavigationStack {
        AdminTabView()
            .environment(AppState())
    }
}
#endif
