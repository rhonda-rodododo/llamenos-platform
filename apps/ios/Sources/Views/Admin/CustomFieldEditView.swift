import SwiftUI

// MARK: - CustomFieldEditView

struct CustomFieldEditView: View {
    @Environment(\.dismiss) private var dismiss

    let field: CustomFieldDefinition?
    let existingCount: Int
    let onSave: (CustomFieldDefinition) async -> Void

    @State private var label: String = ""
    @State private var fieldType: CustomFieldDefinition.FieldType = .text
    @State private var context: CustomFieldDefinition.FieldContext = .callNotes
    @State private var isRequired: Bool = false
    @State private var visibleToVolunteers: Bool = true
    @State private var editableByVolunteers: Bool = true
    @State private var options: [String] = []
    @State private var newOption: String = ""
    @State private var isSaving = false

    private var isEditing: Bool { field != nil }

    private var isFormValid: Bool {
        !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var showsOptions: Bool {
        fieldType == .select
    }

    var body: some View {
        NavigationStack {
            Form {
                // Label
                Section {
                    TextField(
                        NSLocalizedString("field_label_placeholder", comment: "Field label"),
                        text: $label
                    )
                    .accessibilityIdentifier("field-label-input")
                }

                // Type
                Section {
                    Picker(
                        NSLocalizedString("field_type", comment: "Type"),
                        selection: $fieldType
                    ) {
                        Text(NSLocalizedString("field_type_text", comment: "Text")).tag(CustomFieldDefinition.FieldType.text)
                        Text(NSLocalizedString("field_type_number", comment: "Number")).tag(CustomFieldDefinition.FieldType.number)
                        Text(NSLocalizedString("field_type_select", comment: "Select")).tag(CustomFieldDefinition.FieldType.select)
                        Text(NSLocalizedString("field_type_checkbox", comment: "Checkbox")).tag(CustomFieldDefinition.FieldType.checkbox)
                        Text(NSLocalizedString("field_type_textarea", comment: "Text Area")).tag(CustomFieldDefinition.FieldType.textarea)
                    }
                    .accessibilityIdentifier("field-type-picker")
                }

                // Context
                Section {
                    Picker(
                        NSLocalizedString("field_context", comment: "Context"),
                        selection: $context
                    ) {
                        Text(NSLocalizedString("field_context_notes", comment: "Notes")).tag(CustomFieldDefinition.FieldContext.callNotes)
                        Text(NSLocalizedString("field_context_reports", comment: "Reports")).tag(CustomFieldDefinition.FieldContext.reports)
                        Text(NSLocalizedString("field_context_both", comment: "Both")).tag(CustomFieldDefinition.FieldContext.both)
                    }
                    .accessibilityIdentifier("field-context-picker")
                }

                // Options (for select type)
                if showsOptions {
                    Section(NSLocalizedString("field_options", comment: "Options")) {
                        ForEach(options.indices, id: \.self) { index in
                            HStack {
                                Text(options[index])
                                Spacer()
                                Button {
                                    options.remove(at: index)
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .foregroundStyle(.red)
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        HStack {
                            TextField(
                                NSLocalizedString("field_new_option", comment: "New option"),
                                text: $newOption
                            )
                            Button {
                                let trimmed = newOption.trimmingCharacters(in: .whitespacesAndNewlines)
                                guard !trimmed.isEmpty else { return }
                                options.append(trimmed)
                                newOption = ""
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .foregroundStyle(.green)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("add-option-button")
                        }
                    }
                }

                // Toggles
                Section {
                    Toggle(
                        NSLocalizedString("field_required_toggle", comment: "Required"),
                        isOn: $isRequired
                    )
                    .accessibilityIdentifier("field-required-toggle")

                    Toggle(
                        NSLocalizedString("field_visible_volunteers", comment: "Visible to volunteers"),
                        isOn: $visibleToVolunteers
                    )

                    Toggle(
                        NSLocalizedString("field_editable_volunteers", comment: "Editable by volunteers"),
                        isOn: $editableByVolunteers
                    )
                }
            }
            .navigationTitle(isEditing
                ? NSLocalizedString("field_edit_title", comment: "Edit Field")
                : NSLocalizedString("field_create_title", comment: "New Field")
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("cancel", comment: "Cancel")) {
                        dismiss()
                    }
                    .accessibilityIdentifier("cancel-field-edit")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("save", comment: "Save")) {
                        Task { await save() }
                    }
                    .disabled(!isFormValid || isSaving)
                    .accessibilityIdentifier("field-save-button")
                }
            }
            .onAppear {
                if let field {
                    label = field.label
                    fieldType = field.type
                    context = field.context
                    isRequired = field.required
                    visibleToVolunteers = field.visibleToVolunteers
                    editableByVolunteers = field.editableByVolunteers
                    options = field.options ?? []
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let trimmedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let slug = trimmedLabel.lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .filter { $0.isLetter || $0.isNumber || $0 == "_" }

        let definition = CustomFieldDefinition(
            id: field?.id ?? UUID().uuidString,
            name: field?.name ?? slug,
            label: trimmedLabel,
            type: fieldType,
            required: isRequired,
            options: showsOptions ? options : nil,
            validation: nil,
            visibleToVolunteers: visibleToVolunteers,
            editableByVolunteers: editableByVolunteers,
            context: context,
            allowFileUpload: nil,
            acceptedFileTypes: nil,
            order: field?.order ?? existingCount,
            createdAt: field?.createdAt
        )

        await onSave(definition)
    }
}
