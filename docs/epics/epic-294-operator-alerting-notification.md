# Epic 294: Operator Alerting & Notification

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 278 (Observability Stack via Ansible)
**Blocks**: None
**Branch**: `desktop`

## Summary

Implement a lightweight, cron-based alerting system that proactively notifies part-time operators when infrastructure needs attention. Supports ntfy (self-hosted, privacy-friendly), Gotify, email (SMTP), and generic webhooks as alert channels. Alerts fire on state transitions only (healthy to unhealthy) with 24-hour reminders for persistent failures, preventing notification spam.

## Problem Statement

Llamenos is operated by 2-3 part-time volunteers who cannot monitor health dashboards continuously. The current infrastructure exposes health check endpoints (`/api/health`, `/health/live`, `/health/ready`) and Prometheus metrics (`/api/metrics`), but there is no mechanism to push notifications when something goes wrong. If the database fills up, a backup fails, or TLS certificates expire, operators discover the problem only when end users report it — potentially hours or days later.

For a crisis hotline serving vulnerable populations, even brief outages can mean missed calls from people in danger. Operators need to be woken up (figuratively — via push notification) when:
- A core service is down
- Backups are stale or failing
- Disk space is critically low
- TLS certificates are about to expire
- Call routing is broken
- Time synchronization has drifted (breaks Schnorr token validation)

The alerting system must be simple enough for non-devops operators to configure and maintain, and privacy-friendly (no reliance on Google/Apple push infrastructure if using ntfy self-hosted).

## Implementation

### Phase 1: Alert Check Script

A single bash script that runs via cron every 5 minutes. It checks multiple health signals and writes state to a file for deduplication.

**File: `deploy/ansible/templates/alerting/check-alerts.sh.j2`**

