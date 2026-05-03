# Deployment Hardening Guide

**Version:** 2.1
**Date:** 2026-05-03

Security-focused deployment recommendations for Llamenos operators. Since Llamenos is self-hosted open-source software, the operator is responsible for infrastructure security. This document covers two deployment architectures.

**Related documents**:
- [Crypto Architecture](CRYPTO_ARCHITECTURE.md) — Cryptographic primitives and key hierarchy
- [Threat Model](THREAT_MODEL.md) — Adversary profiles, trust boundaries, and cryptographic guarantees
- [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md) — Emergency key management procedures
- [Incident Response](INCIDENT_RESPONSE.md) — Incident response runbook

## Architecture Overview

| Architecture | Best For | Complexity | Security Surface |
|---|---|---|---|
| **Docker Compose on VPS** | Small orgs (1–10 volunteers) | Low | Single server, all services co-located |
| **Kubernetes (Helm)** | Medium-large orgs (10–100+ volunteers) | High | Multi-node, network policies, pod isolation |

Both architectures provide E2EE for call notes, messages, and transcriptions. The security of the cryptographic layer is independent of the deployment model — the server never has access to plaintext note content regardless of where it runs.

**Note**: Cloudflare Workers is NOT a deployment target for the Llamenos backend. The backend runs on Bun + PostgreSQL (self-hosted). Cloudflare Pages hosts only the marketing site at `site/wrangler.jsonc`.

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

Ansible playbooks at `deploy/ansible/` automate VPS hardening and deployment. The hardening playbook (`playbooks/harden.yml`) applies roles in sequence:

```bash
cd deploy/ansible
cp inventory.example.yml inventory.yml
# Edit inventory.yml with VPS IP, SSH key, domain name

ansible-playbook -i inventory.yml playbooks/harden.yml
ansible-playbook -i inventory.yml playbooks/deploy.yml
```

The hardening playbook is idempotent and applies:

#### OS-Level Hardening (role: `common`, `ssh-hardening`, `kernel-hardening`)
- **Unattended security updates** (security-only sources)
- **SSH hardening**: Keys-only auth (no passwords), custom port, `MaxAuthTries 3`, `MaxSessions 3`, `AllowUsers` whitelist, curve25519 KEX, chacha20-poly1305 ciphers
- **Kernel hardening** (sysctl):
  ```
  net.ipv4.tcp_syncookies = 1                  # SYN flood protection
  net.ipv4.conf.all.rp_filter = 1              # Strict reverse path filtering
  net.ipv4.conf.all.accept_redirects = 0        # Ignore ICMP redirects
  net.ipv4.conf.all.send_redirects = 0
  net.ipv6.conf.all.accept_redirects = 0
  net.ipv4.conf.all.log_martians = 1
  kernel.kptr_restrict = 2                      # Hide kernel pointers
  kernel.dmesg_restrict = 1
  kernel.perf_event_paranoid = 3
  kernel.unprivileged_bpf_disabled = 1          # Prevent eBPF container escape
  fs.protected_hardlinks = 1
  fs.protected_symlinks = 1
  fs.suid_dumpable = 0                          # Core dumps disabled
  ```
- **Core dump disable**: `* hard core 0` in limits.d

#### Firewall (role: `firewall`)
- UFW default deny incoming
- Allow: SSH (custom port, restricted CIDRs), 80/tcp (ACME), 443/tcp+udp (HTTPS + HTTP/3 QUIC)

#### Fail2ban (role: `fail2ban`)
- SSH jail: 3 attempts, 1-hour ban
- Aggressive jail: 3 attempts in 30 min, 24-hour ban
- UFW integration for blocking

#### Docker Hardening (role: `docker`)
- Official Docker CE from signed repository
- `userns-remap: dockremap` (user namespace isolation)
- `no-new-privileges` default security option
- JSON log driver with rotation
- Docker socket not exposed to containers

#### Security Scanning (role: `security-scan`)
- Trivy container vulnerability scanning (CRITICAL/HIGH)
- CycloneDX SBOM generation
- Automated security update timer

### Docker Compose Services

The base compose (`deploy/docker/docker-compose.yml`) runs:

| Service | Image | Network | Security |
|---------|-------|---------|----------|
| **app** | Bun (port 3000) | internal + web | Read-only rootfs, 64MB tmpfs |
| **postgres** | PostgreSQL 17-alpine (SHA256-pinned) | internal | Health checks, internal-only |
| **caddy** | Caddy 2.9-alpine | web | TLS termination, security headers |
| **rustfs** | S3-compatible storage | internal | Console API on 9001 (disable in prod) |
| **strfry** | Nostr relay 1.0.1 | internal + web | WebSocket relay |

