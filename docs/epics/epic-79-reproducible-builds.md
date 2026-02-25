# Epic 79: Reproducible Builds

## Problem Statement

Users must trust that the deployed code matches the open source repository. Currently:

1. **No verification mechanism**: Users cannot verify deployed code matches source
2. **Build non-determinism**: Same source can produce different outputs
3. **CI/CD trust**: GitHub Actions could be compromised to inject malicious code
4. **Cloudflare trust**: Workers deployment could be modified post-build
5. **Worker bundle opacity**: `wrangler deploy` bundles the Worker with its own esbuild — the bundle is never written to disk and cannot be verified

**Goal:** Enable anyone to verify that deployed Llamenos code exactly matches the public repository, eliminating the need to trust the deployment pipeline.

## What Are Reproducible Builds?

A build is reproducible when:

> Given the same source code, build environment, and build instructions, any party can recreate bit-for-bit identical output.

This allows:

- **Verification**: Anyone can build from source and compare to deployed artifacts
- **Audit**: Security researchers can verify no backdoors were added during build
- **Trust**: Users trust the source code, not the deployment infrastructure

## Current Build Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Source      │────►│  GitHub      │────►│  Cloudflare  │
│  (GitHub)    │     │  Actions     │     │  Workers     │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
   Public             Build happens         Deployed code
   (auditable)        (not reproducible)    (unverifiable)
```

### Sources of Non-Determinism

| Source | Example | Impact |
| ------ | ------- | ------ |
| Timestamps | `Date.now()` in build output | Different output each build |
| Randomness | UUIDs, nonces in output | Different output each build |
| Floating dependencies | `^1.0.0` in package.json | Different deps over time |
| Build tool versions | Bun 1.0.25 vs 1.0.26 | Subtle output differences |
| Environment variables | `HOME`, `USER` in output | Machine-specific |
| File ordering | Non-deterministic glob | Different chunk order |
| Minification | Terser randomized names | Different variable names |
| Source maps | Absolute paths | Machine-specific paths |
| Tailwind CSS ordering | Filesystem glob ordering | Differs between Linux/macOS |
| Binary lockfile | `bun.lockb` not human-reviewable | Opaque dependency changes |

## Technical Approach

### 1. Deterministic Build Configuration

#### Lock All Dependencies

```json
// package.json - use exact versions
{
  "dependencies": {
    "react": "18.2.0",
    "hono": "4.0.0"
  }
}
```

```bash
# Always use frozen lockfile
bun install --frozen-lockfile
```

#### bun.lockb Integrity

`bun.lockb` is a binary file that cannot be human-reviewed in diffs. This creates a supply chain risk.

**Mitigations:**
1. CI step: regenerate `bun.lockb` from `package.json` and verify byte-for-byte match against committed lockfile
2. Publish `bun.lockb` SHA-256 hash alongside build attestations
3. Generate a human-readable dependency manifest (`bun install --dry-run` output) and store alongside lockfile for auditability

```yaml
# .github/workflows/verify-lockfile.yml
- name: Verify lockfile integrity
  run: |
    cp bun.lockb bun.lockb.original
    bun install --frozen-lockfile
    if ! cmp -s bun.lockb bun.lockb.original; then
      echo "ERROR: bun.lockb is out of sync with package.json"
      exit 1
    fi
    sha256sum bun.lockb > bun.lockb.sha256
```

#### Pin Build Tools

```dockerfile
# Use exact versions in CI
FROM oven/bun:1.0.25-alpine@sha256:abc123...
```

#### Remove Timestamps (SOURCE_DATE_EPOCH)

```typescript
// vite.config.ts
export default defineConfig({
  define: {
    // CI sets this from git commit time; Dockerfile falls back to 0
    '__BUILD_TIME__': JSON.stringify(process.env.SOURCE_DATE_EPOCH || '0'),
  },
});
```

**CI sets meaningful timestamps:**
```yaml
- name: Set SOURCE_DATE_EPOCH from git
  run: echo "SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)" >> $GITHUB_ENV
```

`SOURCE_DATE_EPOCH=0` is the Dockerfile fallback for local builds. CI always sets it from `git log -1 --format=%ct` so build metadata is tied to the commit time rather than displaying 1970-01-01.

#### Deterministic Output

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    // Consistent chunk naming
    rollupOptions: {
      output: {
        // Use content hash, not random
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
    // Disable source maps or use relative paths
    sourcemap: false,
  },
});
```

