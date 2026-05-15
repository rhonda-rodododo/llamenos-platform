#!/usr/bin/env bash
# Local Bun development server
#
# Starts backing services (PostgreSQL, RustFS) via Docker Compose,
# then runs the server directly with Bun's --watch mode (single process).
#
# Usage:
#   ./scripts/dev-bun.sh          # Start everything
#   ./scripts/dev-bun.sh stop     # Stop backing services
#   ./scripts/dev-bun.sh logs     # Show Docker Compose logs
set -euo pipefail

COMPOSE_FILE="deploy/docker/docker-compose.dev.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
COMPOSE="docker compose --project-directory $PROJECT_DIR -f $COMPOSE_FILE"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[dev:server]${NC} $*"; }
warn() { echo -e "${YELLOW}[dev:server]${NC} $*"; }

cmd_stop() {
  log "Stopping backing services..."
  $COMPOSE down
  log "Services stopped"
}

cmd_logs() {
  $COMPOSE logs -f
}

cmd_start() {
  # Ensure Docker Compose services are running
  if ! $COMPOSE ps --status running 2>/dev/null | grep -q postgres; then
    log "Starting backing services (PostgreSQL, RustFS)..."
    $COMPOSE up -d --wait
    log "Backing services ready"
  else
    log "Backing services already running"
  fi

  # Set environment variables for local development
  export PLATFORM=bun
  export PORT=3000
  export DATABASE_URL="postgresql://llamenos:dev@localhost:5432/llamenos"
  export PG_POOL_SIZE=5
  export ADMIN_PUBKEY="${ADMIN_PUBKEY:-79215a4c04f08fcd817c6f820c87169beb8cddf96dfa590a1315556b78af9183}"
  export HOTLINE_NAME="${HOTLINE_NAME:-Llámenos (Dev)}"
  export ENVIRONMENT=development
  export DEV_RESET_SECRET="${DEV_RESET_SECRET:-test-reset-secret}"
  if [ -z "${HMAC_SECRET:-}" ]; then
    warn "HMAC_SECRET not set. Generating random value for this session."
    export HMAC_SECRET=$(openssl rand -hex 32)
  fi
  export STORAGE_ENDPOINT=http://localhost:9000
  export STORAGE_ACCESS_KEY=rustfsadmin
  export STORAGE_SECRET_KEY=rustfsadmin
  export STORAGE_BUCKET=llamenos-files
  export SERVER_SECRET="${SERVER_SECRET:-0000000000000000000000000000000000000000000000000000000000000001}"

  log "Starting Bun server on http://localhost:${PORT}..."
  log "Bun watches source files directly — single process, no build step"
  log "Press Ctrl+C to stop"
  echo ""

  # Bun --watch restarts on any imported .ts file change
  exec bun --watch src/server/index.ts
}

ACTION="${1:-start}"
case "$ACTION" in
  start) cmd_start ;;
  stop)  cmd_stop ;;
  logs)  cmd_logs ;;
  *)
    echo "Usage: $0 {start|stop|logs}"
    exit 1
    ;;
esac
