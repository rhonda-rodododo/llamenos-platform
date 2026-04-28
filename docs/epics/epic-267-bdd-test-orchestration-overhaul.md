# Epic 267: BDD Test Orchestration Overhaul

**Status: PENDING**
**Priority**: High -- developer velocity and CI reliability
**Depends on**: Epic 265 (i18n alignment), Epic 266 (i18n validation)
**Blocks**: None (improves all future feature work)

## Summary

Overhaul test orchestration across all platforms to achieve consistent, reliable, and fast BDD-driven testing. Replace ad-hoc test commands with unified scripts that handle the full codegen-build-test pipeline, fix output reliability issues (20-min waits producing null output), and enforce a BDD-first development workflow for every feature and bugfix.

## Problem Statement

Current pain points:

1. **Tests take too long and produce null output** -- 20+ minute waits that end with empty or unparseable results due to `grep` filters swallowing errors
2. **No consistent codegen-build-test pipeline** -- each platform has different commands, and forgetting codegen before testing causes false failures
3. **BDD not consistently followed** -- feature files exist in `packages/test-specs/` but feature dev and bugfixes don't always start with spec updates
4. **Cross-platform test gaps** -- unit and E2E tests aren't updated together across platforms during iterations; no way to run "all tests for this feature"
5. **Test output is hard to parse** -- `grep --line-buffered` patterns hide build errors, timeout kills produce no summary, CI logs require manual inspection
6. **No unified orchestration** -- running all platform tests requires memorizing 6+ different commands with platform-specific flags

## Architecture

```
scripts/
  test-orchestrator.sh         # Main orchestration entry point
  test-desktop.sh              # codegen -> typecheck -> build -> playwright
  test-android.sh              # codegen -> gradle build -> unit + e2e
  test-ios.sh                  # codegen -> xcodebuild -> unit + uitest
  test-worker.sh               # codegen -> vitest + DO integration
  test-crypto.sh               # cargo test --features mobile
  test-feature.sh              # Cross-platform test runner by feature name
  test-changed.sh              # Incremental: only test affected platforms
  lib/
    test-reporter.sh           # Structured output formatting + JSON results
    codegen-guard.sh           # Pre-test codegen validation
    platform-detect.sh         # Detect available platforms (Mac vs Linux)

packages/
  test-specs/
    tools/
      validate-coverage.ts     # Existing -- enhanced with new reporting
      feature-mapper.ts        # NEW: maps feature names to test files per platform
```

## Implementation

### Phase 1: Pre-Test Codegen Guard

Create `scripts/lib/codegen-guard.sh` that runs before any test suite:

1. Run `bun run codegen` (protocol types TS/Swift/Kotlin)
2. Run `bun run i18n:codegen` (iOS `.strings` + Android `strings.xml`)
3. Run `bun run i18n:validate` (string reference validation from Epic 266)
4. Compare generated file checksums against committed versions
5. Fail fast with clear error if codegen is stale, listing exactly which files differ

The guard is idempotent -- if codegen output matches committed files, it completes instantly. This prevents the common failure mode of "tests fail because someone forgot to run codegen after a schema change."

### Phase 2: Unified Test Runner Scripts

Add top-level scripts to `package.json`:

```json
{
  "test:all": "scripts/test-orchestrator.sh",
  "test:desktop": "scripts/test-desktop.sh",
  "test:android": "scripts/test-android.sh",
  "test:ios": "scripts/test-ios.sh",
  "test:worker": "scripts/test-worker.sh",
  "test:crypto": "scripts/test-crypto.sh",
  "test:feature": "scripts/test-feature.sh",
  "test:changed": "scripts/test-changed.sh"
}
```

Each script follows the same contract:

1. **Run codegen guard** -- fail fast if stale
2. **Build** -- platform-specific compilation
3. **Test** -- run tests with real-time streaming output
4. **Report** -- structured summary (pass/fail counts, duration, failures)
5. **Exit code** -- 0 on all pass, 1 on any failure

All scripts support these flags:

- `--verbose` -- full unfiltered output (default: filtered summary)
- `--no-codegen` -- skip codegen guard (for rapid re-runs)
- `--json` -- output structured JSON results for CI consumption
- `--timeout <seconds>` -- override default timeout (with warning at 80%)

#### `scripts/test-orchestrator.sh` (test:all)

Determines available platforms and runs them with maximum parallelism:

```
Platform detection:
  - Mac M4: iOS + crypto + worker (+ Android if emulator running)
  - Linux: desktop + Android + worker + crypto
  - Either: crypto (always available)

Parallel groups (no shared state between groups):
  Group 1: desktop + worker (parallel)
  Group 2: iOS + Android (parallel, different simulators/emulators)
  Group 3: crypto (parallel with everything)

Summary: aggregated pass/fail across all platforms
```

