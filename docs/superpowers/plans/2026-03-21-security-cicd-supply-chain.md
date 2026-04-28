# CI/CD & Supply Chain Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 11 open security findings in GitHub Actions workflows, Docker images, and deployment configuration — eliminating shell injection, unpinned supply chain dependencies, and misconfigured secrets. (1 finding already fixed — see audit note below.)

**Architecture:** All changes are surgical — no architectural redesign. Workflow files get env-var indirection and per-job permission scoping. Docker files get SHA-256 digest pins. Configuration files get required-secret enforcement and audit tooling hardening.

**Tech Stack:** GitHub Actions YAML, Docker, Bun, Cargo, Helm, Ansible

> **Codebase audit 2026-03-21:** The following findings are **already fixed** in the current codebase and their plan tasks should be **skipped**:
> - **CRIT-CI1** (Task 1): `tauri-release.yml` already captures `github.event.inputs.version` into a shell variable before any use — shell injection vector closed.
> - **MED-CI3** (Task 8 Step 4): `ci.yml` already uses `bun audit --audit-level=high` directly — no two-tier fallback remains.

---

## File Map

| File | Changes |
|------|---------|
| `.github/workflows/tauri-release.yml` | ~~CRIT-CI1 (shell injection fix)~~ ✅ already fixed, HIGH-CI5 (per-job permissions) |
| `.github/workflows/mobile-release.yml` | HIGH-CI1 (cargo-ndk --locked), HIGH-CI5 (per-job permissions) |
| `.github/workflows/load-test.yml` | HIGH-CI4 (bun install --frozen-lockfile) |
| `.github/workflows/ci.yml` | HIGH-CI6 (RustFS digest + macOS checksum), ~~MED-CI3 (bun audit level)~~ ✅ already fixed |
| `deploy/docker/Dockerfile` | CRIT-CI2 (digest-pin both FROM stages) |
| `.github/dependabot.yml` | CRIT-CI2 (add Docker ecosystem) |
| `deploy/docker/docker-compose.yml` | HIGH-CI2 (strfry digest), HIGH-CI3 (whisper digest), MED-CI1 (GlitchTip :? syntax) |
| `deploy/helm/llamenos/values.yaml` | HIGH-CI2 (strfry tag fix), HIGH-CI3 (whisper digest) |
| `deploy/ansible/vars.example.yml` | MED-CI2 (pin all image references) |
| `lefthook.yml` | HIGH-CI7 (pre-commit block on .env files) |
| `CONTRIBUTING.md` | HIGH-CI7 (document .env policy) |

---

## Task 1: CRIT-CI1 — Fix shell injection in `tauri-release.yml`

> **✅ ALREADY FIXED** — Verified 2026-03-21: `tauri-release.yml` already captures `github.event.inputs.version` into `VERSION="${{ github.event.inputs.version }}"` before any shell use. **Skip this task.** Continue to Task 2.

**Files:**
- Modify: `.github/workflows/tauri-release.yml`

**Background**: The workflow input `github.event.inputs.version` is interpolated directly into shell script bodies. GitHub Actions expands `${{ ... }}` expressions at YAML parse time — before the shell interpreter runs — so an attacker with `write` access can inject arbitrary shell syntax. The fix captures the input as an env variable and validates it with a strict semver regex before any use.

- [ ] **Step 1: Read the current version-handling section**

```bash
grep -n 'version\|VERSION\|INPUT_VERSION' .github/workflows/tauri-release.yml | head -40
```

Identify the workflow-level `inputs:` block, any existing env blocks, and every `run:` step that uses the version value. The main concern is the Node.js heredoc blocks that interpolate `'${VERSION}'` as a JavaScript string literal.

- [ ] **Step 2: Add workflow-level env capture**

At the top of `tauri-release.yml`, immediately after the `on:` block and before `jobs:`, add or extend the top-level `env:` block:

```yaml
env:
  INPUT_VERSION: ${{ github.event.inputs.version }}
```

This captures the user-controlled string once, as a shell variable, before any script sees it.

- [ ] **Step 3: Add semver validation as the first step of the release job**

In the `release` job (before any file-mutation step), add:

```yaml
- name: Validate version format
  env:
    VERSION: ${{ env.INPUT_VERSION }}
  run: |
    if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
      if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        echo "Invalid version format: $VERSION"
        exit 1
      fi
    fi
```