#### Tailwind CSS Determinism

Tailwind v4 CSS output order depends on filesystem glob ordering, which differs between Linux and macOS (HFS+ vs ext4 directory enumeration order).

**Mitigations:**
1. **All verification builds MUST use the Docker container (Linux)**. Local macOS builds may produce different CSS output — this is expected and documented.
2. CI step that builds twice in the same Docker container and diffs to detect non-determinism:
   ```yaml
   - name: Verify build determinism
     run: |
       docker run --rm -v $(pwd):/src llamenos-build:latest sh -c '
         cd /src && bun run build && cp -r dist dist1 && \
         rm -rf dist && bun run build && \
         diff -r dist1 dist || (echo "NON-DETERMINISTIC BUILD DETECTED" && exit 1)
       '
   ```
3. If persistent ordering issues arise, consider pinning Tailwind content paths in explicit sorted order in the config.

### 2. Canonical Build Environment

#### Container-Based Builds

```dockerfile
# Dockerfile.build
FROM oven/bun:1.0.25-alpine@sha256:abc123...

# Ensure consistent locale
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Remove variable environment
ENV HOME=/build
ENV USER=build
# CI overrides this with: git log -1 --format=%ct
# Default 0 is fallback for local builds only
ENV SOURCE_DATE_EPOCH=0

WORKDIR /build
COPY . .

RUN bun install --frozen-lockfile
RUN bun run build

# Output: /build/dist/
```

#### Nix-Based Builds (Alternative)

Nix can provide stronger reproducibility guarantees but requires Bun-aware derivations. The project uses Bun, not npm/Node.

```nix
# flake.nix (pseudocode — Bun support in Nix is evolving)
{
  outputs = { self, nixpkgs }: {
    packages.x86_64-linux.default = let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
    in pkgs.stdenv.mkDerivation {
      pname = "llamenos";
      version = "0.1.0";
      src = ./.;
      nativeBuildInputs = [ pkgs.bun ];
      buildPhase = ''
        export HOME=$TMPDIR
        bun install --frozen-lockfile
        bun run build
      '';
      installPhase = ''
        cp -r dist $out
      '';
    };
  };
}
```

**Note:** `buildNpmPackage` is not appropriate for this project — it assumes npm. Use `stdenv.mkDerivation` with Bun in `nativeBuildInputs` or wait for a proper `buildBunPackage` abstraction.

### 3. Worker Bundle Verification

#### The Problem

`wrangler deploy` uses its own internal esbuild to bundle the Worker. This bundle is never written to disk during normal deployment. The deployed Worker code cannot be compared to source.

#### The Solution: Wrangler Dry-Run Capture

```bash
# Capture the Worker bundle without deploying
bunx wrangler deploy --dry-run --outdir dist/worker-bundle/
```

This writes the exact bundle that `wrangler deploy` would upload to `dist/worker-bundle/`. The bundle can then be:
1. Checksummed and signed alongside the client build artifacts
2. Published as a GitHub Release asset
3. Reproduced locally by verifiers using the same Wrangler + Bun versions

**CI Integration:**
```yaml
- name: Capture Worker bundle
  run: bunx wrangler deploy --dry-run --outdir dist/worker-bundle/

- name: Checksum Worker bundle
  run: |
    sha256sum dist/worker-bundle/* >> CHECKSUMS.txt
```

**Verifier reproduces:**
```bash
# Same Wrangler version, same Bun version, same source
bunx wrangler deploy --dry-run --outdir local-worker-bundle/
diff dist/worker-bundle/ local-worker-bundle/
```

This is added to Phase 1 as a required step.

### 4. Build Artifact Signing and Trust Anchoring

#### Verification Trust: GitHub Releases, NOT Deployed App

**The Problem:** The original design served `CHECKSUMS.txt` from the deployed Cloudflare app (`/CHECKSUMS.txt`). This means the verifier fetches checksums from the same infrastructure they're trying to verify — the potential adversary controls the checksums.

**The Solution:** Publish checksums and signatures as GitHub Release assets. The GitHub repository is the root of trust, not the deployment.

