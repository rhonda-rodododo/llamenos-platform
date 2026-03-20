# Development Setup

## Multi-Machine Workflow

**Mac M4** (`ssh mac`, 192.168.50.243, user `rhonda`) — iOS builds, XCUITest, UniFFI XCFramework, simulator testing.
**Linux** (192.168.50.95) — Desktop, backend, Android E2E. Coordinate via git push/pull on the `desktop` branch.

### Mac M4 specifics
- macOS 26.2 (Tahoe), Xcode 26.2, iOS Simulator 26.2
- Passwordless SSH via `~/.ssh/id_ed25519`
- SSH PATH init required: `eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null; export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"`
- Available simulators: iPhone 17 series, iPhone 16e (NO iPhone 16 — Xcode 26.2)
- `swift build` does NOT work for iOS-only SPM packages — use `xcodebuild`
