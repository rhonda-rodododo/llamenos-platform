# Epic 279: Auto-Healing & Zero-Touch Operations

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 276
**Blocks**: None
**Branch**: `desktop`

## Summary

Implement automated recovery and maintenance operations that allow Llamenos deployments to self-heal without operator intervention. This covers health-check-driven container restarts, certificate renewal monitoring, log rotation, stale data cleanup, PostgreSQL vacuum scheduling, disk space management, and NTP drift detection with automatic correction.

## Problem Statement

A crisis hotline must stay available 24/7. The target operators (2-3 part-time volunteers managing 1-50 hubs) cannot monitor servers constantly. Current failure modes that require manual intervention:

1. **Container crashes without recovery.** Docker `restart: unless-stopped` handles simple crashes, but does not detect an app container that is running but unhealthy (e.g., stuck event loop, exhausted connection pool). The health check in `docker-compose.j2` exists but there is no external watchdog that acts on persistent health failures.

2. **Stale data accumulation.** The app stores rate-limit entries, expired session tokens, CAPTCHA challenge state, and expired invite codes in PostgreSQL. Without periodic cleanup, these tables grow indefinitely, degrading query performance.

3. **PostgreSQL maintenance.** Autovacuum handles most cases, but large batch deletes (e.g., ban list purges, expired note cleanup) can leave dead tuples that autovacuum is slow to reclaim. No scheduled `VACUUM ANALYZE` exists.

4. **NTP drift.** Schnorr signature validation has a 5-minute clock skew tolerance. The `chrony.conf.j2` template configures NTP, but there is no monitoring or automatic correction if chrony stops or drift exceeds threshold.

5. **Log accumulation.** Docker container logs grow unbounded unless configured. The Caddy access log has rotation configured, but Docker daemon-level log rotation is not set.

## Implementation

### Phase 1: Docker Daemon Configuration

Ensure Docker itself is configured for resilience across all hosts.

**File: `deploy/ansible/roles/docker/tasks/main.yml`** (additions):

```yaml
- name: Configure Docker daemon for production
  ansible.builtin.template:
    src: docker-daemon.json.j2
    dest: /etc/docker/daemon.json
    owner: root
    group: root
    mode: "0644"
  notify: Restart docker

- name: Verify Docker restart policies on all containers
  ansible.builtin.shell: |
    docker ps -a --format '{{ '{{' }}.Names{{ '}}' }}:{{ '{{' }}.Status{{ '}}' }}' | \
      while IFS=: read name status; do
        policy=$(docker inspect --format '{{ '{{' }}.HostConfig.RestartPolicy.Name{{ '}}' }}' "$name" 2>/dev/null)
        if [ "$policy" != "unless-stopped" ] && [ "$policy" != "always" ]; then
          echo "WARNING: $name has restart policy: $policy"
        fi
      done
  register: restart_policy_check
  changed_when: false
  failed_when: false
```

**File: `deploy/ansible/templates/docker-daemon.json.j2`**

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3",
    "compress": "true"
  },
  "live-restore": true,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 32768
    }
  },
  "storage-driver": "overlay2"{% if docker_userns_remap | default(true) %},
  "userns-remap": "default"
{% endif %}
}
```

### Phase 2: Health-Check Watchdog

A systemd timer (not cron, for precise scheduling) that monitors Docker container health and takes corrective action.

**File: `deploy/ansible/roles/llamenos-watchdog/tasks/main.yml`**

```yaml
---
# Watchdog — health-check-driven auto-restart for containers
# Monitors Docker health status and restarts persistently unhealthy containers.

- name: Create watchdog script
  ansible.builtin.template:
    src: watchdog/container-watchdog.sh.j2
    dest: "{{ app_dir }}/scripts/container-watchdog.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Install watchdog systemd service
  ansible.builtin.template:
    src: watchdog/llamenos-watchdog.service.j2
    dest: /etc/systemd/system/llamenos-watchdog.service
    owner: root
    group: root
    mode: "0644"
  notify: Reload systemd

