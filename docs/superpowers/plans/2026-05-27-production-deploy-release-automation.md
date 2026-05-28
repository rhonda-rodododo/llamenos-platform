# Production Deployment & Release Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Llamenos to production on 1984 Hosting with two deployment profiles (self-hoster default, official), desktop update server, DNS migration from Cloudflare to 1984, automated Android Play Console internal track publishing, and operational runbooks.

**Architecture:** Single Ansible playbook (`deploy.yml`) with a `deployment_profile` variable controlling which roles are included. Official-only roles (update server, monitoring, DNS validation) are conditionally enabled. CI workflows mirror the existing demo deploy pattern. Desktop update artifacts already upload to RustFS via `tauri-release.yml` — the update server role just adds Caddy site blocks to serve them. Android automation wires the existing Fastlane `internal` lane into the release-publish trigger.

**Tech Stack:** Ansible 2.15+, Docker Compose V2, Caddy, OpenTofu, GitHub Actions, Fastlane, knope

---

## File Map

### New Files

| File | Purpose |
|---|---|
| `deploy/scripts/deploy-self-hosted.sh` | Wrapper script for self-hoster profile — prompts for vars, runs playbook |
| `deploy/scripts/deploy-official.sh` | Wrapper script for official profile — vault-encrypted vars, full stack |
| `deploy/ansible/roles/llamenos-update-server/tasks/main.yml` | Ansible role: Caddy site blocks for update server |
| `deploy/ansible/roles/llamenos-update-server/templates/compose/update-server.j2` | Docker Compose template for update Caddy sidecar |
| `deploy/ansible/roles/llamenos-update-server/templates/caddy/Caddyfile.updates.j2` | Caddyfile for updates/releases subdomains |
| `deploy/ansible/roles/llamenos-update-server/handlers/main.yml` | Restart handler |
| `.github/workflows/deploy-prod.yml` | Production deploy workflow (manual dispatch) |
| `docs/runbooks/deploy-self-hosted.md` | Self-hoster deployment guide |
| `docs/runbooks/deploy-official.md` | Official deployment guide |
| `docs/runbooks/dns-migration.md` | DNS cutover from Cloudflare to 1984 |
| `docs/runbooks/desktop-update-release.md` | Desktop update server operations |
| `docs/runbooks/android-release.md` | Android release procedures |
| `docs/runbooks/rollback.md` | Rollback procedures |
| `docs/runbooks/disaster-recovery.md` | DR procedures |

### Modified Files

| File | Change |
|---|---|
| `deploy/ansible/vars.yml` | Add `deployment_profile`, update server vars, DNS vars |
| `deploy/ansible/playbooks/deploy.yml` | Add conditional includes for official-only roles |
| `deploy/ansible/playbooks/preflight.yml` | Add DNS validation for official profile |
| `deploy/ansible/playbooks/smoke-check.yml` | Add update server health check for official profile |
| `.github/workflows/mobile-release.yml` | Add release-publish trigger, switch to Fastlane `internal` lane |
| `deploy/opentofu/modules/1984hosting/main.tf` | Add DNS record documentation/management |
| `deploy/PRODUCTION_CHECKLIST.md` | Reference runbooks instead of duplicating procedures |

---

## Task 1: Deployment Profile Variable & Conditional Roles

**Files:**
- Modify: `deploy/ansible/vars.yml`
- Modify: `deploy/ansible/playbooks/deploy.yml`

- [ ] **Step 1: Add deployment_profile variable to vars.yml**

Open `deploy/ansible/vars.yml` and add the profile variable at the top of the file, after any existing variable block:

```yaml
# Deployment profile: "self-hoster" (default) or "official"
# self-hoster: app + postgres + rustfs + caddy + hardening + backups
# official: self-hoster + update server + monitoring + signal notifier + DNS validation
deployment_profile: "self-hoster"
```

- [ ] **Step 2: Add official-only feature flags to vars.yml**

Add these variables below the profile variable, with comments explaining the relationship:

```yaml
# Official-profile feature flags (auto-enabled when deployment_profile == "official")
# These can also be set independently for custom configurations
llamenos_update_server_enabled: "{{ deployment_profile == 'official' }}"
llamenos_monitoring_enabled: "{{ deployment_profile == 'official' }}"
llamenos_signal_enabled: "{{ deployment_profile == 'official' }}"
llamenos_dns_validation_enabled: "{{ deployment_profile == 'official' }}"

# Update server configuration (only used when llamenos_update_server_enabled)
updates_domain: "updates.{{ domain }}"
releases_domain: "releases.{{ domain }}"
update_artifacts_dir: "{{ app_dir }}/services/update-server/artifacts"
```

- [ ] **Step 3: Add update-server role to deploy.yml**

Open `deploy/ansible/playbooks/deploy.yml`. After the `llamenos-caddy` role include, add the update server role. Follow the exact pattern used by other conditional roles (e.g., `llamenos-whisper`, `llamenos-signal`):

