import SwiftUI

// MARK: - CaseDetailView

/// Detail view for a single case record with tabs for Details, Timeline, Contacts, Evidence.
struct CaseDetailView: View {
    let record: CaseRecord
    let entityType: CaseEntityTypeDefinition
    let viewModel: CaseManagementViewModel
    let appState: AppState

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Header
                caseHeader

                // Tab bar
                tabBar

                // Tab content
                TabView(selection: Binding(
                    get: { viewModel.activeTab },
                    set: { viewModel.activeTab = $0 }
                )) {
                    detailsTab.tag(DetailTab.details)
                    timelineTab.tag(DetailTab.timeline)
                    contactsTab.tag(DetailTab.contacts)
                    evidenceTab.tag(DetailTab.evidence)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityIdentifier("case-detail-close")
                }
            }
        }
    }

    // MARK: - Header

    private var caseHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                // Case number
                Text(record.caseNumber ?? String(record.id.prefix(8)))
                    .font(.brand(.title3))
                    .fontWeight(.bold)
                    .fontDesign(.monospaced)

                Spacer()

                // Assignment
                if let pubkey = appState.cryptoService.pubkey,
                   !record.assignedTo.contains(pubkey) {
                    Button {
                        Task { await viewModel.assignToMe(recordId: record.id) }
                    } label: {
                        Label(
                            NSLocalizedString("cases_assign_to_me", comment: "Assign to me"),
                            systemImage: "person.badge.plus"
                        )
                        .font(.brand(.caption1))
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("case-assign-btn")
                }
            }

            HStack(spacing: 8) {
                // Status pill
                statusPill

                // Entity type badge
                Text(entityType.label)
                    .font(.brand(.caption2))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.brandMuted)
                    .clipShape(Capsule())

                // Severity badge
                if let sevHash = record.severityHash,
                   let sev = entityType.severities?.first(where: { $0.value == sevHash }) {
                    HStack(spacing: 3) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 9))
                        Text(sev.label)
                    }
                    .font(.brand(.caption2))
                    .foregroundStyle(Color(hex: sev.color ?? "#6b7280"))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(hex: sev.color ?? "#6b7280").opacity(0.1))
                    .clipShape(Capsule())
                }
            }
        }
        .padding()
        .background(Color.brandCard)
        .accessibilityIdentifier("case-detail-header")
    }

    // MARK: - Status Pill

    private var statusPill: some View {
        let statusDef = entityType.statuses.first { $0.value == record.statusHash }
        let canEdit = appState.isAdmin || appState.userRole == .admin

        return Button {
            if canEdit {
                viewModel.showStatusSheet = true
            }
        } label: {
            HStack(spacing: 4) {
                Circle()
                    .fill(Color(hex: statusDef?.color ?? "#6b7280"))
                    .frame(width: 6, height: 6)
                Text(statusDef?.label ?? record.statusHash)
                    .font(.brand(.caption1))
                    .fontWeight(.medium)
                if canEdit {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(hex: statusDef?.color ?? "#6b7280").opacity(0.12))
            .clipShape(Capsule())
        }
        .disabled(!canEdit)
        .accessibilityIdentifier("case-status-pill")
        .sheet(isPresented: Binding(
            get: { viewModel.showStatusSheet },
            set: { viewModel.showStatusSheet = $0 }
        )) {
            QuickStatusSheet(
                currentStatus: record.statusHash,
                statuses: entityType.statuses,
                onSelect: { newStatus in
                    Task {
                        await viewModel.updateStatus(recordId: record.id, newStatus: newStatus)
                        viewModel.showStatusSheet = false
                    }
                }
            )
            .presentationDetents([.medium])
        }
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(DetailTab.allCases, id: \.self) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        viewModel.activeTab = tab
                    }
                    // Load data for the tab
                    Task {
                        switch tab {
                        case .timeline:
                            await viewModel.loadInteractions(for: record.id)
                        case .contacts:
                            await viewModel.loadContacts(for: record.id)
                        case .evidence:
                            await viewModel.loadEvidence(for: record.id)
                        case .details:
                            break
                        }
                    }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tabIcon(tab))
                            .font(.system(size: 14))
                        Text(tab.rawValue)
                            .font(.brand(.caption2))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        viewModel.activeTab == tab
                            ? Color.brandPrimary.opacity(0.1)
                            : Color.clear
                    )
                    .overlay(alignment: .bottom) {
                        if viewModel.activeTab == tab {
                            Rectangle()
                                .fill(Color.brandPrimary)
                                .frame(height: 2)
                        }
                    }
                }
                .foregroundStyle(viewModel.activeTab == tab ? .brandPrimary : .secondary)
                .accessibilityIdentifier("case-tab-\(tab.rawValue.lowercased())")
            }
        }
        .accessibilityIdentifier("case-tabs")
    }

    private func tabIcon(_ tab: DetailTab) -> String {
        switch tab {
        case .details: return "doc.text"
        case .timeline: return "clock"
        case .contacts: return "person.2"
        case .evidence: return "paperclip"
        }
    }

    // MARK: - Details Tab

    private var detailsTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Render fields grouped by section
                let sortedFields = entityType.fields.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
                let sections = Dictionary(grouping: sortedFields) { $0.section ?? "" }
                let sectionKeys = sections.keys.sorted()

                ForEach(sectionKeys, id: \.self) { section in
                    if !section.isEmpty {
                        Text(section)
                            .font(.brand(.headline))
                            .padding(.top, 8)
                            .accessibilityIdentifier("case-section-\(section.lowercased())")
                    }

                    if let fields = sections[section] {
                        ForEach(fields) { field in
                            fieldRow(field)
                        }
                    }
                }

                // Metadata
                VStack(alignment: .leading, spacing: 8) {
                    Text(NSLocalizedString("cases_metadata", comment: "Record Info"))
                        .font(.brand(.headline))
                        .padding(.top, 8)

                    metadataRow(
                        label: NSLocalizedString("cases_created", comment: "Created"),
                        value: formatDate(record.createdAt)
                    )
                    metadataRow(
                        label: NSLocalizedString("cases_updated", comment: "Updated"),
                        value: formatDate(record.updatedAt)
                    )
                    if !record.assignedTo.isEmpty {
                        metadataRow(
                            label: NSLocalizedString("cases_assigned", comment: "Assigned"),
                            value: "\(record.assignedTo.count) volunteer(s)"
                        )
                    }
                }
            }
            .padding()
        }
        .accessibilityIdentifier("case-details-tab")
    }

    private func fieldRow(_ field: CaseFieldDefinition) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(field.label)
                    .font(.brand(.caption1))
                    .foregroundStyle(.secondary)
                if field.accessLevel != nil && field.accessLevel != "all" {
                    Image(systemName: "lock")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
            }
            // Field values are encrypted — show placeholder for now
            Text("—")
                .font(.brand(.body))
                .foregroundStyle(.secondary)
        }
        .accessibilityIdentifier("case-field-\(field.name)")
    }

    private func metadataRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.brand(.caption1))
                .foregroundStyle(.secondary)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.brand(.caption1))
        }
    }

    private func formatDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else {
            return iso
        }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }

    // MARK: - Timeline Tab

    private var timelineTab: some View {
        VStack(spacing: 0) {
            if viewModel.isLoadingInteractions {
                ProgressView()
                    .padding()
                    .accessibilityIdentifier("timeline-loading")
            } else if viewModel.interactions.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "clock")
                        .font(.system(size: 30))
                        .foregroundStyle(.secondary)
                    Text(NSLocalizedString("cases_no_interactions", comment: "No activity yet"))
                        .font(.brand(.body))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("timeline-empty")
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.interactions, id: \.id) { interaction in
                            TimelineItemRow(interaction: interaction, entityType: entityType)
                                .accessibilityIdentifier("timeline-item-\(interaction.id)")
                        }
                    }
                    .padding()
                }
                .accessibilityIdentifier("case-timeline")
            }

            // Comment input
            commentInput
        }
        .accessibilityIdentifier("case-timeline-tab")
    }

    private var commentInput: some View {
        HStack(spacing: 8) {
            TextField(
                NSLocalizedString("cases_comment_placeholder", comment: "Add a comment..."),
                text: .constant(""),
                axis: .vertical
            )
            .textFieldStyle(.roundedBorder)
            .lineLimit(1...3)
            .accessibilityIdentifier("case-comment-input")

            Button {
                viewModel.showCommentSheet = true
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.brand(.body))
            }
            .disabled(true) // Enabled when text is non-empty (handled by AddCommentSheet)
            .accessibilityIdentifier("case-comment-submit")
        }
        .padding()
        .background(Color.brandCard)
        .sheet(isPresented: Binding(
            get: { viewModel.showCommentSheet },
            set: { viewModel.showCommentSheet = $0 }
        )) {
            AddCommentSheet(
                onSubmit: { text in
                    Task {
                        await viewModel.addComment(recordId: record.id, text: text)
                        viewModel.showCommentSheet = false
                    }
                }
            )
            .presentationDetents([.medium])
        }
    }

    // MARK: - Contacts Tab

    private var contactsTab: some View {
        Group {
            if viewModel.isLoadingContacts {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.contacts.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "person.2.slash")
                        .font(.system(size: 30))
                        .foregroundStyle(.secondary)
                    Text(NSLocalizedString("cases_no_contacts", comment: "No contacts linked to this case"))
                        .font(.brand(.body))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("case-contacts-empty")
            } else {
                List(viewModel.contacts) { contact in
                    HStack {
                        Image(systemName: "person.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading) {
                            Text(String(contact.contactId.prefix(12)) + "...")
                                .font(.brand(.body))
                            Text(contact.role)
                                .font(.brand(.caption2))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(contact.role)
                            .font(.brand(.caption2))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.brandMuted)
                            .clipShape(Capsule())
                            .accessibilityIdentifier("contact-role-badge")
                    }
                    .accessibilityIdentifier("case-contact-card")
                }
                .listStyle(.plain)
            }
        }
        .accessibilityIdentifier("case-contacts-tab")
    }

    // MARK: - Evidence Tab

    private var evidenceTab: some View {
        Group {
            if viewModel.isLoadingEvidence {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.evidence.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 30))
                        .foregroundStyle(.secondary)
                    Text(NSLocalizedString("cases_no_evidence", comment: "No evidence uploaded yet"))
                        .font(.brand(.body))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("case-evidence-empty")
            } else {
                List(viewModel.evidence, id: \.id) { item in
                    HStack {
                        Image(systemName: evidenceIcon(item.mimeType))
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading) {
                            Text(item.filename)
                                .font(.brand(.body))
                                .lineLimit(1)
                            Text(item.classification.rawValue)
                                .font(.brand(.caption2))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(item.classification.rawValue)
                            .font(.brand(.caption2))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.brandMuted)
                            .clipShape(Capsule())
                            .accessibilityIdentifier("evidence-classification-badge")
                    }
                    .accessibilityIdentifier("evidence-item-\(item.id)")
                }
                .listStyle(.plain)
            }
        }
        .accessibilityIdentifier("case-evidence-tab")
    }

    private func evidenceIcon(_ mimeType: String) -> String {
        if mimeType.starts(with: "image/") { return "photo" }
        if mimeType.starts(with: "video/") { return "film" }
        if mimeType.starts(with: "audio/") { return "waveform" }
        if mimeType.contains("pdf") { return "doc.richtext" }
        return "doc"
    }
}

