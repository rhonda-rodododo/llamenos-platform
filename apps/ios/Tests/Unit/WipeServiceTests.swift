import XCTest
@testable import Llamenos

final class WipeServiceTests: XCTestCase {

    private var wipeService: WipeService!
    private var keychainService: KeychainService!
    private var cryptoService: CryptoService!

    override func setUp() {
        super.setUp()
        let keychain = KeychainService()
        let crypto = CryptoService()
        let api = APIService(cryptoService: crypto, hubContext: HubContext())
        let wake = WakeKeyService(keychainService: keychain, cryptoService: crypto, apiService: api)
        let offline = OfflineQueue(apiService: api)
        let crashReporting = CrashReportingService()
        let ws = WebSocketService(cryptoService: crypto)

        keychainService = keychain
        cryptoService = crypto
        wipeService = WipeService(
            keychainService: keychain,
            cryptoService: crypto,
            wakeKeyService: wake,
            offlineQueue: offline,
            crashReportingService: crashReporting,
            webSocketService: ws
        )
    }

    override func tearDown() {
        wipeService = nil
        keychainService = nil
        cryptoService = nil
        super.tearDown()
    }

    // MARK: - wipeAll

    func testWipeAllClearsUserDefaults() {
        // Populate a UserDefaults key
        let testKey = "wipeServiceTest_\(UUID().uuidString)"
        UserDefaults.standard.set("should-be-cleared", forKey: testKey)
        XCTAssertNotNil(UserDefaults.standard.string(forKey: testKey))

        wipeService.wipeAll()

        // After wiping the persistent domain, standard defaults are cleared
        XCTAssertNil(
            UserDefaults.standard.string(forKey: testKey),
            "UserDefaults should be cleared after wipeAll"
        )
    }

    func testWipeAllClearsURLCache() {
        // Seed the URL cache with a dummy response
        let url = URL(string: "https://test.llamenos.org/wipe-test")!
        let request = URLRequest(url: url)
        let response = URLResponse(url: url, mimeType: "text/plain", expectedContentLength: 5, textEncodingName: nil)
        let data = "hello".data(using: .utf8)!
        let cachedResponse = CachedURLResponse(response: response, data: data)
        URLCache.shared.storeCachedResponse(cachedResponse, for: request)

        wipeService.wipeAll()

        XCTAssertNil(
            URLCache.shared.cachedResponse(for: request),
            "URL cache should be cleared after wipeAll"
        )
    }

    func testWipeAllClearsCookies() {
        // Seed a cookie
        let props: [HTTPCookiePropertyKey: Any] = [
            .name: "wipetest",
            .value: "secret",
            .domain: "test.llamenos.org",
            .path: "/",
        ]
        if let cookie = HTTPCookie(properties: props) {
            HTTPCookieStorage.shared.setCookie(cookie)
        }

        wipeService.wipeAll()

        let remaining = HTTPCookieStorage.shared.cookies?.filter { $0.name == "wipetest" }
        XCTAssertTrue(
            remaining?.isEmpty ?? true,
            "Cookies should be cleared after wipeAll"
        )
    }

    func testWipeAllCleansTempDirectory() throws {
        // Create a temp file
        let tempFile = FileManager.default.temporaryDirectory.appendingPathComponent("wipe-test-\(UUID().uuidString).txt")
        try "sensitive".write(to: tempFile, atomically: true, encoding: .utf8)
        XCTAssertTrue(FileManager.default.fileExists(atPath: tempFile.path))

        wipeService.wipeAll()

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: tempFile.path),
            "Temp files should be cleared after wipeAll"
        )
    }

    func testWipeAllCleansCachesDirectory() throws {
        guard let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            XCTFail("No caches directory")
            return
        }
        let cacheFile = cachesDir.appendingPathComponent("wipe-test-\(UUID().uuidString).txt")
        try "cached-data".write(to: cacheFile, atomically: true, encoding: .utf8)
        XCTAssertTrue(FileManager.default.fileExists(atPath: cacheFile.path))

        wipeService.wipeAll()

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: cacheFile.path),
            "Caches directory should be cleared after wipeAll"
        )
    }

    // MARK: - logout

    func testLogoutPreservesUserDefaults() {
        let testKey = "wipeServiceLogoutTest_\(UUID().uuidString)"
        UserDefaults.standard.set("should-remain", forKey: testKey)

        wipeService.logout()

        XCTAssertEqual(
            UserDefaults.standard.string(forKey: testKey),
            "should-remain",
            "UserDefaults should NOT be cleared on logout"
        )

        // Clean up
        UserDefaults.standard.removeObject(forKey: testKey)
    }

    func testLogoutPreservesURLCache() {
        let url = URL(string: "https://test.llamenos.org/logout-test")!
        let request = URLRequest(url: url)
        let response = URLResponse(url: url, mimeType: "text/plain", expectedContentLength: 5, textEncodingName: nil)
        let data = "hello".data(using: .utf8)!
        let cachedResponse = CachedURLResponse(response: response, data: data)
        URLCache.shared.storeCachedResponse(cachedResponse, for: request)

        wipeService.logout()

        XCTAssertNotNil(
            URLCache.shared.cachedResponse(for: request),
            "URL cache should NOT be cleared on logout"
        )

        // Clean up
        URLCache.shared.removeCachedResponse(for: request)
    }

    func testLogoutPreservesTempFiles() throws {
        let tempFile = FileManager.default.temporaryDirectory.appendingPathComponent("logout-test-\(UUID().uuidString).txt")
        try "data".write(to: tempFile, atomically: true, encoding: .utf8)

        wipeService.logout()

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: tempFile.path),
            "Temp files should NOT be cleared on logout"
        )

        // Clean up
        try? FileManager.default.removeItem(at: tempFile)
    }
}
