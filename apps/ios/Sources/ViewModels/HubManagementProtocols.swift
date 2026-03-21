import Foundation

// MARK: - HubAPIServiceProtocol

/// Narrow protocol exposing the hub-key fetch and generic request method that
/// HubManagementViewModel needs. Allows test doubles without subclassing the final APIService class.
protocol HubAPIServiceProtocol {
    func getHubKey(_ hubId: String) async throws -> HubKeyEnvelopeResponse
    func request<T: Decodable>(method: String, path: String, body: (any Encodable)?) async throws -> T
}

// APIService conforms automatically — its getHubKey and request signatures match.
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
