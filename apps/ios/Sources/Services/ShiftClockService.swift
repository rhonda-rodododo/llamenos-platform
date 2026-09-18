import Foundation
import UIKit

// MARK: - ShiftClockService

/// Single source of truth for the volunteer's clock-in state.
///
/// The backend tracks clocked-in volunteers in the active-shifts roster
/// (`POST /api/shifts/clock-in|clock-out|heartbeat`). The roster is what makes a
/// volunteer eligible for parallel ringing; on iOS the ringing channel itself is the
/// SIP account registered with Linphone when clocked in.
///
/// There is no volunteer-readable endpoint that reports roster membership, so the
/// service persists the last confirmed clock state per hub in UserDefaults and
/// reconciles on refresh: a 404 from the heartbeat endpoint means the server no
/// longer considers us clocked in (stale cleanup or clock-out elsewhere).
@Observable
final class ShiftClockService {
    private let apiService: APIService
    private let cryptoService: CryptoService
    private let hubContext: HubContext
    private let linphoneService: any LinphoneServiceProtocol

    // MARK: - Public State

    /// Whether the volunteer is currently clocked in (roster member), per the last
    /// successful server confirmation or local persistence awaiting reconciliation.
    private(set) var isClockedIn: Bool = false

    /// When the current clock-in started, for the elapsed timer.
    private(set) var clockedInAt: Date?

    /// The scheduled shift that is active right now (nil outside scheduled shifts).
    private(set) var currentShift: CurrentShift?

    /// The next upcoming scheduled shift for this volunteer, if any.
    private(set) var nextShift: NextShift?

    /// Whether a clock in/out request is in flight.
    private(set) var isToggling: Bool = false

    /// Error message from the last failed clock operation.
    var lastError: String?

    /// Success message from the last completed clock operation.
    var lastSuccess: String?

    /// Elapsed time string for the active clock-in period.
    var elapsedTimeDisplay: String {
        guard let clockedInAt else { return "--:--:--" }
        let elapsed = max(0, Date().timeIntervalSince(clockedInAt))
        let hours = Int(elapsed) / 3600
        let minutes = (Int(elapsed) % 3600) / 60
        let seconds = Int(elapsed) % 60
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }

    // MARK: - Private State

    private var heartbeatTask: Task<Void, Never>?
    private var timerTask: Task<Void, Never>?

    /// Heartbeat interval. The server expires roster entries whose heartbeat is older
    /// than the hub's `heartbeatTimeout` setting, so beat well inside that window.
    private static let heartbeatInterval: Duration = .seconds(60)

    init(
        apiService: APIService,
        cryptoService: CryptoService,
        hubContext: HubContext,
        linphoneService: any LinphoneServiceProtocol
    ) {
        self.apiService = apiService
        self.cryptoService = cryptoService
        self.hubContext = hubContext
        self.linphoneService = linphoneService
    }

    // MARK: - Persistence (per-hub last confirmed clock state)

    private static func persistenceKey(hubId: String) -> String {
        "shiftClock.clockedInAt.\(hubId)"
    }

    private func persistClockedIn(at date: Date) {
        guard let hubId = hubContext.activeHubId else { return }
        UserDefaults.standard.set(
            ISO8601DateFormatter().string(from: date),
            forKey: Self.persistenceKey(hubId: hubId)
        )
    }

    private func clearPersistedState() {
        guard let hubId = hubContext.activeHubId else { return }
        UserDefaults.standard.removeObject(forKey: Self.persistenceKey(hubId: hubId))
    }

    private func persistedClockedInAt() -> Date? {
        guard let hubId = hubContext.activeHubId,
              let raw = UserDefaults.standard.string(forKey: Self.persistenceKey(hubId: hubId)) else {
            return nil
        }
        return DateFormatting.parseISO(raw)
    }

    // MARK: - Refresh

