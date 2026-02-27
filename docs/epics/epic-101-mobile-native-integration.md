# Epic 101: Mobile Native Module Integration

**Status: PENDING** (depends on Epic 100)
**Repo**: llamenos-mobile

## Summary

Wire pre-built llamenos-core native libraries into the Expo Module so crypto operations use Rust instead of JS.

## Tasks

1. Create `scripts/download-core-libs.sh` — downloads latest llamenos-core release from GitHub
2. Place Android `.so` files into `modules/llamenos-core/android/src/main/jniLibs/`
3. Place iOS XCFramework into `modules/llamenos-core/ios/`
4. Verify `expo-module.config.json` includes correct platform config
5. Add JNA dependency to Android `build.gradle`
6. Test `isNativeCryptoAvailable === true` on both platforms

## Verification

After integration, crypto-provider.ts should report native crypto is active on both platforms.
