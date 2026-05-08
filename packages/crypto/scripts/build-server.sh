#!/usr/bin/env bash
# Build the Rust crypto crate as a cdylib (.so) for the Bun server FFI.
# Output: packages/crypto/dist/server/libllamenoscore.so
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$CRATE_DIR/dist/server"

mkdir -p "$OUT_DIR"

echo "Building libllamenoscore.so (server FFI)..."
cargo build --release --manifest-path "$CRATE_DIR/Cargo.toml" --features server

# Determine library filename by platform (Cargo uses underscores in lib names)
case "$(uname -s)" in
  Linux*)   LIB_NAME="libllamenos_core.so" ;;
  Darwin*)  LIB_NAME="libllamenos_core.dylib" ;;
  *)        echo "Unsupported platform: $(uname -s)"; exit 1 ;;
esac

# Copy from target/release to dist/server
TARGET_DIR="${CARGO_TARGET_DIR:-$CRATE_DIR/target}"
cp "$TARGET_DIR/release/$LIB_NAME" "$OUT_DIR/$LIB_NAME"

echo "Built: $OUT_DIR/$LIB_NAME"
echo "Size: $(du -h "$OUT_DIR/$LIB_NAME" | cut -f1)"
