import Foundation

/// Service for reporting security events to the server.
/// Events are batched and sent periodically.
final class SecurityEventService {
    static let shared = SecurityEventService()

    /// Client-side security event kinds. Distinct from the server-side `SecurityEvent`
    /// protocol type (packages/protocol/schemas/security-event.ts) to avoid name collision.
    enum Report {
        case certPinMismatch(host: String)
    }

    private init() {}

    /// Report a security event. In debug builds, logs to console.
    /// In production, queues for server upload.
    func report(_ event: Report) {
        switch event {
        case .certPinMismatch(let host):
            #if DEBUG
            print("[SecurityEvent] cert_pin_mismatch: \(host)")
            #endif
            // TODO: Queue for server upload (Epic: security-event-reporting)
        }
    }
}
