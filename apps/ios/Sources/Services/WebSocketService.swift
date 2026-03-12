import Foundation

// MARK: - ConnectionState

/// WebSocket connection state.
enum ConnectionState: Equatable, Sendable {
    case disconnected
    case connecting
    case connected
    case reconnecting(attempt: Int)

    var isConnected: Bool { self == .connected }

    var statusColor: String {
        switch self {
        case .connected: return "green"
        case .connecting, .reconnecting: return "yellow"
        case .disconnected: return "red"
        }
    }

    var displayText: String {
        switch self {
        case .disconnected:
            return NSLocalizedString("ws_disconnected", comment: "Disconnected")
        case .connecting:
            return NSLocalizedString("ws_connecting", comment: "Connecting...")
        case .connected:
            return NSLocalizedString("ws_connected", comment: "Connected")
        case .reconnecting(let attempt):
            return String(format: NSLocalizedString("ws_reconnecting", comment: "Reconnecting (%d)..."), attempt)
        }
    }
}

// MARK: - NostrEvent

/// A Nostr event received from the relay. Matches NIP-01 + custom Llamenos kinds.
struct NostrEvent: Codable, Sendable, Identifiable {
    let id: String
    let pubkey: String
    let createdAt: Int
    let kind: Int
    let tags: [[String]]
    let content: String
    let sig: String

    enum CodingKeys: String, CodingKey {
        case id, pubkey
        case createdAt = "created_at"
        case kind, tags, content, sig
    }
}

// MARK: - HubEventType

/// Known hub event types parsed from decrypted event content's `type` field.
/// All events use the generic `["t", "llamenos:event"]` tag — the relay cannot
/// distinguish event types. Actual type differentiation happens after decryption
/// by reading the `content.type` JSON field.
enum HubEventType: String, Sendable {
    case callRing = "call:ring"
    case callUpdate = "call:update"
    case voicemailNew = "voicemail:new"
    case presenceSummary = "presence:summary"
    case messageNew = "message:new"
    case conversationAssigned = "conversation:assigned"
    case conversationClosed = "conversation:closed"
    case unknown
}

// MARK: - WebSocketService

/// Native WebSocket client for the Nostr relay connection. Uses `URLSessionWebSocketTask`
/// for zero third-party dependencies. Provides events via `AsyncStream` and handles
/// automatic reconnection with exponential backoff.
///
/// Usage:
/// ```swift
/// let ws = WebSocketService()
/// await ws.connect(to: "wss://hub.example.org/relay")
/// for await event in ws.events {
///     handleEvent(event)
/// }
/// ```
@Observable
final class WebSocketService: @unchecked Sendable {

    // MARK: - Public State

    /// Current connection state, observed by UI for status indicators.
    private(set) var connectionState: ConnectionState = .disconnected

    /// Count of events received since last connect (for diagnostics).
    private(set) var eventCount: Int = 0

    // MARK: - Event Stream

    /// Public async stream of parsed Nostr events. Multiple consumers can iterate this
    /// by storing the stream; each gets their own copy of events from when they start reading.
    var events: AsyncStream<NostrEvent> {
        AsyncStream { continuation in
            let id = UUID()
            continuationsLock.lock()
            continuations[id] = continuation
            continuationsLock.unlock()
            continuation.onTermination = { [weak self] _ in
                self?.continuationsLock.lock()
                self?.continuations.removeValue(forKey: id)
                self?.continuationsLock.unlock()
            }
        }
    }

    // MARK: - Private Properties

    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession
    private var relayURL: URL?
    private var subscriptionId: String = ""
    private var reconnectAttempt: Int = 0
    private var isIntentionalDisconnect: Bool = false
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    /// Thread-safe storage for event stream continuations.
    private var continuations: [UUID: AsyncStream<NostrEvent>.Continuation] = [:]
    private let continuationsLock = NSLock()

    /// Maximum reconnection attempts before giving up.
    private let maxReconnectAttempts = 10

    /// Base delay for exponential backoff (seconds).
    private let baseReconnectDelay: TimeInterval = 1.0

    /// Maximum backoff delay (seconds).
    private let maxReconnectDelay: TimeInterval = 60.0

    // MARK: - Initialization