- name: Install watchdog systemd timer
  ansible.builtin.template:
    src: watchdog/llamenos-watchdog.timer.j2
    dest: /etc/systemd/system/llamenos-watchdog.timer
    owner: root
    group: root
    mode: "0644"
  notify:
    - Reload systemd
    - Enable watchdog timer

- name: Enable and start watchdog timer
  ansible.builtin.systemd:
    name: llamenos-watchdog.timer
    state: started
    enabled: true
    daemon_reload: true
```

**File: `deploy/ansible/templates/watchdog/container-watchdog.sh.j2`**

```bash
#!/usr/bin/env bash
# Container Watchdog — managed by Ansible
#
# Checks Docker container health status. If a container has been
# unhealthy for more than THRESHOLD consecutive checks, it gets restarted.
# Sends an alert on restart and on persistent failure.
set -euo pipefail

APP_DIR="{{ app_dir }}"
STATE_DIR="{{ app_dir }}/logs/watchdog-state"
ALERT_WEBHOOK="{{ llamenos_alert_webhook | default('') }}"
HOST="{{ inventory_hostname }}"
MAX_FAILURES={{ llamenos_watchdog_max_failures | default(3) }}
MAX_RESTARTS={{ llamenos_watchdog_max_restarts | default(5) }}
LOG_FILE="{{ app_dir }}/logs/watchdog.log"

mkdir -p "${STATE_DIR}"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "${LOG_FILE}"
}

send_alert() {
  local title="$1" message="$2" priority="${3:-default}"
  if [ -n "${ALERT_WEBHOOK}" ]; then
    curl -sf -d "${message}" \
      -H "Title: ${title}" \
      -H "Priority: ${priority}" \
      -H "Tags: rotating_light" \
      "${ALERT_WEBHOOK}" 2>/dev/null || true
  fi
}

# Get all containers with health checks in the llamenos project
CONTAINERS=$(docker ps --filter "label=com.docker.compose.project=llamenos" \
  --format '{{ '{{' }}.Names{{ '}}' }}:{{ '{{' }}.Status{{ '}}' }}' 2>/dev/null || echo "")

if [ -z "${CONTAINERS}" ]; then
  log "No llamenos containers found"
  exit 0
fi

while IFS=: read -r name status_line; do
  [ -z "${name}" ] && continue

  # Check if container has a health check configured
  HEALTH=$(docker inspect --format '{{ '{{' }}if .State.Health{{ '}}' }}{{ '{{' }}.State.Health.Status{{ '}}' }}{{ '{{' }}else{{ '}}' }}none{{ '{{' }}end{{ '}}' }}' "${name}" 2>/dev/null || echo "unknown")

  FAILURE_FILE="${STATE_DIR}/${name}.failures"
  RESTART_FILE="${STATE_DIR}/${name}.restarts"

  case "${HEALTH}" in
    healthy|none)
      # Reset failure counter on healthy or no-healthcheck containers
      if [ -f "${FAILURE_FILE}" ]; then
        prev=$(cat "${FAILURE_FILE}")
        if [ "${prev}" -ge "${MAX_FAILURES}" ]; then
          log "${name}: recovered (was unhealthy for ${prev} checks)"
          send_alert "Recovered: ${name} on ${HOST}" "${name} is healthy again after auto-restart"
        fi
        rm -f "${FAILURE_FILE}"
      fi
      ;;
    unhealthy)
      # Increment failure counter
      failures=1
      [ -f "${FAILURE_FILE}" ] && failures=$(( $(cat "${FAILURE_FILE}") + 1 ))
      echo "${failures}" > "${FAILURE_FILE}"

      log "${name}: unhealthy (consecutive: ${failures}/${MAX_FAILURES})"

      if [ "${failures}" -ge "${MAX_FAILURES}" ]; then
        # Check restart budget
        restarts=0
        [ -f "${RESTART_FILE}" ] && restarts=$(cat "${RESTART_FILE}")

        if [ "${restarts}" -ge "${MAX_RESTARTS}" ]; then
          log "${name}: exceeded restart budget (${restarts}/${MAX_RESTARTS}). Manual intervention required."
          send_alert "CRITICAL: ${name} on ${HOST}" \
            "${name} has been restarted ${restarts} times and is still failing. Manual intervention required." \
            "urgent"
          continue
        fi

        log "${name}: restarting (attempt $((restarts + 1))/${MAX_RESTARTS})"
        send_alert "Restarting: ${name} on ${HOST}" \
          "${name} unhealthy for ${failures} consecutive checks. Auto-restarting (attempt $((restarts + 1))/${MAX_RESTARTS})." \
          "high"

        # Find the compose project directory for this container
        PROJECT_DIR=$(docker inspect --format '{{ '{{' }}index .Config.Labels "com.docker.compose.project.working_dir"{{ '}}' }}' "${name}" 2>/dev/null)
        SERVICE=$(docker inspect --format '{{ '{{' }}index .Config.Labels "com.docker.compose.service"{{ '}}' }}' "${name}" 2>/dev/null)

        if [ -n "${PROJECT_DIR}" ] && [ -n "${SERVICE}" ]; then
          docker compose -f "${PROJECT_DIR}/docker-compose.yml" restart "${SERVICE}" 2>&1 | tee -a "${LOG_FILE}"
          echo "$((restarts + 1))" > "${RESTART_FILE}"
          rm -f "${FAILURE_FILE}"
        else
          log "${name}: could not determine compose project directory"
        fi
      fi
      ;;
    *)
      log "${name}: unknown health status: ${HEALTH}"
      ;;
  esac
