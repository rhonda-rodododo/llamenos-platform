# Epic F — Supply Chain & Infrastructure Hardening

**Date:** 2026-05-18  
**Severity:** HIGH (H34, H35, H36) / MEDIUM (remainder)  
**Source:** Two security audits conducted 2026-05-18  
**Branch:** `spec-epic-f`

---

## Executive Summary

Three HIGH-severity supply chain issues and three MEDIUM-severity CI/infrastructure issues were identified. None require emergency hotfixes — the app is pre-production — but all should be resolved before any production deployment. The overall principle for remediation: **prefer removal of risky complexity over hardening of risky patterns**.

Findings are ordered by blast radius:

| ID | Title | Severity | File |
|----|-------|----------|------|
| H34 | Watchtower mounts Docker socket | HIGH | `deploy/docker/docker-compose.production.yml:235` |
| H35 | Production images lack digest pinning | HIGH | Multiple compose + Helm files |
| H36 | Non-deterministic install fallback in sip-bridge | HIGH | `sip-bridge/Dockerfile:6` |
| M01 | Dev compose profile leakage | MEDIUM | Production startup scripts |
| M02 | CI workflow permissions not fully scoped | MEDIUM | `.github/workflows/*.yml` |
| M03 | Reproducible build verification gaps | MEDIUM | `scripts/verify-build.sh` |

---

## H34 — Watchtower Mounts Docker Socket

### Current State

`deploy/docker/docker-compose.production.yml` lines 232–256:

```yaml
watchtower:
  image: containrrr/watchtower:1.7.1
  restart: unless-stopped
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock  # ← HIGH risk
  environment:
    - WATCHTOWER_LABEL_ENABLE=true
    - WATCHTOWER_SCHEDULE=${WATCHTOWER_SCHEDULE:-0 0 4 * * *}
    - WATCHTOWER_CLEANUP=true
```

The `WATCHTOWER_LABEL_ENABLE=true` limits _which containers_ Watchtower updates (only those with `com.centurylinklabs.watchtower.enable=true`). It does **not** restrict Docker API access: Watchtower can still query all containers, images, volumes, and networks, and could be used to escape the container if compromised.

**Threat model**: An RCE in Watchtower or a malicious image pushed to the registry gives an attacker full Docker API — equivalent to root on the host.

### Alternatives Analysis

#### Option A — Remove Watchtower (RECOMMENDED)

Deploy is already CI/CD-driven via `deploy-demo.yml` and `release.yml`. Those workflows SSH into the host and run `docker compose pull && docker compose up -d`. Watchtower duplicates this capability but adds a persistent privileged process.

**Pros:**
- Eliminates the Docker socket exposure entirely.
- Deployment cadence is already controlled; auto-updates are not needed.
- No behavioral change: images continue to be updated on deploy.

**Cons:**
- Ops team loses emergency "push to registry → auto-deploy" convenience.
- Requires runbooks to be updated to reflect CI-only deploys.

#### Option B — Docker Socket Proxy

Replace direct socket mount with [tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy), which filters Docker API calls via nginx:

```yaml
docker-socket-proxy:
  image: tecnativa/docker-socket-proxy:0.1.2
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  environment:
    CONTAINERS: 1
    IMAGES: 1
    POST: 1         # needed for pull + restart
    NETWORKS: 0
    VOLUMES: 0
    INFO: 0

watchtower:
  image: containrrr/watchtower:1.7.1@sha256:<digest>
  environment:
    DOCKER_HOST: tcp://docker-socket-proxy:2375
    # ... no socket volume mount
```

**Pros:**
- Reduces Docker API surface area.
- Watchtower still functions.

**Cons:**
- Still has a running privileged process that can trigger image pulls and container restarts.
- Adds operational complexity (two more containers to maintain).
- docker-socket-proxy itself requires socket access, just one layer removed.

#### Option C — `--label-enable` with restrict-containers

Current config already uses `WATCHTOWER_LABEL_ENABLE=true`. Additionally add `WATCHTOWER_SCOPE` to limit polling to specific containers, and restrict to a single read-only GHCR token.

**Pros:**
- Minimal change, backward compatible.

**Cons:**
- Fundamentally still mounts the Docker socket. Risk reduction is marginal.
- Does not address the core threat.

### Required State

Remove Watchtower entirely from `docker-compose.production.yml`. CI/CD deploys (already in place) are sufficient.

