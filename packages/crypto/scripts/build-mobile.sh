#!/usr/bin/env bash
# Build mobile libraries and generate UniFFI bindings for iOS and Android.
#
# Usage:
#   ./scripts/build-mobile.sh           # Build both platforms (default)
#   ./scripts/build-mobile.sh ios       # Build iOS only
#   ./scripts/build-mobile.sh android   # Build Android only
#
# Environment:
#   ANDROID_NDK_HOME  Path to Android NDK (auto-detected if unset)
#   RELEASE_PROFILE   Cargo profile for release builds (default: release)
#
# Epic 100: Mobile build pipeline for llamenos-core.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$CRATE_DIR"

PLATFORM="${1:-all}"
RELEASE_PROFILE="${RELEASE_PROFILE:-release}"
DIST_DIR="$CRATE_DIR/dist"
LIB_NAME="libllamenos_core"

# ─── Validation ────────────────────────────────────────────────

if [[ ! "$PLATFORM" =~ ^(ios|android|all)$ ]]; then
  echo "Usage: $0 [ios|android|all]"
  echo "  ios      Build iOS static libraries + XCFramework"
  echo "  android  Build Android shared libraries (.so)"
  echo "  all      Build both (default)"
  exit 1
fi

# ─── Android NDK detection ─────────────────────────────────────

