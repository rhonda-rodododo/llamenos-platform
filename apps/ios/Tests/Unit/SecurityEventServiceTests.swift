import Foundation
import XCTest
@testable import Llamenos

// MARK: - MockURLProtocol

/// Intercepts requests made by a `URLSession` configured with this protocol class,
/// standing in for the backend's `/api/security-events` endpoint. Used to verify
/// the exact payload a batch upload sends ("arriving at the backend") without any
/// real network access, and to simulate failure/retry conditions deterministically.
final class MockURLProtocol: URLProtocol {
    /// Returns (statusCode, responseBody) for a given request.
    static var requestHandler: ((URLRequest) -> (Int, Data))?
    static var capturedRequests: [URLRequest] = []
    static var capturedBodies: [Data] = []

    static func reset() {
        requestHandler = nil
        capturedRequests = []
        capturedBodies = []
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        MockURLProtocol.capturedRequests.append(request)
        if let body = request.httpBody {
            MockURLProtocol.capturedBodies.append(body)
        } else if let stream = request.httpBodyStream {
            MockURLProtocol.capturedBodies.append(Self.readStream(stream))
        }

        guard let handler = MockURLProtocol.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }

        let (statusCode, data) = handler(request)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func readStream(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 4096
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: bufferSize)
            if read > 0 {
                data.append(buffer, count: read)
            } else {
                break
            }
        }
        return data
    }
}

// MARK: - SecurityEventServiceTests

final class SecurityEventServiceTests: XCTestCase {

    private var service: SecurityEventService!
    private let testBaseURL = URL(string: "https://hub.example.org")!

