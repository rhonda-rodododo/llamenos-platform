# Implementation Plan — Epic F: Supply Chain & Infrastructure Hardening

**Spec**: `docs/superpowers/specs/2026-05-18-epic-f-supply-chain.md`
**Date**: 2026-05-18
**Branch**: `fix/epic-f-supply-chain`
**PR target**: `main`

All phases are independent and can be merged separately. Phase order below is recommended.

---

## Phase 1: Docker Image Digest Pinning (H35)

**Findings**: H35 — images not universally pinned across all compose files.

### 1.1 Create `scripts/update-image-digests.sh`

Create a helper script that operators run to refresh image digests:

```bash
#!/usr/bin/env bash
# scripts/update-image-digests.sh
# Usage: ./scripts/update-image-digests.sh
# Prints current sha256 digests for all third-party images used in compose files.
# Copy/paste the output into the relevant compose file IMAGE lines.
set -euo pipefail

images=(
  "postgres:17-alpine"
  "caddy:2.9-alpine"
  "rustfs/rustfs:latest"
  "fedirz/faster-whisper-server:0.4.1"
  "andrius/asterisk:latest"   # tag: 20.x
  "kamailio/kamailio:5.7"
  "coturn/coturn:4"
  "glitchtip/glitchtip:v4.1"
  "redis:7-alpine"
  "bbernhard/signal-cli-rest-api:0.92"
  "ollama/ollama:0.6"
  "containrrr/watchtower:1.7.1"
  "tecnativa/docker-socket-proxy:latest"
)

for img in "${images[@]}"; do
  echo "Pulling $img..."
  docker pull "$img" --quiet
  digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$img" 2>/dev/null || echo "NOT_FOUND")
  echo "  $img → $digest"
done
```

The script is documentation and a convenience tool — it does not auto-patch files. Operators verify digests match expected values before committing.

### 1.2 Pin images in `deploy/docker/docker-compose.dev.yml`

**Services to pin** (all currently undigested):

- `postgres:17-alpine` → add `@sha256:<digest>` (match the digest already used in `docker-compose.yml`)
- `rustfs/rustfs:latest` → add `@sha256:<digest>` (match production)
- `bbernhard/signal-cli-rest-api:0.92` → add `@sha256:<digest>` (match production)
- `ollama/ollama:0.6` → add `@sha256:<digest>`

**Implementation**: Run `scripts/update-image-digests.sh` locally, record digests, edit file. Format: `image: name:tag@sha256:digest  # pinned YYYY-MM-DD`

### 1.3 Pin images in `deploy/docker/docker-compose.yml`

**Services to pin**:

- `fedirz/faster-whisper-server:0.4.1` — remove the "digest pin pending" comment, add actual digest
- `kamailio/kamailio:5.7` — add `@sha256:<digest>`
- `coturn/coturn:4` — add `@sha256:<digest>`

### 1.4 Pin Watchtower image in `deploy/docker/docker-compose.production.yml`

- `containrrr/watchtower:1.7.1` → add `@sha256:<digest>`

`docker-compose.ci.yml` has no pinned image declarations (inherits from the base file via merge) — no changes needed there.

### 1.5 Verification

```bash
# Validate all compose files parse correctly
docker compose -f deploy/docker/docker-compose.yml config --quiet
docker compose -f deploy/docker/docker-compose.dev.yml config --quiet
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml config --quiet

# Confirm no mutable-tag image lines remain (grep should return empty)
grep -rE 'image:\s+\S+:(latest|[0-9]+|[0-9]+\.[0-9]+)(\s|$)' deploy/docker/docker-compose*.yml \
  | grep -v '@sha256:' \
  | grep -v 'build:' \
  && echo "UNPINNED IMAGES FOUND" || echo "All images pinned"
```

**Rollback**: The old mutable tags are still valid — reverting the digest lines restores the old state. No service configuration changes.

---

## Phase 2: Watchtower Docker Socket Proxy (H34)

**Finding**: H34 — Watchtower mounts raw `/var/run/docker.sock`, granting full daemon access.
**Strategic decision**: Keep Watchtower, add `tecnativa/docker-socket-proxy`.

### 2.1 Add `docker-socket-proxy` service to `docker-compose.production.yml`

