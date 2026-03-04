import SwiftUI

// MARK: - ReportsView

/// Reports list view showing all reports with status filtering, pull-to-refresh,
/// and a create button for filing new reports.
struct ReportsView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: ReportsViewModel?

    var body: some View {
        let vm = resolvedViewModel

        ZStack {
            if vm.isLoading && vm.reports.isEmpty {
                loadingState
            } else if let error = vm.errorMessage, vm.reports.isEmpty {
                errorState(error, vm: vm)
            } else if vm.filteredReports.isEmpty {
                emptyState(vm: vm)
            } else {
                reportsList(vm: vm)
            }
        }
        .navigationTitle(NSLocalizedString("reports_title", comment: "Reports"))
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    filterMenu(vm: vm)
                    createButton(vm: vm)
                }
            }
        }
        .sheet(isPresented: Binding(
            get: { vm.showCreateSheet },
            set: { vm.showCreateSheet = $0 }
        )) {
            ReportCreateView(
                categories: vm.categories,
                onSave: { title, category, body in
                    let success = await vm.createReport(
                        title: title,
                        category: category,
                        body: body
                    )
                    if success {
                        vm.showCreateSheet = false
                    }
                    return success
                }
            )
        }
        .refreshable {
            await vm.refresh()
        }
        .task {
            await vm.loadReports()
        }
        .navigationDestination(for: String.self) { reportId in
            if let report = vm.reports.first(where: { $0.id == reportId }) {
                ReportDetailView(report: report, viewModel: vm)
            }
        }
    }

    // MARK: - Filter Menu

    @ViewBuilder
    private func filterMenu(vm: ReportsViewModel) -> some View {
        Menu {
            ForEach(ReportStatusFilter.allCases, id: \.self) { filter in
                Button {
                    vm.selectedFilter = filter
                } label: {
                    if vm.selectedFilter == filter {
                        Label(filter.displayName, systemImage: "checkmark")
                    } else {
                        Text(filter.displayName)
                    }
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.body)
                .symbolVariant(vm.selectedFilter != .all ? .fill : .none)
        }
        .accessibilityIdentifier("reports-filter-button")
    }

    // MARK: - Create Button

    @ViewBuilder
    private func createButton(vm: ReportsViewModel) -> some View {
        Button {
            vm.showCreateSheet = true
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.body)
        }
        .accessibilityIdentifier("create-report-button")
        .accessibilityLabel(NSLocalizedString("reports_create", comment: "Create Report"))
    }

    // MARK: - Reports List

    @ViewBuilder
    private func reportsList(vm: ReportsViewModel) -> some View {
        List {
            ForEach(vm.filteredReports) { report in
                NavigationLink(value: report.id) {
                    ReportRowView(report: report)
                }
                .accessibilityIdentifier("report-row-\(report.id)")
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("reports-list")
    }

    // MARK: - Empty State

    @ViewBuilder
    private func emptyState(vm: ReportsViewModel) -> some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("reports_empty_title", comment: "No Reports"),
                systemImage: "doc.text"
            )
        } description: {
            if vm.selectedFilter != .all {
                Text(String(
                    format: NSLocalizedString(
                        "reports_empty_filtered",
                        comment: "No %@ reports found."
                    ),
                    vm.selectedFilter.displayName.lowercased()
                ))
            } else {
                Text(NSLocalizedString(
                    "reports_empty_message",
                    comment: "Reports you create will appear here."
                ))
            }
        } actions: {
            if vm.selectedFilter == .all {
                Button {
                    vm.showCreateSheet = true
                } label: {
                    Text(NSLocalizedString("reports_create_first", comment: "Create First Report"))
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("create-first-report")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("reports-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("reports_loading", comment: "Loading reports..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("reports-loading")
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorState(_ error: String, vm: ReportsViewModel) -> some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("reports_error_title", comment: "Unable to Load"),
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
        .accessibilityIdentifier("reports-error")
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: ReportsViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = ReportsViewModel(apiService: appState.apiService, cryptoService: appState.cryptoService)
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - ReportRowView

/// A single report row in the list, showing title, status badge, category, and date.
struct ReportRowView: View {
    let report: ReportResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title
            Text(report.reportTitle)
                .font(.body)
                .fontWeight(.medium)
                .lineLimit(2)
                .foregroundStyle(.primary)

            // Metadata row
            HStack(spacing: 10) {
                // Status badge
                statusBadge(report.statusEnum)

                // Category badge
                if let category = report.reportCategory {
                    HStack(spacing: 3) {
                        Image(systemName: "tag.fill")
                            .font(.caption2)
                        Text(category)
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .foregroundStyle(.purple)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(Color.purple.opacity(0.12))
                    )
                }

                Spacer()

                // Date
                if let date = parseDate(report.createdAt) {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func statusBadge(_ status: ReportStatus) -> some View {
        HStack(spacing: 3) {
            Image(systemName: status.icon)
                .font(.caption2)
            Text(status.displayName)
                .font(.caption2)
                .fontWeight(.medium)
        }
        .foregroundStyle(status.color)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule().fill(status.color.opacity(0.12))
        )
    }

    private func parseDate(_ dateString: String) -> Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: dateString) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: dateString)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Reports - Empty") {
    ReportsView()
        .environment(AppState())
}
#endif
