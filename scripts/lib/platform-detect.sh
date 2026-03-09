#!/usr/bin/env bash
set -euo pipefail

# Platform detection for test orchestration
# Detects available platforms based on OS, installed tools, and running services

# Colors (disabled if not a terminal)
if [[ -t 1 ]]; then
  BOLD='\033[1m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  RESET='\033[0m'
else
  BOLD='' GREEN='' YELLOW='' RED='' RESET=''
fi

# Returns: space-separated list of available platforms
# Possible values: desktop ios android worker crypto backend-bdd
detect_platforms() {
  local platforms=()
  local os
  os="$(uname -s)"

  # Crypto is always available if cargo is installed
  if command -v cargo &>/dev/null; then
    platforms+=("crypto")
  fi

  # Worker tests need bun
  if command -v bun &>/dev/null; then
    platforms+=("worker")
  fi

  # Backend BDD tests need bun and a running backend
  if command -v bun &>/dev/null; then
    platforms+=("backend-bdd")
  fi

  case "$os" in
    Darwin)
      # macOS: iOS is available if xcodebuild exists
      if command -v xcodebuild &>/dev/null; then
        platforms+=("ios")
      fi
      # Desktop (Tauri) needs cargo + bun + tauri CLI
      if command -v cargo &>/dev/null && command -v bun &>/dev/null; then
        platforms+=("desktop")
      fi
      # Android if ANDROID_HOME is set and gradle wrapper exists
      if [[ -d "${ANDROID_HOME:-}" ]] || [[ -d "${ANDROID_SDK_ROOT:-}" ]]; then
        if [[ -f "apps/android/gradlew" ]] || [[ -f "${PROJECT_ROOT:-}/apps/android/gradlew" ]]; then
          platforms+=("android")
        fi
      fi
      ;;
    Linux)
      # Desktop (Tauri) needs cargo + bun
      if command -v cargo &>/dev/null && command -v bun &>/dev/null; then
        platforms+=("desktop")
      fi
      # Android
      if [[ -d "${ANDROID_HOME:-}" ]] || [[ -d "${ANDROID_SDK_ROOT:-}" ]]; then
        if [[ -f "apps/android/gradlew" ]] || [[ -f "${PROJECT_ROOT:-}/apps/android/gradlew" ]]; then
          platforms+=("android")
        fi
      fi
      ;;
  esac

  echo "${platforms[*]}"
}

# Check if a specific platform is available
is_platform_available() {
  local target="$1"
  local available
  available="$(detect_platforms)"
  [[ " $available " == *" $target "* ]]
}

# Print platform detection summary
print_platform_summary() {
  local available
  available="$(detect_platforms)"
  local os
  os="$(uname -s)"
  local arch
  arch="$(uname -m)"

  echo -e "${BOLD}Platform Detection${RESET}"
  echo "  OS: $os ($arch)"
  echo "  Available platforms: $available"
  echo ""

  for plat in crypto worker backend-bdd desktop ios android; do
    if [[ " $available " == *" $plat "* ]]; then
      echo -e "  ${GREEN}[ok]${RESET} $plat"
    else
      echo -e "  ${YELLOW}[--]${RESET} $plat (not available)"
    fi
  done
}

# Check if Android device/emulator is connected
is_android_device_connected() {
  if ! command -v adb &>/dev/null; then
    return 1
  fi
  local devices
  devices="$(adb devices 2>/dev/null | grep -v "^List" | grep -c "device$" || true)"
  [[ "$devices" -gt 0 ]]
}

# If sourced, export functions. If run directly, print summary.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # Find project root
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  cd "$PROJECT_ROOT"

  print_platform_summary
fi