done <<< "${CONTAINERS}"

# Reset daily restart budget at midnight
HOUR=$(date -u +%H)
if [ "${HOUR}" = "00" ]; then
  find "${STATE_DIR}" -name '*.restarts' -delete
  log "Daily restart budget reset"
fi
```

**File: `deploy/ansible/templates/watchdog/llamenos-watchdog.timer.j2`**

```ini
[Unit]
Description=Llamenos Container Watchdog Timer

[Timer]
OnBootSec=60
OnUnitActiveSec=60
AccuracySec=10

[Install]
WantedBy=timers.target
```

**File: `deploy/ansible/templates/watchdog/llamenos-watchdog.service.j2`**

```ini
[Unit]
Description=Llamenos Container Watchdog
After=docker.service

[Service]
Type=oneshot
User={{ deploy_user }}
Group={{ deploy_group }}
ExecStart={{ app_dir }}/scripts/container-watchdog.sh
```

### Phase 3: Stale Data Cleanup

**File: `deploy/ansible/roles/llamenos-maintenance/tasks/main.yml`**

```yaml
---
# Scheduled maintenance tasks — cleanup, vacuum, log rotation

- name: Create maintenance script
  ansible.builtin.template:
    src: maintenance/cleanup.sh.j2
    dest: "{{ app_dir }}/scripts/maintenance-cleanup.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure daily maintenance cron
  ansible.builtin.cron:
    name: "Llamenos daily maintenance"
    user: "{{ deploy_user }}"
    hour: "4"
    minute: "30"
    job: "{{ app_dir }}/scripts/maintenance-cleanup.sh >> {{ app_dir }}/logs/maintenance.log 2>&1"
    state: present

- name: Create PostgreSQL vacuum script
  ansible.builtin.template:
    src: maintenance/vacuum.sh.j2
    dest: "{{ app_dir }}/scripts/maintenance-vacuum.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
  when: >
    llamenos_postgres_enabled | default(true) and
    (groups.get('llamenos_db', []) | length == 0 or
     inventory_hostname in groups.get('llamenos_db', groups['llamenos_servers']))

- name: Configure weekly vacuum cron
  ansible.builtin.cron:
    name: "Llamenos PostgreSQL vacuum"
    user: "{{ deploy_user }}"
    weekday: "0"
    hour: "5"
    minute: "0"
    job: "{{ app_dir }}/scripts/maintenance-vacuum.sh >> {{ app_dir }}/logs/vacuum.log 2>&1"
    state: "{{ 'present' if llamenos_postgres_enabled | default(true) else 'absent' }}"
  when: >
    groups.get('llamenos_db', []) | length == 0 or
    inventory_hostname in groups.get('llamenos_db', groups['llamenos_servers'])

