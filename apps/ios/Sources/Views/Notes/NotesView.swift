import SwiftUI

// MARK: - NotesView

/// Main notes list view showing all decrypted notes with pull-to-refresh,
/// pagination, and a floating action button for creating new notes.
struct NotesView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router
    @State private var viewModel: NotesViewModel?

    var body: some View {
        let vm = resolvedViewModel

        NavigationStack {
            Group {
                if vm.isLoading && vm.notes.isEmpty {
                    loadingState
                } else if let error = vm.errorMessage, vm.notes.isEmpty {
                    errorState(error, vm: vm)
                } else if vm.notes.isEmpty {
                    emptyState
                } else {
                    notesList(vm: vm)
                }
            }
            .navigationTitle(NSLocalizedString("notes_title", comment: "Notes"))
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        vm.showCreateSheet = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.body.weight(.semibold))
                    }
                    .accessibilityIdentifier("create-note-button")
                    .accessibilityLabel(NSLocalizedString("notes_create", comment: "Create Note"))
                }
            }
            .sheet(isPresented: Binding(
                get: { vm.showCreateSheet },
                set: { vm.showCreateSheet = $0 }
            )) {
                NoteCreateView(
                    customFields: vm.customFields,
                    onSave: { text, fields, callId, conversationId in
                        try await vm.createNote(
                            text: text,
                            fields: fields,
                            callId: callId,
                            conversationId: conversationId,
                            adminPubkeys: []  // Fetched from server during encryption
                        )
                        vm.showCreateSheet = false
                    }
                )
            }
            .refreshable {
                await vm.refresh()
            }
            .task {
                await vm.loadNotes()
            }
            .navigationDestination(for: String.self) { noteId in
                if let note = vm.notes.first(where: { $0.id == noteId }) {
                    NoteDetailView(note: note, customFields: vm.customFields)
                }
            }
        }
    }

    // MARK: - Notes List

    @ViewBuilder
    private func notesList(vm: NotesViewModel) -> some View {
        List {
            ForEach(vm.notes) { note in
                NavigationLink(value: note.id) {
                    NoteRowView(note: note)
                }
                .accessibilityIdentifier("note-row-\(note.id)")
            }

            if vm.hasMore {
                HStack {
                    Spacer()
                    if vm.isLoadingMore {
                        ProgressView()
                            .padding()
                    } else {
                        Button {
                            Task { await vm.loadMoreNotes() }
                        } label: {
                            Text(NSLocalizedString("notes_load_more", comment: "Load More"))
                                .font(.subheadline)
                                .foregroundStyle(.tint)
                        }
                        .padding()
                    }
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("notes-list")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("notes_empty_title", comment: "No Notes Yet"),
                systemImage: "note.text"
            )
        } description: {
            Text(NSLocalizedString(
                "notes_empty_message",
                comment: "Notes you create during calls will appear here."
            ))
        } actions: {
            Button {
                resolvedViewModel.showCreateSheet = true
            } label: {
                Text(NSLocalizedString("notes_create_first", comment: "Create Your First Note"))
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("create-first-note")
        }
        .accessibilityIdentifier("notes-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("notes_loading", comment: "Loading notes..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notes-loading")
    }

    // MARK: - Error State

    @ViewBuilder
    private func errorState(_ error: String, vm: NotesViewModel) -> some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("notes_error_title", comment: "Unable to Load"),
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
        .accessibilityIdentifier("notes-error")
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: NotesViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = NotesViewModel(apiService: appState.apiService, cryptoService: appState.cryptoService)
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - NoteRowView

/// A single note row in the list, showing preview text, metadata badges, and date.
struct NoteRowView: View {
    let note: DecryptedNote

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Note preview text
            Text(note.preview)
                .font(.body)
                .lineLimit(3)
                .foregroundStyle(.primary)

            // Metadata row
            HStack(spacing: 12) {
                // Author
                HStack(spacing: 4) {
                    Image(systemName: "person.fill")
                        .font(.caption2)
                    Text(note.authorDisplayName)
                        .font(.caption)
                }
                .foregroundStyle(.secondary)

                // Call/Conversation badge
                if note.callId != nil {
                    badgeView(icon: "phone.fill", text: NSLocalizedString("notes_call_badge", comment: "Call"), color: .blue)
                }
                if note.conversationId != nil {
                    badgeView(icon: "message.fill", text: NSLocalizedString("notes_conversation_badge", comment: "Chat"), color: .green)
                }

                Spacer()

                // Date
                Text(note.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func badgeView(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.caption2)
                .fontWeight(.medium)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule().fill(color.opacity(0.12))
        )
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Notes - Empty") {
    NotesView()
        .environment(AppState())
        .environment(Router())
}
#endif