    init() {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    // MARK: - Connect

    /// Connect to the Nostr relay at the given URL.
    /// - Parameter urlString: WebSocket URL, e.g. `wss://hub.example.org/relay`
    func connect(to urlString: String) async {
        guard let url = URL(string: urlString) else { return }
        relayURL = url
        isIntentionalDisconnect = false
        reconnectAttempt = 0
        await performConnect()
    }

    /// Internal connect that creates the WebSocket task and starts receiving.
    private func performConnect() async {
        guard let url = relayURL else { return }

        // Cancel existing task
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        receiveTask?.cancel()

        connectionState = reconnectAttempt > 0
            ? .reconnecting(attempt: reconnectAttempt)
            : .connecting

        let task = session.webSocketTask(with: url)
        webSocketTask = task
        task.resume()

        // Generate a unique subscription ID
        subscriptionId = "sub-\(UUID().uuidString.prefix(8))"

        // Send Nostr REQ subscription
        let reqMessage = """
        ["REQ","\(subscriptionId)",{"kinds":[1000,1001,1002,1010,1011,20000],"#t":["llamenos:event"]}]
        """
        do {
            try await task.send(.string(reqMessage))
            connectionState = .connected
            reconnectAttempt = 0
            eventCount = 0
        } catch {
            await handleDisconnect(error: error)
            return
        }

        // Start receive loop
        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
    }

    // MARK: - Disconnect

    /// Gracefully disconnect from the relay.
    func disconnect() {
        isIntentionalDisconnect = true
        reconnectTask?.cancel()
        receiveTask?.cancel()

        // Close subscription
        if let task = webSocketTask, connectionState.isConnected {
            let closeMsg = "[\"CLOSE\",\"\(subscriptionId)\"]"
            task.send(.string(closeMsg)) { _ in }
        }

        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        connectionState = .disconnected
    }

    // MARK: - Receive Loop

    private func receiveLoop() async {
        guard let task = webSocketTask else { return }

        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    parseRelayMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        parseRelayMessage(text)
                    }
                @unknown default:
                    break
                }
            } catch {
                if !Task.isCancelled {
                    await handleDisconnect(error: error)
                }
                return
            }
        }
    }

    // MARK: - Message Parsing

    /// Parse a raw Nostr relay message. Expected formats:
    /// - `["EVENT", subscriptionId, event]` — a matching event
    /// - `["EOSE", subscriptionId]` — end of stored events
    /// - `["NOTICE", message]` — relay notice
    private func parseRelayMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        do {
            guard let array = try JSONSerialization.jsonObject(with: data) as? [Any],
                  let type = array.first as? String else { return }

            switch type {
            case "EVENT":
                guard array.count >= 3,
                      let eventDict = array[2] as? [String: Any] else { return }
                let eventData = try JSONSerialization.data(withJSONObject: eventDict)
                let decoder = JSONDecoder()
                let event = try decoder.decode(NostrEvent.self, from: eventData)
                emitEvent(event)

            case "EOSE":
                // End of stored events — initial sync complete
                break

            case "NOTICE":
                // Relay notice — log but don't surface to UI
                break

            default:
                break
            }
        } catch {
            // Silently ignore malformed messages
        }
    }

    /// Broadcast an event to all active continuations.
    private func emitEvent(_ event: NostrEvent) {
        eventCount += 1
        continuationsLock.lock()
        let activeContinuations = continuations.values
        continuationsLock.unlock()
        for continuation in activeContinuations {
            continuation.yield(event)
        }
    }

    // MARK: - Reconnection

    private func handleDisconnect(error: Error?) async {
        guard !isIntentionalDisconnect else {
            connectionState = .disconnected
            return
        }

        reconnectAttempt += 1

        guard reconnectAttempt <= maxReconnectAttempts else {
            connectionState = .disconnected
            return
        }

        connectionState = .reconnecting(attempt: reconnectAttempt)

        // Exponential backoff with jitter
        let delay = min(
            baseReconnectDelay * pow(2.0, Double(reconnectAttempt - 1)),
            maxReconnectDelay
        )
        let jitter = Double.random(in: 0...(delay * 0.3))
        let totalDelay = delay + jitter

        reconnectTask = Task {
            try? await Task.sleep(for: .seconds(totalDelay))
            guard !Task.isCancelled, !isIntentionalDisconnect else { return }
            await performConnect()
        }
    }

    // MARK: - Event Type Extraction

    /// Check if a Nostr event has the llamenos event tag.
    /// All llamenos events use the generic `["t", "llamenos:event"]` tag.
    /// Content-based type parsing (into HubEventType) happens after decryption,
    /// not from tags — the tag only serves as a relay filter marker.
    static func isLlamenosEvent(_ event: NostrEvent) -> Bool {
        for tag in event.tags {
            if tag.count >= 2, tag[0] == "t", tag[1] == "llamenos:event" {
                return true
            }
        }
        return false
    }
}
