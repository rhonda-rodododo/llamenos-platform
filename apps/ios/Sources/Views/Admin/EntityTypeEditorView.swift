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
                Section(String(localized: "admin.entityType.sectionGeneral")) {
                    TextField(String(localized: "admin.entityType.label"), text: $entityType.label)
                    TextField(String(localized: "admin.entityType.labelPlural"), text: Binding(
                        get: { entityType.labelPlural ?? "" },
                        set: { entityType.labelPlural = $0.isEmpty ? nil : $0 }
                    ))
                    Toggle(String(localized: "admin.entityType.showInNavigation"),
                           isOn: Binding(
                            get: { entityType.showInNavigation ?? true },
                            set: { entityType.showInNavigation = $0 }
                           ))
                }
                Section(String(localized: "cms.fields")) {
                    NavigationLink(String(localized: "cms.editFields")) {
                        FieldDefinitionEditorView(fields: $fields, showEntityOptions: true)
                            .navigationTitle(String(localized: "cms.fields"))
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
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) { save() }
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