### Specific Changes

**File: `deploy/docker/docker-compose.production.yml`**

Remove the entire `watchtower:` service block (lines 231–256):

```yaml
# DELETE this entire block:
  # ── Watchtower: automated image update checks ─────────────────
  watchtower:
    image: containrrr/watchtower:1.7.1
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      ...
```

Also remove any `watchtower.enable: "true"` labels from other service definitions if added in the future (search: `com.centurylinklabs.watchtower`).

**File: `deploy/ansible/vars.example.yml` and `deploy/ansible/vars.yml`** (if present)

Remove `WATCHTOWER_SCHEDULE`, `WATCHTOWER_LOG_LEVEL`, `WATCHTOWER_NOTIFICATION_URL` env var entries if they exist.

**File: `deploy/PRODUCTION_CHECKLIST.md`**

Remove any references to Watchtower setup/configuration.

### Rollback Plan

No rollback needed — removal is the safe direction. If the team decides Watchtower is needed (e.g., to support emergency security patches without a full CI run), implement Option B (socket proxy) instead and document it explicitly in the runbook.

### Monitoring

After removal: verify no process is mounting `/var/run/docker.sock` on production hosts via Ansible preflight (`stat /proc/*/fd/* | grep docker.sock`).

---

## H35 — Production Images Lack Digest Pinning

### Current State

#### Image Digest Inventory

The following table covers all Docker images across all compose files and the Helm chart. **"Pinned"** means the image reference includes `@sha256:<digest>`. `:latest` with a digest is still unpinned (the digest must be explicit to be enforced).

| Image | Tag | Digest Pinned? | File(s) | Priority |
|-------|-----|---------------|---------|----------|
| `postgres:17-alpine` | `17-alpine` | ✅ `@sha256:3430fe18...` | `docker-compose.yml:90` | — |
| `caddy:2.9-alpine` | `2.9-alpine` | ✅ `@sha256:b4e39523...` | `docker-compose.yml:108` | — |
| `rustfs/rustfs` | `latest` | ⚠️ Has digest but tag is `:latest` | `docker-compose.yml:128` | Fix tag |
| `fedirz/faster-whisper-server` | `0.4.1` | ❌ No digest | `docker-compose.yml:150` | HIGH |
| `andrius/asterisk` | digest-only | ✅ `@sha256:e30df5ec...` | `docker-compose.yml:167` | — |
| `kamailio/kamailio` | `5.7` | ❌ No digest | `docker-compose.yml:212` | HIGH |
| `coturn/coturn` | `4` | ❌ No digest | `docker-compose.yml:236` | HIGH |
| `glitchtip/glitchtip` | `v4.1` | ✅ `@sha256:6bfe449e...` | `docker-compose.yml:262` | — |
| `redis:7-alpine` | `7-alpine` | ✅ `@sha256:de15e464...` | `docker-compose.yml:311` | Verify digest |
| `bbernhard/signal-cli-rest-api` | `0.92` | ✅ `@sha256:702db336...` | `docker-compose.yml:325` | — |
| `containrrr/watchtower` | `1.7.1` | ❌ No digest | `docker-compose.production.yml:233` | Remove (H34) |
| `postgres:17-alpine` | `17-alpine` | ❌ No digest (dev only) | `docker-compose.dev.yml:26` | LOW (dev) |
| `rustfs/rustfs` | `latest` | ❌ No digest (dev only) | `docker-compose.dev.yml:42` | LOW (dev) |
| `bbernhard/signal-cli-rest-api` | `0.92` | ❌ No digest (dev only) | `docker-compose.dev.yml:62` | LOW (dev) |
| `ollama/ollama` | `0.6` | ❌ No digest (dev only) | `docker-compose.dev.yml:107` | LOW (dev) |
| `andrius/asterisk` | digest-only | ✅ `@sha256:e30df5ec...` | `docker-compose.dev.yml:123` | — |
| `rustfs/rustfs` | `latest` | ❌ No digest | `helm/llamenos/values.yaml:33` | HIGH |
| `fedirz/faster-whisper-server` | `0.4.1` | ❌ No digest | `helm/llamenos/values.yaml:55` | HIGH |
| `andrius/asterisk` | `20.11` | ❌ No digest | `helm/llamenos/values.yaml:71` | HIGH |
| `bbernhard/signal-cli-rest-api` | `0.92` with digest | ✅ `@sha256:702db336...` | `helm/llamenos/values.yaml:90` | — |