```yaml
  # ── Docker Socket Proxy — restricts Watchtower's daemon access ──
  docker-socket-proxy:
    image: tecnativa/docker-socket-proxy:0.3.0@sha256:<digest>  # pinned
    restart: unless-stopped
    privileged: true  # required: needs access to host docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      # Whitelist only what Watchtower needs: list containers + pull/update images
      - CONTAINERS=1
      - IMAGES=1
      # Deny everything else (default is 0 for all — explicit for clarity)
      - AUTH=0
      - BUILD=0
      - COMMIT=0
      - CONFIGS=0
      - DISTRIBUTION=0
      - EXEC=0
      - GRPC=0
      - INFO=0
      - NETWORKS=0
      - NODES=0
      - PLUGINS=0
      - POST=0       # disables any write operations not otherwise listed
      - SECRETS=0
      - SERVICES=0
      - SESSION=0
      - SWARM=0
      - SYSTEM=0
      - TASKS=0
      - VOLUMES=0
    networks:
      - docker-proxy
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "2"
```

Add network declaration:

```yaml
networks:
  docker-proxy:
    driver: bridge
    internal: true   # proxy network is internal — only Watchtower and proxy
```

### 2.2 Update Watchtower service in `docker-compose.production.yml`

Remove the direct `docker.sock` mount. Point Watchtower at the proxy via `DOCKER_HOST`:

```yaml
  watchtower:
    image: containrrr/watchtower:1.7.1@sha256:<digest>  # digest from Phase 1
    restart: unless-stopped
    # No volumes: block — docker.sock is NOT mounted directly
    environment:
      - DOCKER_HOST=tcp://docker-socket-proxy:2375
      - WATCHTOWER_LABEL_ENABLE=true
      - WATCHTOWER_SCHEDULE=${WATCHTOWER_SCHEDULE:-0 0 4 * * *}
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_LOG_LEVEL=${WATCHTOWER_LOG_LEVEL:-info}
      - REPO_USER=${GHCR_USERNAME:-}
      - REPO_PASS=${GHCR_TOKEN:-}
      - WATCHTOWER_NOTIFICATION_URL=${WATCHTOWER_NOTIFICATION_URL:-}
    networks:
      - docker-proxy  # only needs the proxy network, not web or internal
    depends_on:
      - docker-socket-proxy
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

### 2.3 Verification

```bash
# Functional: Watchtower can still pull/update images through proxy
# Start stack, watch Watchtower logs for successful container poll
docker compose -f docker-compose.yml -f docker-compose.production.yml logs watchtower

# Security: Watchtower CANNOT exec into containers
# The proxy returns 403 for any /exec request
docker exec -it <watchtower_container_id> \
  wget -qO- http://docker-socket-proxy:2375/v1.41/containers/<any_id>/exec \
  && echo "EXEC PERMITTED — FAIL" || echo "EXEC BLOCKED — PASS"

# Compose validation
docker compose -f deploy/docker/docker-compose.yml \
  -f deploy/docker/docker-compose.production.yml config --quiet
```

**Rollback**: Revert `docker-compose.production.yml` to direct socket mount. Remove `docker-socket-proxy` service and `docker-proxy` network. Takes effect on next `docker compose up`.

---

## Phase 3: Build Determinism (H36, SUPPLY-01)

### 3.1 Remove `|| bun install` fallback in `sip-bridge/Dockerfile` (H36)

**File**: `sip-bridge/Dockerfile:6`

Change:
```dockerfile
RUN bun install --frozen-lockfile 2>/dev/null || bun install
```
To:
```dockerfile
RUN bun install --frozen-lockfile
```

This makes the build fail with a clear error if the lockfile is stale, rather than silently resolving new dependency versions.

**If the lockfile is missing in the repo**: Add `sip-bridge/bun.lock` to the repository. Run `bun install` locally in `sip-bridge/`, commit the lockfile.

### 3.2 Pin Bun version + verify checksum in `Dockerfile.nodejs` (SUPPLY-01)

**File**: `deploy/docker/Dockerfile.nodejs`

Replace the `curl | bash` install with a versioned, checksum-verified download:

```dockerfile
# Stage 1: Install runtime deps
FROM node:26-slim@sha256:<node-26-slim-digest> AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*

# Install Bun with version pin and SHA-256 verification
# To update: download the new version, verify with sha256sum, update both ARGs
ARG BUN_VERSION=1.3.5
# sha256sum of bun-linux-x64.zip for v1.3.5 — update when bumping BUN_VERSION
ARG BUN_SHA256=<sha256-of-bun-v1.3.5-linux-x64.zip>
RUN curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" \
      -o /tmp/bun.zip \
    && echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c - \
    && unzip /tmp/bun.zip -d /tmp/bun-extract \
    && mv /tmp/bun-extract/bun-linux-x64/bun /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun-extract \
    && chmod +x /usr/local/bin/bun

