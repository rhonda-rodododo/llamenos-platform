import Foundation

// MARK: - APIError

enum APIError: LocalizedError {
    case invalidURL(String)
    case noBaseURL
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

// MARK: - APIService

/// URLSession-based REST client for the Llamenos hub API. Injects CryptoService to
/// generate Schnorr auth tokens for each request. The auth token is sent as a Bearer
/// header containing a JSON object with pubkey, timestamp, and BIP-340 signature.
final class APIService: @unchecked Sendable {
    private var baseURL: URL?
    private let cryptoService: CryptoService
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(cryptoService: CryptoService) {
        self.cryptoService = cryptoService
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

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
    func configure(hubURLString: String) throws {
        // Normalize: ensure scheme is present
        var urlString = hubURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
            urlString = "https://\(urlString)"
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

    /// Fire-and-forget request with no response body expected.
    func request(
        method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws {
        let _: EmptyResponse = try await request(method: method, path: path, body: body)
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
