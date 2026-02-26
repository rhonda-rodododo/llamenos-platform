#!/usr/bin/env bash
# generate-update-manifest.sh — Build the latest.json manifest for Tauri auto-updater.
#
# Run in CI after all platform builds complete. Expects:
#   - GITHUB_REF_NAME (e.g., "v1.2.0") or version passed via workflow_dispatch
#   - Platform-specific .sig files in artifacts/ directory
#
# Usage: ./scripts/generate-update-manifest.sh
#
# Epic 87: Desktop Auto-Updater & Distribution.

set -euo pipefail

# Extract version from tag
if [[ "${GITHUB_REF_NAME:-}" =~ ^v(.+)$ ]]; then
  VERSION="${BASH_REMATCH[1]}"
else
  echo "Error: Cannot determine version from GITHUB_REF_NAME=${GITHUB_REF_NAME:-unset}" >&2
  echo "Expected format: v1.2.0" >&2
  exit 1
fi

REPO="${GITHUB_REPOSITORY:-rhonda-rodododo/llamenos}"
BASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}"
ARTIFACTS_DIR="${1:-artifacts}"

echo "Generating update manifest for version ${VERSION}..."

# Read signatures from .sig files
read_sig() {
  local path="${ARTIFACTS_DIR}/$1"
  if [[ -f "$path" ]]; then
    cat "$path"
  else
    echo "Warning: signature file not found: ${path}" >&2
    echo ""
  fi
}

# Get release notes (if gh is available)
NOTES=""
if command -v gh &>/dev/null; then
  NOTES=$(gh release view "v${VERSION}" --repo "${REPO}" --json body -q .body 2>/dev/null | head -500 || echo "")
fi
if [[ -z "$NOTES" ]]; then
  NOTES="Desktop v${VERSION}"
fi

# Escape notes for JSON
NOTES_ESCAPED=$(printf '%s' "$NOTES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$NOTES")

# Build platform entries
PLATFORMS=""

# macOS x86_64
MAC_X64_SIG=$(read_sig "llamenos_${VERSION}_x64.app.tar.gz.sig")
if [[ -n "$MAC_X64_SIG" ]]; then
  PLATFORMS="${PLATFORMS}
    \"darwin-x86_64\": {
      \"signature\": \"${MAC_X64_SIG}\",
      \"url\": \"${BASE_URL}/llamenos_${VERSION}_x64.app.tar.gz\"
    },"
fi

# macOS aarch64
MAC_ARM_SIG=$(read_sig "llamenos_${VERSION}_aarch64.app.tar.gz.sig")
if [[ -n "$MAC_ARM_SIG" ]]; then
  PLATFORMS="${PLATFORMS}
    \"darwin-aarch64\": {
      \"signature\": \"${MAC_ARM_SIG}\",
      \"url\": \"${BASE_URL}/llamenos_${VERSION}_aarch64.app.tar.gz\"
    },"
fi

# Windows x86_64
WIN_SIG=$(read_sig "llamenos_${VERSION}_x64-setup.nsis.zip.sig")
if [[ -n "$WIN_SIG" ]]; then
  PLATFORMS="${PLATFORMS}
    \"windows-x86_64\": {
      \"signature\": \"${WIN_SIG}\",
      \"url\": \"${BASE_URL}/llamenos_${VERSION}_x64-setup.nsis.zip\"
    },"
fi

# Linux x86_64
LINUX_SIG=$(read_sig "llamenos_${VERSION}_amd64.AppImage.sig")
if [[ -n "$LINUX_SIG" ]]; then
  PLATFORMS="${PLATFORMS}
    \"linux-x86_64\": {
      \"signature\": \"${LINUX_SIG}\",
      \"url\": \"${BASE_URL}/llamenos_${VERSION}_amd64.AppImage\"
    },"
fi

# Remove trailing comma from last platform entry
PLATFORMS=$(echo "$PLATFORMS" | sed '$ s/,$//')

cat > latest.json << MANIFEST
{
  "version": "${VERSION}",
  "notes": ${NOTES_ESCAPED},
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {${PLATFORMS}
  }
}
MANIFEST

echo "Generated latest.json:"
cat latest.json
echo ""
echo "Done."
