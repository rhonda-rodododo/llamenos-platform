import CommonCrypto
import Foundation

// MARK: - APIError

enum APIError: LocalizedError {
    case invalidURL(String)
    case noBaseURL
    case insecureConnection(String)
    case requestFailed(statusCode: Int, body: String)
    case networkError(Error)
    case decodingError(Error)
    case authTokenCreationFailed(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .noBaseURL:
            return NSLocalizedString("error_no_hub_url", comment: "No hub URL configured")
        case .insecureConnection(let reason):
            return reason
        case .requestFailed(let code, let body):
            return "HTTP \(code): \(body)"
        case .networkError(let error):
            return error.localizedDescription
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        case .authTokenCreationFailed(let error):
            return "Auth token creation failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Version Status

/// Result of comparing the client's API version against the server's config.
enum VersionStatus: Equatable {
    /// Client is up-to-date with the server.
    case upToDate
    /// A newer version is available but not required.
    case updateAvailable(latestVersion: Int)
    /// Client is too old and must update before continuing.
    case forceUpdate(minVersion: Int)
    /// Version check could not be performed (network error, etc.).
    case unknown
}

// MARK: - App Config Response

/// Response from `GET /api/config` — only the fields needed for version checking.
struct AppConfig: Decodable {
    let hotlineName: String
    let apiVersion: Int
    let minApiVersion: Int
}

// MARK: - APIService

/// URLSession-based REST client for the Llamenos hub API. Injects CryptoService to
/// generate Schnorr auth tokens for each request. The auth token is sent as a Bearer
/// header containing a JSON object with pubkey, timestamp, and BIP-340 signature.
final class APIService: @unchecked Sendable {
    /// The API version this client is compiled against.
    /// Must match the server's `CURRENT_API_VERSION` in `apps/worker/lib/api-versions.ts`.
    static let apiVersion: Int = 1
    private(set) var baseURL: URL?
    private let cryptoService: CryptoService
    private let hubContext: HubContext
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    /// Offline write queue. Set by AppState after initialization.
    /// When a write request fails with a network error, the operation is
    /// automatically enqueued for replay when connectivity is restored.
    var offlineQueue: OfflineQueue?

    /// Certificate pinning delegate (H14). Retained by the URLSession.
    private let pinningDelegate = CertificatePinningDelegate()

    init(cryptoService: CryptoService, hubContext: HubContext) {
        self.cryptoService = cryptoService
        self.hubContext = hubContext
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        // H14: Use certificate pinning delegate for all API requests
        self.session = URLSession(configuration: config, delegate: pinningDelegate, delegateQueue: nil)

        self.encoder = JSONEncoder()
        self.encoder.keyEncodingStrategy = .convertToSnakeCase

        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    /// Set or update the hub base URL.
    func configure(baseURL: URL) {
        self.baseURL = baseURL
    }

    /// Set the base URL from a string, validating it first.
    /// H6: Rejects http:// URLs — only HTTPS is allowed for hub connections.
    /// Exception: localhost/127.0.0.1 are allowed over HTTP for local development.
    /// Auto-prepends https:// if no scheme is specified.
    func configure(hubURLString: String) throws {
        var urlString = hubURLString.trimmingCharacters(in: .whitespacesAndNewlines)

        let isLocalhost = urlString.contains("localhost") || urlString.contains("127.0.0.1")

        // H6: Reject insecure HTTP connections (except localhost)
        if urlString.lowercased().hasPrefix("http://"), !isLocalhost {
            throw APIError.insecureConnection(
                NSLocalizedString(
                    "error_http_not_allowed",
                    comment: "HTTP connections are not allowed. Use HTTPS for secure communication."
                )
            )
        }

        // Auto-prepend scheme if none specified
        if !urlString.hasPrefix("http://"), !urlString.hasPrefix("https://") {
            urlString = isLocalhost ? "http://\(urlString)" : "https://\(urlString)"
        }

        // Strip trailing slash
        if urlString.hasSuffix("/") {
            urlString = String(urlString.dropLast())
        }
        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL(hubURLString)
        }
        self.baseURL = url
    }

    /// Returns path prefixed with /hubs/{activeHubId}. Falls back to bare path if no hub selected.
    func hp(_ path: String) -> String {
        guard let hubId = hubContext.activeHubId else { return path }
        return "/hubs/\(hubId)\(path)"
    }

    /// Test whether the hub URL is reachable. Returns true if the server responds.
    func validateConnection() async -> Bool {
        guard let baseURL else { return false }
        let healthURL = baseURL.appendingPathComponent("/api/health")
        var request = URLRequest(url: healthURL, timeoutInterval: 5)
        request.httpMethod = "GET"
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                return (200...499).contains(httpResponse.statusCode)
            }
            return false
        } catch {
            return false
        }
    }

