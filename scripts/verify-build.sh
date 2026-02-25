#!/usr/bin/env bash
# verify-build.sh — Verify deployed build matches source code (Epic 79)
#
# Reproduces the build locally in Docker and compares checksums against
# published GitHub Release artifacts. The GitHub Release is the trust anchor,
# NOT the deployed application's /api/config/verify endpoint.
#
# Requirements: git, docker, gh (GitHub CLI)
#
# Usage:
#   ./scripts/verify-build.sh              # Verify latest release
#   ./scripts/verify-build.sh v0.18.0      # Verify specific version

set -euo pipefail

VERSION="${1:-}"
REPO="rhonda-rodododo/llamenos"

echo "=== Llamenos Build Verification ==="
echo ""

# Determine version to verify
if [ -z "$VERSION" ]; then
  VERSION=$(gh release list --repo "$REPO" --limit 1 --json tagName --jq '.[0].tagName')
  if [ -z "$VERSION" ]; then
    echo "ERROR: No releases found for $REPO"
    exit 1
  fi
  echo "Latest release: $VERSION"
else
  echo "Verifying: $VERSION"
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
echo "Working directory: $WORKDIR"
echo ""

# Clone source at the specified version
echo "--- Cloning source at $VERSION ---"
git clone --depth 1 --branch "$VERSION" "https://github.com/${REPO}.git" "$WORKDIR/source"

# Get SOURCE_DATE_EPOCH from git commit
SOURCE_DATE_EPOCH=$(git -C "$WORKDIR/source" log -1 --format=%ct)
GITHUB_SHA=$(git -C "$WORKDIR/source" log -1 --format=%H)
echo "Commit: $GITHUB_SHA"
echo "SOURCE_DATE_EPOCH: $SOURCE_DATE_EPOCH"
echo ""

# Build in Docker container (Linux — required for deterministic Tailwind CSS)
echo "--- Building in Docker container ---"
docker build \
  -f "$WORKDIR/source/Dockerfile.build" \
  --build-arg "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH" \
  --build-arg "GITHUB_SHA=$GITHUB_SHA" \
  -t llamenos-verify \
  "$WORKDIR/source"

# Extract build artifacts
echo ""
echo "--- Extracting build artifacts ---"
docker create --name llamenos-verify-extract llamenos-verify
docker cp llamenos-verify-extract:/build/dist "$WORKDIR/local-build"
docker rm llamenos-verify-extract

# Compute local checksums
echo ""
echo "--- Computing local checksums ---"
(cd "$WORKDIR/local-build" && find . -type f -exec sha256sum {} \; | sort) > "$WORKDIR/local-checksums.txt"
echo "$(wc -l < "$WORKDIR/local-checksums.txt") files checksummed"

# Fetch published checksums from GitHub Release
echo ""
echo "--- Fetching published checksums from GitHub Release ---"
if gh release download "$VERSION" --repo "$REPO" --pattern "CHECKSUMS.txt" --dir "$WORKDIR" 2>/dev/null; then
  echo "Downloaded CHECKSUMS.txt"
else
  echo "WARNING: No CHECKSUMS.txt found in release $VERSION"
  echo "This release may predate the reproducible builds feature."
  echo ""
  echo "Local checksums saved to: $WORKDIR/local-checksums.txt"
  echo "You can manually compare these against a known-good build."
  exit 0
fi

# Verify GPG signature if available
if gh release download "$VERSION" --repo "$REPO" --pattern "CHECKSUMS.txt.asc" --dir "$WORKDIR" 2>/dev/null; then
  echo "Downloaded CHECKSUMS.txt.asc"
  if gpg --verify "$WORKDIR/CHECKSUMS.txt.asc" "$WORKDIR/CHECKSUMS.txt" 2>/dev/null; then
    echo "GPG signature: VERIFIED"
  else
    echo "WARNING: GPG signature verification FAILED"
  fi
else
  echo "No GPG signature found (CHECKSUMS.txt.asc)"
fi

# Compare checksums
echo ""
echo "--- Comparing checksums ---"
if diff "$WORKDIR/local-checksums.txt" "$WORKDIR/CHECKSUMS.txt" > /dev/null 2>&1; then
  echo ""
  echo "BUILD VERIFIED: Local build matches published checksums"
  exit 0
else
  echo ""
  echo "BUILD MISMATCH: Local build differs from published checksums"
  echo ""
  diff "$WORKDIR/local-checksums.txt" "$WORKDIR/CHECKSUMS.txt" || true
  exit 1
fi
