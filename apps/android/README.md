# apps/android

Native Kotlin/Compose Android client for Llamenos (minSdk 26, Material 3, Hilt DI + KSP, AGP 9.1, Gradle 9.4).

## Prerequisites

- **Android Studio** or the Android SDK CLI
- Rust + `cargo` (for building the JNI libraries)
- Java 17+

## Setup (first time)

```bash
bun run setup:android    # Install Android SDK components
# Build Rust JNI libraries
cd packages/crypto && ./scripts/build-mobile.sh android
# Copy .so files to apps/android/app/src/main/jniLibs/
```

## Commands

```bash
bun run test:android          # Unit tests + lint + build androidTest APK
bun run test:android:e2e      # Cucumber BDD E2E on connected device/emulator

# Direct Gradle (from apps/android/)
./gradlew testDebugUnitTest         # Unit tests
./gradlew lintDebug                 # Lint
./gradlew compileDebugAndroidTestKotlin  # Compile E2E test APK
./gradlew assembleDebug             # Build debug APK
```

## Structure

```
app/src/main/
  java/org/llamenos/
    crypto/       # CryptoService singleton (JNI wrapper, keys never leave this layer)
    api/          # API client
    ui/           # Compose screens and navigation
    di/           # Hilt dependency injection modules
    service/      # Background services (push, call handling)
  jniLibs/        # Rust .so files (gitignored — built from packages/crypto)
  res/            # Resources (layouts, strings, drawables)
gradle/
  libs.versions.toml  # Version catalog
```

## Crypto (UniFFI JNI)

`CryptoService` is a Hilt singleton wrapping the Rust FFI. Device private keys are stored in `EncryptedSharedPreferences` (Android Keystore-backed) and never cross the service boundary into ViewModels or UI.

Build the Rust native libraries:
```bash
cd packages/crypto && ./scripts/build-mobile.sh android
```
Then copy the resulting `.so` files to `apps/android/app/src/main/jniLibs/`.

A placeholder mock crypto is active until the native libraries are linked (enables builds without a full Rust toolchain).

## Version Management

Versions are managed by **knope** — never manually edit version strings in `build.gradle.kts` or `gradle.properties`. Use `bun run version:bump`.
