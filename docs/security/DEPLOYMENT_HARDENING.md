# Deployment Hardening Guide

This guide provides security-focused deployment recommendations for Llamenos operators. Since Llamenos is self-hosted open-source software, the operator is responsible for infrastructure security. This document covers three deployment architectures in order of complexity.

**Related documents**:
- [Quick Start Guide](../QUICKSTART.md) -- step-by-step deployment walkthrough for first-time operators
- [Operator Runbook](../RUNBOOK.md) -- operational procedures, incident response, backup/recovery, and troubleshooting
- [Threat Model](THREAT_MODEL.md) -- adversary profiles, trust boundaries, and cryptographic guarantees
- [Security Audit Report (R6)](SECURITY_AUDIT_2026-02-R6.md) -- latest security audit findings and fixes

## Architecture Overview

| Architecture | Best For | Complexity | Security Surface |
|---|---|---|---|
| **Docker Compose on VPS** | Small orgs (1-10 volunteers) | Low | Single server, all services co-located |
| **Kubernetes (Helm)** | Medium-large orgs (10-100+ volunteers) | High | Multi-node, network policies, pod isolation |
| **Cloudflare Workers** | Any size; managed infrastructure | Medium | Cloudflare as trusted party; no server management |

All three architectures provide E2EE for call notes and transcriptions. The security of the cryptographic layer is independent of the deployment model — the server never has access to plaintext note content regardless of where it runs.

---

## 1. Docker Compose on VPS (Recommended for Small Deployments)

### VPS Selection

**Recommended providers** (privacy-focused, GDPR-compliant):
- Hetzner (Germany/Finland) — good privacy track record, EU jurisdiction
- OVH (France) — EU jurisdiction, dedicated servers available
- Greenhost (Netherlands) — privacy-focused nonprofit hosting

**Avoid**:
- US-based providers subject to NSLs/FISA (unless operating under US jurisdiction)
- Providers without full-disk encryption at the hypervisor level
- Shared hosting / VPS with known noisy-neighbor attacks

**Minimum specifications**:
- 2 vCPU, 4GB RAM, 40GB SSD
- Dedicated IP (not shared)
- KVM or dedicated hardware (avoid OpenVZ — no kernel isolation)

### VPS Hardening with Ansible

We provide Ansible playbooks for automated VPS hardening and application deployment. This is the recommended approach for operators who are not Linux security specialists. The playbooks live in the repository at `deploy/ansible/`.

**Ansible tooling**:
- `deploy/ansible/ansible.cfg` -- Ansible configuration (SSH pipelining, YAML output, sudo escalation)
- `deploy/ansible/inventory.example.yml` -- Example inventory with annotated configuration
- `deploy/ansible/playbooks/harden.yml` -- Server hardening (SSH, firewall, kernel, Docker, fail2ban, auditd)
- `deploy/ansible/playbooks/deploy.yml` -- Application deployment (Docker Compose, secrets, health check)
- `deploy/ansible/playbooks/update.yml` -- Rolling updates with pre-update backup and rollback
- `deploy/ansible/playbooks/backup.yml` -- Automated encrypted database backups

**Quick start** (see [`docs/QUICKSTART.md`](../QUICKSTART.md) for the full walkthrough):

```bash
cd deploy/ansible

# Configure your inventory
cp inventory.example.yml inventory.yml
# Edit inventory.yml with your VPS IP, SSH key, domain name

# Run the hardening playbook
ansible-playbook -i inventory.yml playbooks/harden.yml

# Deploy Llamenos
ansible-playbook -i inventory.yml playbooks/deploy.yml
```

The hardening playbook is idempotent -- it is safe to run multiple times. It performs:

#### OS-Level Hardening
- **Unattended security updates** (`unattended-upgrades` with security-only sources)
- **SSH hardening**: Disable password auth, disable root login, change default port, `AllowUsers` whitelist, `MaxAuthTries 3`
- **Firewall** (UFW): Allow only 22 (SSH, custom port), 80, 443. Deny all other inbound.
- **Kernel hardening** (`sysctl.conf`):
  ```
  net.ipv4.conf.all.rp_filter = 1           # Strict reverse path filtering
  net.ipv4.conf.all.accept_redirects = 0     # Ignore ICMP redirects
  net.ipv4.conf.all.send_redirects = 0
  net.ipv6.conf.all.accept_redirects = 0
  kernel.dmesg_restrict = 1                  # Restrict dmesg to root
  kernel.kptr_restrict = 2                   # Hide kernel pointers
  fs.protected_hardlinks = 1
  fs.protected_symlinks = 1
  ```
- **Fail2ban**: SSH brute-force protection (5 attempts, 1-hour ban)
- **Audit logging** (`auditd`): Log file access, user changes, privilege escalation
- **Disable unused services**: `bluetooth`, `cups`, `avahi-daemon`
- **Automatic reboots** for kernel updates (configurable schedule)

#### Docker-Specific Hardening
- Docker configured with `userns-remap` (user namespace isolation)
- Docker socket not exposed to containers
- Docker content trust enabled (`DOCKER_CONTENT_TRUST=1`)
- Log rotation configured (max 10MB per container, 3 files)
- `no-new-privileges` security option enabled globally