```yaml
    - role: llamenos-update-server
      tags: [update-server, deploy]
      when:
        - llamenos_update_server_enabled | default(false) | bool
        - inventory_hostname in groups.get('llamenos_proxy', [])
```

- [ ] **Step 4: Add monitoring roles conditional on profile**

Verify the existing monitoring roles (`llamenos-prometheus`, `llamenos-grafana`, `llamenos-alertmanager`, `llamenos-loki`, `llamenos-node-exporter`, `llamenos-promtail`) already have `llamenos_*_enabled` guards. If they use separate flags, add a comment noting they're auto-enabled by the official profile. If any lack guards, add:

```yaml
      when:
        - llamenos_monitoring_enabled | default(false) | bool
```

- [ ] **Step 5: Commit**

```bash
git add deploy/ansible/vars.yml deploy/ansible/playbooks/deploy.yml
git commit -m "feat(deploy): add deployment_profile variable with official/self-hoster conditional roles"
```

---

## Task 2: Update Server Ansible Role

**Files:**
- Create: `deploy/ansible/roles/llamenos-update-server/tasks/main.yml`
- Create: `deploy/ansible/roles/llamenos-update-server/templates/caddy/Caddyfile.updates.j2`
- Create: `deploy/ansible/roles/llamenos-update-server/handlers/main.yml`

- [ ] **Step 1: Create role directory structure**

```bash
mkdir -p deploy/ansible/roles/llamenos-update-server/{tasks,templates/caddy,handlers}
```

- [ ] **Step 2: Write tasks/main.yml**

Follow the pattern from `llamenos-caddy` role — skip check, create dirs, template config, start service.

```yaml
---
# llamenos-update-server: serves desktop update manifests and artifacts via Caddy
# Only enabled in "official" deployment profile

- name: Skip update-server if not enabled
  meta: end_play
  when: not (llamenos_update_server_enabled | default(false) | bool)

- name: Create update server directories
  ansible.builtin.file:
    path: "{{ item }}"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0755"
  loop:
    - "{{ update_artifacts_dir }}"
    - "{{ update_artifacts_dir }}/desktop"
    - "{{ app_dir }}/services/update-server"

- name: Template update server Caddyfile
  ansible.builtin.template:
    src: caddy/Caddyfile.updates.j2
    dest: "{{ app_dir }}/services/update-server/Caddyfile"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0644"
  notify: Restart update-server

- name: Template update server compose file
  ansible.builtin.copy:
    dest: "{{ app_dir }}/services/update-server/docker-compose.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0644"
    content: |
      services:
        update-server:
          image: caddy:2-alpine
          restart: unless-stopped
          ports:
            - "127.0.0.1:3080:80"
            - "127.0.0.1:3443:443"
          volumes:
            - ./Caddyfile:/etc/caddy/Caddyfile:ro
            - {{ update_artifacts_dir }}:/srv/updates:ro
            - caddy_data:/data
            - caddy_config:/config
          read_only: true
          security_opt:
            - no-new-privileges:true
          healthcheck:
            test: ["CMD", "wget", "--spider", "-q", "http://localhost:80/health"]
            interval: 30s
            timeout: 5s
            retries: 3
      volumes:
        caddy_data:
        caddy_config:
  notify: Restart update-server

- name: Start update server
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/update-server"
    state: present
```

- [ ] **Step 3: Write Caddyfile template**

```
# Caddyfile.updates.j2 — serves desktop update manifests and artifacts
# Domains: {{ updates_domain }}, {{ releases_domain }}

{{ updates_domain }}, {{ releases_domain }} {
    root * /srv/updates/desktop

    # Serve latest.json and artifact files
    file_server {
        browse
    }

    # Health endpoint for smoke checks
    handle /health {
        respond "ok" 200
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Cache-Control "public, max-age=60"
    }

    # Cache update manifest more aggressively
    @manifest path /desktop/latest.json
    header @manifest Cache-Control "public, max-age=30"

    log {
        output file /var/log/caddy/updates-access.log
        format json
    }
}
```

Save to `deploy/ansible/roles/llamenos-update-server/templates/caddy/Caddyfile.updates.j2`.

- [ ] **Step 4: Write handlers/main.yml**

```yaml
---
- name: Restart update-server
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/update-server"
    state: present
    recreate: always
```

- [ ] **Step 5: Commit**

```bash
git add deploy/ansible/roles/llamenos-update-server/
git commit -m "feat(deploy): add llamenos-update-server Ansible role for desktop update hosting"
```

---

## Task 3: Wrapper Scripts

**Files:**
- Create: `deploy/scripts/deploy-self-hosted.sh`
- Create: `deploy/scripts/deploy-official.sh`

- [ ] **Step 1: Create deploy/scripts/ directory**

