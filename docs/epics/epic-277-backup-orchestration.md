# Epic 277: Backup Orchestration for Distributed Deployments
> **Note**: MinIO has been replaced by RustFS as of PR #40. All references to MinIO in this document should be read as RustFS.


**Status**: PENDING
**Priority**: High
**Depends on**: Epic 276
**Blocks**: None
**Branch**: `desktop`

## Summary

Extend the backup system from single-host PostgreSQL-only dumps to a distributed backup orchestration that handles PostgreSQL, RustFS, strfry (LMDB), and application config across multiple hosts. Add backup health monitoring with staleness alerts, centralized backup aggregation, and a cross-host restore playbook that can provision a fresh deployment from backups.

## Problem Statement

The current `roles/backup/tasks/main.yml` has three limitations:

1. **Single-host assumption.** The backup script runs `docker compose exec -T postgres pg_dump` on the same host. In a multi-host deployment (Epic 276), PostgreSQL may run on a different machine than the app. The backup script has no concept of which host holds which data.

2. **Missing data sources.** Only PostgreSQL and RustFS are backed up. The strfry Nostr relay stores events in LMDB (`nostr-data` volume) which is not backed up. Application configuration (Caddyfile, compose files, non-secret settings) is not backed up, meaning a bare-metal restore requires re-running Ansible from scratch.

3. **No backup health monitoring.** If the cron job silently fails (disk full, Docker socket error, age encryption failure), operators have no way to know until they need a restore. For a crisis hotline serving vulnerable populations, undetected backup failure is unacceptable.

Evidence: The current `backup.sh` template writes to `backup.log` but nothing reads it. The `test-restore.yml` playbook validates restore works but is manually triggered — there is no automated freshness check.

## Implementation

### Phase 1: Per-Host Backup Roles

Create per-service backup tasks that run on the host where each service lives.

**File: `deploy/ansible/roles/backup-postgres/tasks/main.yml`**

```yaml
---
# PostgreSQL backup — runs on the host in [llamenos_db] group

- name: Skip if postgres not on this host
  ansible.builtin.meta: end_host
  when: >
    groups.get('llamenos_db', []) | length > 0 and
    inventory_hostname not in groups.get('llamenos_db', groups['llamenos_servers'])

- name: Create postgres backup script
  ansible.builtin.template:
    src: backup/postgres-backup.sh.j2
    dest: "{{ app_dir }}/scripts/backup-postgres.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure postgres backup cron
  ansible.builtin.cron:
    name: "Llamenos PostgreSQL backup"
    user: "{{ deploy_user }}"
    hour: "{{ backup_cron_hour }}"
    minute: "{{ backup_cron_minute }}"
    job: "{{ app_dir }}/scripts/backup-postgres.sh >> {{ app_dir }}/backups/postgres-backup.log 2>&1"
    state: "{{ 'present' if backup_enabled else 'absent' }}"
```

**File: `deploy/ansible/templates/backup/postgres-backup.sh.j2`**

