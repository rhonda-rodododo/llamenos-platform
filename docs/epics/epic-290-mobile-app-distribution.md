# Epic 290: Mobile App Distribution & Update Management

**Status**: DONE
**Priority**: High
**Depends on**: Epic 288
**Blocks**: None
**Branch**: `desktop`

## Summary

Establish mobile app distribution pipelines for iOS (TestFlight to App Store) and Android (Play Store, F-Droid, and direct APK download). Add client-side version checking on launch that compares the app version against the server's `minApiVersion` from `/api/config` (Epic 288), showing a force-update screen when the app is too old or a soft-update banner when a newer version is available.

## Problem Statement

The CI workflows (`mobile-release.yml`) build iOS and Android artifacts but distribution is incomplete:

1. **iOS**: The workflow structure exists but Apple Developer account setup, provisioning profiles, and TestFlight upload are not wired. No App Store submission process.
2. **Android**: The workflow decodes a keystore from secrets and builds an APK, but there is no Play Store upload step, no F-Droid metadata, and no direct-download APK hosting.
3. **No version check on launch**: Mobile clients do not compare their version against the server. A volunteer could run a months-old build with known security issues and never be warned.
4. **Privacy-focused users** need F-Droid or direct APK downloads — Play Store is not acceptable for all threat models.

## Implementation

### 1. iOS Distribution Pipeline

#### 1a. Provisioning & Signing

Store Apple credentials as GitHub Actions secrets:

- `APPLE_CERTIFICATE_BASE64` — p12 distribution certificate
- `APPLE_CERTIFICATE_PASSWORD` — p12 password
- `APPLE_PROVISIONING_PROFILE_BASE64` — App Store provisioning profile
- `APP_STORE_CONNECT_API_KEY_ID` — App Store Connect API key ID
- `APP_STORE_CONNECT_API_ISSUER_ID` — Issuer ID
- `APP_STORE_CONNECT_API_KEY_BASE64` — p8 private key

**File: `.github/workflows/mobile-release.yml`** — Add iOS signing and upload steps:

```yaml
  build-ios:
    runs-on: macos-latest
    name: Build (iOS)
    timeout-minutes: 45
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-ios,aarch64-apple-ios-sim

      - name: Build crypto XCFramework
        run: |
          cd packages/crypto
          ./scripts/build-mobile.sh ios
          cp -r dist/ios/LlamenosCoreFFI.xcframework ../../apps/ios/

      - name: Install xcodegen
        run: brew install xcodegen

      - name: Generate Xcode project
        run: cd apps/ios && xcodegen generate

      - name: Install Apple certificate and provisioning profile
        env:
          CERTIFICATE_BASE64: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
          CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          PROVISIONING_PROFILE_BASE64: ${{ secrets.APPLE_PROVISIONING_PROFILE_BASE64 }}
        run: |
          CERT_PATH=$RUNNER_TEMP/certificate.p12
          PP_PATH=$RUNNER_TEMP/profile.mobileprovision
          KEYCHAIN_PATH=$RUNNER_TEMP/build.keychain

          echo "$CERTIFICATE_BASE64" | base64 --decode > "$CERT_PATH"
          echo "$PROVISIONING_PROFILE_BASE64" | base64 --decode > "$PP_PATH"

          security create-keychain -p "" "$KEYCHAIN_PATH"
          security set-keychain-settings "$KEYCHAIN_PATH"
          security unlock-keychain -p "" "$KEYCHAIN_PATH"
          security import "$CERT_PATH" -P "$CERTIFICATE_PASSWORD" -A -t cert -k "$KEYCHAIN_PATH"
          security list-keychains -d user -s "$KEYCHAIN_PATH"

          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          cp "$PP_PATH" ~/Library/MobileDevice/Provisioning\ Profiles/

      - name: Archive and export
        run: |
          cd apps/ios
          xcodebuild archive \
            -project Llamenos.xcodeproj \
            -scheme Llamenos \
            -archivePath $RUNNER_TEMP/Llamenos.xcarchive \
            -destination generic/platform=iOS \
            CODE_SIGN_STYLE=Manual \
            DEVELOPMENT_TEAM="${{ secrets.APPLE_TEAM_ID }}"

          xcodebuild -exportArchive \
            -archivePath $RUNNER_TEMP/Llamenos.xcarchive \
            -exportOptionsPlist ExportOptions.plist \
            -exportPath $RUNNER_TEMP/export

      - name: Upload to TestFlight
        env:
          API_KEY_ID: ${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}
          API_ISSUER_ID: ${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}
          API_KEY_BASE64: ${{ secrets.APP_STORE_CONNECT_API_KEY_BASE64 }}
        run: |
          mkdir -p ~/.appstoreconnect/private_keys
          echo "$API_KEY_BASE64" | base64 --decode > ~/.appstoreconnect/private_keys/AuthKey_${API_KEY_ID}.p8

          xcrun altool --upload-app \
            --type ios \
            --file "$RUNNER_TEMP/export/Llamenos.ipa" \
            --apiKey "$API_KEY_ID" \
            --apiIssuer "$API_ISSUER_ID"
```