Note: `${{ github.event_name }}` in the `run:` block is safe — it is not user-controlled input (workflow triggers are an enum value set by GitHub, not by the dispatch caller). Only `${{ github.event.inputs.* }}` expressions are user-controlled and require env-var indirection.

- [ ] **Step 4: Fix the `tauri.conf.json` mutation step**

Find the Node.js step that mutates `apps/desktop/tauri.conf.json`. Replace any `'${VERSION}'` string interpolation with env-var usage:

```yaml
- name: Bump tauri.conf.json version
  env:
    RELEASE_VERSION: ${{ env.INPUT_VERSION }}
  run: |
    node -e "
      const fs = require('fs');
      const v = process.env.RELEASE_VERSION;
      const conf = JSON.parse(fs.readFileSync('apps/desktop/tauri.conf.json', 'utf-8'));
      conf.version = v;
      fs.writeFileSync('apps/desktop/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
    "
```

- [ ] **Step 5: Fix the `package.json` mutation step**

Find the Node.js step that mutates `package.json`. Apply the same pattern:

```yaml
- name: Bump package.json version
  env:
    RELEASE_VERSION: ${{ env.INPUT_VERSION }}
  run: |
    node -e "
      const fs = require('fs');
      const v = process.env.RELEASE_VERSION;
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      pkg.version = v;
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
```

- [ ] **Step 6: Fix the "Determine version" output step (line ~238)**

The `Determine version` step at line ~237-242 writes the version to `GITHUB_OUTPUT` using direct interpolation. Replace it:

```yaml
# Before (lines ~237-242):
- name: Determine version
  id: version
  run: |
    if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
      echo "version=${{ github.event.inputs.version }}" >> "$GITHUB_OUTPUT"
    else
      VERSION="${GITHUB_REF_NAME#v}"
      echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
    fi

# After:
- name: Determine version
  id: version
  env:
    INPUT_VER: ${{ env.INPUT_VERSION }}
  run: |
    if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
      echo "version=${INPUT_VER}" >> "$GITHUB_OUTPUT"
    else
      VERSION="${GITHUB_REF_NAME#v}"
      echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
    fi
```

Then check for any remaining direct interpolations:

```bash
grep -n 'github.event.inputs.version' .github/workflows/tauri-release.yml
```

- [ ] **Step 7: Verify no direct interpolation remains**

```bash
grep -n 'github.event.inputs.version' .github/workflows/tauri-release.yml
```

Expected: zero results.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/tauri-release.yml
git commit -m "fix(ci): prevent shell injection via workflow_dispatch version input

Capture github.event.inputs.version through env block (INPUT_VERSION)
and validate with semver regex before any use. Replace JS string
interpolation in Node.js heredocs with process.env.RELEASE_VERSION.

Closes CRIT-CI1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: CRIT-CI2 — Pin Dockerfile base images to SHA-256 digest

**Files:**
- Modify: `deploy/docker/Dockerfile`
- Modify: `.github/dependabot.yml`

**Background**: `FROM oven/bun:1` and `FROM oven/bun:1-slim` use mutable tags. `Dockerfile.build` already uses the correct digest-pinned pattern. This task pins the production Dockerfile to match.

- [ ] **Step 1: Pull the images and record their digests**

Run this locally (requires Docker):

```bash
docker pull oven/bun:1
docker inspect --format='{{index .RepoDigests 0}}' oven/bun:1
# e.g.: oven/bun@sha256:abc123...

docker pull oven/bun:1-slim
docker inspect --format='{{index .RepoDigests 0}}' oven/bun:1-slim
# e.g.: oven/bun@sha256:def456...
```

Copy the full digest strings (they look like `sha256:64hexchars`).

- [ ] **Step 2: Read the current Dockerfile**

```bash
head -25 deploy/docker/Dockerfile
```

Identify lines 10 and 18 (the two `FROM` statements). Also read `Dockerfile.build` to see the pinning style already in use:

```bash
head -5 Dockerfile.build
```

- [ ] **Step 3: Update both FROM stages with digest pins**

Edit `deploy/docker/Dockerfile` lines 10 and 18:

