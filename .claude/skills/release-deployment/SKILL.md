---
name: release-deployment
description: Use when deploying the application, bumping versions, cutting releases, configuring CI/CD, managing Docker/Helm/Ansible deployments, or troubleshooting deployment issues. Also use when the user mentions "deploy", "release", "version bump", "Docker Compose", "Helm", "CI/CD", "wrangler", or needs to understand the deployment topology and release process.
---

# Release & Deployment

## Deployment Topology

Node.js/Docker is the PRIMARY deployment target. CF Workers is SECONDARY (demo/staging only).

## CRITICAL RULE
NEVER run `wrangler pages deploy` or `wrangler deploy` directly. Always use root package.json scripts:
- `bun run deploy` — deploy everything (Worker + marketing site)
- `bun run deploy:api` — deploy Worker only
- `bun run deploy:site` — deploy marketing site only

Running `wrangler pages deploy dist` from wrong directory deploys Vite app to Pages, breaking marketing site with 404s.

## Primary: Docker Compose (deploy/docker/)

| Service | Image | Purpose | Network |
|---------|-------|---------|---------|
| app | llamenos/app | Node.js server | web + internal |
| postgres | postgres:16 | Primary database (Drizzle ORM, Bun SQL) | internal |
| caddy | caddy:2 | Reverse proxy, auto-TLS | web |
| minio | minio/minio | Blob storage (R2 equivalent) | internal |
| strfry | strfry | Nostr relay (real-time events) | internal |
| whisper | (profile) | Transcription service | internal |
| asterisk | (profile) | PBX for self-hosted telephony | internal |
| signal-cli | (profile) | Signal messaging bridge | internal |

Required env vars: PG_PASSWORD, SERVER_NOSTR_SECRET (64 hex), HMAC_SECRET, ADMIN_PUBKEY, NOSTR_RELAY_URL

## Helm (deploy/helm/)
- Multi-replica RollingUpdate
- External PostgreSQL required
- MinIO for blob storage
- Optional Whisper sidecar

## Ansible (deploy/ansible/)
- Automated VPS provisioning
- Docker Compose deployment
- Caddy TLS setup

## Version Management
`bun run version:bump <major|minor|patch> [description]` updates:
- package.json (root)
- apps/desktop/tauri.conf.json
- packages/crypto/Cargo.toml
- apps/ios/project.yml
- apps/android/app/build.gradle.kts
- Creates git tag, updates CHANGELOG.md

CI auto-versions from conventional commits (feat: → minor, fix: → patch).

## CI/CD Pipeline
```
build → e2e-cf + e2e-docker (parallel) → version → deploy-app + deploy-site (parallel) → release
```
- Both E2E jobs must pass before version/deploy
- Tagged releases trigger tauri-release.yml for desktop builds (Linux/macOS/Windows)
- Docker images pushed to GHCR on tags

## Desktop Builds
- `bun run tauri:build` for local release build
- `tauri-release.yml` GitHub Action for CI builds
- Reproducible builds via SOURCE_DATE_EPOCH + content-hashed filenames
- CHECKSUMS.txt + SLSA provenance in GitHub Releases

## Health Check
`GET /api/health` returns `{ status: 'ok' }` (no timestamp — info leakage prevention)

## Common Mistakes
| Mistake | Consequence | Fix |
|---------|------------|-----|
| Running wrangler deploy directly | Breaks marketing site | Use bun run deploy:* scripts |
| Forgetting SERVER_NOSTR_SECRET | Nostr events not signed | Generate: openssl rand -hex 32 |
| Version desync across platforms | Build failures | Always use bun run version:bump |
| Missing ADMIN_PUBKEY | No bootstrap admin | Run bun run bootstrap-admin first |
| Pushing without E2E passing | Broken deploy | CI gates on both CF + Docker E2E |
