import SwiftUI

// MARK: - CaseListView

/// Main case list screen with entity type tabs, status filtering, and pull-to-refresh.
struct CaseListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: CaseManagementViewModel?

    private var vm: CaseManagementViewModel {
        if let viewModel { return viewModel }
        let vm = CaseManagementViewModel(
            apiService: appState.apiService,
            cryptoService: appState.cryptoService
        )
        DispatchQueue.main.async { self.viewModel = vm }
        return vm
    }

    var body: some View {
        let vm = self.vm

        NavigationStack {
            Group {
                if vm.cmsEnabled == nil {
                    loadingView
                } else if vm.cmsEnabled == false {
                    cmsDisabledView
                } else if vm.isLoading && vm.records.isEmpty {
                    loadingView
                } else if vm.records.isEmpty && vm.entityTypeFilter == nil && vm.statusFilter == nil {
                    emptyStateView(vm: vm)
                } else {
                    caseListContent(vm: vm)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(NSLocalizedString("cases_title", comment: "Cases"))
            .task {
                await vm.loadInitial()
            }
            .refreshable {
                await vm.refresh()
            }
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("case-loading")
    }

    // MARK: - CMS Disabled

    private var cmsDisabledView: some View {
        VStack(spacing: 12) {
            Image(systemName: "folder")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(NSLocalizedString("cases_not_enabled", comment: "Case management is not enabled"))
                .font(.brand(.headline))
            Text(NSLocalizedString("cases_not_enabled_hint", comment: "An admin needs to enable case management."))
                .font(.brand(.caption))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .accessibilityIdentifier("cms-not-enabled")
    }

    // MARK: - Empty State

    private func emptyStateView(vm: CaseManagementViewModel) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "folder.badge.plus")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(NSLocalizedString("cases_empty", comment: "No cases yet"))
                .font(.brand(.headline))
            Text(NSLocalizedString("cases_empty_hint", comment: "Cases will appear here as your team creates them."))
                .font(.brand(.caption))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .accessibilityIdentifier("case-empty-state")
    }

    // MARK: - Case List Content

    private func caseListContent(vm: CaseManagementViewModel) -> some View {
        VStack(spacing: 0) {
            // Entity type tabs
            if vm.entityTypes.count > 1 {
                entityTypeTabs(vm: vm)
            }

            // Status filter
            if !vm.allStatuses.isEmpty {
                statusFilterRow(vm: vm)
            }

            // Records list
            List {
                ForEach(vm.records) { record in
                    CaseCardRow(
                        record: record,
                        entityType: vm.entityType(for: record.entityTypeId),
                        statusDef: vm.statusDef(for: record)
                    )
                    .accessibilityIdentifier("case-card-\(record.id)")
                    .onTapGesture {
                        Task { await vm.selectRecord(record) }
                    }
                }
            }
            .listStyle(.plain)
            .accessibilityIdentifier("case-list")

            // Pagination
            if vm.totalPages > 1 {
                paginationBar(vm: vm)
            }
        }
        .sheet(item: Binding(
            get: { vm.selectedRecord },
            set: { vm.selectedRecord = $0 }
        )) { record in
            if let entityType = vm.selectedEntityType {
                CaseDetailView(
                    record: record,
                    entityType: entityType,
                    viewModel: vm,
                    appState: appState
                )
            }
        }
    }

    // MARK: - Entity Type Tabs

    private func entityTypeTabs(vm: CaseManagementViewModel) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // All tab
                Button {
                    Task { await vm.setEntityTypeFilter(nil) }
                } label: {
                    Text(NSLocalizedString("cases_all_types", comment: "All"))
                        .font(.brand(.caption))
                        .fontWeight(vm.entityTypeFilter == nil ? .semibold : .regular)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            vm.entityTypeFilter == nil
                                ? Color.brandPrimary
                                : Color.brandMuted
                        )
                        .foregroundStyle(
                            vm.entityTypeFilter == nil
                                ? .white
                                : .primary
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .accessibilityIdentifier("case-tab-all")

                // Per-type tabs
                ForEach(vm.entityTypes) { et in
                    Button {
                        Task { await vm.setEntityTypeFilter(et.id) }
                    } label: {
                        HStack(spacing: 4) {
                            if let color = et.color {
                                Circle()
                                    .fill((Color(hex: color) ?? .gray))
                                    .frame(width: 8, height: 8)
                            }
                            Text(et.label)
                                .font(.brand(.caption))
                                .fontWeight(vm.entityTypeFilter == et.id ? .semibold : .regular)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            vm.entityTypeFilter == et.id
                                ? Color.brandPrimary
                                : Color.brandMuted
                        )
                        .foregroundStyle(
                            vm.entityTypeFilter == et.id
                                ? .white
                                : .primary
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .accessibilityIdentifier("case-tab-\(et.name)")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .accessibilityIdentifier("case-type-tabs")
    }

    // MARK: - Status Filter

    private func statusFilterRow(vm: CaseManagementViewModel) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                // All statuses
                Button {
                    Task { await vm.setStatusFilter(nil) }
                } label: {
                    Text(NSLocalizedString("cases_all_statuses", comment: "All"))
                        .font(.brand(.caption2))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(vm.statusFilter == nil ? Color.brandPrimary.opacity(0.15) : Color.brandMuted)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("case-status-filter-all")

                ForEach(vm.allStatuses) { status in
                    Button {
                        Task { await vm.setStatusFilter(status.value) }
                    } label: {
                        HStack(spacing: 4) {
                            Circle()
                                .fill((Color(hex: status.color ?? "#6b7280") ?? .gray))
                                .frame(width: 6, height: 6)
                            Text(status.label)
                                .font(.brand(.caption2))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(vm.statusFilter == status.value ? Color.brandPrimary.opacity(0.15) : Color.brandMuted)
                        .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("case-status-filter-\(status.value)")
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 4)
        }
        .accessibilityIdentifier("case-status-filter")
    }

    // MARK: - Pagination

    private func paginationBar(vm: CaseManagementViewModel) -> some View {
        HStack {
            Text("Page \(vm.currentPage) of \(vm.totalPages)")
                .font(.brand(.caption2))
                .foregroundStyle(.secondary)

            Spacer()

            HStack(spacing: 8) {
                Button {
                    Task { await vm.previousPage() }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.caption)
                }
                .disabled(vm.currentPage <= 1)
                .accessibilityIdentifier("case-page-prev")

                Button {
                    Task { await vm.nextPage() }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .disabled(!vm.hasMorePages)
                .accessibilityIdentifier("case-page-next")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.brandCard)
        .accessibilityIdentifier("case-pagination")
    }
}

// MARK: - CaseCardRow

/// A single case card in the list showing case number, status, entity type, and timestamp.
private struct CaseCardRow: View {
    let record: CaseRecord
    let entityType: CaseEntityTypeDefinition?
    let statusDef: CaseEnumOption?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Top row: case number + timestamp
            HStack {
                // Status dot + case number
                HStack(spacing: 6) {
                    Circle()
                        .fill((Color(hex: statusDef?.color ?? "#6b7280") ?? .gray))
                        .frame(width: 8, height: 8)
                    Text(record.caseNumber ?? String(record.id.prefix(8)))
                        .font(.brand(.subheadline))
                        .fontWeight(.medium)
                }

                Spacer()

                // Relative timestamp
                Text(relativeTime(record.updatedAt))
                    .font(.brand(.caption2))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("case-card-timestamp")
            }

            // Bottom row: badges
            HStack(spacing: 6) {
                // Status badge
                if let status = statusDef {
                    HStack(spacing: 3) {
                        Circle()
                            .fill((Color(hex: status.color ?? "#6b7280") ?? .gray))
                            .frame(width: 5, height: 5)
                        Text(status.label)
                    }
                    .font(.brand(.caption2))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background((Color(hex: status.color ?? "#6b7280") ?? .gray).opacity(0.1))
                    .clipShape(Capsule())
                    .accessibilityIdentifier("case-card-status-badge")
                }

                // Entity type badge
                if let et = entityType {
                    Text(et.label)
                        .font(.brand(.caption2))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.brandMuted)
                        .clipShape(Capsule())
                }

                // Assigned count
                if !record.assignedTo.isEmpty {
                    HStack(spacing: 2) {
                        Image(systemName: "person.2")
                            .font(.system(size: 9))
                        Text("\(record.assignedTo.count)")
                            .font(.brand(.caption2))
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func relativeTime(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else {
            return ""
        }
        let rel = RelativeDateTimeFormatter()
        rel.unitsStyle = .abbreviated
        return rel.localizedString(for: date, relativeTo: Date())
    }
}

// Color.init(hex:) is defined in ReportTypePicker.swift — reused here.