```bash
mkdir -p deploy/scripts
```

- [ ] **Step 2: Write deploy-self-hosted.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# deploy-self-hosted.sh — Deploy Llamenos with self-hoster profile (default)
# Usage: ./deploy-self-hosted.sh [--check] [ansible-playbook extra args...]
#
# This script prompts for required configuration if vars.yml is not present,
# then runs the Ansible playbook with the self-hoster profile.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_DIR="$(cd "$SCRIPT_DIR/../ansible" && pwd)"
VARS_FILE="$ANSIBLE_DIR/vars.yml"
INVENTORY_FILE="$ANSIBLE_DIR/inventory.yml"

check_dependencies() {
  for cmd in ansible-playbook ssh; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Error: $cmd is required but not installed." >&2
      exit 1
    fi
  done
}

prompt_if_missing() {
  if [[ ! -f "$VARS_FILE" ]]; then
    echo "No vars.yml found. Creating from template..."
    echo ""
    read -rp "Domain (e.g., llamenos.example.com): " domain
    read -rp "ACME email for TLS certs: " acme_email
    read -rp "Server IP address: " server_ip
    read -rp "SSH user (default: deploy): " ssh_user
    ssh_user="${ssh_user:-deploy}"

    # Generate secrets
    db_password="$(openssl rand -hex 24)"
    hmac_secret="$(openssl rand -hex 32)"
    server_secret="$(openssl rand -hex 32)"
    storage_key="$(openssl rand -hex 24)"

    cat > "$VARS_FILE" <<VARS
deployment_profile: "self-hoster"
domain: "$domain"
acme_email: "$acme_email"
app_dir: /opt/llamenos
deploy_user: "$ssh_user"
deploy_group: "$ssh_user"

llamenos_postgres_password: "$db_password"
llamenos_hmac_secret: "$hmac_secret"
llamenos_server_secret: "$server_secret"
llamenos_storage_access_key: "$storage_key"
VARS

    cat > "$INVENTORY_FILE" <<INV
all:
  children:
    llamenos_servers:
      hosts:
        vps1:
          ansible_host: $server_ip
          ansible_user: $ssh_user
          ansible_ssh_private_key_file: ~/.ssh/id_ed25519
    llamenos_app:
      hosts:
        vps1: {}
    llamenos_db:
      hosts:
        vps1: {}
    llamenos_proxy:
      hosts:
        vps1: {}
    llamenos_storage:
      hosts:
        vps1: {}
INV

    echo ""
    echo "Generated vars.yml and inventory.yml"
    echo "Review them before proceeding: $VARS_FILE"
    echo ""
    read -rp "Continue with deployment? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy] ]] || exit 0
  fi
}

main() {
  check_dependencies
  prompt_if_missing

  echo "Deploying Llamenos (self-hoster profile)..."
  echo ""

  cd "$ANSIBLE_DIR"
  ansible-playbook setup.yml \
    -i inventory.yml \
    -e "@vars.yml" \
    -e "deployment_profile=self-hoster" \
    "$@"
}

main "$@"
```

- [ ] **Step 3: Write deploy-official.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# deploy-official.sh — Deploy Llamenos with official profile (full stack)
# Usage: ./deploy-official.sh [--check] [ansible-playbook extra args...]
#
# Requires vault-encrypted vars and inventory. For the Llamenos project's
# production server only — self-hosters should use deploy-self-hosted.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_DIR="$(cd "$SCRIPT_DIR/../ansible" && pwd)"

check_dependencies() {
  for cmd in ansible-playbook ansible-vault ssh; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Error: $cmd is required but not installed." >&2
      exit 1
    fi
  done
}

validate_vault() {
  local vault_file="$ANSIBLE_DIR/vars-production.yml"
  if [[ ! -f "$vault_file" ]]; then
    echo "Error: $vault_file not found." >&2
    echo "Create it with: ansible-vault create $vault_file" >&2
    exit 1
  fi

  if ! head -1 "$vault_file" | grep -q '^\$ANSIBLE_VAULT'; then
    echo "Error: $vault_file is not vault-encrypted." >&2
    echo "Encrypt it with: ansible-vault encrypt $vault_file" >&2
    exit 1
  fi
}

main() {
  check_dependencies
  validate_vault

  echo "Deploying Llamenos (official profile)..."
  echo "This includes: app, update server, monitoring, signal notifier, DNS validation"
  echo ""

  cd "$ANSIBLE_DIR"
  ansible-playbook setup.yml \
    -i inventory-production.yml \
    -e "@vars-production.yml" \
    -e "deployment_profile=official" \
    --ask-vault-pass \
    "$@"
}

main "$@"
```

- [ ] **Step 4: Make scripts executable**

```bash
chmod +x deploy/scripts/deploy-self-hosted.sh deploy/scripts/deploy-official.sh
```

- [ ] **Step 5: Commit**

