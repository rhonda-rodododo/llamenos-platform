# Security Remediation — Epic 1: CI/CD & Supply Chain

**Date**: 2026-03-21
**Audit ref**: `docs/security/SECURITY_AUDIT_2026-03-21.md`
**Findings addressed**: CRIT-CI1, CRIT-CI2, HIGH-CI1–CI7, MED-CI1–CI3 (12 total)
**Dependency order**: First epic — unblocks safe builds for all subsequent epics.

---

## Context

The CI/CD and supply chain layer is the highest-priority component because a compromise here delivers code to volunteers' devices regardless of how secure the application layer is. Twelve findings across three severity levels. All fixes are surgical; none require architectural redesign.

---

## Findings and Fixes

### CRIT-CI1 — Shell injection via `workflow_dispatch` version input

**File**: `.github/workflows/tauri-release.yml:88-109`

The `version` input from `workflow_dispatch` is interpolated directly into a Node.js heredoc:

```js
conf.version = '${VERSION}';
```

An attacker with `write` access dispatching the workflow with a crafted version string can execute arbitrary JavaScript (and therefore arbitrary shell commands) on the build runner, which holds `TAURI_SIGNING_PRIVATE_KEY`, `APPLE_CERTIFICATE`, `APPLE_ID`, and `APPLE_PASSWORD`.

**Fix**: Capture the input through an env block (matching the pattern already used in `mobile-release.yml`), then validate it against a strict semver regex before any use:

```yaml
env:
  INPUT_VERSION: ${{ github.event.inputs.version }}
run: |
  VERSION="${INPUT_VERSION}"
  if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "Invalid version format: $VERSION" && exit 1
  fi
```

Pass `VERSION` via env to the Node.js subprocess rather than string interpolation:

```yaml
env:
  RELEASE_VERSION: "${{ env.INPUT_VERSION }}"
run: |
  node -e "
    const fs = require('fs');
    const v = process.env.RELEASE_VERSION;
    const conf = JSON.parse(fs.readFileSync('apps/desktop/tauri.conf.json', 'utf-8'));
    conf.version = v;
    fs.writeFileSync('apps/desktop/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
  "
```

The same env-variable indirection and semver validation must be applied to **every** `run:` step in `tauri-release.yml` that uses the version value. There are two Node.js mutation steps — one updates `apps/desktop/tauri.conf.json` (shown above) and one updates `package.json`. Both must use `process.env.RELEASE_VERSION` instead of string interpolation:

```yaml
- name: Bump package.json version
  env:
    RELEASE_VERSION: "${{ env.INPUT_VERSION }}"
  run: |
    node -e "
      const fs = require('fs');
      const v = process.env.RELEASE_VERSION;
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      pkg.version = v;
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
```

**Verification**: Attempt to dispatch the workflow with `version: "1.0.0'; process.exit(0); //"`. The job must fail the semver check before reaching any file mutation step.

---

### CRIT-CI2 — Production Dockerfile base images not pinned to digest

**File**: `deploy/docker/Dockerfile:10,18`

Both stages use mutable tags (`oven/bun:1`, `oven/bun:1-slim`). `Dockerfile.build` already uses the correct pattern with a SHA-256 digest. The production image is inconsistent.

**Fix**: Pull the current images, record their digests, and pin both `FROM` stages:

```dockerfile
FROM oven/bun:1@sha256:<digest>  AS deps
FROM oven/bun:1-slim@sha256:<digest>
```

Record the digests with human-readable tag comments (same style as other pinned services in `docker-compose.yml`).

**Ongoing digest management**: Add a `docker` ecosystem to `.github/dependabot.yml` to receive automated PRs when upstream images update:

```yaml
- package-ecosystem: "docker"
  directory: "/deploy/docker"
  schedule:
    interval: "weekly"
  groups:
    docker-base-images:
      patterns: ["*"]
```

**Verification**: `docker build deploy/docker/Dockerfile` must succeed with pinned digests. A digest mismatch (simulated by altering one character) must cause the build to fail at the `FROM` step.

---

### HIGH-CI1 — `cargo install cargo-ndk` without `--locked`

**File**: `.github/workflows/mobile-release.yml:57`

**Fix**: Change `cargo install cargo-ndk` to `cargo install cargo-ndk --locked`. One-line fix; matches all other `cargo install` usages in the codebase.

---

### HIGH-CI2 — strfry relay image not pinned to digest

**Files**: `deploy/docker/docker-compose.yml:147`, `deploy/helm/llamenos/values.yaml:88`

Two locations need fixing:

**docker-compose.yml** — The TODO comment already documents the procedure:

