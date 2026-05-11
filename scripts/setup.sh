#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}OK${NC}    $1"; }
warn()  { echo -e "  ${YELLOW}WARN${NC}  $1"; }
fail()  { echo -e "  ${RED}FAIL${NC}  $1"; exit 1; }
info()  { echo -e "  ${BLUE}INFO${NC}  $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUICK=false

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
  esac
done

check_prerequisites() {
  info "Checking prerequisites..."

  if ! command -v mise &>/dev/null; then
    fail "mise not found — install from https://mise.jdx.dev"
  fi
  ok "mise"

  if ! command -v bun &>/dev/null; then
    fail "Bun not found — install from https://bun.sh"
  fi
  ok "Bun $(bun --version)"

  if ! command -v rustc &>/dev/null; then
    fail "Rust not found — install from https://rustup.rs"
  fi
  ok "Rust $(rustc --version | awk '{print $2}')"

  if ! command -v docker &>/dev/null; then
    warn "Docker not found — required for local backend"
  else
    ok "Docker"
  fi
}

install_tools() {
  info "Installing mise tools..."
  cd "$PROJECT_ROOT"
  mise install
  ok "mise tools installed"
}

install_deps() {
  info "Installing dependencies..."
  cd "$PROJECT_ROOT"
  bun install
  ok "Dependencies installed"
}

bootstrap_workspace() {
  info "Bootstrapping workspace..."
  cd "$PROJECT_ROOT"

  local ws_args="--force"
  if [[ "$QUICK" == true ]]; then
    ws_args="--force"
  fi

  bash scripts/worktree-setup.sh $ws_args
  ok "Workspace bootstrapped"
}

setup_ios() {
  if [[ "$QUICK" == true ]]; then
    info "Skipping iOS setup (--quick)"
    return 0
  fi

  if [[ "$(uname)" != "Darwin" ]]; then
    warn "Not on macOS — skipping iOS setup"
    return 0
  fi

  info "Setting up iOS..."
  cd "$PROJECT_ROOT/apps/ios"

  if command -v xcodegen &>/dev/null; then
    xcodegen generate
    ok "Xcode project generated"
  else
    warn "xcodegen not found — skipping Xcode project generation"
  fi

  if [[ -f "Gemfile" ]] && command -v bundle &>/dev/null; then
    bundle install
    ok "iOS Ruby gems installed"
  else
    warn "Bundler not found — skipping iOS gem installation"
  fi
}

setup_android() {
  if [[ "$QUICK" == true ]]; then
    info "Skipping Android setup (--quick)"
    return 0
  fi

  info "Setting up Android..."
  cd "$PROJECT_ROOT/apps/android"

  if [[ -f "gradlew" ]]; then
    ./gradlew tasks &>/dev/null || true
    ok "Android Gradle synced"
  else
    warn "gradlew not found — skipping Android setup"
  fi
}

generate_env() {
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    ok ".env already exists — skipping"
    return 0
  fi

  if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
    info "Generating .env from .env.example..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    ok ".env created — edit it with your credentials"
  else
    warn ".env.example not found — create .env manually"
  fi
}

check_version_sync() {
  info "Checking version sync..."
  cd "$PROJECT_ROOT"
  if bash scripts/sync-versions.sh &>/dev/null; then
    ok "Version files in sync"
  else
    warn "Version files out of sync — run: bash scripts/sync-versions.sh --fix"
  fi
}

main() {
  echo "Llamenos Setup"
  echo "=============="
  echo ""

  check_prerequisites
  install_tools
  install_deps
  bootstrap_workspace
  setup_ios
  setup_android
  generate_env
  check_version_sync

  echo ""
  ok "Setup complete! You can now run:"
  echo "  bun run dev:server       # Start backend"
  echo "  bun run tauri:dev        # Start desktop"
}

main "$@"