#### `scripts/test-desktop.sh` (test:desktop)

```bash
# 1. Codegen guard
# 2. bun run typecheck
# 3. bun run test:build (Vite build with Tauri IPC mocks)
# 4. bun run test (Playwright E2E)
#    - Uses tee to capture full output to /tmp/test-desktop-<timestamp>.log
#    - Streams filtered summary to stdout
#    - On timeout: kills process, prints last 50 lines of log, exits 1
```

#### `scripts/test-ios.sh` (test:ios)

```bash
# 1. Codegen guard (protocol + i18n)
# 2. xcodebuild build (compile check)
# 3. xcodebuild test -only-testing:LlamenosTests (unit tests)
# 4. xcodebuild test -only-testing:LlamenosUITests (XCUITests)
#    - Uses tee to /tmp/test-ios-<timestamp>.log
#    - grep --line-buffered for real-time progress
#    - On empty grep output: prints warning + last 50 lines of full log
#    - Parses xcresult bundle for structured results
```

#### `scripts/test-android.sh` (test:android)

```bash
# 1. Codegen guard (protocol + i18n)
# 2. ./gradlew testDebugUnitTest (unit tests)
# 3. ./gradlew lintDebug (lint)
# 4. ./gradlew compileDebugAndroidTestKotlin (e2e compile check)
# 5. If device/emulator connected: ./gradlew connectedDebugAndroidTest (full e2e)
#    - Detects connected devices via adb
#    - Skips e2e with warning if no device (not a failure)
```

#### `scripts/test-worker.sh` (test:worker)

```bash
# 1. Codegen guard
# 2. bun run typecheck
# 3. bun run test:worker:integration (DO integration tests)
```

#### `scripts/test-crypto.sh` (test:crypto)

```bash
# 1. cargo test --manifest-path packages/crypto/Cargo.toml --features mobile
# 2. cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings
```

### Phase 3: Test Output Improvements

#### Replace Fragile grep Patterns

The current pattern:

```bash
xcodebuild test ... 2>&1 | grep --line-buffered -E '(Test Case|Executed|error:)'
```

This hides build errors, linker failures, and any output not matching the pattern. Replace with `scripts/lib/test-reporter.sh` that:

1. **Always captures full output** via `tee` to a timestamped log file
2. **Streams a filtered view** to stdout showing: test starts, passes, failures, errors, and build diagnostics
3. **Detects empty output** -- if no test results appear within a configurable window, dumps the last N lines of full output as diagnostic
4. **Timeout with warning** -- at 80% of timeout, prints "approaching timeout" warning; at 100%, kills the process and prints the tail of the log
5. **Summary block** at the end:

```
=== Test Results: iOS ===
  Unit Tests:  36 passed, 0 failed (12.3s)
  UI Tests:    24 passed, 1 failed (142.7s)
  FAILED: testPanicWipeDeletesAllData (LlamenosUITests)
  Full log: /tmp/test-ios-20260305-143022.log
=== RESULT: FAIL ===
```

#### Structured JSON Output (--json flag)

For CI consumption, output a JSON file:

```json
{
  "platform": "ios",
  "timestamp": "2026-03-05T14:30:22Z",
  "duration_seconds": 155,
  "suites": [
    {
      "name": "LlamenosTests",
      "passed": 36,
      "failed": 0,
      "skipped": 0
    },
    {
      "name": "LlamenosUITests",
      "passed": 24,
      "failed": 1,
      "skipped": 0,
      "failures": [
        {
          "test": "testPanicWipeDeletesAllData",
          "message": "XCTAssertTrue failed",
          "file": "PanicWipeTests.swift",
          "line": 42
        }
      ]
    }
  ],
  "result": "fail"
}
```

### Phase 4: Cross-Platform Feature Testing

#### `scripts/test-feature.sh <feature-name>`

Maps a feature name to test files across all platforms and runs only those tests:

```bash
bun run test:feature auth        # Runs auth-related tests on all platforms
bun run test:feature notes       # Runs note-related tests on all platforms
bun run test:feature crypto      # Runs crypto tests on all platforms
```

Implementation:

1. `packages/test-specs/tools/feature-mapper.ts` parses feature files in `packages/test-specs/features/` and maps scenario titles to platform test files:
   - Desktop: grep Playwright spec files for matching `test()` descriptions
   - Android: grep `@Test fun` methods matching camelCase scenario titles
   - iOS: grep `func test` methods matching camelCase scenario titles
   - Crypto: grep `#[test] fn` methods matching feature area
