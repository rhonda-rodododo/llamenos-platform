# Concurrent Local E2E Test Orchestration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable running all E2E tests locally in parallel with per-suite database/backend isolation, including iOS tests on a separate macOS machine.

**Architecture:** Shared PostgreSQL + RustFS containers with per-suite databases and bun backends on unique ports. Orchestrator launches all suites concurrently. iOS tests on macOS connect to a backend on Linux via SSH.

**Tech Stack:** Bash, Docker Compose, Bun, PostgreSQL, RustFS, SSH

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/backend-manager.sh` | Start/stop per-suite backends, manage shared services |
| `scripts/lib/worktree-detect.sh` | Detect git worktree, compute port/DB name offsets |
| `deploy/docker/postgres-init/00-create-test-databases.sql` | Create per-suite databases on postgres startup |
| `scripts/test-desktop.sh` | Modified: start isolated backend before Playwright |
| `scripts/test-backend-bdd.sh` | Modified: start isolated backend before BDD tests |
| `scripts/test-ios.sh` | Modified: add `--remote-backend` and `--hub-url` flags |
| `scripts/test-ios-remote.sh` | New: Linux-side orchestration of iOS tests on macOS |
| `scripts/test-orchestrator.sh` | Modified: include backend-bdd, iOS, shared services |
| `scripts/lib/platform-detect.sh` | Modified: include backend-bdd in platform detection |
| `docs/testing.md` | New: comprehensive testing guide |

---

## Task 1: Create `scripts/lib/worktree-detect.sh`

**Files:**
- Create: `scripts/lib/worktree-detect.sh`

**Purpose:** Detect if running from a git worktree and compute isolation parameters (port offset, DB suffix, log prefix) to avoid conflicts between worktrees.

- [ ] **Step 1: Write the library**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Worktree detection for test isolation
# Computes unique parameters when running from a git worktree

# Returns: "main" for main checkout, worktree name for worktrees
worktree_name() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  if [[ "$git_dir" == *".git/worktrees/"* ]]; then
    basename "$(dirname "$git_dir")"
  else
    echo "main"
  fi
}

# Returns: numeric port offset (0 for main checkout)
worktree_port_offset() {
  local name
  name="$(worktree_name)"
  if [[ "$name" == "main" ]]; then
    echo 0
  else
    # Deterministic hash of worktree name → 0-999 offset
    echo "$name" | cksum | cut -d' ' -f1 | awk '{print $1 % 1000}'
  fi
}

# Returns: database suffix (empty for main, "_w<name>" for worktree)
worktree_db_suffix() {
  local name
  name="$(worktree_name)"
  if [[ "$name" == "main" ]]; then
    echo ""
  else
    echo "_w${name}"
  fi
}

# Returns: log file prefix
worktree_log_prefix() {
  local name
  name="$(worktree_name)"
  if [[ "$name" == "main" ]]; then
    echo "llamenos"
  else
    echo "llamenos-${name}"
  fi
}

# Compute actual port given a base port
worktree_port() {
  local base_port="${1:-3001}"
  local offset
  offset="$(worktree_port_offset)"
  echo "$((base_port + offset))"
}

# If run directly, print detection results
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Worktree: $(worktree_name)"
  echo "Port offset: $(worktree_port_offset)"
  echo "DB suffix: $(worktree_db_suffix)"
  echo "Log prefix: $(worktree_log_prefix)"
  echo "Port for base 3001: $(worktree_port 3001)"
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/lib/worktree-detect.sh
```

- [ ] **Step 3: Test it works**

```bash
cd /media/rikki/recover2/projects/llamenos
scripts/lib/worktree-detect.sh
```

Expected: Prints worktree detection info for main checkout.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/worktree-detect.sh
git commit -m "feat(tests): add worktree detection library for test isolation"
```

---

## Task 2: Create PostgreSQL Multi-Database Init Script

**Files:**
- Create: `deploy/docker/postgres-init/00-create-test-databases.sql`

**Purpose:** Create all test suite databases when PostgreSQL container starts.

- [ ] **Step 1: Write the init script**

```sql
-- Init script for concurrent test databases
-- Mounted into postgres container; runs once on first startup