```bash
#!/usr/bin/env bash
# PostgreSQL Backup — managed by Ansible
set -euo pipefail

BACKUP_DIR="{{ app_dir }}/backups"
AGE_RECIPIENT="{{ backup_age_public_key }}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_TYPE="${1:-daily}"
STATUS_FILE="{{ app_dir }}/backups/.backup-status-postgres.json"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [postgres] $*"; }
report_status() {
  local status="$1" size="${2:-0}" error="${3:-}"
  cat > "${STATUS_FILE}" <<EOFSTATUS
{
  "service": "postgres",
  "status": "${status}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size_bytes": ${size},
  "error": "${error}",
  "host": "{{ inventory_hostname }}"
}
EOFSTATUS
}

trap 'report_status "failed" 0 "unexpected error"' ERR

TMPDIR="$(mktemp -d)"
trap 'rm -rf "${TMPDIR}"' EXIT

log "Dumping PostgreSQL..."
docker compose -f {{ app_dir }}/services/postgres/docker-compose.yml exec -T postgres \
  pg_dump -U llamenos -d llamenos --no-owner --no-privileges \
  | gzip -9 > "${TMPDIR}/postgres.sql.gz"

DUMP_SIZE="$(stat -c%s "${TMPDIR}/postgres.sql.gz" 2>/dev/null || stat -f%z "${TMPDIR}/postgres.sql.gz")"
log "PostgreSQL dump: ${DUMP_SIZE} bytes"

FILENAME="postgres-${TIMESTAMP}.sql.gz"
if [ -n "${AGE_RECIPIENT}" ]; then
  age -r "${AGE_RECIPIENT}" -o "${TMPDIR}/${FILENAME}.age" "${TMPDIR}/postgres.sql.gz"
  FILENAME="${FILENAME}.age"
fi

# Tiered storage
cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/daily/${FILENAME}"
[ "$(date -u +%u)" = "7" ] && cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/weekly/${FILENAME}"
[ "$(date -u +%d)" = "01" ] && cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/monthly/${FILENAME}"

# Remote upload
{% if backup_rclone_remote %}
rclone copy "${TMPDIR}/${FILENAME}" "{{ backup_rclone_remote }}/{{ inventory_hostname }}/postgres/daily/" --quiet
{% endif %}

# Retention
enforce_retention() {
  local dir="$1" keep="$2"
  local count
  count="$(find "${dir}" -maxdepth 1 -type f -name 'postgres-*' | wc -l)"
  if [ "${count}" -gt "${keep}" ]; then
    find "${dir}" -maxdepth 1 -type f -name 'postgres-*' -printf '%T@ %p\n' \
      | sort -n | head -n "$(( count - keep ))" | cut -d' ' -f2- | xargs rm -f
  fi
}

enforce_retention "${BACKUP_DIR}/daily" {{ backup_retain_daily }}
enforce_retention "${BACKUP_DIR}/weekly" {{ backup_retain_weekly }}
enforce_retention "${BACKUP_DIR}/monthly" {{ backup_retain_monthly }}

report_status "success" "${DUMP_SIZE}"
log "PostgreSQL backup complete: ${FILENAME}"
```

**File: `deploy/ansible/roles/backup-strfry/tasks/main.yml`**

```yaml
---
# strfry (Nostr relay) backup — LMDB snapshot
# Runs on the host in [llamenos_relay] group

- name: Skip if strfry not on this host
  ansible.builtin.meta: end_host
  when: >
    groups.get('llamenos_relay', []) | length > 0 and
    inventory_hostname not in groups.get('llamenos_relay', groups['llamenos_servers'])

- name: Create strfry backup script
  ansible.builtin.template:
    src: backup/strfry-backup.sh.j2
    dest: "{{ app_dir }}/scripts/backup-strfry.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure strfry backup cron
  ansible.builtin.cron:
    name: "Llamenos strfry backup"
    user: "{{ deploy_user }}"
    hour: "{{ backup_cron_hour }}"
    minute: "{{ backup_cron_minute | int + 5 }}"
    job: "{{ app_dir }}/scripts/backup-strfry.sh >> {{ app_dir }}/backups/strfry-backup.log 2>&1"
    state: "{{ 'present' if (backup_enabled and llamenos_strfry_enabled | default(true)) else 'absent' }}"
```

**File: `deploy/ansible/templates/backup/strfry-backup.sh.j2`**

