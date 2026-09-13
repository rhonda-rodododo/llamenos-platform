#!/bin/bash
# Verify the Tauri isolation allowlist and the Rust command registry agree.
#
# The app (non-`plugin:`) commands in apps/desktop/isolation/index.html
# `ALLOWED_COMMANDS` must be EXACTLY the commands in `generate_handler![...]`
# (apps/desktop/src/lib.rs), and every command platform.ts invokes must be
# registered. A registered-but-unallowlisted command is not "unexposed" — it is
# a feature that works under `tauri:dev` and the Playwright IPC mock (neither
# runs the isolation iframe) and is rejected only in the packaged app.
#
# The check itself lives in src/client/lib/desktop-ipc-boundary.test.ts, which
# CI's desktop-unit job runs; this wrapper is the pre-commit entry point to the
# same test so there is one implementation, not two that can disagree.
set -euo pipefail

exec node node_modules/vitest/vitest.mjs run \
  --config vitest.desktop.config.ts \
  src/client/lib/desktop-ipc-boundary.test.ts