```bash
git add deploy/scripts/
git commit -m "feat(deploy): add wrapper scripts for self-hosted and official deployment profiles"
```

---

## Task 4: Production Deploy CI Workflow

**Files:**
- Create: `.github/workflows/deploy-prod.yml`

- [ ] **Step 1: Write the workflow**

Model this on `.github/workflows/deploy-demo.yml` but targeting the `production` GitHub Environment:

```yaml
name: Deploy Production

on:
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683

      - name: Install Ansible
        run: |
          sudo apt-get update
          sudo apt-get install -y ansible

      - name: Write inventory
        run: echo "${{ secrets.PROD_INVENTORY_YML }}" > deploy/ansible/inventory-production.yml

      - name: Write vault password
        run: echo "${{ secrets.ANSIBLE_VAULT_PASSWORD }}" > /tmp/vault-pass.txt

      - name: Write encrypted vars
        run: echo "${{ secrets.PROD_VARS_YML_ENCRYPTED }}" > deploy/ansible/vars-production.yml

      - name: Setup SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.PROD_SSH_PRIVATE_KEY }}" > ~/.ssh/id_deploy
          chmod 600 ~/.ssh/id_deploy
          ssh-keyscan -H "${{ secrets.PROD_SERVER_IP }}" >> ~/.ssh/known_hosts 2>/dev/null

      - name: Run preflight
        working-directory: deploy/ansible
        run: |
          ansible-playbook playbooks/preflight.yml \
            -i inventory-production.yml \
            -e "@vars-production.yml" \
            -e "deployment_profile=official" \
            --vault-password-file /tmp/vault-pass.txt \
            --private-key ~/.ssh/id_deploy

      - name: Deploy
        working-directory: deploy/ansible
        run: |
          ansible-playbook setup.yml \
            -i inventory-production.yml \
            -e "@vars-production.yml" \
            -e "deployment_profile=official" \
            --vault-password-file /tmp/vault-pass.txt \
            --private-key ~/.ssh/id_deploy

      - name: Smoke check
        working-directory: deploy/ansible
        run: |
          ansible-playbook playbooks/smoke-check.yml \
            -i inventory-production.yml \
            -e "@vars-production.yml" \
            -e "deployment_profile=official" \
            --vault-password-file /tmp/vault-pass.txt \
            --private-key ~/.ssh/id_deploy

      - name: Cleanup secrets
        if: always()
        run: |
          rm -f /tmp/vault-pass.txt ~/.ssh/id_deploy
          rm -f deploy/ansible/inventory-production.yml deploy/ansible/vars-production.yml
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "feat(ci): add production deploy workflow with GitHub Environment gating"
```

---

## Task 5: DNS Preflight Validation & OpenTofu Documentation

**Files:**
- Modify: `deploy/ansible/playbooks/preflight.yml`
- Modify: `deploy/ansible/playbooks/smoke-check.yml`
- Modify: `deploy/opentofu/modules/1984hosting/main.tf`

- [ ] **Step 1: Add DNS validation to preflight.yml**

Add a new task block to `deploy/ansible/playbooks/preflight.yml`, after the existing variable validation tasks. This only runs for the official profile:

```yaml
# DNS validation (official profile only)
- name: Validate DNS records point to this server
  when:
    - llamenos_dns_validation_enabled | default(false) | bool
  block:
    - name: Resolve API domain
      ansible.builtin.command: dig +short {{ api_subdomain }}.{{ domain }} A
      register: api_dns
      changed_when: false

    - name: Resolve updates domain
      ansible.builtin.command: dig +short {{ updates_domain }} A
      register: updates_dns
      changed_when: false

    - name: Resolve releases domain
      ansible.builtin.command: dig +short {{ releases_domain }} A
      register: releases_dns
      changed_when: false

    - name: Get server public IP
      ansible.builtin.command: curl -s https://ifconfig.me
      register: server_ip
      changed_when: false

    - name: Assert DNS records match server IP
      ansible.builtin.assert:
        that:
          - api_dns.stdout | trim == server_ip.stdout | trim
          - updates_dns.stdout | trim == server_ip.stdout | trim
          - releases_dns.stdout | trim == server_ip.stdout | trim
        fail_msg: >-
          DNS mismatch detected. Expected all domains to resolve to {{ server_ip.stdout | trim }}.
          api={{ api_dns.stdout | trim }},
          updates={{ updates_dns.stdout | trim }},
          releases={{ releases_dns.stdout | trim }}.
          Check 1984 DNS configuration.
```

- [ ] **Step 2: Add update server health check to smoke-check.yml**

Add after existing health checks:

```yaml
    - name: Check update server health (official only)
      ansible.builtin.uri:
        url: "http://localhost:3080/health"
        return_content: true
      register: update_health
      failed_when: update_health.content != "ok"
      when: llamenos_update_server_enabled | default(false) | bool
```

