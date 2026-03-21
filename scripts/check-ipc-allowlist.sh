#!/bin/bash
# Verify the isolation allowlist is a valid subset of generate_handler![].
# The allowlist may be smaller (not every registered command needs webview exposure),
# but it must NEVER contain commands absent from the handler (orphaned = forbidden).
# Run as part of CI: bun run check:ipc-allowlist
set -euo pipefail

# Extract commands registered in generate_handler![]
REGISTERED=$(grep -oP '(?<=crypto::)\w+' apps/desktop/src/lib.rs | sort -u)
# Extract commands in isolation allowlist (exclude plugin: entries and non-command lines)
ALLOWLIST=$(grep -oP "'\K\w+(?=')" apps/desktop/isolation/index.html | grep -v 'plugin:' | sort -u)

# Commands in allowlist but NOT in handler (forbidden — would bypass an unregistered command)
ORPHANED=$(comm -23 <(echo "$ALLOWLIST") <(echo "$REGISTERED"))

if [ -n "$ORPHANED" ]; then
  echo "ERROR: Allowlist contains commands not in generate_handler![]: $ORPHANED"
  exit 1
fi

# Commands in handler but NOT in allowlist are fine — not all commands need webview exposure.
# Log them for visibility only.
HANDLER_ONLY=$(comm -23 <(echo "$REGISTERED") <(echo "$ALLOWLIST"))
if [ -n "$HANDLER_ONLY" ]; then
  echo "INFO: Handler commands not in allowlist (webview-unexposed, expected): $HANDLER_ONLY"
fi

echo "Allowlist/handler parity OK — allowlist is a valid subset of generate_handler![]"