**Critical unpinned images (production exposure):**
1. `fedirz/faster-whisper-server:0.4.1` — comment in compose acknowledges this ("digest pin pending")
2. `kamailio/kamailio:5.7` — SIP proxy, network-facing
3. `coturn/coturn:4` — TURN relay, network-facing  
4. `rustfs/rustfs:latest` — object storage; tag is `:latest` with digest but this is misleading; digest pinning only (no tag) is preferred
5. Helm `andrius/asterisk:20.11` — diverges from compose which uses digest-only

**Note on `rustfs/rustfs`:** The compose file uses `rustfs/rustfs:latest@sha256:...` — the digest is technically enforced at pull time, but the `:latest` tag creates confusion and the digest may become stale. Use `rustfs/rustfs@sha256:...` (no tag) per Docker best practices.

### Required State

All images referenced in production compose files (`docker-compose.yml`, `docker-compose.production.yml`) and Helm values **must** include `@sha256:<digest>`. Dev compose images may remain unpinned for developer ergonomics. CI compose should match production pinning.

### Specific Changes

#### `docker-compose.yml`

Pin the following images (current unpinned or partially pinned entries):

```yaml
# BEFORE:
rustfs/rustfs:latest@sha256:0725587f6fcca83c1898f321424327d6e6da5e01ea20382905dd258ed5af3be4

# AFTER (remove :latest tag, keep digest):
rustfs/rustfs@sha256:0725587f6fcca83c1898f321424327d6e6da5e01ea20382905dd258ed5af3be4
```

```yaml
# BEFORE (line 150):
image: fedirz/faster-whisper-server:0.4.1
# AFTER (fetch digest: docker pull fedirz/faster-whisper-server:0.4.1 && docker inspect):
image: fedirz/faster-whisper-server:0.4.1@sha256:<FETCH_DIGEST>
```

```yaml
# BEFORE (line 212):
image: kamailio/kamailio:5.7
# AFTER:
image: kamailio/kamailio:5.7@sha256:<FETCH_DIGEST>
```

```yaml
# BEFORE (line 236):
image: coturn/coturn:4
# AFTER:
image: coturn/coturn:4.6@sha256:<FETCH_DIGEST>  # pin to specific minor version
```

#### `deploy/helm/llamenos/values.yaml`

```yaml
# BEFORE:
rustfs:
  image:
    repository: rustfs/rustfs
    tag: "latest"

# AFTER:
rustfs:
  image:
    repository: rustfs/rustfs
    tag: ""  # use digest only
    digest: "sha256:<FETCH_DIGEST>"
```

Repeat for `fedirz/faster-whisper-server`, `andrius/asterisk`.

#### New Script: `scripts/update-image-digests.sh`

Create a digest rotation script for operational use:

```bash
#!/usr/bin/env bash
# update-image-digests.sh — Fetch current digests for all pinned production images.
# Run before a planned maintenance window to rotate digest pins.
# Outputs a diff-ready list of image:digest pairs.
set -euo pipefail

IMAGES=(
  "postgres:17-alpine"
  "caddy:2.9-alpine"
  "rustfs/rustfs:latest"
  "fedirz/faster-whisper-server:0.4.1"
  "andrius/asterisk:20.x"
  "kamailio/kamailio:5.7"
  "coturn/coturn:4"
  "glitchtip/glitchtip:v4.1"
  "redis:7-alpine"
  "bbernhard/signal-cli-rest-api:0.92"
  "containrrr/watchtower:1.7.1"
)

for IMAGE in "${IMAGES[@]}"; do
  echo -n "$IMAGE → "
  docker pull "$IMAGE" --quiet 2>/dev/null
  DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null | cut -d@ -f2)
  echo "$DIGEST"
done
```

This script must be run by a human operator with Docker access and the output used to update compose files. It should NOT run automatically in CI (would re-introduce mutable image pulls).

### Rollback Plan

Digest changes are additive metadata. Rolling back means restoring the previous digest string from git history (`git log -p -- deploy/docker/docker-compose.yml`). No service restart is needed if the image is already cached locally; only a new pull would fetch the new digest.

### Monitoring