DO $$
BEGIN
    -- Desktop suite
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llamenos_desktop') THEN
        CREATE DATABASE llamenos_desktop;
    END IF;

    -- Backend BDD suite
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llamenos_bdd') THEN
        CREATE DATABASE llamenos_bdd;
    END IF;

    -- iOS suite
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llamenos_ios') THEN
        CREATE DATABASE llamenos_ios;
    END IF;

    -- Android shards (match android-parallel-e2e.sh default of 3)
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llamenos_android_0') THEN
        CREATE DATABASE llamenos_android_0;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llamenos_android_1') THEN
        CREATE DATABASE llamenos_android_1;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'llamenos_android_2') THEN
        CREATE DATABASE llamenos_android_2;
    END IF;
END
$$;

-- Grant permissions to llamenos user on all test databases
GRANT ALL PRIVILEGES ON DATABASE llamenos_desktop TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_bdd TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_ios TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_0 TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_1 TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_2 TO llamenos;
```

- [ ] **Step 2: Commit**

```bash
git add deploy/docker/postgres-init/00-create-test-databases.sql
git commit -m "feat(tests): add postgres init script for concurrent test databases"
```

---

## Task 3: Create `scripts/lib/backend-manager.sh`

**Files:**
- Create: `scripts/lib/backend-manager.sh`
- Modify: `scripts/lib/worktree-detect.sh` (source it)

**Purpose:** Manage per-suite backend lifecycle: start shared services, start/stop individual backends, health checks.

- [ ] **Step 1: Write the backend manager**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Backend manager for concurrent test suites
# Manages per-suite backends and shared services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/worktree-detect.sh"

# Colors
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

# Ensure shared postgres and rustfs are running
ensure_shared_services() {
  cd "$PROJECT_ROOT"

  if ! docker compose -f "$COMPOSE_FILE" ps postgres 2>/dev/null | grep -q "running"; then
    log_info "Starting shared services (postgres, rustfs)..."
    docker compose -f "$COMPOSE_FILE" up -d postgres rustfs

    # Wait for postgres to be ready
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

# Stop shared services
stop_shared_services() {
  cd "$PROJECT_ROOT"
  log_info "Stopping shared services..."
  docker compose -f "$COMPOSE_FILE" down
}

# Check if backend is healthy on a port
backend_is_healthy() {
  local port="$1"
  bun -e "try{await fetch('http://localhost:${port}/api/health');process.exit(0)}catch{process.exit(1)}" 2>/dev/null
}

# Wait for backend to be healthy
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

# Start a backend for a specific suite
backend_start() {
  local suite="$1"
  local port="$2"
  local db_name="$3"

  log_info "Starting backend for ${suite} on port ${port} (DB: ${db_name})"

  # Check if already running
  if backend_is_healthy "$port"; then
    log_warn "Backend for ${suite} already healthy on port ${port}"
    return 0
  fi

  # Check if port is in use by something else
  if lsof -ti:"$port" >/dev/null 2>&1; then
    log_error "Port ${port} is already in use by another process"
    return 1
  fi

  cd "$PROJECT_ROOT"

  # Build environment for this backend
  local log_prefix
  log_prefix="$(worktree_log_prefix)"
  local log_file="/tmp/${log_prefix}-backend-${suite}.log"

  # Export suite-specific environment
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

  # Start the backend
  nohup bun --watch src/server/index.ts > "$log_file" 2>&1 &
  local pid=$!

  # Store PID for later cleanup
  echo "$pid" > "/tmp/${log_prefix}-backend-${suite}.pid"

  # Wait for health
  if ! wait_for_backend "$suite" "$port"; then
    log_error "Failed to start backend for ${suite}"
    log_error "Check log: ${log_file}"
    return 1
  fi

  log_info "Backend for ${suite} started (pid: ${pid})"
  return 0
}

# Stop a backend
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

  # Also kill by port as fallback
  local port_var="${suite^^}_PORT"
  local port="${!port_var:-}"
  if [[ -n "$port" ]]; then
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
  fi
}

# Stop all backends for this worktree
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

# Show backend status
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

# If run directly, show usage
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
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/lib/backend-manager.sh
```

