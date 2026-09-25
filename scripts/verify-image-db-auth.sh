#!/usr/bin/env bash
# Verify that a BUILT app image can authenticate to a real PostgreSQL and apply
# its migrations.
#
# Why this exists: the shipped image pins its own Bun runtime, independent of
# the Bun the test suite runs on (.mise.toml / ci.yml). A runtime-only defect —
# Bun 1.4.2 failing SCRAM-SHA-256 with "Malformed proof in client-final-message"
# — left a freshly built image unable to run a single migration, and nothing in
# the pipeline ran the image against a real database. This script is that check.
#
# It does exactly what the container entrypoint does first: run
# `scripts/run-migrations.ts` with a DATABASE_URL of the deployed shape
# (postgresql://llamenos:<url-safe password>@postgres:5432/llamenos), against
# the same postgres image the compose file ships, on a private network, with the
# same non-root / read-only-rootfs constraints the compose `app` service has.
#
# Usage:  scripts/verify-image-db-auth.sh <app-image>
# Env:    PG_IMAGE  override the PostgreSQL image (default: the one pinned in
#                   deploy/docker/docker-compose.yml)
#         VERIFY_TIMEOUT  seconds allowed for the migration run (default 300)
#
# Exit: 0 only if migrations ran to completion AND the schema exists.
set -euo pipefail

IMAGE="${1:?usage: $0 <app-image>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_IMAGE="${PG_IMAGE:-$(grep -oE 'postgres:[0-9]+-alpine@sha256:[0-9a-f]{64}' "$ROOT/deploy/docker/docker-compose.yml" | head -1)}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-300}"
[[ -n "$PG_IMAGE" ]] || { echo "verify-image-db-auth: cannot determine PG_IMAGE" >&2; exit 2; }

SUFFIX="$$-$(date +%s)"
NET="verify-db-auth-net-$SUFFIX"
PG="verify-db-auth-pg-$SUFFIX"

cleanup() {
  docker rm -f "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# URL-safe random password (includes '-' and '_', like the deploy's
# token_urlsafe). Never echoed.
PW="$(head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"

echo "==> image under test: $IMAGE"
echo "==> bun in image:     $(docker run --rm --entrypoint bun "$IMAGE" --version)"
echo "==> postgres image:   $PG_IMAGE"

docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_DB=llamenos -e POSTGRES_USER=llamenos -e "POSTGRES_PASSWORD=$PW" \
  "$PG_IMAGE" >/dev/null

# The official image runs a socket-only bootstrap server first, then restarts
# with TCP. A TCP connection succeeding means the final server is up.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$PG" psql -h 127.0.0.1 -U llamenos -d llamenos -tAc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then
  echo "FAIL: postgres never became ready" >&2
  docker logs "$PG" 2>&1 | tail -20 >&2
  exit 1
fi

# pg_hba in the official image only trusts loopback; make sure the app's path
# (over the network) is really password-authenticated with SCRAM.
if [[ "$(docker exec "$PG" psql -h 127.0.0.1 -U llamenos -d llamenos -tAc \
  "select rolpassword like 'SCRAM-SHA-256\$%' from pg_authid where rolname='llamenos'")" != "t" ]]; then
  echo "FAIL: role password is not stored as SCRAM-SHA-256 — this check would prove nothing" >&2
  exit 1
fi

echo "==> running scripts/run-migrations.ts inside the image"
set +e
timeout "$VERIFY_TIMEOUT" docker run --rm --network "$NET" \
  --read-only --tmpfs /tmp:size=64M \
  --entrypoint bun \
  -e "DATABASE_URL=postgresql://llamenos:${PW}@${PG}:5432/llamenos" \
  "$IMAGE" scripts/run-migrations.ts
rc=$?
set -e
if [[ "$rc" != 0 ]]; then
  echo "FAIL: migrations exited $rc (124 = timed out after ${VERIFY_TIMEOUT}s)" >&2
  echo "      the image cannot authenticate to / migrate PostgreSQL" >&2
  exit 1
fi

tables="$(docker exec "$PG" psql -h 127.0.0.1 -U llamenos -d llamenos -tAc \
  "select count(*) from information_schema.tables where table_schema='public'")"
users="$(docker exec "$PG" psql -h 127.0.0.1 -U llamenos -d llamenos -tAc \
  "select to_regclass('public.users') is not null")"
echo "==> public tables after migration: $tables"
if [[ "$tables" -lt 1 || "$users" != "t" ]]; then
  echo "FAIL: migration runner exited 0 but the schema was not created" >&2
  exit 1
fi

echo "OK: image authenticated to PostgreSQL over SCRAM-SHA-256 and applied migrations"