```bash
#!/usr/bin/env bash
# strfry LMDB Backup — managed by Ansible
set -euo pipefail

BACKUP_DIR="{{ app_dir }}/backups"
AGE_RECIPIENT="{{ backup_age_public_key }}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
STATUS_FILE="{{ app_dir }}/backups/.backup-status-strfry.json"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [strfry] $*"; }
report_status() {
  cat > "${STATUS_FILE}" <<EOFSTATUS
{
  "service": "strfry",
  "status": "$1",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size_bytes": ${2:-0},
  "error": "${3:-}",
  "host": "{{ inventory_hostname }}"
}
EOFSTATUS
}

trap 'report_status "failed" 0 "unexpected error"' ERR

TMPDIR="$(mktemp -d)"
trap 'rm -rf "${TMPDIR}"' EXIT

log "Copying strfry LMDB data..."

# Use mdb_copy for a consistent LMDB snapshot (avoids torn pages)
# If mdb_copy is not available in the container, fall back to docker cp
if docker compose -f {{ app_dir }}/services/strfry/docker-compose.yml \
    exec -T strfry which mdb_copy &>/dev/null; then
  docker compose -f {{ app_dir }}/services/strfry/docker-compose.yml \
    exec -T strfry mdb_copy -n /app/strfry-db "${TMPDIR}/strfry-snapshot/"
else
  # Fallback: pause writes, copy, resume
  log "mdb_copy not available, using docker cp fallback"
  docker compose -f {{ app_dir }}/services/strfry/docker-compose.yml \
    exec -T strfry kill -STOP 1 2>/dev/null || true
  CONTAINER_ID=$(docker compose -f {{ app_dir }}/services/strfry/docker-compose.yml ps -q strfry)
  docker cp "${CONTAINER_ID}:/app/strfry-db" "${TMPDIR}/strfry-snapshot/"
  docker compose -f {{ app_dir }}/services/strfry/docker-compose.yml \
    exec -T strfry kill -CONT 1 2>/dev/null || true
fi

tar -czf "${TMPDIR}/strfry-snapshot.tar.gz" -C "${TMPDIR}" strfry-snapshot/
SNAPSHOT_SIZE="$(stat -c%s "${TMPDIR}/strfry-snapshot.tar.gz" 2>/dev/null || stat -f%z "${TMPDIR}/strfry-snapshot.tar.gz")"
log "strfry snapshot: ${SNAPSHOT_SIZE} bytes"

FILENAME="strfry-${TIMESTAMP}.tar.gz"
if [ -n "${AGE_RECIPIENT}" ]; then
  age -r "${AGE_RECIPIENT}" -o "${TMPDIR}/${FILENAME}.age" "${TMPDIR}/strfry-snapshot.tar.gz"
  FILENAME="${FILENAME}.age"
fi

cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/daily/${FILENAME}"
[ "$(date -u +%u)" = "7" ] && cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/weekly/${FILENAME}"
[ "$(date -u +%d)" = "01" ] && cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/monthly/${FILENAME}"

{% if backup_rclone_remote %}
rclone copy "${TMPDIR}/${FILENAME}" "{{ backup_rclone_remote }}/{{ inventory_hostname }}/strfry/daily/" --quiet
{% endif %}

report_status "success" "${SNAPSHOT_SIZE}"
log "strfry backup complete: ${FILENAME}"
```

### Phase 2: Application Config Backup

**File: `deploy/ansible/roles/backup-config/tasks/main.yml`**

```yaml
---
# Config backup — sanitized application configuration
# Runs on all llamenos_servers hosts

- name: Create config backup script
  ansible.builtin.template:
    src: backup/config-backup.sh.j2
    dest: "{{ app_dir }}/scripts/backup-config.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure config backup cron
  ansible.builtin.cron:
    name: "Llamenos config backup"
    user: "{{ deploy_user }}"
    hour: "{{ backup_cron_hour }}"
    minute: "{{ backup_cron_minute | int + 10 }}"
    job: "{{ app_dir }}/scripts/backup-config.sh >> {{ app_dir }}/backups/config-backup.log 2>&1"
    state: "{{ 'present' if backup_enabled else 'absent' }}"
```

**File: `deploy/ansible/templates/backup/config-backup.sh.j2`**

