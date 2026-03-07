---
name: release-deployment
description: >
  Guide release processes, deployment, version management, and CI/CD for the Llamenos monorepo.
  Use this skill when deploying, releasing, versioning, or managing CI/CD pipelines. Use when
  the user mentions "deploy", "release", "version bump", "CI/CD", "Docker", "Helm", "production",
  "staging", "deploy:api", "deploy:site", "tauri:build", "GitHub Actions", "workflow", "pipeline",
  "build", "ship", "push to production", "cut a release", "tag", "changelog", "container",
  "Docker Compose", "Kubernetes", "Ansible", "OpenTofu", or "infrastructure". Also use when
  the user asks about the deployment topology (which services run where), how to configure
  secrets, how to run the app in production, or how to troubleshoot deployment issues. The
  primary deployment target is Node.js + PostgreSQL (Docker/Kubernetes). Cloudflare Workers
  is a secondary/demo deployment. This skill prevents the most common deployment mistakes:
  wrong deploy commands, missing secrets, broken marketing site, and version drift.
---

# Release & Deployment for Llamenos

The app has two deployment modes: **Node.js + PostgreSQL** (primary, self-hosted) and
**Cloudflare Workers** (secondary, demo/cloud). The marketing site deploys to Cloudflare
Pages separately. Desktop apps are distributed via GitHub Releases.

## Deployment Topology

### Primary: Node.js + PostgreSQL (Self-Hosted)

```
┌─────────────────────────────────────────┐
│            Docker Compose / K8s          │
│                                         │
│  ┌──────────┐  ┌────────────┐           │
│  │ App      │  │ PostgreSQL │           │
│  │ (Node.js)│──│            │           │
│  └────┬─────┘  └────────────┘           │
│       │        ┌────────────┐           │
│       │        │ MinIO      │           │
│       ├────────│ (S3-compat)│           │
│       │        └────────────┘           │
│       │        ┌────────────┐           │
│       │        │ strfry     │           │
│       ├────────│ (Nostr)    │           │
│       │        └────────────┘           │
│  ┌────┴─────┐  ┌────────────┐           │
│  │ Caddy    │  │ Whisper    │  optional │
│  │ (reverse │  │ (ASR)      │           │
│  │  proxy)  │  └────────────┘           │
│  └──────────┘  ┌────────────┐           │
│                │ Asterisk   │  optional │
│                │ (SIP)      │           │
│                └────────────┘           │
└─────────────────────────────────────────┘
```

### Secondary: Cloudflare Workers (Demo)

```
Workers (app) + Durable Objects + R2 (files) + Nosflare (relay)
→ demo.llamenos-hotline.com
```

### Marketing Site: Cloudflare Pages

```
Astro static site → llamenos-hotline.com
```

## Deployment Commands

### CRITICAL RULE

**NEVER run `wrangler pages deploy` or `wrangler deploy` directly.**
Always use the root `package.json` scripts:

```bash
bun run deploy        # Deploy EVERYTHING (Worker + marketing site)
bun run deploy:api    # Deploy Worker only (CF)
bun run deploy:site   # Deploy marketing site only (Pages)
```

Running `wrangler pages deploy dist` from the wrong directory deploys the Vite app build
to Pages instead of the Astro marketing site, breaking llamenos-hotline.com with 404s.

### Node.js / Docker Deployment

```bash
# Build for Node.js
bun run build:node        # esbuild → dist/server/
bun run build:docker      # vite + esbuild for Docker

# Docker Compose (development)
cd deploy/docker
docker compose up -d --build

# Docker Compose (production)
cd deploy/docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Helm (Kubernetes)
helm upgrade --install llamenos deploy/helm/llamenos \
  --set image.tag=v0.24.0 \
  --set postgres.host=... \
  --values my-values.yaml
```

### Desktop Release

```bash
bun run tauri:build       # Build Tauri desktop app (Rust + Vite)

# CI handles: macOS (universal), Windows (x64/arm64), Linux (AppImage + deb + Flatpak)
# Tagged releases (v*) trigger tauri-release.yml → GitHub Releases
```

### Marketing Site

```bash
cd site && bun run build && bunx wrangler pages deploy dist --project-name llamenos-site
# Or via the root script:
bun run deploy:site
```

## Version Management

### Cross-Platform Version Bump

```bash
bun run version:bump <major|minor|patch> [description]
```

This updates versions in:
- `package.json` (npm)
- `apps/desktop/tauri.conf.json` (Tauri)
- `apps/desktop/Cargo.toml` (Rust)
- `apps/ios/project.yml` (Xcode)
- `apps/android/app/build.gradle.kts` (Android)

Creates a git tag and updates CHANGELOG.md.

### Conventional Commits

CI auto-versions based on commit prefixes:
- `feat:` → minor bump
- `fix:` → patch bump
- `feat!:` or `BREAKING CHANGE:` → major bump

## CI/CD Pipeline

```
Push to main
  → ci.yml
    ├── build (typecheck + vite build)
    ├── e2e-cf (Playwright on CF Workers mock)  ─┐
    ├── e2e-docker (Playwright on Docker)        ─┤── both must pass
    ├── crypto-tests (cargo test + clippy)        │
    ├── android-tests (unit + lint)               │
    ├── ios-tests (unit + UI)                     │
    └── worker-tests (Vitest integration)         │
                                                  ↓
  → version (auto-bump from conventional commits)
    ↓
  → deploy-app + deploy-site (parallel)
    ↓
  → release (GitHub Release with artifacts)
```

### CI Secrets Required