**File: `apps/ios/ExportOptions.plist`** — New file for archive export:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>upload</string>
    <key>signingStyle</key>
    <string>manual</string>
</dict>
</plist>
```

#### 1b. App Store Metadata

**File: `apps/ios/fastlane/Fastfile`** — Fastlane configuration for App Store submissions:

```ruby
default_platform(:ios)

platform :ios do
  desc "Upload to TestFlight"
  lane :beta do
    upload_to_testflight(
      ipa: "../export/Llamenos.ipa",
      skip_waiting_for_build_processing: true
    )
  end

  desc "Submit to App Store Review"
  lane :release do
    upload_to_app_store(
      ipa: "../export/Llamenos.ipa",
      submit_for_review: true,
      automatic_release: false,
      force: true
    )
  end
end
```

### 2. Android Distribution Pipeline

#### 2a. Play Store Upload

**File: `.github/workflows/mobile-release.yml`** — Add Play Store upload after APK build:

```yaml
      - name: Build release AAB (Play Store)
        env:
          KEYSTORE_FILE: ${{ github.workspace }}/apps/android/release.keystore
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        working-directory: apps/android
        run: |
          export JAVA_HOME=$JAVA_HOME_17_X64
          ./gradlew bundleRelease \
            -Pandroid.injected.signing.store.file="$KEYSTORE_FILE" \
            -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
            -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
            -Pandroid.injected.signing.key.password="$KEY_PASSWORD"

      - name: Upload to Play Store (internal track)
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: org.llamenos.hotline
          releaseFiles: apps/android/app/build/outputs/bundle/release/app-release.aab
          track: internal
          status: completed

      - name: Build release APK (direct download)
        env:
          KEYSTORE_FILE: ${{ github.workspace }}/apps/android/release.keystore
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        working-directory: apps/android
        run: |
          export JAVA_HOME=$JAVA_HOME_17_X64
          ./gradlew assembleRelease \
            -Pandroid.injected.signing.store.file="$KEYSTORE_FILE" \
            -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
            -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
            -Pandroid.injected.signing.key.password="$KEY_PASSWORD"

      - name: Upload APK to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: apps/android/app/build/outputs/apk/release/app-release.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 2b. F-Droid Metadata

**File: `apps/android/fastlane/metadata/android/en-US/full_description.txt`**:
```
Llamenos is a secure crisis response hotline application...
```

**File: `apps/android/fastlane/metadata/android/en-US/short_description.txt`**:
```
Secure crisis response hotline with end-to-end encryption
```

**File: `apps/android/fastlane/metadata/android/en-US/changelogs/default.txt`**:
```
See release notes at https://github.com/rhonda-rodododo/llamenos/releases
```

**File: `apps/android/metadata/org.llamenos.hotline.yml`** — F-Droid build metadata:

```yaml
Categories:
  - Phone & SMS
  - Security
License: AGPL-3.0-or-later
AuthorName: Llamenos Project
WebSite: https://llamenos.org
SourceCode: https://github.com/rhonda-rodododo/llamenos
IssueTracker: https://github.com/rhonda-rodododo/llamenos/issues

RepoType: git
Repo: https://github.com/rhonda-rodododo/llamenos.git

Builds:
  - versionName: 0.18.0
    versionCode: 18
    commit: v0.18.0
    subdir: apps/android
    gradle:
      - yes
    ndk: 28.0.13004108
    prebuild:
      - cd ../../packages/crypto
      - cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ../../apps/android/app/src/main/jniLibs build --release

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 0.18.0
CurrentVersionCode: 18
```

### 3. Client-Side Version Check (Both Platforms)

On app launch, fetch `/api/config` and compare `minApiVersion` against the client's compiled API version (from Epic 288). This is separate from store-level update checks — it ensures the app's wire protocol is compatible with the server.

#### 3a. iOS Version Check

**File: `apps/ios/Sources/Services/APIService.swift`** — Add version check method:

```swift
struct AppConfig: Codable {
    let hotlineName: String
    let apiVersion: Int
    let minApiVersion: Int
    // ... other fields
}

func checkVersionCompatibility() async -> VersionStatus {
    guard let config: AppConfig = try? await get("/config") else {
        return .unknown // Network error — don't block the app
    }
    if Self.apiVersion < config.minApiVersion {
        return .forceUpdate(minVersion: config.minApiVersion)
    }
    if Self.apiVersion < config.apiVersion {
        return .updateAvailable(latestVersion: config.apiVersion)
    }
    return .upToDate
}

enum VersionStatus {
    case upToDate
    case updateAvailable(latestVersion: Int)
    case forceUpdate(minVersion: Int)
    case unknown
}
```

**File: `apps/ios/Sources/App/LlamenosApp.swift`** — Check on launch:

```swift
@Observable
final class AppState {
    var versionStatus: APIService.VersionStatus = .unknown
    var showForceUpdate = false
}

// In onAppear or init:
Task {
    appState.versionStatus = await apiService.checkVersionCompatibility()
    if case .forceUpdate = appState.versionStatus {
        appState.showForceUpdate = true
    }
}
```

**File: `apps/ios/Sources/Views/UpdateRequiredView.swift`** — Modify the view already created by Epic 288 to add App Store link and enhanced styling:

```swift
struct UpdateRequiredView: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "exclamationmark.arrow.circlepath")
                .font(.system(size: 64))
                .foregroundStyle(.orange)
            Text("update_required_title")
                .font(.title2.bold())
            Text("update_required_message")
                .font(.body)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            if let url = URL(string: "https://apps.apple.com/app/id\(AppConstants.appStoreId)") {
                Link("update_required_button", destination: url)
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}
```

**File: `apps/ios/Sources/Views/Components/UpdateBanner.swift`** — Soft-update banner:

```swift
struct UpdateBanner: View {
    let onDismiss: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "arrow.down.app")
            Text("update_available_message")
                .font(.subheadline)
            Spacer()
            Button(action: onDismiss) {
                Image(systemName: "xmark")
            }
        }
        .padding()
        .background(.blue.opacity(0.1))
    }
}
```

#### 3b. Android Version Check

**File: `apps/android/app/src/main/java/org/llamenos/hotline/api/VersionChecker.kt`**:

```kotlin
@Singleton
class VersionChecker @Inject constructor(
    private val apiService: ApiService,
) {
    sealed class VersionStatus {
        data object UpToDate : VersionStatus()
        data class UpdateAvailable(val latestVersion: Int) : VersionStatus()
        data class ForceUpdate(val minVersion: Int) : VersionStatus()
        data object Unknown : VersionStatus()
    }

    suspend fun check(): VersionStatus {
        return try {
            val config = apiService.getConfig()
            when {
                ApiService.API_VERSION < config.minApiVersion ->
                    VersionStatus.ForceUpdate(config.minApiVersion)
                ApiService.API_VERSION < config.apiVersion ->
                    VersionStatus.UpdateAvailable(config.apiVersion)
                else -> VersionStatus.UpToDate
            }
        } catch (_: Exception) {
            VersionStatus.Unknown
        }
    }
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/UpdateRequiredScreen.kt`** — Modify the composable already created by Epic 288 to add Play Store link:

```kotlin
@Composable
fun UpdateRequiredScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.SystemUpdate,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.error,
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = stringResource(R.string.update_required_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.update_required_message),
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))

        val context = LocalContext.current
        Button(onClick = {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(
                "https://play.google.com/store/apps/details?id=org.llamenos.hotline"
            ))
            context.startActivity(intent)
        }) {
            Text(stringResource(R.string.update_required_button))
        }
    }
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/MainScreen.kt`** — Wire version check:

```kotlin
// In MainScreen composable, on first composition:
LaunchedEffect(Unit) {
    val status = versionChecker.check()
    if (status is VersionChecker.VersionStatus.ForceUpdate) {
        showForceUpdate = true
    }
}

if (showForceUpdate) {
    UpdateRequiredScreen()
    return
}
```

### 4. APK Download Page

For privacy-focused users who avoid app stores, host the signed APK on the marketing site or GitHub Releases. The download page should include SHA-256 checksums for verification.

**File: `site/src/content/docs/en/android-download.md`**:

```markdown
# Direct APK Download

For users who prefer not to use the Google Play Store...

1. Download the latest APK from [GitHub Releases](...)
2. Verify the SHA-256 checksum: `sha256sum llamenos-*.apk`
3. Enable "Install from unknown sources" in Android Settings
4. Open the downloaded APK to install
```

### 5. i18n Strings