- **Trivy** already scans the built Docker image in `docker.yml`. Add scheduled scans of the third-party images (kamailio, coturn, rustfs) on a weekly schedule.
- **Cosign verification**: After deploying, verify running container digests against expected values: `docker inspect --format='{{index .RepoDigests 0}}' <container_name>`.

---

## H36 — Non-Deterministic Install Fallback in sip-bridge Dockerfile

### Current State

`sip-bridge/Dockerfile` line 6:

```dockerfile
RUN bun install --frozen-lockfile 2>/dev/null || bun install
```

The `|| bun install` fallback silently swallows frozen lockfile failures and falls back to a network-resolved, non-reproducible dependency install. The `2>/dev/null` suppresses the error so it is invisible in build logs.

This means:
1. If `bun.lock` is out of sync, the build succeeds anyway with undefined dependencies.
2. An attacker who compromises the npm/bun registry and publishes a malicious package version can exploit the fallback window.
3. CI will not catch lockfile drift.

### Required State

The build must fail fast if the lockfile is not satisfied. There is no legitimate reason to fall back to an unreproducible install in a production Docker image.

### Specific Changes

**File: `sip-bridge/Dockerfile`**

```dockerfile
# BEFORE:
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# AFTER:
RUN bun install --frozen-lockfile
```

Remove the `2>/dev/null` suppression so errors are visible. Remove the `|| bun install` fallback entirely.

If the frozen lockfile check is currently failing (which would explain why the fallback was added), the correct fix is to update the lockfile in the sip-bridge directory:

```bash
cd sip-bridge && bun install  # regenerates bun.lock
git add bun.lock && git commit -m "fix(sip-bridge): sync bun lockfile"
```

### Rollback Plan

This change cannot make things worse — the fallback was hiding failures. If the CI build breaks after this change, it means the lockfile was already out of date and needs to be committed. Fix: `cd sip-bridge && bun install && git add bun.lock`.

### Monitoring

Build logs for the `sip-bridge` Docker image in `docker.yml` will now surface any lockfile failures explicitly. No additional monitoring needed.

---

## M01 — Dev Compose Profile Leakage

### Current State

Production deployments use:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

The `COMPOSE_PROFILES` environment variable, if accidentally set in the shell environment on the production host, could cause dev-profile services (`--profile inference`, `--profile telephony`) to start in production.

The dev compose (`docker-compose.dev.yml`) uses hardcoded credentials like `POSTGRES_PASSWORD: dev` and `NOTIFIER_API_KEY: dev-notifier-key` which must never run in production.

The production compose (`docker-compose.yml`) already uses `${PG_PASSWORD:?PG_PASSWORD is required}` required-variable syntax which would fail if `.env` is absent. However, if `COMPOSE_PROFILES` includes dev-only profiles, services with hardcoded dev credentials could start.

### Required State

Production startup should explicitly set `COMPOSE_PROFILES` to only the intended profiles, preventing accidental inheritance from the shell environment.

### Specific Changes

**File: `deploy/ansible/playbooks/` (production deploy playbook)**

Add an explicit profile guard to all `docker compose up` invocations:

```bash
# BEFORE:
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

# AFTER:
COMPOSE_PROFILES="${ENABLED_PROFILES}" \
  docker compose \
    -f deploy/docker/docker-compose.yml \
    -f deploy/docker/docker-compose.production.yml \
  up -d
```

Where `ENABLED_PROFILES` is explicitly set in `vars.yml` (e.g., `signal,monitoring`) rather than inherited from environment.

**File: `deploy/ansible/vars.example.yml`**

Add:

```yaml
# Comma-separated list of enabled Docker Compose profiles.
# Valid values: signal, telephony, transcription, monitoring
# Never leave unset — use "" for core services only.
compose_profiles: ""
```

**File: `deploy/PRODUCTION_CHECKLIST.md`**

Add a preflight item:
- [ ] Verify `COMPOSE_PROFILES` is not set in the deployment shell environment. Use only the Ansible `compose_profiles` variable.

### Rollback Plan

Removing `COMPOSE_PROFILES` from the environment before a deploy has no side effects. Rolling back means reverting the Ansible playbook change; no service restart required.

---

## M02 — CI Workflow Permissions

### Current State

GitHub Actions workflows without a top-level `permissions:` block inherit the repository's **default token permissions**, which for many repositories includes `contents: write`. This means a compromised action could push to the repository even from jobs that only need read access.

#### Permissions Audit Table