```bash
#!/usr/bin/env bash
# Config Backup — managed by Ansible
# Backs up docker-compose files, Caddyfile, and non-secret configuration.
# Secrets (.env files) are EXCLUDED — they are in ansible-vault.
set -euo pipefail

BACKUP_DIR="{{ app_dir }}/backups"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
STATUS_FILE="{{ app_dir }}/backups/.backup-status-config.json"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [config] $*"; }

TMPDIR="$(mktemp -d)"
trap 'rm -rf "${TMPDIR}"' EXIT

mkdir -p "${TMPDIR}/config"

# Collect compose files (non-secret)
find {{ app_dir }}/services -name 'docker-compose.yml' -exec cp --parents {} "${TMPDIR}/config/" \; 2>/dev/null || true

# Collect Caddyfile
[ -f "{{ app_dir }}/services/caddy/Caddyfile" ] && cp "{{ app_dir }}/services/caddy/Caddyfile" "${TMPDIR}/config/"
# Legacy location
[ -f "{{ app_dir }}/Caddyfile" ] && cp "{{ app_dir }}/Caddyfile" "${TMPDIR}/config/Caddyfile.legacy"

# Record service versions
docker ps --format '{{ '{{' }}.Image{{ '}}' }} {{ '{{' }}.Names{{ '}}' }}' > "${TMPDIR}/config/running-images.txt" 2>/dev/null || true

# Record disk usage
df -h > "${TMPDIR}/config/disk-usage.txt" 2>/dev/null || true
docker system df > "${TMPDIR}/config/docker-disk-usage.txt" 2>/dev/null || true

FILENAME="config-{{ inventory_hostname }}-${TIMESTAMP}.tar.gz"
tar -czf "${TMPDIR}/${FILENAME}" -C "${TMPDIR}" config/

CONFIG_SIZE="$(stat -c%s "${TMPDIR}/${FILENAME}" 2>/dev/null || stat -f%z "${TMPDIR}/${FILENAME}")"

cp "${TMPDIR}/${FILENAME}" "${BACKUP_DIR}/daily/${FILENAME}"

{% if backup_rclone_remote %}
rclone copy "${TMPDIR}/${FILENAME}" "{{ backup_rclone_remote }}/{{ inventory_hostname }}/config/" --quiet
{% endif %}

# Only keep 7 config backups (they're small, no weekly/monthly needed)
COUNT="$(find "${BACKUP_DIR}/daily" -maxdepth 1 -name 'config-*' -type f | wc -l)"
if [ "${COUNT}" -gt 7 ]; then
  find "${BACKUP_DIR}/daily" -maxdepth 1 -name 'config-*' -type f -printf '%T@ %p\n' \
    | sort -n | head -n "$(( COUNT - 7 ))" | cut -d' ' -f2- | xargs rm -f
fi

cat > "${STATUS_FILE}" <<EOFSTATUS
{
  "service": "config",
  "status": "success",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size_bytes": ${CONFIG_SIZE},
  "host": "{{ inventory_hostname }}"
}
EOFSTATUS

log "Config backup complete: ${FILENAME} (${CONFIG_SIZE} bytes)"
```

### Phase 3: Backup Health Monitoring

**File: `deploy/ansible/roles/backup-monitor/tasks/main.yml`**

```yaml
---
# Backup health monitoring
# Checks backup freshness and sends alerts via ntfy/gotify webhook

- name: Create backup health check script
  ansible.builtin.template:
    src: backup/backup-health-check.sh.j2
    dest: "{{ app_dir }}/scripts/backup-health-check.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure hourly backup health check
  ansible.builtin.cron:
    name: "Llamenos backup health check"
    user: "{{ deploy_user }}"
    hour: "*"
    minute: "30"
    job: "{{ app_dir }}/scripts/backup-health-check.sh >> {{ app_dir }}/backups/health-check.log 2>&1"
    state: "{{ 'present' if (backup_enabled and backup_alert_webhook | default('') | length > 0) else 'absent' }}"
```

**File: `deploy/ansible/templates/backup/backup-health-check.sh.j2`**

