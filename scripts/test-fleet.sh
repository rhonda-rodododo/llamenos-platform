#!/usr/bin/env bash
set -euo pipefail

# Fleet orchestrator test runner
# Runs the orchestrator/ vitest suite (bun run test:fleet) — the safety-rail
# tests for the unattended agent-dispatch layer (guards.test.ts in particular
# asserts every documented safety property).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/test-reporter.sh"

# Parse arguments
VERBOSE="${VERBOSE:-false}"
NO_CODEGEN="${NO_CODEGEN:-false}"
JSON_OUTPUT="${JSON_OUTPUT:-false}"
REPORTER_TIMEOUT="${REPORTER_TIMEOUT:-300}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) VERBOSE=true; shift ;;
    --no-codegen) NO_CODEGEN=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    --timeout) REPORTER_TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

export VERBOSE JSON_OUTPUT REPORTER_TIMEOUT

cd "$PROJECT_ROOT"

reporter_init "fleet"

overall_result="pass"

# The orchestrator has no protocol/i18n codegen dependency, but honor
# --no-codegen for a consistent interface with the other platform scripts.

if reporter_run_step "fleet orchestrator tests" bun run test:fleet; then
  reporter_record_suite "orchestrator" 1 0 0
else
  overall_result="fail"
  reporter_record_suite "orchestrator" 0 1 0
fi

reporter_summary "$overall_result"

if [[ "$overall_result" == "fail" ]]; then
  exit 1
fi
