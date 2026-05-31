import Foundation

// MARK: - CallRecordStatus

/// Call status from the API (wire format).
/// Distinct from the UI-facing `CallStatus` enum in `CallHistoryView`.
enum CallRecordStatus: String, Decodable, Sendable {
    case ringing
    case inProgress = "in-progress"
    case completed
    case unanswered
}

// MARK: - CallRecordDTO

/// Raw call record from the API (active or historical).
/// Maps to `callRecordResponseSchema` in packages/protocol/schemas/calls.ts.
struct CallRecordDTO: Decodable, Sendable {
    let id: String
    let callerLast4: String?
    let answeredBy: String?
    let startedAt: String
    let endedAt: String?
    let duration: Double?
    let status: CallRecordStatus?
    let hasTranscription: Bool?
    let hasVoicemail: Bool?
    let hasRecording: Bool?
    let recordingSid: String?
    let encryptedContent: String?
    let adminEnvelopes: [RecipientEnvelope]?
    /// Client-side decrypted caller number (populated after E2EE decryption).
    let callerNumber: String?
}

// MARK: - ActiveCallsResponse

/// Response from `GET /api/calls/active`.
struct ActiveCallsResponse: Decodable {
    let calls: [CallRecordDTO]
}

// MARK: - CallHistoryResponse

/// Response from `GET /api/calls/history`.
/// Maps to `callHistoryResponseSchema` in packages/protocol/schemas/calls.ts.
struct CallHistoryResponse: Decodable {
    let calls: [CallRecordDTO]
    let total: Int
    let page: Int
    let limit: Int
}