- [ ] **Step 3: Update OpenTofu 1984 module documentation**

Add DNS record management documentation to `deploy/opentofu/modules/1984hosting/main.tf`. Since 1984 doesn't have a Terraform provider, this is manual documentation:

```hcl
# DNS Records (managed via 1984 Hosting control panel)
#
# Required DNS records at 1984 Hosting (https://1984.hosting/domains/):
#
# Type  | Name               | Value              | TTL
# A     | api.llamenos.org   | <server_ipv4>      | 300 (lower to 60 before migration, raise to 3600 after)
# A     | updates.llamenos.org | <server_ipv4>    | 300
# A     | releases.llamenos.org | <server_ipv4>   | 300
# AAAA  | api.llamenos.org   | <server_ipv6>      | 300 (if available)
# AAAA  | updates.llamenos.org | <server_ipv6>    | 300
# AAAA  | releases.llamenos.org | <server_ipv6>   | 300
#
# Migration from Cloudflare:
# 1. Lower TTLs to 60s on Cloudflare
# 2. Wait for old TTL to expire
# 3. Update NS records at registrar to point to 1984 nameservers
# 4. Create A/AAAA records in 1984 panel
# 5. Verify propagation: dig +trace api.llamenos.org
# 6. Raise TTLs to 3600 after propagation confirmed
# 7. Retire FLOKInet server after 48h monitoring
```

- [ ] **Step 4: Commit**

```bash
git add deploy/ansible/playbooks/preflight.yml deploy/ansible/playbooks/smoke-check.yml deploy/opentofu/modules/1984hosting/main.tf
git commit -m "feat(deploy): add DNS preflight validation and update server smoke check for official profile"
```

---

## Task 6: Android Play Console CI Automation

**Files:**
- Modify: `.github/workflows/mobile-release.yml`

- [ ] **Step 1: Add release-publish trigger**

Open `.github/workflows/mobile-release.yml`. Add the release trigger alongside the existing triggers (keep `workflow_dispatch` for manual runs):

```yaml
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: "Version to release (e.g., 1.2.3)"
        required: false
```

- [ ] **Step 2: Replace upload-google-play action with Fastlane**

In the `build-android` job, find the Play Store upload step (currently using `r0adkll/upload-google-play` action). Replace it with:

```yaml
      - name: Setup Ruby
        uses: ruby/setup-ruby@13e7a03dc3ac6c3798f4570bfead2aed4d96abfb
        with:
          ruby-version: '3.3'
          bundler-cache: true
          working-directory: apps/android

      - name: Upload to Play Console internal track
        working-directory: apps/android
        env:
          GOOGLE_PLAY_JSON_KEY: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
        run: |
          echo "$GOOGLE_PLAY_JSON_KEY" > /tmp/play-key.json
          SUPPLY_JSON_KEY=/tmp/play-key.json bundle exec fastlane android internal
          rm -f /tmp/play-key.json
```

- [ ] **Step 3: Add version resolution for release trigger**

Add a step early in the job that resolves the version from either the release tag or the manual input:

```yaml
      - name: Resolve version
        id: version
        run: |
          if [[ "${{ github.event_name }}" == "release" ]]; then
            echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"
          elif [[ -n "${{ inputs.version }}" ]]; then
            echo "version=${{ inputs.version }}" >> "$GITHUB_OUTPUT"
          else
            echo "version=$(jq -r .version package.json)" >> "$GITHUB_OUTPUT"
          fi
```

- [ ] **Step 4: Guard Play Console upload behind environment**

Add `environment: android-release` to the `build-android` job to ensure secrets are only available in the gated environment:

```yaml
  build-android:
    runs-on: ubuntu-latest
    environment: android-release
    timeout-minutes: 45
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/mobile-release.yml
git commit -m "feat(ci): automate Android internal track upload via Fastlane on release publish"
```

---

## Task 7: Runbook — Self-Hosted Deployment

**Files:**
- Create: `docs/runbooks/deploy-self-hosted.md`

- [ ] **Step 1: Write the runbook**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/deploy-self-hosted.md
git commit -m "docs: add self-hosted deployment runbook"
```

---

## Task 8: Runbook — Official Deployment

**Files:**
- Create: `docs/runbooks/deploy-official.md`

- [ ] **Step 1: Write the runbook**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/deploy-official.md
git commit -m "docs: add official server deployment runbook"
```

---

## Task 9: Runbook — DNS Migration

**Files:**
- Create: `docs/runbooks/dns-migration.md`

- [ ] **Step 1: Write the runbook**