2. Runs only matching tests per platform (Playwright `--grep`, xcodebuild `-only-testing`, Gradle `--tests`)
3. Reports results per platform with the unified reporter

#### `packages/test-specs/tools/feature-mapper.ts`

```typescript
interface FeatureMapping {
  featureFile: string;
  scenarios: string[];
  platforms: {
    desktop?: string[];  // Playwright spec file paths + test names
    android?: string[];  // Kotlin test class + method names
    ios?: string[];      // Swift test class + method names
    crypto?: string[];   // Rust test function names
  };
}
```

### Phase 5: Incremental Test Support

#### `scripts/test-changed.sh`

Uses `git diff` to determine which files changed and runs only affected platform tests:

```bash
# Determine affected platforms from changed files
git diff --name-only HEAD~1 | while read file; do
  case "$file" in
    src/client/*|tests/*|playwright.*)     affected+=("desktop") ;;
    apps/android/*)                         affected+=("android") ;;
    apps/ios/*)                             affected+=("ios") ;;
    apps/worker/*)                          affected+=("worker") ;;
    packages/crypto/*)                      affected+=("crypto") ;;
    packages/protocol/*|packages/i18n/*)   affected+=("all") ;;     # codegen affects everything
    packages/shared/*)                      affected+=("desktop" "worker") ;;
    packages/test-specs/*)                  affected+=("all") ;;
  esac
done
```

Deduplicates and runs only the affected platform test scripts.

### Phase 6: Shared Docker Compose E2E Infrastructure

All platform E2E tests run against the same Docker Compose cluster, with per-platform hub isolation:

#### `deploy/docker/docker-compose.e2e.yml`

Override that spins up multiple `app` instances on different ports, sharing the same postgres/rustfs/strfry:

```yaml
services:
  # Shared infrastructure (from base docker-compose.yml):
  #   postgres:5432, rustfs:9000, strfry:7777

  # Per-platform hub instances (isolated state via separate admin keypairs)
  app-desktop:
    extends:
      service: app
    ports:
      - "3001:3000"
    environment:
      - ADMIN_PUBKEY=${ADMIN_PUBKEY_DESKTOP}
      - HOTLINE_NAME=TestDesktop

  app-ios:
    extends:
      service: app
    ports:
      - "3002:3000"
    environment:
      - ADMIN_PUBKEY=${ADMIN_PUBKEY_IOS}
      - HOTLINE_NAME=TestIOS

  app-android:
    extends:
      service: app
    ports:
      - "3003:3000"
    environment:
      - ADMIN_PUBKEY=${ADMIN_PUBKEY_ANDROID}
      - HOTLINE_NAME=TestAndroid
```

Each platform test script sets its hub URL:
- Desktop Playwright: `BASE_URL=http://localhost:3001`
- iOS XCUITest: `TEST_HUB_URL=http://localhost:3002`
- Android Cucumber: `TEST_HUB_URL=http://localhost:3003`

Benefits:
- **No test interference** — each platform has its own admin, volunteers, and state
- **Single `docker compose up`** — one command starts the entire test cluster
- **Shared infrastructure** — postgres, rustfs, strfry run once (saves memory/CPU)
- **Parallel execution** — all platform E2E suites can run simultaneously

The orchestrator starts the cluster before running tests:

```bash
# scripts/test-orchestrator.sh
docker compose -f docker-compose.yml -f docker-compose.test.yml -f docker-compose.e2e.yml up -d --build --wait
# ... run all platform tests in parallel ...
docker compose -f docker-compose.yml -f docker-compose.test.yml -f docker-compose.e2e.yml down
```

#### Files to Create

| File | Purpose |
|------|---------|
| `deploy/docker/docker-compose.e2e.yml` | Multi-hub E2E overlay |
| `deploy/docker/.env.e2e` | Pre-generated admin keypairs for each platform hub |

### Phase 7: BDD Development Workflow Enforcement

Document and enforce the BDD-first pattern in CLAUDE.md:

1. **Write/update Gherkin feature file** in `packages/test-specs/features/`
2. **Run `bun run test-specs:validate`** to see which platforms need step implementations
3. **Implement step definitions** for each affected platform
4. **Implement the feature code**
5. **Run `bun run test:feature <name>`** to verify across platforms
6. **Run `bun run test:all`** for full regression before commit

Update CLAUDE.md pre-commit checklist to use new commands:

```bash
# Pre-commit (replaces current multi-step checklist)
bun run test:all              # Runs codegen + typecheck + build + test for all available platforms
# Or for faster iteration:
bun run test:changed          # Only test platforms affected by your changes
```