- name: Configure log rotation for all maintenance logs
  ansible.builtin.copy:
    dest: /etc/logrotate.d/llamenos-maintenance
    owner: root
    group: root
    mode: "0644"
    content: |
      {{ app_dir }}/logs/*.log {
          weekly
          rotate 4
          compress
          delaycompress
          missingok
          notifempty
          create 0640 {{ deploy_user }} {{ deploy_group }}
          sharedscripts
          postrotate
              # Signal Docker containers to reopen log files if needed
              true
          endscript
      }
```

**File: `deploy/ansible/templates/maintenance/cleanup.sh.j2`**

```bash
#!/usr/bin/env bash
# Stale Data Cleanup — managed by Ansible
# Removes expired sessions, rate-limit entries, CAPTCHA state, invite codes.
set -euo pipefail

COMPOSE_DIR="{{ app_dir }}/services/postgres"
LOG_PREFIX="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [cleanup]"

log() { echo "${LOG_PREFIX} $*"; }

{% if llamenos_postgres_enabled | default(true) %}
# ── PostgreSQL Cleanup ──

# Check if postgres compose exists (may be on another host)
if [ -d "${COMPOSE_DIR}" ]; then
  log "Starting PostgreSQL stale data cleanup..."

  # Expired sessions (older than 30 days)
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
    psql -U llamenos -d llamenos -c "
      DELETE FROM kv_store
      WHERE key LIKE 'session:%'
        AND updated_at < NOW() - INTERVAL '30 days';
    " 2>&1 | while read -r line; do log "sessions: ${line}"; done

  # Expired rate-limit entries (older than 1 hour)
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
    psql -U llamenos -d llamenos -c "
      DELETE FROM kv_store
      WHERE key LIKE 'ratelimit:%'
        AND updated_at < NOW() - INTERVAL '1 hour';
    " 2>&1 | while read -r line; do log "ratelimit: ${line}"; done

  # Expired CAPTCHA challenges (older than 10 minutes)
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
    psql -U llamenos -d llamenos -c "
      DELETE FROM kv_store
      WHERE key LIKE 'captcha:%'
        AND updated_at < NOW() - INTERVAL '10 minutes';
    " 2>&1 | while read -r line; do log "captcha: ${line}"; done

  # Expired invite codes (past expiry timestamp)
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
    psql -U llamenos -d llamenos -c "
      DELETE FROM kv_store
      WHERE key LIKE 'invite:%'
        AND value::jsonb->>'expiresAt' IS NOT NULL
        AND (value::jsonb->>'expiresAt')::timestamptz < NOW();
    " 2>&1 | while read -r line; do log "invites: ${line}"; done

  # Expired ban list entries (if they have TTL)
  docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
    psql -U llamenos -d llamenos -c "
      DELETE FROM kv_store
      WHERE key LIKE 'ban:%'
        AND value::jsonb->>'expiresAt' IS NOT NULL
        AND (value::jsonb->>'expiresAt')::timestamptz < NOW();
    " 2>&1 | while read -r line; do log "bans: ${line}"; done

  log "PostgreSQL cleanup complete"
else
  log "PostgreSQL not on this host, skipping cleanup"
fi
{% endif %}

# ── Docker Cleanup ──
log "Pruning unused Docker images..."
docker image prune -f --filter "until=168h" 2>&1 | while read -r line; do log "docker: ${line}"; done

log "Pruning unused Docker volumes..."
docker volume prune -f 2>&1 | while read -r line; do log "docker: ${line}"; done

# ── Temp File Cleanup ──
log "Cleaning temp files..."
find /tmp -name 'llamenos-*' -mtime +1 -delete 2>/dev/null || true

log "Daily cleanup complete"
```

**File: `deploy/ansible/templates/maintenance/vacuum.sh.j2`**

```bash
#!/usr/bin/env bash
# PostgreSQL VACUUM ANALYZE — managed by Ansible
# Weekly full vacuum to reclaim space after bulk deletes.
set -euo pipefail

COMPOSE_DIR="{{ app_dir }}/services/postgres"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [vacuum] $*"; }

if [ ! -d "${COMPOSE_DIR}" ]; then
  log "PostgreSQL not on this host, skipping vacuum"
  exit 0
fi

log "Starting VACUUM ANALYZE..."

# Run VACUUM ANALYZE (not VACUUM FULL — that locks tables)
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
  psql -U llamenos -d llamenos -c "VACUUM ANALYZE;" 2>&1 | \
  while read -r line; do log "${line}"; done

# Report table sizes
log "Table sizes after vacuum:"
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
  psql -U llamenos -d llamenos -t -c "
    SELECT schemaname || '.' || tablename AS table,
           pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    LIMIT 10;
  " 2>&1 | while read -r line; do log "  ${line}"; done

# Report dead tuple stats
log "Dead tuple stats:"
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
  psql -U llamenos -d llamenos -t -c "
    SELECT relname, n_dead_tup, last_autovacuum
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 100
    ORDER BY n_dead_tup DESC
    LIMIT 10;
  " 2>&1 | while read -r line; do log "  ${line}"; done

log "VACUUM ANALYZE complete"
```

### Phase 4: NTP Drift Monitoring and Correction

**File: `deploy/ansible/roles/llamenos-ntp-monitor/tasks/main.yml`**

```yaml
---
# NTP drift monitoring — critical for Schnorr signature validation
# Detects drift >50ms and attempts automatic correction.

- name: Ensure chrony is installed and running
  ansible.builtin.service:
    name: chronyd
    state: started
    enabled: true

- name: Create NTP monitoring script
  ansible.builtin.template:
    src: maintenance/ntp-monitor.sh.j2
    dest: "{{ app_dir }}/scripts/ntp-monitor.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure NTP monitoring cron (every 15 minutes)
  ansible.builtin.cron:
    name: "Llamenos NTP drift monitor"
    user: root
    minute: "*/15"
    job: "{{ app_dir }}/scripts/ntp-monitor.sh >> {{ app_dir }}/logs/ntp-monitor.log 2>&1"
    state: present