```dockerfile
# Before:
FROM oven/bun:1 AS deps
# ...
FROM oven/bun:1-slim

# After (use the digests recorded in Step 1):
FROM oven/bun:1@sha256:<digest-from-step-1> AS deps
# oven/bun:1 pinned YYYY-MM-DD — update via Dependabot or on new minor release
FROM oven/bun:1-slim@sha256:<digest-from-step-1-slim>
# oven/bun:1-slim pinned YYYY-MM-DD — update via Dependabot
```

- [ ] **Step 4: Add Docker ecosystem to `.github/dependabot.yml`**

Read the current file:

```bash
cat .github/dependabot.yml
```

Add a `docker` ecosystem entry after the existing entries:

```yaml
- package-ecosystem: "docker"
  directory: "/deploy/docker"
  schedule:
    interval: "weekly"
  groups:
    docker-base-images:
      patterns: ["*"]
```

- [ ] **Step 5: Verify Dockerfile builds**

```bash
docker build -f deploy/docker/Dockerfile -t llamenos-test:local . --no-cache 2>&1 | tail -5
```

Expected: `Successfully built` (or equivalent BuildKit output). If a digest mismatch error appears, the digest in Step 1 was recorded incorrectly — repeat Step 1.

- [ ] **Step 6: Commit**

```bash
git add deploy/docker/Dockerfile .github/dependabot.yml
git commit -m "fix(ci): pin production Dockerfile base images to SHA-256 digest

Add digest pins to both FROM stages matching the pattern used in
Dockerfile.build. Add Docker ecosystem to Dependabot for automated
digest rotation.

Closes CRIT-CI2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: HIGH-CI5 — Per-job permissions in both release workflows

**Files:**
- Modify: `.github/workflows/tauri-release.yml`
- Modify: `.github/workflows/mobile-release.yml`

**Background**: Both workflows declare `permissions: contents: write` at the workflow level, so every matrix job (macOS/Windows/Linux build jobs that have signing secrets) inherits write access. The fix scopes write access to the final publish-only job.

- [ ] **Step 1: Identify the job structure in `tauri-release.yml`**

```bash
grep -n '^  [a-z].*:$\|^jobs:' .github/workflows/tauri-release.yml
```

List all job names. Identify which jobs are build/matrix jobs and which is the final release/publish job.

- [ ] **Step 2: Remove top-level permissions from `tauri-release.yml`**

Find and delete the top-level `permissions:` block (lines 20-21). Then add `permissions: contents: read` to each build/matrix job, and `permissions: contents: write` to only the final release job:

```yaml
# Top of file — REMOVE this block entirely:
# permissions:
#   contents: write

# Add to each build job (e.g., build-macos, build-linux, build-windows):
jobs:
  build-macos:
    permissions:
      contents: read
    # ...

  # Add to the release/publish job only:
  release:
    permissions:
      contents: write
```

- [ ] **Step 3: Apply to `mobile-release.yml` — noting its different job structure**

```bash
grep -n '^  [a-z].*:$\|^permissions:\|^jobs:' .github/workflows/mobile-release.yml
```

`mobile-release.yml` has two jobs: `build-android` (which both builds AND uploads the release via `gh release upload`) and `build-ios` (which only builds). Unlike `tauri-release.yml`, there is no separate publish-only job. The resulting permission split is:

- Remove top-level `permissions: contents: write`
- `build-android` retains `contents: write` (it runs `gh release create` and `gh release upload` in its final steps — these require write access)
- `build-ios` gets `contents: read` (it only builds; no artifact uploads)

```yaml
# Remove from file top level:
# permissions:
#   contents: write

# Add to build-android job:
build-android:
  permissions:
    contents: write   # needed for gh release create/upload in this job

# Add to build-ios job:
build-ios:
  permissions:
    contents: read
```

This is a partial improvement: `build-ios` steps that handle signing secrets no longer have write access. `build-android` must retain write because build and publish are combined in one job — a future refactor could split these.

- [ ] **Step 4: Verify workflow YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tauri-release.yml'))" && echo "OK"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-release.yml'))" && echo "OK"
```

Expected: both print `OK`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/tauri-release.yml .github/workflows/mobile-release.yml
git commit -m "fix(ci): scope contents:write to publish jobs only in release workflows

Build matrix jobs now have contents:read, preventing a compromised
build step from writing to the repository.

Closes HIGH-CI5

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: HIGH-CI1 + HIGH-CI4 — Lockfile integrity fixes