```markdown
# DNS Migration: Cloudflare to 1984 Hosting

## Purpose

Migrate DNS for `api.llamenos.org`, `updates.llamenos.org`, and `releases.llamenos.org` from Cloudflare to 1984 Hosting DNS.

## Prerequisites

- 1984 Hosting account with DNS management enabled
- Access to Cloudflare dashboard (current DNS)
- Access to domain registrar (for NS record changes)
- 1984 VPS already provisioned and accessible

## Steps

### Phase 1: Preparation (1 day before cutover)

#### 1. Lower TTLs on Cloudflare

In Cloudflare DNS dashboard, set TTL to 60 seconds for:
- `api.llamenos.org` A record
- `updates.llamenos.org` A record (if exists)
- `releases.llamenos.org` A record (if exists)

#### 2. Document current records

```bash
dig +short api.llamenos.org A
dig +short api.llamenos.org AAAA
# Record all values for rollback
```

#### 3. Create records in 1984 panel

Log into 1984 Hosting control panel > Domains > DNS Management:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | api | `<1984_VPS_IPv4>` | 300 |
| A | updates | `<1984_VPS_IPv4>` | 300 |
| A | releases | `<1984_VPS_IPv4>` | 300 |
| AAAA | api | `<1984_VPS_IPv6>` | 300 |
| AAAA | updates | `<1984_VPS_IPv6>` | 300 |
| AAAA | releases | `<1984_VPS_IPv6>` | 300 |

### Phase 2: Cutover

#### 4. Update NS records at registrar

Change nameservers from Cloudflare to 1984 Hosting nameservers. Find 1984's nameservers in their control panel.

#### 5. Verify propagation

```bash
# Check from multiple resolvers
for ns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  echo "=== $ns ==="
  dig @$ns +short api.llamenos.org A
  dig @$ns +short updates.llamenos.org A
  dig @$ns +short releases.llamenos.org A
done

# Full trace
dig +trace api.llamenos.org
```

#### 6. Run Ansible preflight DNS validation

```bash
./deploy/scripts/deploy-official.sh --tags preflight
```

Expected: all DNS assertions pass.

### Phase 3: Stabilization

#### 7. Raise TTLs

After 24h of stable operation, update TTLs to 3600 in 1984 panel.

#### 8. Retire FLOKInet

After 48h monitoring:
- Verify no traffic reaches FLOKInet server
- Decommission FLOKInet VPS
- Remove FLOKInet from any remaining configuration

## Rollback

If issues arise during cutover:

1. Revert NS records at registrar to Cloudflare nameservers
2. Cloudflare records are still present (not deleted) — traffic resumes within TTL
3. Investigate and retry migration

## Verification

```bash
# All three domains resolve to 1984 VPS IP
curl -s https://api.llamenos.org/api/health/ready
curl -s https://updates.llamenos.org/health
curl -s https://releases.llamenos.org/desktop/latest.json | jq .version
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/dns-migration.md
git commit -m "docs: add DNS migration runbook (Cloudflare to 1984)"
```

---

## Task 10: Runbook — Desktop Update Release

**Files:**
- Create: `docs/runbooks/desktop-update-release.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Desktop Update Release Operations

## Purpose

How desktop updates are published to the update server, and how to manually re-upload if needed.

## Automated Flow (CI)

When a GitHub Release is published, `tauri-release.yml` automatically:

1. Builds desktop artifacts for macOS (universal), Windows (x64), Linux (x86_64)
2. Signs artifacts with Ed25519 (`TAURI_SIGNING_PRIVATE_KEY`)
3. Generates `latest.json` manifest via `scripts/generate-update-manifest.ts`
4. Uploads artifacts + manifest to RustFS S3 bucket via AWS CLI
5. Desktop clients poll `https://updates.llamenos.org/desktop/latest.json` for new versions
6. Tauri updater verifies Ed25519 signature before applying

## Manifest Format

```json
{
  "version": "1.2.3",
  "notes": "Release notes here",
  "pub_date": "2026-05-27T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<ed25519_sig>",
      "url": "https://releases.llamenos.org/desktop/llamenos_1.2.3_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "<ed25519_sig>",
      "url": "https://releases.llamenos.org/desktop/llamenos_1.2.3_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<ed25519_sig>",
      "url": "https://releases.llamenos.org/desktop/llamenos_1.2.3_x64-setup.nsis.zip"
    }
  }
}
```

## Manual Re-upload

If CI fails or you need to manually publish:

### 1. Build artifacts locally

```bash
bun run tauri:build
```

### 2. Generate manifest

```bash
TAURI_SIGNING_PRIVATE_KEY="<key>" bun run scripts/generate-update-manifest.ts dist/artifacts
```

### 3. Upload to server

```bash
rsync -avz dist/artifacts/ deploy@<1984_VPS_IP>:/opt/llamenos/services/update-server/artifacts/desktop/
```

### 4. Verify

```bash
curl https://updates.llamenos.org/desktop/latest.json | jq .version
# Should show the new version
```

## Anti-Rollback