```yaml
# .github/workflows/release.yml
- name: Build in container
  run: docker build -f Dockerfile.build -t llamenos-build .

- name: Extract artifacts
  run: |
    docker create --name extract llamenos-build
    docker cp extract:/build/dist ./dist
    docker rm extract

- name: Capture Worker bundle
  run: bunx wrangler deploy --dry-run --outdir dist/worker-bundle/

- name: Compute checksums
  run: |
    cd dist
    find . -type f -exec sha256sum {} \; | sort > ../CHECKSUMS.txt
    cd ..
    sha256sum dist/worker-bundle/* >> CHECKSUMS.txt

- name: Sign checksums
  run: gpg --detach-sign --armor CHECKSUMS.txt

- name: Upload to GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: |
      CHECKSUMS.txt
      CHECKSUMS.txt.asc
      dist/worker-bundle/*
```

The `/api/verify` endpoint remains useful for human-readable version/commit display but is NOT the verification anchor.

#### SLSA Provenance

Use GitHub Actions build attestations (SLSA provenance) tied to specific git commits for supply chain security.

```yaml
- name: Generate SLSA provenance
  uses: actions/attest-build-provenance@v2
  with:
    subject-path: |
      dist/**
      CHECKSUMS.txt

- name: Upload provenance to GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: |
      CHECKSUMS.txt
      CHECKSUMS.txt.asc
```

**SLSA Benefits:**
- Cryptographic proof that artifacts were built by a specific GitHub Actions workflow from a specific commit
- Tamper-evident: modifying artifacts after build invalidates the attestation
- Third-party verifiable: anyone can verify the provenance chain

**For high-security deployments:** The Docker/self-hosted path with full verifiable builds is preferred over the Cloudflare path. SLSA provenance provides strong guarantees for the CI pipeline but cannot attest to what Cloudflare actually executes at runtime.

### 5. Verification Workflow

#### User Verification Script

```bash
#!/bin/bash
# verify-build.sh

set -e

VERSION=${1:-"main"}
REPO="rhonda-rodododo/llamenos"

echo "=== Llamenos Build Verification ==="
echo "Version: $VERSION"

# Clone source
git clone --depth 1 --branch "$VERSION" "https://github.com/${REPO}.git"
cd llamenos

# Build in container (Linux — required for deterministic Tailwind CSS)
docker build -f Dockerfile.build -t llamenos-verify .

# Extract build
docker create --name verify llamenos-verify
docker cp verify:/build/dist ./local-build
docker rm verify

# Capture Worker bundle with same Wrangler version
bunx wrangler deploy --dry-run --outdir local-worker-bundle/

# Compute local checksums
find local-build -type f -exec sha256sum {} \; | sort > local-checksums.txt
sha256sum local-worker-bundle/* >> local-checksums.txt

# Fetch published checksums from GitHub Releases (NOT from deployed app)
gh release download "$VERSION" --repo "${REPO}" --pattern "CHECKSUMS.txt" --dir .
gh release download "$VERSION" --repo "${REPO}" --pattern "CHECKSUMS.txt.asc" --dir .

# Verify GPG signature
if gpg --verify CHECKSUMS.txt.asc CHECKSUMS.txt 2>/dev/null; then
  echo "GPG signature verified"
else
  echo "WARNING: GPG signature verification failed"
fi

# Compare
if diff local-checksums.txt CHECKSUMS.txt; then
  echo "BUILD VERIFIED: Local build matches published checksums"
  exit 0
else
  echo "BUILD MISMATCH: Local build differs from published checksums"
  diff local-checksums.txt CHECKSUMS.txt
  exit 1
fi
```

### 6. Cloudflare Workers Verification

#### Verification Endpoint (Human-Readable, NOT Trust Anchor)

```typescript
// src/worker/api/verify.ts
app.get('/api/verify', (c) => {
  // Useful for quick version checks — NOT the verification anchor
  // Trust anchor is CHECKSUMS.txt in GitHub Releases
  return c.json({
    version: BUILD_VERSION,
    commit: BUILD_COMMIT,
    buildTimestamp: SOURCE_DATE_EPOCH,
    verificationUrl: `https://github.com/rhonda-rodododo/llamenos/releases/tag/v${BUILD_VERSION}`,
    note: 'Verify builds using GitHub Release checksums, not this endpoint',
  });
});
```

## Implementation Phases

### Phase 1: Deterministic Vite + Worker Build (1 week)

**Tasks:**

1. Audit current build for non-determinism sources
2. Pin all dependencies to exact versions
3. Configure Vite for deterministic output
4. Remove timestamps and random elements
5. Add `wrangler deploy --dry-run --outdir` to build pipeline (Worker bundle capture)
6. Verify bun.lockb integrity (regenerate and compare)
7. Test build reproducibility locally (in Docker container)

**Verification:**
```bash
# Build twice in Docker, compare (Linux required for Tailwind determinism)
docker run --rm -v $(pwd):/src llamenos-build sh -c '
  cd /src && bun run build && cp -r dist dist1 && \
  rm -rf dist && bun run build && \
  diff -r dist1 dist
