import SwiftUI

// MARK: - NoteDetailView

/// Full-screen detail view for a single decrypted note. Shows the complete note text,
/// custom field values, and metadata. Supports copy-to-clipboard.
struct NoteDetailView: View {
    let note: DecryptedNote
    let customFields: [CustomFieldDefinition]

    @State private var showCopyConfirmation: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Note text
                noteTextSection

                // Custom fields
                if let fields = note.payload.fields, !fields.isEmpty {
                    customFieldsSection(fields)
                }

                // Metadata
                metadataSection

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
        }
        .navigationTitle(NSLocalizedString("note_detail_title", comment: "Note"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        copyNoteText()
                    } label: {
                        Label(
                            NSLocalizedString("note_copy_text", comment: "Copy Text"),
                            systemImage: "doc.on.doc"
                        )
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityIdentifier("note-detail-menu")
            }
        }
        .overlay(alignment: .bottom) {
            if showCopyConfirmation {
                copyConfirmationBanner
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .accessibilityIdentifier("note-detail-view")
    }

    // MARK: - Note Text Section

    private var noteTextSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(note.payload.text)
                .font(.brand(.body))
                .textSelection(.enabled)
                .privacySensitive()  // M28: Redact note content in screenshots
                .accessibilityIdentifier("note-detail-text")
        }
    }

    // MARK: - Custom Fields Section

    @ViewBuilder
    private func customFieldsSection(_ fields: [String: AnyCodableValue]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(NSLocalizedString("note_detail_fields", comment: "Details"))
                .font(.brand(.headline))
                .accessibilityIdentifier("note-detail-fields-header")

            ForEach(orderedFields(fields), id: \.key) { field in
                LabeledContent {
                    Text(field.value.displayValue)
                        .font(.brand(.body))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.trailing)
                        .privacySensitive()  // M28: Redact custom field values in screenshots
                } label: {
                    Text(labelForField(named: field.key))
                        .font(.brand(.subheadline))
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("note-field-\(field.key)")
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
    }

    // MARK: - Metadata Section

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(NSLocalizedString("note_detail_metadata", comment: "Info"))
                .font(.brand(.headline))

            LabeledContent {
                Text(note.authorDisplayName)
                    .font(.brandMono(.body))
                    .foregroundStyle(.primary)
            } label: {
                Text(NSLocalizedString("note_detail_author", comment: "Author"))
                    .foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("note-detail-author")

            LabeledContent {
                Text(note.createdAt.formatted(date: .long, time: .shortened))
                    .foregroundStyle(.primary)
            } label: {
                Text(NSLocalizedString("note_detail_created", comment: "Created"))
                    .foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("note-detail-created")

            if let updatedAt = note.updatedAt {
                LabeledContent {
                    Text(updatedAt.formatted(date: .long, time: .shortened))
                        .foregroundStyle(.primary)
                } label: {
                    Text(NSLocalizedString("note_detail_updated", comment: "Updated"))
                        .foregroundStyle(.secondary)
                }
            }

            if let callId = note.callId {
                LabeledContent {
                    HStack(spacing: 4) {
                        Image(systemName: "phone.fill")
                            .font(.brand(.caption))
                            .foregroundStyle(.blue)
                        Text(String(callId.prefix(12)))
                            .font(.brandMono(.body))
                            .foregroundStyle(.blue)
                    }
                } label: {
                    Text(NSLocalizedString("note_detail_call", comment: "Call"))
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("note-detail-call")
            }

            if let conversationId = note.conversationId {
                LabeledContent {
                    HStack(spacing: 4) {
                        Image(systemName: "message.fill")
                            .font(.brand(.caption))
                            .foregroundStyle(.green)
                        Text(String(conversationId.prefix(12)))
                            .font(.brandMono(.body))
                            .foregroundStyle(.green)
                    }
                } label: {
                    Text(NSLocalizedString("note_detail_conversation", comment: "Conversation"))
                        .foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("note-detail-conversation")
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
    }

    // MARK: - Copy Confirmation Banner

    private var copyConfirmationBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text(NSLocalizedString("note_copied", comment: "Note text copied"))
                .font(.brand(.subheadline))
                .fontWeight(.medium)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .shadow(radius: 8)
        )
        .padding(.bottom, 16)
        .accessibilityIdentifier("copy-confirmation")
    }

    // MARK: - Helpers

    private func copyNoteText() {
        UIPasteboard.general.string = note.payload.text

        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        withAnimation(.easeInOut(duration: 0.3)) {
            showCopyConfirmation = true
        }

        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation(.easeInOut(duration: 0.3)) {
                showCopyConfirmation = false
            }
        }
    }

    /// Get the display label for a custom field by its name.
    private func labelForField(named name: String) -> String {
        customFields.first { $0.name == name }?.label ?? name
    }

    /// Order fields according to their definition order.
    private func orderedFields(_ fields: [String: AnyCodableValue]) -> [(key: String, value: AnyCodableValue)] {
        let fieldOrder = Dictionary(uniqueKeysWithValues: customFields.map { ($0.name, $0.order) })
        return fields.sorted { lhs, rhs in
            let lhsOrder = fieldOrder[lhs.key] ?? Int.max
            let rhsOrder = fieldOrder[rhs.key] ?? Int.max
            return lhsOrder < rhsOrder
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Note Detail") {
    NavigationStack {
        NoteDetailView(
            note: DecryptedNote(
                id: "preview-1",
                payload: NotePayload(
                    text: "Caller reported feeling anxious about upcoming court date. Discussed breathing exercises and provided information about local legal aid resources. Follow-up recommended within 48 hours.",
                    fields: [
                        "severity": .int(3),
                        "category": .string("Legal"),
                        "followUp": .bool(true),
                    ]
                ),
                authorPubkey: "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
                callId: "call-12345-abcde",
                conversationId: nil,
                createdAt: Date().addingTimeInterval(-3600),
                updatedAt: nil
            ),
            customFields: [
                CustomFieldDefinition(
                    id: "f1", name: "severity", label: "Severity", type: .number,
                    required: true, options: nil, validation: nil,
                    visibleToVolunteers: true, editableByVolunteers: true,
                    context: .callNotes, allowFileUpload: nil, acceptedFileTypes: nil,
                    order: 0, createdAt: nil
                ),
                CustomFieldDefinition(
                    id: "f2", name: "category", label: "Category", type: .select,
                    required: false, options: ["Legal", "Medical", "Housing"],
                    validation: nil, visibleToVolunteers: true, editableByVolunteers: true,
                    context: .callNotes, allowFileUpload: nil, acceptedFileTypes: nil,
                    order: 1, createdAt: nil
                ),
                CustomFieldDefinition(
                    id: "f3", name: "followUp", label: "Follow-up Needed", type: .checkbox,
                    required: false, options: nil, validation: nil,
                    visibleToVolunteers: true, editableByVolunteers: true,
                    context: .callNotes, allowFileUpload: nil, acceptedFileTypes: nil,
                    order: 2, createdAt: nil
                ),
            ]
        )
    }
}
#endif
