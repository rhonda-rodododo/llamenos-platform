#!/usr/bin/env bash
# install-hooks.sh — Install git hooks for this project.
# Run once after cloning: scripts/install-hooks.sh

set -euo pipefail

HOOKS_DIR="$(git rev-parse --show-toplevel)/.git/hooks"

# For worktrees, .git is a file pointing to the real git dir
if [ -f "$(git rev-parse --show-toplevel)/.git" ]; then
  HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
fi

mkdir -p "$HOOKS_DIR"

cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
# Pre-commit hook: detect Drizzle migration drift when schema files change.

# Only run if schema files are staged
SCHEMA_CHANGES=$(git diff --cached --name-only -- 'apps/worker/db/schema/*.ts' 'apps/worker/db/schema/**/*.ts' 'drizzle.config.ts')

if [ -z "$SCHEMA_CHANGES" ]; then
  exit 0
fi

echo "Schema files changed — checking for migration drift..."
scripts/check-migration-drift.sh
HOOK

chmod +x "$HOOKS_DIR/pre-commit"
echo "Pre-commit hook installed at $HOOKS_DIR/pre-commit"