```bash
#!/usr/bin/env bash
#
# Llamenos Alert Check — managed by Ansible
#
# Runs every 5 minutes via cron. Checks infrastructure health and sends
# alerts via {{ llamenos_alerting_provider }} on state transitions.
#
# State file: {{ app_dir }}/alerting/state.json
# Log: {{ app_dir }}/alerting/alerts.log

set -euo pipefail

APP_DIR="{{ app_dir }}"
STATE_FILE="${APP_DIR}/alerting/state.json"
LOG_FILE="${APP_DIR}/alerting/alerts.log"
ALERT_PROVIDER="{{ llamenos_alerting_provider }}"
NOW="$(date -u +%s)"

# Initialize state file if missing
if [ ! -f "${STATE_FILE}" ]; then
  echo '{}' > "${STATE_FILE}"
fi

PREV_STATE="$(cat "${STATE_FILE}")"
NEW_STATE="{}"
ALERTS=()

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "${LOG_FILE}"
}

# Read previous alert state for a check
prev_status() {
  echo "${PREV_STATE}" | jq -r ".\"$1\".status // \"unknown\""
}

prev_alerted_at() {
  echo "${PREV_STATE}" | jq -r ".\"$1\".alerted_at // \"0\""
}

# Record new state for a check
set_state() {
  local check="$1" status="$2" detail="$3"
  NEW_STATE="$(echo "${NEW_STATE}" | jq --arg c "${check}" --arg s "${status}" \
    --arg d "${detail}" --arg t "${NOW}" \
    '. + {($c): {status: $s, detail: $d, checked_at: ($t | tonumber)}}')"
}

# Queue an alert if state changed or reminder due
maybe_alert() {
  local check="$1" status="$2" detail="$3" priority="${4:-default}"
  local prev
  prev="$(prev_status "${check}")"
  local last_alert
  last_alert="$(prev_alerted_at "${check}")"

  if [ "${status}" = "failing" ]; then
    # Alert on transition healthy→failing, or reminder after 24 hours
    local age=$(( NOW - last_alert ))
    if [ "${prev}" != "failing" ] || [ "${age}" -ge 86400 ]; then
      ALERTS+=("${priority}|${check}|${detail}")
      NEW_STATE="$(echo "${NEW_STATE}" | jq --arg c "${check}" --arg t "${NOW}" \
        '.[$c].alerted_at = ($t | tonumber)')"
    else
      # Preserve previous alerted_at
      NEW_STATE="$(echo "${NEW_STATE}" | jq --arg c "${check}" --arg t "${last_alert}" \
        '.[$c].alerted_at = ($t | tonumber)')"
    fi
  elif [ "${status}" = "ok" ] && [ "${prev}" = "failing" ]; then
    # Recovery notification
    ALERTS+=("low|${check}|RECOVERED: ${detail}")
  fi
}

# ─── Check 1: App Health ──────────────────────────────────────────
APP_HEALTH="$(curl -sf --max-time 10 http://localhost:3000/api/health 2>/dev/null || echo '{"status":"failing"}')"
APP_STATUS="$(echo "${APP_HEALTH}" | jq -r '.status')"
if [ "${APP_STATUS}" = "ok" ]; then
  set_state "app_health" "ok" "All services healthy"
  maybe_alert "app_health" "ok" "App health restored"
else
  DETAIL="$(echo "${APP_HEALTH}" | jq -r '.details // {} | to_entries | map("\(.key): \(.value)") | join(", ")' 2>/dev/null || echo 'unreachable')"
  set_state "app_health" "failing" "${DETAIL}"
  maybe_alert "app_health" "failing" "App health degraded: ${DETAIL}" "high"
fi

# ─── Check 2: Disk Usage ─────────────────────────────────────────
DISK_PCT="$(df --output=pcent / | tail -1 | tr -d ' %')"
if [ "${DISK_PCT}" -ge 90 ]; then
  set_state "disk_usage" "failing" "Root disk at ${DISK_PCT}%"
  maybe_alert "disk_usage" "failing" "CRITICAL: Disk at ${DISK_PCT}% — server may run out of space" "urgent"
elif [ "${DISK_PCT}" -ge 80 ]; then
  set_state "disk_usage" "failing" "Root disk at ${DISK_PCT}%"
  maybe_alert "disk_usage" "failing" "WARNING: Disk at ${DISK_PCT}% — consider cleanup" "high"
else
  set_state "disk_usage" "ok" "Root disk at ${DISK_PCT}%"
  maybe_alert "disk_usage" "ok" "Disk usage back to normal: ${DISK_PCT}%"
fi

# ─── Check 3: Backup Staleness ───────────────────────────────────
LATEST_BACKUP="$(find "${APP_DIR}/backups/daily" -maxdepth 1 -name 'llamenos-*' -type f -printf '%T@\n' 2>/dev/null | sort -rn | head -1)"
if [ -z "${LATEST_BACKUP}" ]; then
  set_state "backup_age" "failing" "No backups found"
  maybe_alert "backup_age" "failing" "No backups found in ${APP_DIR}/backups/daily/" "high"
else
  BACKUP_AGE=$(( NOW - ${LATEST_BACKUP%.*} ))
  BACKUP_HOURS=$(( BACKUP_AGE / 3600 ))
  if [ "${BACKUP_AGE}" -ge 129600 ]; then  # 36 hours
    set_state "backup_age" "failing" "Last backup ${BACKUP_HOURS}h ago"
    maybe_alert "backup_age" "failing" "Backup stale: last backup was ${BACKUP_HOURS} hours ago (threshold: 36h)" "high"
  else
    set_state "backup_age" "ok" "Last backup ${BACKUP_HOURS}h ago"
    maybe_alert "backup_age" "ok" "Backup freshness restored: ${BACKUP_HOURS}h ago"
  fi
fi

# ─── Check 4: TLS Certificate Expiry ─────────────────────────────
{% if domain is defined and domain != '' %}
CERT_EXPIRY="$(echo | openssl s_client -servername {{ domain }} -connect {{ domain }}:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
if [ -n "${CERT_EXPIRY}" ]; then
  CERT_EPOCH="$(date -d "${CERT_EXPIRY}" +%s 2>/dev/null || echo 0)"
  DAYS_LEFT=$(( (CERT_EPOCH - NOW) / 86400 ))
  if [ "${DAYS_LEFT}" -le 7 ]; then
    set_state "tls_cert" "failing" "Expires in ${DAYS_LEFT} days"
    maybe_alert "tls_cert" "failing" "TLS certificate for {{ domain }} expires in ${DAYS_LEFT} days" "urgent"
  else
    set_state "tls_cert" "ok" "Expires in ${DAYS_LEFT} days"
    maybe_alert "tls_cert" "ok" "TLS certificate renewed: ${DAYS_LEFT} days remaining"
  fi
else
  set_state "tls_cert" "failing" "Cannot check certificate"
  maybe_alert "tls_cert" "failing" "Cannot connect to {{ domain }}:443 to check TLS certificate" "high"
fi
{% endif %}

# ─── Check 5: NTP Drift ──────────────────────────────────────────
if command -v chronyc &>/dev/null; then
  DRIFT_MS="$(chronyc tracking 2>/dev/null | grep 'System time' | awk '{print $4}' || echo '0')"
  DRIFT_S="$(echo "${DRIFT_MS}" | awk '{printf "%.0f", $1}')"
  if [ "${DRIFT_S}" -ge 30 ]; then
    set_state "ntp_drift" "failing" "Clock drift ${DRIFT_S}s"
    maybe_alert "ntp_drift" "failing" "NTP drift is ${DRIFT_S}s — Schnorr token validation may fail" "high"
  else
    set_state "ntp_drift" "ok" "Clock drift ${DRIFT_S}s"
    maybe_alert "ntp_drift" "ok" "NTP drift corrected"
  fi
elif command -v timedatectl &>/dev/null; then
  NTP_SYNC="$(timedatectl show --property=NTPSynchronized --value 2>/dev/null || echo 'no')"
  if [ "${NTP_SYNC}" = "yes" ]; then
    set_state "ntp_drift" "ok" "NTP synchronized"
    maybe_alert "ntp_drift" "ok" "NTP synchronization restored"
  else
    set_state "ntp_drift" "failing" "NTP not synchronized"
    maybe_alert "ntp_drift" "failing" "NTP not synchronized — clock drift may break auth tokens" "high"
  fi
fi

# ─── Check 6: Docker Container Health ────────────────────────────
UNHEALTHY="$(docker ps --filter 'health=unhealthy' --format '{{ '{{' }}.Names{{ '}}' }}' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')"
if [ -n "${UNHEALTHY}" ]; then
  set_state "container_health" "failing" "Unhealthy: ${UNHEALTHY}"
  maybe_alert "container_health" "failing" "Unhealthy containers: ${UNHEALTHY}" "high"
else
  set_state "container_health" "ok" "All containers healthy"
  maybe_alert "container_health" "ok" "All containers healthy again"
fi

# ─── Check 7: PostgreSQL Storage ─────────────────────────────────
PG_SIZE="$(docker exec llamenos-postgres-1 psql -U llamenos -d llamenos -t -c "SELECT pg_database_size('llamenos')" 2>/dev/null | tr -d ' ' || echo '0')"
PG_SIZE_GB="$(echo "${PG_SIZE}" | awk '{printf "%.1f", $1/1073741824}')"
# Alert if DB exceeds 80% of available disk (rough heuristic)
DISK_AVAIL_KB="$(df --output=avail / | tail -1 | tr -d ' ')"
DISK_AVAIL_BYTES=$(( DISK_AVAIL_KB * 1024 ))
if [ "${PG_SIZE}" -gt 0 ] && [ "${DISK_AVAIL_BYTES}" -gt 0 ]; then
  PG_RATIO=$(( PG_SIZE * 100 / (PG_SIZE + DISK_AVAIL_BYTES) ))
  if [ "${PG_RATIO}" -ge 80 ]; then
    set_state "pg_storage" "failing" "DB is ${PG_SIZE_GB}GB (${PG_RATIO}% of available disk)"
    maybe_alert "pg_storage" "failing" "PostgreSQL using ${PG_SIZE_GB}GB (${PG_RATIO}% of available space)" "high"
  else
    set_state "pg_storage" "ok" "DB is ${PG_SIZE_GB}GB"
    maybe_alert "pg_storage" "ok" "PostgreSQL storage back to normal"
  fi
fi

# ─── Send Alerts ─────────────────────────────────────────────────
# NOTE: send_alert is also extracted into alert-functions.sh (below)
# so test-alerts.sh can source it without executing all checks.
send_alert() {
  local priority="$1" check="$2" message="$3"
  log "ALERT [${priority}] ${check}: ${message}"

  case "${ALERT_PROVIDER}" in
    ntfy)
      curl -sf --max-time 15 \
        -H "Title: Llamenos: ${check}" \
        -H "Priority: ${priority}" \
        -H "Tags: {{ llamenos_alerting_tags | default('rotating_light') }}" \
        -d "${message}" \
        "{{ llamenos_ntfy_url }}" || log "ERROR: Failed to send ntfy alert"
      ;;
    gotify)
      local gotify_priority=5
      [ "${priority}" = "urgent" ] && gotify_priority=9
      [ "${priority}" = "high" ] && gotify_priority=7
      [ "${priority}" = "low" ] && gotify_priority=2
      curl -sf --max-time 15 \
        -F "title=Llamenos: ${check}" \
        -F "message=${message}" \
        -F "priority=${gotify_priority}" \
        "{{ llamenos_gotify_url }}/message?token={{ llamenos_gotify_token }}" || log "ERROR: Failed to send Gotify alert"
      ;;
    email)
      echo -e "Subject: [Llamenos Alert] ${check}\n\n${message}" | \
        msmtp --host="{{ llamenos_smtp_host }}" \
              --port="{{ llamenos_smtp_port | default('587') }}" \
              --auth=on \
              --user="{{ llamenos_smtp_user }}" \
              --password="{{ llamenos_smtp_password }}" \
              --tls=on \
              --from="{{ llamenos_alert_from | default('alerts@llamenos.org') }}" \
              "{{ llamenos_alert_to }}" || log "ERROR: Failed to send email alert"
      ;;
    webhook)
      curl -sf --max-time 15 \
        -H "Content-Type: application/json" \
        -d "{\"check\": \"${check}\", \"priority\": \"${priority}\", \"message\": \"${message}\", \"timestamp\": ${NOW}}" \
        "{{ llamenos_webhook_url }}" || log "ERROR: Failed to send webhook alert"
      ;;
  esac
}

for alert in "${ALERTS[@]}"; do
  IFS='|' read -r priority check message <<< "${alert}"
  send_alert "${priority}" "${check}" "${message}"
done

# ─── Persist State ────────────────────────────────────────────────
echo "${NEW_STATE}" > "${STATE_FILE}"
```

