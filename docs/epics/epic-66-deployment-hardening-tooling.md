# Epic 66: Deployment Hardening Tooling

## Overview

Create infrastructure-as-code tooling for operators to deploy Llamenos securely on self-hosted infrastructure. This addresses the fact that Llamenos is an open-source, self-hosted project where operators may not be Linux security specialists. Providing turnkey hardened deployment reduces the risk of misconfiguration.

## Motivation

Security Audit R6 identified that the deployment surface is the weakest link for most operators. The application's E2EE architecture is strong, but a misconfigured VPS (open SSH, no firewall, default credentials) undermines the entire security model. We should provide tooling that makes the secure path the easy path.

## Prior Art: matrix-docker-ansible-deploy

The Matrix project officially recommends [matrix-docker-ansible-deploy](https://github.com/spantaleev/matrix-docker-ansible-deploy) — an Ansible playbook that handles everything from VPS hardening to Docker Compose deployment to automatic updates. This is the gold standard for self-hosted open-source projects and the model we should follow.

Key lessons from their approach:
- **Single `setup.yml` playbook** that handles initial setup, updates, and configuration changes idempotently
- **Role-based Ansible structure** with granular tags (e.g., `--tags=setup-all`, `--tags=setup-postgres`)
- **`vars.yml`** as the single operator-facing configuration file (all secrets in Ansible Vault)
- **Provider-agnostic** — works on any server with SSH access and a supported OS
- **Self-contained documentation** — every configurable option is documented inline

## Architecture Decision: Ansible + Optional OpenTofu

**Ansible** as the primary deployment tool (inspired by matrix-docker-ansible-deploy):
- Single entry point: `just setup-all` or `ansible-playbook -i inventory setup.yml`
- Idempotent server hardening (SSH, firewall, kernel params, Docker)
- Application deployment, updates, and rollbacks
- Secret management via Ansible Vault
- Automated encrypted backups
- Works across all hosting providers (Hetzner, OVH, DigitalOcean, bare metal)

**OpenTofu** as an optional infrastructure provisioning layer:
- For operators who want infrastructure-as-code VPS creation
- Not required — many operators will provision VPS manually via provider dashboard
- Generates the Ansible inventory file as output

**Why not just Docker Compose?** Docker Compose handles the application, but it doesn't harden the host OS, configure firewalls, manage SSH keys, or handle TLS certificates. Ansible fills that gap. Without it, operators must manually follow a hardening checklist, which is error-prone.

**Why not Kubernetes for small deployments?** Kubernetes adds operational complexity that small organizations (1-10 volunteers) don't need. Docker Compose + Caddy + Ansible is simpler and equally secure for single-server deployments. The Helm chart exists for organizations that already run Kubernetes.

**Why Ansible over a shell script?** Ansible is idempotent (safe to re-run), has built-in secret management (Vault), handles SSH connection management, and produces readable audit logs. A shell script would be simpler but fragile and non-idempotent.

## Tasks

### Phase 1: Ansible Playbooks

#### 1.1: VPS Hardening Playbook (`deploy/ansible/playbooks/harden.yml`)

Automated server hardening:
- SSH hardening (disable password auth, disable root, custom port, AllowUsers)
- UFW firewall (allow 22, 80, 443 only)
- Kernel sysctl hardening (rp_filter, disable redirects, restrict dmesg/kptr)
- Fail2ban for SSH brute-force protection
- Unattended security updates
- Audit logging (auditd)
- Docker hardening (userns-remap, no-new-privileges, content trust)
- Disable unused services
- NTP configuration (for Schnorr token timestamp validation)

#### 1.2: Application Deployment Playbook (`deploy/ansible/playbooks/deploy.yml`)

Automated Llamenos deployment:
- Pull Docker images (or build from source)
- Generate `.env` from Ansible vault variables
- Start Docker Compose stack
- Wait for health check
- Run initial admin bootstrap (optional)
- Configure Caddy with the operator's domain

#### 1.3: Update Playbook (`deploy/ansible/playbooks/update.yml`)

Rolling updates:
- Pull latest images
- Database backup before update
- Run storage migrations
- Restart services with zero-downtime (Caddy handles connection draining)
- Verify health check post-update
- Rollback on failure

#### 1.4: Backup Playbook (`deploy/ansible/playbooks/backup.yml`)

Automated encrypted backups:
- PostgreSQL dump (compressed, encrypted with age)
- R2/RustFS bucket sync
- Retention policy (30 days default)
- Optional remote backup (rclone to S3-compatible storage)

#### 1.5: Inventory and Variables

```yaml
# deploy/ansible/inventory.example.yml
all:
  hosts:
    llamenos:
      ansible_host: <VPS_IP>
      ansible_user: deploy
      ansible_ssh_private_key_file: ~/.ssh/llamenos_deploy

  vars:
    domain: hotline.yourdomain.org
    admin_email: admin@yourdomain.org
    ssh_port: 2222
    admin_ssh_cidrs:
      - "YOUR_IP/32"

    # Application config
    llamenos_image: ghcr.io/llamenos/llamenos:latest
    admin_pubkey: "<from bootstrap-admin>"
    hotline_name: "Hotline"

    # Telephony (encrypted in Ansible Vault)
    # twilio_account_sid: "..."
    # twilio_auth_token: "..."
```

### Phase 2: OpenTofu Modules

#### 2.1: Hetzner Cloud Module (`deploy/opentofu/modules/hetzner/`)

- Server provisioning (CPX21 or configurable)
- SSH key management
- Firewall rules (cloud-level, before UFW)
- Cloud-init for initial bootstrap
- Floating IP (optional, for high availability)

#### 2.2: Generic VPS Module (`deploy/opentofu/modules/generic/`)

- SSH connection provisioner
- Ansible inventory generation
- DNS record management (Cloudflare, Route53, or generic)

#### 2.3: Root Module (`deploy/opentofu/main.tf`)

- Combines provider-specific module with generic provisioning
- Outputs the Ansible inventory file
- Stores state in encrypted backend (S3 + KMS, or local with age encryption)

### Phase 3: Documentation

#### 3.1: Quick Start Guide (`docs/QUICKSTART.md`)

Step-by-step guide for first-time operators:
1. Prerequisites (domain, cloud account, SSH key)
2. Provision VPS (OpenTofu or manual)
3. Harden server (Ansible)
4. Deploy application (Ansible)
5. Bootstrap admin account
6. Configure telephony provider
7. Invite first volunteer

#### 3.2: Update `DEPLOYMENT_HARDENING.md`

Link to the new tooling from the security deployment guide. Add provider-specific notes for Hetzner, OVH, and Greenhost.

#### 3.3: Operator Runbook (`docs/RUNBOOK.md`)

Procedures for common operational tasks:
- Secret rotation
- Certificate renewal troubleshooting
- Database recovery from backup
- Volunteer account recovery
- Incident response checklist

## Acceptance Criteria

- [ ] Ansible playbooks tested on a fresh Ubuntu 24.04 VPS
- [ ] OpenTofu module provisions a Hetzner server end-to-end
- [ ] Full deployment from scratch completes in under 15 minutes
- [ ] `harden.yml` passes CIS Ubuntu Benchmark Level 1 (spot-checked)
- [ ] Documentation covers all three deployment architectures
- [ ] Secrets are never stored in plaintext in any IaC file
