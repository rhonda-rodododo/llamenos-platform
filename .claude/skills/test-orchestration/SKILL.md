---
name: test-orchestration
description: >
  Orchestrate test runners, simulators, emulators, and backend services across all platforms
  in the Llamenos monorepo. Use this skill when setting up test environments, launching
  simulators/emulators, starting Docker Compose backends, running cross-platform test suites,
  debugging CI failures, or when the user mentions "run tests", "test:all", "test:changed",
  "simulator", "emulator", "Docker Compose tests", "CI failure", "test environment", "parallel
  tests", "verify everything", "codegen guard", "build failing", or "build error". Also use
  when the user needs to run verification after making changes across multiple platforms, when
  configuring new test environments, debugging why tests pass locally but fail in CI, or when
  test infrastructure itself is broken (stuck simulators, port conflicts, stale codegen).
  Distinct from bdd-feature-development which diagnoses test logic failures — this skill
  handles the infrastructure and orchestration layer. Also covers backend BDD test
  orchestration against Docker Compose.
---

# Test Orchestration for Llamenos

The monorepo has 600+ tests across 5 platforms, each with different runners, environments,
and infrastructure requirements. This skill covers how to set up, run, and debug the full
test suite.

## Quick Reference

```bash
bun run test:all       # Run ALL platform tests (codegen → build → test)
bun run test:changed   # Only platforms affected by git changes
bun run test:desktop   # Playwright BDD
bun run test:ios       # XCUITest + unit tests
bun run test:android   # Gradle unit + lint + androidTest compilation
bun run test:worker    # Worker integration tests
bun run test:crypto    # cargo test + clippy
bun run test:backend:bdd  # Backend BDD against Docker Compose (API-level)
bun run test:feature <name>  # Tests matching feature name across platforms
```

All scripts support: `--verbose`, `--no-codegen`, `--json`, `--timeout <seconds>`

## Test Infrastructure Map

```
                    ┌─────────────────────┐
                    │   bun run test:all   │
                    └──────────┬──────────┘
                               │
     ┌──────────┬──────────────┼────────────────────┐
     │          │              │                     │
┌────▼────┐ ┌──▼──────┐ ┌────▼────┐          ┌─────▼─────┐
│ Codegen │ │ Codegen │ │ Codegen │          │  Codegen   │
│  Guard  │ │  Guard  │ │  Guard  │          │   Guard    │
└────┬────┘ └────┬────┘ └────┬────┘          └─────┬─────┘
     │           │           │                     │
┌────▼─────┐┌───▼──────┐┌───▼────────┐     ┌──────▼───────┐
│ Backend  ││ Desktop  ││    iOS     │     │   Android    │
│   BDD    ││Playwright││  XCUITest  │     │   Gradle     │
│ + Docker ││ + Docker ││ +Simulator │     │ + Emulator*  │
└──────────┘└──────────┘└────────────┘     └──────────────┘
                                                  │
                                            * Emulator broken
                                              on macOS 26
    ┌────────────┐     ┌──────────────┐
    │   Worker   │     │    Crypto    │
    │  Vitest    │     │  cargo test  │
    └────────────┘     └──────────────┘
```

## Platform: Desktop (Playwright)

### Prerequisites
- Playwright browsers installed: `bunx playwright install`
- Docker Compose backend (for full E2E): `cd deploy/docker && docker compose up -d`
- OR: Mock IPC layer (default for `bun run test:desktop`)

### Environment
- `PLAYWRIGHT_TEST=true` — triggers Vite aliases for Tauri IPC mocks
- Mock layer: `tests/mocks/` — mirrors Rust CryptoState in JavaScript
- Config: `playwright.config.ts` — 3 workers, 30s timeout, 1 retry, fullyParallel

### Running

```bash
# Full pipeline (codegen → typecheck → build → test)
bun run test:desktop

# Just Playwright (skip codegen/build if already done)
bunx playwright test

# Specific test file
bunx playwright test tests/steps/auth

# UI mode (visual debugging)
bun run test:ui

# With Docker Compose backend (full E2E)
bun run test:build && bunx playwright test --config playwright.docker.config.ts
```