| Workflow | Top-level `permissions:` | Job-level `permissions:` | Status |
|---------|--------------------------|--------------------------|--------|
| `ci.yml` | ❌ Not declared | One job has `contents: read, packages: write, id-token: write, attestations: write` | **NEEDS FIX** |
| `docker.yml` | ❌ Not declared | Per-job: `contents: read, packages: write, security-events: write, id-token: write, attestations: write` | **NEEDS FIX** |
| `release.yml` | ❌ Not declared | `contents: write, id-token: write, attestations: write` (release job) | **NEEDS FIX** |
| `auto-deploy-demo.yml` | `contents: read, packages: read` | — | ✅ OK |
| `deploy-demo.yml` | `contents: read, packages: read` | — | ✅ OK |
| `desktop-e2e.yml` | `contents: read` | — | ✅ OK |
| `iso-builder.yml` | `contents: read` | — | ✅ OK |
| `knope-release-pr.yml` | `contents: write, pull-requests: write` | — | ✅ Minimal and correct |
| `secret-scan.yml` | `contents: read` | — | ✅ OK |
| `load-test.yml` | ❌ Not declared | No job-level permissions | **NEEDS FIX** |
| `mobile-release.yml` | ❌ Not declared | Per-job permissions defined | **NEEDS FIX** |
| `security-audit.yml` | ❌ Not declared | `security-events: write`, `contents: read` per job | **NEEDS FIX** |
| `tauri-release.yml` | ❌ Not declared | Per-job: `contents: read`, `contents: write` (release), `id-token: write` | **NEEDS FIX** |

#### Recommended Permissions Per Workflow

| Workflow | Recommended top-level | Notes |
|----------|----------------------|-------|
| `ci.yml` | `permissions: {}` | All grants at job level (already done for Docker publish job) |
| `docker.yml` | `permissions: {}` | All grants at job level (already done) |
| `release.yml` | `permissions: {}` | Grant at job level only |
| `load-test.yml` | `permissions: {}` | No GitHub API access needed |
| `mobile-release.yml` | `permissions: {}` | All grants at job level (already done) |
| `security-audit.yml` | `permissions: {}` | All grants at job level (already done) |
| `tauri-release.yml` | `permissions: {}` | All grants at job level (already done) |

### Required State

Every workflow file must declare `permissions: {}` at the top level (deny-all default), with only necessary permissions granted per-job.

### Specific Changes

For each workflow listed as **NEEDS FIX**, add immediately after the `on:` block and before `jobs:`:

```yaml
# Deny all permissions at workflow level; grant minimum per job.
permissions: {}
```

Then verify each existing job-level `permissions:` block is correct for that job's actual API calls.

**Special case: `load-test.yml`** — This workflow has no permissions block and no job-level grants. Since it only runs `docker compose` + `k6`, add:

```yaml
permissions: {}
```

at the top level and no job-level grants (the default runner environment is sufficient).

### Rollback Plan

Adding `permissions: {}` may cause jobs to fail if they were relying on implicit write permissions. If CI breaks after this change, identify the failing step, determine which permission it needs, and add it explicitly at the job level. This is a discovery process, not a regression.

### Monitoring

GitHub's Security tab shows "Workflow permissions" warnings. After applying changes, verify no workflows have implicit write access via the repository's Settings → Actions → General → "Workflow permissions" audit.

---

## M03 — Reproducible Build Verification Gaps

### Current State

`scripts/verify-build.sh` covers:
- ✅ Desktop client build checksums (SHA-256 of `dist/client/`)
- ✅ cosign keyless signature verification on `CHECKSUMS.txt` and `provenance.json`
- ✅ SBOM attestation (CycloneDX) via cosign
- ✅ SLSA provenance presence check
- ✅ GPG signature on `CHECKSUMS.txt`
- ✅ Reproducible Docker build via `Dockerfile.build` + local rebuild + checksum diff
- ✅ `bun.lockb` checksum included

### Gap Analysis

| Artifact | Verified? | Gap |
|----------|-----------|-----|
| Desktop client JS/CSS | ✅ Yes | — |
| `bun.lockb` | ✅ Yes | — |
| `Dockerfile.build` reproducibility | ✅ Yes | — |
| sip-bridge Docker image | ❌ No | Not included in `CHECKSUMS.txt`; no separate verification |
| Backend server build (`dist/server/`) | ❌ No | Not checksummed in release |
| iOS IPA | ❌ No | Mobile release artifacts not in verify script |
| Android APK | ❌ No | Mobile release artifacts not in verify script |
| Helm chart values | ❌ No | Image digests in `helm/llamenos/values.yaml` not verified |
| Third-party Docker image digests | ❌ No | No check that running containers match expected digests |
| cosign: sip-bridge container | ✅ Yes | `docker.yml` signs sip-bridge separately; verify script doesn't check it |

