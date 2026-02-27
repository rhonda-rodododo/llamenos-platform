# Epic 100: llamenos-core Native Build for Mobile

**Status: COMPLETE**
**Repo**: llamenos-core

## Summary

Build llamenos-core Rust crate for all mobile targets and package pre-built native libraries as GitHub Release artifacts.

## Deliverables

- `rust-toolchain.toml` with all mobile targets (Android 4 arch + iOS device/sim)
- `scripts/build-mobile.sh` — builds all mobile targets + generates UniFFI bindings
- Updated `.github/workflows/release.yml` with `build-mobile-android` and `build-mobile-ios` jobs
- Release artifacts: `llamenos-core-android-v{version}.tar.gz` and `llamenos-core-ios-v{version}.tar.gz`

## Build Targets

**Android** (4 architectures via `cargo-ndk`, API level 24):
- aarch64-linux-android (arm64-v8a)
- armv7-linux-androideabi (armeabi-v7a)
- i686-linux-android (x86)
- x86_64-linux-android (x86_64)

**iOS** (device + simulator → XCFramework):
- aarch64-apple-ios (device)
- aarch64-apple-ios-sim (simulator)

## Output Layout

```
dist/android/
  jniLibs/{arm64-v8a,armeabi-v7a,x86,x86_64}/libllamenos_core.so
  kotlin/org/llamenos/core/llamenos_core.kt

dist/ios/
  LlamenosCore.xcframework/
  LlamenosCore.swift
  LlamenosCoreFFI.h
  LlamenosCoreFFI.modulemap
```
