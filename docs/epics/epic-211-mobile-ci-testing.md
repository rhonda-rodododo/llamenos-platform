# Epic 211: Mobile CI Testing Pipeline

## Goal

Add automated build and test jobs for iOS and Android to the CI pipeline, ensuring every PR validates all three platforms before merge.

## Context

Epics 206-210 created native iOS and Android apps with unit tests and UI tests, but these are only run locally. The CI pipeline (`ci.yml`) currently only validates desktop (typecheck, build, Playwright E2E) and crypto (cargo test). Mobile builds and tests must be part of the gate.

## Implementation

### Android CI Job

Add to `.github/workflows/ci.yml`:

```yaml
android-build-test:
  needs: changes
  if: needs.changes.outputs.docs_only != 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 20

  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: 17
    - uses: gradle/actions/setup-gradle@v4
    - name: Run unit tests
      working-directory: apps/android
      run: ./gradlew testDebugUnitTest
    - name: Lint
      working-directory: apps/android
      run: ./gradlew lintDebug
    - name: Build debug APK
      working-directory: apps/android
      run: ./gradlew assembleDebug
```

### iOS CI Job

Add to `.github/workflows/ci.yml`:

```yaml
ios-build-test:
  needs: changes
  if: needs.changes.outputs.docs_only != 'true'
  runs-on: macos-latest
  timeout-minutes: 30

  steps:
    - uses: actions/checkout@v4
    - name: Resolve packages
      working-directory: apps/ios
      run: swift package resolve
    - name: Build
      working-directory: apps/ios
      run: swift build
    - name: Run unit tests
      working-directory: apps/ios
      run: swift test
```

### Update CI Status Gate

Update `ci-status` job to include mobile jobs:

```yaml
ci-status:
  needs: [build, audit, crypto-tests, e2e-cf, e2e-docker, android-build-test, ios-build-test]
```

### Update Change Detection

Add mobile path patterns to the `changes` job:

```yaml
APP_PATTERNS="^src/|^apps/|^packages/|^tests/|..."
```

This already covers `apps/` so mobile changes will trigger the full pipeline.

## Verification

1. Push a PR touching `apps/android/` — Android job runs
2. Push a PR touching `apps/ios/` — iOS job runs
3. Push a docs-only PR — mobile jobs skip
4. `ci-status` gates on mobile job results
5. Android unit tests pass in CI
6. iOS unit tests pass in CI (`swift test`)

## Dependencies

- Epic 210 (Release Prep) — CI infrastructure

## Blocks

- Epic 212 (comprehensive test suites need CI to validate)