    /// Refresh schedule info (current/next shift) and reconcile clock state with the
    /// server. Called on view appear, hub change, and after clock operations.
    func refresh() async {
        // Restore locally persisted clock state for this hub before reconciling.
        if let persisted = persistedClockedInAt() {
            isClockedIn = true
            clockedInAt = persisted
        } else {
            isClockedIn = false
            clockedInAt = nil
        }

        do {
            let status: ShiftStatusResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/shifts/my-status")
            )
            currentShift = status.currentShift
            nextShift = status.nextShift
        } catch {
            if case APIError.noBaseURL = error {
                // Hub not configured — not an error worth surfacing
            } else {
                lastError = error.localizedDescription
            }
            currentShift = nil
            nextShift = nil
        }

        // Reconcile: if we believe we're clocked in, prove it with a heartbeat.
        // A 404 means the server dropped us from the roster (stale cleanup or a
        // clock-out from another device) — fall back to clocked-out state.
        if isClockedIn {
            let alive = await sendHeartbeat()
            if alive {
                startHeartbeatLoop()
                startTimer()
            } else {
                applyClockedOutState()
            }
        } else {
            stopHeartbeatLoop()
            stopTimer()
        }

        #if UI_TESTING
        await refreshTestRosterMembership()
        #endif
    }

    // MARK: - Clock In / Out

    /// Clock in: join the hub's active roster and register for incoming calls.
    /// Returns true on success. On failure the state is left untouched and
    /// `lastError` describes what happened — the UI never claims a clock-in the
    /// server did not record.
    @discardableResult
    func clockIn() async -> Bool {
        guard !isToggling else { return false }
        isToggling = true
        lastError = nil
        lastSuccess = nil

        do {
            let _: ClockInResponse = try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/shifts/clock-in")
            )

            let now = Date()
            isClockedIn = true
            clockedInAt = now
            persistClockedIn(at: now)
            startHeartbeatLoop()
            startTimer()

            // Register the SIP account so this device rings for hub calls.
            if let hubId = hubContext.activeHubId,
               let sipParams = try? await apiService.getSipToken(hubId: hubId) {
                await onShiftStarted(hubId: hubId, sipParams: sipParams)
            }

            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()

            lastSuccess = NSLocalizedString("shifts_clocked_in", comment: "You are now on shift")

            // Pull schedule info so the dashboard can show the active shift.
            await refreshScheduleOnly()

            #if UI_TESTING
            await refreshTestRosterMembership()
            #endif

            isToggling = false
            return true
        } catch {
            lastError = Self.clockErrorMessage(error, clockIn: true)
            isToggling = false
            return false
        }
    }

    /// Clock out: leave the hub's active roster and stop receiving calls.
    /// A 404 (not on the roster) is reconciled as success — the desired end state
    /// (not clocked in) already holds on the server.
    @discardableResult
    func clockOut() async -> Bool {
        guard !isToggling else { return false }
        isToggling = true
        lastError = nil
        lastSuccess = nil

        do {
            let _: ClockOutResponse = try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/shifts/clock-out")
            )

            applyClockedOutState()

            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()

            lastSuccess = NSLocalizedString("shifts_clocked_out", comment: "You are now off shift")

            #if UI_TESTING
            await refreshTestRosterMembership()
            #endif

            isToggling = false
            return true
        } catch {
            if case APIError.requestFailed(let statusCode, _) = error, statusCode == 404 {
                // Server already considers us clocked out — reconcile silently.
                applyClockedOutState()
                isToggling = false
                return true
            }
            lastError = Self.clockErrorMessage(error, clockIn: false)
            isToggling = false
            return false
        }
    }

    /// Stop clock-related background work when the app locks.
    /// The server roster entry persists; state reconciles on next unlock via refresh().
    func suspend() {
        stopHeartbeatLoop()
        stopTimer()
    }

    // MARK: - Private Helpers

    /// Reset to clocked-out state everywhere: local state, persistence, heartbeat,
    /// timer, and the SIP account (so the device stops ringing).
    private func applyClockedOutState() {
        isClockedIn = false
        clockedInAt = nil
        clearPersistedState()
        stopHeartbeatLoop()
        stopTimer()
        if let hubId = hubContext.activeHubId {
            onShiftEnded(hubId: hubId)
        }
    }

    // MARK: - SIP Account Lifecycle

    /// Register a SIP account with Linphone for the given hub. Called after clock-in
    /// succeeds so the volunteer receives VoIP calls. Errors are swallowed — SIP
    /// registration is best-effort and must not fail the clock-in.
    func onShiftStarted(hubId: String, sipParams: SipTokenResponse) async {
        do {
            try linphoneService.registerHubAccount(hubId: hubId, sipParams: sipParams)
        } catch {}
    }

    /// Unregister the SIP account for the given hub. Called after clock-out so the
    /// volunteer stops receiving VoIP calls.
    func onShiftEnded(hubId: String) {
        linphoneService.unregisterHubAccount(hubId: hubId)
    }

    /// Refresh only the schedule portion of my-status (no clock reconciliation).
    private func refreshScheduleOnly() async {
        do {
            let status: ShiftStatusResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/shifts/my-status")
            )
            currentShift = status.currentShift
            nextShift = status.nextShift
        } catch {
            // Schedule info is best-effort — clock state is unaffected
        }
    }

    /// Send one heartbeat. Returns false only when the server says we are not on the
    /// roster (404); transient failures return true (retry on the next tick).
    private func sendHeartbeat() async -> Bool {
        do {
            let _: ClockOutResponse = try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/shifts/heartbeat")
            )
            return true
        } catch {
            if case APIError.requestFailed(let statusCode, _) = error, statusCode == 404 {
                return false
            }
            return true
        }
    }

    private func startHeartbeatLoop() {
        stopHeartbeatLoop()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.heartbeatInterval)
                guard !Task.isCancelled else { break }
                guard let self, self.isClockedIn else { break }
                let alive = await self.sendHeartbeat()
                if !alive {
                    await MainActor.run { self.applyClockedOutState() }
                    break
                }
            }
        }
    }

    private func stopHeartbeatLoop() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    private func startTimer() {
        stopTimer()
        timerTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                // Touch a stored property so @Observable re-evaluates elapsedTimeDisplay
                self?.clockedInAt = self?.clockedInAt
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    private func stopTimer() {
        timerTask?.cancel()
        timerTask = nil
    }

    /// Map an error to a clear, localized message. Network failures are queued for
    /// offline replay by APIService — the OfflineBanner communicates that; here we
    /// surface a plain clock-specific failure.
    private static func clockErrorMessage(_ error: Error, clockIn: Bool) -> String {
        let key = clockIn ? "dashboard_error_clock_in" : "dashboard_error_clock_out"
        let fallback = NSLocalizedString(key, comment: clockIn ? "Failed to clock in" : "Failed to clock out")
        if case APIError.requestFailed(let statusCode, let body) = error {
            return "\(fallback) (HTTP \(statusCode))\(body.isEmpty ? "" : ": \(body)")"
        }
        return fallback
    }

    // MARK: - UI Testing

    #if UI_TESTING
    /// Test-only view of server-side roster membership: "member", "not-member", or
    /// "unknown" (endpoint unreachable or caller lacks `shifts:manage`). Surfaced as a
    /// hidden accessibility element so XCUITest can assert ringing eligibility against
    /// actual server routing state, not just the clock-in API response.
    private(set) var testRosterMembership: String = "unknown"

    private struct TestActiveShiftsResponse: Decodable {
        struct Entry: Decodable { let pubkey: String }
        let activeShifts: [Entry]
    }

    func refreshTestRosterMembership() async {
        guard let ownPubkey = cryptoService.signingPubkeyHex else {
            testRosterMembership = "unknown"
            return
        }
        do {
            let response: TestActiveShiftsResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/shifts/active")
            )
            testRosterMembership = response.activeShifts.contains { $0.pubkey == ownPubkey }
                ? "member"
                : "not-member"
        } catch {
            testRosterMembership = "unknown"
        }
    }
    #endif

    deinit {
        heartbeatTask?.cancel()
        timerTask?.cancel()
    }
}