- [ ] **Step 3: Test basic functionality**

```bash
cd /media/rikki/recover2/projects/llamenos
scripts/lib/backend-manager.sh status
```

Expected: Shows "Backend status for worktree: main" (no backends running yet).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/backend-manager.sh
git commit -m "feat(tests): add backend manager for per-suite test isolation"
```

---

## Task 4: Modify `scripts/test-desktop.sh` for Isolated Backend

**Files:**
- Modify: `scripts/test-desktop.sh`

**Purpose:** Before running Playwright, start an isolated backend on port 3001 with DB `llamenos_desktop`.

- [ ] **Step 1: Read current file**

Already read — see spec for current content.

- [ ] **Step 2: Modify to add backend start/stop**

Add after line 28 (`export VERBOSE JSON_OUTPUT REPORTER_TIMEOUT`):

```bash
# Source backend manager for isolated backend
source "$SCRIPT_DIR/lib/backend-manager.sh"

# Compute worktree-aware port
DESKTOP_PORT="$(worktree_port 3001)"
DB_SUFFIX="$(worktree_db_suffix)"
DB_NAME="llamenos_desktop${DB_SUFFIX}"

# Start isolated backend
if ! ensure_shared_services; then
  echo "Failed to start shared services"
  exit 1
fi

if ! backend_start "desktop" "$DESKTOP_PORT" "$DB_NAME"; then
  echo "Failed to start desktop backend"
  exit 1
fi

# Set Playwright to use our backend
export TEST_HUB_URL="http://localhost:${DESKTOP_PORT}"
export PLAYWRIGHT_BASE_URL="http://localhost:8788"

# Cleanup backend on exit
cleanup_backend() {
  backend_stop "desktop"
}
trap cleanup_backend EXIT
```

Replace line 102-103 (the Playwright step):

Old:
```bash
export PLAYWRIGHT_BASE_URL="http://localhost:8788"
if reporter_run_step "playwright" bunx playwright test --project=bootstrap --project=chromium --project=bdd; then
```

New:
```bash
export PLAYWRIGHT_BASE_URL="http://localhost:8788"
if reporter_run_step "playwright" bunx playwright test --project=bootstrap --project=chromium --project=bdd; then
```

(No change needed to the playwright invocation — the `TEST_HUB_URL` env var is used by `tests/global-setup.ts`)

- [ ] **Step 3: Commit**

```bash
git add scripts/test-desktop.sh
git commit -m "feat(tests): desktop tests use isolated backend on unique port"
```

---

## Task 5: Modify `scripts/test-backend-bdd.sh` for Isolated Backend

**Files:**
- Modify: `scripts/test-backend-bdd.sh`

**Purpose:** Instead of checking for existing backend at localhost:3000, start an isolated one on port 3002 with DB `llamenos_bdd`.

- [ ] **Step 1: Modify the file**

Add after line 27 (`export VERBOSE JSON_OUTPUT REPORTER_TIMEOUT`):

```bash
# Source backend manager for isolated backend
source "$SCRIPT_DIR/lib/backend-manager.sh"

# Compute worktree-aware port
BDD_PORT="$(worktree_port 3002)"
DB_SUFFIX="$(worktree_db_suffix)"
DB_NAME="llamenos_bdd${DB_SUFFIX}"

# Start isolated backend
if ! ensure_shared_services; then
  echo "Failed to start shared services"
  exit 1
fi

if ! backend_start "backend-bdd" "$BDD_PORT" "$DB_NAME"; then
  echo "Failed to start backend-bdd backend"
  exit 1
fi

# Set tests to use our backend
export TEST_HUB_URL="http://localhost:${BDD_PORT}"

