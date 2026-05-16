import SwiftUI

struct EditContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(HubKeyStore.self) private var hubKeyStore
    @State private var vm = ContactFormViewModel()
    let contact: DirectoryContact
    var onUpdated: (DirectoryContact) -> Void

    var body: some View {
        NavigationStack {
            ContactFormFields(vm: vm)
                .navigationTitle(NSLocalizedString("contacts_edit_title", comment: "Edit Contact"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(NSLocalizedString("common_cancel", comment: "Cancel")) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(NSLocalizedString("common_save", comment: "Save")) { update() }
                            .disabled(vm.displayName.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSaving)
                    }
                }
        }
        .onAppear { vm.populate(from: contact) }
    }

    private func update() {
        guard let hubKey = hubKeyStore.currentHubKey else { return }
        Task {
            do {
                let updated = try await vm.update(contactId: contact.id, hubKey: hubKey)
                await MainActor.run { onUpdated(updated); dismiss() }
            } catch {
                vm.error = error.localizedDescription
            }
        }
    }
}

// Shared form fields sub-view
struct ContactFormFields: View {
    @Bindable var vm: ContactFormViewModel

    var body: some View {
        Form {
            Section(NSLocalizedString("contacts_section_basic", comment: "Basic Info")) {
                TextField(NSLocalizedString("contacts_display_name", comment: "Display Name"), text: $vm.displayName)
                    .accessibilityIdentifier("contact-display-name")
                TextField(NSLocalizedString("contacts_phone", comment: "Phone"), text: $vm.phone)
                    .keyboardType(.phonePad)
                TextField(NSLocalizedString("contacts_email", comment: "Email"), text: $vm.email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
            }
            Section(NSLocalizedString("contacts_section_notes", comment: "Notes")) {
                TextEditor(text: $vm.notes)
                    .frame(minHeight: 80)
            }
            if let error = vm.error {
                Section {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
            }
        }
    }
}