### Phase 2: Ansible Role

**File: `deploy/ansible/roles/alerting/tasks/main.yml`**

```yaml
---
# Alerting role — sets up cron-based health monitoring with push notifications

- name: Skip if alerting not enabled
  ansible.builtin.meta: end_play
  when: not (llamenos_alerting_enabled | default(false))

- name: Install dependencies (jq, msmtp for email)
  ansible.builtin.apt:
    name:
      - jq
      - curl
    state: present

- name: Install msmtp for email alerts
  ansible.builtin.apt:
    name: msmtp
    state: present
  when: llamenos_alerting_provider == 'email'

- name: Create alerting directory
  ansible.builtin.file:
    path: "{{ app_dir }}/alerting"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Template alert check script
  ansible.builtin.template:
    src: alerting/check-alerts.sh.j2
    dest: "{{ app_dir }}/scripts/check-alerts.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
  notify: Test alert script

- name: Template alert functions (shared by check-alerts and test-alerts)
  ansible.builtin.template:
    src: alerting/alert-functions.sh.j2
    dest: "{{ app_dir }}/scripts/alert-functions.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Template test-alerts script
  ansible.builtin.copy:
    dest: "{{ app_dir }}/scripts/test-alerts.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
    content: |
      #!/usr/bin/env bash
      # Send a test alert to verify notification delivery
      set -euo pipefail
      source {{ app_dir }}/scripts/alert-functions.sh
      send_alert "low" "test" "This is a test alert from Llamenos. If you see this, alerting is working."
      echo "Test alert sent via {{ llamenos_alerting_provider }}."

- name: Configure cron job (every 5 minutes)
  ansible.builtin.cron:
    name: "Llamenos alert check"
    user: "{{ deploy_user }}"
    minute: "*/5"
    job: "{{ app_dir }}/scripts/check-alerts.sh >> {{ app_dir }}/alerting/alerts.log 2>&1"
    state: present

- name: Configure alert log rotation
  ansible.builtin.copy:
    dest: /etc/logrotate.d/llamenos-alerts
    owner: root
    group: root
    mode: "0644"
    content: |
      {{ app_dir }}/alerting/alerts.log {
          weekly
          rotate 8
          compress
          delaycompress
          missingok
          notifempty
          create 0640 {{ deploy_user }} {{ deploy_group }}
      }
```