### Required State

The verify script should cover the backend server artifact and document the known gaps for mobile/Docker images with instructions for manual verification.

### Specific Changes

**File: `scripts/verify-build.sh`**

Add backend server checksum to the release build step:

```bash
# In Step 6 (Reproducible build), after frontend checksums:
find dist/server -type f -exec sha256sum {} \; | sort >> CHECKSUMS.txt
```

This requires `release.yml` to also include `dist/server/` in its `CHECKSUMS.txt` generation step.

**File: `.github/workflows/release.yml`** (build job, "Compute build checksums" step):

```bash
# BEFORE:
cd dist
find client -type f -exec sha256sum {} \; | sort > ../CHECKSUMS.txt
cd ..
sha256sum bun.lockb >> CHECKSUMS.txt

# AFTER:
cd dist
find client -type f -exec sha256sum {} \; | sort > ../CHECKSUMS.txt
find server -type f -exec sha256sum {} \; | sort >> ../CHECKSUMS.txt
cd ..
sha256sum bun.lockb >> CHECKSUMS.txt
```

**File: `scripts/verify-build.sh`**

Add a documentation section for known gaps:

```bash
echo ""
echo "--- Known verification gaps ---"
echo "  - Mobile artifacts (iOS IPA, Android APK): verify via mobile-release workflow attestations"
echo "  - sip-bridge Docker image: verify via 'cosign verify ${DOCKERHUB_USERNAME}/llamenos-sip-bridge@<digest>'"
echo "  - Running container digests: 'docker inspect --format={{index .RepoDigests 0}} <container>'"
echo "  - Helm chart image pins: review helm/llamenos/values.yaml digest fields manually"
```

### Rollback Plan

Adding the server build to `CHECKSUMS.txt` is additive. The verify script already handles `--ignore-missing` in checksum comparisons, so older releases (without server checksums) remain verifiable. No rollback needed.

---

## Implementation Order

Fixes should be applied in this order to minimize risk:

1. **H36** (sip-bridge lockfile fallback) — smallest change, highest confidence, can merge immediately.
2. **H35** (digest pinning) — requires running `scripts/update-image-digests.sh` to fetch current digests, then committing. Run in a maintenance window.
3. **H34** (Watchtower removal) — coordinate with ops team. Verify CI/CD deploy path is working before removing Watchtower.
4. **M02** (workflow permissions) — add `permissions: {}` to failing workflows, verify CI stays green.
5. **M01** (profile leakage) — update Ansible playbooks, verify on demo env.
6. **M03** (verify-build gaps) — update checksums generation and verify script.

---

## Supply Chain Compromise Detection

Beyond the point-in-time fixes, the following monitoring posture should be maintained:

### Image Signature Verification (Post-Deploy)

After each deploy, run on the production host:

```bash
# Verify all running containers match expected digests
for name in llamenos caddy postgres rustfs; do
  DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$(docker ps --filter "name=$name" -q)" 2>/dev/null)
  echo "$name: $DIGEST"
done
```

Compare output against the digests committed in `docker-compose.yml`.

### SBOM Drift Detection

The `security-audit.yml` workflow already runs Trivy on Docker images. Extend it to:
- Scan `kamailio/kamailio:5.7`, `coturn/coturn:4`, `rustfs/rustfs:latest` directly (not just the built app image).
- Add these to the Trivy matrix in `security-audit.yml`.

### Dependency Audit Cadence

`ci.yml` runs `bun audit` on every PR. This covers JavaScript dependencies. Add:
- `cargo audit` for Rust dependencies in `packages/crypto/` on the same schedule.
- Scheduled (weekly) run of the full `bun audit` + `cargo audit` via a dedicated workflow, independent of PRs.

### Lockfile Integrity

After H36 is fixed, any CI build failure with `--frozen-lockfile` is a signal: either a developer updated dependencies without committing the lockfile, or a registry-level attack modified a package. Both cases should trigger investigation before the lockfile is updated.