**Files:**
- Modify: `.github/workflows/mobile-release.yml`
- Modify: `.github/workflows/load-test.yml`

These are one-line fixes each.

- [ ] **Step 1: Fix `cargo install cargo-ndk` in `mobile-release.yml`**

```bash
grep -n 'cargo install cargo-ndk' .github/workflows/mobile-release.yml
```

Change the matching line:

```yaml
# Before:
run: cargo install cargo-ndk

# After:
run: cargo install cargo-ndk --locked
```

- [ ] **Step 2: Fix `bun install` in `load-test.yml`**

```bash
grep -n 'bun install' .github/workflows/load-test.yml
```

Change line 59:

```yaml
# Before:
run: bun install

# After:
run: bun install --frozen-lockfile
```

- [ ] **Step 3: Verify both files are valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-release.yml'))" && echo "OK"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/load-test.yml'))" && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/mobile-release.yml .github/workflows/load-test.yml
git commit -m "fix(ci): add --locked/--frozen-lockfile to all install commands

cargo install cargo-ndk and bun install in load-test now use lockfile
enforcement, consistent with all other workflows.

Closes HIGH-CI1, HIGH-CI4

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: HIGH-CI2 + HIGH-CI3 — Pin strfry and Whisper images to digest

**Files:**
- Modify: `deploy/docker/docker-compose.yml`
- Modify: `deploy/helm/llamenos/values.yaml`

**Background**: Two community images (`dockurr/strfry:1.0.1` and `fedirz/faster-whisper-server:0.4.1`) are tag-only in docker-compose. The Helm values.yaml uses `tag: "latest"` for strfry and `tag: "0.4.1"` without digest for Whisper.

**⚠️ Before running**: Verify the publisher of `dockurr/strfry` is a trusted community repackage. Run the following before pinning:

```bash
# Inspect the entrypoint and compare with the official hoytech/strfry project
docker pull dockurr/strfry:1.0.1
docker inspect dockurr/strfry:1.0.1 --format '{{json .Config.Entrypoint}}'
# Expected: something like ["/usr/local/bin/strfry", "relay"]

docker pull hoytech/strfry  # official upstream
docker inspect hoytech/strfry --format '{{json .Config.Entrypoint}}'
# Compare: both should use the same strfry binary

# Also verify image layers / size are plausible
docker inspect dockurr/strfry:1.0.1 --format '{{.Size}}'
```

If the entrypoints match and the image size is plausible, proceed with pinning. If anything looks suspicious, flag it and consider building from the `hoytech/strfry` source Dockerfile and hosting at `ghcr.io/llamenos/strfry`.

- [ ] **Step 1: Pull strfry and record its digest**

```bash
docker pull dockurr/strfry:1.0.1
docker inspect --format='{{index .RepoDigests 0}}' dockurr/strfry:1.0.1
# Records: dockurr/strfry@sha256:<digest>
```

- [ ] **Step 2: Pull Whisper and record its digest**

```bash
docker pull fedirz/faster-whisper-server:0.4.1
docker inspect --format='{{index .RepoDigests 0}}' fedirz/faster-whisper-server:0.4.1
# Records: fedirz/faster-whisper-server@sha256:<digest>
```

- [ ] **Step 3: Find strfry and Whisper in `docker-compose.yml`**

```bash
grep -n 'strfry\|whisper\|dockurr\|fedirz' deploy/docker/docker-compose.yml
```

Lines ~147 (strfry) and ~167 (Whisper).

- [ ] **Step 4: Update docker-compose.yml with digest pins**

```yaml
# strfry (line ~147):
# Before:
image: dockurr/strfry:1.0.1
# After:
image: dockurr/strfry:1.0.1@sha256:<digest-from-step-1>
# dockurr/strfry:1.0.1 pinned YYYY-MM-DD

# Whisper (line ~167):
# Before:
image: fedirz/faster-whisper-server:0.4.1
# After:
image: fedirz/faster-whisper-server:0.4.1@sha256:<digest-from-step-2>
# fedirz/faster-whisper-server:0.4.1 pinned YYYY-MM-DD
```

- [ ] **Step 5: Find and fix strfry in `values.yaml`**

```bash
grep -n 'strfry\|dockurr\|latest' deploy/helm/llamenos/values.yaml
```

Line ~88. The current value is `tag: "latest"` — this is the highest-risk entry.

