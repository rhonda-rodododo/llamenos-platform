#!/usr/bin/env bash
# check-migration-drift.sh — Thin wrapper around check-migration-drift.ts.
# Delegates to the TypeScript implementation which uses drizzle-kit's programmatic API.
#
# Usage:
#   scripts/check-migration-drift.sh          # run drift check
#   scripts/check-migration-drift.sh --ci     # CI mode (show SQL diff)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bun "$SCRIPT_DIR/check-migration-drift.ts" "$@"
