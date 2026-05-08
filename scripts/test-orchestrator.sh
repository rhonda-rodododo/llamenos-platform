#!/usr/bin/env bash
set -euo pipefail

# Test orchestrator - main entry point for test:all
# Detects available platforms and runs tests with maximum parallelism
# Compatible with bash 3.2+ (macOS default)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/platform-detect.sh"
source "$SCRIPT_DIR/lib/test-reporter.sh"

# Parse arguments (pass through to platform scripts)
VERBOSE="${VERBOSE:-false}"
NO_CODEGEN="${NO_CODEGEN:-false}"
JSON_OUTPUT="${JSON_OUTPUT:-false}"
TIMEOUT="${REPORTER_TIMEOUT:-600}"
PLATFORMS_OVERRIDE=""
IOS_REMOTE="${IOS_REMOTE:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) VERBOSE=true; shift ;;
    --no-codegen) NO_CODEGEN=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --platforms) PLATFORMS_OVERRIDE="$2"; shift 2 ;;
    --ios-remote) IOS_REMOTE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "$PROJECT_ROOT"

source "$SCRIPT_DIR/lib/backend-manager.sh"

if ! ensure_shared_services; then
  echo -e "${RED}Failed to start shared services. Aborting.${RESET}"
  exit 1
fi

# Build pass-through args
PASSTHROUGH_ARGS=()
[[ "$VERBOSE" == "true" ]] && PASSTHROUGH_ARGS+=("--verbose")
[[ "$NO_CODEGEN" == "true" ]] && PASSTHROUGH_ARGS+=("--no-codegen")
[[ "$JSON_OUTPUT" == "true" ]] && PASSTHROUGH_ARGS+=("--json")
PASSTHROUGH_ARGS+=("--timeout" "$TIMEOUT")

# Detect platforms
if [[ -n "$PLATFORMS_OVERRIDE" ]]; then
  IFS=',' read -ra available <<< "$PLATFORMS_OVERRIDE"
else
  read -ra available <<< "$(detect_platforms)"
fi

if [[ "${JSON_OUTPUT}" != "true" ]]; then
  echo -e "${BOLD}=== Test Orchestrator ===${RESET}"
  echo "Available platforms: ${available[*]}"
  echo ""
fi

# Run codegen guard once (skip in individual scripts)
if [[ "$NO_CODEGEN" != "true" ]]; then
  source "$SCRIPT_DIR/lib/codegen-guard.sh"
  if ! run_codegen_guard; then
    echo -e "${RED}Codegen guard failed. Aborting all tests.${RESET}"
    exit 1
  fi
  # Add --no-codegen to passthrough since we already ran it
  PASSTHROUGH_ARGS+=("--no-codegen")
fi

# Track results using parallel arrays (bash 3.2 compatible)
PLATFORM_NAMES=()
PLATFORM_PIDS=()
PLATFORM_LOGS=()
PLATFORM_RESULTS=()
OVERALL_EXIT=0

start_time="$(date +%s)"

# Launch all platform tests in parallel
for platform in "${available[@]}"; do
  local_script="$SCRIPT_DIR/test-${platform}.sh"

  if [[ "$platform" == "ios-remote" ]]; then
    local_script="$SCRIPT_DIR/test-ios-remote.sh"
  fi

  if [[ ! -x "$local_script" ]]; then
    if [[ "${JSON_OUTPUT}" != "true" ]]; then
      echo -e "${YELLOW}No test script for platform: ${platform}${RESET}"
    fi
    continue
  fi

  log_file="/tmp/test-orchestrator-${platform}-$(date +%Y%m%d-%H%M%S).log"

  if [[ "${JSON_OUTPUT}" != "true" ]]; then
    echo -e "${DIM}Starting: ${platform}${RESET}"
  fi

  "$local_script" "${PASSTHROUGH_ARGS[@]}" > "$log_file" 2>&1 &

  PLATFORM_NAMES+=("$platform")
  PLATFORM_PIDS+=($!)
  PLATFORM_LOGS+=("$log_file")
done

# Wait for all platforms and collect results
for i in "${!PLATFORM_NAMES[@]}"; do
  pid="${PLATFORM_PIDS[$i]}"
  if wait "$pid"; then
    PLATFORM_RESULTS+=("pass")
  else
    PLATFORM_RESULTS+=("fail")
    OVERALL_EXIT=1
  fi
done

end_time="$(date +%s)"
duration=$(( end_time - start_time ))

# Print aggregated summary
if [[ "${JSON_OUTPUT}" == "true" ]]; then
  echo "{"
  echo "  \"orchestrator\": true,"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"duration_seconds\": ${duration},"
  echo "  \"platforms\": {"
  first=true
  for i in "${!PLATFORM_NAMES[@]}"; do
    if [[ "$first" != "true" ]]; then echo ","; fi
    first=false
    echo -n "    \"${PLATFORM_NAMES[$i]}\": \"${PLATFORM_RESULTS[$i]}\""
  done
  echo ""
  echo "  },"
  if [[ "$OVERALL_EXIT" -eq 0 ]]; then
    echo "  \"result\": \"pass\""
  else
    echo "  \"result\": \"fail\""
  fi
  echo "}"
else
  echo ""
  echo -e "${BOLD}=== Orchestrator Results ===${RESET}"
  echo ""

  for i in "${!PLATFORM_NAMES[@]}"; do
    platform="${PLATFORM_NAMES[$i]}"
    result="${PLATFORM_RESULTS[$i]}"
    log="${PLATFORM_LOGS[$i]}"
    if [[ "$result" == "pass" ]]; then
      echo -e "  ${GREEN}PASS${RESET} ${platform}"
    else
      echo -e "  ${RED}FAIL${RESET} ${platform}"
      if [[ -n "$log" ]]; then
        echo -e "       ${DIM}Log: ${log}${RESET}"
        # Show last few lines of failure summary from the platform log
        local_summary="$(grep -E '(=== RESULT|FAIL|ERROR|failed)' "$log" 2>/dev/null | tail -5 || true)"
        if [[ -n "$local_summary" ]]; then
          while IFS= read -r line; do
            echo -e "       ${DIM}${line}${RESET}"
          done <<< "$local_summary"
        fi
      fi
    fi
  done

  echo ""
  echo -e "  ${DIM}Duration: ${duration}s${RESET}"

  if [[ "$OVERALL_EXIT" -eq 0 ]]; then
    echo -e "\n${BOLD}=== ALL PLATFORMS: ${GREEN}PASS${RESET}${BOLD} ===${RESET}"
  else
    echo -e "\n${BOLD}=== SOME PLATFORMS: ${RED}FAIL${RESET}${BOLD} ===${RESET}"
  fi
fi

exit "$OVERALL_EXIT"