The Tauri updater in `src/client/lib/updater.ts` enforces a version floor — clients reject updates with a version lower than their current version. This prevents downgrade attacks even if `latest.json` is tampered with (signature verification would also catch this).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/desktop-update-release.md
git commit -m "docs: add desktop update release operations runbook"
```

---

## Task 11: Runbook — Android Release

**Files:**
- Create: `docs/runbooks/android-release.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Android Release Procedures

## Purpose

How Android builds are published to the Play Console internal testing track (automated) and promoted to production (manual).

## Internal Track (Automated)

When a GitHub Release is published, `mobile-release.yml` automatically:

1. Builds a signed AAB with Gradle
2. Uploads to Play Console internal testing track via Fastlane
3. Internal testers receive the update automatically

### Required GitHub Secrets (android-release environment)

| Secret | Description |
|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service account JSON key |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Signing key alias |
| `KEY_PASSWORD` | Signing key password |

### Manual internal release

If CI fails or you need to push manually:

```bash
cd apps/android

# Build signed AAB
./gradlew bundleRelease

# Upload via Fastlane
SUPPLY_JSON_KEY=/path/to/play-key.json bundle exec fastlane android internal
```

## Production Promote (Manual — Local Only)

Production promotion is intentionally manual. Signing keys never leave the operator's machine.

### Steps

#### 1. Verify internal track is stable

Check Play Console > Internal testing > Review the build. Confirm:
- No crash spikes in the internal track
- All internal testers have verified the build

#### 2. Promote to production

```bash
cd apps/android
SUPPLY_JSON_KEY=/path/to/play-key.json bundle exec fastlane android promote_to_production
```

#### 3. Verify in Play Console

- Check Play Console > Production > Release dashboard
- Confirm the correct version is rolling out
- Monitor crash-free rate for 24h

## Version Management

- `versionName` is managed by knope (e.g., `1.2.3`)
- `versionCode` in CI is overridden by `github.run_number` for monotonic Play Store compliance
- Never manually edit version values — use `bun run version:bump <major|minor|patch>`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Upload rejected by Play Store | versionCode not monotonic | Check `github.run_number` — ensure it's higher than last upload |
| Signing error | Wrong keystore | Verify `ANDROID_KEYSTORE_BASE64` matches the upload key registered with Play Console |
| Fastlane auth failure | Expired service account | Regenerate key in Google Cloud Console, update secret |
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/android-release.md
git commit -m "docs: add Android release procedures runbook"
```

---

## Task 12: Runbook — Rollback

**Files:**
- Create: `docs/runbooks/rollback.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Rollback Procedures

## Purpose

Roll back a failed deployment to the previous working state.

## Application Rollback

### Via Ansible (recommended)

```bash
cd deploy/ansible
ansible-playbook playbooks/rollback.yml \
  -i inventory.yml \
  -e "@vars.yml" \
  -e "rollback_to_image=ghcr.io/rhonda-rodododo/llamenos:<previous_tag>"
```

### Manual Docker rollback

```bash
ssh deploy@<server>

# Find previous image
docker images | grep llamenos

# Update compose to previous image and restart
cd /opt/llamenos/services/app
# Edit docker-compose.yml to set previous image tag
docker compose up -d

# Verify health
curl http://localhost:3000/api/health/ready
```

## Database Migration Rollback

If a deployment included a database migration that needs reverting:

```bash
ssh deploy@<server>

# Connect to database
docker exec -it $(docker ps -q -f name=postgres) psql -U llamenos

# Check current migration state
SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;
```

Drizzle does not auto-generate down migrations. If rollback is needed:
1. Write a manual rollback SQL script
2. Test against a backup copy first
3. Apply to production

## Version Pinning

To prevent automatic updates via Watchtower, pin a specific image version:

```bash
ssh deploy@<server>
cd /opt/llamenos/services/app

# Edit docker-compose.yml: change image tag from :latest to :v1.2.3
docker compose up -d

# Disable Watchtower for this service (if running)
docker compose -f /opt/llamenos/services/watchtower/docker-compose.yml stop
```

## Verification After Rollback

```bash
# Health check
curl https://api.llamenos.org/api/health/ready

# Check running version
curl https://api.llamenos.org/api/health/ready | jq .version

# Check logs for errors
ssh deploy@<server> docker logs --tail 50 $(docker ps -q -f name=app)
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/rollback.md
git commit -m "docs: add rollback procedures runbook"
```

---

## Task 13: Runbook — Disaster Recovery