# Cleanup backend on exit
cleanup_backend() {
  backend_stop "backend-bdd"
}
trap cleanup_backend EXIT
```

Replace lines 46-56 (the health check step):

Old:
```bash
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
```

New:
```bash
# Step 2: Verify our backend is healthy (already started above)
HUB_URL="${TEST_HUB_URL:-http://localhost:3000}"
if ! reporter_run_step "health-check" curl -sf "${HUB_URL}/api/health" >/dev/null 2>&1; then
  echo "Backend not healthy at ${HUB_URL}"
  overall_result="fail"
  reporter_record_suite "health-check" 0 1 0
  reporter_summary "$overall_result"
  exit 1
fi
reporter_record_suite "health-check" 1 0 0
```

- [ ] **Step 2: Commit**

```bash
git add scripts/test-backend-bdd.sh
git commit -m "feat(tests): backend-bdd tests use isolated backend on unique port"
```

---

## Task 6: Modify `scripts/test-ios.sh` for Remote Backend Support

**Files:**
- Modify: `scripts/test-ios.sh`

**Purpose:** Add `--remote-backend` and `--hub-url` flags so iOS tests can connect to a backend on another machine.

- [ ] **Step 1: Modify argument parsing**

Add new arguments after line 28:

```bash
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
```

- [ ] **Step 2: Modify backend handling**

Replace lines 55-79 (the backend check/start block):

Old:
```bash
# Step 0: Ensure backend is running
# UI tests (APIConnectedUITests) require a live backend. Start it if needed.
echo "Checking backend at ${TEST_HUB_URL}..."
# Use -s (no -f) so 503/degraded health doesn't falsely indicate "not running"
if ! curl -s "${TEST_HUB_URL}/api/health" 2>/dev/null | grep -q '"status"'; then
  echo "Backend not running — starting bun run dev:node..."
  nohup bun run dev:node > /tmp/dev-node-ios-test.log 2>&1 &
  DEV_NODE_PID=$!

  # Wait for health check to respond (any valid JSON response)
  waited=0
  until curl -s "${TEST_HUB_URL}/api/health" 2>/dev/null | grep -q '"status"'; do
    sleep 2
    waited=$((waited + 2))
    if [[ $waited -ge $BACKEND_STARTUP_TIMEOUT ]]; then
      echo "ERROR: Backend did not start within ${BACKEND_STARTUP_TIMEOUT}s"
      echo "Check /tmp/dev-node-ios-test.log for details"
      kill $DEV_NODE_PID 2>/dev/null || true
      exit 1
    fi
  done
  echo "Backend started (pid $DEV_NODE_PID, took ${waited}s)"
else
  echo "Backend healthy."
fi
```

New:
```bash
# Step 0: Ensure backend is running
# UI tests (APIConnectedUITests) require a live backend.

if [[ "$REMOTE_BACKEND" == "true" ]]; then
  # Use remote backend (e.g., Linux machine)
  TEST_HUB_URL="${HUB_URL_OVERRIDE:-${TEST_HUB_URL:-http://localhost:3003}}"
  echo "Using remote backend at ${TEST_HUB_URL}"