### Phase 8: CI Integration

Update `.github/workflows/ci.yml` to use the new scripts:

```yaml
jobs:
  test-desktop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun run test:desktop --json
      - uses: actions/upload-artifact@v4
        with:
          name: test-results-desktop
          path: /tmp/test-desktop-*.json

  test-ios:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4
      - run: bun run test:ios --json

  test-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun run test:android --json

  test-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun run test:worker --json

  test-crypto:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun run test:crypto --json

  test-summary:
    needs: [test-desktop, test-ios, test-android, test-worker, test-crypto]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - run: scripts/lib/merge-results.sh  # Aggregate JSON results into summary
```

## Acceptance Criteria

1. `bun run test:all` works and runs all available platforms with proper codegen, parallel execution, and clear summary
2. No more 20-minute waits for null output -- timeout warnings at 80%, diagnostic dump on timeout, full log always captured
3. `bun run test:feature <name>` runs tests matching a feature name across all platforms
4. `bun run test:changed` runs only tests for platforms affected by recent changes
5. All test scripts support `--verbose`, `--no-codegen`, `--json`, and `--timeout` flags
6. Every test script produces a structured summary block showing pass/fail counts, duration, and failure details
7. Codegen guard prevents false test failures from stale generated files
8. CLAUDE.md updated with new commands, BDD workflow, and troubleshooting guide
9. CI uses new scripts with JSON output and aggregated summary job
10. Existing `bun run test` command continues to work (backward compatible)

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/test-orchestrator.sh` | Main entry point for `test:all` |
| `scripts/test-desktop.sh` | Desktop codegen-build-test pipeline |
| `scripts/test-android.sh` | Android codegen-build-test pipeline |
| `scripts/test-ios.sh` | iOS codegen-build-test pipeline |
| `scripts/test-worker.sh` | Worker codegen-build-test pipeline |
| `scripts/test-crypto.sh` | Crypto test pipeline |
| `scripts/test-feature.sh` | Cross-platform per-feature test runner |
| `scripts/test-changed.sh` | Incremental test runner based on git diff |
| `scripts/lib/test-reporter.sh` | Structured output formatting and JSON generation |
| `scripts/lib/codegen-guard.sh` | Pre-test codegen validation |
| `scripts/lib/platform-detect.sh` | Detect available platforms (Mac vs Linux) |
| `scripts/lib/merge-results.sh` | CI job to aggregate JSON test results |
| `packages/test-specs/tools/feature-mapper.ts` | Map feature names to platform test files |
| `deploy/docker/docker-compose.e2e.yml` | Multi-hub E2E overlay for parallel platform testing |
| `deploy/docker/.env.e2e` | Pre-generated admin keypairs for each platform hub |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `test:all`, `test:desktop`, `test:android`, `test:ios`, `test:worker`, `test:crypto`, `test:feature`, `test:changed` scripts |
| `CLAUDE.md` | Updated development commands, BDD workflow, pre-commit checklist, troubleshooting |
| `.github/workflows/ci.yml` | Use new test scripts with `--json`, add `test-summary` job |
| `packages/test-specs/tools/validate-coverage.ts` | Enhanced reporting, feature-to-test mapping integration |

## Dependencies

- **Epic 265** (i18n alignment) -- tests won't pass with broken strings
- **Epic 266** (i18n validation) -- codegen guard uses `i18n:validate`
- **No external dependencies** -- all scripts use bash, bun, and existing build tools

## Verification

```bash
# New orchestration works
bun run test:all --verbose

# Individual platforms
bun run test:desktop
bun run test:ios
bun run test:android
bun run test:worker
bun run test:crypto

# Feature-scoped testing
bun run test:feature auth
bun run test:feature notes

# Incremental testing
bun run test:changed

# JSON output for CI
bun run test:desktop --json
cat /tmp/test-desktop-*.json | jq .result

# Codegen guard catches stale files
echo "break" >> packages/protocol/generated/typescript/index.ts
bun run test:desktop  # Should fail at codegen guard step

# Backward compatibility
bun run test          # Still works (existing Playwright tests)
bun run test:android  # Still works (existing Android tests)
```

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Commands to run all platform tests | 6+ (memorized) | 1 (`test:all`) |
| Null/empty test output incidents | Frequent | 0 (full log always captured) |
| Time to identify test failure cause | Minutes (grep through CI logs) | Seconds (structured summary) |
| Codegen-stale false failures | Occasional | 0 (guard prevents) |
| Cross-platform feature test command | None | `test:feature <name>` |
| CI test result aggregation | Manual inspection | Automated summary job |
