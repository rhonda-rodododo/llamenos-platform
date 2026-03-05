import SwiftUI

// MARK: - ContactsView

struct ContactsView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: ContactsViewModel?

    var body: some View {
        let vm = resolvedViewModel

        ZStack {
            if vm.isLoading && vm.contacts.isEmpty {
                loadingState
            } else if let error = vm.errorMessage, vm.contacts.isEmpty {
                errorState(error, vm: vm)
            } else if vm.contacts.isEmpty {
                emptyState
            } else {
                contactsList(vm: vm)
            }
        }
        .navigationTitle(NSLocalizedString("contacts_title", comment: "Contacts"))
        .navigationBarTitleDisplayMode(.large)
        .searchable(
            text: Binding(
                get: { vm.searchQuery },
                set: { vm.searchQuery = $0 }
            ),
            prompt: NSLocalizedString("contacts_search_prompt", comment: "Search by identifier...")
        )
        .onSubmit(of: .search) {
            Task { await vm.search() }
        }
        .refreshable {
            await vm.refresh()
        }
        .task {
            await vm.loadContacts()
        }
        .navigationDestination(for: String.self) { contactHash in
            ContactTimelineView(
                contactHash: contactHash,
                displayIdentifier: vm.contacts.first(where: { $0.contactHash == contactHash })?.displayIdentifier ?? contactHash
            )
        }
    }

    // MARK: - Contacts List

    @ViewBuilder
    private func contactsList(vm: ContactsViewModel) -> some View {
        List {
            ForEach(vm.contacts) { contact in
                NavigationLink(value: contact.contactHash) {
                    ContactRowView(contact: contact)
                }
                .accessibilityIdentifier("contact-row-\(contact.contactHash)")
                .onAppear {
                    // Load more when nearing the end
                    if contact.id == vm.contacts.last?.id && vm.hasMore {
                        Task { await vm.loadMore() }
                    }
                }
            }

            if vm.hasMore {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("contacts-list")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("contacts_empty_title", comment: "No Contacts"),
                systemImage: "person.crop.circle.badge.questionmark"
            )
        } description: {
            Text(NSLocalizedString(
                "contacts_empty_message",
                comment: "Contact records will appear here when callers interact with the hotline."
            ))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("contacts-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("contacts_loading", comment: "Loading contacts..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("contacts-loading")
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorState(_ error: String, vm: ContactsViewModel) -> some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("contacts_error_title", comment: "Unable to Load"),
                systemImage: "exclamationmark.triangle"
            )
        } description: {
            Text(error)
        } actions: {
            Button {
                Task { await vm.refresh() }
            } label: {
                Text(NSLocalizedString("retry", comment: "Retry"))
            }
            .buttonStyle(.bordered)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("contacts-error")
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: ContactsViewModel {
        if let vm = viewModel { return vm }
        let vm = ContactsViewModel(apiService: appState.apiService)
        DispatchQueue.main.async { self.viewModel = vm }
        return vm
    }
}

// MARK: - ContactRowView

struct ContactRowView: View {
    let contact: ContactSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Identifier
            Text(contact.displayIdentifier)
                .font(.system(.body, design: .monospaced))
                .fontWeight(.medium)

            // Interaction badges
            HStack(spacing: 10) {
                if contact.callCount > 0 {
                    interactionBadge(icon: "phone.fill", count: contact.callCount, color: .blue)
                }
                if contact.conversationCount > 0 {
                    interactionBadge(icon: "message.fill", count: contact.conversationCount, color: .green)
                }
                if contact.noteCount > 0 {
                    interactionBadge(icon: "doc.text.fill", count: contact.noteCount, color: .purple)
                }
                if contact.reportCount > 0 {
                    interactionBadge(icon: "exclamationmark.triangle.fill", count: contact.reportCount, color: .orange)
                }

                Spacer()

                // Last seen
                if let date = parseDate(contact.lastSeen) {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func interactionBadge(icon: String, count: Int, color: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.caption2)
            Text("\(count)")
                .font(.caption2)
                .fontWeight(.medium)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Capsule().fill(color.opacity(0.12)))
    }

    private func parseDate(_ dateString: String) -> Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: dateString) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: dateString)
    }
}
