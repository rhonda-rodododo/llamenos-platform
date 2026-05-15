import SwiftUI

struct SessionListView: View {
    @Environment(AppState.self) private var appState
    @State private var sessions: [SessionResponse] = []
    @State private var loading = true

    var body: some View {
        List {
            if loading {
                ProgressView()
            } else {
                ForEach(sessions, id: \.token) { session in
                    SessionRow(session: session)
                }
            }
        }
        .navigationTitle(String(localized: "security_sessions_title"))
        .task { await loadSessions() }
    }

    private func loadSessions() async {
        do {
            let response: SessionListResponse = try await appState.apiService.request(method: "GET", path: "/api/sessions")
            self.sessions = response.sessions
        } catch {
            // Handle error
        }
        loading = false
    }
}

struct SessionRow: View {
    let session: SessionResponse

    var body: some View {
        HStack {
            Image(systemName: "key.fill")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(session.platform ?? "Unknown")
                        .font(.body)
                    if session.isCurrent {
                        Text("Current")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.blue.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
                Text("Created: \(session.createdAt)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }
}
