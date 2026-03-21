import Foundation

// MARK: - HubAPIServiceProtocol

/// Narrow protocol exposing the hub-key fetch, hub-path helper, and generic request method
/// that hub-scoped ViewModels need. Allows test doubles without subclassing the final APIService class.
protocol HubAPIServiceProtocol {
    func getHubKey(_ hubId: String) async throws -> HubKeyEnvelopeResponse
    func hp(_ path: String) -> String
    func request<T: Decodable>(method: String, path: String, body: (any Encodable)?) async throws -> T
}

extension HubAPIServiceProtocol {
    /// Convenience overload with no body (GET requests).
    func request<T: Decodable>(method: String, path: String) async throws -> T {
        try await request(method: method, path: path, body: nil as (any Encodable)?)
    }
}

// APIService conforms automatically — its getHubKey, hp, and request signatures match.
extension APIService: HubAPIServiceProtocol {}

// MARK: - HubCryptoServiceProtocol

/// Narrow protocol exposing only the hub-key cache operations that HubManagementViewModel needs.
/// Task 7 will add the real implementations to CryptoService; until then the protocol
/// defines the contract and CryptoService gets stub conformance here.
protocol HubCryptoServiceProtocol {
    func hasHubKey(hubId: String) -> Bool
    func loadHubKey(hubId: String, envelope: HubKeyEnvelopeResponse) throws
}

// Stub conformance on CryptoService — Task 7 replaces these with the real implementation.
extension CryptoService: HubCryptoServiceProtocol {
    func hasHubKey(hubId: String) -> Bool { false }
    func loadHubKey(hubId: String, envelope: HubKeyEnvelopeResponse) throws {
        // No-op stub — real implementation added in Task 7
    }
}
