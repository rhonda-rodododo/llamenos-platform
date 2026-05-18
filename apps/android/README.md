# apps/android

Native Kotlin/Compose Android client for Llamenos (minSdk 26, Material 3, Hilt DI + KSP, AGP 9.1, Gradle 9.4).

## Prerequisites

- **Android Studio** or the Android SDK CLI
- Rust + `cargo` (for building the JNI libraries)
- Java 17+

## Setup (first time)

```bash
bun run setup:android    # Install Android SDK components
# Build Rust JNI libraries (produces debug + release variants)
cd packages/crypto && ./scripts/build-mobile.sh android
# Copy to build-type source sets
cp -r dist/android/jniLibs-debug/* ../../apps/android/app/src/debug/jniLibs/
cp -r dist/android/jniLibs-release/* ../../apps/android/app/src/release/jniLibs/
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
  res/            # Resources (layouts, strings, drawables)
app/src/debug/
  jniLibs/          # Debug .so files (test-kdf, x86_64 emulator — gitignored)
app/src/release/
  jniLibs/          # Release .so files (production Argon2, arm64/armv7 — gitignored)
gradle/
  libs.versions.toml  # Version catalog
```

## Crypto (UniFFI JNI)

`CryptoService` is a Hilt singleton wrapping the Rust FFI. Device private keys are stored in `EncryptedSharedPreferences` (Android Keystore-backed) and never cross the service boundary into ViewModels or UI.

Build the Rust native libraries:
```bash
cd packages/crypto && ./scripts/build-mobile.sh android
```
This produces two variants:
- `dist/android/jniLibs-debug/` — test-kdf params (1MB/1iter/1lane), x86_64 emulator only
- `dist/android/jniLibs-release/` — production Argon2id params (64MB/3iter/4lanes), arm64-v8a + armeabi-v7a

Copy to the corresponding Gradle build-type source sets:
```bash
cp -r dist/android/jniLibs-debug/* ../../apps/android/app/src/debug/jniLibs/
cp -r dist/android/jniLibs-release/* ../../apps/android/app/src/release/jniLibs/
```

A placeholder mock crypto is active until the native libraries are linked (enables builds without a full Rust toolchain).

## Version Management

Versions are managed by **knope** — never manually edit version strings in `build.gradle.kts` or `gradle.properties`. Use `bun run version:bump`.
