#!/usr/bin/env bash
# Bump the version in Cargo.toml, commit, and create an annotated git tag.
#
# Usage: ./scripts/bump-version.sh <major|minor|patch>
#
# Example:
#   ./scripts/bump-version.sh minor
#   # 0.1.0 → 0.2.0, creates tag v0.2.0
#
# After running, push with: git push origin main --follow-tags
#
# Epic 96: llamenos-core CI/CD Pipeline.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$CRATE_DIR"

BUMP_TYPE="${1:-}"
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: $0 <major|minor|patch>"
  exit 1
fi

# Read current version from Cargo.toml
CURRENT_VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
  minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
  patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
esac

echo "Bumping version: ${CURRENT_VERSION} → ${NEW_VERSION} (${BUMP_TYPE})"

# Update Cargo.toml
sed -i "0,/^version = \"${CURRENT_VERSION}\"/s//version = \"${NEW_VERSION}\"/" Cargo.toml

# Update Cargo.lock
cargo check --quiet 2>/dev/null || true

# Commit and tag
git add Cargo.toml Cargo.lock
git commit -m "chore(release): v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

echo ""
echo "Created tag: v${NEW_VERSION}"
echo ""
echo "To publish: git push origin main --follow-tags"
