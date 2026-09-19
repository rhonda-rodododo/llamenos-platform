#!/usr/bin/env bash
# scripts/update-image-digests.sh
#
# Usage: ./scripts/update-image-digests.sh
#
# Prints current sha256 digests for all third-party images used in compose files.
# Copy/paste the output into the relevant compose file image lines.
#
# This is a documentation and convenience tool — it does NOT auto-patch files.
# Operators verify digests match expected values before committing.
#
# After running, update the image lines in:
#   - deploy/docker/docker-compose.dev.yml
#   - deploy/docker/docker-compose.yml
#   - deploy/docker/docker-compose.production.yml
#   - deploy/ansible/vars.yml / vars.example.yml
#   - deploy/ansible/roles/kamailio/templates/compose/kamailio.j2
#   - deploy/ansible/roles/llamenos-whisper/templates/compose/whisper.j2
#   - signal-notifier/Dockerfile
#   - deploy/docker/Dockerfile.nodejs (node:26-slim + bun zip)
#
# NOTE (2026-09-19, #722): the tags below are verified against the upstream
# registry, not copied from compose files — "ollama/ollama:0.6",
# "fedirz/faster-whisper-server:0.4.1" and "kamailio/kamailio:5.7" were never
# published (confirmed via direct registry API queries, not just `docker
# pull` failures). Whisper has no bare/untagged releases at all, only
# -cpu/-cuda variants. Kamailio's runtime image lives at
# ghcr.io/kamailio/kamailio, not Docker Hub. Before bumping any of these
# three further, re-verify the target tag actually exists upstream first.
set -euo pipefail

images=(
  "postgres:17-alpine"
  "caddy:2.9-alpine"
  "rustfs/rustfs:latest"
  "fedirz/faster-whisper-server:0.4.0-cpu"
  "andrius/asterisk:latest"
  "ghcr.io/kamailio/kamailio:5.7.1-bookworm"
  "coturn/coturn:4"
  "glitchtip/glitchtip:v4.1"
  "redis:7-alpine"
  "bbernhard/signal-cli-rest-api:0.92"
  "ollama/ollama:0.6.0"
  "containrrr/watchtower:1.7.1"
  "tecnativa/docker-socket-proxy:latest"
  "oven/bun:1.3.5-slim"
  "node:26-slim"
)

for img in "${images[@]}"; do
  echo "Pulling $img..."
  docker pull "$img" --quiet
  digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$img" 2>/dev/null || echo "NOT_FOUND")
  echo "  $img → $digest"
done

echo ""
echo "--- Bun binary SHA-256 (for Dockerfile.nodejs) ---"
echo "Run the following to get the SHA-256 for a specific Bun version:"
echo "  BUN_VERSION=1.3.5"
echo "  curl -fsSL \"https://github.com/oven-sh/bun/releases/download/bun-v\${BUN_VERSION}/bun-linux-x64.zip\" -o /tmp/bun.zip"
echo "  sha256sum /tmp/bun.zip"
