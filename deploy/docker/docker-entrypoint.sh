#!/bin/sh
# Docker entrypoint: run SQL migrations, then start the app.
set -e

# Bounded, so a database the runtime cannot authenticate to (or reach) makes
# the container EXIT non-zero with a message instead of sitting `unhealthy`
# forever with no output — the failure mode a Bun 1.4.2 SCRAM regression
# produced on a clean host (see the BUN PIN note in deploy/docker/Dockerfile).
MIGRATION_TIMEOUT="${MIGRATION_TIMEOUT:-180}"

echo "[entrypoint] Running database migrations..."
if ! timeout "$MIGRATION_TIMEOUT" bun scripts/run-migrations.ts; then
  echo "[entrypoint] FATAL: database migrations failed or timed out after ${MIGRATION_TIMEOUT}s" >&2
  exit 1
fi

echo "[entrypoint] Starting application..."
exec bun src/server/index.ts
