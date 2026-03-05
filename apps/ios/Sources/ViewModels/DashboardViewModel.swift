import Foundation

// MARK: - ShiftStatus

/// The volunteer's current shift status.
enum ShiftStatus: Equatable {
    /// Not currently on shift.
    case offShift
    /// On shift and available to receive calls.
    case onShift
    /// On shift but currently on a call.
    case onCall
    /// Loading shift status from the API.
    case loading
    /// Failed to load shift status.
    case error(String)

    var isOnShift: Bool {
        self == .onShift || self == .onCall
    }
}

// MARK: - RecentNotePreview

/// Lightweight preview of a recent note for the dashboard.
struct RecentNotePreview: Identifiable, Sendable {
    let id: String
    let preview: String
    let createdAt: Date
    let hasCall: Bool
    let hasConversation: Bool
}

// MARK: - DashboardViewModel

/// View model for the main dashboard. Loads shift status, recent note previews,
/// and subscribes to WebSocket events for real-time updates.
@Observable
final class DashboardViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService
    private let webSocketService: WebSocketService

    /// Current shift status.
    var shiftStatus: ShiftStatus = .offShift

    /// Convenience: whether the volunteer is currently on shift.
    var isOnShift: Bool { shiftStatus.isOnShift }

    /// When the current shift started, for the elapsed timer.
    var shiftStartedAt: Date?

    /// Number of active calls (loaded from API).
    var activeCallCount: Int = 0

    /// Number of recent notes (loaded from API).
    var recentNoteCount: Int = 0

    /// Recent note previews (last 3).
    var recentNotes: [RecentNotePreview] = []

    /// Whether the logout confirmation dialog is showing.
    var showLogoutConfirmation: Bool = false

    /// Whether the dashboard is currently loading data.
    var isLoading: Bool = false

    /// Error message from the last failed operation.
    var errorMessage: String?

    /// Active shift timer display string.
    var elapsedTimeDisplay: String {
        guard let startedAt = shiftStartedAt else { return "--:--:--" }
        let elapsed = Date().timeIntervalSince(startedAt)
        let hours = Int(elapsed) / 3600
        let minutes = (Int(elapsed) % 3600) / 60
        let seconds = Int(elapsed) % 60
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }

    /// Background tasks
    private var eventTask: Task<Void, Never>?
    private var timerTask: Task<Void, Never>?

    init(apiService: APIService, cryptoService: CryptoService, webSocketService: WebSocketService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
        self.webSocketService = webSocketService
    }

    // MARK: - Data Loading

    /// Load dashboard data from the API.
    func loadDashboard() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        // Fetch shift status and recent notes in parallel
        async let statusResult: Void = fetchShiftStatus()
        async let notesResult: Void = fetchRecentNotes()

        await statusResult
        await notesResult

        isLoading = false
    }

    /// Refresh dashboard data.
    func refresh() async {
        isLoading = false
        await loadDashboard()
    }

    // MARK: - WebSocket Events

    /// Start listening for real-time WebSocket events.
    func startEventListener() {
        eventTask?.cancel()
        eventTask = Task { [weak self] in
            guard let self else { return }
            for await event in self.webSocketService.events {
                guard !Task.isCancelled else { break }
                await self.handleEvent(event)
            }
        }
    }

    /// Stop listening for WebSocket events.
    func stopEventListener() {
        eventTask?.cancel()
        eventTask = nil
        stopTimer()
    }

    /// Handle an incoming Nostr event and update dashboard state.
    @MainActor
    private func handleEvent(_ event: NostrEvent) {
        let eventType = WebSocketService.extractEventType(from: event)
        switch eventType {
        case .noteCreated, .noteUpdated:
            // Refresh notes on note events
            Task { await fetchRecentNotes() }

        case .shiftUpdate:
            // Refresh shift status
            Task { await fetchShiftStatus() }

        case .callIncoming:
            // Increment active call count
            activeCallCount += 1

        case .callEnded:
            // Decrement active call count
            activeCallCount = max(0, activeCallCount - 1)

        default:
            break
        }
    }

    // MARK: - Timer

    func startTimer() {
        stopTimer()
        timerTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                // Touch a property to trigger @Observable re-evaluation
                self?.shiftStartedAt = self?.shiftStartedAt
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    func stopTimer() {
        timerTask?.cancel()
        timerTask = nil
    }

    // MARK: - Private Helpers

    private func fetchShiftStatus() async {
        do {
            let status: DashboardShiftStatusResponse = try await apiService.request(
                method: "GET",
                path: "/api/shifts/my-status"
            )
            shiftStatus = status.onShift ? .onShift : .offShift
            activeCallCount = status.activeCallCount ?? 0
            recentNoteCount = status.recentNoteCount ?? 0

            if status.onShift, let startedAtString = status.startedAt {
                shiftStartedAt = DateFormatting.parseISO(startedAtString)
                startTimer()
            } else {
                shiftStartedAt = nil
                stopTimer()
            }
        } catch {
            shiftStatus = .offShift
            activeCallCount = 0
            if case APIError.noBaseURL = error {
                // Expected when hub isn't configured yet
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func fetchRecentNotes() async {
        do {
            let response: NotesListResponse = try await apiService.request(
                method: "GET",
                path: "/api/notes?page=1&limit=3"
            )

            recentNoteCount = response.total

            // Decrypt the recent notes for preview
            recentNotes = response.notes.prefix(3).compactMap { encrypted -> RecentNotePreview? in
                guard let ourPubkey = cryptoService.pubkey else { return nil }

                var wrappedKey: String?
                var ephemeralPubkey: String?

                if encrypted.authorPubkey == ourPubkey, let authorEnv = encrypted.authorEnvelope {
                    wrappedKey = authorEnv.wrappedKey
                    ephemeralPubkey = authorEnv.ephemeralPubkey
                }

                if wrappedKey == nil, let adminEnvs = encrypted.adminEnvelopes {
                    if let ourEnv = adminEnvs.first(where: { $0.pubkey == ourPubkey }) {
                        wrappedKey = ourEnv.wrappedKey
                        ephemeralPubkey = ourEnv.ephemeralPubkey
                    }
                }

                guard let wk = wrappedKey, let epk = ephemeralPubkey else { return nil }

                do {
                    let json = try cryptoService.decryptNoteContent(
                        encryptedContent: encrypted.encryptedContent,
                        wrappedKey: wk,
                        ephemeralPubkey: epk
                    )
                    let decoder = JSONDecoder()
                    decoder.keyDecodingStrategy = .convertFromSnakeCase
                    let payload = try decoder.decode(NotePayload.self, from: Data(json.utf8))

                    let previewText = payload.text.count > 80
                        ? String(payload.text.prefix(80)) + "..."
                        : payload.text

                    return RecentNotePreview(
                        id: encrypted.id,
                        preview: previewText,
                        createdAt: DateFormatting.parseISO(encrypted.createdAt) ?? Date(),
                        hasCall: encrypted.callId != nil,
                        hasConversation: encrypted.conversationId != nil
                    )
                } catch {
                    return nil
                }
            }
        } catch {
            if case APIError.noBaseURL = error {
                // Expected when hub isn't configured yet
            }
            // Don't overwrite shift error
        }
    }


    deinit {
        eventTask?.cancel()
        timerTask?.cancel()
    }
}

// MARK: - API Response Types

/// Response from the shift status endpoint.
private struct DashboardShiftStatusResponse: Decodable {
    let onShift: Bool
    let shiftId: String?
    let startedAt: String?
    let activeCallCount: Int?
    let recentNoteCount: Int?
}
