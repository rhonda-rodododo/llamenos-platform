#!/usr/bin/env bash
set -euo pipefail

# Assembles self-contained supervisor agent definitions from:
#   1. Domain-specific fragment  (.claude/agents/fragments/<name>.md)
#   2. Shared supervisor skill   (.claude/agents/shared/SKILL.md)
#   3. Model routing guide       (.claude/agents/shared/model-routing.md)
#   4. Llamenos project rules    (.claude/agents/shared/prompt-rules-llamenos.md)
#   5. Worker prompt template    (.claude/agents/shared/prompt-template.md)
#
# All shared sources are vendored in-repo under .claude/agents/shared/ — see the
# README there. There is deliberately no $HOME fallback: a silent fallback to a
# machine-local copy is what let the generated agents drift for 3.5 months unnoticed.
#
# Output: .claude/agents/<name>.md (overwritten each run)
#
# Usage: bash .claude/agents/build-agents.sh          # regenerate in place
#        bash .claude/agents/build-agents.sh --check  # verify committed output matches sources
#        Run after editing any fragment or shared source file.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAGMENTS_DIR="$SCRIPT_DIR/fragments"
SKILL_DIR="$SCRIPT_DIR/shared"
CHECK_MODE=0
if [[ "${1:-}" == "--check" ]]; then
  CHECK_MODE=1
fi

SUPERVISORS=(
  desktop-supervisor
  ios-supervisor
  android-supervisor
  backend-supervisor
  shared-supervisor
  infra-supervisor
)

# Verify shared sources exist — fail loudly, no fallback
for required in SKILL.md model-routing.md prompt-rules-llamenos.md prompt-template.md; do
  if [[ ! -f "$SKILL_DIR/$required" ]]; then
    echo "ERROR: Shared source not found: $SKILL_DIR/$required" >&2
    echo "This file must be vendored in-repo — see .claude/agents/shared/README.md" >&2
    exit 1
  fi
done

# Verify fragments directory exists
if [[ ! -d "$FRAGMENTS_DIR" ]]; then
  echo "ERROR: Fragments directory not found: $FRAGMENTS_DIR" >&2
  exit 1
fi

BUILD_DIR="$SCRIPT_DIR"
if [[ "$CHECK_MODE" == "1" ]]; then
  BUILD_DIR="$(mktemp -d)"
  trap 'rm -rf "$BUILD_DIR"' EXIT
fi

built=0
for name in "${SUPERVISORS[@]}"; do
  fragment="$FRAGMENTS_DIR/$name.md"
  output="$BUILD_DIR/$name.md"

  if [[ ! -f "$fragment" ]]; then
    echo "SKIP: No fragment for $name at $fragment" >&2
    continue
  fi

  {
    # 1. Domain-specific fragment (includes YAML frontmatter)
    cat "$fragment"

    echo ""
    echo "---"
    echo ""
    echo "# Supervisor Operating Manual"
    echo ""
    echo "Everything below is your complete operating manual. Do NOT read any other"
    echo "files or invoke any skills before starting work — everything you need is here."
    echo ""

    # 2. Core supervisor skill (strip YAML frontmatter if present)
    echo "## Core Dispatch Protocol"
    echo ""
    sed '/^---$/,/^---$/d' "$SKILL_DIR/SKILL.md"

    echo ""
    echo "---"
    echo ""

    # 3. Model routing
    echo "## Model Routing Reference"
    echo ""
    cat "$SKILL_DIR/model-routing.md"

    echo ""
    echo "---"
    echo ""

    # 4. Llamenos project rules (for embedding in worker prompts)
    echo "## Llamenos Worker Rules (paste into every worker prompt)"
    echo ""
    cat "$SKILL_DIR/prompt-rules-llamenos.md"

    echo ""
    echo "---"
    echo ""

    # 5. Worker prompt template
    echo "## Worker Prompt Template"
    echo ""
    cat "$SKILL_DIR/prompt-template.md"

  } > "$output"

  built=$((built + 1))
  if [[ "$CHECK_MODE" != "1" ]]; then
    echo "BUILT: $output"
  fi
done

if [[ "$CHECK_MODE" == "1" ]]; then
  drift=0
  for name in "${SUPERVISORS[@]}"; do
    committed="$SCRIPT_DIR/$name.md"
    generated="$BUILD_DIR/$name.md"

    if [[ ! -f "$generated" ]]; then
      continue
    fi

    if [[ ! -f "$committed" ]]; then
      echo "DRIFT DETECTED: $committed does not exist." >&2
      echo "Run: bun run agents:build" >&2
      drift=1
      continue
    fi

    if ! diff -u "$committed" "$generated" >/dev/null; then
      echo "DRIFT DETECTED: $committed is out of sync with its sources." >&2
      diff -u "$committed" "$generated" >&2 || true
      echo "Run: bun run agents:build" >&2
      drift=1
    fi
  done

  if [[ "$drift" == "1" ]]; then
    exit 1
  fi

  echo "Check passed: generated agent definitions are up-to-date."
  exit 0
fi

echo ""
echo "Done. $built agent definitions assembled."