detect_ndk() {
  if [[ -n "${ANDROID_NDK_HOME:-}" ]]; then
    echo "$ANDROID_NDK_HOME"
    return
  fi

  # Common NDK locations
  local candidates=(
    "$HOME/Android/Sdk/ndk"
    "$HOME/Library/Android/sdk/ndk"
    "/usr/local/lib/android/sdk/ndk"
    "${ANDROID_HOME:-/nonexistent}/ndk"
    "${ANDROID_SDK_ROOT:-/nonexistent}/ndk"
  )

  for base in "${candidates[@]}"; do
    if [[ -d "$base" ]]; then
      # Pick the newest NDK version in the directory
      local newest
      newest=$(ls -1d "$base"/*/ 2>/dev/null | sort -V | tail -1)
      if [[ -n "$newest" ]]; then
        echo "${newest%/}"
        return
      fi
    fi
  done

  echo ""
}

# ─── Android build ─────────────────────────────────────────────

build_android() {
  echo "=============================="
  echo " Building Android libraries"
  echo "=============================="
  echo ""

  # Verify cargo-ndk is installed
  if ! command -v cargo-ndk &>/dev/null; then
    echo "ERROR: cargo-ndk not found. Install it with: cargo install cargo-ndk"
    exit 1
  fi

  local ndk_path
  ndk_path="$(detect_ndk)"
  if [[ -z "$ndk_path" ]]; then
    echo "ERROR: Android NDK not found."
    echo "Set ANDROID_NDK_HOME or install NDK via Android Studio."
    exit 1
  fi
  echo "Using NDK: $ndk_path"
  export ANDROID_NDK_HOME="$ndk_path"

  local android_dist="$DIST_DIR/android/jniLibs"
  mkdir -p "$android_dist"

  echo ""
  echo "Building all Android architectures (API 24, --release)..."
  cargo ndk \
    -t arm64-v8a \
    -t armeabi-v7a \
    -t x86 \
    -t x86_64 \
    -p 24 \
    -o "$android_dist" \
    build --release --features mobile

  echo ""
  echo "Android .so files:"
  find "$android_dist" -name "*.so" -type f | sort

  # Generate Kotlin bindings
  echo ""
  echo "Generating Kotlin bindings..."
  echo "Building uniffi-bindgen binary (release-bindgen profile)..."
  cargo build --profile release-bindgen --features uniffi-bindgen

  local bindgen_lib="target/release-bindgen/${LIB_NAME}"
  if [[ "$(uname)" == "Darwin" ]]; then
    bindgen_lib="${bindgen_lib}.dylib"
  else
    bindgen_lib="${bindgen_lib}.so"
  fi

  if [[ ! -f "$bindgen_lib" ]]; then
    echo "ERROR: Bindgen library not found at $bindgen_lib"
    exit 1
  fi

  local kotlin_dist="$DIST_DIR/android/kotlin"
  mkdir -p "$kotlin_dist"
  cargo run --features uniffi-bindgen --bin uniffi-bindgen -- \
    generate --library "$bindgen_lib" --language kotlin --out-dir "$kotlin_dist"

  echo "Kotlin bindings:"
  find "$kotlin_dist" -name "*.kt" -type f
}

# ─── iOS build ─────────────────────────────────────────────────

build_ios() {
  echo "=============================="
  echo " Building iOS libraries"
  echo "=============================="
  echo ""

  if [[ "$(uname)" != "Darwin" ]]; then
    echo "ERROR: iOS builds require macOS (xcodebuild is needed for XCFramework)."
    exit 1
  fi

  local ios_dist="$DIST_DIR/ios"
  mkdir -p "$ios_dist"

  # Build device (aarch64-apple-ios)
  echo "Building aarch64-apple-ios (device)..."
  cargo build --release --target aarch64-apple-ios --features mobile

  # Build simulator (aarch64-apple-ios-sim)
  echo "Building aarch64-apple-ios-sim (simulator)..."
  cargo build --release --target aarch64-apple-ios-sim --features mobile

  local device_lib="target/aarch64-apple-ios/release/${LIB_NAME}.a"
  local sim_lib="target/aarch64-apple-ios-sim/release/${LIB_NAME}.a"

  if [[ ! -f "$device_lib" ]]; then
    echo "ERROR: Device library not found at $device_lib"
    exit 1
  fi
  if [[ ! -f "$sim_lib" ]]; then
    echo "ERROR: Simulator library not found at $sim_lib"
    exit 1
  fi

  # Generate Swift bindings (need host-native build for uniffi-bindgen)
  echo ""
  echo "Generating Swift bindings..."
  echo "Building uniffi-bindgen binary (release-bindgen profile)..."
  cargo build --profile release-bindgen --features uniffi-bindgen

  local bindgen_lib="target/release-bindgen/${LIB_NAME}.dylib"
  if [[ ! -f "$bindgen_lib" ]]; then
    echo "ERROR: Bindgen library not found at $bindgen_lib"
    exit 1
  fi

  cargo run --features uniffi-bindgen --bin uniffi-bindgen -- \
    generate --library "$bindgen_lib" --language swift --out-dir "$ios_dist"

  local header_file="$ios_dist/LlamenosCoreFFI.h"
  local modulemap_file="$ios_dist/LlamenosCoreFFI.modulemap"

  if [[ ! -f "$header_file" ]]; then
    echo "ERROR: Generated header not found at $header_file"
    exit 1
  fi

  # Wrap static libraries in .framework bundles before creating XCFramework.
  # CocoaPods has a known bug (issues #9528, #11372) where vendored_frameworks
  # with XCFrameworks containing raw .a files doesn't correctly extract them
  # for linking. Using .framework bundles avoids this issue.
  echo ""
  echo "Wrapping static libraries in .framework bundles..."
  local fw_name="LlamenosCoreFFI"
  local device_fw_dir
  local sim_fw_dir
  device_fw_dir="$(mktemp -d)"
  sim_fw_dir="$(mktemp -d)"

  for pair in "$device_lib:$device_fw_dir" "$sim_lib:$sim_fw_dir"; do
    local lib="${pair%%:*}"
    local out="${pair##*:}"
    local fw_path="$out/${fw_name}.framework"
    mkdir -p "$fw_path/Headers" "$fw_path/Modules"
    cp "$lib" "$fw_path/$fw_name"
    cp "$header_file" "$fw_path/Headers/"
    cat > "$fw_path/Modules/module.modulemap" <<MODULEMAP
framework module $fw_name {
  header "LlamenosCoreFFI.h"
  export *
}
MODULEMAP
  done

  # Create XCFramework from .framework bundles
  echo ""
  echo "Creating XCFramework..."
  local xcframework="$ios_dist/LlamenosCoreFFI.xcframework"
  rm -rf "$xcframework"

  xcodebuild -create-xcframework \
    -framework "$device_fw_dir/${fw_name}.framework" \
    -framework "$sim_fw_dir/${fw_name}.framework" \
    -output "$xcframework"

  # Clean up temporary directories
  rm -rf "$device_fw_dir" "$sim_fw_dir"

  echo ""
  echo "iOS artifacts:"
  echo "  $xcframework"
  echo "  $ios_dist/LlamenosCore.swift"
  echo "  $ios_dist/LlamenosCoreFFI.h"
  echo "  $ios_dist/LlamenosCoreFFI.modulemap"
}

# ─── Main ──────────────────────────────────────────────────────

case "$PLATFORM" in
  android)
    build_android
    ;;
  ios)
    build_ios
    ;;
  all)
    build_android
    echo ""
    build_ios
    ;;
esac

echo ""
echo "=============================="
echo " Build Summary"
echo "=============================="

if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  echo ""
  echo "Android:"
  if [[ -d "$DIST_DIR/android/jniLibs" ]]; then
    find "$DIST_DIR/android/jniLibs" -name "*.so" -type f | while read -r f; do
      size=$(du -h "$f" | cut -f1)
      echo "  $size  $(echo "$f" | sed "s|$DIST_DIR/||")"
    done
  fi
  if [[ -d "$DIST_DIR/android/kotlin" ]]; then
    find "$DIST_DIR/android/kotlin" -name "*.kt" -type f | while read -r f; do
      echo "  $(echo "$f" | sed "s|$DIST_DIR/||")"
    done
  fi
fi

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  echo ""
  echo "iOS:"
  if [[ -d "$DIST_DIR/ios/LlamenosCore.xcframework" ]]; then
    echo "  ios/LlamenosCore.xcframework/"
  fi
  for file in LlamenosCore.swift LlamenosCoreFFI.h LlamenosCoreFFI.modulemap; do
    if [[ -f "$DIST_DIR/ios/$file" ]]; then
      echo "  ios/$file"
    fi
  done
fi

echo ""
echo "Done. Artifacts are in dist/"