Optional profiles: `--profile signal`, `--profile telephony`, `--profile monitoring`, `--profile transcription`.

The production overlay (`deploy/docker/docker-compose.production.yml`) adds:
- `security_opt: no-new-privileges:true` on all containers
- Resource limits (app: 1GB/1CPU, postgres: 512MB/1CPU, caddy: 256MB/0.5CPU)
- Watchtower for automatic image updates

### Network Isolation

```
┌─────────────┐
│ Public (web) │ ← Caddy (443) ← Internet
├─────────────┤
│ Internal     │ ← app ↔ postgres ↔ rustfs ↔ strfry
│ (172.17.0.0) │   (no external access)
└─────────────┘
```

### Secrets Management

```bash
# Generate secrets (NEVER commit .env to version control)
openssl rand -hex 32  # PG_PASSWORD
openssl rand -hex 32  # SERVER_NOSTR_SECRET (must be exactly 64 hex chars)
openssl rand -hex 32  # HMAC_SECRET (64 hex chars)

# Required in .env:
# PG_PASSWORD, ADMIN_PUBKEY, SERVER_NOSTR_SECRET, HMAC_SECRET
# MINIO_ACCESS_KEY, MINIO_SECRET_KEY, ARI_PASSWORD, BRIDGE_SECRET

chmod 600 .env
chown root:root .env
```

### Backup Strategy

The Ansible backup role (`playbooks/backup.yml`) provides automated encrypted backups:

```bash
# Database backup (encrypted with age)
docker compose exec -T postgres pg_dump -U llamenos llamenos \
  | gzip \
  | age -r "age1..." \
  > "$BACKUP_DIR/llamenos_$(date +%Y%m%d_%H%M%S).sql.gz.age"

# Rotate: keep 30 days
find "$BACKUP_DIR" -name "*.age" -mtime +30 -delete
```

Additional backup roles: `backup-postgres/`, `backup-rustfs/`, `backup-strfry/`, `backup-config/`, `backup-monitor/`.

### Monitoring

- **Health probes**: `/api/health/ready` and `/api/health/live` (Docker health checks at 15s intervals)
- **Lightweight monitoring**: `llamenos-healthcheck` role — polls `/api/health/ready`, sends failure alerts via ntfy
- **Full observability stack** (optional roles): Prometheus + Grafana + Loki + Alertmanager
- **Metrics endpoint**: `/api/metrics/prometheus` (bearer token protected)

---

## 2. Kubernetes Deployment (Helm Chart)

The Helm chart at `deploy/helm/llamenos/` provides production-grade Kubernetes deployment.

### Prerequisites

- Kubernetes 1.28+ with a CNI that enforces NetworkPolicy (Calico or Cilium recommended)
- Ingress controller (Caddy-ingress or Traefik recommended; nginx is NOT recommended)
- cert-manager for TLS certificate management
- External Secrets Operator or Vault for secret injection (recommended)

### Security Defaults in the Helm Chart

```yaml
# Pod security (all pods)
runAsNonRoot: true
runAsUser: 1000
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
automountServiceAccountToken: false
```

### NetworkPolicy (Enabled by Default)

```
App pod:
  Ingress: from ingress controller on 3000/tcp
  Egress: DNS, RustFS (9000), Strfry (7777), Whisper (8080),
          PostgreSQL (external, 5432), External HTTPS (443)

RustFS pod:
  Ingress: from app pod only (9000/tcp)
  Egress: none

Strfry pod:
  Ingress: from app pod (7777/tcp) + ingress controller (/nostr)
  Egress: none
```

### Health Probes

- **Liveness**: `/api/health/live` (15s interval, 3 retries)
- **Readiness**: `/api/health/ready` (10s interval, 3 retries)
- **Startup**: `/api/health/live` (5s interval, 30 retries = 150s grace period)

### Required Values

```yaml
# values.yaml — minimum for production
app:
  replicas: 2
  env:
    ENVIRONMENT: production

postgres:
  host: "your-rds-instance.region.rds.amazonaws.com"

ingress:
  enabled: true
  className: ""  # Caddy-ingress or Traefik; nginx NOT recommended
  hosts:
    - host: hotline.yourdomain.org
  tls:
    - secretName: llamenos-tls
      hosts: [hotline.yourdomain.org]

networkPolicy:
  enabled: true

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPU: 70
  targetMem: 80
```

### Hardening Checklist