'
# Should produce no differences
```

**Deliverables:**

- Deterministic Vite config
- Worker bundle capture via `--dry-run --outdir`
- Pinned dependencies with lockfile verification
- Local reproducibility confirmed (Docker only — macOS may differ due to Tailwind)

### Phase 2: Container Build Environment (0.5 weeks)

**Tasks:**

1. Create Dockerfile.build with pinned base image (SHA256 digest)
2. Configure consistent environment variables
3. Set SOURCE_DATE_EPOCH from `git log -1 --format=%ct` in CI (Dockerfile defaults to `0`)
4. Add double-build determinism check to CI
5. Test container build reproducibility across runs

**Deliverables:**

- Dockerfile.build
- Container build script
- Double-build determinism CI step
- Cross-run reproducibility confirmed

### Phase 3: CI/CD Integration + SLSA (1 week)

**Tasks:**

1. Update GitHub Actions to use container build
2. Generate and sign checksums (client + Worker bundle)
3. Create SLSA build attestations via `actions/attest-build-provenance`
4. Publish `CHECKSUMS.txt` + `CHECKSUMS.txt.asc` + provenance as GitHub Release assets
5. Publish `bun.lockb` hash alongside attestations
6. Pin GitHub Actions to SHA (already done per Epic 64)

**Deliverables:**

- Updated CI workflow with container build
- Signed checksums in GitHub Releases (NOT served from deployed app)
- SLSA provenance attestations
- Worker bundle published as release artifact

### Phase 4: Verification Tooling (0.5 weeks)

**Tasks:**

1. Create `verify-build.sh` script (fetches from GitHub Releases, not deployed app)
2. Keep `/api/verify` endpoint for human-readable version display (clearly labeled as non-authoritative)
3. Document verification process
4. Add verification instructions to security docs

**Deliverables:**

- `verify-build.sh` script using `gh release download`
- Verification endpoint (informational only)
- User documentation

### Phase 5: Docker Image Verification (0.5 weeks)

**Tasks:**

1. Apply same principles to Docker image builds
2. Sign Docker images with cosign
3. Publish SBOM (Software Bill of Materials)
4. Document Docker image verification

**Deliverables:**

- Signed Docker images
- SBOM generation
- Docker verification docs

## Vite Configuration Changes

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Deterministic chunk naming
    rollupOptions: {
      output: {
        // Content-based hashes only
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',

        // Consistent chunk ordering
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },

    // Disable features that add non-determinism
    sourcemap: false,
    manifest: true, // Useful for verification
  },

  define: {
    // Use SOURCE_DATE_EPOCH for any timestamps
    // CI: set from git log -1 --format=%ct
    // Docker: defaults to 0 (local builds)
    '__BUILD_TIME__': JSON.stringify(
      process.env.SOURCE_DATE_EPOCH
        ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
        : new Date().toISOString()
    ),
    '__BUILD_COMMIT__': JSON.stringify(process.env.GITHUB_SHA || 'dev'),
  },
});
```

## Worker Build Changes

The Worker is bundled by Wrangler's internal esbuild. To capture and verify this bundle:

```yaml
# In CI, capture the bundle before deploying
- name: Capture Worker bundle
  run: bunx wrangler deploy --dry-run --outdir dist/worker-bundle/

- name: Deploy Worker
  run: bunx wrangler deploy
```

The `--dry-run --outdir` flag writes the exact same bundle that `wrangler deploy` would upload. This artifact is checksummed, signed, and published.

## Verification Endpoint

```typescript
// src/worker/api/verify.ts
import { Hono } from 'hono';

// These are embedded at build time
declare const BUILD_VERSION: string;
declare const BUILD_COMMIT: string;
declare const SOURCE_DATE_EPOCH: string;

const app = new Hono();

app.get('/api/verify', (c) => {
  return c.json({
    version: BUILD_VERSION,
    commit: BUILD_COMMIT,
    buildTimestamp: SOURCE_DATE_EPOCH,
    verificationUrl: `https://github.com/rhonda-rodododo/llamenos/releases/tag/v${BUILD_VERSION}`,
    // Explicit: this endpoint is informational, not the trust anchor
    trustAnchor: 'GitHub Release checksums + SLSA provenance',
  });
});

