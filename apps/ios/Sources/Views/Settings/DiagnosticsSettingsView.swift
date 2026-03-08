import SwiftUI

/// Settings view for crash reporting and diagnostics.
/// Provides an opt-in toggle and controls for pending crash reports.
struct DiagnosticsSettingsView: View {
    @Environment(AppState.self) private var appState

    @State private var isSending: Bool = false
    @State private var showSentConfirmation: Bool = false
    @State private var showClearedConfirmation: Bool = false

    var body: some View {
        List {
            // Opt-in consent toggle
            Section {
                Toggle(isOn: Binding(
                    get: { appState.crashReportingService.isEnabled },
                    set: { appState.crashReportingService.isEnabled = $0 }
                )) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(NSLocalizedString("crashReporting_consent", comment: "Send anonymous crash reports"))
                            .font(.brand(.body))
                        Text(NSLocalizedString("crashReporting_consentDescription", comment: ""))
                            .font(.brand(.caption))
                            .foregroundStyle(Color.brandMutedForeground)
                    }
                }
                .accessibilityIdentifier("crash-reporting-toggle")
            } header: {
                Text(NSLocalizedString("crashReporting_title", comment: "Crash Reporting"))
            }

            // Pending reports section
            let pendingCount = appState.crashReportingService.pendingReportCount
            if pendingCount > 0 {
                Section {
                    Text(
                        NSLocalizedString("crashReporting_pendingReportsDescription", comment: "")
                            .replacingOccurrences(of: "%@", with: "\(pendingCount)")
                    )
                    .font(.brand(.callout))
                    .foregroundStyle(Color.brandMutedForeground)

                    if appState.crashReportingService.isEnabled {
                        Button {
                            sendReports()
                        } label: {
                            HStack {
                                if isSending {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                } else {
                                    Image(systemName: "arrow.up.circle")
                                }
                                Text(NSLocalizedString("crashReporting_sendNow", comment: "Send Reports"))
                            }
                        }
                        .disabled(isSending)
                        .accessibilityIdentifier("send-crash-reports")
                    }

                    Button(role: .destructive) {
                        appState.crashReportingService.clearCrashLogs()
                        showClearedConfirmation = true
                    } label: {
                        HStack {
                            Image(systemName: "trash")
                            Text(NSLocalizedString("crashReporting_clearReports", comment: "Discard Reports"))
                        }
                    }
                    .accessibilityIdentifier("clear-crash-reports")
                } header: {
                    Text(NSLocalizedString("crashReporting_pendingReports", comment: "Pending crash reports"))
                }
            }

            // Privacy note
            Section {
                Text(NSLocalizedString("crashReporting_privacyNote", comment: ""))
                    .font(.brand(.caption))
                    .foregroundStyle(Color.brandMutedForeground)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(NSLocalizedString("crashReporting_settingsTitle", comment: "Diagnostics"))
        .navigationBarTitleDisplayMode(.large)
        .alert(NSLocalizedString("crashReporting_reportsSent", comment: ""), isPresented: $showSentConfirmation) {
            Button(NSLocalizedString("ok", comment: "OK")) {}
        }
        .alert(NSLocalizedString("crashReporting_reportsCleared", comment: ""), isPresented: $showClearedConfirmation) {
            Button(NSLocalizedString("ok", comment: "OK")) {}
        }
    }

    private func sendReports() {
        isSending = true
        Task {
            let count = await appState.crashReportingService.uploadPendingCrashLogs()
            await MainActor.run {
                isSending = false
                if count > 0 {
                    showSentConfirmation = true
                }
            }
        }
    }
}

#if DEBUG
#Preview("Diagnostics") {
    NavigationStack {
        DiagnosticsSettingsView()
            .environment(AppState())
    }
}
#endif