- [ ] Enable etcd encryption at rest (for Kubernetes Secrets)
- [ ] Use External Secrets Operator or Vault — never store secrets in plaintext `values.yaml`
- [ ] PodDisruptionBudget configured (Helm template: `pdb.yaml`)
- [ ] HPA configured if running multiple replicas (Helm template: `hpa.yaml`)
- [ ] Enable audit logging on the Kubernetes API server
- [ ] `helm lint` passes
- [ ] `kubectl` access restricted with RBAC

---

## Secure Ingress (Caddy)

Caddy is the reverse proxy and TLS termination layer for all deployments.

### Why Caddy (Not nginx)

| Feature | Caddy | nginx |
|---------|-------|-------|
| Automatic ACME/Let's Encrypt | Built-in, zero-config | Requires certbot |
| OCSP stapling | Automatic | Manual configuration |
| HTTP/2 + HTTP/3 | Default | HTTP/3 requires rebuild |
| Memory safety | Go | C (memory-unsafe) |
| WebSocket proxy | Automatic detection | Requires explicit headers |

### Development Caddyfile (`deploy/docker/Caddyfile`)

Single-origin setup with security headers:
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://{domain}/nostr
Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(), usb=()
Server: (removed)
```

### Production Caddyfile (`deploy/docker/Caddyfile.production`)

**Tier 4 split-origin architecture** with 5 distinct domains:

| Domain | Purpose | Key CSP |
|--------|---------|---------|
| `app.{domain}` | SPA static files | `script-src 'self'`; COEP: require-corp |
| `api.{domain}` | Backend API + WebSocket | Rate limiting: 10r/m auth, 5r/m register |
| `crypto.{domain}` | Sandboxed crypto iframe | **`connect-src 'none'`** (HARD INVARIANT — zero network access) |
| `downloads.{domain}` | Desktop release artifacts | `script-src 'none'` |
| `updates.{domain}` | Tauri updater metadata | CORS for app.* only |

The `crypto.{domain}` origin enforces `connect-src 'none'` — the crypto iframe cannot make any network requests. This is a defense-in-depth measure ensuring that even if the crypto code is compromised, it cannot exfiltrate keys.

---

## Nostr Relay Operations (strfry)

The Nostr relay handles all real-time event delivery (call notifications, presence, typing indicators).

### Configuration

Production config at `deploy/docker/strfry-prod.conf`:
- Max event size: 64KB
- Reject events older than 300 seconds (5 minutes) or newer than 30 seconds
- Ephemeral event TTL: 300 seconds (5 minutes)
- Max 10 subscriptions per connection
- Negentropy enabled for efficient sync
- Compression enabled

### Write-Policy Plugin

`deploy/docker/write-policy.sh` runs as a strfry write-policy subprocess:

```bash
writePolicy {
    plugin = "/app/write-policy.sh"
}
```

The plugin enforces:
- **Server pubkey whitelist**: Only the server's derived Nostr pubkey (`ALLOWED_PUBKEY` env var) may publish events
- **NIP-42 passthrough**: Auth events (kind 22242) are always accepted from any pubkey — required for client authentication
- **All other publishers rejected**: Returns `"action": "reject"` with reason `"unauthorized publisher"`

Set `ALLOWED_PUBKEY` to the server's Nostr pubkey (derived from `SERVER_NOSTR_SECRET` via HKDF at startup). The docker-compose.yml mounts the plugin read-only:

```yaml
volumes:
  - ./write-policy.sh:/app/write-policy.sh:ro
