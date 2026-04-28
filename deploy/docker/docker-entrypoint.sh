#!/bin/sh
# Docker entrypoint: run SQL migrations, then start the app.
set -e

echo "[entrypoint] Running database migrations..."
bun scripts/run-migrations.ts

echo "[entrypoint] Starting application..."
exec bun src/server/index.ts
