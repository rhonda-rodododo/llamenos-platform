# apps/ios

Native SwiftUI iOS client for Llamenos (iOS 17+). Uses `@Observable`, modern SwiftUI APIs, and the `packages/crypto` Rust crate via UniFFI XCFramework.

## Prerequisites

- **macOS** with Xcode 26+ (builds run on the Mac M4 — `ssh mac`)
- Rust + `cargo` (for building the XCFramework)
- `xcodegen` (`brew install xcodegen`)

## Setup (first time)

```bash
bun run ios:setup    # Install Rust targets, xcodegen, xcbeautify
bun run ios:xcframework  # Build LlamenosCoreFFI XCFramework from packages/crypto
```

## Commands

All iOS commands run from the repo root and execute remotely on the Mac via `bun run mac:run`:

```bash
bun run ios:build      # Build iOS app (auto-generates .xcodeproj via xcodegen)
bun run ios:test       # Run unit tests (LlamenosTests)
bun run ios:uitest     # Run XCUITests on simulator
bun run ios:all        # xcframework + build + test + uitest
bun run ios:status     # Check Xcode, Rust, xcodegen status
```

## Structure

```
Sources/
  App/           # App entry point, AppDelegate
  Services/      # Business logic (CryptoService, AuthService, HubService, …)
  Views/         # SwiftUI view hierarchy
  ViewModels/    # @Observable view models
  Models/        # Data models
  Utilities/     # Helpers, extensions
  Generated/     # UniFFI bindings + codegen output (gitignored)
Tests/           # XCTest unit tests + XCUITest E2E
```

## Crypto (UniFFI)

The `packages/crypto/` Rust crate is compiled to an XCFramework. After building:
1. Copy `packages/crypto/dist/ios/LlamenosCoreFFI.xcframework/` → `apps/ios/LlamenosCoreFFI.xcframework/`
2. Copy `packages/crypto/dist/ios/LlamenosCore.swift` → `apps/ios/Sources/Generated/LlamenosCore.swift`

The generated bindings and the XCFramework **must match** — a version mismatch causes a UniFFI checksum crash at runtime.

`CryptoService` is a singleton that wraps the FFI. Device private keys never leave the service layer (never passed to ViewModels or Views).

## xcodegen

`apps/ios/project.yml` defines the Xcode project. Always run `xcodegen generate` after adding new Swift source files. The `.xcodeproj` is gitignored (regenerated from `project.yml`).

## Gotchas

- `swift build` does **not** work for this package — UIKit is unavailable on macOS. Always use `xcodebuild build -scheme Llamenos-Package -destination "platform=iOS Simulator,name=iPhone 17"`
- SSH PATH init required for non-login shells: `eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null; export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"`
- XCUITest requires the `.xcodeproj` (xcodegen) — SPM cannot build `.app` bundles
