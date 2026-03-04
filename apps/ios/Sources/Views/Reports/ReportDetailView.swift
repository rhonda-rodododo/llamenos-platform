import SwiftUI

// MARK: - ReportDetailView

/// Detail view for a single report. Shows title, status, category, metadata,
/// and action buttons (claim/close) for authorized users.
struct ReportDetailView: View {
    let report: ReportResponse
    let viewModel: ReportsViewModel

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var showCloseConfirmation: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Title
                Text(report.reportTitle)
                    .font(.title2.bold())
                    .foregroundStyle(.primary)
                    .accessibilityIdentifier("report-title")

                // Status and category chips
                statusRow

                // Metadata card
                metadataCard

                // Action buttons
                actionButtons

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
        }
        .navigationTitle(NSLocalizedString("report_detail_title", comment: "Report"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(
            NSLocalizedString("report_close_confirm_title", comment: "Close Report"),
            isPresented: $showCloseConfirmation
        ) {
            Button(NSLocalizedString("cancel", comment: "Cancel"), role: .cancel) {}
            Button(NSLocalizedString("report_close_confirm_action", comment: "Close"), role: .destructive) {
                Task {
                    await viewModel.closeReport(id: report.id)
                    dismiss()
                }
            }
        } message: {
            Text(NSLocalizedString(
                "report_close_confirm_message",
                comment: "Are you sure you want to close this report? This cannot be undone."
            ))
        }
        .accessibilityIdentifier("report-detail-view")
    }

    // MARK: - Status Row

    private var statusRow: some View {
        HStack(spacing: 10) {
            // Status badge
            HStack(spacing: 4) {
                Image(systemName: report.statusEnum.icon)
                    .font(.caption)
                Text(report.statusEnum.displayName)
                    .font(.caption)
                    .fontWeight(.semibold)
            }
            .foregroundStyle(report.statusEnum.color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(report.statusEnum.color.opacity(0.12))
            )
            .accessibilityIdentifier("report-status")

            // Category badge
            if let category = report.reportCategory {
                HStack(spacing: 4) {
                    Image(systemName: "tag.fill")
                        .font(.caption)
                    Text(category)
                        .font(.caption)
                        .fontWeight(.semibold)
                }
                .foregroundStyle(.purple)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule().fill(Color.purple.opacity(0.12))
                )
                .accessibilityIdentifier("report-category")
            }
        }
    }

    // MARK: - Metadata Card

    private var metadataCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(NSLocalizedString("report_detail_info", comment: "Info"))
                .font(.headline)

            LabeledContent {
                if let date = parseDate(report.createdAt) {
                    Text(date.formatted(date: .long, time: .shortened))
                        .foregroundStyle(.primary)
                }
            } label: {
                Text(NSLocalizedString("report_detail_created", comment: "Created"))
                    .foregroundStyle(.secondary)
            }

            if let assignedTo = report.assignedTo {
                LabeledContent {
                    Text(truncatedPubkey(assignedTo))
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.primary)
                } label: {
                    Text(NSLocalizedString("report_detail_assigned", comment: "Assigned To"))
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("report-assigned-to")
            }

            LabeledContent {
                Text("\(report.messageCount)")
                    .foregroundStyle(.primary)
            } label: {
                Text(NSLocalizedString("report_detail_messages", comment: "Messages"))
                    .foregroundStyle(.secondary)
            }

            if let updatedAt = report.updatedAt, let date = parseDate(updatedAt) {
                LabeledContent {
                    Text(date.formatted(date: .long, time: .shortened))
                        .foregroundStyle(.primary)
                } label: {
                    Text(NSLocalizedString("report_detail_updated", comment: "Updated"))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .accessibilityIdentifier("report-metadata")
    }

    // MARK: - Action Buttons

    @ViewBuilder
    private var actionButtons: some View {
        VStack(spacing: 12) {
            // Claim button — visible when report is waiting
            if report.statusEnum == .waiting {
                Button {
                    Task {
                        await viewModel.claimReport(id: report.id)
                        dismiss()
                    }
                } label: {
                    Label(
                        NSLocalizedString("report_claim", comment: "Claim Report"),
                        systemImage: "hand.raised.fill"
                    )
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isActionInProgress)
                .accessibilityIdentifier("report-claim-button")
            }

            // Close button — visible when report is active and user is admin
            if report.statusEnum == .active && appState.isAdmin {
                Button(role: .destructive) {
                    showCloseConfirmation = true
                } label: {
                    Label(
                        NSLocalizedString("report_close", comment: "Close Report"),
                        systemImage: "xmark.circle.fill"
                    )
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.isActionInProgress)
                .accessibilityIdentifier("report-close-button")
            }
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Helpers

    private func truncatedPubkey(_ pubkey: String) -> String {
        guard pubkey.count > 16 else { return pubkey }
        return "\(pubkey.prefix(8))...\(pubkey.suffix(6))"
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
#Preview("Report Detail") {
    NavigationStack {
        ReportDetailView(
            report: ReportResponse(
                id: "preview-1",
                channelType: "reports",
                contactIdentifierHash: nil,
                assignedTo: nil,
                status: "waiting",
                createdAt: ISO8601DateFormatter().string(from: Date()),
                updatedAt: nil,
                lastMessageAt: nil,
                messageCount: 0,
                metadata: ReportMetadata(
                    type: "report",
                    reportTitle: "Suspicious activity near shelter",
                    reportCategory: "Safety",
                    linkedCallId: nil,
                    reportId: nil
                )
            ),
            viewModel: ReportsViewModel(
                apiService: APIService(cryptoService: CryptoService()),
                cryptoService: CryptoService()
            )
        )
        .environment(AppState())
    }
}
#endif
