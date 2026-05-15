import SwiftUI

struct CreateContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(HubKeyStore.self) private var hubKeyStore
    @State private var vm = ContactFormViewModel()
    var onCreated: (DirectoryContactSummary) -> Void

    var body: some View {
        NavigationStack {
            ContactFormFields(vm: vm)
                .navigationTitle(NSLocalizedString("contacts_create_title", comment: "New Contact"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(NSLocalizedString("common_cancel", comment: "Cancel")) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(NSLocalizedString("common_save", comment: "Save")) { save() }
                            .disabled(vm.displayName.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSaving)
                    }
                }
                .overlay { if vm.isSaving { ProgressView() } }
        }
    }

    private func save() {
        guard let hubKey = hubKeyStore.currentHubKey else { return }
        Task {
            do {
                let contact = try await vm.save(hubKey: hubKey)
                await MainActor.run { onCreated(contact); dismiss() }
            } catch {
                vm.error = error.localizedDescription
            }
        }
    }
}
