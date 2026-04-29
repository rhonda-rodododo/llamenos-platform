#!/usr/bin/env bash
set -euo pipefail

# Backend BDD test runner
# Runs @backend-tagged Gherkin scenarios against a live backend via API only (no browser).
# Requires a running backend (Docker Compose or wrangler dev).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments (before sourcing test-reporter.sh so REPORTER_TIMEOUT is set first)
VERBOSE="${VERBOSE:-false}"
NO_CODEGEN="${NO_CODEGEN:-false}"
JSON_OUTPUT="${JSON_OUTPUT:-false}"
REPORTER_TIMEOUT="${REPORTER_TIMEOUT:-3600}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) VERBOSE=true; shift ;;
    --no-codegen) NO_CODEGEN=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    --timeout) REPORTER_TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

source "$SCRIPT_DIR/lib/test-reporter.sh"

export VERBOSE JSON_OUTPUT REPORTER_TIMEOUT

cd "$PROJECT_ROOT"

reporter_init "backend-bdd"

overall_result="pass"

# Step 1: Codegen guard (optional)
if [[ "$NO_CODEGEN" != "true" ]]; then
  if ! source "$SCRIPT_DIR/lib/codegen-guard.sh" && run_codegen_guard; then
    overall_result="fail"
    reporter_summary "$overall_result"
    exit 1
  fi
fi

# Step 2: Check backend is reachable
HUB_URL="${TEST_HUB_URL:-http://localhost:3000}"
if ! reporter_run_step "health-check" curl -sf "${HUB_URL}/api/health" >/dev/null 2>&1; then
  echo "Backend not reachable at ${HUB_URL}. Start it with:"
  echo "  docker compose -f deploy/docker/docker-compose.dev.yml up -d && bun run dev:server"
  overall_result="fail"
  reporter_record_suite "health-check" 0 1 0
  reporter_summary "$overall_result"
  exit 1
fi
reporter_record_suite "health-check" 1 0 0

# Step 3: Generate BDD test files from features + step definitions
# playwright-bdd v8 requires explicit bddgen before test execution
bunx bddgen 2>&1

# Step 4: Run backend BDD tests via Playwright
# --workers=1: backend tests share server state (test-reset clears all DOs)
# so all spec files must run serially to avoid cross-test interference
if reporter_run_step "backend-bdd" bunx playwright test --project=backend-bdd --workers=1; then
  parse_playwright_results "$REPORTER_LOG_FILE"
  reporter_record_suite "backend-bdd" "$PARSED_PASSED" "$PARSED_FAILED" "$PARSED_SKIPPED"
else
  overall_result="fail"
  parse_playwright_results "$REPORTER_LOG_FILE"
  reporter_record_suite "backend-bdd" "$PARSED_PASSED" "$PARSED_FAILED" "$PARSED_SKIPPED"
fi

reporter_summary "$overall_result"

if [[ "$overall_result" == "fail" ]]; then
  exit 1
fi