```bash
#!/usr/bin/env bash
# Backup Health Check — managed by Ansible
# Reads .backup-status-*.json files, checks age, alerts if stale.
set -euo pipefail

BACKUP_DIR="{{ app_dir }}/backups"
MAX_AGE_HOURS="{{ backup_max_age_hours | default(26) }}"
ALERT_WEBHOOK="{{ backup_alert_webhook | default('') }}"
HOST="{{ inventory_hostname }}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [health] $*"; }

ISSUES=()
CURRENT_EPOCH="$(date +%s)"

check_service() {
  local service="$1"
  local status_file="${BACKUP_DIR}/.backup-status-${service}.json"

  if [ ! -f "${status_file}" ]; then
    ISSUES+=("${service}: no backup status file found (never backed up?)")
    return
  fi

  local status timestamp
  status="$(grep -o '"status": *"[^"]*"' "${status_file}" | head -1 | cut -d'"' -f4)"
  timestamp="$(grep -o '"timestamp": *"[^"]*"' "${status_file}" | head -1 | cut -d'"' -f4)"

  if [ "${status}" != "success" ]; then
    ISSUES+=("${service}: last backup FAILED (status=${status})")
    return
  fi

  # Check freshness
  local backup_epoch
  backup_epoch="$(date -d "${timestamp}" +%s 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%SZ' "${timestamp}" +%s 2>/dev/null || echo 0)"
  local age_hours=$(( (CURRENT_EPOCH - backup_epoch) / 3600 ))

  if [ "${age_hours}" -gt "${MAX_AGE_HOURS}" ]; then
    ISSUES+=("${service}: backup is ${age_hours}h old (max: ${MAX_AGE_HOURS}h)")
  fi

  # Check backup size trend (warn if latest is <10% of previous)
  local size
  size="$(grep -o '"size_bytes": *[0-9]*' "${status_file}" | head -1 | grep -o '[0-9]*$')"
  if [ "${size}" -lt 100 ]; then
    ISSUES+=("${service}: suspiciously small backup (${size} bytes)")
  fi
}

# Check each service that should be backed up on this host
{% if llamenos_postgres_enabled | default(true) %}
check_service "postgres"
{% endif %}
{% if llamenos_strfry_enabled | default(true) %}
check_service "strfry"
{% endif %}
check_service "config"
{% if llamenos_rustfs_enabled | default(true) %}
check_service "rustfs"
{% endif %}

# Check disk space
DISK_USAGE="$(df "{{ app_dir }}" --output=pcent | tail -1 | tr -d ' %')"
if [ "${DISK_USAGE}" -gt 85 ]; then
  ISSUES+=("disk: {{ app_dir }} at ${DISK_USAGE}% capacity")
fi

if [ ${#ISSUES[@]} -eq 0 ]; then
  log "All backup health checks passed"
  exit 0
fi

# Build alert message
ALERT_MSG="Backup alert on ${HOST}:\n"
for issue in "${ISSUES[@]}"; do
  ALERT_MSG+="  - ${issue}\n"
  log "ALERT: ${issue}"
done

# Send alert via webhook (ntfy, gotify, or generic)
if [ -n "${ALERT_WEBHOOK}" ]; then
  if echo "${ALERT_WEBHOOK}" | grep -q "ntfy"; then
    curl -sf -d "$(echo -e "${ALERT_MSG}")" \
      -H "Title: Llamenos Backup Alert (${HOST})" \
      -H "Priority: high" \
      -H "Tags: warning" \
      "${ALERT_WEBHOOK}" || log "Failed to send ntfy alert"
  else
    curl -sf -X POST "${ALERT_WEBHOOK}" \
      -H "Content-Type: application/json" \
      -d "{\"title\":\"Backup Alert (${HOST})\",\"message\":\"$(echo -e "${ALERT_MSG}")\"}" \
      || log "Failed to send webhook alert"
  fi
fi
```

### Phase 4: Centralized Backup Aggregation

For multi-host deployments, a designated backup host pulls backup status from all peers.

**File: `deploy/ansible/roles/backup-aggregator/tasks/main.yml`**

```yaml
---
# Backup aggregator — runs on the designated backup host
# Collects backup status from all llamenos_servers hosts

- name: Skip if not the backup aggregator host
  ansible.builtin.meta: end_host
  when: >
    groups.get('llamenos_backup', []) | length > 0 and
    inventory_hostname not in groups.get('llamenos_backup', []) and
    inventory_hostname != groups['llamenos_servers'][0]

- name: Create aggregation script
  ansible.builtin.template:
    src: backup/backup-aggregate.sh.j2
    dest: "{{ app_dir }}/scripts/backup-aggregate.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure daily aggregation report
  ansible.builtin.cron:
    name: "Llamenos backup aggregation report"
    user: "{{ deploy_user }}"
    hour: "{{ backup_cron_hour | int + 1 }}"
    minute: "0"
    job: "{{ app_dir }}/scripts/backup-aggregate.sh >> {{ app_dir }}/backups/aggregation.log 2>&1"
    state: "{{ 'present' if backup_enabled else 'absent' }}"
```

