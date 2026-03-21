import SwiftUI

// MARK: - CreateHubView

/// Sheet for creating a new hub. Auto-generates slug from name.
struct CreateHubView: View {
    let viewModel: HubManagementViewModel
    let onDismiss: () -> Void

    @State private var name: String = ""
    @State private var slug: String = ""
    @State private var description: String = ""
    @State private var phoneNumber: String = ""
    @State private var slugEdited: Bool = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        NSLocalizedString("hubs_name_placeholder", comment: "Hub name"),
                        text: $name
                    )
                    .textInputAutocapitalization(.words)
                    .accessibilityIdentifier("hub-name-field")
                    .onChange(of: name) { _, newValue in
                        if !slugEdited {
                            slug = generateSlug(from: newValue)
                        }
                    }

                    HStack {
                        Text("/")
                            .font(.brandMono(.body))
                            .foregroundStyle(Color.brandMutedForeground)
                        TextField(
                            NSLocalizedString("hubs_slug_placeholder", comment: "url-slug"),
                            text: $slug
                        )
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.brandMono(.body))
                        .accessibilityIdentifier("hub-slug-field")
                        .onChange(of: slug) { _, _ in
                            slugEdited = true
                        }
                    }
                } header: {
                    Text(NSLocalizedString("hubs_name_section", comment: "Name"))
                } footer: {
                    Text(NSLocalizedString(
                        "hubs_slug_help",
                        comment: "The slug is used in URLs and API references. Auto-generated from the name."
                    ))
                }

                Section {
                    TextField(
                        NSLocalizedString("hubs_description_placeholder", comment: "Description (optional)"),
                        text: $description,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                    .accessibilityIdentifier("hub-description-field")
                } header: {
                    Text(NSLocalizedString("hubs_description_section", comment: "Description"))
                }

                Section {
                    TextField(
                        NSLocalizedString("hubs_phone_placeholder", comment: "+1 (555) 000-0000"),
                        text: $phoneNumber
                    )
                    .keyboardType(.phonePad)
                    .accessibilityIdentifier("hub-phone-field")
                } header: {
                    Text(NSLocalizedString("hubs_phone_section", comment: "Phone Number"))
                } footer: {
                    Text(NSLocalizedString(
                        "hubs_phone_help",
                        comment: "The primary hotline number for this hub. Used for call routing."
                    ))
                }
            }
            .navigationTitle(NSLocalizedString("hubs_create_hub", comment: "Create Hub"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common_cancel", comment: "Cancel")) {
                        dismiss()
                        onDismiss()
                    }
                    .accessibilityIdentifier("hub-create-cancel")
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("common_create", comment: "Create")) {
                        Task {
                            let success = await viewModel.createHub(
                                name: name,
                                slug: slug.isEmpty ? nil : slug,
                                description: description.isEmpty ? nil : description,
                                phoneNumber: phoneNumber.isEmpty ? nil : phoneNumber
                            )
                            if success {
                                dismiss()
                                onDismiss()
                            }
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSaving)
                    .accessibilityIdentifier("hub-create-submit")
                }
            }
        }
    }

    // MARK: - Slug Generation

    /// Generate a URL-safe slug from a hub name.
    private func generateSlug(from name: String) -> String {
        name.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(
                of: "[^a-z0-9]+",
                with: "-",
                options: .regularExpression
            )
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Create Hub") {
    let ctx = HubContext()
    CreateHubView(
        viewModel: HubManagementViewModel(
            apiService: APIService(cryptoService: CryptoService(), hubContext: ctx),
            cryptoService: CryptoService(),
            hubContext: ctx
        ),
        onDismiss: {}
    )
}
#endif