### Debugging
- **Trace viewer**: `bunx playwright show-trace test-results/*/trace.zip`
- **UI mode**: `bun run test:ui` — step through tests visually
- **Screenshots**: Automatically captured on failure in `test-results/`
- **Global setup**: `tests/global-setup.ts` — runs once before all tests (state reset)

## Platform: Backend BDD

Backend BDD runs shared Gherkin specs tagged `@backend` against the Docker Compose
backend. No browser needed -- tests hit the API directly via Playwright's APIRequestContext.

### Prerequisites
- Docker Compose backend running: `bun run test:docker:up`
- Health check: `curl http://localhost:3000/api/health`

### Running

```bash
# Full backend BDD suite
bun run test:backend:bdd

# Specific feature
PLAYWRIGHT_TEST=true bunx playwright test --project=backend-bdd --grep "call routing"
```

### What It Tests
- API correctness (CRUD operations, permission enforcement, auth validation)
- Call/message simulation (routing, parallel ring, voicemail, conversation threading)
- Encryption roundtrips (note encryption, multi-admin envelopes)
- Audit log integrity (hash chain, filtering)
- Error paths (expired tokens, banned callers, permission denial)

### Step Definitions
- Location: `tests/steps/backend/`
- Pattern: Given (setup state via API) -> When (trigger action) -> Then (verify via API)
- Uses: `tests/simulation-helpers.ts` and `tests/api-helpers.ts`

## Shared BDD Spec Structure

Shared Gherkin feature files live in `packages/test-specs/features/` organized by tier:

```
packages/test-specs/features/
  core/           # Core behavioral specs (call routing, messaging, notes, auth)
  admin/          # Admin operations (volunteers, shifts, bans, settings)
  security/       # Security specs (crypto, E2EE, permissions, audit)
  platform/       # Platform-specific specs
    desktop/      # Desktop-only features
    ios/          # iOS-only features
    android/      # Android-only features
```

**Tagging:** `@backend` for API-level, `@desktop`/`@ios`/`@android` for client platforms, `@smoke` for fast CI subset.

## Platform: iOS (XCUITest)

### Prerequisites
- Xcode installed with iOS Simulator runtime
- XCFramework built: `bun run ios:xcframework`
- Xcode project generated: `cd apps/ios && xcodegen generate`

### Simulator Management

```bash
# List available simulators
xcrun simctl list devices available

# Boot a specific simulator
xcrun simctl boot "iPhone 17"

# Check if booted
xcrun simctl list devices | grep Booted

# Shut down all simulators
xcrun simctl shutdown all

# Erase simulator state (clean slate)
xcrun simctl erase "iPhone 17"

# Available on this Mac: iPhone 17 series, iPhone Air, iPhone 16e
# NOT available: iPhone 16 (Xcode 26.3)
```

### Running

```bash
# Full pipeline
bun run test:ios

# Just unit tests
cd apps/ios && xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosTests 2>&1 | \
  tee /tmp/unittest-output.log | \
  grep --line-buffered -E '(Test Case|Executed|error:)'

# Just UI tests
cd apps/ios && xcodebuild test -project Llamenos.xcodeproj -scheme Llamenos \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:LlamenosUITests 2>&1 | \
  tee /tmp/uitest-output.log | \
  grep --line-buffered -E '(Test Case|Executed|error:)'

# Specific test class
-only-testing:LlamenosUITests/DashboardUITests
```

**ALWAYS use `tee`** to capture output. Check the log file if grep output is insufficient.

### Launch Arguments for Tests
- `--test-skip-hub-validation` — bypass async hub URL connectivity check
- `--test-hub-url http://localhost:3000` — point to Docker Compose backend
- `--uitesting` — general test mode flag

### Timing
- Tests take ~5-7 minutes (compile + simulator boot + execution)
- Run in foreground — background + sleep is unreliable

## Platform: Android

### Prerequisites

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
```

### Running

```bash
# Full pipeline (unit tests + lint + androidTest compilation)
bun run test:android

# Just unit tests
cd apps/android && ./gradlew testDebugUnitTest

# Just lint
cd apps/android && ./gradlew lintDebug

