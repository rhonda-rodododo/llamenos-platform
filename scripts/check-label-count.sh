#!/usr/bin/env bash
# check-label-count.sh — Fail if any live doc hardcodes a number as a label count
# (e.g. "57 domain separation constants", "all 87 labels", "69 labeled contexts").
#
# The intent: when labels are added, no doc should claim a stale specific count.
# The fix: replace hardcoded numbers with "see packages/protocol/crypto-labels.json".
#
# Historical/reference files are excluded — they record past state accurately.
#
# Exit code: 0 = pass, 1 = violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# Targeted patterns that specifically match "N domain separation X" or
# "all N labels" style claims — not section numbers like "2.1 Domain Separation".
# Uses a word-boundary approach to avoid matching X.Y section numbers.
PATTERNS=(
  # "57 domain separation labels/constants" — number as standalone word at start
  '(^|[^.0-9])\b[0-9]{2,3}\s+domain separation (labels|constants)'
  # "all 87 labels defined" style
  '\ball\s+[0-9]+\s+(domain separation\s+)?(labels|constants)\b'
  # "69 labeled contexts"
  '\b[0-9]+\s+labeled contexts\b'
  # "87 labels from crypto-labels"
  '\b[0-9]+\s+labels from\s+`?crypto-labels'
  # "Domain Separation Labels: 87" style
  'domain separation\s+(labels|constants):\s*[0-9]+'
  # "**87 domain separation" bold style
  '\*\*[0-9]+\s+domain separation'
)

# Build combined pattern
COMBINED=$(printf '%s\n' "${PATTERNS[@]}" | paste -sd '|' -)

VIOLATIONS=()

while IFS= read -r line; do
  VIOLATIONS+=("$line")
done < <(
  grep -rn -iE "$COMBINED" \
    --include="*.md" \
    docs/ CLAUDE.md DEVELOPMENT.md packages/protocol/README.md \
    2>/dev/null \
    | grep -v \
      -e "COMPLETED_BACKLOG" \
      -e "CHANGELOG" \
      -e "SECURITY_AUDIT" \
      -e "SECURITY_GAPS" \
      -e "docs/epics/" \
      -e "superpowers/plans/" \
      -e "superpowers/specs/" \
      -e "llamenos-protocol.md" \
      -e "| 2026-" \
      -e "| 2025-" \
      -e "\[x\]" \
    || true
)

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "❌ Hardcoded domain separation label counts found in live docs:"
  echo "   Replace the number with: 'see packages/protocol/crypto-labels.json'"
  echo ""
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v"
  done
  exit 1
fi

echo "✅ No hardcoded label counts found in live docs."
exit 0
