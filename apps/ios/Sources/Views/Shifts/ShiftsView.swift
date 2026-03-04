import SwiftUI

// MARK: - ShiftsView

/// Shifts tab view showing weekly schedule, clock in/out toggle, and shift signup.
/// Groups shifts by day of week with today highlighted.
struct ShiftsView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: ShiftsViewModel?

    var body: some View {
        let vm = resolvedViewModel

        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Clock In/Out card
                    clockCard(vm: vm)

                    // Error/Success messages
                    if let error = vm.errorMessage {
                        messageCard(text: error, icon: "exclamationmark.triangle.fill", color: .orange)
                            .accessibilityIdentifier("shifts-error")
                    }

                    if let success = vm.successMessage {
                        messageCard(text: success, icon: "checkmark.circle.fill", color: .green)
                            .accessibilityIdentifier("shifts-success")
                    }

                    // Weekly schedule
                    if vm.isLoading && vm.shifts.isEmpty {
                        loadingState
                    } else if vm.shiftDays.isEmpty {
                        emptyState
                    } else {
                        weeklySchedule(vm: vm)
                    }

                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 20)
            }
            .navigationTitle(NSLocalizedString("shifts_title", comment: "Shifts"))
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await vm.refresh()
            }
            .task {
                await vm.loadShifts()
            }
            .alert(
                NSLocalizedString("shifts_clock_out_title", comment: "End Shift?"),
                isPresented: Binding(
                    get: { vm.showClockOutConfirmation },
                    set: { vm.showClockOutConfirmation = $0 }
                )
            ) {
                Button(NSLocalizedString("cancel", comment: "Cancel"), role: .cancel) {}
                Button(NSLocalizedString("shifts_clock_out_confirm", comment: "Clock Out"), role: .destructive) {
                    Task { await vm.clockOut() }
                }
            } message: {
                Text(NSLocalizedString(
                    "shifts_clock_out_message",
                    comment: "You will stop receiving incoming calls."
                ))
            }
        }
    }

    // MARK: - Clock In/Out Card

    @ViewBuilder
    private func clockCard(vm: ShiftsViewModel) -> some View {
        VStack(spacing: 16) {
            // Status indicator
            HStack(spacing: 12) {
                Circle()
                    .fill(vm.isOnShift ? Color.green : Color.secondary.opacity(0.3))
                    .frame(width: 12, height: 12)
                    .overlay(
                        Circle()
                            .stroke(vm.isOnShift ? Color.green.opacity(0.3) : Color.clear, lineWidth: 4)
                    )

                Text(vm.isOnShift
                    ? NSLocalizedString("shifts_on_shift", comment: "On Shift")
                    : NSLocalizedString("shifts_off_shift", comment: "Off Shift")
                )
                .font(.headline)
                .accessibilityIdentifier("shift-status-label")

                Spacer()

                if vm.isOnShift {
                    Text(vm.elapsedTimeDisplay)
                        .font(.system(.title3, design: .monospaced))
                        .fontWeight(.medium)
                        .foregroundStyle(.green)
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("shift-elapsed-time")
                }
            }

            // Active call count when on shift
            if vm.isOnShift, vm.activeCallCount > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "phone.fill")
                        .foregroundStyle(.blue)
                    Text(String(
                        format: NSLocalizedString("shifts_active_calls", comment: "%d active call(s)"),
                        vm.activeCallCount
                    ))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    Spacer()
                }
            }

            // Clock in/out button
            Button {
                if vm.isOnShift {
                    vm.showClockOutConfirmation = true
                } else {
                    Task { await vm.clockIn() }
                }
            } label: {
                HStack(spacing: 8) {
                    if vm.isTogglingShift {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: vm.isOnShift ? "stop.circle.fill" : "play.circle.fill")
                    }
                    Text(vm.isOnShift
                        ? NSLocalizedString("shifts_clock_out", comment: "Clock Out")
                        : NSLocalizedString("shifts_clock_in", comment: "Clock In")
                    )
                    .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(vm.isOnShift ? .red : .green)
            .disabled(vm.isTogglingShift)
            .accessibilityIdentifier(vm.isOnShift ? "clock-out-button" : "clock-in-button")
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemGray6))
        )
    }

    // MARK: - Weekly Schedule

    @ViewBuilder
    private func weeklySchedule(vm: ShiftsViewModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(NSLocalizedString("shifts_weekly_schedule", comment: "Weekly Schedule"))
                .font(.headline)
                .accessibilityIdentifier("weekly-schedule-header")

            ForEach(vm.shiftDays) { shiftDay in
                daySection(shiftDay, vm: vm)
            }
        }
    }

    @ViewBuilder
    private func daySection(_ shiftDay: ShiftDay, vm: ShiftsViewModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Day header
            HStack {
                Text(shiftDay.name)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(shiftDay.isToday ? .primary : .secondary)

                if shiftDay.isToday {
                    Text(NSLocalizedString("shifts_today", comment: "Today"))
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.blue))
                }

                Spacer()

                Text(String(
                    format: NSLocalizedString("shifts_count", comment: "%d shift(s)"),
                    shiftDay.shifts.count
                ))
                .font(.caption)
                .foregroundStyle(.tertiary)
            }

            if shiftDay.shifts.isEmpty {
                Text(NSLocalizedString("shifts_none_scheduled", comment: "No shifts scheduled"))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.vertical, 4)
            } else {
                ForEach(shiftDay.shifts) { shift in
                    shiftCard(shift, vm: vm)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("shift-day-\(shiftDay.id)")
    }

    @ViewBuilder
    private func shiftCard(_ shift: Shift, vm: ShiftsViewModel) -> some View {
        HStack(spacing: 12) {
            // Time range
            VStack(alignment: .leading, spacing: 2) {
                Text(shift.timeRangeDisplay)
                    .font(.subheadline)
                    .fontWeight(.medium)

                if let name = shift.name {
                    Text(name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            // Volunteer count
            HStack(spacing: 4) {
                Image(systemName: "person.2.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(shift.volunteerCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Sign up button
            Button {
                Task { await vm.signUp(for: shift) }
            } label: {
                Text(NSLocalizedString("shifts_sign_up", comment: "Sign Up"))
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityIdentifier("signup-shift-\(shift.id)")
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        )
        .accessibilityIdentifier("shift-card-\(shift.id)")
    }

    // MARK: - Message Card

    @ViewBuilder
    private func messageCard(text: String, icon: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(color.opacity(0.1))
        )
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                NSLocalizedString("shifts_empty_title", comment: "No Shifts"),
                systemImage: "calendar"
            )
        } description: {
            Text(NSLocalizedString(
                "shifts_empty_message",
                comment: "No shifts have been configured yet. Contact your administrator."
            ))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("shifts-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("shifts_loading", comment: "Loading schedule..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("shifts-loading")
    }

    // MARK: - ViewModel Resolution

    private var resolvedViewModel: ShiftsViewModel {
        if let vm = viewModel {
            return vm
        }
        let vm = ShiftsViewModel(apiService: appState.apiService, cryptoService: appState.cryptoService)
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Shifts - Off Shift") {
    ShiftsView()
        .environment(AppState())
}
#endif
