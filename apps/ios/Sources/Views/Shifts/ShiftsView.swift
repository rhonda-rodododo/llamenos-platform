import SwiftUI

// MARK: - ShiftsView

/// Shifts tab view showing weekly schedule, clock in/out toggle, and shift signup.
/// Uses a native iOS List with sections per day.
struct ShiftsView: View {
    @Environment(AppState.self) private var appState
    @Environment(HubContext.self) private var hubContext
    @State private var viewModel: ShiftsViewModel?

    var body: some View {
        let vm = resolvedViewModel

        NavigationStack {
            VStack(spacing: 0) {
                // Clock in/out is roster-based and independent of the schedule —
                // always visible, even when no shifts are configured
                clockCard(vm: vm)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                Group {
                    if vm.isLoading && vm.shifts.isEmpty {
                        loadingState
                    } else if vm.shiftDays.isEmpty && !vm.isLoading {
                        emptyState
                    } else {
                        shiftList(vm: vm)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle(NSLocalizedString("shifts_title", comment: "Shifts"))
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await vm.refresh()
            }
            .task(id: hubContext.activeHubId) {
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
                    .accessibilityIdentifier("clock-out-cancel")
                Button(NSLocalizedString("shifts_clock_out_confirm", comment: "Clock Out"), role: .destructive) {
                    Task { await vm.clockOut() }
                }
                .accessibilityIdentifier("clock-out-confirm")
            }
        }
    }

    // MARK: - Clock Card

    @ViewBuilder
    private func clockCard(vm: ShiftsViewModel) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                if vm.isOnShift {
                    StatusDot(status: .active, animated: true)
                } else {
                    StatusDot(status: .inactive)
                }

                Text(vm.isOnShift
                    ? NSLocalizedString("shifts_on_shift", comment: "On Shift")
                    : NSLocalizedString("shifts_off_shift", comment: "Off Shift")
                )
                .font(.brand(.headline))
                .foregroundStyle(vm.isOnShift ? Color.statusActive : Color.brandMutedForeground)
                .accessibilityIdentifier("shift-status-label")

                Spacer()

                if vm.isOnShift {
                    Text(vm.elapsedTimeDisplay)
                        .font(.brandMono(.title2))
                        .fontWeight(.medium)
                        .foregroundStyle(Color.statusActive)
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("shift-elapsed-time")
                }
            }

            // Active shift info when on shift
            if vm.isOnShift, let current = vm.currentShift {
                HStack(spacing: 8) {
                    Image(systemName: "clock.fill")
                        .foregroundStyle(Color.brandPrimary)
                    Text(current.timeRangeDisplay)
                        .font(.brand(.subheadline))
                        .foregroundStyle(Color.brandMutedForeground)
                    if let name = current.displayName {
                        Text(name)
                            .font(.brand(.subheadline))
                            .foregroundStyle(Color.brandMutedForeground)
                            .lineLimit(1)
                    }
                    Spacer()
                }
                .accessibilityIdentifier("shifts-current-shift")
            }

            // Circular clock in/out button
            Button {
                Haptics.impact(.medium)
                if vm.isOnShift {
                    vm.showClockOutConfirmation = true
                } else {
                    Task { await vm.clockIn() }
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(vm.isOnShift ? Color.brandDestructive : Color.statusActive)
                        .frame(width: 80, height: 80)
                        .shadow(color: (vm.isOnShift ? Color.brandDestructive : Color.statusActive).opacity(0.35), radius: 8, y: 4)

                    if vm.isTogglingShift {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: vm.isOnShift ? "stop.fill" : "play.fill")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                    }
                }
            }
            .buttonStyle(CircularClockButtonStyle())
            .disabled(vm.isTogglingShift)
            .accessibilityIdentifier(vm.isOnShift ? "clock-out-button" : "clock-in-button")

            Text(vm.isOnShift
                ? NSLocalizedString("shifts_clock_out", comment: "Clock Out")
                : NSLocalizedString("shifts_clock_in", comment: "Clock In")
            )
            .font(.brand(.caption))
            .fontWeight(.semibold)
            .foregroundStyle(vm.isOnShift ? Color.brandDestructive : Color.statusActive)

            // Error/Success messages
            if let error = vm.errorMessage {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text(error)
                        .font(.brand(.footnote))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("shifts-error")
            }

