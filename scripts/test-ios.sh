#!/usr/bin/env bash
set -euo pipefail

# iOS test runner
# Pipeline: codegen -> xcodebuild build -> unit tests -> UI tests
# Uses tee + grep --line-buffered pattern from MEMORY.md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/test-reporter.sh"

# Parse arguments
VERBOSE="${VERBOSE:-false}"
NO_CODEGEN="${NO_CODEGEN:-false}"
JSON_OUTPUT="${JSON_OUTPUT:-false}"
REPORTER_TIMEOUT="${REPORTER_TIMEOUT:-600}"
SIMULATOR="${SIMULATOR:-iPhone 17}"

REMOTE_BACKEND="${REMOTE_BACKEND:-false}"
HUB_URL_OVERRIDE="${HUB_URL_OVERRIDE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) VERBOSE=true; shift ;;
    --no-codegen) NO_CODEGEN=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    --timeout) REPORTER_TIMEOUT="$2"; shift 2 ;;
    --simulator) SIMULATOR="$2"; shift 2 ;;
    --remote-backend) REMOTE_BACKEND=true; shift ;;
    --hub-url) HUB_URL_OVERRIDE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

export VERBOSE JSON_OUTPUT REPORTER_TIMEOUT

cd "$PROJECT_ROOT"

# Verify we're on macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iOS tests can only run on macOS"
  exit 1
fi

# Verify xcodebuild is available
if ! command -v xcodebuild &>/dev/null; then
  echo "xcodebuild not found. Install Xcode."
  exit 1
fi

IOS_DIR="$PROJECT_ROOT/apps/ios"
DESTINATION="platform=iOS Simulator,name=${SIMULATOR}"
TEST_HUB_URL="${TEST_HUB_URL:-http://localhost:3000}"
BACKEND_STARTUP_TIMEOUT="${BACKEND_STARTUP_TIMEOUT:-30}"

reporter_init "ios"

overall_result="pass"

if [[ "$REMOTE_BACKEND" == "true" ]]; then
  TEST_HUB_URL="${HUB_URL_OVERRIDE:-${TEST_HUB_URL:-http://localhost:3003}}"
  echo "Using remote backend at ${TEST_HUB_URL}"
else
  source "$SCRIPT_DIR/lib/backend-manager.sh"

  IOS_PORT="$(worktree_port 3003)"
  DB_SUFFIX="$(worktree_db_suffix)"
  DB_NAME="llamenos_ios${DB_SUFFIX}"

  if ! ensure_shared_services; then
    echo "Failed to start shared services"
    exit 1
  fi

  if ! backend_start "ios" "$IOS_PORT" "$DB_NAME"; then
    echo "Failed to start iOS backend"
    exit 1
  fi

  TEST_HUB_URL="http://localhost:${IOS_PORT}"

  cleanup_backend() {
    backend_stop "ios"
  }
  trap cleanup_backend EXIT
fi

echo "Checking backend at ${TEST_HUB_URL}..."
if ! curl -s "${TEST_HUB_URL}/api/health" 2>/dev/null | grep -q '"status"'; then
  echo "ERROR: Backend not reachable at ${TEST_HUB_URL}"
  exit 1
fi
echo "Backend healthy."

# Step 1: Codegen guard
if [[ "$NO_CODEGEN" != "true" ]]; then
  if ! source "$SCRIPT_DIR/lib/codegen-guard.sh" && run_codegen_guard; then
    overall_result="fail"
    reporter_summary "$overall_result"
    exit 1
  fi
fi

# Step 2: Ensure xcodeproj exists (xcodegen)
if [[ ! -d "$IOS_DIR/Llamenos.xcodeproj" ]]; then
  if command -v xcodegen &>/dev/null; then
    echo "Generating Xcode project..."
    (cd "$IOS_DIR" && xcodegen generate)
  else
    echo "Llamenos.xcodeproj not found and xcodegen not installed"
    exit 1
  fi