```

### Security Properties

- **Ephemeral events** (kind 20001): Never stored to disk — forwarded to active subscribers only
- **Generic tags**: All events use `["t", "llamenos:event"]` — relay cannot distinguish event types
- **Content encryption**: All event content encrypted with epoch-rotating server event key (XChaCha20-Poly1305 + HKDF, 24h epoch rotation) with per-hub key scoping
- **NIP-42 auth**: Server authenticates to relay on connect; clients authenticate before subscribing
- **Publisher verification**: Write-policy rejects all non-server publishers

### Signal-First Delivery Configuration

The messaging delivery router (`apps/worker/messaging/delivery-router.ts`) supports two configuration keys in hub messaging config:

| Key | Default | Purpose |
|-----|---------|---------|
| `preferSignalDelivery` | `true` | Route to Signal when recipient is registered; fallback to SMS/other on failure |
| `smsContentMode` | `'notification-only'` | When `'notification-only'`, SMS body is replaced with a generic "new message" notification; full content sent only via Signal or WhatsApp |

`smsContentMode: 'notification-only'` is the default. This means SMS recipients see "You have a new message" instead of the message body, preventing message content from appearing in SMS provider logs. Set to `'full'` only if you accept provider-side plaintext exposure.

### Internal TLS

The `internal-tls` Ansible role generates a self-signed CA and per-host certificates for cross-host service communication (PostgreSQL, RustFS, strfry). Certificates include DNS SAN + IP SAN, valid for 1 year.

---

## Key Management

1. **Admin device keys**: Generated via `bun run bootstrap-admin` on a trusted device. Store securely (HSM or hardened device). Admin has separate Ed25519 signing and X25519 encryption keys.

2. **Server Nostr secret**: `openssl rand -hex 32`. Set as `SERVER_NOSTR_SECRET`. Must be exactly 64 hex chars. Server derives its Nostr keypair via HKDF.

3. **Hub key**: Random 32 bytes, generated by admin client during hub setup. HPKE-wrapped per member (label: `LABEL_HUB_KEY_WRAP`). Rotation handled via admin UI — see [Key Revocation Runbook, Section 4](KEY_REVOCATION_RUNBOOK.md#4-hub-key-rotation-ceremony).

4. **User onboarding**: Invite system. Each user generates their own Ed25519/X25519 device keys during onboarding. Device authorized via sigchain entry signed by an existing authorized device.

5. **Device decommissioning**: Deactivate user → revoke sessions → deauthorize device via sigchain → rotate hub key → rotate PUK (exclude departed user). See [Key Revocation Runbook](KEY_REVOCATION_RUNBOOK.md).

---

## Reproducible Build Verification

```bash
scripts/verify-build.sh [version]

# Manual:
git checkout v1.0.0
docker build -f Dockerfile.build -t llamenos-verify .
docker run --rm llamenos-verify cat /app/CHECKSUMS.txt
# Compare against CHECKSUMS.txt in GitHub Release
```

Trust anchor is the **GitHub Release** (not the running application). CI generates `CHECKSUMS.txt` (SHA-256), SLSA provenance attestation, and SBOM.

---

## Regular Maintenance

| Task | Frequency | How |
|------|-----------|-----|
| OS security updates | Daily (automated) | `unattended-upgrades` or Ansible |
| Container vulnerability scan | Weekly | Trivy via `security-scan` role |
| Dependency audit | Weekly | `bun audit` / `cargo audit` |
| TLS certificate renewal | Automatic | Caddy / cert-manager |
| Database backups | Daily | Ansible backup roles (encrypted with age) |
| Audit log review | Weekly | Admin panel or database query |
| Key rotation (telephony) | Quarterly | Regenerate provider API keys |
| Docker image updates | Monthly | Pull latest pinned images, rebuild |
| Penetration testing | Annually | Engage external security firm |
| Hub key rotation | On departure + quarterly | Admin UI or CLI |

---

## Compliance Notes

### GDPR (EU)

- **Data controller**: The organization operating the hotline
- **Data processor**: VPS hosting provider
- **Data processing agreement**: Required with the hosting provider
- **Right to erasure**: Admin can delete user accounts and notes. Sigchain deauthorization is permanent.
- **Data minimization**: Phone numbers hashed, caller numbers not stored in plaintext, blind indexes for CMS search
- **Encryption**: E2EE for notes satisfies Article 32 (security of processing)
- **Breach notification**: 72-hour window — monitor audit logs for unauthorized access

### HIPAA (US, if applicable)

- Llamenos does NOT claim HIPAA compliance out of the box
- E2EE notes satisfy encryption at-rest and in-transit requirements
- Audit logging satisfies some HIPAA requirements
- Additional BAAs with hosting providers required if used in healthcare context

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-03 | 2.1 | Post-hardening: strfry write-policy plugin configuration + ALLOWED_PUBKEY setup; corrected event age limits (300s, not 24h); Signal-first delivery and SMS notification-only mode config; updated hub event encryption cipher (XChaCha20-Poly1305 + epoch rotation) |
| 2026-05-02 | 2.0 | Complete rewrite: removed Cloudflare Workers section (backend is Bun+PostgreSQL, not CF Workers), updated to match actual deploy/ configs (Ansible roles, Docker Compose overlays, Helm templates, Caddyfile.production), HPKE replaces ECIES, device keys replace nsec, added sigchain/PUK references, added split-origin production Caddyfile, added internal TLS, added security scanning role |
| 2026-02-25 | 1.2 | Added Caddy section, Nostr relay operations, reproducible builds |
| 2026-02-23 | 1.0 | Initial deployment hardening guide |
