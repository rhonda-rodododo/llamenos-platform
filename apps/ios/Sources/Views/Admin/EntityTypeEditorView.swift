import SwiftUI

struct EntityTypeEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State var entityType: EntityTypeDefinition
    var onSave: (EntityTypeDefinition) -> Void
    @State private var isSaving = false
    @State private var fields: [EditableField] = []
    @State private var saveError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(NSLocalizedString("admin_entity_type_section_general", comment: "General")) {
                    TextField(NSLocalizedString("admin_entity_type_label", comment: "Label"), text: $entityType.label)
                    TextField(NSLocalizedString("admin_entity_type_label_plural", comment: "Plural label"), text: Binding(
                        get: { entityType.labelPlural ?? "" },
                        set: { entityType.labelPlural = $0.isEmpty ? nil : $0 }
                    ))
                    Toggle(NSLocalizedString("admin_entity_type_show_in_navigation", comment: "Show in navigation"),
                           isOn: Binding(
                            get: { entityType.showInNavigation ?? true },
                            set: { entityType.showInNavigation = $0 }
                           ))
                }
                Section(NSLocalizedString("cms_fields", comment: "Fields")) {
                    NavigationLink(NSLocalizedString("cms_edit_fields", comment: "Edit Fields")) {
                        FieldDefinitionEditorView(fields: $fields, showEntityOptions: true)
                            .navigationTitle(NSLocalizedString("cms_fields", comment: "Fields"))
                    }
                }
                if let err = saveError {
                    Section {
                        Text(err).foregroundStyle(.red).font(.caption)
                    }
                }
            }
            .navigationTitle(entityType.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common_cancel", comment: "Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("common_save", comment: "Save")) { save() }
                        .disabled(isSaving || entityType.label.isEmpty)
                }
            }
        }
    }

    private func save() {
        isSaving = true
        saveError = nil
        Task {
            do {
                let api = EntitySchemaAPIService.shared
                let updated = try await api.customizeEntityType(
                    id: entityType.id,
                    label: entityType.label,
                    labelPlural: entityType.labelPlural,
                    showInNavigation: entityType.showInNavigation
                )
                await MainActor.run { onSave(updated); dismiss() }
            } catch {
                await MainActor.run { saveError = error.localizedDescription }
            }
            await MainActor.run { isSaving = false }
        }
    }
}
