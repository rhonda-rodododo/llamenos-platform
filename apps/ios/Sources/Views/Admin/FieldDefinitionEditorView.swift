import SwiftUI

struct EditableField: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var label: String
    var type: String
    var required: Bool
    var order: Int
    var section: String?
    var accessLevel: String?
    var placeholder: String?
    var helpText: String?
}

struct FieldDefinitionEditorView: View {
    @Binding var fields: [EditableField]
    var showEntityOptions: Bool = false
    @State private var showAddSheet = false
    @State private var editingField: EditableField?

    var body: some View {
        List {
            ForEach($fields) { $field in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(field.label).font(.subheadline).fontWeight(.medium)
                        Text(field.type).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if field.required {
                        Text(NSLocalizedString("cms_required", comment: "Required"))
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { editingField = field }
            }
            .onDelete { fields.remove(atOffsets: $0) }
            .onMove { fields.move(fromOffsets: $0, toOffset: $1) }
        }
        .environment(\.editMode, .constant(.active))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showAddSheet = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            FieldPropertyEditorSheet(field: nil, showEntityOptions: showEntityOptions) { newField in
                fields.append(newField)
            }
        }
        .sheet(item: $editingField) { field in
            FieldPropertyEditorSheet(field: field, showEntityOptions: showEntityOptions) { updated in
                if let i = fields.firstIndex(where: { $0.id == updated.id }) {
                    fields[i] = updated
                }
            }
        }
    }
}

struct FieldPropertyEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let field: EditableField?
    var showEntityOptions: Bool
    var onSave: (EditableField) -> Void

    @State private var label = ""
    @State private var name = ""
    @State private var type = "text"
    @State private var required = false
    @State private var section = ""

    private let fieldTypes = ["text","number","select","multiselect","checkbox","textarea","date","file","location"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(NSLocalizedString("cms_field_label", comment: "Label"), text: $label)
                    TextField(NSLocalizedString("cms_field_name", comment: "Field name"), text: $name)
                        .autocapitalization(.none)
                    Picker(NSLocalizedString("cms_field_type", comment: "Type"), selection: $type) {
                        ForEach(fieldTypes, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle(NSLocalizedString("cms_required", comment: "Required"), isOn: $required)
                }
                if showEntityOptions {
                    Section {
                        TextField(NSLocalizedString("cms_field_section", comment: "Section"), text: $section)
                    }
                }
            }
            .navigationTitle(field == nil
                ? NSLocalizedString("cms_add_field", comment: "Add Field")
                : NSLocalizedString("cms_edit_field", comment: "Edit Field"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common_cancel", comment: "Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("common_save", comment: "Save")) {
                        let f = EditableField(
                            id: field?.id ?? UUID().uuidString,
                            name: name.replacingOccurrences(of: " ", with: "_").lowercased(),
                            label: label, type: type,
                            required: required, order: field?.order ?? 0,
                            section: section.isEmpty ? nil : section
                        )
                        onSave(f)
                        dismiss()
                    }
                    .disabled(label.isEmpty || name.isEmpty)
                }
            }
        }
        .onAppear {
            if let f = field {
                label = f.label; name = f.name; type = f.type; required = f.required
                section = f.section ?? ""
            }
        }
    }
}
