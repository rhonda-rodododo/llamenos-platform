# Epic 240: iOS Docker Test Infrastructure

## Summary

Connect iOS XCUITests to the live Docker Compose API backend, matching the pattern used by Android (Cucumber + `testHubUrl`) and Playwright (proxy to `localhost:3000`). Currently iOS tests run against an unconfigured API — all network calls throw `APIError.noBaseURL`. This epic makes tests hit real endpoints with `/api/test-reset` cleanup.

## Context

- **Android**: `BaseSteps.kt` reads `testHubUrl` instrumentation arg, defaults to `http://192.168.50.95:3000`. Calls `POST /api/test-reset` before each scenario.
- **Playwright**: Vite proxies `/api` to Docker at `localhost:3000`. `global-setup.ts` calls `POST /api/test-reset`.
- **iOS currently**: `--test-authenticated` flag generates a keypair in-memory. No hub URL set. All API calls silently fail (show empty states). Tests only verify UI structure, not data flow.
- **Docker test stack**: `docker-compose.test.yml` exposes app on port 3000, sets `ENVIRONMENT=development` (enables `/api/test-reset`).

## Architecture

### Launch Argument: `--test-hub-url`

Add a new launch argument `--test-hub-url <url>` that configures the API service with a real hub URL during test setup. This URL points to the Docker Compose backend.

```swift
// In AppState.handleLaunchArguments()
if let hubIndex = args.firstIndex(of: "--test-hub-url"),
   hubIndex + 1 < args.count {
    let hubURL = args[hubIndex + 1]
    try? apiService.configure(hubURLString: hubURL)
    try? authService.setHubURL(hubURL)
}
```

### Test Reset Helper

Add a `resetTestState()` method to `BaseUITest` that:
1. Calls `POST /api/test-reset` via a direct URL request (not through the app UI)
2. Runs before each test class or individual test

Since XCUITest runs in a separate process from the app, the reset call goes directly from the test runner to the Docker backend using `URLSession`.

```swift
// In BaseUITest
func resetServerState() {
    guard let url = URL(string: "\(testHubURL)/api/test-reset") else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 10

    let expectation = XCTestExpectation(description: "Reset test state")
    URLSession.shared.dataTask(with: request) { _, response, error in
        if let http = response as? HTTPURLResponse {
            XCTAssertEqual(http.statusCode, 200, "Test reset should succeed")
        }
        expectation.fulfill()
    }.resume()
    wait(for: [expectation], timeout: 15)
}
```

### Hub URL Configuration

The test hub URL varies by environment:
- **Local dev (Mac M4)**: `http://192.168.50.95:3000` (Linux dev machine IP on LAN)
- **CI (GitHub Actions macOS runner)**: `http://localhost:3000` (Docker runs on same runner or sidecar)

Pass via launch argument in test setUp:
```swift
func launchWithAPI() {
    app.launchArguments.append(contentsOf: [
        "--reset-keychain",
        "--test-authenticated",
        "--test-hub-url", testHubURL,
    ])
    app.launch()
}

var testHubURL: String {
    ProcessInfo.processInfo.environment["TEST_HUB_URL"]
        ?? "http://192.168.50.95:3000"
}
```

### Identity Registration

After launching with `--test-authenticated` + `--test-hub-url`, the app generates a keypair and configures the API. But the server doesn't know about this identity yet. We need to register it.

Add a launch argument `--test-register-identity` that calls `POST /api/identity/register` after the keypair is generated:

```swift
if args.contains("--test-register-identity") {
    Task {
        do {
            let _: IdentityMeResponse = try await apiService.request(
                method: "POST",
                path: "/api/identity/register",
                body: RegisterRequest(displayName: "Test User")
            )
        } catch {
            // Registration may fail if already registered — acceptable
        }
    }
}
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `Sources/App/AppState.swift` | Modify | Add `--test-hub-url` and `--test-register-identity` launch args |
| `Tests/UI/Helpers/BaseUITest.swift` | Modify | Add `testHubURL`, `resetServerState()`, `launchWithAPI()`, `launchAsAdminWithAPI()` |
| `scripts/ios-build.sh` | Modify | Add Docker Compose start/stop for `cmd_uitest` |

## BDD Tests Updated

All existing test classes that use `launchAuthenticated()` should be migrated to `launchWithAPI()` when testing data-dependent flows (notes list, conversations, admin). UI-only structural tests can remain with the current mock approach for speed.

**Priority migration**: NoteFlowUITests, ConversationFlowUITests, AdminFlowUITests — these currently test empty states because API returns nothing.

## Verification

1. `docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.test.yml up -d`
2. `ssh mac "cd ~/projects/llamenos/apps/ios && TEST_HUB_URL=http://192.168.50.95:3000 xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos -only-testing:LlamenosUITests -destination 'platform=iOS Simulator,name=iPhone 17'"`
3. Tests should create real data via the API and verify it appears in the UI

## Dependencies

- Docker Compose test stack must be running
- Network connectivity from Mac M4 to Linux dev machine (LAN)
- No other epics depend on this, but all subsequent epics benefit from it
