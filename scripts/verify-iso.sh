#!/usr/bin/env bash
# verify-iso.sh — rebuild a Llamenos ISO in a fresh container and assert
# the output SHA-256 matches the original. Mirrors scripts/verify-build.sh.
#
# Usage: scripts/verify-iso.sh <iso-path> -- <build-iso flags...>
#
# Example:
#   scripts/verify-iso.sh dist/iso/llamenos-fde-debian13-dropbear.iso \
#     -- --hostname test --ssh-key ~/.ssh/id_ed25519.pub --unlock dropbear

set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <iso-path> -- <build-iso flags...>" >&2
  exit 2
fi

ORIGINAL_ISO="$1"
shift
if [ "$1" != "--" ]; then
  echo "Usage: $0 <iso-path> -- <build-iso flags...>" >&2
  exit 2
fi
shift

if [ ! -f "$ORIGINAL_ISO" ]; then
  echo "verify-iso: original ISO not found: $ORIGINAL_ISO" >&2
  exit 2
fi

ORIG_SHA="$(sha256sum "$ORIGINAL_ISO" | awk '{print $1}')"
echo "==> Original SHA-256: $ORIG_SHA"

VERIFY_OUT="$(mktemp -d)"
trap 'rm -rf "$VERIFY_OUT"' EXIT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Rebuilding into $VERIFY_OUT"
"${SCRIPT_DIR}/build-iso.sh" "$@" --out "$VERIFY_OUT" --no-cache

REBUILT_ISO="$(find "$VERIFY_OUT" -name 'llamenos-fde-debian13-*.iso' | head -1)"
if [ -z "$REBUILT_ISO" ]; then
  echo "verify-iso: rebuild produced no ISO" >&2
  exit 1
fi

REBUILT_SHA="$(sha256sum "$REBUILT_ISO" | awk '{print $1}')"
echo "==> Rebuilt SHA-256:  $REBUILT_SHA"

if [ "$ORIG_SHA" = "$REBUILT_SHA" ]; then
  echo "==> REPRODUCIBLE: SHAs match"
  exit 0
else
  echo "==> NOT REPRODUCIBLE: SHA mismatch" >&2
  exit 1
fi