fi

# Step 3: Build
if ! reporter_run_step "xcodebuild build" \
  xcodebuild build -project "$IOS_DIR/Llamenos.xcodeproj" -scheme Llamenos \
    -destination "$DESTINATION" \
    CODE_SIGNING_ALLOWED=NO; then
  overall_result="fail"
  reporter_record_suite "build" 0 1 0
  reporter_summary "$overall_result"
  exit 1
fi
reporter_record_suite "build" 1 0 0

# Step 4: Unit tests
# Use the tee + grep pattern from MEMORY.md for reliable output
UNIT_LOG="/tmp/test-ios-unit-$(date +%Y%m%d-%H%M%S).log"

echo -e "${CYAN:-}--- Unit Tests ---${RESET:-}"

unit_exit=0
xcodebuild test -project "$IOS_DIR/Llamenos.xcodeproj" -scheme Llamenos \
  -destination "$DESTINATION" \
  -only-testing:LlamenosTests \
  CODE_SIGNING_ALLOWED=NO 2>&1 | \
  tee "$UNIT_LOG" "$REPORTER_LOG_FILE" | \
  grep --line-buffered -E '(Test Case|Test Suite|Executed|error:|Build Failed)' || unit_exit=$?

# Check if grep produced empty output (common issue)
if [[ ! -s "$UNIT_LOG" ]]; then
  echo -e "${YELLOW:-}WARNING: Empty test output. Check $UNIT_LOG${RESET:-}"
fi

if [[ "$unit_exit" -ne 0 ]]; then
  overall_result="fail"
  echo -e "${RED:-}Unit tests failed. Last 30 lines:${RESET:-}"
  tail -30 "$UNIT_LOG" 2>/dev/null || true
fi

parse_xcodebuild_results "$UNIT_LOG"
reporter_record_suite "LlamenosTests" "$PARSED_PASSED" "$PARSED_FAILED" "$PARSED_SKIPPED"

# Step 5: UI tests
# Reset server state before UI tests for a clean baseline.
# Uses DEV_RESET_SECRET (default: test-reset-secret, set in dev-bun.sh).
RESET_SECRET="${DEV_RESET_SECRET:-test-reset-secret}"
echo "Resetting server state for UI tests..."
if ! curl -sf -X POST "${TEST_HUB_URL}/api/test-reset" -H "X-Test-Secret: ${RESET_SECRET}" > /dev/null 2>&1; then
  echo "WARNING: test-reset failed (backend may not have DEV_RESET_SECRET set)"
fi

UI_LOG="/tmp/test-ios-ui-$(date +%Y%m%d-%H%M%S).log"

echo -e "${CYAN:-}--- UI Tests ---${RESET:-}"

ui_exit=0
xcodebuild test -project "$IOS_DIR/Llamenos.xcodeproj" -scheme Llamenos \
  -destination "$DESTINATION" \
  -only-testing:LlamenosUITests \
  CODE_SIGNING_ALLOWED=NO 2>&1 | \
  tee "$UI_LOG" -a "$REPORTER_LOG_FILE" | \
  grep --line-buffered -E '(Test Case|Test Suite|Executed|error:|Build Failed|FAILED)' || ui_exit=$?

if [[ ! -s "$UI_LOG" ]]; then
  echo -e "${YELLOW:-}WARNING: Empty test output. Check $UI_LOG${RESET:-}"
fi

if [[ "$ui_exit" -ne 0 ]]; then
  overall_result="fail"
  echo -e "${RED:-}UI tests failed. Last 30 lines:${RESET:-}"
  tail -30 "$UI_LOG" 2>/dev/null || true
fi

parse_xcodebuild_results "$UI_LOG"
reporter_record_suite "LlamenosUITests" "$PARSED_PASSED" "$PARSED_FAILED" "$PARSED_SKIPPED"

reporter_summary "$overall_result"

if [[ "$overall_result" == "fail" ]]; then
  exit 1
fi