### Phase 3: Ansible Variables

Add to `deploy/ansible/vars.example.yml`:

```yaml
# ─── Alerting ──────────────────────────────────────────────────────
# Enable operator alerting (requires one provider configured below)
llamenos_alerting_enabled: false

# Provider: ntfy, gotify, email, webhook
llamenos_alerting_provider: ntfy

# ntfy (recommended — self-hosted, privacy-friendly)
llamenos_ntfy_url: https://ntfy.example.com/llamenos
llamenos_alerting_tags: rotating_light

# Gotify (alternative self-hosted)
# llamenos_gotify_url: https://gotify.example.com
# llamenos_gotify_token: ""

# Email (SMTP)
# llamenos_smtp_host: smtp.example.com
# llamenos_smtp_port: 587
# llamenos_smtp_user: alerts@example.com
# llamenos_smtp_password: ""
# llamenos_alert_from: alerts@llamenos.org
# llamenos_alert_to: operator@example.com

# Webhook (generic HTTP POST)
# llamenos_webhook_url: https://example.com/webhook/llamenos
```

### Phase 4: Justfile Commands

Add to `deploy/ansible/justfile`:

```just
# Test alert delivery (sends a test notification)
test-alerts *ARGS:
    ansible-playbook playbooks/deploy.yml --ask-vault-pass --tags alerting {{ARGS}}
    ssh -t {{ ansible_host }} "{{ app_dir }}/scripts/test-alerts.sh"

# View recent alerts
alert-log *ARGS:
    ssh {{ ansible_host }} "tail -50 {{ app_dir }}/alerting/alerts.log"

# View current alert state
alert-state *ARGS:
    ssh {{ ansible_host }} "cat {{ app_dir }}/alerting/state.json | jq ."
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `deploy/ansible/templates/alerting/check-alerts.sh.j2` | Create | Main alert check script template |
| `deploy/ansible/templates/alerting/alert-functions.sh.j2` | Create | Shared `send_alert` function (sourced by check-alerts and test-alerts) |
| `deploy/ansible/roles/alerting/tasks/main.yml` | Create | Ansible role for alerting setup |
| `deploy/ansible/roles/alerting/handlers/main.yml` | Create | Handler to test alerting on config change |
| `deploy/ansible/vars.example.yml` | Extend | Add alerting configuration variables |
| `deploy/ansible/justfile` | Extend | Add `test-alerts`, `alert-log`, `alert-state` commands |
| `deploy/ansible/playbooks/deploy.yml` | Extend | Include alerting role |
| `deploy/ansible/setup.yml` | Extend | Include alerting in full setup |

## Testing

1. **Unit test the check script**: Run `check-alerts.sh` locally with a mocked health endpoint (use `docker run --rm -p 3000:3000 nginx` returning 503). Verify state file transitions from `unknown` to `failing`.

2. **Deduplication test**: Run the script twice with a failing check. Verify only one alert is sent (second run should detect `prev_status == "failing"` and skip unless 24 hours have passed).

3. **Recovery test**: Start with a failing state, fix the health endpoint, run the script. Verify a recovery alert is sent with "RECOVERED:" prefix.

4. **Provider integration test**: For each provider:
   - **ntfy**: Set up a local ntfy instance (`docker run --rm -p 2586:80 binwiederhier/ntfy serve`), configure `llamenos_ntfy_url: http://localhost:2586/test`, run `just test-alerts`, verify message received via `curl http://localhost:2586/test/json`.
   - **webhook**: Run `nc -l 8888` as a sink, set webhook URL to `http://localhost:8888`, verify JSON POST arrives.
   - **email**: Use Mailpit (`docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit`), configure SMTP to localhost:1025, verify email arrives in Mailpit UI.