export default app;
```

## Security Considerations

### Build Environment Isolation

- Container builds prevent local environment leakage
- Pinned base images (by SHA256 digest) prevent supply chain attacks
- No network access during build (optional, for extra security)
- All verification builds use Linux (Docker) to avoid Tailwind CSS ordering differences

### Key Management

- Release signing keys stored securely (GitHub secrets or HSM)
- Multiple signers for releases (threshold signatures)
- Key rotation procedures documented

### Attestation Chain

```
Source Code (GitHub)
    | (git commit signed)
Build Environment (Docker container, pinned by SHA)
    | (container image signed)
Build Output (Client + Worker bundle)
    | (checksums signed, SLSA provenance)
GitHub Release (trust anchor)
    | (checksums + signatures + provenance published)
Deployment (Cloudflare)
    | (informational /api/verify endpoint)
Verifier
    | (reproduces build locally, compares to GitHub Release checksums)
```

### Trust Model

| What | Trust Level | Why |
|------|------------|-----|
| GitHub repository (source) | Root of trust | Public, auditable, git-signed commits |
| GitHub Releases (checksums) | High | Tied to repo, GPG signed, SLSA provenance |
| Docker build container | High | Pinned by SHA256 digest, deterministic |
| `/api/verify` endpoint | Informational only | Served by the infrastructure being verified |
| Cloudflare runtime | Cannot verify | Mitigate by self-hosting for maximum trust |

### Limitations

1. **Cloudflare runtime**: We cannot verify what Cloudflare actually executes
   - Mitigation: Trust Cloudflare or self-host
   - SLSA provenance proves the build was correct; CF runtime is a separate trust boundary
   - Future: Confidential computing / attestation

2. **Tailwind CSS on macOS**: Local macOS builds may produce different CSS output than Linux Docker builds due to filesystem glob ordering
   - Mitigation: All verification builds MUST use the Docker container
   - Document this explicitly in verification instructions

3. **bun.lockb opacity**: Binary lockfile cannot be human-reviewed in diffs
   - Mitigation: CI verifies lockfile integrity, publishes hash alongside attestations

4. **Client-side verification**: Users must trust their browser
   - Mitigation: Provide CLI verification tool

5. **Update verification**: Each update requires re-verification
   - Mitigation: Automate verification in CI

## Success Criteria

1. **Reproducibility**
   - [ ] Two independent Docker builds produce identical output
   - [ ] Worker bundle captured via `--dry-run --outdir` is reproducible
   - [ ] Double-build CI step passes consistently
   - [ ] bun.lockb integrity verified in CI

2. **Verification**
   - [ ] Users can verify deployed code matches source via GitHub Release checksums
   - [ ] `verify-build.sh` works end-to-end (fetches from GitHub Releases)
   - [ ] SLSA provenance published with each release
   - [ ] Worker bundle included in verification

3. **Documentation**
   - [ ] Build process fully documented
   - [ ] Verification instructions clear (including Docker requirement for Tailwind)
   - [ ] Trust model explicitly documented
   - [ ] macOS vs Linux differences documented

## Dependencies

- No dependencies on other epics
- Foundational for security audits and trust
- Epic 78 (Client-Side Transcription) depends on this for model hash integrity

## Open Questions

1. **Nix vs Docker**: Which provides better reproducibility guarantees?
   - Docker is more accessible; Nix is more deterministic
   - Recommendation: Start with Docker, consider Nix for hardcore users
   - Note: If using Nix, use `stdenv.mkDerivation` with Bun, not `buildNpmPackage`

2. **Verification frequency**: Should users verify every update?
   - Recommendation: Automate verification in CI, users verify on demand

3. **Cloudflare attestation**: Can we get deployment attestations from CF?
   - Research needed; may require enterprise features or alternative approach
   - For now: Worker bundle capture via `--dry-run` is the best we can do

4. **Tailwind CSS ordering**: Will future Tailwind versions improve determinism?
   - Monitor Tailwind v4 releases for deterministic output options
   - For now: Docker-only verification is the pragmatic solution
