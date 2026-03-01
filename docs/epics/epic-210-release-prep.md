# Epic 210: Release Prep

## Goal

Prepare both mobile apps for App Store and Play Store submission: store listings, signing configurations, CI/CD for mobile builds, and documentation updates.

## Context

With feature parity achieved in Epics 208-209, the apps are functionally ready. This epic handles the non-code work needed to ship: store compliance, build signing, automated release pipelines, and repository cleanup.

## Implementation

### iOS: App Store Connect

#### App Store Listing
- **App Name**: Llámenos Hotline
- **Category**: Social Networking (primary), Utilities (secondary)
- **Age Rating**: 17+ (crisis content)
- **Privacy Policy URL**: Required — link to llamenos.org/privacy
- **App Privacy**: Declare data types collected (none stored by Apple, E2EE)
- **Screenshots**: 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15), 5.5" (iPhone 8 Plus) — 5 screens each
- **Description**: Bilingual (English/Spanish) with emphasis on volunteer security

#### Signing Configuration
- **Team**: Llamenos organization Apple Developer account
- **Bundle ID**: `org.llamenos.hotline`
- **Provisioning Profiles**:
  - Development (auto-managed by Xcode)
  - App Store Distribution (manual, for CI)
- **Capabilities**: Push Notifications, VoIP (PushKit), Background Modes (audio, voip, fetch, remote-notification)
- **Entitlements**: Keychain access group, App Groups (for notification extension)

#### CI/CD: Xcode Cloud or Fastlane

**Option A: Fastlane (recommended)**
```ruby
# apps/ios/fastlane/Fastfile
lane :beta do
  increment_build_number
  build_app(
    scheme: "Llamenos",
    export_method: "app-store"
  )
  upload_to_testflight
end

lane :release do
  build_app(
    scheme: "Llamenos",
    export_method: "app-store"
  )
  upload_to_app_store(
    submit_for_review: true,
    automatic_release: false
  )
end
```

**Option B: Xcode Cloud**
- Simpler setup (Apple-managed CI)
- Automatic signing
- But: less control, harder to integrate with monorepo

### Android: Play Console

#### Store Listing
- **App Name**: Llámenos Hotline
- **Category**: Communication
- **Content Rating**: IARC questionnaire (crisis service)
- **Privacy Policy**: Required — link to llamenos.org/privacy
- **Data Safety**: Declare encrypted data handling, no data sharing
- **Screenshots**: Phone (16:9), 7" Tablet, 10" Tablet — 4-8 screens each
- **Feature Graphic**: 1024x500 banner
- **Short Description**: "Secure crisis response for hotline volunteers"

#### Signing Configuration
- **Upload key**: Generated locally, stored in GitHub Secrets
- **App signing by Google Play**: Enabled (Google manages release signing key)
- **Keystore**: `llamenos-release.keystore` — NEVER committed to git