```

**File: `deploy/ansible/templates/maintenance/ntp-monitor.sh.j2`**

```bash
#!/usr/bin/env bash
# NTP Drift Monitor — managed by Ansible
# Schnorr signature validation fails with >5min clock skew.
# This script detects drift >50ms and forces chrony re-sync.
set -euo pipefail

ALERT_WEBHOOK="{{ llamenos_alert_webhook | default('') }}"
HOST="{{ inventory_hostname }}"
MAX_DRIFT_MS=50
STATE_FILE="{{ app_dir }}/logs/ntp-drift.state"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [ntp] $*"; }

# Get current offset from chrony
if ! command -v chronyc &>/dev/null; then
  log "chronyc not found, cannot check NTP drift"
  exit 1
fi

TRACKING=$(chronyc tracking 2>/dev/null)
OFFSET_S=$(echo "${TRACKING}" | grep 'System time' | awk '{print $4}')
OFFSET_SIGN=$(echo "${TRACKING}" | grep 'System time' | awk '{print $5}')

if [ -z "${OFFSET_S}" ]; then
  log "Could not determine NTP offset"
  exit 1
fi

# Convert to milliseconds (remove sign, multiply by 1000)
OFFSET_MS=$(echo "${OFFSET_S}" | awk '{printf "%.0f", $1 * 1000}')

log "NTP offset: ${OFFSET_S}s ${OFFSET_SIGN} (${OFFSET_MS}ms)"

if [ "${OFFSET_MS}" -gt "${MAX_DRIFT_MS}" ]; then
  log "DRIFT DETECTED: ${OFFSET_MS}ms exceeds ${MAX_DRIFT_MS}ms threshold"

  # Attempt automatic correction
  log "Forcing chrony re-sync..."
  chronyc makestep 2>&1 | while read -r line; do log "chronyc: ${line}"; done

  # Wait and re-check
  sleep 5
  NEW_OFFSET=$(chronyc tracking 2>/dev/null | grep 'System time' | awk '{print $4}')
  NEW_MS=$(echo "${NEW_OFFSET}" | awk '{printf "%.0f", $1 * 1000}')

  if [ "${NEW_MS}" -gt "${MAX_DRIFT_MS}" ]; then
    log "CRITICAL: Drift persists after correction (${NEW_MS}ms)"
    if [ -n "${ALERT_WEBHOOK}" ]; then
      curl -sf -d "NTP drift on ${HOST}: ${NEW_MS}ms after correction attempt. Schnorr signatures may fail." \
        -H "Title: CRITICAL: NTP Drift on ${HOST}" \
        -H "Priority: urgent" \
        -H "Tags: warning" \
        "${ALERT_WEBHOOK}" 2>/dev/null || true
    fi
  else
    log "Drift corrected: ${NEW_MS}ms (was ${OFFSET_MS}ms)"
    if [ -n "${ALERT_WEBHOOK}" ]; then
      curl -sf -d "NTP drift on ${HOST} corrected: ${OFFSET_MS}ms -> ${NEW_MS}ms" \
        -H "Title: NTP Drift Corrected on ${HOST}" \
        -H "Priority: default" \
        "${ALERT_WEBHOOK}" 2>/dev/null || true
    fi
  fi
