# Epic F — Supply Chain & Infrastructure Hardening

**Date**: 2026-05-18
**Audit ref**: Security audit 2026-05-18 (Claude + Kimi, ~197 unique findings)
**Epic**: F of 9 (A–I)
**Findings addressed**: H34, H35, H36, SUPPLY-01, M02, SUPPLY-07, SUPPLY-08, SUPPLY-09
**Dependency order**: Independent — can proceed in parallel with other fix epics.

---

## Context

The 2026-05-18 audit identified supply chain and infrastructure hardening gaps that create risk upstream of all application-layer security. A compromised build or update mechanism delivers malicious code to volunteer devices regardless of how correct the application layer is. These findings are narrowly scoped surgical fixes — no architectural redesign required.

---

## Findings

### Strategic Decision: Watchtower (User-Confirmed 2026-05-18)
- **Keep Watchtower** with Docker socket proxy for restricted API access.
- Use `tecnativa/docker-socket-proxy` with minimal permissions (no exec, no run, limited container list/inspect).
- Watchtower connects to proxy, NOT directly to docker.sock.
- Pin Watchtower image to digest.
- This is the most secure option despite added complexity.

---

### H34 — Watchtower mounts raw `/var/run/docker.sock`

**File**: `deploy/docker/docker-compose.production.yml:235`

```yaml
watchtower:
  image: containrrr/watchtower:1.7.1
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

Mounting the raw Docker socket gives Watchtower (and any future vulnerability in it) full daemon access: `exec` into containers, `run` arbitrary images, read host filesystem, exfiltrate secrets. If Watchtower's image supply chain is compromised, the attacker has root-equivalent host access.

**Fix**: Replace direct socket mount with `tecnativa/docker-socket-proxy`. Watchtower connects to the proxy via TCP; the proxy enforces a minimal permission set (`CONTAINERS=1`, `IMAGES=1`, everything else `0`). Watchtower cannot exec, run, or access the host filesystem through the proxy.

---

### H35 — Images not universally pinned to digest across all compose files

**Files**: `deploy/docker/docker-compose.dev.yml`, `deploy/docker/docker-compose.ci.yml`, `deploy/docker/docker-compose.yml` (several services), `deploy/docker/docker-compose.production.yml` (Watchtower image itself)

Several images still use mutable tags or no digest:

| File | Service | Current |
|------|---------|---------|
| `docker-compose.dev.yml` | `postgres` | `postgres:17-alpine` (no digest) |
| `docker-compose.dev.yml` | `rustfs` | `rustfs/rustfs:latest` (no digest) |
| `docker-compose.dev.yml` | `signal-cli` | `bbernhard/signal-cli-rest-api:0.92` (no digest) |
| `docker-compose.dev.yml` | `ollama` | `ollama/ollama:0.6` (no digest) |
| `docker-compose.yml` | `whisper` | `fedirz/faster-whisper-server:0.4.1` (comment says pending) |
| `docker-compose.yml` | `kamailio` | `kamailio/kamailio:5.7` (no digest) |
| `docker-compose.yml` | `coturn` | `coturn/coturn:4` (no digest) |
| `docker-compose.production.yml` | `watchtower` | `containrrr/watchtower:1.7.1` (no digest) |

`docker-compose.yml` already pins `postgres`, `caddy`, `rustfs` (production), `glitchtip`, `glitchtip-redis`, `signal-cli`, `asterisk` to digests — this finding fills the remaining gaps.

**Fix**: Pin all images in all compose files to `image:tag@sha256:<digest>`. Provide a `scripts/update-image-digests.sh` helper to fetch and record digests. Dev/CI digest pinning is a defence-in-depth measure — it also protects contributors and CI runners from poisoned registries.

---

### H36 — `|| bun install` fallback in sip-bridge Dockerfile silently accepts arbitrary deps

**File**: `sip-bridge/Dockerfile:6`

```dockerfile
RUN bun install --frozen-lockfile 2>/dev/null || bun install
```

If the lockfile is stale or missing, the fallback silently runs an unconstrained `bun install`, potentially downloading different (or malicious) transitive dependency versions. The `2>/dev/null` suppresses the error that would alert the developer. This negates the supply chain integrity of `--frozen-lockfile`.

**Fix**: Remove the fallback. Fail on lockfile mismatch. Developers must update the lockfile locally and commit it. The build should never silently resolve dependency versions.

```dockerfile
RUN bun install --frozen-lockfile
```

---

### SUPPLY-01 — `Dockerfile.nodejs` installs Bun via `curl | bash` with no version pin or checksum

**File**: `deploy/docker/Dockerfile.nodejs:16`

```dockerfile
RUN curl -fsSL https://bun.sh/install | bash && \
    export PATH="$HOME/.bun/bin:$PATH" && \
    bun install --frozen-lockfile --production --ignore-scripts
```

`curl | bash` from an external URL with no version pin or integrity check is the canonical supply chain attack surface. A compromised `bun.sh` CDN, MITM, or BGP hijack during build delivers arbitrary code to the build environment, where it has access to secrets (Rust private key, signing keys) and produces the output artifact.

**Fix**: Pin the Bun version (matching `.mise.toml` `BUN_VERSION=1.3.5`), download the versioned release asset, verify its SHA-256 checksum before executing, and record the expected hash in the Dockerfile comment:

```dockerfile
ARG BUN_VERSION=1.3.5
ARG BUN_SHA256=<sha256-of-bun-linux-x64.zip>
RUN curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o /tmp/bun.zip \
    && echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c - \
    && unzip /tmp/bun.zip -d /tmp/bun-release \
    && mv /tmp/bun-release/bun-linux-x64/bun /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun-release \
    && chmod +x /usr/local/bin/bun