    /// Perform an authenticated API request.
    ///
    /// - Parameters:
    ///   - method: HTTP method (GET, POST, PUT, DELETE, PATCH).
    ///   - path: API path relative to the base URL (e.g., "/api/identity/me").
    ///   - body: Optional Encodable body for POST/PUT/PATCH requests.
    /// - Returns: Decoded response of type T.
    func request<T: Decodable>(
        method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws -> T {
        guard let baseURL else { throw APIError.noBaseURL }

        let fullURL = baseURL.appendingPathComponent(path)
        var urlRequest = URLRequest(url: fullURL)
        urlRequest.httpMethod = method.uppercased()

        // Attach Schnorr auth token as Bearer header
        if cryptoService.isUnlocked {
            do {
                let token = try cryptoService.createAuthToken(method: method.uppercased(), path: path)
                let authJSON = """
                {"pubkey":"\(token.pubkey)","timestamp":\(token.timestamp),"token":"\(token.token)"}
                """
                urlRequest.setValue("Bearer \(authJSON)", forHTTPHeaderField: "Authorization")
            } catch {
                throw APIError.authTokenCreationFailed(error)
            }
        }

        // Encode body
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = try encoder.encode(AnyEncodable(body))
        }

        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")

        // Execute request
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            // On network error for write operations, enqueue for offline replay
            if OfflineQueue.isQueueableMethod(method) {
                let bodyString: String?
                if let httpBody = urlRequest.httpBody {
                    bodyString = String(data: httpBody, encoding: .utf8)
                } else {
                    bodyString = nil
                }
                offlineQueue?.enqueue(path: path, method: method.uppercased(), body: bodyString)
            }
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.requestFailed(statusCode: 0, body: "Non-HTTP response")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let bodyString = String(data: data, encoding: .utf8) ?? "<binary>"
            throw APIError.requestFailed(statusCode: httpResponse.statusCode, body: bodyString)
        }