### Phase 5: Cross-Host Restore Playbook

**File: `deploy/ansible/playbooks/full-restore.yml`**

```yaml
---
# Full Restore Playbook
#
# Provisions a fresh deployment from backups.
# Can target a new set of hosts (disaster recovery) or re-provision existing hosts.
#
# Prerequisites:
#   - age private key available (backup_age_private_key_path)
#   - Backup files accessible (local or via rclone)
#   - Target hosts have Docker installed (run harden.yml + docker role first)
#
# Usage:
#   ansible-playbook playbooks/full-restore.yml --ask-vault-pass \
#     -e backup_source=/path/to/backups \
#     -e backup_age_private_key_path=/path/to/key.txt

- name: Restore Llamenos from backups
  hosts: llamenos_servers
  become: true
  vars_files:
    - ../vars.yml

  tasks:
    - name: Validate restore prerequisites
      ansible.builtin.assert:
        that:
          - backup_source is defined
          - backup_age_private_key_path is defined
        fail_msg: >
          Required variables: backup_source (path to backup dir),
          backup_age_private_key_path (path to age private key)

    # ── Phase 1: Deploy infrastructure (empty) ──
    - name: Deploy service containers (empty)
      ansible.builtin.include_role:
        name: "{{ item }}"
      loop:
        - docker
        - llamenos-postgres
        - llamenos-rustfs
        - llamenos-strfry
        - llamenos-app
        - llamenos-caddy

    # ── Phase 2: Restore PostgreSQL ──
    - name: Find latest PostgreSQL backup
      ansible.builtin.find:
        paths: "{{ backup_source }}"
        patterns: "postgres-*.sql.gz.age,postgres-*.sql.gz"
        recurse: true
      register: pg_backups
      when: >
        groups.get('llamenos_db', []) | length == 0 or
        inventory_hostname in groups.get('llamenos_db', groups['llamenos_servers'])

    - name: Restore PostgreSQL
      when: pg_backups.matched | default(0) > 0
      block:
        - name: Select most recent PostgreSQL backup
          ansible.builtin.set_fact:
            pg_backup_file: "{{ (pg_backups.files | sort(attribute='mtime') | last).path }}"

        - name: Create restore temp directory
          ansible.builtin.tempfile:
            state: directory
            prefix: llamenos-restore-
          register: restore_tmp

        - name: Decrypt PostgreSQL backup
          ansible.builtin.command:
            cmd: "age -d -i {{ backup_age_private_key_path }} -o {{ restore_tmp.path }}/postgres.sql.gz {{ pg_backup_file }}"
          when: pg_backup_file is search('.age$')

        - name: Copy unencrypted PostgreSQL backup
          ansible.builtin.copy:
            src: "{{ pg_backup_file }}"
            dest: "{{ restore_tmp.path }}/postgres.sql.gz"
            remote_src: true
          when: pg_backup_file is not search('.age$')

        - name: Wait for PostgreSQL to be ready
          ansible.builtin.command:
            cmd: >
              docker compose -f {{ app_dir }}/services/postgres/docker-compose.yml
              exec -T postgres pg_isready -U llamenos -d llamenos
          register: pg_ready
          retries: 15
          delay: 2
          until: pg_ready.rc == 0

        - name: Restore PostgreSQL dump
          ansible.builtin.shell: |
            gunzip -c {{ restore_tmp.path }}/postgres.sql.gz | \
              docker compose -f {{ app_dir }}/services/postgres/docker-compose.yml \
              exec -T -i postgres psql -U llamenos -d llamenos
          register: pg_restore

        - name: Display PostgreSQL restore result
          ansible.builtin.debug:
            msg: "PostgreSQL restored from {{ pg_backup_file }}"

    # ── Phase 3: Restore strfry ──
    - name: Find latest strfry backup
      ansible.builtin.find:
        paths: "{{ backup_source }}"
        patterns: "strfry-*.tar.gz.age,strfry-*.tar.gz"
        recurse: true
      register: strfry_backups
      when: >
        llamenos_strfry_enabled | default(true) and
        (groups.get('llamenos_relay', []) | length == 0 or
         inventory_hostname in groups.get('llamenos_relay', groups['llamenos_servers']))

    - name: Restore strfry LMDB
      when: strfry_backups.matched | default(0) > 0
      block:
        - name: Select most recent strfry backup
          ansible.builtin.set_fact:
            strfry_backup_file: "{{ (strfry_backups.files | sort(attribute='mtime') | last).path }}"

        - name: Stop strfry for restore
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/strfry"
            state: stopped

        - name: Decrypt and extract strfry backup
          ansible.builtin.shell: |
            TMPDIR=$(mktemp -d)
            {% if strfry_backup_file is search('.age$') %}
            age -d -i {{ backup_age_private_key_path }} -o "${TMPDIR}/strfry.tar.gz" "{{ strfry_backup_file }}"
            {% else %}
            cp "{{ strfry_backup_file }}" "${TMPDIR}/strfry.tar.gz"
            {% endif %}
            # Get the volume mount point
            VOLUME_PATH=$(docker volume inspect llamenos_nostr-data --format '{{ '{{' }}.Mountpoint{{ '}}' }}')
            tar -xzf "${TMPDIR}/strfry.tar.gz" -C "${VOLUME_PATH}" --strip-components=1
            rm -rf "${TMPDIR}"

        - name: Start strfry after restore
          community.docker.docker_compose_v2:
            project_src: "{{ app_dir }}/services/strfry"
            state: present

    # ── Phase 4: Verify ──
    - name: Wait for full stack health
      ansible.builtin.uri:
        url: "http://localhost:3000/api/health"
        method: GET
        status_code: 200
      register: restore_health
      retries: 30
      delay: 5
      until: restore_health.status == 200

    - name: Validate restored data
      ansible.builtin.command:
        cmd: >
          docker compose -f {{ app_dir }}/services/postgres/docker-compose.yml
          exec -T postgres psql -U llamenos -d llamenos -t -c
          "SELECT COUNT(*) FROM kv_store"
      register: kv_count

    - name: Display restore summary
      ansible.builtin.debug:
        msg: |
          Full restore completed successfully.
          - PostgreSQL: {{ pg_backup_file | default('skipped') }}
          - strfry: {{ strfry_backup_file | default('skipped') }}
          - kv_store rows: {{ kv_count.stdout | default('N/A') | trim }}
          - Health check: PASSED
          - URL: https://{{ domain }}

  always:
    - name: Clean up temp directories
      ansible.builtin.file:
        path: "{{ item }}"
        state: absent
      loop:
        - "{{ restore_tmp.path | default('/dev/null') }}"
      ignore_errors: true
```

