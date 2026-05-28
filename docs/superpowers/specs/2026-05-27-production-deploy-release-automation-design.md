# Production Deployment & Release Automation

**Date:** 2026-05-27
**Status:** Approved design, pending implementation plan

## Overview

Bring the Llamenos platform to production on 1984 Hosting (Iceland VPS), with DNS migration from Cloudflare to 1984, desktop update server infrastructure, automated Android Play Console publishing for internal testing, and comprehensive operational runbooks.

## Deployment Profiles

Two deployment profiles, one Ansible playbook (`deploy.yml`), controlled by `deployment_profile` variable:

### Self-hoster (default)

Minimal deployment for downstream operators wanting to host their own Llamenos instance.

**Included roles:**
- Llamenos app (Bun/Hono)
- PostgreSQL
- RustFS (file storage)
- Caddy (reverse proxy + auto TLS)
- Firewall + fail2ban + kernel hardening
- Backup automation

### Official

Full deployment for the Llamenos project's own production server. Includes everything in self-hoster plus:

- Desktop update server (static Caddy site)
- Monitoring (Prometheus/Alertmanager)
- Signal notifier sidecar
- 1984 DNS management

### Wrapper Scripts

- `deploy/scripts/deploy-self-hosted.sh` — sets `deployment_profile=self-hoster`, prompts for required vars (domain, DB password, etc.), runs `ansible-playbook deploy.yml`
- `deploy/scripts/deploy-official.sh` — sets `deployment_profile=official`, expects vault-encrypted vars, runs the same playbook with official-only roles enabled

### CI Workflow

- `deploy-prod.yml` — GitHub Actions workflow, manual dispatch, uses `official` profile with GitHub Environment secrets (`production`), runs preflight -> deploy -> smoke-check

## Desktop Update Server

Official profile only. No new service — Caddy serves static files.

### Directory Structure

```
/var/lib/llamenos/updates/desktop/
  latest.json          # Tauri v2 update manifest
  llamenos_x.y.z_amd64.AppImage.tar.gz
  llamenos_x.y.z_amd64.AppImage.tar.gz.sig
  (same for .msi.zip, .dmg on other platforms)
```

### Ansible Role: `llamenos-update-server`

- Creates directory structure with appropriate permissions
- Adds Caddy site blocks serving `updates.llamenos.org` and `releases.llamenos.org` -> the static directory
- TLS via Let's Encrypt (Caddy handles automatically)

### Release CI Integration (`tauri-release.yml`)

- After building artifacts, runs `generate-update-manifest.ts` to produce `latest.json`
- Uploads artifacts + manifest to the VPS via `rsync` over SSH (deploy key scoped to the updates directory)
- Existing Ed25519 signature verification in `updater.ts` protects against tampered artifacts

### Self-hosters

Update server role is skipped. Self-hosters point their Tauri config at their own static hosting or GitHub Releases. Epic-87 spec documents self-hosted options.

## DNS Migration

### Current State

- `api.llamenos.org` -> Cloudflare -> FLOKInet (retiring)
- `updates.llamenos.org` -> Cloudflare (not yet serving)
- `releases.llamenos.org` -> Cloudflare (not yet serving)

### Target State

All records managed by 1984 DNS, pointing to 1984 VPS:

- `api.llamenos.org` -> 1984 DNS -> 1984 VPS
- `updates.llamenos.org` -> 1984 DNS -> 1984 VPS
- `releases.llamenos.org` -> 1984 DNS -> 1984 VPS

### Implementation

- Extend existing OpenTofu 1984 module (`deploy/opentofu/modules/1984/`) with DNS record management, or add a dedicated `dns` module
- `deploy-official.sh` validates DNS records point to the correct VPS IP as part of Ansible preflight
- Migration runbook covers: lower TTLs -> update NS records -> verify propagation -> raise TTLs

### Self-hosters

BYO DNS. Self-hoster runbook documents required A/AAAA records but does not manage DNS.

## Android Play Console Automation

### Internal/Alpha Track (Automated)

- **Trigger:** GitHub Release published (same event as `auto-deploy-demo.yml`)
- `mobile-release.yml` builds signed AAB, uploads to Play Console internal track
- Uses existing Fastlane `internal` lane (not raw `upload-google-play` action) for metadata reuse
- GitHub Environment `android-release` secrets: `PLAY_SERVICE_ACCOUNT_JSON`, `ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`

### Production Promote (Manual Local)

- Operator runs `cd apps/android && fastlane android promote_to_production` locally
- Signing keys stay on the operator's machine, never in CI
- Runbook documents exact steps + verification

### Version Management

Already handled by knope — bumps `versionName` and `versionCode` in `build.gradle.kts` as part of the release PR. `versionCode` in CI overridden by `github.run_number` for monotonic Play Store compliance.

## Runbooks

All runbooks live in `docs/runbooks/` with consistent format: **Purpose -> Prerequisites -> Steps -> Verification -> Troubleshooting**.

| Runbook | Audience | Covers |
|---|---|---|
| `deploy-self-hosted.md` | Self-hosters | Prerequisites, script walkthrough, required DNS records, env vars, first deploy, verify |
| `deploy-official.md` | Maintainers | Vault setup, GitHub Environment config, CI workflow trigger, preflight/smoke expectations |
| `dns-migration.md` | Maintainers | TTL lowering, NS record cutover from Cloudflare to 1984, propagation verification, rollback |
| `desktop-update-release.md` | Maintainers | How `tauri-release.yml` publishes to update server, manual re-upload if needed, manifest format reference |
| `android-release.md` | Maintainers | CI auto-upload to internal track, manual production promote steps, Play Console verification |
| `rollback.md` | Both | Ansible rollback procedure, DB migration rollback, version pinning |
| `disaster-recovery.md` | Both | Backup restore, RTO/RPO targets, full VPS re-provision from scratch |

The existing `PRODUCTION_CHECKLIST.md` gets updated to reference these runbooks rather than duplicating procedures.

## Out of Scope

- iOS TestFlight automation (separate initiative)
- Kubernetes/Helm production deploy (VPS + Docker Compose is the production target)
- Staged desktop update rollouts (can be added later if needed)
- FLOKInet decommission procedures (handled after DNS migration is verified)