```yaml
# Before:
nostr:
  image:
    repository: dockurr/strfry
    tag: "latest"

# After:
nostr:
  image:
    repository: dockurr/strfry
    tag: "1.0.1@sha256:<same-digest-from-step-1>"
```

- [ ] **Step 6: Find and fix Whisper in `values.yaml`**

```bash
grep -n 'whisper\|fedirz\|faster' deploy/helm/llamenos/values.yaml
```

Line ~56.

```yaml
# Before:
whisper:
  image:
    repository: fedirz/faster-whisper-server
    tag: "0.4.1"   # TODO: pin to digest when available

# After:
whisper:
  image:
    repository: fedirz/faster-whisper-server
    tag: "0.4.1@sha256:<digest-from-step-2>"
```

Remove the `# TODO` comment.

- [ ] **Step 7: Verify docker-compose config is valid**

```bash
docker compose -f deploy/docker/docker-compose.yml config --quiet && echo "OK"
```

Expected: `OK` (no YAML errors).

- [ ] **Step 8: Commit**

```bash
git add deploy/docker/docker-compose.yml deploy/helm/llamenos/values.yaml
git commit -m "fix(ci): pin strfry and whisper images to SHA-256 digest in compose and Helm

Both docker-compose.yml and values.yaml now reference verified digests.
Fixes the values.yaml strfry entry from 'latest' to versioned+digest.

Closes HIGH-CI2, HIGH-CI3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: HIGH-CI6 — RustFS digest in Linux CI and checksum in macOS CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Background**: Two separate CI paths set up RustFS:
1. **Linux job** (~line 304): Uses `docker run rustfs/rustfs:RELEASE.2025-01-20T14-49-07Z` without a digest pin.
2. **macOS job** (~line 569): Downloads a RustFS binary via `curl` with no SHA-256 verification before `chmod +x`.

- [ ] **Step 1: Fix the Linux CI RustFS Docker path**

```bash
grep -n 'rustfs/rustfs\|MINIO' .github/workflows/ci.yml | head -20
```

Locate the `docker run rustfs/rustfs:RELEASE.2025-01-20T14-49-07Z` command (Linux job). Check `deploy/docker/docker-compose.yml` for the already-pinned digest:

```bash
grep 'rustfs.*sha256' deploy/docker/docker-compose.yml
```

Use that same digest in `ci.yml`. The docker run command should become:

```yaml
run: |
  docker run -d --name rustfs \
    -p 9000:9000 \
    -e MINIO_ROOT_USER=testaccess \
    -e MINIO_ROOT_PASSWORD=testsecret123456 \
    rustfs/rustfs:RELEASE.2025-01-20T14-49-07Z@sha256:ed9be66eb5f2636c18289c34c3b725ddf57815f2777c77b5938543b78a44f144 server /data
```

(Verify this digest matches what's in docker-compose.yml.)

- [ ] **Step 2: Get the SHA-256 of the macOS RustFS binary**

**Run this locally on an arm64 Mac** (or note that the CI runner is `darwin-arm64`):

```bash
MINIO_VERSION="RELEASE.2025-01-20T14-49-07Z"
curl -sSfL "https://dl.min.io/server/rustfs/release/darwin-arm64/archive/rustfs.${MINIO_VERSION}" -o /tmp/rustfs-arm64
shasum -a 256 /tmp/rustfs-arm64
# Record the output: <hash>  /tmp/rustfs-arm64
```

Copy the 64-character hex hash. This gets hardcoded into the workflow.

- [ ] **Step 3: Fix the macOS CI RustFS curl path**

Find the macOS job's RustFS setup in `ci.yml` (~line 569):

```bash
grep -n 'curl.*rustfs\|chmod.*rustfs' .github/workflows/ci.yml
```

Replace the unsafe download pattern:

```yaml
# Before (approx lines 569-573):
- name: Install RustFS
  run: |
    curl -sSfL https://dl.min.io/server/rustfs/release/darwin-arm64/rustfs -o /tmp/rustfs
    chmod +x /tmp/rustfs

# After:
- name: Install RustFS
  env:
    MINIO_VERSION: "RELEASE.2025-01-20T14-49-07Z"
    MINIO_SHA256: "<hash-recorded-in-step-2>"
  run: |
    curl -sSfL \
      "https://dl.min.io/server/rustfs/release/darwin-arm64/archive/rustfs.${MINIO_VERSION}" \
      -o /tmp/rustfs
    echo "${MINIO_SHA256}  /tmp/rustfs" | shasum -a 256 -c -
    chmod +x /tmp/rustfs
