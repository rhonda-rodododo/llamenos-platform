# Epic 102: Mobile Static Build Pipeline

**Status: PENDING** (depends on Epic 101)
**Repo**: llamenos-mobile

## Summary

Produce sideloadable APK and iOS simulator .app from CI, attached to GitHub Releases.

## CI Workflow: `.github/workflows/mobile-build.yml`

**Triggers**: Tags matching `v*`, manual dispatch

### Jobs

1. **build-android** (ubuntu-latest, 30min timeout)
   - `expo prebuild --platform android --clean`
   - `cd android && ./gradlew assembleRelease`
   - Upload APK artifact

2. **build-ios-sim** (macos-14, 30min timeout)
   - `expo prebuild --platform ios --clean`
   - `cd ios && pod install`
   - `xcodebuild` with iphonesimulator SDK
   - Upload .tar.gz artifact

3. **release** (after both builds)
   - Attach `Hotline-v{version}.apk` and `Hotline-v{version}-ios-sim.tar.gz` to GitHub Release
