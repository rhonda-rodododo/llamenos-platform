# `/release` Offline Signing Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date**: 2026-04-30
**Spec**: `docs/superpowers/specs/2026-04-30-desktop-distribution-design.md`
**Estimated Effort**: 1-2 days

**Goal:** Create a `/release` Claude Code skill that walks the operator through the offline signing and release workflow — fetching CI-built staging artifacts from RustFS (MinIO S3-compatible), verifying reproducibility, signing with minisign, promoting to the release bucket, generating the Tauri updater manifest, committing to the audit repo, and verifying the live endpoint.

**Architecture:** A skill at `.claude/skills/release-signing/SKILL.md` with helper scripts in `scripts/release/`. The skill enforces strict gating — each step must succeed before the next begins. The operator's minisign private key stays offline (USB/air-gapped). RustFS is the S3-compatible blob store (MinIO) already used by the project.

**Tech Stack:** Markdown (skill), Bash (helper scripts), existing TypeScript manifest generator

**Working directory:** Project root

---

### Task 1: Create the `/release` Skill File

**Files:**
- Create: `.claude/skills/release-signing/SKILL.md`

- [ ] **Step 1: Create the skill directory and SKILL.md**

```bash
mkdir -p .claude/skills/release-signing
```

Create `.claude/skills/release-signing/SKILL.md`:

```markdown
---
name: release-signing
description: Use when cutting a release, signing desktop artifacts, promoting builds to production, uploading to RustFS, generating Tauri updater manifests, or when the user says "/release", "sign release", "promote build", "cut a release", or "publish desktop". Walks through the complete offline signing workflow with strict verification gates.
argument-hint: [version]
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion]
---

# Offline Signing & Release Workflow

This skill guides you through the complete desktop release signing workflow.
Every step is gated — **refuse to proceed if any verification fails**.

## Prerequisites

Before starting, verify these tools are installed:

```bash
# Required
command -v minisign || { echo "FATAL: minisign not installed. Install: apt install minisign / brew install minisign"; exit 1; }
command -v aws || { echo "FATAL: aws CLI not installed. Install: apt install awscli / brew install awscli"; exit 1; }
command -v jq || { echo "FATAL: jq not installed."; exit 1; }
command -v sha256sum || { echo "FATAL: sha256sum not installed."; exit 1; }
```

Also verify:
- `RUSTFS_ENDPOINT`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `RUSTFS_BUCKET` are set (or in `~/.llamenos-release.env`)
- The minisign private key is accessible (typically on a USB drive, e.g., `/media/operator/SIGNING_KEY/llamenos-release.key`)
- The `llamenos-releases` audit repo is cloned locally

## Arguments

The user may pass a version: `$ARGUMENTS`

If no version argument, ask the user:
> What version are you releasing? (e.g., 0.19.0)

Store as `VERSION` for all subsequent steps.

## Step 1: Fetch Staging Artifacts from RustFS

**Gate:** Artifacts must exist in the staging bucket.

```bash
# Source credentials if env file exists
[ -f ~/.llamenos-release.env ] && source ~/.llamenos-release.env

# List staging artifacts for this version
aws s3 ls "s3://${RUSTFS_BUCKET}/staging/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --no-sign-request=false

# Download all staging artifacts to a local work directory
RELEASE_WORK="${TMPDIR:-/tmp}/llamenos-release-v${VERSION}"
mkdir -p "${RELEASE_WORK}"
aws s3 cp "s3://${RUSTFS_BUCKET}/staging/v${VERSION}/" "${RELEASE_WORK}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --recursive
```

**Verification gate:** Count downloaded files. Expect at minimum:
- `*.app.tar.gz` (macOS)
- `*.AppImage` (Linux)
- `*.nsis.zip` (Windows)
- `*.deb` (Linux)
- `*.flatpak` (Linux)
- `CHECKSUMS.txt`
- `*.sig` files (Tauri updater signatures from CI)

If fewer than 6 artifacts are present, **STOP** and report what's missing.

Show the user: file listing with sizes, and ask for confirmation before proceeding.

## Step 2: Verify Reproducible Build

**Gate:** `verify-build.sh` must exit 0.

```bash
# Run the existing reproducible build verifier against the version tag
./scripts/verify-build.sh "v${VERSION}"
```

This script (at `scripts/verify-build.sh`) will:
1. Download release artifacts from GitHub Releases
2. Verify cosign signatures (if cosign is installed)
3. Verify SBOM attestation
4. Verify SLSA provenance
5. Clone source at the tag, rebuild in Docker, compare checksums

**If `verify-build.sh` exits non-zero, STOP IMMEDIATELY.** Report the failure output to the operator. Do NOT proceed to signing.

**If cosign is not installed**, warn the operator but allow proceeding — the Docker reproducible build comparison is the primary trust anchor.

Ask the operator to confirm they've reviewed the verification output before proceeding.

## Step 3: Sign Artifacts with minisign

**Gate:** Every artifact must be signed. The operator must provide the key path.

Ask the operator:
> Where is your minisign private key? (e.g., /media/operator/SIGNING_KEY/llamenos-release.key)

Store as `MINISIGN_KEY`.

```bash
cd "${RELEASE_WORK}"

