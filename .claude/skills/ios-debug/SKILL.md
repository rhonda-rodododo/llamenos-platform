---
name: ios-debug
description: iOS build, test, and debugging workflows for the Llamenos project. Covers SSH to Mac M4, xcodebuild commands, simulator selection, XCFramework rebuilds, and UniFFI binding sync. Use when building iOS, running XCUITests, debugging crypto FFI issues, or troubleshooting Xcode/SPM problems.
user-invocable: false
---

# iOS Debug & Build Reference

## Mac SSH Setup

**Host alias**: `ssh mac`
**Hardware**: Mac mini M4, macOS 26.2 (Tahoe), Xcode 26.2
**iOS Simulator runtime**: 26.2 — available: iPhone 17 series, iPhone 16e, iPad Pro/Air/mini (NO iPhone 16)
**Worktree path**: `~/.worktrees/<branch-name>` (NOT `~/projects/llamenos/.worktrees/`)

**Always init PATH for non-login SSH shells:**
```bash
ssh mac 'eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null; export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"; <your-command>'
```

Or use the helper from the project root:
```bash
bun run mac:run "<command>"
```

## Project Paths on Mac

- Main project: `~/projects/llamenos/`
- Feature worktrees: `~/.worktrees/<branch>/`
- iOS sources: `apps/ios/Sources/`
- XCFramework: `apps/ios/LlamenosCoreFFI.xcframework/`
- Generated UniFFI bindings: `apps/ios/Sources/Generated/LlamenosCore.swift`

**When reading iOS files on mac from Linux:**
```bash
ssh mac "cat ~/.worktrees/<branch>/apps/ios/Sources/..."
```

## Build Commands

**NEVER use `swift build`** — UIKit unavailable on macOS for iOS-only packages.

```bash
# Build iOS app (requires xcodegen first)
bun run ios:build

# Full: xcframework + build + unit tests + UI tests
bun run ios:all

# Individual steps
bun run ios:xcframework   # Rebuild Rust XCFramework
bun run ios:test          # Unit tests (LlamenosTests)
bun run ios:uitest        # XCUITests on simulator
bun run ios:status        # Check Xcode/Rust/xcodegen status
```

## xcodebuild Directly (when bun scripts aren't enough)

```bash
# Build for simulator (SPM scheme)
ssh mac "cd ~/projects/llamenos && eval \"\$(/opt/homebrew/bin/brew shellenv)\" && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17'"

# Run unit tests
ssh mac "cd ~/projects/llamenos && eval \"\$(/opt/homebrew/bin/brew shellenv)\" && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17'"

# List available simulators (when device not found)
ssh mac "xcrun simctl list devices available"
```

## xcodegen (REQUIRED after adding new Swift files)

```bash
# Must run before xcodebuild when project.yml changes or new files added
ssh mac "cd ~/projects/llamenos/apps/ios && xcodegen generate"
```

**SPM scheme naming**: SPM generates `Llamenos-Package` (not just `Llamenos`)

## XCFramework Rebuild

When Rust crypto changes (new functions, signatures):

```bash
# 1. Build XCFramework from Rust (on mac)
ssh mac "cd ~/projects/llamenos/packages/crypto && ./scripts/build-mobile.sh ios"

# 2. Copy to iOS app (on mac — paths are relative to project)
# The build script handles copying; verify with:
ssh mac "ls ~/projects/llamenos/apps/ios/LlamenosCoreFFI.xcframework/"

# 3. Copy updated UniFFI bindings
ssh mac "cp ~/projects/llamenos/packages/crypto/dist/ios/LlamenosCore.swift ~/projects/llamenos/apps/ios/Sources/Generated/LlamenosCore.swift"
```

**CRITICAL**: `LlamenosCore.swift` bindings MUST match the XCFramework version. Mismatch causes a UniFFI checksum crash at runtime.

## Common Failures

### `-34018` Keychain error in tests
Expected — missing entitlement in SPM test runner. Keychain tests always fail in `xcodebuild test` (SPM context). Use the `.xcodeproj` via xcodegen for full XCUITest runs.

### `@Observable` + Mirror reflection doesn't work
Swift `@Observable` macro rewrites stored properties as private. `Mirror` cannot access them by name. Use known keys + direct FFI calls in tests instead.

### `EXCLUDED_ARCHS` for simulator
XCFramework only has arm64 slices. Always set:
```
EXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64
```
(already in xcconfig — check if missing after xcodegen regeneration)

### "iPhone 16" simulator not found
Use `iPhone 17` or `iPhone 16e` — Xcode 26.2 on macos-26 runner has these, not iPhone 16.

### Dynamic simulator detection (for CI)
```bash
xcrun simctl list devices available | grep -E "iPhone (17|16e)" | head -1 | awk -F'[()]' '{print $2}'
```

## Import Foundation in Test Files
Test files using `UserDefaults`, `URL`, or `Date` must have:
```swift
import Foundation
```
SPM doesn't auto-import it for test targets.
