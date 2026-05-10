#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
tsx scripts/run-migrations.ts

echo "[entrypoint] Starting application..."
exec tsx src/server/index.ts
