#!/usr/bin/env bash
set -euo pipefail

# Sync version from package.json to all other versioned files.
# This is a read-only check + fix script (no git operations).
#
# Usage:
#   ./scripts/sync-versions.sh          # Check & report mismatches
#   ./scripts/sync-versions.sh --fix    # Fix mismatches in place

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(grep '"version"' "$ROOT/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')

FIX=false
if [[ "${1:-}" == "--fix" ]]; then
  FIX=true
fi

MISMATCHES=0

check_file() {
  local file="$1"
  local pattern="$2"
  local current
  local relative

  relative="${file#$ROOT/}"

  if [[ ! -f "$file" ]]; then
    echo "  SKIP  $relative (not found)"
    return
  fi

  current=$(grep -oP "$pattern" "$file" | head -1)

  if [[ "$current" == "$VERSION" ]]; then
    echo "  OK    $relative → $VERSION"
  else
    echo "  DIFF  $relative → $current (expected $VERSION)"
    MISMATCHES=$((MISMATCHES + 1))
  fi
}

fix_file() {
  local file="$1"
  local sed_expr="$2"
  local relative="${file#$ROOT/}"

  if [[ ! -f "$file" ]]; then
    return
  fi

  sed -i "$sed_expr" "$file"
  echo "  FIXED $relative → $VERSION"
}

echo "Source version (package.json): $VERSION"
echo ""
echo "Checking version files:"

# 1. src-tauri/tauri.conf.json
TAURI_CONF="$ROOT/src-tauri/tauri.conf.json"
check_file "$TAURI_CONF" '(?<="version": ")[^"]*'

# 2. src-tauri/Cargo.toml
CARGO_TOML="$ROOT/src-tauri/Cargo.toml"
check_file "$CARGO_TOML" '(?<=^version = ")[^"]*'

# 3. deploy/helm/llamenos/Chart.yaml
CHART="$ROOT/deploy/helm/llamenos/Chart.yaml"
check_file "$CHART" '(?<=appVersion: ")[^"]*'

# 4. flatpak/org.llamenos.Hotline.metainfo.xml
METAINFO="$ROOT/flatpak/org.llamenos.Hotline.metainfo.xml"
if [[ -f "$METAINFO" ]]; then
  METAINFO_VER=$(grep -oP '(?<=<release version=")[^"]*' "$METAINFO" | head -1)
  if [[ "$METAINFO_VER" == "$VERSION" ]]; then
    echo "  OK    flatpak/org.llamenos.Hotline.metainfo.xml → $VERSION"
  else
    echo "  DIFF  flatpak/org.llamenos.Hotline.metainfo.xml → $METAINFO_VER (expected $VERSION)"
    MISMATCHES=$((MISMATCHES + 1))
  fi
else
  echo "  SKIP  flatpak/org.llamenos.Hotline.metainfo.xml (not found)"
fi

echo ""

if [[ $MISMATCHES -eq 0 ]]; then
  echo "All version files are in sync."
  exit 0
fi

echo "$MISMATCHES file(s) out of sync."

if [[ "$FIX" == true ]]; then
  echo ""
  echo "Fixing mismatches:"

  # Fix tauri.conf.json (JSON — use a simple sed for the version field)
  if [[ -f "$TAURI_CONF" ]]; then
    # Match the top-level "version" key (not nested ones)
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TAURI_CONF"
    echo "  FIXED src-tauri/tauri.conf.json → $VERSION"
  fi

  # Fix Cargo.toml (first version = line)
  if [[ -f "$CARGO_TOML" ]]; then
    sed -i "0,/^version = \".*\"/s//version = \"$VERSION\"/" "$CARGO_TOML"
    echo "  FIXED src-tauri/Cargo.toml → $VERSION"
  fi

  # Fix Chart.yaml
  if [[ -f "$CHART" ]]; then
    sed -i "s/appVersion: \"[^\"]*\"/appVersion: \"$VERSION\"/" "$CHART"
    echo "  FIXED deploy/helm/llamenos/Chart.yaml → $VERSION"
  fi

  # Fix metainfo.xml (first release tag)
  if [[ -f "$METAINFO" ]]; then
    TODAY=$(date +%Y-%m-%d)
    sed -i "0,/<release version=\"[^\"]*\" date=\"[^\"]*\">/s//<release version=\"$VERSION\" date=\"$TODAY\">/" "$METAINFO"
    echo "  FIXED flatpak/org.llamenos.Hotline.metainfo.xml → $VERSION ($TODAY)"
  fi

  echo ""
  echo "Done. Review changes with: git diff"
else
  echo "Run with --fix to update them."
  exit 1
fi