        // Handle empty 204 responses
        if httpResponse.statusCode == 204 || data.isEmpty {
            if let empty = EmptyResponse() as? T {
                return empty
            }
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Perform an authenticated API request with a pre-encoded JSON body.
    ///
    /// Use this when the body must bypass the `convertToSnakeCase` encoder — for example,
    /// when the backend expects camelCase keys (`reportTypeId`, `encryptedContent`).
    ///
    /// - Parameters:
    ///   - method: HTTP method.
    ///   - path: API path relative to the base URL.
    ///   - rawBody: Pre-encoded JSON `Data`.
    /// - Returns: Decoded response of type T.
    func request<T: Decodable>(
        method: String,
        path: String,
        rawBody: Data
    ) async throws -> T {
        guard let baseURL else { throw APIError.noBaseURL }

        let fullURL = baseURL.appendingPathComponent(path)
        var urlRequest = URLRequest(url: fullURL)
        urlRequest.httpMethod = method.uppercased()

        // Attach Schnorr auth token as Bearer header
        if cryptoService.isUnlocked {
            do {
                let token = try cryptoService.createAuthToken(method: method.uppercased(), path: path)
                let authJSON = """
                {"pubkey":"\(token.pubkey)","timestamp":\(token.timestamp),"token":"\(token.token)"}
                """
                urlRequest.setValue("Bearer \(authJSON)", forHTTPHeaderField: "Authorization")
            } catch {
                throw APIError.authTokenCreationFailed(error)
            }
        }

        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.httpBody = rawBody

        // Execute request
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            // On network error for write operations, enqueue for offline replay
            if OfflineQueue.isQueueableMethod(method) {
                let bodyString = String(data: rawBody, encoding: .utf8)
                offlineQueue?.enqueue(path: path, method: method.uppercased(), body: bodyString)
            }
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.requestFailed(statusCode: 0, body: "Non-HTTP response")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let bodyString = String(data: data, encoding: .utf8) ?? "<binary>"
            throw APIError.requestFailed(statusCode: httpResponse.statusCode, body: bodyString)
        }

        if httpResponse.statusCode == 204 || data.isEmpty {
            if let empty = EmptyResponse() as? T {
                return empty
            }
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Fire-and-forget request with no response body expected.
    func request(
        method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws {
        let _: EmptyResponse = try await request(method: method, path: path, body: body)
    }

    // MARK: - CMS Report Types

    /// Fetch CMS report type definitions from the settings endpoint.
    ///
    /// Calls `GET /api/settings/cms/report-types` which returns the full
    /// `ClientReportTypeDefinition` schema including CMS-specific fields like
    /// `hubId`, `isSystem`, `numberingEnabled`, `closedStatuses`, etc.
    ///
    /// Uses a plain `JSONDecoder` (no snake_case conversion) because the
    /// backend returns camelCase keys natively for this endpoint.
    func fetchCmsReportTypes() async throws -> [ClientReportTypeDefinition] {
        let response: ClientReportTypesResponse = try await request(
            method: "GET",
            path: "/api/settings/cms/report-types"
        )
        return response.reportTypes
    }

    // MARK: - Version Check

    /// Compare this client's API version against the server's config.
    /// Returns `.unknown` on network failure — the app should not be blocked if offline.
    /// Uses a plain JSONDecoder because the server sends camelCase keys natively.
    func checkVersionCompatibility() async -> VersionStatus {
        guard let baseURL else { return .unknown }

        let configURL = baseURL.appendingPathComponent("/api/config")
        var request = URLRequest(url: configURL, timeoutInterval: 10)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                return .unknown
            }
            // Use a plain decoder — the /api/config endpoint returns camelCase keys
            // (apiVersion, minApiVersion), not snake_case.
            let plainDecoder = JSONDecoder()
            let config = try plainDecoder.decode(AppConfig.self, from: data)

            if Self.apiVersion < config.minApiVersion {
                return .forceUpdate(minVersion: config.minApiVersion)
            }
            if Self.apiVersion < config.apiVersion {
                return .updateAvailable(latestVersion: config.apiVersion)
            }
            return .upToDate
        } catch {
            return .unknown
        }
    }
}

// MARK: - Helper Types

/// Type-erased Encodable wrapper for passing heterogeneous body types.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init(_ wrapped: any Encodable) {
        self.encodeFunc = { encoder in
            try wrapped.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}

/// Placeholder for endpoints that return no body (204, empty response).
struct EmptyResponse: Decodable {
    init() {}
}

// MARK: - Certificate Pinning (H14)

/// SHA-256 pin hashes for Cloudflare's intermediate CA public keys.
/// Extract with: openssl s_client -connect app.llamenos.org:443 ... | openssl dgst -sha256 -binary | base64
/// See also: docs/security/CERTIFICATE_PINS.md
///
/// These are placeholders — populate with real pin hashes once the production domain
/// is provisioned and Cloudflare intermediate CA pins are extracted.
enum CertificatePins {
    // Cloudflare intermediate CA pins (SHA-256 SPKI hash, base64-encoded).
    // Populate from docs/security/CERTIFICATE_PINS.md before production release.
    static let cloudflareHashes: [String] = [
        // Placeholder: replace with actual Cloudflare intermediate CA pin hashes
        // "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    ]

    /// Whether certificate pinning is active (pins are configured).
    static var isEnabled: Bool {
        return !cloudflareHashes.isEmpty
    }
}

/// URLSessionDelegate that enforces certificate pinning against known Cloudflare
/// intermediate CA public key hashes. If pinning is disabled (no hashes configured),
/// the delegate allows standard TLS validation.
final class CertificatePinningDelegate: NSObject, URLSessionDelegate {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        // Only handle server trust challenges
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // If pinning is not configured, fall through to default TLS validation
        guard CertificatePins.isEnabled else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Validate the certificate chain
        guard let certificateChain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate] else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        var pinMatched = false
        for certificate in certificateChain {
            // Extract the public key and compute its SHA-256 hash
            if let publicKey = SecCertificateCopyKey(certificate) {
                var error: Unmanaged<CFError>?
                if let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? {
                    let hash = sha256Base64(publicKeyData)
                    if CertificatePins.cloudflareHashes.contains(hash) {
                        pinMatched = true
                        break
                    }
                }
            }
        }

        if pinMatched {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            // Pin mismatch — reject the connection
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    /// Compute SHA-256 hash of data, return as base64 string.
    private func sha256Base64(_ data: Data) -> String {
        var hash = [UInt8](repeating: 0, count: 32)
        data.withUnsafeBytes { buffer in
            _ = CC_SHA256(buffer.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash).base64EncodedString()
    }
}