```

- [ ] **Step 4: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "fix(ci): pin RustFS to digest in Linux CI and verify checksum in macOS CI

Linux CI docker run now uses the same SHA-256 digest as docker-compose.yml.
macOS CI curl download now verifies SHA-256 before chmod +x, matching
the pattern used for git-cliff in the same workflow.

Closes HIGH-CI6

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: HIGH-CI7 — Pre-commit hook and documentation for `.env` files

**Files:**
- Modify: `lefthook.yml`
- Modify: `CONTRIBUTING.md`

**Background**: The `.env` files in `deploy/docker/` have been confirmed as test placeholders (sequential hex, confirmed by investigation). `.gitignore` covers them but there is no active pre-commit enforcement.

- [ ] **Step 1: Check git history for any committed secrets**

Use the pickaxe search to check whether any real secret values appear in git history:

```bash
git log --all -S "f28438990f" --source --all
```

`f28438990f` is the specific sentinel value from the `.env` files (beginning of the sequential hex pattern). If this search returns commits showing high-entropy values that don't look like test placeholders (sequential or obvious patterns), stop and rotate those secrets before proceeding. The investigation confirmed these are test placeholders, but verify against the actual git history.

Also check the full file history for any `.env` files that were staged:

```bash
git log --all --full-history -- 'deploy/docker/.env*' | head -20
```

- [ ] **Step 2: Read `lefthook.yml` to understand existing hooks**

```bash
cat lefthook.yml
```

Identify the current pre-commit hook structure (it runs `typecheck` and `codegen-freshness`).

- [ ] **Step 3: Add `.env` staging protection to `lefthook.yml`**

Add a new pre-commit command to block staging of `deploy/docker/.env*` files:

```yaml
# In the pre-commit section, add:
pre-commit:
  commands:
    # ... existing commands ...
    block-env-files:
      run: |
        staged=$(git diff --cached --name-only | grep -E 'deploy/docker/\.env' || true)
        if [ -n "$staged" ]; then
          echo "ERROR: Refusing to commit deploy/docker/.env files."
          echo "These files contain secrets. Provision via orchestration layer instead."
          echo "Staged: $staged"
          exit 1
        fi
```

- [ ] **Step 4: Test the hook locally**

```bash
# Attempt to stage a .env file and see if the hook blocks it
touch deploy/docker/.env.test-hook
git add deploy/docker/.env.test-hook
git stash  # clean up
```

If lefthook is installed (`lefthook run pre-commit`), run it and confirm the block fires. Then remove the test file.

- [ ] **Step 5: Add `.env` policy documentation to `CONTRIBUTING.md`**

Find or create a "Secrets and Environment" section in `CONTRIBUTING.md`. Add:

```markdown
## Secrets and Environment Variables

**Never commit `.env` files** from `deploy/docker/`. These files may contain secrets
or appear to contain secrets (even test placeholders). Git history is permanent.

Operators provision secrets via their orchestration layer:
- **Ansible**: use Ansible Vault for sensitive vars
- **Docker Compose**: set env vars in the shell or via secrets management (not `.env` in git)
- **Helm/Kubernetes**: use Helm secrets or Kubernetes Secrets objects

The `deploy/docker/.env*` paths are `.gitignore`d. A pre-commit hook in `lefthook.yml`
also blocks staging them as a safety net.
```

- [ ] **Step 6: Commit**

```bash
git add lefthook.yml CONTRIBUTING.md
git commit -m "fix(ci): add pre-commit hook blocking .env commits + document policy

lefthook now blocks git add of deploy/docker/.env* files.
CONTRIBUTING.md documents the secrets provisioning policy.

Closes HIGH-CI7

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: MED-CI1 + MED-CI2 + MED-CI3 — Configuration hardening

**Files:**
- Modify: `deploy/docker/docker-compose.yml`
- Modify: `deploy/ansible/vars.example.yml`
- Modify: `.github/workflows/ci.yml`

These are configuration hardening fixes. No unit tests apply — verification is done by reading the changed config.

- [ ] **Step 1: Fix GlitchTip `SECRET_KEY` fallback in `docker-compose.yml`**