// MARK: - TimelineItemRow

private struct TimelineItemRow: View {
    let interaction: Interaction
    let entityType: CaseEntityTypeDefinition

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Type icon
            Image(systemName: typeIcon)
                .font(.system(size: 14))
                .foregroundStyle(typeColor)
                .frame(width: 28, height: 28)
                .background(typeColor.opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(typeLabel)
                        .font(.brand(.caption1))
                        .fontWeight(.medium)
                        .accessibilityIdentifier("timeline-item-type")

                    Spacer()

                    Text(relativeTime)
                        .font(.brand(.caption2))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("timeline-item-time")
                }

                Text(String(interaction.authorPubkey.prefix(12)) + "...")
                    .font(.brand(.caption2))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("timeline-item-author")

                // Status change details
                if interaction.interactionType == .statusChange,
                   let newHash = interaction.newStatusHash,
                   let newStatus = entityType.statuses.first(where: { $0.value == newHash }) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 9))
                        Circle()
                            .fill(Color(hex: newStatus.color ?? "#6b7280"))
                            .frame(width: 6, height: 6)
                        Text(newStatus.label)
                            .font(.brand(.caption2))
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(10)
        .background(Color.brandCard)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var typeIcon: String {
        switch interaction.interactionType {
        case .comment: return "text.bubble"
        case .statusChange: return "arrow.triangle.2.circlepath"
        case .note: return "note.text"
        case .call: return "phone"
        case .message: return "message"
        case .fileUpload: return "arrow.up.doc"
        default: return "clock"
        }
    }

    private var typeLabel: String {
        switch interaction.interactionType {
        case .comment: return "Comment"
        case .statusChange: return "Status Change"
        case .note: return "Note"
        case .call: return "Call"
        case .message: return "Message"
        case .fileUpload: return "File Upload"
        default: return interaction.interactionType.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private var typeColor: Color {
        switch interaction.interactionType {
        case .comment: return .blue
        case .statusChange: return .purple
        case .note: return .orange
        case .call: return .green
        case .message: return .teal
        case .fileUpload: return .indigo
        default: return .gray
        }
    }

    private var relativeTime: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: interaction.createdAt) ?? ISO8601DateFormatter().date(from: interaction.createdAt) else {
            return ""
        }
        let rel = RelativeDateTimeFormatter()
        rel.unitsStyle = .abbreviated
        return rel.localizedString(for: date, relativeTo: Date())
    }
}