```bash
docker pull dockurr/strfry:1.0.1
docker inspect --format='{{index .RepoDigests 0}}' dockurr/strfry:1.0.1
```

```yaml
image: dockurr/strfry:1.0.1@sha256:<digest>
```

**values.yaml** — The Helm nostr relay entry (line 88) currently uses `tag: "latest"` (not even a version tag):

```yaml
nostr:
  image:
    repository: dockurr/strfry
    tag: "1.0.1@sha256:<same-digest>"  # was: "latest"
```

Both must be updated to the same digest-pinned reference.

**Note on publisher**: `dockurr/strfry` is a community repackage, not the official `hoytech/strfry` image. Before pinning, verify the image content is authentic (compare entrypoint, binary hash, provenance). If a Dockerfile is available, consider building from source and hosting on `ghcr.io/llamenos/strfry`.

---

### HIGH-CI3 — Whisper transcription image not pinned to digest

**Files**: `deploy/docker/docker-compose.yml:167`, `deploy/helm/llamenos/values.yaml:56`

Same procedure as HIGH-CI2:

```bash
docker pull fedirz/faster-whisper-server:0.4.1
docker inspect --format='{{index .RepoDigests 0}}' fedirz/faster-whisper-server:0.4.1
```

Update both `docker-compose.yml` and `values.yaml` with the resulting digest. The Helm whisper entry at `values.yaml:56` already uses `tag: "0.4.1"` with a `# TODO: pin to digest when available` comment — replace the entire line (tag + comment) with the digest-pinned form.

---

### HIGH-CI4 — `bun install` without `--frozen-lockfile` in load test workflow

**File**: `.github/workflows/load-test.yml:59`

**Fix**: `bun install` → `bun install --frozen-lockfile`. One-line fix matching all other workflows.

---

### HIGH-CI5 — Release workflows grant `contents:write` at workflow level

**Files**: `.github/workflows/tauri-release.yml:20-21`, `.github/workflows/mobile-release.yml`

**Fix**: Remove the top-level `permissions` block from both files. Add per-job permissions:

- All build/compile/test jobs: `permissions: contents: read`
- Only the final release/publish job: `permissions: contents: write`

This ensures that a compromised step in a build matrix job (running on macOS/Windows with signing keys in scope) cannot push to the repository.

---

### HIGH-CI6 — RustFS not digest-pinned in CI (two paths)

**Files**: `.github/workflows/ci.yml:304-318` (Linux Docker path), `.github/workflows/ci.yml:569-573` (macOS curl path)

There are two RustFS setup paths in CI:

**Linux CI job (line 304)** — uses `docker run rustfs/rustfs:RELEASE.2025-01-20T14-49-07Z` (tag-only, no digest):

```bash
docker run -d --name rustfs \
  -p 9000:9000 \
  -e MINIO_ROOT_USER=testaccess \
  -e MINIO_ROOT_PASSWORD=testsecret123456 \
  rustfs/rustfs:RELEASE.2025-01-20T14-49-07Z@sha256:ed9be66eb5f2636c18289c34c3b725ddf57815f2777c77b5938543b78a44f144 server /data
```

Use the same digest already pinned in `docker-compose.yml`.

**macOS/iOS CI job (line 569-573)** — macOS runners cannot run Docker, so this job downloads a RustFS binary via `curl` with no checksum verification:

```bash
curl -sSfL https://dl.min.io/server/rustfs/release/darwin-arm64/rustfs -o /tmp/rustfs
chmod +x /tmp/rustfs
```

This is the higher-risk path: a MITM on `dl.min.io` or a compromised CDN serves a malicious binary that executes on the macOS runner alongside iOS build secrets (code signing certificates, provisioning profile passphrases). The git-cliff download in the same workflow correctly verifies a SHA-256 checksum — apply the same pattern:

```bash
MINIO_VERSION="RELEASE.2025-01-20T14-49-07Z"
MINIO_SHA256="<sha256-of-rustfs-darwin-arm64-binary>"
curl -sSfL "https://dl.min.io/server/rustfs/release/darwin-arm64/archive/rustfs.${MINIO_VERSION}" -o /tmp/rustfs
echo "${MINIO_SHA256}  /tmp/rustfs" | sha256sum -c -
chmod +x /tmp/rustfs
```

Record the expected SHA-256 at the time of the fix by downloading and verifying the binary locally before committing the hash.

---

### HIGH-CI7 — `.env` files with apparent secrets on disk

**Files**: `deploy/docker/.env`, `deploy/docker/.env.shard-{0-3}`

