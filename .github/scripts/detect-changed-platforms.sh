#!/usr/bin/env bash
# Classifies a list of changed files into the platform/scope flags CI uses to
# decide which jobs a PR's changes actually need.
#
# This is the SINGLE source of truth for the platform path map. Before this
# script existed, the same map was maintained independently in three places
# that had already drifted from each other: ci.yml's `changes` job (an
# `android` regex only), desktop-e2e.yml's `on.pull_request.paths:` list, and
# ios-e2e.yml's own `ios_related` regex. Extending or fixing platform scope
# happens HERE, once — every workflow that needs it calls this script instead
# of re-deriving its own copy (see #664).
#
# Usage: printf '%s\n' "$CHANGED_FILES" | detect-changed-platforms.sh
# Reads the changed-file list (one path per line) from stdin. Emits one
# `key=value` line per flag on stdout — safe to redirect straight into
# $GITHUB_OUTPUT, or to capture and parse in a test.
set -euo pipefail

CHANGED_FILES=$(cat)

# Any file under one of these paths is reachable from every platform's build
# — a change here must run every platform's tests, not just whichever tree
# it happens to live in. Deliberately narrower than "everything that isn't
# docs": apps/worker/** (backend) is NOT here — it is its own `backend`
# platform below — so a pure backend change no longer drags in Android/iOS
# builds the way the old per-workflow regexes did (that coupling was part of
# the over-triggering #664 exists to fix).
SHARED_DEPS_RE='^(packages/crypto/|packages/protocol/|packages/shared/|packages/i18n/|package\.json$|bun\.lock|\.mise\.toml$|tsconfig[^/]*\.json$|vitest[^/]*\.config\.ts$|scripts/|\.github/workflows/ci\.yml$)'

IOS_RE='^apps/ios/'
ANDROID_RE='^apps/android/'
DESKTOP_RE='^(apps/desktop/|src/client/|tests/)'
BACKEND_RE='^(apps/worker/|sip-bridge/|signal-notifier/|deploy/docker/)'
CRYPTO_RE='^packages/crypto/'
ANSIBLE_RE='^deploy/ansible/'
# Dependency manifests only — deliberately narrower than SHARED_DEPS_RE: a
# docs- or workflow-only PR must not be blocked by a dependency advisory it
# could not possibly have introduced.
AUDIT_RE='^(package\.json$|bun\.lock)'
# The fleet orchestrator has no backend/DB dependency and its safety-rail
# tests run inside the backend-unit job (see that job's own comment in
# ci.yml) — its own source and tests must gate that job too, independent of
# the `backend` flag.
ORCHESTRATOR_RE='^(orchestrator/|tests/orchestrator/|vitest\.orchestrator\.config\.ts$)'
DOCS_ONLY_EXEMPT_RE='\.md$|^site/'

docs_only=true
ios=false
android=false
desktop=false
backend=false
crypto=false
ansible=false
audit=false
orchestrator=false

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if ! echo "$file" | grep -qE "$DOCS_ONLY_EXEMPT_RE"; then
    docs_only=false
  fi

  if echo "$file" | grep -qE "$SHARED_DEPS_RE"; then
    ios=true; android=true; desktop=true; backend=true; crypto=true
    echo "Shared-dependency file changed: $file" >&2
  fi

  echo "$file" | grep -qE "$IOS_RE" && { ios=true; echo "iOS file changed: $file" >&2; }
  echo "$file" | grep -qE "$ANDROID_RE" && { android=true; echo "Android file changed: $file" >&2; }
  echo "$file" | grep -qE "$DESKTOP_RE" && { desktop=true; echo "Desktop file changed: $file" >&2; }
  echo "$file" | grep -qE "$BACKEND_RE" && { backend=true; echo "Backend file changed: $file" >&2; }
  echo "$file" | grep -qE "$CRYPTO_RE" && { crypto=true; echo "Crypto file changed: $file" >&2; }
  echo "$file" | grep -qE "$ANSIBLE_RE" && { ansible=true; echo "Ansible file changed: $file" >&2; }
  echo "$file" | grep -qE "$AUDIT_RE" && { audit=true; echo "Dependency manifest changed: $file" >&2; }
  echo "$file" | grep -qE "$ORCHESTRATOR_RE" && { orchestrator=true; echo "Fleet orchestrator file changed: $file" >&2; }
done <<< "$CHANGED_FILES"

app=$([ "$docs_only" = "false" ] && echo true || echo false)

cat <<EOF
docs_only=$docs_only
app=$app
ios=$ios
android=$android
desktop=$desktop
backend=$backend
crypto=$crypto
ansible=$ansible
audit=$audit
orchestrator=$orchestrator
EOF