```kotlin
// apps/android/app/build.gradle.kts
android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "release.keystore")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("KEY_ALIAS") ?: "llamenos"
            keyPassword = System.getenv("KEY_PASSWORD") ?: ""
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

#### CI/CD: GitHub Actions + Gradle

```yaml
# .github/workflows/mobile-release.yml
mobile-android:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: 17
    - name: Build crypto for Android
      run: |
        cd packages/crypto
        ./scripts/build-mobile.sh android
        cp -r dist/android/jniLibs/* ../apps/android/app/src/main/jniLibs/
    - name: Build release AAB
      working-directory: apps/android
      env:
        KEYSTORE_PATH: ${{ github.workspace }}/release.keystore
        KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
        KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
        KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
      run: ./gradlew bundleRelease
    - name: Upload to Play Store
      uses: r0adkll/upload-google-play@v1
      with:
        serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT }}
        packageName: org.llamenos.hotline
        releaseFiles: apps/android/app/build/outputs/bundle/release/*.aab
        track: internal  # internal → alpha → beta → production
```

### Unified Release Workflow

Extend the existing `tauri-release.yml` to include mobile builds:

```yaml
# .github/workflows/release.yml (consolidated)
on:
  push:
    tags: ['v*']

jobs:
  build-desktop:
    # Existing Tauri build matrix (macOS, Windows, Linux, Flatpak)
    ...

  build-ios:
    runs-on: macos-latest
    needs: build-desktop  # sequential to avoid resource contention
    steps:
      - uses: actions/checkout@v4
      - name: Build crypto for iOS
        run: cd packages/crypto && ./scripts/build-mobile.sh ios
      - name: Build and archive
        run: |
          cd apps/ios
          xcodebuild archive -scheme Llamenos -archivePath build/Llamenos.xcarchive
          xcodebuild -exportArchive -archivePath build/Llamenos.xcarchive -exportPath build/export
      - name: Upload to TestFlight
        # Fastlane or altool

  build-android:
    runs-on: ubuntu-latest
    needs: build-desktop
    steps:
      - uses: actions/checkout@v4
      - name: Build crypto for Android
        run: cd packages/crypto && ./scripts/build-mobile.sh android
      - name: Build release AAB
        working-directory: apps/android
        run: ./gradlew bundleRelease
      - name: Upload to Play Store
        # Play Store upload action

  build-docker:
    # Existing Docker build
    ...

  release:
    needs: [build-desktop, build-ios, build-android, build-docker]
    # Create GitHub Release with all artifacts
```

### Version Synchronization

All platforms share a single version number. Update `scripts/bump-version.ts` to include mobile:

```typescript
// Files to update on version bump:
const VERSION_FILES = [
  'package.json',                              // root
  'apps/desktop/tauri.conf.json',              // Tauri
  'apps/desktop/Cargo.toml',                   // Rust
  'apps/android/app/build.gradle.kts',         // Android versionName
  'apps/ios/Sources/App/Info.plist',            // iOS CFBundleShortVersionString
  'deploy/helm/llamenos/Chart.yaml',           // Helm
  'flatpak/org.llamenos.Hotline.metainfo.xml', // Flatpak
]
```

Android also needs `versionCode` (integer, always incrementing). Use build number from CI or derive from version string.

### Reproducible Builds

Extend the existing reproducible build system to mobile:

- **iOS**: Set `CURRENT_PROJECT_VERSION` and `SOURCE_DATE_EPOCH` in build settings
- **Android**: ProGuard mapping files archived per release for crash symbolication
- **Checksums**: Include iOS IPA and Android AAB/APK in `CHECKSUMS.txt`

### Documentation Updates

#### CLAUDE.md
- Add `apps/ios/` and `apps/android/` to directory structure
- Add mobile build commands
- Update multi-platform architecture table
- Remove llamenos-mobile cross-repo references

#### README.md
- Add mobile app download links (App Store, Play Store)
- Update screenshots to include mobile
- Add mobile development setup instructions

#### docs/DEVELOPMENT.md
- iOS development prerequisites (Xcode, Apple Developer account)
- Android development prerequisites (Android Studio, NDK)
- How to build crypto for mobile (`packages/crypto/scripts/build-mobile.sh`)
- How to run mobile tests

### Archive llamenos-mobile Repo

After confirming native apps work:
1. Update `llamenos-mobile` README to point to monorepo `apps/ios/` and `apps/android/`
2. Archive the repo on GitHub (Settings → Archive)
3. Don't delete — preserves issues, PRs, and commit history

## Verification Checklist

1. iOS app builds and archives for App Store distribution
2. Android app builds release AAB with signing
3. CI produces signed artifacts for both platforms
4. Version bump updates all platforms simultaneously
5. TestFlight upload works
6. Play Store internal track upload works
7. Screenshots captured for both stores
8. Privacy policy and data safety declarations complete
9. CLAUDE.md and README.md reflect monorepo structure
10. llamenos-mobile repo archived with redirect

## Risk Assessment

- **Medium risk**: App Store review — Apple may flag VoIP/CallKit usage, need proper justification
- **Medium risk**: Play Store review — data safety declaration must be accurate for encrypted app
- **Low risk**: Signing configuration — standard process, well-documented
- **Low risk**: CI/CD — extending existing workflows
- **High risk**: First submission delays — both stores have review queues (1-7 days)

## Dependencies

- Epic 208 (Feature Parity Phase 1) — core features
- Epic 209 (Feature Parity Phase 2) — full feature set

## Blocks

- Nothing — this is the final epic in the series
