#!/usr/bin/env bash
# Run an arbitrary command on the Mac with proper shell environment.
#
# Usage:
#   ./scripts/mac-run.sh "xcodebuild test -scheme Llamenos-Package ..."
#   bun run mac:run "xcodebuild ..."
#
# Environment:
#   MAC_SSH_HOST   SSH host alias for the Mac (default: mac)
#   MAC_PROJECT    Absolute path to the project root on the Mac (default: ~/projects/llamenos)
#
# The command is run with Homebrew and asdf on PATH, and the working directory
# set to the project root on the Mac.

set -euo pipefail

MAC_HOST="${MAC_SSH_HOST:-mac}"
MAC_PROJECT="${MAC_PROJECT:-~/projects/llamenos}"

if [ $# -eq 0 ]; then
  echo "Usage: mac-run.sh \"<command>\"" >&2
  exit 1
fi

exec ssh "$MAC_HOST" \
  "cd ${MAC_PROJECT} && eval \"\$(/opt/homebrew/bin/brew shellenv)\" 2>/dev/null; export PATH=\"\$HOME/.asdf/shims:\$HOME/.asdf/bin:\$PATH\"; $*"
