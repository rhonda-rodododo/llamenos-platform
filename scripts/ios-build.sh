#!/usr/bin/env bash
# iOS build pipeline — runs locally on Mac
#
# Usage:
#   ./scripts/ios-build.sh status      # Check Xcode/toolchain status
#   ./scripts/ios-build.sh setup       # Install Rust + iOS targets + xcodegen
#   ./scripts/ios-build.sh build       # Build app via xcodegen + xcodebuild
#   ./scripts/ios-build.sh test        # Run unit tests (xcodegen project)
#   ./scripts/ios-build.sh uitest      # Run XCUITests on simulator
#   ./scripts/ios-build.sh xcframework # Build LlamenosCoreFFI XCFramework
#   ./scripts/ios-build.sh all         # xcframework + build + test + uitest
#
# Environment:
#   IOS_SIMULATOR   Simulator device name (default: auto-detected)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/apps/ios"
CRYPTO_DIR="$PROJECT_ROOT/packages/crypto"

XCODE_SCHEME="Llamenos"
XCODE_PROJECT="$IOS_DIR/Llamenos.xcodeproj"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[ios]${NC} $*"; }
warn() { echo -e "${YELLOW}[ios]${NC} $*"; }
err()  { echo -e "${RED}[ios]${NC} $*" >&2; }
info() { echo -e "${BLUE}[ios]${NC} $*"; }

# ─── Simulator detection ─────────────────────────────────────

find_simulator() {
  if [ -n "${IOS_SIMULATOR:-}" ]; then
    echo "$IOS_SIMULATOR"
    return
  fi
  xcrun simctl list devices available -j 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in sorted(data.get('devices', {}).items(), reverse=True):
    if 'iOS' in runtime:
        for d in devices:
            if d.get('isAvailable') and 'iPhone' in d.get('name', ''):
                print(d['name'])
                sys.exit(0)
print('iPhone 17')
" 2>/dev/null || echo "iPhone 17"
}

# ─── Helpers ──────────────────────────────────────────────────

ensure_xcodeproj() {
  if [ ! -d "$XCODE_PROJECT" ]; then
    log "Generating Xcode project from project.yml..."
    cd "$IOS_DIR" && xcodegen generate
  fi
}

# Filter xcodebuild output to show only relevant lines (errors, warnings, test results)
# Uses --line-buffered to avoid pipe buffering hangs
filter_xcodebuild() {
  if command -v xcbeautify &>/dev/null; then
    xcbeautify --quiet
  else
    grep --line-buffered -E '(Test Case|Test Suite|error:|warning:|BUILD|FAILED|passed|failed|\*\*|Executed)' || true
  fi
}

# ─── Commands ─────────────────────────────────────────────────

cmd_status() {
  log "Checking toolchain status..."
  echo ""
  echo "=== macOS ==="
  sw_vers
  echo ""
  echo "=== Xcode ==="
  xcodebuild -version 2>&1 | head -2
  echo ""
  echo "=== xcodegen ==="
  xcodegen --version 2>&1 || echo "NOT INSTALLED — brew install xcodegen"
  echo ""
  echo "=== Rust ==="
  if command -v rustc &>/dev/null; then
    rustc --version
    echo "  iOS targets:"
    rustup target list --installed 2>/dev/null | grep "ios" || echo "  none"
  else
    echo "  NOT INSTALLED — run: ./scripts/ios-build.sh setup"
  fi
  echo ""
  echo "=== Simulators (iPhone) ==="
  xcrun simctl list devices available | grep -E "iPhone" | head -10
  echo ""
  echo "=== Selected Simulator ==="
  echo "  $(find_simulator)"
}

cmd_setup() {
  log "Setting up build toolchain..."

  if ! command -v rustc &>/dev/null; then
    log "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    source "$HOME/.cargo/env"
  else
    info "Rust already installed: $(rustc --version)"
  fi

  log "Adding iOS cross-compilation targets..."
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim

  if ! command -v xcodegen &>/dev/null; then
    log "Installing xcodegen via Homebrew..."
    brew install xcodegen
  else
    info "xcodegen already installed."
  fi

  if ! command -v xcbeautify &>/dev/null; then
    log "Installing xcbeautify via Homebrew..."
    brew install xcbeautify
  else
    info "xcbeautify already installed."
  fi

  log "Setup complete. Run './scripts/ios-build.sh status' to verify."
}

