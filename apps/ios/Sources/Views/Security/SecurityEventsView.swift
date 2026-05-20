import SwiftUI

struct SecurityEventsView: View {
    @Environment(AppState.self) private var appState
    @State private var events: [SecurityEventListResponseEvent] = []
    @State private var loading = true
    @State private var total = 0

    var body: some View {
        List {
            if loading {
                ProgressView()
            } else {
                ForEach(events, id: \.id) { event in
                    HStack {
                        Image(systemName: iconForEventType(event.eventType))
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.eventType.rawValue)
                                .font(.body)
                            Text(event.createdAt)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(String(localized: "security_history_title"))
        .task { await loadEvents() }
    }

    private func loadEvents() async {
        do {
            let response: SecurityEventListResponse = try await appState.apiService.request(method: "GET", path: "/api/security-events?limit=50&offset=0")
            self.events = response.events
            self.total = Int(response.total)
        } catch {
            // Handle error
        }
        loading = false
    }

    private func iconForEventType(_ type: SharedEventType) -> String {
        switch type {
        case .deviceRegister, .deviceRemove, .deviceRename: return "iphone"
        case .sessionCreate, .sessionTerminate, .sessionTerminateAll: return "key.fill"
        case .accountLockdown, .accountLockdownComplete: return "shield.fill"
        case .webauthnRegister, .webauthnAuthenticate: return "key.fill"
        default: return "exclamationmark.triangle"
        }
    }
}
