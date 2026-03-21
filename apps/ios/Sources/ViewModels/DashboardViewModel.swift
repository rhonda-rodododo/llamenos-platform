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
    private let hubContext: HubContext

    /// Current shift status.
    var shiftStatus: ShiftStatus = .offShift

    /// Convenience: whether the volunteer is currently on shift.
    var isOnShift: Bool { shiftStatus.isOnShift }

    /// When the current shift started, for the elapsed timer.
    var shiftStartedAt: Date?

    /// Number of active calls (loaded from API).
    var activeCallCount: Int = 0

    /// The current volunteer's active call (if any).
    var currentCall: ActiveCall?

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

    init(apiService: APIService, cryptoService: CryptoService, webSocketService: WebSocketService, hubContext: HubContext) {
        self.apiService = apiService
        self.cryptoService = cryptoService
        self.webSocketService = webSocketService
        self.hubContext = hubContext
    }

    // MARK: - Data Loading

    /// Load dashboard data from the API.
    func loadDashboard() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        // Fetch shift status, active call, and recent notes in parallel
        async let statusResult: Void = fetchShiftStatus()
        async let notesResult: Void = fetchRecentNotes()
        async let callResult: Void = fetchActiveCall()

        await statusResult
        await notesResult
        await callResult

        isLoading = false
    }

    /// Refresh dashboard data.
    func refresh() async {
        isLoading = false
        await loadDashboard()
    }

    // MARK: - WebSocket Events

    /// Start listening for real-time typed WebSocket events.
    func startEventListener() {
        eventTask?.cancel()
        eventTask = Task { [weak self] in
            guard let self else { return }
            for await attributed in self.webSocketService.attributedEvents {
                guard !Task.isCancelled else { break }
                guard attributed.hubId == self.hubContext.activeHubId else { continue }
                await self.handleTypedEvent(attributed.event)
            }
        }
    }

    /// Stop listening for WebSocket events.
    func stopEventListener() {
        eventTask?.cancel()
        eventTask = nil
        stopTimer()
    }

    /// Handle a decrypted, typed hub event and refresh only relevant data.
    @MainActor
    private func handleTypedEvent(_ eventType: HubEventType) {
        switch eventType {
        case .callRing, .callAnswered, .callUpdate, .voicemailNew, .presenceSummary, .presenceDetail:
            // Call/presence events affect shift status (active calls, availability)
            Task {
                await fetchShiftStatus()
                await fetchActiveCall()
            }
        case .callEnded:
            // Call ended — clear active call immediately, then refresh
            currentCall = nil
            Task { await fetchShiftStatus() }
        case .shiftStarted, .shiftEnded, .shiftUpdate:
            Task { await fetchShiftStatus() }
        case .noteCreated:
            Task { await fetchRecentNotes() }
        case .messageNew, .messageStatus, .conversationNew, .conversationAssigned, .conversationClosed:
            // Message events don't affect dashboard — handled by ConversationsViewModel
            break
        case .unknown:
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

    // MARK: - Call Actions

    /// Hang up the current active call.
    func hangupCall() async {
        guard let callId = currentCall?.id else { return }
        do {
            try await apiService.request(method: "POST", path: apiService.hp("/api/calls/\(callId)/hangup"))
            currentCall = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Report the current active call as spam.
    func reportSpam() async {
        guard let callId = currentCall?.id else { return }
        do {
            try await apiService.request(method: "POST", path: apiService.hp("/api/calls/\(callId)/spam"))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Ban the caller and hang up.
    func banAndHangup(reason: String?) async {
        guard let callId = currentCall?.id else { return }
        do {
            let body: [String: String]? = reason.map { ["reason": $0] }
            if let body {
                try await apiService.request(method: "POST", path: apiService.hp("/api/calls/\(callId)/ban"), body: body)
            } else {
                try await apiService.request(method: "POST", path: apiService.hp("/api/calls/\(callId)/ban"))
            }
            currentCall = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private Helpers

    /// Fetch the volunteer's active call (if any).
    private func fetchActiveCall() async {
        do {
            let response: ActiveCallsResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/calls/active")
            )
            if let first = response.calls.first {
                currentCall = ActiveCall(
                    id: first.id,
                    callerNumber: first.callerLast4,
                    startedAt: DateFormatting.parseISO(first.startedAt) ?? Date(),
                    status: first.status?.rawValue ?? "unknown"
                )
            } else {
                currentCall = nil
            }
        } catch {
            // Non-fatal — active call state will be updated on next event
        }
    }

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
                path: apiService.hp("/api/notes") + "?page=1&limit=3"
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
                        hasCall: encrypted.callID != nil,
                        hasConversation: encrypted.conversationID != nil
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