### Phase 6: Variables for Backup Configuration

**Additions to `deploy/ansible/vars.example.yml`:**

```yaml
# ─── Backup Health Monitoring ─────────────────────────────────
# Maximum age of a backup before it's considered stale (hours)
backup_max_age_hours: 26

# Webhook URL for backup alerts (ntfy, gotify, or generic POST)
# Examples:
#   ntfy: "https://ntfy.sh/llamenos-backups"
#   gotify: "https://gotify.example.com/message?token=TOKEN"
backup_alert_webhook: ""

# Path to age private key for restore operations (NOT stored on server)
# Only needed when running restore playbooks
# backup_age_private_key_path: "/path/to/backup-key.txt"

# ─── RustFS Backup ────────────────────────────────────────────
# Back up RustFS files (can be large — disable for bandwidth-constrained hosts)
backup_rustfs_enabled: true
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `deploy/ansible/roles/backup/tasks/main.yml` | Deprecate | Replace with per-service backup roles |
| `deploy/ansible/roles/backup-postgres/tasks/main.yml` | Create | PostgreSQL backup role |
| `deploy/ansible/roles/backup-rustfs/tasks/main.yml` | Create | RustFS backup role |
| `deploy/ansible/roles/backup-strfry/tasks/main.yml` | Create | strfry LMDB backup role |
| `deploy/ansible/roles/backup-config/tasks/main.yml` | Create | Application config backup role |
| `deploy/ansible/roles/backup-monitor/tasks/main.yml` | Create | Backup health monitoring role |
| `deploy/ansible/roles/backup-aggregator/tasks/main.yml` | Create | Multi-host backup aggregation |
| `deploy/ansible/templates/backup/postgres-backup.sh.j2` | Create | PostgreSQL backup script template |
| `deploy/ansible/templates/backup/strfry-backup.sh.j2` | Create | strfry backup script template |
| `deploy/ansible/templates/backup/rustfs-backup.sh.j2` | Create | RustFS backup script template |
| `deploy/ansible/templates/backup/config-backup.sh.j2` | Create | Config backup script template |
| `deploy/ansible/templates/backup/backup-health-check.sh.j2` | Create | Health check script template |
| `deploy/ansible/templates/backup/backup-aggregate.sh.j2` | Create | Aggregation script template |
| `deploy/ansible/playbooks/backup.yml` | Rewrite | Orchestrate all backup roles |
| `deploy/ansible/playbooks/full-restore.yml` | Create | Cross-host restore from backups |
| `deploy/ansible/playbooks/test-restore.yml` | Update | Adapt to per-service backup layout |
| `deploy/ansible/vars.example.yml` | Extend | Add backup monitoring and alert vars |
| `deploy/ansible/justfile` | Extend | Add `full-restore`, `backup-status` commands |

## Testing

1. **Single-host backup round-trip**: Run all backup scripts on single-host deployment. Verify `.backup-status-*.json` files exist for postgres, strfry, rustfs, and config. Run `full-restore.yml` on a fresh host and verify data integrity.

2. **strfry backup consistency**: Create Nostr events, run strfry backup, restore to a fresh container, verify events are present via WebSocket query.

3. **Health monitoring alert**: Set `backup_max_age_hours: 0` to force staleness detection. Verify alert is sent to ntfy/gotify webhook. Test with missing status file (simulates never-backed-up service).

4. **Multi-host backup**: With PostgreSQL on host A and app on host B, verify backup scripts run on the correct hosts. Verify rclone uploads include host-specific paths.

5. **Restore to fresh hosts**: Provision 2 new VMs, run `full-restore.yml` with backups from a production deployment. Verify complete data recovery including relay events.

6. **Config backup sanitization**: Verify config backups do NOT contain `.env` files or any secrets. Only compose files, Caddyfile, and diagnostic info.

## Acceptance Criteria

- [ ] PostgreSQL backups run on the host where PostgreSQL is deployed
- [ ] strfry LMDB backups produce consistent snapshots (via `mdb_copy` or pause-copy)
- [ ] RustFS backups mirror the entire bucket with encryption
- [ ] Application config is backed up (sanitized, no secrets)
- [ ] Each backup script writes a `.backup-status-{service}.json` file
- [ ] Health check script detects stale/failed/missing backups
- [ ] Alerts are sent via configurable webhook (ntfy/gotify)
- [ ] `full-restore.yml` provisions a complete deployment from backups
- [ ] `test-restore.yml` works with the new per-service backup layout
- [ ] Backup retention policies apply per-service
- [ ] rclone uploads use host-specific paths for multi-host separation
- [ ] Single-host deployments continue working without configuration changes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| strfry LMDB corruption during backup | Low | High | Use `mdb_copy` for consistent snapshots; fall back to SIGSTOP+copy only when `mdb_copy` unavailable |
| Backup encryption key loss | Low | Critical | Document key backup procedure prominently; recommend printing age private key on paper |
| Health check false positives | Medium | Low | Conservative 26-hour default threshold; operators can tune `backup_max_age_hours` |
| rclone misconfiguration losing remote backups | Medium | Medium | Verify rclone config in setup playbook; test upload before relying on it |
| Large RustFS buckets causing backup timeouts | Medium | Medium | `backup_rustfs_enabled` toggle allows disabling on bandwidth-constrained hosts |