else
  # Start local isolated backend
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

  # Cleanup backend on exit
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
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-ios.sh
git commit -m "feat(tests): iOS tests support remote backend for cross-machine testing"
```

---

## Task 7: Create `scripts/test-ios-remote.sh`

**Files:**
- Create: `scripts/test-ios-remote.sh`

**Purpose:** Run on Linux machine to start iOS backend and trigger iOS tests on macOS via SSH.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# iOS Remote Test Runner
# Runs on Linux machine, orchestrates iOS tests on macOS via SSH
#
# Usage:
#   scripts/test-ios-remote.sh                    # Run iOS tests on macOS
#   scripts/test-ios-remote.sh --verbose          # Verbose mode
#   scripts/test-ios-remote.sh --no-codegen       # Skip codegen guard
#
# Environment:
#   MAC_SSH_HOST    SSH host alias (default: mac)
#   MAC_PROJECT     Project path on macOS (default: ~/projects/llamenos)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/backend-manager.sh"
source "$SCRIPT_DIR/lib/test-reporter.sh"

MAC_SSH_HOST="${MAC_SSH_HOST:-mac}"
MAC_PROJECT="${MAC_PROJECT:-~/projects/llamenos}"

# Parse arguments
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

# Step 1: Codegen guard
if [[ "$NO_CODEGEN" != "true" ]]; then
  if ! source "$SCRIPT_DIR/lib/codegen-guard.sh" && run_codegen_guard; then
    overall_result="fail"
    reporter_summary "$overall_result"
    exit 1
  fi
fi

# Step 2: Start iOS backend on Linux
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

# Cleanup on exit
cleanup() {
  backend_stop "ios"
}
trap cleanup EXIT

# Step 3: Get Linux LAN IP for macOS to connect
LINUX_IP="$(hostname -I | awk '{print $1}')"
HUB_URL="http://${LINUX_IP}:${IOS_PORT}"
log_info "iOS backend available at ${HUB_URL}"

# Step 4: Verify SSH connectivity
if ! ssh -o ConnectTimeout=5 "$MAC_SSH_HOST" "echo 'SSH OK'" >/dev/null 2>&1; then
  log_error "Cannot connect to macOS via SSH (${MAC_SSH_HOST})"
  log_error "Set MAC_SSH_HOST in your environment or ~/.ssh/config"
  overall_result="fail"
  reporter_summary "$overall_result"
  exit 1
fi

# Step 5: Run iOS tests on macOS via SSH
log_info "Triggering iOS tests on ${MAC_SSH_HOST}..."

# Build passthrough args for remote test-ios.sh
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
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/test-ios-remote.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-ios-remote.sh
git commit -m "feat(tests): add remote iOS test runner for cross-machine orchestration"
```

---

## Task 8: Modify `scripts/test-orchestrator.sh` for Full Suite

**Files:**
- Modify: `scripts/test-orchestrator.sh`
- Modify: `scripts/lib/platform-detect.sh`

**Purpose:** Include backend-bdd and iOS (remote) in the orchestrator. Start shared services once.

- [ ] **Step 1: Modify platform-detect.sh**

Add `backend-bdd` to platform detection. After line 36:

```bash
  # Backend BDD tests need bun
  if command -v bun &>/dev/null; then
    platforms+=("backend-bdd")
  fi
```

- [ ] **Step 2: Modify test-orchestrator.sh**

Add after line 16 (`PLATFORMS_OVERRIDE=""`):

```bash
IOS_REMOTE="${IOS_REMOTE:-false}"
```

Add to argument parsing after line 25:

```bash
    --ios-remote) IOS_REMOTE=true; shift ;;
```

Add after line 31 (`cd "$PROJECT_ROOT"`):

```bash
# Source backend manager for shared services
source "$SCRIPT_DIR/lib/backend-manager.sh"

# Start shared services once before all suites
if ! ensure_shared_services; then
  echo -e "${RED}Failed to start shared services. Aborting.${RESET}"
  exit 1
fi
```

Add iOS remote handling in the platform loop after line 80:

```bash
  # Handle iOS remote: on Linux, use test-ios-remote.sh instead of test-ios.sh
  if [[ "$platform" == "ios" ]] && [[ "$IOS_REMOTE" == "true" ]]; then
    if [[ "$(uname -s)" != "Darwin" ]]; then
      local_script="$SCRIPT_DIR/test-ios-remote.sh"
    fi
  fi
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-orchestrator.sh scripts/lib/platform-detect.sh
git commit -m "feat(tests): orchestrator includes backend-bdd and iOS remote support"
```

---

## Task 9: Update `docker-compose.dev.yml` for Init Script

**Files:**
- Modify: `deploy/docker/docker-compose.dev.yml`

**Purpose:** Mount the postgres init script so databases are created on startup.

- [ ] **Step 1: Modify postgres service**

