#!/usr/bin/env bash
set -euo pipefail

# Assembles self-contained supervisor agent definitions from:
#   1. Domain-specific fragment  (.claude/agents/fragments/<name>.md)
#   2. Shared supervisor skill   (~/.claude/skills/supervising-dispatched-sessions/SKILL.md)
#   3. Model routing guide       (~/.claude/skills/supervising-dispatched-sessions/model-routing.md)
#   4. Llamenos project rules    (~/.claude/skills/supervising-dispatched-sessions/prompt-rules-llamenos.md)
#   5. Worker prompt template    (~/.claude/skills/supervising-dispatched-sessions/prompt-template.md)
#
# Output: .claude/agents/<name>.md (overwritten each run)
#
# Usage: bash .claude/agents/build-agents.sh
#        Run after editing any fragment or skill file.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAGMENTS_DIR="$SCRIPT_DIR/fragments"
SKILL_DIR="$HOME/.claude/skills/supervising-dispatched-sessions"

SUPERVISORS=(
  desktop-supervisor
  ios-supervisor
  android-supervisor
  backend-supervisor
  shared-supervisor
  infra-supervisor
)

# Verify skill directory exists
if [[ ! -d "$SKILL_DIR" ]]; then
  echo "ERROR: Skill directory not found: $SKILL_DIR" >&2
  exit 1
fi

# Verify fragments directory exists
if [[ ! -d "$FRAGMENTS_DIR" ]]; then
  echo "ERROR: Fragments directory not found: $FRAGMENTS_DIR" >&2
  exit 1
fi

built=0
for name in "${SUPERVISORS[@]}"; do
  fragment="$FRAGMENTS_DIR/$name.md"
  output="$SCRIPT_DIR/$name.md"

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
  echo "BUILT: $output"
done

echo ""
echo "Done. $built agent definitions assembled."
