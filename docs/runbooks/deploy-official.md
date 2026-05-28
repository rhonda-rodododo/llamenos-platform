# Official Server Deployment Guide

## Purpose

Deploy the Llamenos project's production server on 1984 Hosting (Iceland). Includes the full stack: app, update server, monitoring, and signal notifier.

## Prerequisites

- **1984 VPS:** Provisioned with Debian 13, SSH key added, FDE configured (see OpenTofu module docs)
- **DNS:** A/AAAA records for `api.llamenos.org`, `updates.llamenos.org`, `releases.llamenos.org` pointing to VPS IP
- **Ansible Vault:** Password shared among maintainers via secure channel
- **GitHub Environment:** `production` environment configured with required secrets

### Required GitHub Secrets (production environment)

| Secret | Description |
|---|---|
| `PROD_INVENTORY_YML` | Ansible inventory (server IP, SSH config) |
| `PROD_VARS_YML_ENCRYPTED` | Vault-encrypted vars (all passwords, keys, domains) |
| `ANSIBLE_VAULT_PASSWORD` | Vault decryption password |
| `PROD_SSH_PRIVATE_KEY` | SSH key for deploy user |
| `PROD_SERVER_IP` | VPS IP for ssh-keyscan |

## Steps

### First-time setup

#### 1. Create vault-encrypted vars

```bash
cd deploy/ansible
ansible-vault create vars-production.yml
```

Include all variables from `vars.yml` template plus official-profile vars:
- `deployment_profile: "official"`
- `domain: "llamenos.org"`
- `updates_domain: "updates.llamenos.org"`
- `releases_domain: "releases.llamenos.org"`
- All passwords and secrets (generate with `openssl rand -hex 32`)

#### 2. Create production inventory

```bash
cat > inventory-production.yml <<'EOF'
all:
  children:
    llamenos_servers:
      hosts:
        iceland:
          ansible_host: <1984_VPS_IP>
          ansible_user: deploy
          ansible_ssh_private_key_file: ~/.ssh/id_ed25519
    llamenos_app:
      hosts: { iceland: {} }
    llamenos_db:
      hosts: { iceland: {} }
    llamenos_proxy:
      hosts: { iceland: {} }
    llamenos_storage:
      hosts: { iceland: {} }
    llamenos_relay:
      hosts: { iceland: {} }
EOF
```

#### 3. Deploy

```bash
./deploy/scripts/deploy-official.sh
```

Or via CI: trigger the `Deploy Production` workflow from GitHub Actions.

### Subsequent updates

Via CI (recommended): GitHub Actions > Deploy Production > Run workflow

Via CLI: `./deploy/scripts/deploy-official.sh`

Single service: `./deploy/scripts/deploy-official.sh --tags app`

## Verification

```bash
# API health
curl https://api.llamenos.org/api/health/ready

# Update server
curl https://updates.llamenos.org/health

# Desktop update manifest
curl https://updates.llamenos.org/desktop/latest.json
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Vault password error | Wrong password | Verify with `ansible-vault view vars-production.yml` |
| DNS preflight fails | Records not propagated | `dig +short api.llamenos.org` — wait for propagation |
| Update server 502 | Caddy not running | `ssh deploy@<ip> docker compose -f /opt/llamenos/services/update-server/docker-compose.yml up -d` |