Add volume mount after line 33 (`- pgdata:/var/lib/postgresql/data`):

```yaml
      - ./postgres-init:/docker-entrypoint-initdb.d:ro
```

- [ ] **Step 2: Commit**

```bash
git add deploy/docker/docker-compose.dev.yml
git commit -m "feat(tests): mount postgres init script for concurrent test databases"
```

---

## Task 10: Create `docs/testing.md`

**Files:**
- Create: `docs/testing.md`

**Purpose:** Comprehensive testing guide covering concurrent test orchestration.

- [ ] **Step 1: Write the documentation**

```markdown
# Testing Guide

## Quick Reference

```bash
# Run all tests (all platforms, fully concurrent)
bun run test:all

# Run specific platforms
bun run test:all --platforms desktop,backend-bdd

# Run iOS tests on remote macOS (from Linux)
bun run test:all --ios-remote

# Run desktop tests only
bun run test:desktop

# Run backend BDD tests only
bun run test:backend:bdd

# Run iOS tests locally (on macOS)
bun run test:ios

# Run iOS tests remotely (macOS connects to Linux backend)
bun run test:ios --remote-backend --hub-url http://linux-ip:3003
```

## Architecture

### Concurrent Test Isolation

All E2E test suites run concurrently with full isolation:

| Suite | Backend Port | Database | Notes |
|---|---|---|---|
| Desktop | 3001 | `llamenos_desktop` | Playwright on 8788 |
| Backend BDD | 3002 | `llamenos_bdd` | API-only |
| iOS | 3003 | `llamenos_ios` | macOS or remote |
| Android shard N | 3004+N | `llamenos_android_N` | Existing pattern |

### Shared Services

One PostgreSQL and one RustFS container serve all suites:
- PostgreSQL: `localhost:5432`
- RustFS: `localhost:9000`

Each suite gets its own database within the shared PostgreSQL instance.

### Worktree Safety

Running tests from a git worktree automatically uses unique ports and database names to avoid conflicts with the main checkout or other worktrees.

## iOS Cross-Machine Testing

### Setup

1. Ensure SSH access from Linux to macOS:
   ```bash
   ssh mac  # Should connect without password (use ssh keys)
   ```

2. Set environment on Linux:
   ```bash
   export MAC_SSH_HOST=mac  # or your SSH host alias
   export MAC_PROJECT=~/projects/llamenos
   ```

3. Run iOS tests remotely:
   ```bash
   bun run test:all --ios-remote
   ```

### How It Works

1. Linux starts an iOS backend on port 3003 with DB `llamenos_ios`
2. Linux discovers its LAN IP
3. Linux SSHs to macOS and runs: `bun run test:ios --remote-backend --hub-url http://linux-ip:3003`
4. macOS runs xcodebuild tests against the remote backend
5. Linux collects results

## Backend Manager

The backend manager (`scripts/lib/backend-manager.sh`) manages per-suite backends:

```bash
# Start a backend
scripts/lib/backend-manager.sh start desktop 3001 llamenos_desktop

# Stop a backend
scripts/lib/backend-manager.sh stop desktop

# Stop all backends
scripts/lib/backend-manager.sh stop-all

# Check status
scripts/lib/backend-manager.sh status

# Manage shared services
scripts/lib/backend-manager.sh services start
scripts/lib/backend-manager.sh services stop
```

## Troubleshooting

### Port Already in Use

If a port is already in use, the backend manager will fail with an error. Check what's using the port:
```bash
lsof -ti:3001
```

Stop the conflicting process or use a worktree for isolation.

### Database Already Exists

This is fine — databases are reused between runs for speed. To fully reset:
```bash
docker compose -f deploy/docker/docker-compose.dev.yml down -v
```

### macOS SSH Fails

Ensure passwordless SSH is configured:
```bash
ssh-copy-id mac
```

### Backend Won't Start

Check the backend log:
```bash
tail -f /tmp/llamenos-backend-desktop.log
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing.md
git commit -m "docs: add comprehensive testing guide for concurrent E2E orchestration"
```