fi
```

### Phase 5: Certificate Renewal Monitoring

Caddy handles automatic certificate renewal, but operators should be alerted if renewal fails.

**File: `deploy/ansible/templates/maintenance/cert-monitor.sh.j2`**

```bash
#!/usr/bin/env bash
# TLS Certificate Monitor — managed by Ansible
# Caddy auto-renews, but this catches renewal failures.
set -euo pipefail

DOMAIN="{{ domain }}"
ALERT_WEBHOOK="{{ llamenos_alert_webhook | default('') }}"
HOST="{{ inventory_hostname }}"
MIN_DAYS={{ llamenos_alert_cert_expiry_days | default(7) }}
STATE_FILE="{{ app_dir }}/logs/cert-monitor.state"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [cert] $*"; }

# Check certificate expiry
CERT_INFO=$(echo | timeout 10 openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null)
if [ -z "${CERT_INFO}" ]; then
  log "Could not connect to ${DOMAIN}:443"
  exit 0
fi

EXPIRY_DATE=$(echo "${CERT_INFO}" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -z "${EXPIRY_DATE}" ]; then
  log "Could not parse certificate expiry"
  exit 0
fi

EXPIRY_EPOCH=$(date -d "${EXPIRY_DATE}" +%s 2>/dev/null || date -j -f '%b %d %H:%M:%S %Y %Z' "${EXPIRY_DATE}" +%s 2>/dev/null)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

log "Certificate for ${DOMAIN} expires in ${DAYS_LEFT} days (${EXPIRY_DATE})"

if [ "${DAYS_LEFT}" -lt "${MIN_DAYS}" ]; then
  # Only alert once per day
  TODAY=$(date +%Y-%m-%d)
  LAST_ALERT=$(cat "${STATE_FILE}" 2>/dev/null || echo "")
  if [ "${LAST_ALERT}" != "${TODAY}" ]; then
    if [ -n "${ALERT_WEBHOOK}" ]; then
      curl -sf -d "TLS certificate for ${DOMAIN} expires in ${DAYS_LEFT} days. Caddy auto-renewal may have failed. Check: docker compose logs caddy" \
        -H "Title: Certificate Expiring: ${DOMAIN}" \
        -H "Priority: high" \
        -H "Tags: lock" \
        "${ALERT_WEBHOOK}" 2>/dev/null || true
    fi
    echo "${TODAY}" > "${STATE_FILE}"
    log "ALERT: Certificate expires in ${DAYS_LEFT} days"
  fi
fi
```

Add cert monitor to the maintenance role:

```yaml
# In roles/llamenos-maintenance/tasks/main.yml:
- name: Create certificate monitoring script
  ansible.builtin.template:
    src: maintenance/cert-monitor.sh.j2
    dest: "{{ app_dir }}/scripts/cert-monitor.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
  when: llamenos_caddy_enabled | default(true)

- name: Configure daily certificate check
  ansible.builtin.cron:
    name: "Llamenos certificate expiry check"
    user: "{{ deploy_user }}"
    hour: "6"
    minute: "0"
    job: "{{ app_dir }}/scripts/cert-monitor.sh >> {{ app_dir }}/logs/cert-monitor.log 2>&1"
    state: "{{ 'present' if llamenos_caddy_enabled | default(true) else 'absent' }}"
