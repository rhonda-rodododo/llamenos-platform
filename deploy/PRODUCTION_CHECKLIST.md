# Production Deployment Checklist

Pre-launch checklist for self-hosted Llamenos instances. Complete all items before accepting real calls.

## Infrastructure

- [ ] Server provisioned in Iceland (1984 Hosting) — GDPR compliance + privacy jurisdiction
- [ ] SSH access restricted to admin IPs only (not 0.0.0.0/0)
- [ ] SSH key authentication only (password auth disabled)
- [ ] Firewall rules: only 80, 443, and SSH port open
- [ ] Unattended security updates enabled
- [ ] fail2ban configured and running
- [ ] NTP synchronized (critical for Schnorr token validation)
- [ ] LUKS2 disk encryption active (verify: `cryptsetup status`)

## Docker Compose

- [ ] All images pinned to digest hashes (not `latest`)
- [ ] `.env` file has strong, unique secrets (not defaults)
- [ ] `PG_PASSWORD` is cryptographically random (≥24 chars)
- [ ] `HMAC_SECRET` is 64 hex chars (`openssl rand -hex 32`)
- [ ] `SERVER_NOSTR_SECRET` is 64 hex chars
- [ ] `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` are unique and >= 24 chars
- [ ] `ADMIN_PUBKEY` set to real admin's Nostr pubkey
- [ ] `DOMAIN` set to actual production domain
- [ ] `ACME_EMAIL` set for Let's Encrypt notifications
- [ ] `ENVIRONMENT=production` (not development)
- [ ] Docker network isolation: internal services not exposed to host
- [ ] Read-only root filesystem for app container
- [ ] Non-root user in all containers

## TLS & Domain

- [ ] Domain DNS A record points to server IP
- [ ] Caddy has auto-provisioned TLS certificate
- [ ] HTTPS works end-to-end (test with `curl -I https://yourdomain.org`)
- [ ] HTTP redirects to HTTPS
- [ ] HSTS header present with `includeSubDomains; preload`
- [ ] CSP header blocks inline scripts

## Health & Monitoring

- [ ] `/api/health/ready` returns 200 with all checks passing
- [ ] `/api/health/live` returns 200
- [ ] Docker healthchecks passing for all containers
- [ ] Structured JSON logs visible in `docker compose logs`
- [ ] Log rotation configured (≤50MB per file, ≤5 files)

## Backups

- [ ] Automated daily backups configured and running
- [ ] Backup encryption key generated and stored OFFLINE
- [ ] Test restore verified (run `just test-restore`)
- [ ] Off-site backup destination configured (rclone)
- [ ] Backup retention policy: 7 daily, 4 weekly, 3 monthly

## RustFS (Object Storage)

- [ ] RustFS container running and healthy
- [ ] `llamenos-files` bucket created (for app uploads)
- [ ] `llamenos-staging` bucket created (for pre-release builds)
- [ ] `llamenos-releases` bucket created (for release artifacts)
- [ ] `llamenos-releases` bucket has public read policy (for downloads domain)
- [ ] `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` are unique and >= 24 chars
- [ ] SSE (server-side encryption) enabled on all buckets

## Desktop Distribution

- [ ] `downloads.{{ domain }}` DNS A record points to server IP
- [ ] `updates.{{ domain }}` DNS A record points to server IP
- [ ] Caddy vhosts for downloads and updates are active
- [ ] Release artifacts uploaded to RustFS /releases/ bucket
- [ ] Tauri updater JSON (`latest.json`) accessible at `https://updates.{{ domain }}/latest.json`
- [ ] Code signing certificates configured (Windows: Authenticode, macOS: Developer ID)
- [ ] SLSA provenance attestation generated for each release
- [ ] CHECKSUMS.txt published with each release

## Telephony

- [ ] Twilio account configured (or Asterisk PBX set up)
- [ ] Phone number purchased and configured
- [ ] Inbound calls route correctly to the app
- [ ] Parallel ringing works (multiple volunteers ring)
- [ ] Call notes can be created and encrypted

## Application

- [ ] Admin account created (`bun run bootstrap-admin`)
- [ ] Admin can log in and access all features
- [ ] Volunteer invite flow works end-to-end
- [ ] E2EE notes: volunteer creates note, admin can decrypt
- [ ] Ban list functionality works
- [ ] Shift scheduling works

## Security

- [ ] Admin keypair backed up securely
- [ ] Hub key generated and distributed to team
- [ ] No secrets in Docker Compose file (all in `.env`)
- [ ] `.env` file permissions: 600 (owner-only read)
- [ ] No debug endpoints exposed in production
- [ ] Nostr relay only accessible internally (not on public network)

## Kubernetes (if using Helm)

- [ ] `helm lint` passes
- [ ] Secrets stored in Kubernetes Secrets (not values.yaml)
- [ ] PodDisruptionBudget configured for app and strfry
- [ ] Resource limits set for all containers
- [ ] RustFS uses StatefulSet (not Deployment)
- [ ] Liveness probe: `/api/health/live`
- [ ] Readiness probe: `/api/health/ready`
- [ ] NetworkPolicy restricts pod-to-pod traffic
- [ ] HPA configured for app deployment (if multi-replica)

## Post-Launch

- [ ] Verify calls work end-to-end (make a test call)
- [ ] Verify backup runs on schedule
- [ ] Set up uptime monitoring (e.g., UptimeRobot on `/api/health/ready`)
- [ ] Document emergency procedures (restore, failover, key rotation)
- [ ] Schedule regular security review cadence
