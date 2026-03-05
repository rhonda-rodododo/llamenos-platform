import SwiftUI

// MARK: - CustomFieldsView

struct CustomFieldsView: View {
    @Bindable var viewModel: AdminViewModel

    var body: some View {
        ZStack {
            if viewModel.isLoadingFields && viewModel.customFields.isEmpty {
                loadingState
            } else if viewModel.customFields.isEmpty {
                emptyState
            } else {
                fieldsList
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    viewModel.editingField = nil
                    viewModel.showFieldEditor = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.body)
                }
                .accessibilityIdentifier("add-field-button")
            }
        }
        .sheet(isPresented: $viewModel.showFieldEditor) {
            CustomFieldEditView(
                field: viewModel.editingField,
                existingCount: viewModel.customFields.count,
                onSave: { field in
                    await viewModel.saveField(field)
                }
            )
        }
        .task {
            await viewModel.loadCustomFields()
        }
    }

    // MARK: - Fields List

    private var fieldsList: some View {
        List {
            ForEach(viewModel.customFields) { field in
                FieldRowView(field: field)
                    .accessibilityIdentifier("field-row-\(field.id)")
                    .contentShape(Rectangle())
                    .onTapGesture {
                        viewModel.editingField = field
                        viewModel.showFieldEditor = true
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await viewModel.deleteField(id: field.id) }
                        } label: {
                            Label(
                                NSLocalizedString("delete", comment: "Delete"),
                                systemImage: "trash"
                            )
                        }
                    }
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("custom-fields-list")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("fields_empty_title", comment: "No Custom Fields"),
                systemImage: "list.bullet.rectangle"
            )
        } description: {
            Text(NSLocalizedString(
                "fields_empty_message",
                comment: "Custom fields will appear on note and report forms."
            ))
        } actions: {
            Button {
                viewModel.editingField = nil
                viewModel.showFieldEditor = true
            } label: {
                Text(NSLocalizedString("fields_add_first", comment: "Add First Field"))
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("add-first-field")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("custom-fields-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("fields_loading", comment: "Loading custom fields..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("custom-fields-loading")
    }
}

// MARK: - FieldRowView

struct FieldRowView: View {
    let field: CustomFieldDefinition

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(field.label)
                .font(.body)
                .fontWeight(.medium)

            HStack(spacing: 8) {
                // Type badge
                typeBadge(field.type)

                // Context badge
                contextBadge(field.context)

                if field.required {
                    Text(NSLocalizedString("field_required", comment: "Required"))
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.red.opacity(0.12)))
                }

                Spacer()
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func typeBadge(_ type: CustomFieldDefinition.FieldType) -> some View {
        Text(type.rawValue.capitalized)
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundStyle(.blue)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Color.blue.opacity(0.12)))
    }

    @ViewBuilder
    private func contextBadge(_ context: CustomFieldDefinition.FieldContext) -> some View {
        let label: String = switch context {
        case .callNotes: NSLocalizedString("field_context_notes", comment: "Notes")
        case .reports: NSLocalizedString("field_context_reports", comment: "Reports")
        case .both: NSLocalizedString("field_context_both", comment: "Both")
        }
        Text(label)
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundStyle(.purple)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Color.purple.opacity(0.12)))
    }
}
