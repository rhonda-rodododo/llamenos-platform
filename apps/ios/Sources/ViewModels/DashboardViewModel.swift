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

/// View model for the main dashboard. Loads clock-in state (via the shared
/// ShiftClockService), recent note previews, and subscribes to WebSocket events
/// for real-time updates.
@Observable
final class DashboardViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService
    private let webSocketService: WebSocketService
    private let hubContext: HubContext
    private let clock: ShiftClockService

    /// Current shift badge status.
    var shiftStatus: ShiftStatus = .offShift

    /// Whether the volunteer is currently clocked in.
    var isOnShift: Bool { clock.isClockedIn }

    /// Whether a clock in/out operation is in flight.
    var isTogglingClock: Bool { clock.isToggling }

    /// The scheduled shift active right now, if any.
    var currentShift: CurrentShift? { clock.currentShift }

    /// The next upcoming scheduled shift, if any.
    var nextShift: NextShift? { clock.nextShift }

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

    /// Whether the clock out confirmation dialog is showing.
    var showClockOutConfirmation: Bool = false

    /// Whether the dashboard is currently loading data.
    var isLoading: Bool = false

    /// Error message from the last failed operation.
    var errorMessage: String?

    /// Active clock-in timer display string.
    var elapsedTimeDisplay: String {
        clock.elapsedTimeDisplay
    }

    /// Background tasks
    private var eventTask: Task<Void, Never>?

    init(apiService: APIService, cryptoService: CryptoService, webSocketService: WebSocketService, hubContext: HubContext, shiftClockService: ShiftClockService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
        self.webSocketService = webSocketService
        self.hubContext = hubContext
        self.clock = shiftClockService
    }

    // MARK: - Data Loading

    /// Load dashboard data from the API.
    func loadDashboard() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        // Fetch clock/schedule state, active call, and recent notes in parallel
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

    // MARK: - Clock In / Out

    /// Clock in from the dashboard quick toggle.
    func clockIn() async {
        errorMessage = nil
        let ok = await clock.clockIn()
        if !ok {
            errorMessage = clock.lastError
        }
        updateShiftStatusBadge()
    }

    /// Clock out from the dashboard quick toggle.
    func clockOut() async {
        errorMessage = nil
        let ok = await clock.clockOut()
        if !ok {
            errorMessage = clock.lastError
        }
        updateShiftStatusBadge()
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
        case .deviceWipe, .unknown:
            break
        }
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
            let response: ProtocolActiveCallsResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/calls/active")
            )
            activeCallCount = response.calls.count
            if let first = response.calls.first {
                // Attempt E2EE decryption of call metadata
                var callerNumber = first.callerLast4
                if let encryptedContent = first.encryptedContent,
                   let envelopes = first.adminEnvelopes, !envelopes.isEmpty {
                    let tuples = envelopes.map { (pubkey: $0.pubkey, enc: $0.enc, ct: $0.ct) }
                    if let decrypted = cryptoService.decryptCallMetadata(
                        encryptedContent: encryptedContent,
                        adminEnvelopes: tuples
                    ) {
                        callerNumber = decrypted.callerNumber
                    }
                }
                currentCall = ActiveCall(
                    id: first.id,
                    callerNumber: callerNumber,
                    startedAt: DateFormatting.parseISO(first.startedAt) ?? Date(),
                    status: first.status?.rawValue ?? "unknown"
                )
            } else {
                currentCall = nil
            }
            updateShiftStatusBadge()
        } catch {
            // Non-fatal — active call state will be updated on next event
        }
    }

    private func fetchShiftStatus() async {
        await clock.refresh()
        updateShiftStatusBadge()
        if let clockError = clock.lastError {
            errorMessage = clockError
        }
    }

    /// Reflect clock state (and any active call) onto the badge status.
    private func updateShiftStatusBadge() {
        if currentCall != nil, clock.isClockedIn {
            shiftStatus = .onCall
        } else {
            shiftStatus = clock.isClockedIn ? .onShift : .offShift
        }
    }

    private func fetchRecentNotes() async {
        do {
            let response: NotesListResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/notes") + "?page=1&limit=3"
            )

            recentNoteCount = response.total

            // Decrypt the recent notes for preview using HPKE envelopes
            recentNotes = response.notes.prefix(3).compactMap { encrypted -> RecentNotePreview? in
                guard let ourPubkey = cryptoService.encryptionPubkeyHex else { return nil }

                var hpkeEnvelope: HpkeEnvelope?

                if encrypted.authorPubkey == ourPubkey, let authorEnv = encrypted.authorEnvelope {
                    hpkeEnvelope = HpkeEnvelope(v: 3, labelId: 0, enc: authorEnv.enc, ct: authorEnv.ct)
                }

                if hpkeEnvelope == nil, let adminEnvs = encrypted.adminEnvelopes {
                    if let ourEnv = adminEnvs.first(where: { $0.pubkey == ourPubkey }) {
                        hpkeEnvelope = HpkeEnvelope(v: 3, labelId: 0, enc: ourEnv.enc, ct: ourEnv.ct)
                    }
                }

                guard let envelope = hpkeEnvelope else { return nil }

                do {
                    let json = try cryptoService.decryptNote(
                        ciphertextHex: encrypted.encryptedContent,
                        envelope: envelope
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
    }
}

