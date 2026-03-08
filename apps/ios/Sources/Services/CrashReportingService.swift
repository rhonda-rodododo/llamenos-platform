import Foundation
import os

/// Privacy-first crash reporting service that captures unhandled exceptions
/// and optionally uploads them to a GlitchTip/Sentry-compatible endpoint.
///
/// Key privacy guarantees:
/// - Crash reporting is strictly opt-in — user must explicitly consent.
/// - No PII is ever included in crash reports (no user IDs, keys, names, or phone numbers).
/// - Reports contain only: error type, stack trace, app version, OS version, device model.
/// - The Sentry DSN is fetched from the hub server config, not hardcoded.
///
/// Crash logs are stored locally in the app's `crashes/` subdirectory.
/// On next launch, if consent is granted, pending logs are uploaded then deleted.
@Observable
final class CrashReportingService {
    private let logger = Logger(subsystem: "org.llamenos.hotline", category: "CrashReporting")
    private let crashDir: URL
    private static let maxCrashFiles = 10
    private static let consentKey = "crashReportingEnabled"
    private static let dsnKey = "sentryDsn"

    /// Whether the user has consented to sending crash reports. Default: false (opt-in).
    var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: Self.consentKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.consentKey) }
    }

    /// Number of pending crash reports awaiting upload.
    var pendingReportCount: Int {
        (try? FileManager.default.contentsOfDirectory(atPath: crashDir.path).count) ?? 0
    }

    /// The Sentry/GlitchTip DSN from hub config.
    var sentryDsn: String? {
        get { UserDefaults.standard.string(forKey: Self.dsnKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.dsnKey) }
    }

    init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        crashDir = appSupport.appendingPathComponent("crashes", isDirectory: true)
        try? FileManager.default.createDirectory(at: crashDir, withIntermediateDirectories: true)
    }

    /// Install signal and exception handlers to capture crashes.
    func install() {
        NSSetUncaughtExceptionHandler { exception in
            CrashReportingService.writeCrashLog(exception: exception)
        }

        // Register signal handlers for common crash signals
        for sig in [SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGSEGV, SIGTRAP] {
            signal(sig) { signal in
                CrashReportingService.writeCrashLogForSignal(signal)
                // Re-raise the signal to get the default handler behavior
                Darwin.signal(signal, SIG_DFL)
                Darwin.raise(signal)
            }
        }

        logger.info("Crash reporting installed")
    }

    /// Get stored crash logs, newest first.
    func getCrashLogs() -> [URL] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: crashDir,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: .skipsHiddenFiles
        ) else {
            return []
        }

        return files
            .sorted { a, b in
                let dateA = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
                let dateB = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
                return dateA > dateB
            }
            .prefix(Self.maxCrashFiles)
            .map { $0 }
    }

    /// Delete all stored crash logs.
    func clearCrashLogs() {
        for file in getCrashLogs() {
            try? FileManager.default.removeItem(at: file)
        }
    }

    /// Upload any pending crash logs to the configured GlitchTip/Sentry endpoint.
    /// Only uploads if consent is granted and a DSN is configured.
    /// Returns the number of reports successfully uploaded.
    @discardableResult
    func uploadPendingCrashLogs() async -> Int {
        guard isEnabled, let dsn = sentryDsn, !dsn.isEmpty else { return 0 }
        guard let endpoint = parseSentryDsn(dsn) else { return 0 }

        let logs = getCrashLogs()
        if logs.isEmpty { return 0 }

        var uploaded = 0

        for log in logs {
            do {
                let content = try String(contentsOf: log, encoding: .utf8)
                let payload = buildSentryEvent(from: content)
                let success = try await sendToSentry(endpoint: endpoint, payload: payload, dsn: dsn)
                if success {
                    try? FileManager.default.removeItem(at: log)
                    uploaded += 1
                }
            } catch {
                logger.warning("Failed to upload crash log: \(error.localizedDescription)")
            }
        }

        if uploaded > 0 {
            logger.info("Uploaded \(uploaded) crash report(s)")
        }

        return uploaded
    }

    /// Upload pending crash logs in the background (fire-and-forget).
    func uploadPendingInBackground() {
        guard isEnabled, pendingReportCount > 0 else { return }

        Task.detached(priority: .utility) { [weak self] in
            await self?.uploadPendingCrashLogs()
        }
    }

    // MARK: - Static crash log writers (called from signal/exception handlers)

    private static func writeCrashLog(exception: NSException) {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("crashes", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        pruneOldLogs(in: dir)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = formatter.string(from: Date())
        let file = dir.appendingPathComponent("crash_\(timestamp).txt")

        var report = "=== Llamenos Crash Report ===\n"
        report += "Timestamp: \(Date())\n"
        report += "Type: NSException\n"
        report += "Name: \(exception.name.rawValue)\n"
        report += "Reason: \(exception.reason ?? "unknown")\n"
        report += "Device: \(deviceModel())\n"
        report += "iOS: \(ProcessInfo.processInfo.operatingSystemVersionString)\n"
        report += "App: \(appVersion())\n\n"
        report += "--- Stack Trace ---\n"
        report += exception.callStackSymbols.joined(separator: "\n")

        try? report.write(to: file, atomically: true, encoding: .utf8)
    }

    private static func writeCrashLogForSignal(_ sig: Int32) {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("crashes", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        pruneOldLogs(in: dir)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = formatter.string(from: Date())
        let file = dir.appendingPathComponent("crash_\(timestamp).txt")

        let signalName: String
        switch sig {
        case SIGABRT: signalName = "SIGABRT"
        case SIGBUS: signalName = "SIGBUS"
        case SIGFPE: signalName = "SIGFPE"
        case SIGILL: signalName = "SIGILL"
        case SIGSEGV: signalName = "SIGSEGV"
        case SIGTRAP: signalName = "SIGTRAP"
        default: signalName = "SIGNAL(\(sig))"
        }

        var report = "=== Llamenos Crash Report ===\n"
        report += "Timestamp: \(Date())\n"
        report += "Type: Signal\n"
        report += "Signal: \(signalName)\n"
        report += "Device: \(deviceModel())\n"
        report += "iOS: \(ProcessInfo.processInfo.operatingSystemVersionString)\n"
        report += "App: \(appVersion())\n\n"
        report += "--- Stack Trace ---\n"
        report += Thread.callStackSymbols.joined(separator: "\n")

        try? report.write(to: file, atomically: true, encoding: .utf8)
    }

    private static func pruneOldLogs(in dir: URL) {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: .skipsHiddenFiles
        ) else { return }

        if files.count >= maxCrashFiles {
            let sorted = files.sorted { a, b in
                let dateA = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
                let dateB = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
                return dateA > dateB
            }
            for file in sorted.dropFirst(maxCrashFiles - 1) {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }

    // MARK: - Sentry payload building

    private func parseSentryDsn(_ dsn: String) -> String? {
        guard let url = URL(string: dsn),
              let key = url.user,
              let host = url.host else { return nil }
        let port = url.port.map { ":\($0)" } ?? ""
        let projectId = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return "\(url.scheme ?? "https")://\(host)\(port)/api/\(projectId)/store/?sentry_key=\(key)&sentry_version=7"
    }

    private func buildSentryEvent(from crashLog: String) -> Data {
        let lines = crashLog.components(separatedBy: "\n")
        let stackIndex = lines.firstIndex(where: { $0.contains("--- Stack Trace ---") })
        let stackTrace = stackIndex.map { lines.dropFirst($0 + 1).joined(separator: "\n") } ?? crashLog

        // Try to extract exception info
        var exceptionType = "CrashReport"
        var exceptionValue = ""

        if let nameLine = lines.first(where: { $0.hasPrefix("Name:") }) {
            exceptionType = String(nameLine.dropFirst(5)).trimmingCharacters(in: .whitespaces)
        } else if let signalLine = lines.first(where: { $0.hasPrefix("Signal:") }) {
            exceptionType = String(signalLine.dropFirst(7)).trimmingCharacters(in: .whitespaces)
        }

        if let reasonLine = lines.first(where: { $0.hasPrefix("Reason:") }) {
            exceptionValue = String(reasonLine.dropFirst(7)).trimmingCharacters(in: .whitespaces)
        }

        let eventId = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
        let formatter = ISO8601DateFormatter()
        let timestamp = formatter.string(from: Date())

        let event: [String: Any] = [
            "event_id": eventId,
            "timestamp": timestamp,
            "platform": "cocoa",
            "level": "fatal",
            "logger": "CrashReportingService",
            "server_name": "",
            "release": Self.appVersion(),
            "environment": isDebug() ? "development" : "production",
            "tags": [
                "os.name": "iOS",
                "os.version": ProcessInfo.processInfo.operatingSystemVersionString,
                "device.model": Self.deviceModel(),
            ],
            "exception": [
                "values": [
                    [
                        "type": exceptionType,
                        "value": String(exceptionValue.prefix(500)),
                        "stacktrace": ["frames": [] as [[String: Any]]],
                    ],
                ],
            ],
            "extra": [
                "raw_crash_log": String(stackTrace.prefix(8000)),
            ],
        ]

        return (try? JSONSerialization.data(withJSONObject: event)) ?? Data()
    }

    private func sendToSentry(endpoint: String, payload: Data, dsn: String) async throws -> Bool {
        guard let url = URL(string: endpoint) else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = payload
        request.timeoutInterval = 10

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { return false }
        return (200...299).contains(httpResponse.statusCode)
    }

    // MARK: - Device info helpers

    private static func deviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0) ?? "unknown"
            }
        }
    }

    private static func appVersion() -> String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "\(version) (\(build))"
    }

    private func isDebug() -> Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}