```

### Phase 6: Disk Space Management

**File: `deploy/ansible/templates/maintenance/disk-monitor.sh.j2`**

```bash
#!/usr/bin/env bash
# Disk Space Monitor — managed by Ansible
# Alerts on high usage and takes automatic action at critical levels.
set -euo pipefail

ALERT_WEBHOOK="{{ llamenos_alert_webhook | default('') }}"
HOST="{{ inventory_hostname }}"
APP_DIR="{{ app_dir }}"
WARN_PERCENT={{ llamenos_alert_disk_percent | default(85) }}
CRIT_PERCENT=95

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [disk] $*"; }

USAGE=$(df "${APP_DIR}" --output=pcent 2>/dev/null | tail -1 | tr -d ' %')

log "Disk usage: ${USAGE}%"

if [ "${USAGE}" -ge "${CRIT_PERCENT}" ]; then
  log "CRITICAL: Disk at ${USAGE}%, taking emergency action"

  # Emergency cleanup
  docker image prune -af --filter "until=24h" 2>&1 | while read -r line; do log "prune: ${line}"; done
  docker builder prune -af 2>&1 | while read -r line; do log "builder: ${line}"; done

  # Remove old backups beyond minimum retention
  find "${APP_DIR}/backups/daily" -name 'llamenos-*' -mtime +3 -delete 2>/dev/null || true

  NEW_USAGE=$(df "${APP_DIR}" --output=pcent 2>/dev/null | tail -1 | tr -d ' %')
  log "After cleanup: ${NEW_USAGE}%"

  if [ -n "${ALERT_WEBHOOK}" ]; then
    curl -sf -d "CRITICAL: Disk on ${HOST} at ${USAGE}% (now ${NEW_USAGE}% after cleanup). Immediate attention needed." \
      -H "Title: CRITICAL: Disk Full on ${HOST}" \
      -H "Priority: urgent" \
      -H "Tags: rotating_light" \
      "${ALERT_WEBHOOK}" 2>/dev/null || true
  fi
elif [ "${USAGE}" -ge "${WARN_PERCENT}" ]; then
  log "WARNING: Disk at ${USAGE}%"

  # Light cleanup
  docker image prune -f --filter "until=168h" 2>&1 | while read -r line; do log "prune: ${line}"; done

  STATE_FILE="${APP_DIR}/logs/disk-warn.state"
  TODAY=$(date +%Y-%m-%d)
  LAST_WARN=$(cat "${STATE_FILE}" 2>/dev/null || echo "")
  if [ "${LAST_WARN}" != "${TODAY}" ]; then
    if [ -n "${ALERT_WEBHOOK}" ]; then
      curl -sf -d "Disk on ${HOST} at ${USAGE}%. Consider adding storage or reviewing backup retention." \
        -H "Title: Disk Warning on ${HOST}" \
        -H "Priority: high" \
        -H "Tags: warning" \
        "${ALERT_WEBHOOK}" 2>/dev/null || true
    fi
    echo "${TODAY}" > "${STATE_FILE}"
  fi
fi
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `deploy/ansible/roles/docker/tasks/main.yml` | Extend | Docker daemon config with log rotation, live-restore |
| `deploy/ansible/templates/docker-daemon.json.j2` | Create | Docker daemon configuration |
| `deploy/ansible/roles/llamenos-watchdog/tasks/main.yml` | Create | Container health watchdog |
| `deploy/ansible/templates/watchdog/container-watchdog.sh.j2` | Create | Watchdog script |
| `deploy/ansible/templates/watchdog/llamenos-watchdog.service.j2` | Create | Systemd service unit |
| `deploy/ansible/templates/watchdog/llamenos-watchdog.timer.j2` | Create | Systemd timer (60s interval) |
| `deploy/ansible/roles/llamenos-maintenance/tasks/main.yml` | Create | Scheduled maintenance role |
| `deploy/ansible/templates/maintenance/cleanup.sh.j2` | Create | Stale data cleanup script |
| `deploy/ansible/templates/maintenance/vacuum.sh.j2` | Create | PostgreSQL vacuum script |
| `deploy/ansible/templates/maintenance/ntp-monitor.sh.j2` | Create | NTP drift detection and correction |
| `deploy/ansible/templates/maintenance/cert-monitor.sh.j2` | Create | Certificate expiry monitoring |
| `deploy/ansible/templates/maintenance/disk-monitor.sh.j2` | Create | Disk space monitoring and cleanup |
| `deploy/ansible/roles/llamenos-ntp-monitor/tasks/main.yml` | Create | NTP monitoring role |
| `deploy/ansible/vars.example.yml` | Extend | Watchdog and maintenance vars |
| `deploy/ansible/playbooks/deploy.yml` | Extend | Include watchdog and maintenance roles |
| `deploy/ansible/justfile` | Extend | Add `watchdog-status`, `maintenance-run` commands |