**File: `packages/i18n/locales/en.json`** — Add under a new `updates` section:

```json
{
  "updates": {
    "update_required_title": "Update Required",
    "update_required_message": "Your app is out of date and can no longer connect to the server. Please update to continue.",
    "update_required_button": "Update Now",
    "update_available_message": "A new version is available. Update for the latest features and security fixes.",
    "update_available_dismiss": "Later"
  }
}
```

Run `bun run i18n:codegen` after adding strings.

## Files to Modify

| File | Change |
|------|--------|
| `.github/workflows/mobile-release.yml` | iOS signing, TestFlight upload, Play Store upload, APK to GitHub Release |
| `apps/ios/ExportOptions.plist` | **New** — Archive export config |
| `apps/ios/fastlane/Fastfile` | **New** — Fastlane lanes for TestFlight and App Store |
| `apps/ios/Sources/Services/APIService.swift` | Add `checkVersionCompatibility()` method |
| `apps/ios/Sources/Views/UpdateRequiredView.swift` | Modify (already created by Epic 288) — add App Store link and enhanced styling |
| `apps/ios/Sources/Views/Components/UpdateBanner.swift` | **New** — Soft-update banner |
| `apps/ios/Sources/App/LlamenosApp.swift` | Version check on launch, conditional force-update screen |
| `apps/android/fastlane/metadata/android/en-US/` | **New** — F-Droid/Play Store metadata |
| `apps/android/metadata/org.llamenos.hotline.yml` | **New** — F-Droid build metadata |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/VersionChecker.kt` | **New** — Version check service |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/UpdateRequiredScreen.kt` | Modify (already created by Epic 288) — add Play Store link |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/MainScreen.kt` | Wire version check |
| `packages/i18n/locales/en.json` | Add `updates.*` strings |
| `packages/i18n/locales/*.json` | Propagate `updates.*` to all 12 other locales |

## Testing

### iOS (XCUITest)

- **Version check unit test**: Mock `/api/config` response with `minApiVersion: 999` — verify `checkVersionCompatibility()` returns `.forceUpdate`.
- **Version check unit test**: Mock response with `minApiVersion: 1, apiVersion: 2` — verify returns `.updateAvailable`.
- **UI test**: Inject `.forceUpdate` state — verify `UpdateRequiredView` renders and blocks navigation.

### Android (Unit + UI)

- **Unit test**: `VersionCheckerTest` — mock `ApiService.getConfig()` with high `minApiVersion` — verify returns `ForceUpdate`.
- **Unit test**: Mock with matching version — verify returns `UpToDate`.
- **UI test**: Inject `ForceUpdate` state into `MainScreen` — verify `UpdateRequiredScreen` composable renders.

### CI (Integration)

- **iOS build test**: Verify `xcodebuild archive` succeeds (signing can be tested with self-signed cert in CI).
- **Android AAB test**: Verify `bundleRelease` produces a valid AAB.
- **APK checksum test**: Verify SHA-256 checksum is generated and matches the uploaded artifact.

### i18n

- `bun run i18n:validate:all` passes after adding `updates.*` strings.

## Acceptance Criteria

- [ ] iOS CI builds, signs, and uploads to TestFlight on version tags
- [ ] Android CI builds signed AAB and uploads to Play Store internal track
- [ ] Android CI builds signed APK and uploads to GitHub Releases
- [ ] F-Droid metadata file exists with build instructions
- [ ] Both iOS and Android check `/api/config` on launch for version compatibility
- [ ] Force-update screen blocks app usage when `minApiVersion` exceeds client version
- [ ] Soft-update banner shown when a newer version is available but not required
- [ ] Update buttons link to the correct app store (App Store / Play Store)
- [ ] i18n strings for update UI added in all 13 locales
- [ ] ExportOptions.plist committed for iOS archive export
- [ ] All platform tests pass

## Risk Assessment

- **Apple review**: Crisis hotline apps may require additional review documentation (humanitarian category). Plan for 1-2 week review cycles.
- **Keystore loss**: Android keystore loss means the app cannot be updated on Play Store — users must uninstall and reinstall. Mitigation: keystore backed up in secure vault (not just GitHub secrets).
- **F-Droid build lag**: F-Droid's build pipeline can take days to weeks after a release. Direct APK download is the faster alternative.
- **Force-update false positive**: If an operator misconfigures `minApiVersion` on their server, all mobile clients are locked out. The update screen should include a "Contact admin" fallback with the hub URL.
- **Network unavailable on launch**: If the device is offline, the version check returns `.unknown` and the app proceeds normally. The check is not blocking when the network is unavailable.