            if let success = vm.successMessage {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text(success)
                        .font(.brand(.footnote))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("shifts-success")
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Shift List

    @ViewBuilder
    private func shiftList(vm: ShiftsViewModel) -> some View {
        List {
            // Weekly schedule sections
            if !vm.shiftDays.isEmpty {
                ForEach(vm.shiftDays) { shiftDay in
                    Section {
                        if shiftDay.shifts.isEmpty {
                            Text(NSLocalizedString("shifts_none_scheduled", comment: "No shifts scheduled"))
                                .font(.brand(.caption))
                                .foregroundStyle(Color.brandMutedForeground)
                        } else {
                            ForEach(shiftDay.shifts) { shift in
                                shiftRow(shift, vm: vm)
                            }
                        }
                    } header: {
                        HStack(spacing: 8) {
                            Text(shiftDay.name)
                                .font(.brand(.subheadline))
                                .fontWeight(shiftDay.isToday ? .bold : .medium)
                                .foregroundStyle(shiftDay.isToday ? Color.brandForeground : Color.brandMutedForeground)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(
                                    Capsule()
                                        .fill(shiftDay.isToday ? Color.brandPrimary.opacity(0.15) : Color.brandCard)
                                        .overlay(
                                            Capsule()
                                                .strokeBorder(shiftDay.isToday ? Color.brandPrimary.opacity(0.3) : Color.brandBorder, lineWidth: 1)
                                        )
                                )

                            if shiftDay.isToday {
                                Text(NSLocalizedString("shifts_today", comment: "Today"))
                                    .font(.brand(.caption2))
                                    .fontWeight(.bold)
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(Color.brandPrimary))
                            }

                            Spacer()

                            Text(String(
                                format: NSLocalizedString("shifts_count", comment: "%d shift(s)"),
                                shiftDay.shifts.count
                            ))
                            .font(.brand(.caption))
                            .foregroundStyle(Color.brandMutedForeground)
                        }
                        .accessibilityIdentifier("weekly-schedule-header")
                    }
                    .accessibilityIdentifier("shift-day-\(shiftDay.id)")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Shift Row

    @ViewBuilder
    private func shiftRow(_ shift: Shift, vm: ShiftsViewModel) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(shift.timeRangeDisplay)
                    .font(.brand(.body))
                    .fontWeight(.medium)
                    .foregroundStyle(Color.brandForeground)

                if !shift.encryptedName.isEmpty {
                    Text(shift.encryptedName)
                        .font(.brand(.caption))
                        .foregroundStyle(Color.brandMutedForeground)
                }
            }

            Spacer()

            BadgeView(
                text: "\(shift.volunteerCount)",
                icon: "person.2.fill",
                color: .brandPrimary,
                style: .subtle
            )

            Button {
                Haptics.impact(.light)
                Task { await vm.signUp(for: shift) }
            } label: {
                Text(NSLocalizedString("shifts_sign_up", comment: "Sign Up"))
                    .font(.brand(.caption))
                    .fontWeight(.semibold)
            }
            .buttonStyle(.bordered)
            .tint(Color.brandPrimary)
            .controlSize(.small)
            .accessibilityIdentifier("signup-shift-\(shift.id)")
        }
        .accessibilityIdentifier("shift-card-\(shift.id)")
    }

    // MARK: - Empty State

    private var emptyState: some View {
        BrandEmptyState(
            icon: "calendar",
            title: NSLocalizedString("shifts_empty_title", comment: "No Shifts"),
            message: NSLocalizedString("shifts_empty_message", comment: "No shifts have been configured yet. Contact your administrator.")
        )
        .accessibilityIdentifier("shifts-empty-state")
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text(NSLocalizedString("shifts_loading", comment: "Loading schedule..."))
                .font(.brand(.subheadline))
                .foregroundStyle(Color.brandMutedForeground)
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
        let vm = ShiftsViewModel(
            apiService: appState.apiService,
            cryptoService: appState.cryptoService,
            hubContext: hubContext,
            shiftClockService: appState.shiftClockService
        )
        DispatchQueue.main.async {
            self.viewModel = vm
        }
        return vm
    }
}

// MARK: - Circular Clock Button Style

/// Press-scale button style for the circular clock in/out button.
private struct CircularClockButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Shifts - Off Shift") {
    ShiftsView()
        .environment(AppState(hubContext: HubContext()))
}
#endif