    private func makeMockSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        service = SecurityEventService(uploadSession: makeMockSession())
        // Start each test with an empty queue — the on-disk file is shared across
        // instances (same convention as OfflineQueue), so it must be reset here.
        service.clear()
    }

    override func tearDown() {
        service.stopMonitoring()
        service.clear()
        service = nil
        MockURLProtocol.reset()
        super.tearDown()
    }

    // MARK: - report() / enqueue

    func testReportEnqueuesEventDurably() {
        XCTAssertEqual(service.pendingCount, 0)

        service.report(.certPinMismatch(activePins: ["pinA=="], observedPins: ["evilPin=="]))

        XCTAssertEqual(service.pendingCount, 1)
        let record = service.getQueue()[0]
        XCTAssertEqual(record.eventType, "cert_pin_mismatch")
        XCTAssertFalse(record.occurredAt.isEmpty)
        XCTAssertFalse(record.appVersion.isEmpty)
        XCTAssertTrue(record.osVersion.hasPrefix("iOS"))
        XCTAssertTrue(record.pinIdentifiers.contains("pinA=="))
        XCTAssertTrue(record.pinIdentifiers.contains("evilPin=="))
        XCTAssertEqual(record.attempts, 0)
        XCTAssertNil(record.lastError)
    }

    func testReportNeverThrowsOrCrashesWithoutBaseURLConfigured() {
        // No configure(baseURL:) call — this is the pre-login / not-yet-connected case.
        service.report(.certPinMismatch(activePins: ["pinA=="], observedPins: []))
        XCTAssertEqual(service.pendingCount, 1)
    }

    // MARK: - Batch upload (success — "arriving at the backend")

    func testBatchUploadSuccessRemovesFromQueueAndCarriesOnlyAllowedFields() async {
        service.configure(baseURL: testBaseURL)
        service.report(.certPinMismatch(activePins: ["pinA==", "pinB=="], observedPins: ["evilPin=="]))
        service.report(.certPinMismatch(activePins: ["pinA==", "pinB=="], observedPins: ["evilPin=="]))
        XCTAssertEqual(service.pendingCount, 2)

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url?.path, "/api/security-events")
            XCTAssertEqual(request.httpMethod, "POST")
            return (200, Data("{}".utf8))
        }

        let uploaded = await service.flush()

        XCTAssertEqual(uploaded, 2)
        XCTAssertEqual(service.pendingCount, 0)
        XCTAssertEqual(MockURLProtocol.capturedRequests.count, 1, "both events should upload in a single batch")

        // Evidence: decode exactly what "arrived at the backend" and assert the
        // wire format contains ONLY event type, timestamp, app/OS version, and pin
        // identifiers — no host, no device ID, no PII, no key material.
        let body = try! XCTUnwrap(MockURLProtocol.capturedBodies.first)
        let json = try! XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let events = try! XCTUnwrap(json["events"] as? [[String: Any]])
        XCTAssertEqual(events.count, 2)

        let allowedKeys: Set<String> = ["event_type", "occurred_at", "app_version", "os_version", "pin_identifiers"]
        for event in events {
            XCTAssertEqual(Set(event.keys), allowedKeys, "wire payload must carry only the allowed fields")
            XCTAssertEqual(event["event_type"] as? String, "cert_pin_mismatch")
        }

        // Print the captured "server-received" payload as PR evidence.
        print("[TEST EVIDENCE] Simulated backend received: \(String(data: body, encoding: .utf8) ?? "")")
    }

    // MARK: - Restart persistence

    func testQueueSurvivesRestart() {
        service.report(.certPinMismatch(activePins: ["pinA=="], observedPins: ["evilPin=="]))
        service.report(.certPinMismatch(activePins: ["pinC=="], observedPins: []))
        XCTAssertEqual(service.pendingCount, 2)

        // A pin failure that prevents connecting must still be reported once
        // connectivity returns — simulate an app restart by creating a fresh
        // service instance (new process, same on-disk queue file).
        let restarted = SecurityEventService(uploadSession: makeMockSession())
        XCTAssertEqual(restarted.pendingCount, 2)

        let records = restarted.getQueue()
        XCTAssertTrue(records.contains { $0.pinIdentifiers.contains("pinA==") })
        XCTAssertTrue(records.contains { $0.pinIdentifiers.contains("pinC==") })

        restarted.clear()
    }

    // MARK: - Upload failure retry with backoff

    func testUploadFailureRetriesWithBackoffAndDoesNotDropTheEvent() async {
        service.configure(baseURL: testBaseURL)
        service.report(.certPinMismatch(activePins: ["pinA=="], observedPins: ["evilPin=="]))

        MockURLProtocol.requestHandler = { _ in (500, Data("server error".utf8)) }

        let uploaded = await service.flush()

        XCTAssertEqual(uploaded, 0)
        XCTAssertEqual(service.pendingCount, 1, "a failed upload must never drop the event")
        let record = service.getQueue()[0]
        XCTAssertEqual(record.attempts, 1)
        XCTAssertEqual(record.lastError, "HTTP 500")

        // Backoff must push the next attempt into the future, not retry immediately.
        let nextAttempt = ISO8601DateFormatter().date(from: record.nextAttemptAt)
        XCTAssertNotNil(nextAttempt)
        XCTAssertGreaterThan(nextAttempt!.timeIntervalSinceNow, 0)

        // A second flush before the backoff window elapses must not re-attempt.
        let secondUpload = await service.flush()
        XCTAssertEqual(secondUpload, 0)
        XCTAssertEqual(MockURLProtocol.capturedRequests.count, 1, "should not retry before the backoff delay elapses")
    }

    func testUploadNetworkErrorNeverCrashesAndIsRetried() async {
        service.configure(baseURL: testBaseURL)
        service.report(.certPinMismatch(activePins: ["pinA=="], observedPins: ["evilPin=="]))

        // No requestHandler installed — MockURLProtocol fails with a network error,
        // simulating total loss of connectivity (the case the pinning failure
        // reporting path must survive).
        let uploaded = await service.flush()

        XCTAssertEqual(uploaded, 0)
        XCTAssertEqual(service.pendingCount, 1)
        XCTAssertEqual(service.getQueue()[0].attempts, 1)
    }

    func testPermanentClientErrorDropsEventAfterOneAttempt() async {
        service.configure(baseURL: testBaseURL)
        service.report(.certPinMismatch(activePins: ["pinA=="], observedPins: []))

        MockURLProtocol.requestHandler = { _ in (400, Data("bad request".utf8)) }

        let uploaded = await service.flush()

        XCTAssertEqual(uploaded, 0)
        XCTAssertEqual(service.pendingCount, 0, "a payload the server will never accept should not be retried forever")
    }

    // MARK: - Backoff math

    func testBackoffDelayGrowsExponentiallyAndCaps() {
        XCTAssertEqual(SecurityEventService.backoffDelay(forAttempt: 0), 2.0, accuracy: 0.01)
        XCTAssertEqual(SecurityEventService.backoffDelay(forAttempt: 1), 4.0, accuracy: 0.01)
        XCTAssertEqual(SecurityEventService.backoffDelay(forAttempt: 2), 8.0, accuracy: 0.01)
        // Caps at 120s regardless of how large the attempt count grows.
        XCTAssertEqual(SecurityEventService.backoffDelay(forAttempt: 20), 120.0, accuracy: 0.01)
    }
}