#### Network Hardening
- Caddy as reverse proxy with automatic TLS (Let's Encrypt)
- OCSP stapling enabled
- TLS 1.2 minimum (TLS 1.3 preferred)
- HTTP/2 and HTTP/3 enabled
- Security headers applied at Caddy layer (see Caddyfile in repo)

### Secrets Management

For Docker Compose deployments, secrets are managed via environment variables in a `.env` file:

```bash
# Generate secrets
openssl rand -hex 32 > /dev/null  # Example: use for PG_PASSWORD, BRIDGE_SECRET

# Create .env from example
cp .env.example .env

# Set required secrets (NEVER commit .env to version control)
# PG_PASSWORD=<generated>
# ADMIN_PUBKEY=<from bootstrap-admin script>
# BRIDGE_SECRET=<generated>
# ARI_PASSWORD=<if using Asterisk>
```

**File permissions**:
```bash
chmod 600 .env
chown root:root .env
```

### Backup Strategy

```bash
# Database backup (encrypted, automated)
# Add to crontab: 0 3 * * * /opt/llamenos/backup.sh

#!/bin/bash
BACKUP_DIR=/opt/llamenos/backups
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/llamenos_$DATE.sql.gz.age"

# Dump and compress
docker compose exec -T postgres pg_dump -U llamenos llamenos \
  | gzip \
  | age -r "age1..." \  # Operator's age public key
  > "$BACKUP_FILE"

# Rotate: keep 30 days
find "$BACKUP_DIR" -name "*.age" -mtime +30 -delete

# Optional: upload to encrypted off-site storage
# rclone copy "$BACKUP_FILE" remote:llamenos-backups/
```

### Monitoring

- **Uptime monitoring**: Use an external service (UptimeRobot, Healthchecks.io) to ping `/api/health`
- **Log aggregation**: Docker logs are written to stdout; use `docker compose logs --follow` or ship to a log aggregator
- **Disk space alerts**: Monitor `/var/lib/docker` and PostgreSQL data directory
- **Certificate expiry**: Caddy handles automatic renewal; monitor for failures

---

## 2. Kubernetes Deployment (Helm Chart)

The Helm chart provides production-grade Kubernetes deployment with security defaults.

### Prerequisites

- Kubernetes 1.28+ with a CNI that enforces NetworkPolicy (Calico or Cilium recommended)
- Ingress controller (Caddy-ingress or Traefik recommended; nginx is NOT recommended due to its history of security vulnerabilities)
- cert-manager for TLS certificate management
- External Secrets Operator or Vault for secret injection (recommended)

### Security Defaults in the Helm Chart

The chart enforces these security contexts by default:

```yaml
# Pod security
runAsNonRoot: true
runAsUser: 1000
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
automountServiceAccountToken: false

# Network isolation
networkPolicy:
  enabled: true  # Default: true
  # App pod: ingress only from ingress controller
  # App pod: egress only to DNS, MinIO, Whisper, external HTTPS
  # MinIO pod: ingress only from app pod
```

### Required Values

```yaml
# values.yaml — minimum for production
config:
  adminPubkey: "<from bootstrap-admin>"
  environment: "production"

database:
  external: true
  host: "your-rds-instance.region.rds.amazonaws.com"
  port: 5432
  name: "llamenos"
  existingSecret: "llamenos-db-credentials"  # Use External Secrets Operator

ingress:
  enabled: true
  className: ""  # Use Caddy-ingress or Traefik; nginx is NOT recommended
  hosts:
    - host: hotline.yourdomain.org
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llamenos-tls
      hosts:
        - hotline.yourdomain.org

# Resource limits (adjust based on expected load)
resources:
  limits:
    cpu: "1"
    memory: "512Mi"
  requests:
    cpu: "250m"
    memory: "256Mi"
```

### Hardening Checklist for Kubernetes

- [ ] Enable etcd encryption at rest (for Kubernetes Secrets)
- [ ] Use External Secrets Operator or Vault — never store secrets in plaintext `values.yaml`
- [ ] Enable PodDisruptionBudget if running multiple replicas
- [ ] Configure Horizontal Pod Autoscaler for the app deployment
- [ ] Enable audit logging on the Kubernetes API server
- [ ] Use a service mesh (Linkerd or Istio) for mTLS between pods (optional but recommended)
- [ ] Restrict `kubectl` access with RBAC — separate admin and operator roles
- [ ] Run `kube-bench` to validate CIS Kubernetes Benchmark compliance

---

## 3. Cloudflare Workers Deployment

### Security Advantages

- No server to manage — no OS patching, no SSH keys to rotate
- DDoS protection included at the edge
- Durable Objects provide transactional consistency without database management
- R2 for encrypted file storage with no public access
- Automatic TLS with edge termination

### Security Considerations

- **Cloudflare is a trusted party**: They can access Worker memory, DO storage, and R2 blobs. E2EE ensures they cannot read note content.
- **Account security is critical**: Enable 2FA, use API tokens (not global key), restrict token permissions to the minimum required.
- **`workers_dev: false`** is set by default — do not change this (prevents alternate origin).
- **Secrets**: Use `wrangler secret put` — never put secrets in `wrangler.jsonc` or source control.

### Hardening Checklist for Cloudflare

- [ ] Enable 2FA on the Cloudflare account
- [ ] Use API tokens scoped to the specific Worker/account
- [ ] Enable Cloudflare Access or IP allowlisting for the Cloudflare dashboard
- [ ] Set up Cloudflare audit logs and alert on Worker deployments
- [ ] Use a separate Cloudflare account for the hotline (isolate from other projects)
- [ ] Enable Bot Management if available (additional call spam protection)
- [ ] Configure custom WAF rules for the API endpoints

---

## OpenTofu for Infrastructure-as-Code

For operators who want reproducible, version-controlled infrastructure, we provide OpenTofu modules for provisioning the VPS and networking layer.

### Why OpenTofu (Not Terraform)

OpenTofu is the open-source fork of Terraform maintained by the Linux Foundation. It is license-compatible with self-hosted open-source projects (MPL 2.0) and avoids the BSL licensing concerns of HashiCorp Terraform.

### VPS Provisioning with OpenTofu

```hcl
# main.tf — Hetzner Cloud example
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

resource "hcloud_server" "llamenos" {
  name        = "llamenos-hotline"
  image       = "ubuntu-24.04"
  server_type = "cpx21"  # 3 vCPU, 4GB RAM
  location    = "fsn1"   # Falkenstein, Germany

  ssh_keys = [hcloud_ssh_key.deploy.id]

  # Cloud-init for initial hardening
  user_data = file("${path.module}/cloud-init.yml")

  # Firewall
  firewall_ids = [hcloud_firewall.llamenos.id]
}

resource "hcloud_firewall" "llamenos" {
  name = "llamenos-fw"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.admin_ssh_cidrs  # Restrict SSH to known IPs
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]  # Caddy HTTP->HTTPS redirect
  }
}
```

### Workflow

The recommended end-to-end flow for a new deployment:

```bash
# 1. Provision infrastructure (optional -- skip if you created the VPS manually)
cd deploy/opentofu
tofu init
tofu plan -var-file=production.tfvars
tofu apply -var-file=production.tfvars

# 2. Harden the server
cd deploy/ansible
ansible-playbook -i inventory.yml playbooks/harden.yml

# 3. Deploy Llamenos
ansible-playbook -i inventory.yml playbooks/deploy.yml

# 4. Update (subsequent deploys)
ansible-playbook -i inventory.yml playbooks/update.yml
```

For the manual (non-Ansible) equivalent of each step, see the [Quick Start Guide](../QUICKSTART.md).

---

## Secure Ingress (Caddy)

Llamenos uses [Caddy](https://caddyserver.com/) as the reverse proxy and TLS termination layer for all deployment architectures. **nginx is NOT recommended** due to its history of security vulnerabilities (CVE-2021-23017, CVE-2022-41741, CVE-2023-44487, among others).

### Why Caddy

| Feature | Caddy | nginx |
|---------|-------|-------|
| Automatic ACME/Let's Encrypt | Built-in, zero-config | Requires certbot or external tooling |
| OCSP stapling | Automatic | Manual configuration |
| HTTP/2 + HTTP/3 | Enabled by default | HTTP/3 requires rebuild with quic patch |
| TLS 1.2+ enforcement | Default | Requires explicit `ssl_protocols` directive |
| Security headers | Simple `header` directive | Verbose `add_header` blocks |
| WebSocket proxy (for Nostr relay) | Automatic upgrade detection | Requires explicit `proxy_set_header Upgrade` |
| Memory safety | Written in Go (memory-safe) | Written in C (memory-unsafe) |

### Production Caddyfile

The Caddyfile in `deploy/docker/Caddyfile` provides:

- **Automatic TLS** via Let's Encrypt with OCSP stapling
- **Security headers**: HSTS (2 years, preload), X-Content-Type-Options, X-Frame-Options (DENY), Referrer-Policy, CSP, Permissions-Policy
- **Nostr relay WebSocket proxy**: `/nostr` → strfry (port 7777)
- **API/telephony/messaging reverse proxy**: `/api/*`, `/telephony/*`, `/messaging/*` → app (port 3000)
- **SPA fallback**: All other routes → app
- **Compression**: gzip + zstd

### Rate Limiting

For additional rate limiting at the ingress layer, add to the Caddyfile:

```
rate_limit {
    zone api_limit {
        key {remote_host}
        events 100
        window 1m
    }
}
```

Application-level rate limiting is already enforced on auth endpoints, but ingress-level rate limiting provides defense-in-depth.

---

## Nostr Relay Operations (strfry)

The Nostr relay handles all real-time event delivery (call notifications, presence updates, typing indicators). Two implementations are supported:

| Implementation | Deployment | Best For |
|---------------|------------|----------|
| **strfry** | Self-hosted (Docker, K8s, bare metal) | Maximum privacy — operator controls all infrastructure |
| **Nosflare** | Cloudflare Workers (DO service binding) | Managed infrastructure — no separate relay to operate |

### strfry Deployment

#### Docker Compose

The Nostr relay (strfry) is a core service that starts automatically with `docker compose up -d`.

Required environment variables:
```bash
# .env
SERVER_NOSTR_SECRET=<64-char hex, generate with: openssl rand -hex 32>
NOSTR_RELAY_URL=ws://strfry:7777  # Default, internal to Docker network
```

#### Kubernetes (StatefulSet)

The Helm chart includes a strfry StatefulSet (disabled by default):

```yaml
# values.yaml
nostr:
  enabled: true
  relayUrl: "ws://strfry:7777"
  persistence:
    size: 5Gi
```

Create the server Nostr secret:
```bash
kubectl create secret generic llamenos-nostr-secret \
  --from-literal=server-nostr-secret=$(openssl rand -hex 32)
```

#### Cloudflare (Nosflare)

For Cloudflare deployments, Nosflare runs as a Durable Object with a service binding. Set the server secret:
```bash
wrangler secret put SERVER_NOSTR_SECRET
```

### strfry Hardening

#### NIP-42 Authentication

strfry supports NIP-42 (client authentication). Configure the write policy to restrict which pubkeys can publish events:

```bash
# strfry write policy plugin (whitelist mode)
# Only the server pubkey and authenticated clients can publish
```

The server derives its Nostr keypair from `SERVER_NOSTR_SECRET` via HKDF (`LABEL_SERVER_NOSTR_KEY` / `LABEL_SERVER_NOSTR_KEY_INFO`). Clients authenticate to the relay using NIP-42 before subscribing.

#### Rate Limiting

strfry supports per-connection rate limiting. Configure in the strfry config:

- Max events per second per connection
- Max subscriptions per connection
- Max event size (default: 64KB)

#### Ephemeral Event Handling

Llamenos uses kind 20001 (ephemeral) for real-time events. strfry forwards these to active subscribers but **never stores them to disk**. This is a privacy feature — relay compromise does not reveal historical real-time events.

#### Generic Tags

All Llamenos events use `["t", "llamenos:event"]` as the only tag. The actual event type (call:ring, presence, typing, etc.) is inside the encrypted content. This prevents the relay operator from performing traffic analysis on event types.

### Monitoring

| Metric | How to Check |
|--------|-------------|
| Relay health | `curl http://strfry:7777` (returns relay info JSON) |
| Active connections | strfry logs (connection count) |
| Event throughput | strfry logs (events/second) |
| LMDB database size | `du -sh /app/strfry-db/` |
| Memory usage | `docker stats strfry` |

### Backup

strfry uses LMDB for storage. Back up the data directory:

```bash
# Docker Compose
docker compose exec strfry cp -r /app/strfry-db /tmp/strfry-backup

# Or back up the Docker volume directly
docker run --rm -v llamenos_nostr-data:/data -v /opt/llamenos/backups:/backup \
  alpine tar czf /backup/strfry-$(date +%Y%m%d).tar.gz -C /data .
```

For ephemeral-only deployments (all events are kind 20001), the relay database contains only relay state — no user data. Backup is recommended but not critical.

---

## Reproducible Build Verification

Epic 79 introduced reproducible builds to allow operators and auditors to verify that released client code matches the public source.

### Verification Process

```bash
# Download and run the verification script
scripts/verify-build.sh [version]

# Or manually:
# 1. Check out the tagged version
git checkout v1.0.0

# 2. Build in a deterministic Docker environment
docker build -f Dockerfile.build -t llamenos-verify .

# 3. Extract and compare checksums
docker run --rm llamenos-verify cat /app/CHECKSUMS.txt
# Compare against CHECKSUMS.txt in the GitHub Release
```

### Trust Anchor

The trust anchor is the **GitHub Release** — not the running application. The app does NOT serve a `/api/config/verify` endpoint because an attacker controlling the server could serve fake checksums. Always verify against release artifacts on GitHub.

### What Is Verified

| Artifact | Deterministic? | Verified? |
|----------|---------------|-----------|
| Client JS bundles | Yes (`SOURCE_DATE_EPOCH`, content-hashed filenames) | Yes |
| Client CSS bundles | Yes | Yes |
| Worker/server bundle (CF) | No (Cloudflare modifies during deploy) | No |
| Worker/server bundle (Node.js) | Yes | Yes (via Docker build) |

### CI Integration

GitHub Actions automatically:
1. Builds with `SOURCE_DATE_EPOCH` set to the commit timestamp
2. Generates `CHECKSUMS.txt` (SHA-256 of all output files)
3. Attaches `CHECKSUMS.txt` to the GitHub Release
4. Generates SLSA provenance attestation

---

## Operational Security Procedures

For detailed operational procedures including secret rotation steps, backup/recovery, incident response checklists, and troubleshooting guides, see the [Operator Runbook](../RUNBOOK.md).

### Key Management

1. **Admin keypair**: Generate with `bun run bootstrap-admin`. Store the nsec in a password manager or hardware security module. NEVER reuse this keypair on public Nostr relays or other services. Note: Epic 76.2 separates the admin identity key from the decryption key — see the [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md) for compromise procedures.

2. **Server Nostr secret**: Generate with `openssl rand -hex 32`. Set as `SERVER_NOSTR_SECRET` in `.env` (Docker) or `wrangler secret put SERVER_NOSTR_SECRET` (Cloudflare). The server derives its Nostr keypair from this secret via HKDF. Rotation changes the server's Nostr identity — all clients will see a new server pubkey.

3. **Hub key**: Generated automatically as `crypto.getRandomValues(32)` by the admin client during hub setup. Distributed via ECIES to each member individually. Rotation is handled via the admin UI — see [Key Revocation Runbook, Section 4](KEY_REVOCATION_RUNBOOK.md#4-hub-key-rotation-ceremony).

4. **Volunteer onboarding**: Use the invite system. Each volunteer generates their own keypair in-browser during onboarding. The nsec never leaves their device.

5. **Device decommissioning**: When a volunteer leaves, deactivate their account (revokes all sessions immediately), then rotate the hub key so the departed volunteer cannot decrypt future hub events. See [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md) for the full procedure.

### Incident Response

1. **Volunteer account compromise**:
   - Immediately deactivate the account in admin panel (sessions auto-revoked)
   - The compromised volunteer's V2 notes remain protected by forward secrecy — the attacker cannot decrypt past notes without the per-note ephemeral keys
   - V1 notes (if any) are exposed — migrate all V1 notes to V2 immediately
   - Generate a new invite for the volunteer to re-onboard with a fresh keypair

2. **Server compromise (Cloudflare/VPS)**:
   - E2EE notes are safe — server has no plaintext
   - Rotate all telephony credentials (Twilio auth token, etc.)
   - Rotate `ADMIN_PUBKEY` if the server had access to admin operations
   - Review audit logs for unauthorized actions during the compromise window
   - Notify volunteers to re-authenticate (their keys are client-side, not affected)

3. **CI/CD compromise**:
   - Rotate all GitHub repository secrets
   - Audit recent commits and deployments
   - Rebuild and redeploy from a known-good commit
   - Review GitHub Actions logs for unauthorized workflow runs

### Regular Maintenance

| Task | Frequency | How |
|------|-----------|-----|
| OS security updates | Daily (automated) | `unattended-upgrades` or Ansible |
| Dependency audit | Weekly | `bun audit` or Dependabot |
| TLS certificate renewal | Automatic | Caddy / cert-manager |
| Database backups | Daily | Automated script (encrypted) |
| Audit log review | Weekly | Admin panel or database query |
| Key rotation (telephony) | Quarterly | Regenerate provider API keys |
| Docker image updates | Monthly | Pull latest base images, rebuild |
| Penetration testing | Annually | Engage external security firm |

---

## Compliance Notes

### GDPR (EU)

- **Data controller**: The organization operating the hotline
- **Data processor**: Cloud provider (Cloudflare, VPS host)
- **Data processing agreement**: Required with the cloud provider
- **Right to erasure**: Admin can delete volunteer accounts and notes
- **Data minimization**: Phone numbers hashed, caller numbers not stored in plaintext
- **Encryption**: E2EE for notes satisfies Article 32 (security of processing)
- **Breach notification**: 72-hour window — monitor audit logs for unauthorized access

### HIPAA (US, if applicable)

- Llamenos does NOT claim HIPAA compliance out of the box
- If used in a healthcare context, additional BAAs with cloud providers are required
- Audit logging satisfies some HIPAA requirements
- E2EE notes satisfy the encryption at-rest and in-transit requirements

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-25 | 1.2 | ZK Architecture Overhaul: Added Secure Ingress (Caddy) section, Nostr Relay Operations (strfry) section, Reproducible Build Verification section; replaced nginx references with Caddy/Traefik recommendations; updated secrets management for SERVER_NOSTR_SECRET and hub key; updated K8s ingress className |
| 2026-02-23 | 1.1 | Added cross-references to QUICKSTART.md, RUNBOOK.md; updated Ansible tooling to reference in-repo paths at `deploy/ansible/`; documented playbook inventory and roles |
| 2026-02-23 | 1.0 | Initial deployment hardening guide |
