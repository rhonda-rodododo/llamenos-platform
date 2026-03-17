#!/usr/bin/env bash
# Local Bun development server
#
# Starts backing services (PostgreSQL, MinIO, strfry) via Docker Compose,
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

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[dev:server]${NC} $*"; }
warn() { echo -e "${YELLOW}[dev:server]${NC} $*"; }

cmd_stop() {
  log "Stopping backing services..."
  docker compose -f "$COMPOSE_FILE" down
  log "Services stopped"
}

cmd_logs() {
  docker compose -f "$COMPOSE_FILE" logs -f
}

cmd_start() {
  # Ensure Docker Compose services are running
  if ! docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q postgres; then
    log "Starting backing services (PostgreSQL, MinIO, strfry)..."
    docker compose -f "$COMPOSE_FILE" up -d --wait
    log "Backing services ready"
  else
    log "Backing services already running"
  fi

  # Set environment variables for local development
  export PLATFORM=bun
  export PORT=3000
  export DATABASE_URL="postgresql://llamenos:dev@localhost:5432/llamenos"
  export PG_POOL_SIZE=5
  export ADMIN_PUBKEY="${ADMIN_PUBKEY:-ac4718373d30301e5c7cf55e9e6f2568efb94f3278fb88f37f4981e880505228}"
  export HOTLINE_NAME="${HOTLINE_NAME:-Llámenos (Dev)}"
  export ENVIRONMENT=development
  export DEV_RESET_SECRET="${DEV_RESET_SECRET:-test-reset-secret}"
  if [ -z "${HMAC_SECRET:-}" ]; then
    warn "HMAC_SECRET not set. Generating random value for this session."
    export HMAC_SECRET=$(openssl rand -hex 32)
  fi
  export MINIO_ENDPOINT=http://localhost:9000
  export MINIO_ACCESS_KEY=minioadmin
  export MINIO_SECRET_KEY=minioadmin
  export MINIO_BUCKET=llamenos-files
  export SERVER_NOSTR_SECRET="${SERVER_NOSTR_SECRET:-0000000000000000000000000000000000000000000000000000000000000001}"
  export NOSTR_RELAY_URL=ws://localhost:7777

  log "Starting Bun server on http://localhost:${PORT}..."
  log "Bun watches source files directly — single process, no build step"
  log "Press Ctrl+C to stop"
  echo ""

  # Bun --watch restarts on any imported .ts file change
  exec bun --watch src/platform/bun/server.ts
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
