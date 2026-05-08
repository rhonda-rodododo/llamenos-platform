#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/backend-manager.sh"
source "$SCRIPT_DIR/lib/test-reporter.sh"

MAC_SSH_HOST="${MAC_SSH_HOST:-mac}"
MAC_PROJECT="${MAC_PROJECT:-~/projects/llamenos}"

VERBOSE="${VERBOSE:-false}"
NO_CODEGEN="${NO_CODEGEN:-false}"
JSON_OUTPUT="${JSON_OUTPUT:-false}"
REPORTER_TIMEOUT="${REPORTER_TIMEOUT:-600}"

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

reporter_init "ios-remote"

overall_result="pass"

if [[ "$NO_CODEGEN" != "true" ]]; then
  if ! source "$SCRIPT_DIR/lib/codegen-guard.sh" && run_codegen_guard; then
    overall_result="fail"
    reporter_summary "$overall_result"
    exit 1
  fi
fi

IOS_PORT="$(worktree_port 3003)"
DB_SUFFIX="$(worktree_db_suffix)"
DB_NAME="llamenos_ios${DB_SUFFIX}"

log_info "Starting iOS backend on port ${IOS_PORT}..."
if ! ensure_shared_services; then
  overall_result="fail"
  reporter_summary "$overall_result"
  exit 1
fi

if ! backend_start "ios" "$IOS_PORT" "$DB_NAME"; then
  overall_result="fail"
  reporter_summary "$overall_result"
  exit 1
fi

cleanup() {
  backend_stop "ios"
}
trap cleanup EXIT

LINUX_IP="$(hostname -I | awk '{print $1}')"
HUB_URL="http://${LINUX_IP}:${IOS_PORT}"
log_info "iOS backend available at ${HUB_URL}"

if ! ssh -o ConnectTimeout=5 "$MAC_SSH_HOST" "echo 'SSH OK'" >/dev/null 2>&1; then
  log_error "Cannot connect to macOS via SSH (${MAC_SSH_HOST})"
  log_error "Set MAC_SSH_HOST in your environment or ~/.ssh/config"
  overall_result="fail"
  reporter_summary "$overall_result"
  exit 1
fi

log_info "Triggering iOS tests on ${MAC_SSH_HOST}..."

REMOTE_ARGS=()
[[ "$VERBOSE" == "true" ]] && REMOTE_ARGS+=("--verbose")
[[ "$NO_CODEGEN" == "true" ]] && REMOTE_ARGS+=("--no-codegen")
[[ "$JSON_OUTPUT" == "true" ]] && REMOTE_ARGS+=("--json")
REMOTE_ARGS+=("--timeout" "$REPORTER_TIMEOUT")

if reporter_run_step "ios-tests-remote" \
  ssh "$MAC_SSH_HOST" \
    "cd ${MAC_PROJECT} && \
     eval \"\$(/opt/homebrew/bin/brew shellenv)\" 2>/dev/null; \
     export PATH=\"\$HOME/.asdf/shims:\$HOME/.asdf/bin:\$PATH\"; \
     bun run test:ios --remote-backend --hub-url ${HUB_URL} ${REMOTE_ARGS[*]}"; then
  reporter_record_suite "ios-remote" 1 0 0
else
  overall_result="fail"
  reporter_record_suite "ios-remote" 0 1 0
fi

reporter_summary "$overall_result"

if [[ "$overall_result" == "fail" ]]; then
  exit 1
fi