# Compile androidTest (doesn't run, just checks it compiles)
cd apps/android && ./gradlew compileDebugAndroidTestKotlin
```

### Emulator (BROKEN on macOS 26)

Android emulator does NOT work on macOS 26 Tahoe due to HVF permission issues.

**For E2E tests, use the Linux machine (192.168.50.95)**:

```bash
# On Linux machine
ssh 192.168.50.95
cd ~/projects/llamenos
git pull
scripts/android-parallel-e2e.sh  # 3 emulator shards
```

Or use a physical device connected via USB:
```bash
adb devices  # Verify device connected
cd apps/android && ./gradlew connectedDebugAndroidTest
```

### Parallel E2E (Linux)
- Script: `scripts/android-parallel-e2e.sh`
- Creates 3 emulator shards: `llamenos_e2e_1`, `llamenos_e2e_2`, `llamenos_e2e_3`
- Docker Compose backends per shard
- Cucumber BDD feature files distributed across shards

## Platform: Worker

### Running

```bash
bun run test:worker    # Full pipeline (codegen → typecheck → integration tests)
```

Worker tests use Vitest and don't require external services (Durable Object stubs).

### Debugging
- `wrangler dev` can take a while to start — "Broken pipe" errors are transient noise
- Use `--config apps/worker/wrangler.jsonc` for all wrangler commands

## Platform: Crypto (Rust)

### Running

```bash
bun run crypto:test         # cargo test (native)
bun run crypto:test:mobile  # cargo test --features mobile (UniFFI tests)
bun run crypto:clippy       # Lint
bun run crypto:fmt          # Format check
```

### Cross-Platform Verification
- Test vectors in `packages/crypto/tests/test_vectors.json`
- Same vectors consumed by Rust, TypeScript, Swift, and Kotlin tests
- If a vector fails on one platform, the crypto implementation diverged

## Docker Compose (Backend for E2E)

### Starting

```bash
cd deploy/docker

# Full stack (app + PostgreSQL + MinIO)
docker compose up -d --build

# With test overrides (reset endpoint enabled)
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

### Environment Variables Required

```bash
# .env file in deploy/docker/
PG_PASSWORD=...
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
HMAC_SECRET=...
```

Docker Compose validates ALL services at startup — missing env vars will fail.

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Teardown

```bash
docker compose down -v  # -v removes volumes (clean state)
```

## CI vs Local Differences

| Aspect | Local (Mac M4) | CI (GitHub Actions) |
|--------|---------------|---------------------|
| **Desktop** | Playwright with mock IPC | Same |
| **iOS** | Real simulator | `macos-26` runner + simulator |
| **Android unit** | Gradle locally | Ubuntu runner |
| **Android E2E** | Linux machine or device | Ubuntu runner with emulator |
| **Worker** | Vitest locally | Ubuntu runner |
| **Crypto** | cargo test locally | Ubuntu runner |
| **Docker** | Real Docker Compose | Docker Compose in CI |

### Common CI-only Failures

- **Playwright timeout**: CI is slower — increase timeouts or use `waitFor` patterns
- **iOS simulator not found**: CI may have different Xcode version. Use dynamic simulator detection
- **Android emulator startup**: CI emulators take longer to boot. Add health check wait
- **Docker port conflicts**: CI may have services running on default ports. Use compose project name

## Unified Test Output

`bun run test:all` produces structured output:

```
=== Llamenos Test Suite ===

[codegen] Checking generated files... OK
[desktop] typecheck... OK
[desktop] build... OK
[desktop] playwright (245 tests)... 243 passed, 2 skipped
[ios] build... OK
[ios] unit tests (98)... 98 passed
[ios] ui tests (118)... 118 passed
[android] unit tests (74)... 74 passed
[android] lint... OK
[crypto] cargo test... 40 passed
[worker] integration... 295 passed

=== Results: 868 passed, 2 skipped, 0 failed ===
```

Add `--json` for machine-readable output. Add `--verbose` for full test runner output.

## Troubleshooting

### "codegen guard failed"
Generated files are stale. Run `bun run codegen && bun run i18n:codegen` then retry.

### "EADDRINUSE" on port 3000
Another process is using the port. Kill it: `lsof -ti:3000 | xargs kill -9`

### iOS simulator won't boot
```bash
xcrun simctl shutdown all
xcrun simctl erase all
# Then retry
```

### Android Gradle daemon issues
```bash
cd apps/android && ./gradlew --stop
# Delete daemon caches if persistent
rm -rf ~/.gradle/daemon
```

### Playwright browsers outdated
```bash
bunx playwright install
```