cmd_xcframework() {
  log "Building LlamenosCoreFFI XCFramework..."
  cd "$CRYPTO_DIR"
  bash scripts/build-mobile.sh ios

  log "Installing XCFramework to apps/ios/..."
  rm -rf "$IOS_DIR/LlamenosCoreFFI.xcframework"
  cp -R dist/ios/LlamenosCoreFFI.xcframework "$IOS_DIR/LlamenosCoreFFI.xcframework"
  cp dist/ios/LlamenosCore.swift "$IOS_DIR/Sources/Generated/LlamenosCore.swift"

  log "XCFramework built and installed."
}

cmd_build() {
  log "Building iOS app..."
  ensure_xcodeproj

  local sim_device
  sim_device=$(find_simulator)
  log "Using simulator: $sim_device"

  cd "$IOS_DIR"
  xcodebuild build \
    -project Llamenos.xcodeproj \
    -scheme "$XCODE_SCHEME" \
    -destination "platform=iOS Simulator,name=$sim_device" \
    -quiet \
    2>&1

  log "Build succeeded."
}

cmd_test() {
  log "Running iOS unit tests..."
  ensure_xcodeproj

  local sim_device
  sim_device=$(find_simulator)
  log "Using simulator: $sim_device"

  cd "$IOS_DIR"
  xcodebuild test \
    -project Llamenos.xcodeproj \
    -scheme "$XCODE_SCHEME" \
    -only-testing:LlamenosTests \
    -destination "platform=iOS Simulator,name=$sim_device" \
    2>&1 | filter_xcodebuild

  log "Unit tests complete."
}

cmd_uitest() {
  log "Running XCUITests on simulator..."
  ensure_xcodeproj

  local sim_device
  sim_device=$(find_simulator)
  log "Using simulator: $sim_device"

  cd "$IOS_DIR"
  set +e
  xcodebuild test \
    -project Llamenos.xcodeproj \
    -scheme "$XCODE_SCHEME" \
    -only-testing:LlamenosUITests \
    -destination "platform=iOS Simulator,name=$sim_device" \
    -resultBundlePath /tmp/llamenos-uitest.xcresult \
    2>&1 | filter_xcodebuild
  local exit_code=$?
  set -e

  # Show test summary
  echo ""
  log "Test result bundle: /tmp/llamenos-uitest.xcresult"

  if [ $exit_code -ne 0 ]; then
    warn "Some UI tests failed (exit code $exit_code)"
    return $exit_code
  fi
  log "All XCUITests passed."
}

cmd_all() {
  cmd_xcframework
  cmd_build
  cmd_test
  cmd_uitest
  log "All iOS build steps completed successfully."
}

cmd_help() {
  echo "Usage: $0 <command>"
  echo ""
  echo "Commands:"
  echo "  status       Check Xcode, Rust, Swift, xcodegen, and simulator status"
  echo "  setup        Install Rust, iOS targets, xcodegen, and xcbeautify (first-time)"
  echo "  build        Build the iOS app (generates .xcodeproj via xcodegen if needed)"
  echo "  test         Run unit tests via xcodebuild (LlamenosTests target)"
  echo "  uitest       Run XCUITests on a simulator (LlamenosUITests target)"
  echo "  xcframework  Build the LlamenosCoreFFI XCFramework (requires Xcode + Rust)"
  echo "  all          xcframework + build + test + uitest"
  echo ""
  echo "Environment variables:"
  echo "  IOS_SIMULATOR  Override simulator device name (default: auto-detected)"
}

# ─── Main ─────────────────────────────────────────────────────

ACTION="${1:-help}"
case "$ACTION" in
  status)      cmd_status ;;
  setup)       cmd_setup ;;
  xcframework) cmd_xcframework ;;
  build)       cmd_build ;;
  test)        cmd_test ;;
  uitest)      cmd_uitest ;;
  all)         cmd_all ;;
  help|--help|-h) cmd_help ;;
  *)
    err "Unknown command: $ACTION"
    echo ""
    cmd_help
    exit 1
    ;;
esac
