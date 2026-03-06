import SwiftUI

// MARK: - NoteCreateView

/// Sheet view for creating a new encrypted note. Includes a text editor for the note body
/// and dynamically renders custom field inputs based on the field definitions from the server.
struct NoteCreateView: View {
    let customFields: [CustomFieldDefinition]
    let onSave: (String, [String: AnyCodableValue]?, String?, String?) async throws -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var noteText: String = ""
    @State private var fieldValues: [String: AnyCodableValue] = [:]
    @State private var callId: String = ""
    @State private var isSaving: Bool = false
    @State private var errorMessage: String?

    /// Editable custom fields (filtered + sorted).
    private var editableFields: [CustomFieldDefinition] {
        customFields
            .filter { $0.editableByVolunteers }
            .sorted { $0.order < $1.order }
    }

    var body: some View {
        NavigationStack {
            Form {
                // Note text section
                Section {
                    TextEditor(text: $noteText)
                        .frame(minHeight: 150)
                        .font(.brand(.body))
                        .accessibilityIdentifier("note-text-editor")
                } header: {
                    Text(NSLocalizedString("note_create_text_label", comment: "Note"))
                } footer: {
                    if noteText.isEmpty {
                        Text(NSLocalizedString("note_create_text_hint", comment: "Write your call notes here..."))
                            .foregroundStyle(.tertiary)
                    }
                }

                // Custom fields section
                if !editableFields.isEmpty {
                    Section {
                        ForEach(editableFields) { field in
                            customFieldInput(for: field)
                        }
                    } header: {
                        Text(NSLocalizedString("note_create_fields_label", comment: "Details"))
                    }
                }

                // Call ID section (optional)
                Section {
                    TextField(
                        NSLocalizedString("note_create_call_id_placeholder", comment: "Call ID (optional)"),
                        text: $callId
                    )
                    .font(.brandMono(.body))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityIdentifier("note-call-id-input")
                } header: {
                    Text(NSLocalizedString("note_create_call_id_label", comment: "Associated Call"))
                }

                // Error display
                if let error = errorMessage {
                    Section {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text(error)
                                .font(.brand(.footnote))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityIdentifier("note-create-error")
                }
            }
            .navigationTitle(NSLocalizedString("note_create_title", comment: "New Note"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("cancel", comment: "Cancel")) {
                        dismiss()
                    }
                    .disabled(isSaving)
                    .accessibilityIdentifier("cancel-note-create")
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("note_create_save", comment: "Save")) {
                        Task { await saveNote() }
                    }
                    .disabled(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("save-note")
                }
            }
            .loadingOverlay(
                isPresented: isSaving,
                message: NSLocalizedString("note_create_saving", comment: "Encrypting & saving...")
            )
            .interactiveDismissDisabled(isSaving)
        }
    }

    // MARK: - Custom Field Input

    @ViewBuilder
    private func customFieldInput(for field: CustomFieldDefinition) -> some View {
        switch field.type {
        case .text:
            TextField(
                field.label,
                text: textBinding(for: field.name)
            )
            .accessibilityIdentifier("field-\(field.name)")

        case .textarea:
            VStack(alignment: .leading, spacing: 4) {
                Text(field.label)
                    .font(.brand(.subheadline))
                    .foregroundStyle(.secondary)
                TextEditor(text: textBinding(for: field.name))
                    .frame(minHeight: 80)
                    .font(.brand(.body))
            }
            .accessibilityIdentifier("field-\(field.name)")

        case .number:
            HStack {
                Text(field.label)
                Spacer()
                TextField(
                    "0",
                    text: numberBinding(for: field.name)
                )
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            }
            .accessibilityIdentifier("field-\(field.name)")

        case .select:
            Picker(field.label, selection: selectBinding(for: field.name, options: field.options ?? [])) {
                Text(NSLocalizedString("select_placeholder", comment: "Select..."))
                    .tag("")
                if let options = field.options {
                    ForEach(options, id: \.self) { option in
                        Text(option).tag(option)
                    }
                }
            }
            .accessibilityIdentifier("field-\(field.name)")

        case .checkbox:
            Toggle(field.label, isOn: checkboxBinding(for: field.name))
                .accessibilityIdentifier("field-\(field.name)")
        }

        // Show required indicator
        if field.required {
            if case .none = fieldValues[field.name] {
                Text(NSLocalizedString("field_required", comment: "Required"))
                    .font(.brand(.caption2))
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: - Field Bindings

    private func textBinding(for name: String) -> Binding<String> {
        Binding<String>(
            get: {
                if case .string(let val) = fieldValues[name] {
                    return val
                }
                return ""
            },
            set: { newValue in
                if newValue.isEmpty {
                    fieldValues.removeValue(forKey: name)
                } else {
                    fieldValues[name] = .string(newValue)
                }
            }
        )
    }

    private func numberBinding(for name: String) -> Binding<String> {
        Binding<String>(
            get: {
                if case .int(let val) = fieldValues[name] {
                    return "\(val)"
                }
                return ""
            },
            set: { newValue in
                if let intVal = Int(newValue) {
                    fieldValues[name] = .int(intVal)
                } else if newValue.isEmpty {
                    fieldValues.removeValue(forKey: name)
                }
            }
        )
    }

    private func selectBinding(for name: String, options: [String]) -> Binding<String> {
        Binding<String>(
            get: {
                if case .string(let val) = fieldValues[name] {
                    return val
                }
                return ""
            },
            set: { newValue in
                if newValue.isEmpty {
                    fieldValues.removeValue(forKey: name)
                } else {
                    fieldValues[name] = .string(newValue)
                }
            }
        )
    }

    private func checkboxBinding(for name: String) -> Binding<Bool> {
        Binding<Bool>(
            get: {
                if case .bool(let val) = fieldValues[name] {
                    return val
                }
                return false
            },
            set: { newValue in
                fieldValues[name] = .bool(newValue)
            }
        )
    }

    // MARK: - Save

    private func saveNote() async {
        let trimmedText = noteText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        // Validate required fields
        for field in editableFields where field.required {
            if fieldValues[field.name] == nil {
                errorMessage = String(
                    format: NSLocalizedString("note_create_field_required", comment: "%@ is required"),
                    field.label
                )
                return
            }
        }

        isSaving = true
        errorMessage = nil

        do {
            let fields = fieldValues.isEmpty ? nil : fieldValues
            let trimmedCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)

            try await onSave(
                trimmedText,
                fields,
                trimmedCallId.isEmpty ? nil : trimmedCallId,
                nil
            )
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Create Note") {
    NoteCreateView(
        customFields: [
            CustomFieldDefinition(
                id: "f1", name: "severity", label: "Severity (1-5)", type: .number,
                required: true, options: nil,
                validation: CustomFieldDefinition.FieldValidation(minLength: nil, maxLength: nil, min: 1, max: 5),
                visibleToVolunteers: true, editableByVolunteers: true,
                context: .callNotes, allowFileUpload: nil, acceptedFileTypes: nil,
                order: 0, createdAt: nil
            ),
            CustomFieldDefinition(
                id: "f2", name: "category", label: "Category", type: .select,
                required: false, options: ["Legal", "Medical", "Housing", "Financial", "Other"],
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
        ],
        onSave: { _, _, _, _ in }
    )
}
#endif