# Sign each release artifact (not .sig files from CI — those are Tauri updater sigs)
for artifact in *.app.tar.gz *.AppImage *.nsis.zip *.deb *.flatpak *.dmg; do
  [ -f "$artifact" ] || continue
  echo "Signing: ${artifact}"
  minisign -S -s "${MINISIGN_KEY}" -m "${artifact}" \
    -t "llamenos v${VERSION} — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  Created: ${artifact}.minisig"
done

# Also sign CHECKSUMS.txt
minisign -S -s "${MINISIGN_KEY}" -m CHECKSUMS.txt \
  -t "llamenos v${VERSION} checksums — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Signed CHECKSUMS.txt"
```

**Verification gate:** For each signed artifact, verify the signature:

```bash
# Read the public key from tauri.conf.json (base64-encoded minisign pubkey)
PUBKEY_B64=$(jq -r '.plugins.updater.pubkey' apps/desktop/tauri.conf.json)
# Decode it — it's a minisign public key in the standard format
echo "${PUBKEY_B64}" | base64 -d > "${RELEASE_WORK}/llamenos-release.pub"

# Verify every .minisig
VERIFY_FAILED=0
for sig in "${RELEASE_WORK}"/*.minisig; do
  artifact="${sig%.minisig}"
  if minisign -V -p "${RELEASE_WORK}/llamenos-release.pub" -m "${artifact}"; then
    echo "  VERIFIED: $(basename "${artifact}")"
  else
    echo "  FAILED: $(basename "${artifact}")"
    VERIFY_FAILED=1
  fi
done

if [ "$VERIFY_FAILED" -ne 0 ]; then
  echo "FATAL: One or more signatures failed verification. Aborting."
  exit 1
fi
echo "All signatures verified."
```

**If ANY signature verification fails, STOP.** Report the specific file that failed.

### Windows Authenticode (Optional)

If the operator has a Windows EV code signing certificate on a YubiKey:

```bash
# Only if osslsigncode is available and the operator confirms they have an EV cert
if command -v osslsigncode &>/dev/null; then
  echo "Windows Authenticode signing available."
  # Ask operator if they want to Authenticode-sign the Windows installer
  # osslsigncode sign -pkcs11engine /usr/lib/engines-3/pkcs11.so \
  #   -pkcs11module /usr/lib/libykcs11.so \
  #   -n "Llamenos Hotline" -t http://timestamp.digicert.com \
  #   -in "${RELEASE_WORK}/llamenos_${VERSION}_x64-setup.nsis.zip" \
  #   -out "${RELEASE_WORK}/llamenos_${VERSION}_x64-setup-signed.nsis.zip"
fi
```

Ask the operator if they want to perform Authenticode signing. If they decline, note it and proceed.

## Step 4: Promote to Release Bucket

**Gate:** All signatures verified in Step 3.

```bash
# Upload signed artifacts + .minisig files to the release path
aws s3 cp "${RELEASE_WORK}/" "s3://${RUSTFS_BUCKET}/releases/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --recursive \
  --exclude "*.pub" \
  --exclude ".DS_Store"

echo "Uploaded to s3://${RUSTFS_BUCKET}/releases/v${VERSION}/"

# List what was uploaded for operator confirmation
aws s3 ls "s3://${RUSTFS_BUCKET}/releases/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}"
```

Show the uploaded file listing to the operator and confirm.

## Step 5: Generate Tauri Updater Manifest

**Gate:** Release artifacts uploaded.

Use the existing `scripts/generate-update-manifest.ts` to generate `latest.json`:

```bash
# Generate latest.json using the TypeScript manifest generator
# It reads .sig files (Tauri updater signatures) from the artifacts directory
bun run scripts/generate-update-manifest.ts \
  --version "${VERSION}" \
  --notes "Desktop v${VERSION}" \
  --output "${RELEASE_WORK}/latest.json" \
  --sig-dir "${RELEASE_WORK}" \
  --url-base "https://updates.llamenos.org/desktop/releases/v${VERSION}"
```

**Verification gate:** Validate the generated manifest:

```bash
# Validate latest.json structure
jq -e '.version' "${RELEASE_WORK}/latest.json" > /dev/null
jq -e '.platforms["darwin-aarch64"].signature' "${RELEASE_WORK}/latest.json" > /dev/null
jq -e '.platforms["linux-x86_64"].signature' "${RELEASE_WORK}/latest.json" > /dev/null

# Check version matches
MANIFEST_VERSION=$(jq -r '.version' "${RELEASE_WORK}/latest.json")
if [ "${MANIFEST_VERSION}" != "${VERSION}" ]; then
  echo "FATAL: Manifest version '${MANIFEST_VERSION}' != expected '${VERSION}'"
  exit 1
fi

# Check that all platform signatures are non-empty
for platform in darwin-aarch64 darwin-x86_64 linux-x86_64 windows-x86_64; do
  SIG=$(jq -r ".platforms[\"${platform}\"].signature // empty" "${RELEASE_WORK}/latest.json")
  if [ -z "$SIG" ]; then
    echo "WARNING: No signature for ${platform} in latest.json"
  else
    echo "  ${platform}: signature present (${#SIG} chars)"
  fi
done

echo "Manifest validation passed."
cat "${RELEASE_WORK}/latest.json"
```

**If version mismatch or no platform entries, STOP.**

Upload the manifest:

```bash
# Upload latest.json to the release-specific path AND the canonical updater path
aws s3 cp "${RELEASE_WORK}/latest.json" \
  "s3://${RUSTFS_BUCKET}/releases/v${VERSION}/latest.json" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --content-type "application/json"

aws s3 cp "${RELEASE_WORK}/latest.json" \
  "s3://${RUSTFS_BUCKET}/releases/latest.json" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --content-type "application/json"

echo "latest.json uploaded to both release-specific and canonical paths."
```

## Step 6: Commit to Audit Repository

**Gate:** Manifest uploaded.

Ask the operator:
> Where is your local clone of the `llamenos-releases` audit repo? (e.g., ~/projects/llamenos-releases)

Store as `AUDIT_REPO`.

```bash
cd "${AUDIT_REPO}"
git pull --ff-only origin main

# Create version directory
mkdir -p "v${VERSION}"

# Copy checksums, signatures, and manifest
cp "${RELEASE_WORK}/CHECKSUMS.txt" "v${VERSION}/"
cp "${RELEASE_WORK}/CHECKSUMS.txt.minisig" "v${VERSION}/"
cp "${RELEASE_WORK}/latest.json" "v${VERSION}/"
cp "${RELEASE_WORK}"/*.minisig "v${VERSION}/"

# Generate a release summary
cat > "v${VERSION}/RELEASE.md" << RELEASE_EOF
# Llamenos v${VERSION}

**Released:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Signed by:** $(minisign -V -p "${RELEASE_WORK}/llamenos-release.pub" -m "${RELEASE_WORK}/CHECKSUMS.txt" 2>&1 | grep "comment:" | sed 's/.*comment: //')

## Artifacts

$(ls -lh "${RELEASE_WORK}" | grep -v '\.pub$' | grep -v total)

## Verification

\`\`\`bash
# Verify checksums signature
minisign -V -p llamenos-release.pub -m v${VERSION}/CHECKSUMS.txt

# Verify individual artifact
minisign -V -p llamenos-release.pub -m <artifact-file>
\`\`\`
RELEASE_EOF

# Commit and tag
git add "v${VERSION}/"
git commit -m "release: v${VERSION} — signed checksums and manifest

Artifacts signed with minisign Ed25519.
Reproducible build verified via scripts/verify-build.sh.
Tauri updater manifest at releases/latest.json."

git tag -a "v${VERSION}" -m "Llamenos Desktop v${VERSION}"

echo "Committed and tagged v${VERSION} in audit repo."
echo "Review the commit before pushing:"
git log --oneline -1
git diff HEAD~1 --stat
```

Ask the operator to review the commit, then:

```bash
cd "${AUDIT_REPO}"
git push origin main
git push origin "v${VERSION}"
echo "Pushed to llamenos-releases."
```

## Step 7: Verify Live Endpoint

**Gate:** Audit repo pushed.

```bash
# Fetch the live updater manifest
LIVE_MANIFEST=$(curl -sSf "https://updates.llamenos.org/desktop/latest.json")

if [ $? -ne 0 ]; then
  echo "FATAL: Could not fetch https://updates.llamenos.org/desktop/latest.json"
  echo "Check DNS, Caddy config, and RustFS proxy."
  exit 1
fi

# Compare version
LIVE_VERSION=$(echo "${LIVE_MANIFEST}" | jq -r '.version')
if [ "${LIVE_VERSION}" != "${VERSION}" ]; then
  echo "FATAL: Live manifest version '${LIVE_VERSION}' != expected '${VERSION}'"
  echo "The upload may not have propagated, or Caddy is caching a stale response."
  echo "Check: aws s3 cp s3://${RUSTFS_BUCKET}/releases/latest.json - --endpoint-url ${RUSTFS_ENDPOINT} | jq .version"
  exit 1
fi

# Compare full manifest content
LOCAL_HASH=$(jq -cS '.' "${RELEASE_WORK}/latest.json" | sha256sum | cut -d' ' -f1)
LIVE_HASH=$(echo "${LIVE_MANIFEST}" | jq -cS '.' | sha256sum | cut -d' ' -f1)

if [ "${LOCAL_HASH}" != "${LIVE_HASH}" ]; then
  echo "WARNING: Live manifest content differs from local. Comparing..."
  diff <(jq -cS '.' "${RELEASE_WORK}/latest.json") <(echo "${LIVE_MANIFEST}" | jq -cS '.') || true
  echo "This may be due to pub_date differences. Verify platform URLs and signatures match."
else
  echo "VERIFIED: Live manifest matches local manifest exactly."
fi

# Also check the GitHub releases fallback endpoint
GITHUB_MANIFEST=$(curl -sSfL "https://github.com/rhonda-rodododo/llamenos/releases/latest/download/latest.json" 2>/dev/null || echo "")
if [ -n "${GITHUB_MANIFEST}" ]; then
  GH_VERSION=$(echo "${GITHUB_MANIFEST}" | jq -r '.version // empty')
  echo "GitHub releases fallback: version ${GH_VERSION:-'not found'}"
else
  echo "NOTE: GitHub releases fallback not yet updated (upload via gh release upload if needed)."
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  RELEASE v${VERSION} COMPLETE"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  RustFS:    s3://${RUSTFS_BUCKET}/releases/v${VERSION}/"
echo "  Updater:   https://updates.llamenos.org/desktop/latest.json"
echo "  Audit:     llamenos-releases repo tagged v${VERSION}"
echo "  GitHub:    https://github.com/rhonda-rodododo/llamenos/releases/tag/v${VERSION}"
echo ""
```

## Cleanup

After successful verification:

```bash
# Remove the temporary work directory
rm -rf "${RELEASE_WORK}"
echo "Cleaned up ${RELEASE_WORK}"
```

## Key Rotation

If the operator needs to rotate the minisign signing key:

1. Generate a new key: `minisign -G -s new-llamenos-release.key -p new-llamenos-release.pub`
2. Update `apps/desktop/tauri.conf.json` → `plugins.updater.pubkey` with the base64-encoded new public key
3. Commit and release a version with the NEW pubkey (clients fetch this update using the OLD key)
4. All subsequent releases use the new key
5. Document the rotation in the `llamenos-releases` audit repo
6. Securely destroy the old private key after confirming the transition release was accepted by clients

**The transition release is critical:** it must be signed with the OLD key but contain the NEW pubkey. Clients verify the transition release with the old key, then use the new key for future updates.

## Error Recovery

- **Step 1 fails (no artifacts):** CI build didn't upload to staging. Check `tauri-release.yml` workflow run.
- **Step 2 fails (verify-build.sh):** Build is not reproducible. Do NOT sign. Investigate the CI build environment.
- **Step 3 fails (signing):** Wrong key or corrupted key file. Verify key with `minisign -V`.
- **Step 4 fails (upload):** Check RustFS credentials and network. Retry is safe.
- **Step 5 fails (manifest):** Missing `.sig` files from CI. Re-download from GitHub Releases.
- **Step 7 fails (live check):** CDN/proxy cache. Check Caddy config, try `curl --no-cache`.
```

---

### Task 2: Create the `scripts/release/fetch-staging.sh` Helper

**Files:**
- Create: `scripts/release/fetch-staging.sh`

- [ ] **Step 1: Create the script directory**

```bash
mkdir -p scripts/release
```

- [ ] **Step 2: Write `fetch-staging.sh`**

Create `scripts/release/fetch-staging.sh`:

```bash
#!/usr/bin/env bash
# fetch-staging.sh — Download staging artifacts from RustFS for offline signing.
#
# Usage: ./scripts/release/fetch-staging.sh <version>
# Example: ./scripts/release/fetch-staging.sh 0.19.0
#
# Environment (or ~/.llamenos-release.env):
#   RUSTFS_ENDPOINT    S3-compatible endpoint URL (e.g., https://rustfs.llamenos.org)
#   RUSTFS_ACCESS_KEY  Access key for RustFS
#   RUSTFS_SECRET_KEY  Secret key for RustFS
#   RUSTFS_BUCKET      Bucket name (default: llamenos-releases)

set -euo pipefail

VERSION="${1:?Usage: fetch-staging.sh <version> (e.g., 0.19.0)}"

# Source credentials
if [ -f ~/.llamenos-release.env ]; then
  # shellcheck source=/dev/null
  source ~/.llamenos-release.env
fi

: "${RUSTFS_ENDPOINT:?Set RUSTFS_ENDPOINT (e.g., https://rustfs.llamenos.org)}"
: "${RUSTFS_ACCESS_KEY:?Set RUSTFS_ACCESS_KEY}"
: "${RUSTFS_SECRET_KEY:?Set RUSTFS_SECRET_KEY}"
RUSTFS_BUCKET="${RUSTFS_BUCKET:-llamenos-releases}"

export AWS_ACCESS_KEY_ID="${RUSTFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${RUSTFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="us-east-1"

RELEASE_WORK="${TMPDIR:-/tmp}/llamenos-release-v${VERSION}"
mkdir -p "${RELEASE_WORK}"

echo "=== Fetching staging artifacts for v${VERSION} ==="
echo "  Endpoint: ${RUSTFS_ENDPOINT}"
echo "  Bucket:   ${RUSTFS_BUCKET}"
echo "  Path:     staging/v${VERSION}/"
echo "  Local:    ${RELEASE_WORK}/"
echo ""

# List first to confirm artifacts exist
LISTING=$(aws s3 ls "s3://${RUSTFS_BUCKET}/staging/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" 2>&1) || {
  echo "FATAL: No staging artifacts found at s3://${RUSTFS_BUCKET}/staging/v${VERSION}/"
  echo "  Has the CI build completed? Check the Desktop Release workflow."
  exit 1
}

echo "Staging artifacts:"
echo "${LISTING}"
echo ""

ARTIFACT_COUNT=$(echo "${LISTING}" | wc -l)
if [ "${ARTIFACT_COUNT}" -lt 6 ]; then
  echo "WARNING: Only ${ARTIFACT_COUNT} artifacts found. Expected at least 6."
  echo "  Missing platform builds may indicate CI failure."
fi

# Download all artifacts
aws s3 cp "s3://${RUSTFS_BUCKET}/staging/v${VERSION}/" "${RELEASE_WORK}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --recursive

echo ""
echo "Downloaded ${ARTIFACT_COUNT} artifacts to ${RELEASE_WORK}/"
ls -lh "${RELEASE_WORK}/"
echo ""
echo "RELEASE_WORK=${RELEASE_WORK}"
```

---

### Task 3: Create the `scripts/release/sign-artifacts.sh` Helper

**Files:**
- Create: `scripts/release/sign-artifacts.sh`

- [ ] **Step 1: Write `sign-artifacts.sh`**

Create `scripts/release/sign-artifacts.sh`:

```bash
#!/usr/bin/env bash
# sign-artifacts.sh — Sign release artifacts with minisign.
#
# Usage: ./scripts/release/sign-artifacts.sh <work-dir> <minisign-key-path>
# Example: ./scripts/release/sign-artifacts.sh /tmp/llamenos-release-v0.19.0 /media/usb/llamenos-release.key
#
# Signs all release artifacts (not CI .sig files) and verifies each signature.
# Exits non-zero if any signature fails verification.

set -euo pipefail

RELEASE_WORK="${1:?Usage: sign-artifacts.sh <work-dir> <minisign-key-path>}"
MINISIGN_KEY="${2:?Usage: sign-artifacts.sh <work-dir> <minisign-key-path>}"

if ! command -v minisign &>/dev/null; then
  echo "FATAL: minisign not installed."
  echo "  Install: apt install minisign / brew install minisign"
  exit 2
fi

if [ ! -f "${MINISIGN_KEY}" ]; then
  echo "FATAL: Minisign key not found at: ${MINISIGN_KEY}"
  exit 1
fi

# Extract version from directory name
VERSION=$(basename "${RELEASE_WORK}" | sed 's/llamenos-release-v//')

echo "=== Signing artifacts for v${VERSION} ==="
echo "  Key: ${MINISIGN_KEY}"
echo "  Dir: ${RELEASE_WORK}"
echo ""

cd "${RELEASE_WORK}"

SIGNED=0
for artifact in *.app.tar.gz *.AppImage *.nsis.zip *.deb *.flatpak *.dmg CHECKSUMS.txt; do
  [ -f "$artifact" ] || continue
  # Skip CI-generated Tauri updater .sig files (they're base64 Ed25519, not minisign)
  echo "Signing: ${artifact}"
  minisign -S -s "${MINISIGN_KEY}" -m "${artifact}" \
    -t "llamenos v${VERSION} — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  SIGNED=$((SIGNED + 1))
done

echo ""
echo "Signed ${SIGNED} artifacts."
echo ""

# Verify all signatures
echo "=== Verifying signatures ==="

# Extract public key from tauri.conf.json
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PUBKEY_B64=$(jq -r '.plugins.updater.pubkey' "${REPO_ROOT}/apps/desktop/tauri.conf.json")
echo "${PUBKEY_B64}" | base64 -d > "${RELEASE_WORK}/llamenos-release.pub"

VERIFY_FAILED=0
for sig in *.minisig; do
  artifact="${sig%.minisig}"
  if [ ! -f "${artifact}" ]; then
    echo "  SKIP: ${artifact} (artifact not found for signature)"
    continue
  fi
  if minisign -V -p "${RELEASE_WORK}/llamenos-release.pub" -m "${artifact}" 2>/dev/null; then
    echo "  VERIFIED: ${artifact}"
  else
    echo "  FAILED: ${artifact}"
    VERIFY_FAILED=1
  fi
done

if [ "${VERIFY_FAILED}" -ne 0 ]; then
  echo ""
  echo "FATAL: One or more signatures failed verification."
  echo "  Check that the minisign key matches the pubkey in tauri.conf.json."
  exit 1
fi

echo ""
echo "All ${SIGNED} signatures verified successfully."
```

---

### Task 4: Create the `scripts/release/promote-release.sh` Helper

**Files:**
- Create: `scripts/release/promote-release.sh`

- [ ] **Step 1: Write `promote-release.sh`**

Create `scripts/release/promote-release.sh`:

```bash
#!/usr/bin/env bash
# promote-release.sh — Upload signed artifacts to the RustFS release path.
#
# Usage: ./scripts/release/promote-release.sh <version> <work-dir>
# Example: ./scripts/release/promote-release.sh 0.19.0 /tmp/llamenos-release-v0.19.0
#
# Uploads all artifacts and signatures to s3://RUSTFS_BUCKET/releases/vX.Y.Z/
# Then generates and uploads latest.json for the Tauri updater.
#
# Environment (or ~/.llamenos-release.env):
#   RUSTFS_ENDPOINT, RUSTFS_ACCESS_KEY, RUSTFS_SECRET_KEY, RUSTFS_BUCKET

set -euo pipefail

VERSION="${1:?Usage: promote-release.sh <version> <work-dir>}"
RELEASE_WORK="${2:?Usage: promote-release.sh <version> <work-dir>}"

# Source credentials
if [ -f ~/.llamenos-release.env ]; then
  # shellcheck source=/dev/null
  source ~/.llamenos-release.env
fi

: "${RUSTFS_ENDPOINT:?Set RUSTFS_ENDPOINT}"
: "${RUSTFS_ACCESS_KEY:?Set RUSTFS_ACCESS_KEY}"
: "${RUSTFS_SECRET_KEY:?Set RUSTFS_SECRET_KEY}"
RUSTFS_BUCKET="${RUSTFS_BUCKET:-llamenos-releases}"

export AWS_ACCESS_KEY_ID="${RUSTFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${RUSTFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="us-east-1"

echo "=== Promoting v${VERSION} to release bucket ==="
echo "  From: ${RELEASE_WORK}/"
echo "  To:   s3://${RUSTFS_BUCKET}/releases/v${VERSION}/"
echo ""

# Upload everything except temp files
aws s3 cp "${RELEASE_WORK}/" "s3://${RUSTFS_BUCKET}/releases/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --recursive \
  --exclude "*.pub" \
  --exclude ".DS_Store" \
  --exclude "*.tmp"

echo ""
echo "Uploaded. Listing release path:"
aws s3 ls "s3://${RUSTFS_BUCKET}/releases/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}"

echo ""

# Generate latest.json using existing TypeScript generator
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== Generating latest.json ==="
cd "${REPO_ROOT}"
bun run scripts/generate-update-manifest.ts \
  --version "${VERSION}" \
  --notes "Desktop v${VERSION}" \
  --output "${RELEASE_WORK}/latest.json" \
  --sig-dir "${RELEASE_WORK}" \
  --url-base "https://updates.llamenos.org/desktop/releases/v${VERSION}"

# Validate manifest
MANIFEST_VERSION=$(jq -r '.version' "${RELEASE_WORK}/latest.json")
if [ "${MANIFEST_VERSION}" != "${VERSION}" ]; then
  echo "FATAL: Generated manifest version '${MANIFEST_VERSION}' != '${VERSION}'"
  exit 1
fi

echo ""
echo "Generated latest.json:"
cat "${RELEASE_WORK}/latest.json"
echo ""

# Upload manifest to both release-specific and canonical paths
aws s3 cp "${RELEASE_WORK}/latest.json" \
  "s3://${RUSTFS_BUCKET}/releases/v${VERSION}/latest.json" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --content-type "application/json"

aws s3 cp "${RELEASE_WORK}/latest.json" \
  "s3://${RUSTFS_BUCKET}/releases/latest.json" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --content-type "application/json"

echo ""
echo "latest.json uploaded to:"
echo "  s3://${RUSTFS_BUCKET}/releases/v${VERSION}/latest.json"
echo "  s3://${RUSTFS_BUCKET}/releases/latest.json (canonical)"
```

---

### Task 5: Create the `scripts/release/verify-live.sh` Helper

**Files:**
- Create: `scripts/release/verify-live.sh`

- [ ] **Step 1: Write `verify-live.sh`**

Create `scripts/release/verify-live.sh`:

```bash
#!/usr/bin/env bash
# verify-live.sh — Verify the live updater endpoint serves the correct manifest.
#
# Usage: ./scripts/release/verify-live.sh <version> [local-manifest-path]
# Example: ./scripts/release/verify-live.sh 0.19.0 /tmp/llamenos-release-v0.19.0/latest.json
#
# Checks:
#   1. https://updates.llamenos.org/desktop/latest.json is reachable
#   2. The version field matches the expected version
#   3. Content matches the local manifest (if provided)
#   4. GitHub Releases fallback endpoint (informational)

set -euo pipefail

VERSION="${1:?Usage: verify-live.sh <version> [local-manifest-path]}"
LOCAL_MANIFEST="${2:-}"

UPDATER_URL="https://updates.llamenos.org/desktop/latest.json"
GITHUB_URL="https://github.com/rhonda-rodododo/llamenos/releases/latest/download/latest.json"

echo "=== Verifying live updater endpoint ==="
echo "  Expected version: ${VERSION}"
echo "  URL: ${UPDATER_URL}"
echo ""

# Fetch live manifest
LIVE_MANIFEST=$(curl -sSf "${UPDATER_URL}" 2>&1) || {
  echo "FATAL: Could not fetch ${UPDATER_URL}"
  echo "  Check: DNS resolution, Caddy config, RustFS proxy"
  echo "  Debug: curl -v ${UPDATER_URL}"
  exit 1
}

echo "Live manifest fetched successfully."

# Check version
LIVE_VERSION=$(echo "${LIVE_MANIFEST}" | jq -r '.version')
if [ "${LIVE_VERSION}" != "${VERSION}" ]; then
  echo "FATAL: Live version '${LIVE_VERSION}' != expected '${VERSION}'"
  echo ""
  echo "Possible causes:"
  echo "  - Upload hasn't propagated (try again in 30 seconds)"
  echo "  - Caddy is serving a cached response"
  echo "  - Wrong bucket or path"
  exit 1
fi
echo "  Version: ${LIVE_VERSION} ✓"

# Check platform entries
for platform in darwin-aarch64 darwin-x86_64 linux-x86_64 windows-x86_64; do
  SIG=$(echo "${LIVE_MANIFEST}" | jq -r ".platforms[\"${platform}\"].signature // empty")
  URL=$(echo "${LIVE_MANIFEST}" | jq -r ".platforms[\"${platform}\"].url // empty")
  if [ -n "$SIG" ] && [ -n "$URL" ]; then
    echo "  ${platform}: present (sig ${#SIG} chars)"
  else
    echo "  ${platform}: MISSING"
  fi
done

# Compare with local manifest if provided
if [ -n "${LOCAL_MANIFEST}" ] && [ -f "${LOCAL_MANIFEST}" ]; then
  echo ""
  LOCAL_HASH=$(jq -cS 'del(.pub_date)' "${LOCAL_MANIFEST}" | sha256sum | cut -d' ' -f1)
  LIVE_HASH=$(echo "${LIVE_MANIFEST}" | jq -cS 'del(.pub_date)' | sha256sum | cut -d' ' -f1)

  if [ "${LOCAL_HASH}" = "${LIVE_HASH}" ]; then
    echo "  Content match: EXACT (excluding pub_date)"
  else
    echo "  Content match: DIFFERS"
    echo "  Diff (local vs live):"
    diff <(jq -cS 'del(.pub_date)' "${LOCAL_MANIFEST}") \
         <(echo "${LIVE_MANIFEST}" | jq -cS 'del(.pub_date)') || true
  fi
fi

# Check GitHub fallback (informational, not a gate)
echo ""
echo "--- GitHub Releases fallback ---"
GH_MANIFEST=$(curl -sSfL "${GITHUB_URL}" 2>/dev/null || echo "")
if [ -n "${GH_MANIFEST}" ]; then
  GH_VERSION=$(echo "${GH_MANIFEST}" | jq -r '.version // empty')
  if [ "${GH_VERSION}" = "${VERSION}" ]; then
    echo "  GitHub fallback: v${GH_VERSION} (matches)"
  else
    echo "  GitHub fallback: v${GH_VERSION:-unavailable} (does not match — upload with gh release upload)"
  fi
else
  echo "  GitHub fallback: not available"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  RELEASE v${VERSION} VERIFIED LIVE"
echo "═══════════════════════════════════════════════════"
```

---

### Task 6: Create the `~/.llamenos-release.env` Template

**Files:**
- Create: `scripts/release/release-env.example`

- [ ] **Step 1: Write the env template**

Create `scripts/release/release-env.example`:

```bash
# Llamenos Release Signing — Environment Configuration
# Copy to ~/.llamenos-release.env and fill in values.
#
# This file contains credentials for the RustFS (MinIO S3-compatible)
# blob storage used for release artifact hosting.
#
# NEVER commit real credentials. This is a template only.

# RustFS (MinIO) endpoint — the S3-compatible API URL
RUSTFS_ENDPOINT=https://rustfs.llamenos.org

# RustFS credentials (separate from the app's MINIO_ACCESS_KEY)
RUSTFS_ACCESS_KEY=
RUSTFS_SECRET_KEY=

# Bucket name for release artifacts
RUSTFS_BUCKET=llamenos-releases

# Path to the llamenos-releases audit repo (local clone)
AUDIT_REPO=~/projects/llamenos-releases

# Path to minisign private key (typically on USB/air-gapped media)
# MINISIGN_KEY=/media/operator/SIGNING_KEY/llamenos-release.key
```

---

### Task 7: Update the Existing `release-deployment` Skill

**Files:**
- Edit: `.claude/skills/release-deployment/SKILL.md`

- [ ] **Step 1: Add a cross-reference to the new `/release` skill**

Add the following section to the end of `.claude/skills/release-deployment/SKILL.md`, before any closing content:

```markdown

## Offline Signing Workflow

For the complete offline artifact signing and release promotion workflow, use the `/release` skill.
That skill handles: fetching staging artifacts from RustFS, reproducible build verification,
minisign signing, promoting to the release bucket, generating the Tauri updater manifest,
committing to the `llamenos-releases` audit repo, and verifying the live endpoint.

See: `.claude/skills/release-signing/SKILL.md`
```

---

### Task 8: Add CI Upload-to-Staging Step

**Files:**
- Edit: `.github/workflows/tauri-release.yml`

- [ ] **Step 1: Add staging upload step to the release job**

In `.github/workflows/tauri-release.yml`, after the "Flatten artifact structure" step (line 231) and before "Generate CycloneDX SBOM" (line 235), add:

```yaml
      # Upload artifacts to RustFS staging for offline signing
      - name: Upload to RustFS staging
        if: env.RUSTFS_ENDPOINT != ''
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.RUSTFS_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.RUSTFS_SECRET_KEY }}
          AWS_DEFAULT_REGION: us-east-1
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          aws s3 cp flat-artifacts/ "s3://${RUSTFS_BUCKET:-llamenos-releases}/staging/v${VERSION}/" \
            --endpoint-url "${{ secrets.RUSTFS_ENDPOINT }}" \
            --recursive
          echo "Staged artifacts at s3://${RUSTFS_BUCKET:-llamenos-releases}/staging/v${VERSION}/"
```

Note: The `steps.version.outputs.version` reference requires moving the "Determine version" step (currently at line 252) to BEFORE this new step. Reorder accordingly:

1. Flatten artifact structure
2. Determine version ← move here
3. Upload to RustFS staging ← new step
4. Generate CycloneDX SBOM
5. Generate SLSA build provenance attestation
6. Generate latest.json
7. Upload desktop artifacts to release

---

### Task 9: Document Key Rotation Procedure

**Files:**
- Create: `docs/operations/key-rotation.md`

- [ ] **Step 1: Write key rotation documentation**

Create `docs/operations/key-rotation.md`:

```markdown
# Llamenos Signing Key Rotation

## Minisign Release Signing Key

The minisign Ed25519 key is used to sign desktop release artifacts. The public key
is embedded in `apps/desktop/tauri.conf.json` at `plugins.updater.pubkey` (base64-encoded).

### When to Rotate

- Suspected key compromise
- Planned periodic rotation (annually recommended)
- Personnel change (signing operator leaves the project)

### Rotation Procedure

**This is a two-release process.** The transition release bridges the old and new keys.

#### 1. Generate new keypair

```bash
minisign -G -s ~/new-llamenos-release.key -p ~/new-llamenos-release.pub
```

Store the new private key on the same offline media as the old key (USB/air-gapped).

#### 2. Prepare transition release

Update `apps/desktop/tauri.conf.json` with the **new** public key:

```bash
# Encode the new public key as base64
NEW_PUBKEY_B64=$(base64 -w0 < ~/new-llamenos-release.pub)

# Update tauri.conf.json
jq --arg pk "${NEW_PUBKEY_B64}" '.plugins.updater.pubkey = $pk' \
  apps/desktop/tauri.conf.json > tmp.json && mv tmp.json apps/desktop/tauri.conf.json
```

Commit this change as part of the next version release.

#### 3. Sign the transition release with the OLD key

The transition release (containing the new pubkey) must be signed with the OLD key.
Clients running the previous version will verify this update using the old pubkey,
accept it, and then switch to the new pubkey for future updates.

```bash
./scripts/release/sign-artifacts.sh /tmp/llamenos-release-vX.Y.Z /path/to/OLD-llamenos-release.key
```

#### 4. All subsequent releases use the NEW key

After the transition release is published and clients have updated:

```bash
./scripts/release/sign-artifacts.sh /tmp/llamenos-release-vX.Y.Z /path/to/NEW-llamenos-release.key
```

#### 5. Document in audit repo

```bash
cd ~/projects/llamenos-releases
cat > KEY_ROTATION.md << 'EOF'
# Key Rotation Log

| Date | Old Key ID | New Key ID | Transition Version |
|------|-----------|-----------|-------------------|
| YYYY-MM-DD | <first 8 chars of old pubkey> | <first 8 chars of new pubkey> | vX.Y.Z |
EOF
git add KEY_ROTATION.md && git commit -m "docs: key rotation record"
```

#### 6. Destroy old key

After confirming clients have accepted the transition release (monitor update check logs
or wait at least 2 weeks for rollout), securely destroy the old private key:

```bash
shred -u /path/to/OLD-llamenos-release.key
```

### Emergency Rotation (Compromised Key)

If the old key is compromised, the procedure is the same but **urgent**:

1. Generate new key immediately
2. Cut a patch release with the new pubkey, signed with the old key
3. Publish immediately — every hour of delay is a window for the attacker
4. Destroy the compromised key
5. Notify users via the project's security advisory channel
```

---

## Verification Checklist

- [ ] `.claude/skills/release-signing/SKILL.md` exists with correct frontmatter and all 7 gated steps
- [ ] `scripts/release/fetch-staging.sh` is executable and validates env vars
- [ ] `scripts/release/sign-artifacts.sh` is executable and verifies signatures after signing
- [ ] `scripts/release/promote-release.sh` is executable and uploads to both release-specific and canonical paths
- [ ] `scripts/release/verify-live.sh` is executable and checks both primary and fallback endpoints
- [ ] `scripts/release/release-env.example` documents all required environment variables
- [ ] `.claude/skills/release-deployment/SKILL.md` cross-references the new `/release` skill
- [ ] `.github/workflows/tauri-release.yml` has the staging upload step with correct ordering
- [ ] `docs/operations/key-rotation.md` documents the two-release rotation procedure
- [ ] Every helper script has `set -euo pipefail` and validates required arguments
- [ ] The skill refuses to proceed on any verification failure (no bypasses)
- [ ] `minisign` commands use the correct flags (`-S` for sign, `-V` for verify, `-t` for trusted comment)
- [ ] RustFS commands use `--endpoint-url` for S3-compatible access
- [ ] `verify-build.sh` is called without modification (existing script)
- [ ] `generate-update-manifest.ts` is called with correct `--sig-dir` and `--url-base` flags
