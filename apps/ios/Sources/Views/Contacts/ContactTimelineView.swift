import SwiftUI

// MARK: - ContactTimelineView

struct ContactTimelineView: View {
    @Environment(AppState.self) private var appState
    let contactHash: String
    let displayIdentifier: String
    @State private var viewModel: ContactTimelineViewModel?

    var body: some View {
        let vm = resolvedViewModel

        ZStack {
            if vm.isLoading && vm.events.isEmpty {
                loadingState
            } else if let error = vm.errorMessage, vm.events.isEmpty {
                errorState(error, vm: vm)
            } else if vm.events.isEmpty {
                emptyState
            } else {
                timelineList(vm: vm)
            }
        }
        .navigationTitle(displayIdentifier)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await vm.refresh()
        }
        .task {
            await vm.loadTimeline()
        }
        .accessibilityIdentifier("contact-timeline")
    }

    // MARK: - Timeline List

    @ViewBuilder
    private func timelineList(vm: ContactTimelineViewModel) -> some View {
        List {
            // Summary header
            Section {
                HStack(spacing: 16) {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.tint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayIdentifier)
                            .font(.system(.headline, design: .monospaced))
                        Text(String(
                            format: NSLocalizedString("contact_interactions_count", comment: "%d interactions"),
                            vm.total
                        ))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            // Events
            Section {
                ForEach(vm.events) { event in
                    TimelineEventRow(event: event)
                        .accessibilityIdentifier("timeline-event-\(event.id)")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("timeline_empty_title", comment: "No Interactions"),
                systemImage: "clock.badge.questionmark"
            )
        } description: {
            Text(NSLocalizedString(
                "timeline_empty_message",
                comment: "No interactions have been recorded for this contact."
            ))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("timeline-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("timeline_loading", comment: "Loading timeline..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorState(_ error: String, vm: ContactTimelineViewModel) -> some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("timeline_error_title", comment: "Unable to Load"),
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
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: ContactTimelineViewModel {
        if let vm = viewModel { return vm }
        let vm = ContactTimelineViewModel(apiService: appState.apiService, contactHash: contactHash)
        DispatchQueue.main.async { self.viewModel = vm }
        return vm
    }
}

// MARK: - TimelineEventRow

struct TimelineEventRow: View {
    let event: ContactTimelineEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Type icon
            Image(systemName: event.eventType.icon)
                .font(.body)
                .foregroundStyle(event.eventType.color)
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 4) {
                // Type + status
                HStack(spacing: 6) {
                    Text(event.eventType.displayName)
                        .font(.subheadline)
                        .fontWeight(.medium)

                    if let status = event.status {
                        Text(status)
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(
                                Capsule().fill(Color.secondary.opacity(0.12))
                            )
                    }
                }

                // Summary
                if let summary = event.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                // Timestamp + duration
                HStack(spacing: 8) {
                    if let date = parseDate(event.timestamp) {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    if let duration = event.duration, duration > 0 {
                        Text(formatDuration(duration))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func parseDate(_ dateString: String) -> Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: dateString) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: dateString)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        if mins > 0 {
            return String(format: NSLocalizedString("duration_min_sec", comment: "%dm %ds"), mins, secs)
        }
        return String(format: NSLocalizedString("duration_sec", comment: "%ds"), secs)
    }
}
