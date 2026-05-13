import SwiftUI

struct EntityTypeAdminView: View {
    @State private var entityTypes: [EntityTypeDefinition] = []
    @State private var loading = true
    @State private var editingType: EntityTypeDefinition?
    @State private var loadError: String?

    var body: some View {
        List {
            ForEach(entityTypes) { et in
                HStack {
                    VStack(alignment: .leading) {
                        Text(et.label).fontWeight(.medium)
                        if let plural = et.labelPlural {
                            Text(plural).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
                .onTapGesture { editingType = et }
                .accessibilityIdentifier("entity-type-row-\(et.id)")
            }
        }
        .navigationTitle(NSLocalizedString("admin_entity_types_title", comment: "Entity Types"))
        .task { await loadTypes() }
        .sheet(item: $editingType) { et in
            EntityTypeEditorView(entityType: et) { updated in
                if let i = entityTypes.firstIndex(where: { $0.id == updated.id }) {
                    entityTypes[i] = updated
                }
            }
        }
        .overlay {
            if loading {
                ProgressView()
            } else if let err = loadError, entityTypes.isEmpty {
                ContentUnavailableView(err, systemImage: "exclamationmark.triangle")
            }
        }
    }

    private func loadTypes() async {
        loading = true
        loadError = nil
        do {
            entityTypes = try await EntitySchemaAPIService.shared.listEntityTypes()
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }
}