COPY package.json bun.lockb ./
# ... rest of COPY stubs ...
RUN bun install --frozen-lockfile --production --ignore-scripts
```

**How to obtain the SHA-256**:
```bash
curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v1.3.5/bun-linux-x64.zip" -o /tmp/bun.zip
sha256sum /tmp/bun.zip
```

Record the hash in a comment alongside `ARG BUN_SHA256` so operators know how to verify it.

Also pin the `node:26-slim` base image to digest (fetch with `docker pull node:26-slim && docker inspect --format='{{index .RepoDigests 0}}' node:26-slim`).

### 3.3 Harden `signal-notifier/Dockerfile` (SUPPLY-01 scope)

**File**: `signal-notifier/Dockerfile`

Current (insecure):
```dockerfile
FROM oven/bun:1-slim
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
```

Fix (pinned digest + frozen lockfile):
```dockerfile
FROM oven/bun:1-slim@sha256:<digest>  # pinned — update via scripts/update-image-digests.sh
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
EXPOSE 3100
CMD ["bun", "run", "src/index.ts"]
```

**If `signal-notifier/bun.lock` is missing**: Run `bun install` in `signal-notifier/`, commit the lockfile.

### 3.4 Verification

```bash
# H36: Build fails if lockfile is stale
cd sip-bridge
echo "tampered" >> bun.lock
docker build . && echo "BUILD SHOULD HAVE FAILED" || echo "Lockfile check passed — build correctly rejected"
git checkout bun.lock

# SUPPLY-01: Build succeeds with pinned Bun + checksum
docker build -f deploy/docker/Dockerfile.nodejs . --target deps

# SUPPLY-01 negative: Build fails if checksum is wrong
docker build -f deploy/docker/Dockerfile.nodejs . --target deps \
  --build-arg BUN_SHA256=deadbeef \
  && echo "CHECKSUM CHECK FAILED — PASS WHEN IT SHOULD FAIL" \
  || echo "Bad checksum rejected — PASS"
```

**CI test**: Add a step to the `docker` workflow that builds `sip-bridge/Dockerfile` with a tampered lockfile and asserts the build exits non-zero.

**Rollback**: Revert file edits. Both Dockerfiles are build-time only — no running state to roll back.

---

## Phase 4: CI Workflow Permissions Deny-All (M02)

**Finding**: M02 — workflows lack top-level `permissions: {}` deny-all, defaulting to broad GitHub token scopes.

### 4.1 Audit current permissions state

For each of the 14 workflows, determine which jobs need which permissions:

| Workflow | Jobs needing elevated perms | Required permission |
|----------|----------------------------|---------------------|
| `ci.yml` | `release-pr` (calls knope) | `contents: write`, `pull-requests: write` |
| `docker.yml` | `publish` job | `packages: write`, `contents: read` |
| `tauri-release.yml` | `publish` job | `contents: write` |
| `mobile-release.yml` | `publish` job | `contents: write` |
| `release.yml` | `github-release` job | `contents: write` |
| `knope-release-pr.yml` | all | `contents: write`, `pull-requests: write` |
| `desktop-e2e.yml` | all | `contents: read` |
| `ios-e2e.yml` | all | `contents: read` |
| `load-test.yml` | all | `contents: read` |
| `security-audit.yml` | `submit-results` | `security-events: write` |
| `secret-scan.yml` | all | `contents: read` |
| `iso-builder.yml` | `upload` | `contents: write` |
| `deploy-demo.yml` | all | `contents: read` |
| `auto-deploy-demo.yml` | all | `contents: read` |

### 4.2 Add `permissions: {}` to each workflow

**Pattern to apply**:

```yaml
# At workflow root level (before `jobs:`)
permissions: {}  # deny-all; per-job permissions below
```

Then add per-job blocks where needed:

```yaml
jobs:
  build:
    permissions:
      contents: read   # checkout only
    # ...

  publish:
    permissions:
      contents: write  # create release
      packages: write  # push to GHCR
