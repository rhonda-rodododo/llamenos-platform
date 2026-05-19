import Foundation

/// Security-relevant events reported to the admin dashboard.
/// Events are queued and sent to the server on next API sync.
enum SecurityEvent {
  case certPinMismatch(host: String)
}

/// Service for reporting security events to the server.
/// Events are batched and sent periodically.
final class SecurityEventService {
  static let shared = SecurityEventService()

  private init() {}

  /// Report a security event. In debug builds, logs to console.
  /// In production, queues for server upload.
  func report(_ event: SecurityEvent) {
    switch event {
    case .certPinMismatch(let host):
      #if DEBUG
      print("[SecurityEvent] cert_pin_mismatch: \(host)")
      #endif
      // TODO: Queue for server upload (Epic: security-event-reporting)
    }
  }
}
