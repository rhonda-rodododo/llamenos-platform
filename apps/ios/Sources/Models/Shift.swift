import Foundation

// MARK: - Shift

/// A scheduled shift from the API. Matches the protocol spec (Section 4.6).
struct Shift: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let startTime: String
    let endTime: String
    let days: [Int]          // 0 = Sunday, 6 = Saturday
    let volunteerPubkeys: [String]?
    let createdAt: String?
    let updatedAt: String?

    /// Parse the start time string into a Date using ISO 8601 or HH:mm format.
    var startDate: Date? {
        Self.parseTime(startTime)
    }

    /// Parse the end time string into a Date using ISO 8601 or HH:mm format.
    var endDate: Date? {
        Self.parseTime(endTime)
    }

    /// Human-readable time range (e.g., "09:00 - 17:00").
    var timeRangeDisplay: String {
        let start = formatTimeForDisplay(startTime)
        let end = formatTimeForDisplay(endTime)
        return "\(start) - \(end)"
    }

    /// Human-readable day names for this shift's days.
    var dayNames: [String] {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        let weekdaySymbols = formatter.shortWeekdaySymbols ?? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        return days.compactMap { day in
            guard day >= 0, day < weekdaySymbols.count else { return nil }
            return weekdaySymbols[day]
        }
    }

    /// Number of volunteers assigned to this shift.
    var volunteerCount: Int {
        volunteerPubkeys?.count ?? 0
    }

    /// Whether the current day of the week is one of this shift's days.
    var isActiveToday: Bool {
        let weekday = Calendar.current.component(.weekday, from: Date()) - 1  // Sunday = 0
        return days.contains(weekday)
    }

    // MARK: - Private Helpers

    private static func parseTime(_ timeString: String) -> Date? {
        // Try ISO 8601 first
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: timeString) {
            return date
        }
        // Fallback: try without fractional seconds
        isoFormatter.formatOptions = [.withInternetDateTime]
        if let date = isoFormatter.date(from: timeString) {
            return date
        }
        // Fallback: HH:mm format (shift schedules may just have times)
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"
        if let date = timeFormatter.date(from: timeString) {
            return date
        }
        return nil
    }

    private func formatTimeForDisplay(_ timeString: String) -> String {
        if let date = Self.parseTime(timeString) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        // If parsing fails, return the raw string
        return timeString
    }
}

// MARK: - ShiftStatusResponse

/// Response from `GET /api/shifts/my-status`.
struct ShiftStatusResponse: Codable, Sendable {
    let onShift: Bool
    let shiftId: String?
    let startedAt: String?
    let activeCallCount: Int?
    let recentNoteCount: Int?
}

// MARK: - ShiftsListResponse

/// API response wrapper for the shifts list.
struct ShiftsListResponse: Codable, Sendable {
    let shifts: [Shift]
}

// MARK: - ClockInResponse

/// Response from `POST /api/shifts/clock-in`.
struct ClockInResponse: Codable, Sendable {
    let ok: Bool
    let shiftId: String?
}

// MARK: - ClockOutResponse

/// Response from `POST /api/shifts/clock-out`.
struct ClockOutResponse: Codable, Sendable {
    let ok: Bool
}

// MARK: - ShiftSignupRequest

/// Request body for `POST /api/shifts/:id/signup`.
struct ShiftSignupRequest: Encodable, Sendable {
    let pubkey: String
}

// MARK: - ShiftDay

/// Helper for grouping shifts by day in the calendar view.
struct ShiftDay: Identifiable, Sendable {
    let id: Int          // day index 0-6
    let name: String     // full weekday name
    let shortName: String
    let shifts: [Shift]
    let isToday: Bool
}
