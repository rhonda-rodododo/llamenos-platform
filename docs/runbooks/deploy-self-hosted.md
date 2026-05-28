# Self-Hosted Deployment Guide

## Purpose

Deploy a standalone Llamenos instance on your own server. This guide covers first-time setup and subsequent updates.

## Prerequisites

- **Server:** Debian 12+ or Ubuntu 22.04/24.04, 2+ CPU cores, 4GB+ RAM, 40GB+ disk
- **DNS:** A record pointing your domain to the server IP (e.g., `llamenos.example.com`)
- **SSH:** Key-based access to the server as a non-root user with sudo
- **Local tools:** `ansible` (2.15+), `ssh`, `openssl`

## Steps

### 1. Clone the repository

```bash
git clone https://github.com/rhonda-rodododo/llamenos-platform.git
cd llamenos-platform
```

### 2. Run the deploy script

```bash
./deploy/scripts/deploy-self-hosted.sh
```

The script will:
- Check that Ansible and SSH are available
- Prompt for your domain, email, server IP, and SSH user (if no `vars.yml` exists)
- Generate secure random passwords for PostgreSQL, HMAC, and storage keys
- Create `vars.yml` and `inventory.yml`
- Run preflight validation, deployment, and smoke checks

### 3. Review generated configuration

Before confirming deployment, review:
- `deploy/ansible/vars.yml` — all configuration values
- `deploy/ansible/inventory.yml` — server connection details

### 4. Verify deployment

After the script completes, verify:

```bash
# Health check
curl https://your-domain.com/api/health/ready
# Expected: {"status":"ok"}

# TLS certificate
curl -vI https://your-domain.com 2>&1 | grep "subject:"
```

### 5. Generate admin keypair

```bash
bun run bootstrap-admin
```

Save the output — this is your admin key for first login.

## Updates

Re-run the deploy script to update:

```bash
./deploy/scripts/deploy-self-hosted.sh
```

Or update only the app:

```bash
cd deploy/ansible
ansible-playbook setup.yml -i inventory.yml -e "@vars.yml" --tags app
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Preflight fails on SSH | Key not authorized | `ssh-copy-id user@server` |
| Health check times out | Caddy TLS provisioning | Wait 2 minutes, check `docker logs caddy` |
| Port 443 blocked | Firewall | `sudo ufw allow 443/tcp` (done automatically by playbook) |
| Database connection refused | PostgreSQL not started | `docker compose -f /opt/llamenos/services/postgres/docker-compose.yml up -d` |