**Files:**
- Create: `docs/runbooks/disaster-recovery.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Disaster Recovery

## Purpose

Recover the Llamenos platform from a complete server loss.

## Recovery Targets

| Metric | Target |
|---|---|
| RTO (Recovery Time Objective) | 2 hours |
| RPO (Recovery Point Objective) | 24 hours (daily backups) |

## Prerequisites

- Access to backup storage (rclone remote configured)
- 1984 Hosting account (or alternative VPS provider)
- Ansible vault password
- SSH key for deployment

## Full Recovery Procedure

### 1. Provision new VPS

Follow the OpenTofu module docs at `deploy/opentofu/modules/1984hosting/main.tf`:
- Order VPS at 1984 Hosting (Debian 13, 4GB+ RAM)
- Add SSH key
- Note public IPv4/IPv6

### 2. Update DNS

Update A/AAAA records for `api`, `updates`, `releases` subdomains to new VPS IP.

### 3. Restore backups

```bash
# List available backups
rclone ls <remote>:llamenos-backups/

# Download latest backup
rclone copy <remote>:llamenos-backups/<latest_date>/ /tmp/restore/
```

### 4. Run deployment

```bash
./deploy/scripts/deploy-official.sh
```

### 5. Restore database

```bash
# Copy backup to server
scp /tmp/restore/postgres-backup.sql.gz deploy@<new_ip>:/tmp/

# Restore
ssh deploy@<new_ip>
docker exec -i $(docker ps -q -f name=postgres) \
  sh -c 'gunzip -c /tmp/postgres-backup.sql.gz | psql -U llamenos'
```

### 6. Restore file storage

```bash
# Copy RustFS data
rsync -avz /tmp/restore/rustfs-data/ deploy@<new_ip>:/opt/llamenos/data/rustfs/
```

### 7. Verify

```bash
curl https://api.llamenos.org/api/health/ready
curl https://updates.llamenos.org/health

# Run smoke check
cd deploy/ansible
ansible-playbook playbooks/smoke-check.yml -i inventory-production.yml -e "@vars-production.yml" --ask-vault-pass
```

## Backup Verification

The Ansible `backup` role runs daily encrypted backups to off-site storage via rclone. Verify backups are running:

```bash
ssh deploy@<server>

# Check last backup timestamp
ls -la /opt/llamenos/backups/

# Check rclone sync status
rclone ls <remote>:llamenos-backups/ | tail -5
```

## Restore Testing

Test the restore procedure quarterly using `deploy/ansible/playbooks/test-restore.yml`:

```bash
ansible-playbook playbooks/test-restore.yml -i inventory.yml -e "@vars.yml"
```

This provisions a temporary server, restores from backup, runs health checks, and tears down.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/disaster-recovery.md
git commit -m "docs: add disaster recovery runbook"
```

---

## Task 14: Update Production Checklist

**Files:**
- Modify: `deploy/PRODUCTION_CHECKLIST.md`

- [ ] **Step 1: Add runbook references**

At the top of `deploy/PRODUCTION_CHECKLIST.md`, add a section linking to the new runbooks:

```markdown
## Operational Runbooks

Detailed procedures are in `docs/runbooks/`:

- [Self-Hosted Deployment](../docs/runbooks/deploy-self-hosted.md) — first-time setup for self-hosters
- [Official Deployment](../docs/runbooks/deploy-official.md) — production server deployment
- [DNS Migration](../docs/runbooks/dns-migration.md) — Cloudflare to 1984 cutover
- [Desktop Update Release](../docs/runbooks/desktop-update-release.md) — update server operations
- [Android Release](../docs/runbooks/android-release.md) — Play Console procedures
- [Rollback](../docs/runbooks/rollback.md) — rollback procedures
- [Disaster Recovery](../docs/runbooks/disaster-recovery.md) — full server recovery
```

- [ ] **Step 2: Remove duplicated procedures**

Review the rest of `PRODUCTION_CHECKLIST.md` for any procedures that are now covered by runbooks. Replace duplicated content with a reference: "See [runbook name](link) for detailed steps."

Do NOT remove checklist items that are verification checkboxes — only remove step-by-step procedures that are duplicated.

- [ ] **Step 3: Commit**

```bash
git add deploy/PRODUCTION_CHECKLIST.md
git commit -m "docs: update production checklist with runbook references"
```

---

## Dependency Graph

```
Task 1 (profiles + vars) ─── must complete before ──→ Task 2 (update server role)
                         └── must complete before ──→ Task 3 (wrapper scripts)
                         └── must complete before ──→ Task 4 (CI workflow)
                         └── must complete before ──→ Task 5 (DNS preflight)

Task 2 + Task 3 + Task 4 + Task 5 ── can run in parallel after Task 1

Task 6 (Android CI) ────────── independent, can run anytime

Tasks 7-13 (Runbooks) ──────── independent, can run in parallel
                                (ideally after Tasks 1-6 for accuracy)

Task 14 (Checklist update) ── after Tasks 7-13
```

**Parallelism opportunities:**
- After Task 1 completes: Tasks 2, 3, 4, 5 can all be dispatched in parallel
- Task 6 (Android CI) is fully independent — dispatch anytime
- Tasks 7-13 (runbooks) are independent of each other — dispatch in parallel
- Task 14 depends on Tasks 7-13