| Secret | Where | Purpose |
|--------|-------|---------|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Worker + Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Account targeting |
| `TAURI_SIGNING_PRIVATE_KEY` | GitHub Actions | Desktop update signing |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | GitHub Actions | Key password |
| `APPLE_CERTIFICATE_BASE64` | GitHub Actions | macOS code signing |
| `APPLE_CERTIFICATE_PASSWORD` | GitHub Actions | Certificate password |
| `APPLE_ID` / `APPLE_TEAM_ID` | GitHub Actions | Notarization |

## Environment Variables

### Worker (.dev.vars / wrangler secrets)

```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
ADMIN_PUBKEY=...
SERVER_NOSTR_SECRET=...   # 64 hex chars, openssl rand -hex 32
HMAC_SECRET=...           # For phone/IP hashing
ENVIRONMENT=production    # or development
DEMO_MODE=false           # MUST be false in production
```

### Node.js (.env in deploy/docker/)

```bash
PG_PASSWORD=...
PG_HOST=postgres
PG_PORT=5432
PG_DATABASE=llamenos
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_ENDPOINT=http://minio:9000
NOSTR_RELAY_URL=ws://strfry:7777
SERVER_NOSTR_SECRET=...
HMAC_SECRET=...
ADMIN_PUBKEY=...
ENVIRONMENT=production
DEMO_MODE=false
PORT=3000
```

### Desktop (Tauri)

Desktop doesn't need server secrets — it connects to the deployed API.
Configuration: hub URL entered during onboarding.

## Health Checks

```bash
# Node.js deployment
curl http://localhost:3000/api/health          # Basic health
curl http://localhost:3000/api/health/ready     # Ready (DB connected)
curl http://localhost:3000/api/health/live      # Liveness probe

# Cloudflare Workers
curl https://demo.llamenos-hotline.com/api/health
```

## Docker Compose Profiles

```bash
# Core services only
docker compose up -d

# With Whisper (transcription)
docker compose --profile whisper up -d

# With Asterisk (SIP)
docker compose --profile asterisk up -d

# With Signal bridge
docker compose --profile signal up -d

# Everything
docker compose --profile whisper --profile asterisk --profile signal up -d
```

## Ansible Automation

```bash
# First-time VPS setup
ansible-playbook -i inventory deploy/ansible/harden.yml
ansible-playbook -i inventory deploy/ansible/deploy.yml

# Updates
ansible-playbook -i inventory deploy/ansible/update.yml

# Rollback
ansible-playbook -i inventory deploy/ansible/update.yml -e rollback=true

# Backup
ansible-playbook -i inventory deploy/ansible/backup.yml
```

## Helm Chart

```bash
# Install
helm install llamenos deploy/helm/llamenos --values values.yaml

# Upgrade
helm upgrade llamenos deploy/helm/llamenos --values values.yaml

# Chart features:
# - Multi-replica RollingUpdate (HPA)
# - MinIO StatefulSet
# - PodDisruptionBudget
# - ServiceMonitor (Prometheus)
# - External PostgreSQL (required)
```

## Monitoring

- `GET /metrics` — Prometheus metrics endpoint
- Structured JSON logging (configurable via `LOG_FORMAT=json`)
- Health endpoints for liveness/readiness probes

## Desktop Update Distribution

Desktop uses Tauri's updater with Ed25519 signed updates:

```
User runs desktop app
  → Check update endpoint (GitHub Releases API)
  → Compare version
  → Download + verify Ed25519 signature
  → Apply update + restart
```

Update signing key is set in `tauri.conf.json` (`updater.pubkey`).
The private key is a CI secret (`TAURI_SIGNING_PRIVATE_KEY`).

## Common Deployment Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| `wrangler pages deploy dist` from root | Marketing site broken with 404s | Use `bun run deploy:site` |
| `DEMO_MODE=true` in production | Test reset endpoint exposed | Set `DEMO_MODE=false` |
| Missing `SERVER_NOSTR_SECRET` | No real-time sync, events dropped | Generate with `openssl rand -hex 32` |
| Missing `HMAC_SECRET` | Phone/IP hashing broken | Generate with `openssl rand -hex 32` |
| Floating Docker image tags | Supply chain risk | Pin to SHA256 digests |
| Not running migrations | Missing DB schema | Migrations run automatically at startup |
| Version mismatch across platforms | Compatibility issues | Use `bun run version:bump` |
| Pushing without CI passing | Broken deploy | Always wait for ci-status gate |

## File Locations

| File | Purpose |
|------|---------|
| `package.json` | Root scripts (deploy, build, version:bump) |
| `apps/worker/wrangler.jsonc` | CF Worker + DO bindings config |
| `deploy/docker/docker-compose.yml` | Docker Compose stack |
| `deploy/docker/Dockerfile` | Multi-stage Docker build |
| `deploy/docker/Caddyfile` | Reverse proxy config |
| `deploy/docker/.env.example` | Required environment variables |
| `deploy/helm/llamenos/` | Kubernetes Helm chart |
| `deploy/ansible/` | Ansible playbooks (harden, deploy, update, backup) |
| `deploy/tofu/` | OpenTofu modules (Hetzner VPS) |
| `.github/workflows/ci.yml` | Main CI pipeline |
| `.github/workflows/tauri-release.yml` | Desktop release builds |
| `.github/workflows/docker.yml` | Docker image builds (GHCR) |
| `apps/desktop/tauri.conf.json` | Tauri config (updater, window, CSP) |
| `site/` | Astro marketing site |
| `docs/PRODUCTION_CHECKLIST.md` | Pre-launch verification checklist |
| `docs/QUICKSTART.md` | First-time operator guide |
| `docs/RUNBOOK.md` | Operational runbook (rotation, incidents, recovery) |
