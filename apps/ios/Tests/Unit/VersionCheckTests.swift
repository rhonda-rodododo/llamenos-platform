import XCTest
@testable import Llamenos

/// Unit tests for API version compatibility checking (Epic 290).
/// Tests the client-side logic that compares the app's compiled API version
/// against the server's `/api/config` response.
final class VersionCheckTests: XCTestCase {

    // MARK: - VersionStatus Equality

    func testUpToDateEquality() {
        XCTAssertEqual(VersionStatus.upToDate, VersionStatus.upToDate)
    }

    func testForceUpdateEquality() {
        XCTAssertEqual(VersionStatus.forceUpdate(minVersion: 5), VersionStatus.forceUpdate(minVersion: 5))
        XCTAssertNotEqual(VersionStatus.forceUpdate(minVersion: 5), VersionStatus.forceUpdate(minVersion: 6))
    }

    func testUpdateAvailableEquality() {
        XCTAssertEqual(VersionStatus.updateAvailable(latestVersion: 3), VersionStatus.updateAvailable(latestVersion: 3))
        XCTAssertNotEqual(VersionStatus.updateAvailable(latestVersion: 3), VersionStatus.updateAvailable(latestVersion: 4))
    }

    func testUnknownEquality() {
        XCTAssertEqual(VersionStatus.unknown, VersionStatus.unknown)
    }

    func testDifferentStatusesNotEqual() {
        XCTAssertNotEqual(VersionStatus.upToDate, VersionStatus.unknown)
        XCTAssertNotEqual(VersionStatus.upToDate, VersionStatus.forceUpdate(minVersion: 1))
        XCTAssertNotEqual(VersionStatus.upToDate, VersionStatus.updateAvailable(latestVersion: 2))
    }

    // MARK: - API Version Constant

    func testApiVersionIsPositive() {
        XCTAssertGreaterThan(APIService.apiVersion, 0, "API version must be a positive integer")
    }

    // MARK: - AppConfig Decoding

    func testAppConfigDecodesFromJSON() throws {
        // Server sends camelCase JSON — decoder uses default (no key strategy)
        let json = """
        {"hotlineName":"Test Hub","apiVersion":3,"minApiVersion":2,"channels":{},"setupCompleted":true}
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        let config = try decoder.decode(AppConfig.self, from: json)

        XCTAssertEqual(config.hotlineName, "Test Hub")
        XCTAssertEqual(config.apiVersion, 3)
        XCTAssertEqual(config.minApiVersion, 2)
    }

    func testAppConfigIgnoresUnknownKeys() throws {
        let json = """
        {"hotlineName":"Hub","apiVersion":1,"minApiVersion":1,"unknownField":"should be ignored","nested":{"foo":true}}
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        // Should not throw despite extra fields
        let config = try decoder.decode(AppConfig.self, from: json)
        XCTAssertEqual(config.apiVersion, 1)
    }

    // MARK: - AppConstants

    func testAppStoreIdIsNotEmpty() {
        XCTAssertFalse(AppConstants.appStoreId.isEmpty, "App Store ID should be configured")
    }
}