```bash
grep -n 'SECRET_KEY\|GLITCHTIP' deploy/docker/docker-compose.yml
```

Expected: two occurrences (lines ~227 and ~256, one for `glitchtip`, one for `glitchtip-worker`). Change both from `:-` (silent default) to `:?` (fail-loud):

```yaml
# Before (at both occurrences):
- SECRET_KEY=${GLITCHTIP_SECRET_KEY:-change-me-to-a-random-string}

# After:
- SECRET_KEY=${GLITCHTIP_SECRET_KEY:?GLITCHTIP_SECRET_KEY is required — set to a 64-char random hex value (openssl rand -hex 32)}
```

- [ ] **Step 2: Verify docker-compose config reads the change**

```bash
docker compose -f deploy/docker/docker-compose.yml config 2>&1 | grep -A2 'SECRET_KEY'
```

Expected: the `:?` syntax appears in the output. If `GLITCHTIP_SECRET_KEY` is not set in your shell, `docker compose config` should error — that is the correct behavior after this change.

- [ ] **Step 3: Pin all images in `vars.example.yml`**

```bash
cat deploy/ansible/vars.example.yml
```

Find lines 53-57. Update all image references to use the same specific tags (and digests) used in `docker-compose.yml`:

```yaml
# Add a comment at the top of the vars file (or near the image section):
# Image digests must be re-verified when updating tags.
# Use: docker inspect --format='{{index .RepoDigests 0}}' <image>:<tag>

# Replace the existing (unpinned) values:
llamenos_app_image: ghcr.io/llamenos/llamenos:0.1.0  # Update on each release
llamenos_postgres_image: postgres:17-alpine@sha256:<digest>  # From docker-compose.yml
llamenos_caddy_image: caddy:2.9-alpine@sha256:<digest>       # From docker-compose.yml
llamenos_strfry_image: dockurr/strfry:1.0.1@sha256:<digest>  # From docker-compose.yml
llamenos_whisper_image: fedirz/faster-whisper-server:0.4.1@sha256:<digest>  # From docker-compose.yml
```

Get the postgres and caddy digests from `docker-compose.yml`:

```bash
grep -E 'postgres|caddy' deploy/docker/docker-compose.yml | grep sha256
```

- [x] **Step 4: Fix `bun audit` in `ci.yml`** — **✅ ALREADY FIXED**

  `ci.yml` already uses `bun audit --audit-level=high` directly. No two-tier fallback remains. Skip this step.

- [ ] **Step 5: Validate all YAML files**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "ci.yml OK"
python3 -c "import yaml; yaml.safe_load(open('deploy/docker/docker-compose.yml'))" && echo "docker-compose OK"
```

- [ ] **Step 6: Commit**

```bash
git add deploy/docker/docker-compose.yml deploy/ansible/vars.example.yml .github/workflows/ci.yml
git commit -m "fix(ci): configuration hardening — secrets, image pins, audit level

- GlitchTip SECRET_KEY uses :? syntax (fail-loud on missing var)
- Ansible vars.example.yml pins all images to versions+digests
- bun audit now fails on HIGH severity (not just CRITICAL)

Closes MED-CI1, MED-CI2, MED-CI3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] Run the verification checklist from the spec:

```bash
# No direct interpolation remains:
grep -r 'github.event.inputs.version' .github/workflows/tauri-release.yml
# Expected: 0 results

# All FROM stages in Dockerfile have sha256:
grep '^FROM' deploy/docker/Dockerfile | grep -v sha256
# Expected: 0 results (all FROM lines should have digests)

# Both strfry entries have sha256:
grep 'strfry' deploy/docker/docker-compose.yml deploy/helm/llamenos/values.yaml | grep -v sha256
# Expected: 0 results

# cargo-ndk uses --locked:
grep 'cargo install cargo-ndk' .github/workflows/mobile-release.yml
# Expected: matches, output contains --locked

# bun install in load-test uses --frozen-lockfile:
grep 'bun install' .github/workflows/load-test.yml
# Expected: --frozen-lockfile present

# GlitchTip uses :? not :-:
grep 'GLITCHTIP_SECRET_KEY' deploy/docker/docker-compose.yml
# Expected: both lines show :? syntax
```

- [ ] **Final commit if any cleanup needed**, then open PR targeting `main`
