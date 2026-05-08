#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/worktree-detect.sh"

if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  GREEN='' YELLOW='' RED='' DIM='' RESET=''
fi

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker/docker-compose.dev.yml}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_TIMEOUT="${BACKEND_TIMEOUT:-60}"

log_info() { echo -e "${GREEN}[backend-manager]${RESET} $*"; }
log_warn() { echo -e "${YELLOW}[backend-manager]${RESET} $*"; }
log_error() { echo -e "${RED}[backend-manager]${RESET} $*" >&2; }

ensure_shared_services() {
  cd "$PROJECT_ROOT"

  if ! docker compose -f "$COMPOSE_FILE" ps postgres 2>/dev/null | grep -q "running"; then
    log_info "Starting shared services (postgres, rustfs)..."
    docker compose -f "$COMPOSE_FILE" up -d postgres rustfs

    local waited=0
    until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U llamenos >/dev/null 2>&1; do
      sleep 1
      waited=$((waited + 1))
      if [[ $waited -ge 30 ]]; then
        log_error "PostgreSQL did not start within 30s"
        return 1
      fi
    done
    log_info "PostgreSQL ready"
  else
    log_info "Shared services already running"
  fi
}

stop_shared_services() {
  cd "$PROJECT_ROOT"
  log_info "Stopping shared services..."
  docker compose -f "$COMPOSE_FILE" down
}

backend_is_healthy() {
  local port="$1"
  bun -e "try{await fetch('http://localhost:${port}/api/health');process.exit(0)}catch{process.exit(1)}" 2>/dev/null
}

wait_for_backend() {
  local suite="$1"
  local port="$2"
  local elapsed=0

  while [[ $elapsed -lt $BACKEND_TIMEOUT ]]; do
    if backend_is_healthy "$port"; then
      log_info "Backend for ${suite} healthy on port ${port} (${elapsed}s)"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  log_error "Backend for ${suite} on port ${port} did not become healthy within ${BACKEND_TIMEOUT}s"
  return 1
}

backend_start() {
  local suite="$1"
  local port="$2"
  local db_name="$3"

  log_info "Starting backend for ${suite} on port ${port} (DB: ${db_name})"

  if backend_is_healthy "$port"; then
    log_warn "Backend for ${suite} already healthy on port ${port}"
    return 0
  fi

  if lsof -ti:"$port" >/dev/null 2>&1; then
    log_error "Port ${port} is already in use by another process"
    return 1
  fi

  cd "$PROJECT_ROOT"

  local log_prefix
  log_prefix="$(worktree_log_prefix)"
  local log_file="/tmp/${log_prefix}-backend-${suite}.log"

  export PORT="$port"
  export DATABASE_URL="postgresql://llamenos:dev@localhost:5432/${db_name}"
  export DEV_RESET_SECRET="test-reset-${suite}-$(worktree_name)"
  export HMAC_SECRET="${HMAC_SECRET:-$(openssl rand -hex 32)}"
  export PLATFORM=bun
  export ENVIRONMENT=development
  export ADMIN_PUBKEY="${ADMIN_PUBKEY:-ac4718373d30301e5c7cf55e9e6f2568efb94f3278fb88f37f4981e880505228}"
  export STORAGE_ENDPOINT="http://localhost:9000"
  export STORAGE_ACCESS_KEY=rustfsadmin
  export STORAGE_SECRET_KEY=rustfsadmin
  export STORAGE_BUCKET="llamenos-${suite}"
  export SERVER_NOSTR_SECRET="${SERVER_NOSTR_SECRET:-0000000000000000000000000000000000000000000000000000000000000001}"
  export NOSTR_RELAY_URL="${NOSTR_RELAY_URL:-}"
  export HOTLINE_NAME="Llamenos Test ${suite}"

  nohup bun --watch src/server/index.ts > "$log_file" 2>&1 &
echo "$!" > "/tmp/${log_prefix}-backend-${suite}.pid"

  if ! wait_for_backend "$suite" "$port"; then
    log_error "Failed to start backend for ${suite}"
    log_error "Check log: ${log_file}"
    return 1
  fi

  log_info "Backend for ${suite} started"
  return 0
}

backend_stop() {
  local suite="$1"
  local log_prefix
  log_prefix="$(worktree_log_prefix)"
  local pid_file="/tmp/${log_prefix}-backend-${suite}.pid"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      log_info "Stopping backend for ${suite} (pid: ${pid})"
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

backend_stop_all() {
  local log_prefix
  log_prefix="$(worktree_log_prefix)"

  for pid_file in /tmp/${log_prefix}-backend-*.pid; do
    [[ -f "$pid_file" ]] || continue
    local suite
    suite="$(basename "$pid_file" .pid | sed "s/${log_prefix}-backend-//")"
    backend_stop "$suite"
  done
}

backend_status() {
  local log_prefix
  log_prefix="$(worktree_log_prefix)"

  echo "Backend status for worktree: $(worktree_name)"
  for pid_file in /tmp/${log_prefix}-backend-*.pid; do
    [[ -f "$pid_file" ]] || continue
    local suite
    suite="$(basename "$pid_file" .pid | sed "s/${log_prefix}-backend-//")"
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || echo "?")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "  ${suite}: running (pid: ${pid})"
    else
      echo "  ${suite}: not running"
    fi
  done
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    start)
      [[ $# -lt 4 ]] && { echo "Usage: $0 start <suite> <port> <db_name>"; exit 1; }
      ensure_shared_services
      backend_start "$2" "$3" "$4"
      ;;
    stop)
      [[ $# -lt 2 ]] && { echo "Usage: $0 stop <suite>"; exit 1; }
      backend_stop "$2"
      ;;
    stop-all)
      backend_stop_all
      ;;
    status)
      backend_status
      ;;
    services)
      case "${2:-}" in
        start) ensure_shared_services ;;
        stop) stop_shared_services ;;
        *) echo "Usage: $0 services {start|stop}"; exit 1 ;;
      esac
      ;;
    *)
      echo "Backend Manager"
      echo "Usage: $0 {start|stop|stop-all|status|services}"
      echo ""
      echo "  start <suite> <port> <db_name>  Start backend for suite"
      echo "  stop <suite>                    Stop backend for suite"
      echo "  stop-all                        Stop all backends"
      echo "  status                          Show backend status"
      echo "  services {start|stop}           Manage shared services"
      exit 1
      ;;
  esac
fi
