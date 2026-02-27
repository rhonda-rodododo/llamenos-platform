#!/usr/bin/env bash
set -euo pipefail

# Developer setup script for llamenos (desktop).
# Checks prerequisites, installs deps, and verifies the build environment.
#
# Usage:
#   ./scripts/dev-setup.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}OK${NC}    $1"; }
warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; ERRORS=$((ERRORS + 1)); }

ERRORS=0

echo "Llamenos Desktop — Developer Setup"
echo "===================================="
echo ""

# --- Prerequisites ---
echo "Checking prerequisites:"

# Bun
if command -v bun &>/dev/null; then
  BUN_VER=$(bun --version 2>/dev/null)
  ok "Bun $BUN_VER"
else
  fail "Bun not found — install from https://bun.sh"
fi

# Rust
if command -v rustc &>/dev/null; then
  RUST_VER=$(rustc --version | awk '{print $2}')
  ok "Rust $RUST_VER"
else
  fail "Rust not found — install from https://rustup.rs"
fi

# Cargo
if command -v cargo &>/dev/null; then
  ok "Cargo"
else
  fail "Cargo not found"
fi

# Tauri CLI
if bunx tauri --version &>/dev/null 2>&1; then
  TAURI_VER=$(bunx tauri --version 2>/dev/null)
  ok "Tauri CLI $TAURI_VER"
else
  warn "Tauri CLI not found — will be installed with bun install"
fi

# git-cliff (optional, for changelogs)
if command -v git-cliff &>/dev/null; then
  ok "git-cliff $(git-cliff --version 2>/dev/null | awk '{print $2}')"
else
  warn "git-cliff not found — install for changelog generation: cargo install git-cliff"
fi

# Playwright (optional, for testing)
if bunx playwright --version &>/dev/null 2>&1; then
  ok "Playwright"
else
  warn "Playwright not found — run 'bunx playwright install' for E2E tests"
fi

# Platform-specific system deps
echo ""
echo "Checking system dependencies:"

case "$(uname -s)" in
  Linux)
    # Check for common Tauri deps on Linux
    for pkg in libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev; do
      if dpkg -s "$pkg" &>/dev/null 2>&1; then
        ok "$pkg"
      else
        fail "$pkg not installed — run: sudo apt install $pkg"
      fi
    done
    ;;
  Darwin)
    if xcode-select -p &>/dev/null; then
      ok "Xcode command line tools"
    else
      fail "Xcode CLT not found — run: xcode-select --install"
    fi
    ;;
  *)
    warn "Unknown platform $(uname -s) — check Tauri prerequisites manually"
    ;;
esac

# Check llamenos-core sibling
echo ""
echo "Checking llamenos-core:"

CORE_PATH="$(cd "$(dirname "$0")/../.." && pwd)/llamenos-core"
if [[ -d "$CORE_PATH" ]]; then
  ok "Found at $CORE_PATH"
  if [[ -f "$CORE_PATH/Cargo.toml" ]]; then
    ok "Cargo.toml present"
  else
    fail "Cargo.toml missing in llamenos-core"
  fi
else
  fail "llamenos-core not found at $CORE_PATH — clone it as a sibling directory"
fi

# --- Install ---
echo ""
echo "Installing dependencies:"

cd "$(dirname "$0")/.."
bun install 2>&1 | tail -1
ok "bun install"

# --- Version check ---
echo ""
echo "Checking version sync:"
if bash scripts/sync-versions.sh 2>/dev/null; then
  ok "All version files in sync"
else
  warn "Version files out of sync — run: ./scripts/sync-versions.sh --fix"
fi

# --- Summary ---
echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}Setup complete!${NC} You can now run:"
  echo "  bun run tauri:dev    # Start desktop development"
  echo "  bun run test         # Run Playwright E2E tests"
  echo "  bun run typecheck    # Type check"
else
  echo -e "${RED}$ERRORS issue(s) found.${NC} Fix the above errors and re-run this script."
  exit 1
fi
