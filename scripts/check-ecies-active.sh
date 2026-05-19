#!/usr/bin/env bash
# check-ecies-active.sh — Fail if ECIES/nsec/secp256k1 pseudocode appears in
# the active (non-appendix, non-legacy) sections of PROTOCOL.md.
#
# Allowed: Section 2.2.1, Appendix A/B/C, Section 2.6 (marked Legacy),
#          Section 2.13 Legacy V1, any block after a "> **Legacy" or
#          "> **Historical" or "> **Deprecated" notice.
#
# Forbidden: eciesWrapKey / eciesUnwrapKey / secp256k1.getSharedSecret
#            / nsec_bech32 / NIP-44 in active algorithm pseudocode blocks.
#
# Exit code: 0 = pass, 1 = violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOCOL="$SCRIPT_DIR/../docs/protocol/PROTOCOL.md"

if [ ! -f "$PROTOCOL" ]; then
  echo "❌ PROTOCOL.md not found at $PROTOCOL"
  exit 1
fi

VIOLATIONS=()

IN_ALLOWED_SECTION=0

while IFS= read -r line; do
  # Enter allowed sections when hitting legacy/appendix markers
  if echo "$line" | grep -qE "^### 2\.2\.1|^## Appendix|^> \*\*Legacy|^> \*\*Historical|^> \*\*Deprecated|^> \*\*Migration Note|^### 2\.13 Legacy"; then
    IN_ALLOWED_SECTION=1
  fi

  # Return to active-doc mode only on non-appendix main sections (## 1. through ## 7.)
  if echo "$line" | grep -qE "^## [1-7]\." && ! echo "$line" | grep -qE "^## Appendix"; then
    IN_ALLOWED_SECTION=0
  fi

  # Subsections 2.3 onward exit the legacy section 2.2.1
  if echo "$line" | grep -qE "^### 2\.[3-9]|^### 2\.(1[0-9])"; then
    IN_ALLOWED_SECTION=0
  fi

  # Section 2.13 Transcription (not "Legacy") is outside allowed sections
  if echo "$line" | grep -qE "^### 2\.13 Transcription"; then
    IN_ALLOWED_SECTION=0
  fi

  if [ "$IN_ALLOWED_SECTION" -eq 1 ]; then
    continue
  fi

  # Check for forbidden patterns (legacy ECIES function calls/names in pseudocode)
  if echo "$line" | grep -qiE "eciesWrapKey|eciesUnwrapKey|secp256k1\.getSharedSecret|nsec_bech32|NIP-44"; then
    VIOLATIONS+=("$line")
  fi
done < "$PROTOCOL"

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "❌ Legacy crypto primitives found in active PROTOCOL.md sections:"
  echo "   Move ECIES/nsec/NIP-44 references to Appendix C or add a Legacy notice."
  echo ""
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v"
  done
  exit 1
fi

echo "✅ No legacy crypto primitives in active PROTOCOL.md sections."
exit 0