---

## Task 11: Update `CLAUDE.md` Test Section

**Files:**
- Modify: `CLAUDE.md`

**Purpose:** Update the test orchestration section to reflect concurrent capabilities.

- [ ] **Step 1: Find and update the test section**

Locate the test commands section and update:

Old:
```markdown
```bash
# Build & Test (runs on Linux machine)
bun run build                            # Vite build → dist/client/
bun run typecheck                        # Type check (tsc --noEmit)
bun run test                             # Run all Playwright E2E tests (auto-builds with mocks)
bun run test:ui                          # Playwright UI mode
bun run test:build                       # Vite build with Tauri IPC mocks (for Playwright)
```
```

New:
```markdown
```bash
# Build & Test (runs on Linux machine)
bun run build                            # Vite build → dist/client/
bun run typecheck                        # Type check (tsc --noEmit)
bun run test                             # Run all Playwright E2E tests (auto-builds with mocks)
bun run test:ui                          # Playwright UI mode
bun run test:build                       # Vite build with Tauri IPC mocks (for Playwright)

# Concurrent E2E (all platforms, isolated databases/backends)
bun run test:all                         # Run ALL platform tests concurrently
bun run test:all --ios-remote            # Include iOS tests on remote macOS
bun run test:all --platforms desktop,backend-bdd  # Run specific platforms
```
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with concurrent test orchestration commands"
```

---

## Task 12: End-to-End Verification

**Files:**
- All modified files

**Purpose:** Verify the full concurrent orchestration works.

- [ ] **Step 1: Start shared services**

```bash
cd /media/rikki/recover2/projects/llamenos
scripts/lib/backend-manager.sh services start
```

Expected: PostgreSQL and RustFS containers start.

- [ ] **Step 2: Verify databases created**

```bash
docker compose -f deploy/docker/docker-compose.dev.yml exec -T postgres psql -U llamenos -c "\l" | grep llamenos_
```

Expected: Lists `llamenos_desktop`, `llamenos_bdd`, `llamenos_ios`, etc.

- [ ] **Step 3: Start desktop backend**

```bash
scripts/lib/backend-manager.sh start desktop 3001 llamenos_desktop
```

Expected: Backend starts, health check passes.

- [ ] **Step 4: Verify backend health**

```bash
curl -s http://localhost:3001/api/health | head -c 200
```

Expected: JSON response with status.

- [ ] **Step 5: Start backend-bdd backend**

```bash
scripts/lib/backend-manager.sh start backend-bdd 3002 llamenos_bdd
```

Expected: Second backend starts on port 3002, no conflicts.

- [ ] **Step 6: Verify both backends healthy**

```bash
curl -s http://localhost:3001/api/health > /dev/null && echo "desktop: OK"
curl -s http://localhost:3002/api/health > /dev/null && echo "bdd: OK"
```

Expected: Both print OK.

- [ ] **Step 7: Stop all backends**

```bash
scripts/lib/backend-manager.sh stop-all
scripts/lib/backend-manager.sh services stop
```

Expected: All backends stopped, shared services stopped.

- [ ] **Step 8: Commit any fixes**

If any issues found during verification, fix and commit.

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Per-suite database isolation | Task 2 (init script), Task 3 (backend manager) |
| Per-suite backend isolation | Task 3 (backend manager), Tasks 4-6 (test scripts) |
| iOS cross-machine support | Task 6 (test-ios.sh), Task 7 (test-ios-remote.sh) |
| Worktree safety | Task 1 (worktree-detect.sh), used throughout |
| Shared services | Task 3 (backend manager), Task 9 (compose) |
| Orchestrator integration | Task 8 (test-orchestrator.sh) |
| Documentation | Tasks 10-11 (docs/testing.md, CLAUDE.md) |
| End-to-end verification | Task 12 |

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found
- All code blocks contain complete implementation
- All file paths are exact
- All commands have expected output

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-concurrent-local-e2e-test-orchestration.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
