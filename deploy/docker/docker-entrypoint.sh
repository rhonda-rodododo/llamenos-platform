#!/bin/sh
# Docker entrypoint: verify the runtime, run SQL migrations, then start the app.
set -e

# Fail loudly — instead of hanging at "Running database migrations..." with an
# opaque SCRAM error — if Bun's native text layer is broken on this host. A
# broken base64 encoder never returns, hence the timeout. See
# scripts/verify-runtime.ts and the "simdutf kernel pin" block in the Dockerfile.
echo "[entrypoint] Verifying runtime..."
rc=0
timeout -k 5 30 bun scripts/verify-runtime.ts || rc=$?
if [ "$rc" != 0 ]; then
  # verify-runtime.ts prints nothing on failure (a broken text layer cannot be
  # trusted to write); its exit code names the failed check.
  case "$rc" in
    10) check="Buffer.byteLength of non-ASCII text is wrong" ;;
    11) check="TextEncoder output length is wrong" ;;
    12) check="btoa returned a wrong value" ;;
    13) check="atob returned a wrong value" ;;
    14) check="base64 of a 32-byte buffer (the SCRAM proof size) is wrong" ;;
    124|137) check="the self-test never finished (a base64/UTF-8 operation spun forever)" ;;
    *) check="the self-test exited with status $rc" ;;
  esac
  echo "[entrypoint] FATAL: Bun's text layer is broken on this host: $check. Refusing to start." >&2
  echo "[entrypoint]   arch=$(uname -m) cpu=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')" >&2
  echo "[entrypoint]   cpuid_sse4_2=$(grep -qw sse4_2 /proc/cpuinfo && echo yes || echo no) SIMDUTF_FORCE_IMPLEMENTATION=${SIMDUTF_FORCE_IMPLEMENTATION:-(unset)}" >&2
  echo "[entrypoint]   On x86_64 this means simdutf found no usable kernel: the VM CPU model hides SSE4.2" >&2
  echo "[entrypoint]   (kvm64/qemu64) and SIMDUTF_FORCE_IMPLEMENTATION does not name a kernel the CPU can run." >&2
  echo "[entrypoint]   See the \"simdutf kernel pin\" block in deploy/docker/Dockerfile." >&2
  exit 1
fi

echo "[entrypoint] Running database migrations..."
bun scripts/run-migrations.ts

echo "[entrypoint] Starting application..."
exec bun src/server/index.ts