```

**File-by-file changes**:

1. **`ci.yml`**: Add `permissions: {}` at root. `release-pr` job gets `contents: write, pull-requests: write`. All other jobs get `contents: read`.

2. **`docker.yml`**: Add `permissions: {}` at root. `build` job gets `contents: read`. `publish` job gets `contents: read, packages: write`.

3. **`tauri-release.yml`**: Add `permissions: {}` at root. Build matrix jobs get `contents: read`. `publish` job gets `contents: write`.

4. **`mobile-release.yml`**: Add `permissions: {}` at root. Build jobs get `contents: read`. `publish` job gets `contents: write`.

5. **`release.yml`**: Add `permissions: {}` at root. Build jobs get `contents: read`. `github-release` job gets `contents: write`.

6. **`knope-release-pr.yml`**: Already has `permissions` block — verify it is job-level rather than workflow-level. Add `permissions: {}` at root if missing.

7. **`desktop-e2e.yml`**: Add `permissions: {}` at root. All jobs get `contents: read`.

8. **`ios-e2e.yml`**: Add `permissions: {}` at root. All jobs get `contents: read`.

9. **`load-test.yml`**: Add `permissions: {}` at root. All jobs get `contents: read`.

10. **`security-audit.yml`**: Add `permissions: {}` at root. Audit jobs get `contents: read`. `submit-results` gets `security-events: write`.

11. **`secret-scan.yml`**: Verify existing `permissions` block is at workflow root already — if so, check it is already deny-all. If not, add.

12. **`iso-builder.yml`**: Add `permissions: {}` at root. Build jobs get `contents: read`. Upload job gets `contents: write`.

13. **`deploy-demo.yml`**: Add `permissions: {}` at root. All jobs get `contents: read`.

14. **`auto-deploy-demo.yml`**: Add `permissions: {}` at root. All jobs get `contents: read`.

### 4.3 Verification

```bash
# Validate YAML syntax for all workflows
for f in .github/workflows/*.yml; do
  python3 -c "import yaml, sys; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"
done

# Verify deny-all present at root of each workflow
for f in .github/workflows/*.yml; do
  grep -q "^permissions:" "$f" && echo "OK: $f" || echo "MISSING top-level permissions: $f"
done
```

CI will validate this by running — if any job attempts an operation exceeding its declared permissions, the workflow fails with a 403.

**Rollback**: Remove the added `permissions: {}` lines. Restores previous (over-permissioned) behaviour. Safe to roll back — no infrastructure state is affected.

---

## Phase 5: Secret Handling Hardening (SUPPLY-07, SUPPLY-08, SUPPLY-09)

### 5.1 Scope `TAURI_SIGNING_PRIVATE_KEY` to signing step only (SUPPLY-07)

**File**: `.github/workflows/tauri-release.yml`

**Current**: `TAURI_SIGNING_PRIVATE_KEY` is injected into the `env:` block of the entire build step (macOS, Windows, Linux), making it accessible to all child processes for the duration of the build.

**Fix**: Split each platform build into two steps — compile (no keys) then sign (keys only):

```yaml
      # Step A: Compile without signing keys in scope
      - name: Compile (macOS universal)
        if: matrix.platform == 'macos-latest'
        run: bun run tauri:build -- --target universal-apple-darwin --no-bundle

      # Step B: Bundle + sign with keys in scope only for this step
      - name: Sign and bundle (macOS)
        if: matrix.platform == 'macos-latest'
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: bun run tauri:build -- --target universal-apple-darwin --bundles all
```

> **Note**: Verify that `tauri build --no-bundle` / `--bundles all` are valid CLI flags for the Tauri version in use. If Tauri does not support this split cleanly, an alternative is to move the signing-sensitive build into a separate job that receives only the signing secret, not other build secrets.

### 5.2 Avoid writing Apple certificate to disk (SUPPLY-08)

**File**: `.github/workflows/tauri-release.yml:128`

**Current**:
```bash
echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12
security import certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
rm certificate.p12
```

**Fix** — use process substitution (avoids disk write entirely):
```bash
security import \
  <(echo "$APPLE_CERTIFICATE" | base64 --decode) \
  -k build.keychain \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign
```

`<(...)` creates a file descriptor backed by a pipe — the decoded bytes flow directly into `security import` without touching the filesystem. macOS supports process substitution in bash.

If `security import` does not accept a process substitution as the file argument (some versions require a real path), use a `tmpfs` directory:

```bash
CERT_TMPDIR=$(mktemp -d)
chmod 700 "$CERT_TMPDIR"
echo "$APPLE_CERTIFICATE" | base64 --decode > "${CERT_TMPDIR}/cert.p12"
security import "${CERT_TMPDIR}/cert.p12" -k build.keychain \
  -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
rm -rf "$CERT_TMPDIR"
```

Either approach reduces the cert's dwell time on the runner filesystem to near-zero.

### 5.3 Use `ssh-agent` for demo SSH key (SUPPLY-09)

**File**: `.github/workflows/deploy-demo.yml`

**Current**:
```bash
printf '%s' "$SSH_KEY" > ~/.ssh/llamenos_demo_deploy
chmod 600 ~/.ssh/llamenos_demo_deploy
```

**Fix** — load into `ssh-agent` without disk write:

```yaml
      - name: Load SSH key into agent
        env:
          SSH_KEY: ${{ secrets.DEMO_SSH_PRIVATE_KEY }}
        run: |
          eval "$(ssh-agent -s)"
          echo "SSH_AUTH_SOCK=$SSH_AUTH_SOCK" >> "$GITHUB_ENV"
          echo "SSH_AGENT_PID=$SSH_AGENT_PID" >> "$GITHUB_ENV"
          echo "$SSH_KEY" | ssh-add -
          ssh-keyscan -H "$(grep ansible_host deploy/ansible/inventory-demo.yml | head -1 | awk '{print $2}')" \
            >> ~/.ssh/known_hosts 2>/dev/null || true

      - name: Deploy demo instance
        working-directory: deploy/ansible
        run: |
          ansible-playbook playbooks/deploy-demo.yml \
            -i inventory-demo.yml \
            --vault-password-file /tmp/vault-pass
        # Ansible picks up SSH_AUTH_SOCK automatically

      - name: Stop SSH agent
        if: always()
        run: ssh-agent -k || true
```

Remove the "Clean up secrets" step that was deleting the key file — it's no longer needed since the key never touches disk.

Update `ansible.cfg` or `deploy/ansible/ansible.cfg` to ensure `ssh_args` does not force `IdentityFile` (which would override agent):

```ini
[ssh_connection]
ssh_args = -o StrictHostKeyChecking=accept-new -o ForwardAgent=no
```

### 5.4 Verification

**SUPPLY-07**: After the change, verify the compile step succeeds without signing secrets in scope:
```bash
# In CI: check that build logs for the compile step show no TAURI_SIGNING_PRIVATE_KEY references
grep "TAURI_SIGNING" <(gh run view <run-id> --log) | grep "Compile step" && echo "KEY LEAKED IN COMPILE" || echo "PASS"
```

**SUPPLY-08**: Verify `certificate.p12` is never present on disk:
```bash
# In CI post-build step:
ls certificate.p12 2>/dev/null && echo "CERT FILE EXISTS — FAIL" || echo "No cert file on disk — PASS"
```

**SUPPLY-09**: Verify no SSH key file on disk:
```bash
ls ~/.ssh/llamenos_demo_deploy 2>/dev/null && echo "KEY FILE EXISTS — FAIL" || echo "No key file on disk — PASS"
```

**Rollback**: Revert file edits in `.github/workflows/`. No infrastructure state is affected.

---

## Execution Order & Branching

All phases target `fix/epic-f-supply-chain` (single branch). Merge sequence:

```
main
  └── fix/epic-f-supply-chain
        Phase 1 commit: digest pinning + script
        Phase 2 commit: Watchtower socket proxy
        Phase 3 commit: build determinism
        Phase 4 commit: CI permissions deny-all
        Phase 5 commit: secret handling
```

Each phase can be reviewed independently as a commit. If a phase blocks on external info (e.g., obtaining a digest requires a live Docker pull), it can be PR'd separately or the digest placeholder can be committed as a TODO with a follow-up issue.

---

## Definition of Done

- [ ] `scripts/update-image-digests.sh` exists and runs cleanly
- [ ] All images in `docker-compose.dev.yml`, `docker-compose.yml`, `docker-compose.production.yml` have `@sha256:` pins
- [ ] `docker-socket-proxy` service added to production compose; Watchtower has no direct `docker.sock` mount
- [ ] `docker compose config --quiet` validates for all compose files
- [ ] `sip-bridge/Dockerfile` has no `|| bun install` fallback
- [ ] `Dockerfile.nodejs` installs Bun from pinned version with SHA-256 checksum
- [ ] `signal-notifier/Dockerfile` uses pinned digest and `--frozen-lockfile`
- [ ] All 14 workflows have top-level `permissions: {}` deny-all
- [ ] Tauri signing key is only in scope for the signing step, not the full compile
- [ ] Apple cert never written to disk as a file (or removed within same step with no subsequent steps that could read it)
- [ ] Demo SSH key loaded via `ssh-agent`, not written to `~/.ssh/`
- [ ] CI passes green after all changes