## Testing

1. **Watchdog restart test**: Deploy with watchdog enabled. Kill the app process inside its container (making it unhealthy without Docker restarting it). Verify watchdog detects unhealthy status after 3 checks (3 minutes) and restarts the container. Verify ntfy alert is sent.

2. **Restart budget test**: Kill the app process repeatedly (6+ times). Verify watchdog stops restarting after `MAX_RESTARTS` and sends a critical alert instead.

3. **Stale data cleanup**: Insert expired sessions, rate-limit entries, and invite codes into PostgreSQL. Run `maintenance-cleanup.sh`. Verify expired rows are deleted and current rows are preserved.

4. **PostgreSQL vacuum**: Insert and delete 10,000 rows. Run `maintenance-vacuum.sh`. Verify dead tuple count decreases. Verify table size report is logged.

5. **NTP drift detection**: Temporarily offset system clock with `date -s`. Verify `ntp-monitor.sh` detects the drift, forces chrony re-sync, and sends alert.

6. **Disk space alert**: Fill disk to >85% with `dd`. Verify `disk-monitor.sh` sends warning and runs cleanup. Fill to >95%, verify critical alert and emergency cleanup.

7. **Docker log rotation**: Verify `/etc/docker/daemon.json` sets `max-size: 10m, max-file: 3`. Check a running container's log file size stays bounded.

8. **Certificate monitoring**: Set `llamenos_alert_cert_expiry_days: 90` (likely triggering for test certs). Verify alert is sent. Verify alert is not re-sent on subsequent runs (daily dedup).

## Acceptance Criteria

- [ ] Docker daemon configured with log rotation (`max-size: 10m`, `max-file: 3`, `compress: true`)
- [ ] Docker `live-restore` enabled (containers survive daemon restarts)
- [ ] Container watchdog runs every 60s via systemd timer
- [ ] Watchdog restarts unhealthy containers after 3 consecutive failures
- [ ] Watchdog respects restart budget (max 5/day) and escalates to critical alert
- [ ] Daily cleanup removes expired sessions, rate-limit entries, CAPTCHA state, and invite codes
- [ ] Weekly `VACUUM ANALYZE` runs on PostgreSQL with size and dead-tuple reporting
- [ ] NTP drift >50ms triggers automatic `chronyc makestep` correction
- [ ] NTP drift alerts include context about Schnorr signature impact
- [ ] Certificate expiry <7 days triggers daily alert (with dedup)
- [ ] Disk usage >85% triggers warning; >95% triggers emergency cleanup + critical alert
- [ ] All scripts send alerts via configurable webhook (ntfy/gotify)
- [ ] All operations are idempotent and safe to run repeatedly

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Watchdog restart loop kills service availability | Low | High | Restart budget (max 5/day) with escalation; recovery notifications |
| chronyc makestep causes time jump breaking in-flight requests | Low | Medium | Only triggered at >50ms drift; Schnorr tolerance is 5 minutes; the correction is needed |
| Stale data cleanup deletes wrong rows | Low | High | Cleanup targets only key-prefixed rows (session:, ratelimit:, captcha:) with explicit time guards; no DELETE without WHERE |
| Emergency disk cleanup deletes recent backups | Low | Medium | Only deletes daily backups >3 days old during critical (>95%) disk event; weekly/monthly untouched |
| systemd timer conflicts with cron jobs | Low | Low | Watchdog uses systemd; maintenance uses cron — no overlap in functionality |