5. **Ansible idempotency**: Run `just deploy` twice. Second run should report zero changes for alerting tasks.

6. **Cron verification**: After deployment, check `crontab -l -u deploy` shows the 5-minute check-alerts entry.

## Acceptance Criteria

- [ ] Alert script checks all 7 health signals: app health, disk usage, backup staleness, TLS expiry, NTP drift, container health, PostgreSQL storage
- [ ] Alerts fire only on state transitions (healthy to unhealthy) — no repeated alerts for persistent failures within 24 hours
- [ ] Recovery notifications sent when a check returns to healthy
- [ ] 24-hour reminder alerts for persistent failures
- [ ] ntfy, Gotify, email, and webhook providers all functional
- [ ] `just test-alerts` sends a test notification to verify configuration
- [ ] Alert state persisted in JSON file across cron invocations
- [ ] Alert log rotated weekly, 8 weeks retained
- [ ] Alerting is opt-in (`llamenos_alerting_enabled: false` by default)
- [ ] Script handles network timeouts gracefully (no cron job failures due to unreachable alert endpoint)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Alert script fails silently (cron errors) | Medium | High | Redirect stderr to log file; log rotation ensures logs don't fill disk; the script itself is a health check target |
| ntfy/Gotify self-hosted instance goes down | Low | Medium | Webhook fallback allows routing to any HTTP endpoint; operators can configure multiple channels in sequence |
| Alert fatigue from noisy checks | Medium | Medium | State-based deduplication prevents repeated alerts; 24-hour reminder interval is configurable; priority levels allow filtering |
| False positives from transient network issues | Medium | Low | Health endpoint check has 10-second timeout; disk/NTP checks are local and reliable; backup staleness threshold is 36 hours (not 24) to account for cron timing |
| Script incompatible with non-Debian distros | Low | Medium | Uses POSIX-compatible commands except `df --output` which is GNU coreutils; Alpine/RHEL may need adjustment |
