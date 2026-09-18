import Foundation
import UIKit

// MARK: - ShiftsViewModel

/// View model for the Shifts tab. Manages shift schedule display and shift signup,
/// grouping shifts by day for the weekly calendar view.
///
/// Clock-in state and clock in/out operations live in `ShiftClockService` (shared
/// with the dashboard) — this view model exposes them as passthroughs so the tab
/// and the dashboard never disagree about clock state.
@Observable
final class ShiftsViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService
    private let hubContext: HubContext
    private let clock: ShiftClockService

    // MARK: - Public State

    /// All shifts from the server.
    var shifts: [Shift] = []

    /// Shifts grouped by day of week for the calendar view.
    var shiftDays: [ShiftDay] = []

    /// Whether the initial load is in progress.
    var isLoading: Bool = false

    /// Error message from the last failed operation.
    var errorMessage: String?

    /// Success message after an action.
    var successMessage: String?

    /// Whether the clock out confirmation dialog is shown.
    var showClockOutConfirmation: Bool = false

    // MARK: - Clock State (delegated to ShiftClockService)

    var isOnShift: Bool { clock.isClockedIn }
    var isTogglingShift: Bool { clock.isToggling }
    var elapsedTimeDisplay: String { clock.elapsedTimeDisplay }
    var currentShift: CurrentShift? { clock.currentShift }
    var nextShift: NextShift? { clock.nextShift }

    // MARK: - Initialization

    init(
        apiService: APIService,
        cryptoService: CryptoService,
        hubContext: HubContext,
        shiftClockService: ShiftClockService
    ) {
        self.apiService = apiService
        self.cryptoService = cryptoService
        self.hubContext = hubContext
        self.clock = shiftClockService
    }

    // MARK: - Data Loading

    /// Load shifts and reconcile clock state with the server.
    func loadShifts() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        async let statusResult: Void = clock.refresh()
        async let shiftsResult: Void = fetchShifts()

        await statusResult
        await shiftsResult

        if let clockError = clock.lastError, errorMessage == nil {
            errorMessage = clockError
        }

        isLoading = false
    }

    /// Refresh shifts (pull-to-refresh).
    func refresh() async {
        isLoading = false
        await loadShifts()
    }

    // MARK: - Clock In / Out

    /// Clock in to start a shift.
    func clockIn() async {
        errorMessage = nil
        successMessage = nil
        let ok = await clock.clockIn()
        if ok {
            successMessage = clock.lastSuccess
        } else {
            errorMessage = clock.lastError
        }
    }

    /// Clock out to end the current shift.
    func clockOut() async {
        errorMessage = nil
        successMessage = nil
        let ok = await clock.clockOut()
        if ok {
            successMessage = clock.lastSuccess
        } else {
            errorMessage = clock.lastError
        }
    }

    /// Sign up for a specific shift.
    func signUp(for shift: Shift) async {
        guard let pubkey = cryptoService.pubkey else {
            errorMessage = NSLocalizedString("error_no_key_loaded", comment: "No key loaded")
            return
        }

        errorMessage = nil
        successMessage = nil

        do {
            let request = ShiftSignupRequest(pubkey: pubkey)
            try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/shifts/\(shift.id)/signup"),
                body: request
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            successMessage = String(
                format: NSLocalizedString("shifts_signed_up", comment: "Signed up for %@"),
                shift.encryptedName.isEmpty ? shift.timeRangeDisplay : shift.encryptedName
            )

            // Reload to show updated volunteer count
            await fetchShifts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private Helpers

    private func fetchShifts() async {
        do {
            let response: ShiftsListResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/shifts")
            )
            shifts = response.shifts
            groupShiftsByDay()
        } catch {
            if case APIError.noBaseURL = error {
                // Hub not configured — show empty schedule
            } else if errorMessage == nil {
                // Don't overwrite status error
                errorMessage = error.localizedDescription
            }
            shifts = []
            shiftDays = []
        }
    }

    /// Group shifts by their assigned days for the weekly calendar view.
    private func groupShiftsByDay() {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        let weekdays = formatter.weekdaySymbols ?? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let shortWeekdays = formatter.shortWeekdaySymbols ?? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

        let today = Calendar.current.component(.weekday, from: Date()) - 1  // 0-indexed, Sunday = 0

        shiftDays = (0..<7).map { dayIndex in
            let dayShifts = shifts.filter { $0.daysAsInt.contains(dayIndex) }
            return ShiftDay(
                id: dayIndex,
                name: weekdays[dayIndex],
                shortName: shortWeekdays[dayIndex],
                shifts: dayShifts,
                isToday: dayIndex == today
            )
        }
    }
}