**Investigation result**: All values are clearly test placeholders (sequential hex `0123456789abcdef...`, `local-test-password`, `testaccess`). Git history shows these were committed as part of the initial Docker setup but the files are now correctly `.gitignore`d.

**Fix**:
1. Confirm no real secrets are in git history: `git log --all -S "f28438990f" --source --all` — if any commit shows real entropy, rotate the corresponding secret immediately.
2. Add a pre-commit hook that blocks `deploy/docker/.env*` from being staged: add a `hooks/pre-commit` script (or extend the existing one) that checks `git diff --cached --name-only | grep -E 'deploy/docker/\.env'` and exits 1 if any match.
3. Document in `CONTRIBUTING.md` that `.env` files must never be committed and that operators provision secrets via their orchestration layer (Ansible vault, Helm secrets, Docker secrets).

---

### MED-CI1 — GlitchTip deployed with default "change-me" secret key

**File**: `deploy/docker/docker-compose.yml:227,256`

**Fix**: Change the `SECRET_KEY` interpolation to use the `:?` required syntax so the service refuses to start if the variable is absent:

```yaml
- SECRET_KEY=${GLITCHTIP_SECRET_KEY:?GLITCHTIP_SECRET_KEY is required — set in .env or Docker secrets}
```

Document `GLITCHTIP_SECRET_KEY` in the deployment runbook as a required 64-character random hex value (`openssl rand -hex 32`).

---

### MED-CI2 — Ansible `vars.example.yml` uses `:latest` and unversioned image tags

**File**: `deploy/ansible/vars.example.yml:53-57`

**Fix**: Replace all `:latest` and unversioned references with the same specific tags (and digests where available) used in `docker-compose.yml`. The example file should be a minimal-effort starting point for operators, not a trap.

```yaml
llamenos_app_image: ghcr.io/llamenos/llamenos:0.1.0  # Update on each release
llamenos_postgres_image: postgres:17-alpine@sha256:<digest>
llamenos_caddy_image: caddy:2.9-alpine@sha256:<digest>
llamenos_strfry_image: dockurr/strfry:1.0.1@sha256:<digest>
llamenos_whisper_image: fedirz/faster-whisper-server:0.4.1@sha256:<digest>
```

Add a comment at the top of `vars.example.yml` noting that image digests must be re-verified when updating tags.

---

### MED-CI3 — Bun audit allows HIGH-severity vulnerabilities to pass CI

**File**: `.github/workflows/ci.yml:189-194`

**Fix**: Remove the two-tier audit approach. Fail on HIGH:

```yaml
- name: Audit dependencies
  run: bun audit --audit-level=high
```

If there are currently known HIGH-severity advisories with no upstream fix, document accepted exceptions in a `audit-exceptions.txt` (or equivalent `bun audit --allow` flags when available) rather than systematically suppressing them.

---

## Implementation Sequence

All fixes in this epic are independent of each other and can be implemented in a single branch. Suggested order within the branch:

1. CRIT-CI1 (shell injection — highest risk, simplest fix)
2. CRIT-CI2 + Dependabot Docker addition (digest pinning foundation)
3. HIGH-CI5 (per-job permissions — affects same files as CRIT-CI1)
4. HIGH-CI1, HIGH-CI4 (one-line lockfile fixes)
5. HIGH-CI2, HIGH-CI3 (image digest pinning — requires running docker pull)
6. HIGH-CI6 (RustFS digest in CI)
7. HIGH-CI7 (pre-commit hook + documentation)
8. MED-CI1, MED-CI2, MED-CI3 (configuration hardening)

---

## Verification Checklist

- [ ] `workflow_dispatch` with malformed version string (`1.0.0'; exit 1; #`) fails at semver validation, not at file mutation
- [ ] `docker build deploy/docker/Dockerfile` succeeds with pinned digests; fails if a digest digit is altered
- [ ] `docker build deploy/docker/Dockerfile` with `oven/bun:1` (unpinned) replaced confirms the old tag still resolves — digest mismatch would fail
- [ ] `bun install --frozen-lockfile` passes in all workflow contexts
- [ ] GlitchTip container refuses to start without `GLITCHTIP_SECRET_KEY` set
- [ ] Linux CI RustFS `docker run` uses digest-pinned image
- [ ] macOS CI RustFS curl download verifies SHA-256 before `chmod +x`
- [ ] `bun audit --audit-level=high` passes (or known exceptions are documented)
- [ ] `git log --all -S "<any real secret value>" --source --all` returns no commits
- [ ] All `cargo install` usages in all workflows use `--locked`
- [ ] Release workflow build jobs have `contents: read`, publish job has `contents: write`
- [ ] Dependabot Docker ecosystem configured and opens a test PR on next run