```

Also: `signal-notifier/Dockerfile` uses `FROM oven/bun:1-slim` (unpinned tag, no digest) and `bun install --production` (no `--frozen-lockfile`). Both must be fixed.

---

### M02 — CI workflows have no top-level `permissions: {}` deny-all

**Files**: Most of `.github/workflows/*.yml`

GitHub Actions defaults to the most-permissive token scope when no `permissions` key is set. Fourteen workflows exist; most do not set a top-level deny-all. Any compromised step in any workflow that lacks explicit permissions can write to the repository, read other secrets, or create releases with the overly-broad default token.

**Current state**: `ci.yml`, `tauri-release.yml`, `mobile-release.yml` set job-level permissions on _some_ jobs but not all. `ci.yml` has no top-level `permissions` block. Several workflows (`load-test.yml`, `iso-builder.yml`, `security-audit.yml`, `secret-scan.yml`, `desktop-e2e.yml`, `ios-e2e.yml`) have no permissions block at all.

**Fix**: Add `permissions: {}` (deny-all) at the workflow level in all 14 workflows. Add specific per-job `permissions` blocks only for jobs that actually require them (e.g., `contents: write` for release publish jobs, `packages: write` for GHCR pushes, `id-token: write` for OIDC).

---

### SUPPLY-07 — `TAURI_SIGNING_PRIVATE_KEY` injected into all build matrix jobs

**File**: `.github/workflows/tauri-release.yml:142,153,160`

The Tauri signing private key is injected as an environment variable into all three build platform jobs (macOS, Windows, Linux), even though signing only occurs as part of `tauri build`. If any matrix job's build toolchain (Bun scripts, Node.js scripts, Rust build scripts) is compromised, the signing key is exfiltrated.

The key is currently injected at the step level — which is better than job-level injection, but the key is still available to any subsequent step in those jobs (build scripts, post-build hooks, etc.).

**Fix**: Split the build into a two-step job: (1) compile without signing keys present, (2) a separate sign-only step that receives `TAURI_SIGNING_PRIVATE_KEY` only for the duration of the signing command. Alternatively, use a separate signing job that receives unsigned artifacts from the build job and signs them with the key in scope only for that job.

---

### SUPPLY-08 — Apple signing certificate decoded to disk (`certificate.p12`)

**File**: `.github/workflows/tauri-release.yml:128`

```bash
echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12
```

The decoded `.p12` file sits on the runner filesystem during the macOS build. If any subsequent step in the job reads or exfiltrates `certificate.p12` (e.g., via a compromised npm postinstall script, a build tool vulnerability, or a malicious action), the certificate is exposed. The file is `rm`-ed after keychain import (line 135), but it exists on disk during `security import`.

**Fix**: Use a named pipe or process substitution to avoid touching disk:

```bash
echo "$APPLE_CERTIFICATE" | base64 --decode | \
  security import /dev/stdin -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
```

Or use a `tmpfs`-backed directory if process substitution is unavailable:

```bash
CERT_DIR=$(mktemp -d)
# ... mount tmpfs over CERT_DIR ...
echo "$APPLE_CERTIFICATE" | base64 --decode > "${CERT_DIR}/cert.p12"
security import "${CERT_DIR}/cert.p12" -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
rm -rf "$CERT_DIR"
```

---

### SUPPLY-09 — Demo SSH key written to runner disk

**File**: `.github/workflows/deploy-demo.yml:65`

```bash
printf '%s' "$SSH_KEY" > ~/.ssh/llamenos_demo_deploy
chmod 600 ~/.ssh/llamenos_demo_deploy
```

The private SSH key is written to disk on the GitHub-hosted runner. If any subsequent step in the job (Ansible, its Python dependencies, or adjacent steps) reads `~/.ssh/`, the key is accessible. GitHub-hosted runners are ephemeral but shared between workflow runs within the same organization.

**Fix**: Use GitHub Actions OIDC or `ssh-agent` with in-memory key loading instead of disk writes:

```bash
eval "$(ssh-agent -s)"
echo "$SSH_KEY" | ssh-add -
# SSH_AUTH_SOCK is now set; ansible-playbook uses it automatically
```

The key never touches the filesystem. Clean up with `ssh-agent -k` in a post-step.

---

## Implementation Sequence

Phases are independent and can be merged in any order, but the following order is recommended to establish the digest-pinning foundation first:

1. **Phase 1** — Image digest pinning script + all compose files (H35)
2. **Phase 2** — Watchtower socket proxy (H34) — depends on Phase 1 (proxy image digest needed)
3. **Phase 3** — Build determinism: sip-bridge fallback removal + Bun checksum + signal-notifier hardening (H36, SUPPLY-01)
4. **Phase 4** — CI workflow permissions deny-all (M02)
5. **Phase 5** — Secret handling improvements (SUPPLY-07, SUPPLY-08, SUPPLY-09)

---

## Out of Scope for This Epic

- Dependabot Docker ecosystem configuration (addressed in Epic March-2026 supply chain, already merged)
- RustFS macOS checksum (HIGH-CI6 — addressed in March-2026 CI epic)
- `cargo install --locked` (HIGH-CI1 — addressed in March-2026 CI epic)
- Image build reproducibility / SLSA provenance (already implemented: `Dockerfile.build` with `SOURCE_DATE_EPOCH`, `CHECKSUMS.txt`, cosign)
