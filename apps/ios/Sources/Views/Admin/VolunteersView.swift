import SwiftUI

// MARK: - VolunteersView

/// Admin view for managing volunteers. Shows a searchable list of all members
/// with role badges and allows role updates.
struct VolunteersView: View {
    @Bindable var viewModel: AdminViewModel

    var body: some View {
        ZStack {
            if viewModel.isLoadingVolunteers && viewModel.volunteers.isEmpty {
                loadingState
            } else if viewModel.filteredVolunteers.isEmpty {
                emptyState
            } else {
                volunteersList
            }
        }
        .searchable(
            text: $viewModel.volunteerSearchText,
            placement: .navigationBarDrawer(displayMode: .automatic),
            prompt: NSLocalizedString("admin_search_volunteers", comment: "Search volunteers...")
        )
        .refreshable {
            viewModel.isLoadingVolunteers = false
            await viewModel.loadVolunteers()
        }
        .task {
            await viewModel.loadVolunteers()
        }
    }

    // MARK: - Volunteers List

    private var volunteersList: some View {
        List {
            // Stats header
            Section {
                HStack {
                    StatCard(
                        title: NSLocalizedString("admin_total_members", comment: "Total"),
                        value: "\(viewModel.volunteers.count)",
                        icon: "person.3.fill",
                        color: .blue
                    )

                    StatCard(
                        title: NSLocalizedString("admin_admin_count", comment: "Admins"),
                        value: "\(viewModel.volunteers.filter { $0.userRole == .admin }.count)",
                        icon: "shield.fill",
                        color: Color.brandDarkTeal
                    )

                    StatCard(
                        title: NSLocalizedString("admin_active_count", comment: "Active"),
                        value: "\(viewModel.volunteers.filter { $0.volunteerStatus == .active }.count)",
                        icon: "checkmark.circle.fill",
                        color: .green
                    )
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            // Members list
            Section {
                ForEach(viewModel.filteredVolunteers) { volunteer in
                    VolunteerRowView(
                        volunteer: volunteer,
                        onRoleChange: { newRole in
                            Task {
                                await viewModel.updateVolunteerRole(
                                    pubkey: volunteer.pubkey,
                                    newRole: newRole
                                )
                            }
                        }
                    )
                    .accessibilityIdentifier("volunteer-row-\(volunteer.id)")
                }
            } header: {
                Text(String(format: NSLocalizedString(
                    "admin_members_header",
                    comment: "Members (%d)"
                ), viewModel.filteredVolunteers.count))
            }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("volunteers-list")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("admin_no_volunteers", comment: "No Volunteers"),
                systemImage: "person.3"
            )
        } description: {
            if viewModel.volunteerSearchText.isEmpty {
                Text(NSLocalizedString(
                    "admin_no_volunteers_message",
                    comment: "No members have joined yet."
                ))
            } else {
                Text(NSLocalizedString(
                    "admin_no_search_results",
                    comment: "No members match your search."
                ))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("volunteers-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("admin_loading_volunteers", comment: "Loading members..."))
                .font(.brand(.subheadline))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("volunteers-loading")
    }
}

// MARK: - VolunteerRowView

/// A single volunteer row showing display name, pubkey, role badge, and status.
struct VolunteerRowView: View {
    let volunteer: Volunteer
    let onRoleChange: (UserRole) -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            Image(systemName: volunteer.userRole == .admin ? "shield.fill" : "person.fill")
                .font(.title3)
                .foregroundStyle(volunteer.userRole == .admin ? Color.brandDarkTeal : Color.brandPrimary)
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(
                            (volunteer.userRole == .admin ? Color.brandDarkTeal : Color.brandPrimary)
                                .opacity(0.12)
                        )
                )

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(volunteer.displayLabel)
                    .font(.brand(.body))
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(volunteer.truncatedPubkey)
                        .font(.brandMono(.caption))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    statusBadge
                }
            }

            Spacer()

            // Role menu
            Menu {
                ForEach(UserRole.allCases, id: \.self) { role in
                    Button {
                        if role != volunteer.userRole {
                            onRoleChange(role)
                        }
                    } label: {
                        HStack {
                            Text(role.displayName)
                            if role == volunteer.userRole {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                roleBadge
            }
            .accessibilityIdentifier("role-menu-\(volunteer.id)")
        }
    }

    // MARK: - Badges

    private var roleBadge: some View {
        Text(volunteer.userRole.displayName)
            .font(.brand(.caption2))
            .fontWeight(.semibold)
            .foregroundStyle(volunteer.userRole == .admin ? Color.brandDarkTeal : Color.brandPrimary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(
                        (volunteer.userRole == .admin ? Color.brandDarkTeal : Color.brandPrimary)
                            .opacity(0.12)
                    )
            )
    }

    private var statusBadge: some View {
        HStack(spacing: 3) {
            Circle()
                .fill(statusColor)
                .frame(width: 6, height: 6)
            Text(volunteer.volunteerStatus.displayName)
                .font(.brand(.caption2))
                .foregroundStyle(.secondary)
        }
    }

    private var statusColor: Color {
        switch volunteer.volunteerStatus {
        case .active: return .green
        case .inactive: return .secondary
        case .suspended: return .red
        }
    }
}

// MARK: - StatCard

/// A compact stat display card used in the volunteers header.
struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            Text(value)
                .font(.brand(.title3))
                .fontWeight(.bold)
                .foregroundStyle(.primary)
            Text(title)
                .font(.brand(.caption2))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(.systemGray6))
        )
    }
}
