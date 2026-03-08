# Epic 278: Observability Stack via Ansible

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 276
**Blocks**: None
**Branch**: `desktop`

## Summary

Add toggleable observability roles (Prometheus, Grafana, Loki, Alertmanager/ntfy) to the Ansible deployment. Auto-generate Prometheus scrape configs from inventory, ship pre-built Grafana dashboards for call volume, volunteer activity, service health, and backup status, and provide a lightweight alternative (health-check polling + ntfy) for single-box deployments.

## Problem Statement

Llamenos operators currently have no visibility into system health beyond SSH-ing into servers and running `docker compose ps`. For a crisis hotline where downtime means missed calls from people in danger, this is inadequate:

1. **No metrics.** There is no way to see PostgreSQL connection pool utilization, memory pressure, disk fill rate, or request latency without manual investigation. An operator cannot predict a disk-full outage before it happens.

2. **No centralized logging.** Each service writes logs to its Docker container stdout. On a multi-host deployment (Epic 276), correlating an error across app + postgres + strfry requires SSH-ing into each host separately.

3. **No alerting.** The backup health check (Epic 277) adds webhook alerts for backup staleness, but there is no alerting for service crashes, high error rates, certificate expiry, or disk pressure.

4. **Resource overhead concern.** Running Prometheus + Grafana + Loki requires ~1 GB RAM. Single-box deployments on cheap VPS instances (1-2 GB RAM) cannot afford this. A lightweight alternative is needed.

## Implementation

### Phase 1: Observability Toggle Variables

**Additions to `deploy/ansible/vars.example.yml`:**

```yaml
# ─── Observability ─────────────────────────────────────────────
# Full observability stack (Prometheus + Grafana + Loki)
# Requires ~1 GB additional RAM. Recommended for multi-host deployments.
llamenos_observability_enabled: false

# Lightweight monitoring (health polls + ntfy alerts only)
# Works on any deployment size. Mutually exclusive with full observability.
llamenos_healthcheck_enabled: true

# ─── Prometheus ────────────────────────────────────────────────
llamenos_prometheus_enabled: "{{ llamenos_observability_enabled }}"
llamenos_prometheus_image: prom/prometheus:v3.3.1
llamenos_prometheus_retention: 30d
llamenos_prometheus_port: 9090

# ─── Grafana ──────────────────────────────────────────────────
llamenos_grafana_enabled: "{{ llamenos_observability_enabled }}"
llamenos_grafana_image: grafana/grafana-oss:11.6.0
llamenos_grafana_admin_password: ""  # Generate with: openssl rand -base64 16
llamenos_grafana_domain: "{{ domain }}"
# Expose Grafana on a subdomain or path
llamenos_grafana_path: "/grafana"

# ─── Loki ─────────────────────────────────────────────────────
llamenos_loki_enabled: "{{ llamenos_observability_enabled }}"
llamenos_loki_image: grafana/loki:3.5.0
llamenos_loki_retention: 168h  # 7 days

# ─── Promtail (log shipper) ──────────────────────────────────
llamenos_promtail_enabled: "{{ llamenos_loki_enabled }}"
llamenos_promtail_image: grafana/promtail:3.5.0

# ─── Alerting ─────────────────────────────────────────────────
# ntfy topic URL for alerts (works with both full and lightweight monitoring)
llamenos_alert_webhook: ""
# Example: "https://ntfy.sh/llamenos-alerts-RANDOMSUFFIX"

# Alert thresholds
llamenos_alert_disk_percent: 85
llamenos_alert_memory_percent: 90
llamenos_alert_cert_expiry_days: 7
llamenos_alert_health_failures: 3
```

### Phase 2: Node Exporter on All Hosts

**File: `deploy/ansible/roles/llamenos-node-exporter/tasks/main.yml`**

```yaml
---
# Node Exporter — system metrics for Prometheus
# Runs on ALL llamenos_servers hosts when observability is enabled

- name: Skip if observability not enabled
  ansible.builtin.meta: end_host
  when: not (llamenos_observability_enabled | default(false))

- name: Create node-exporter directory
  ansible.builtin.file:
    path: "{{ app_dir }}/services/node-exporter"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Template node-exporter compose file
  ansible.builtin.template:
    src: compose/node-exporter.j2
    dest: "{{ app_dir }}/services/node-exporter/docker-compose.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart node-exporter

- name: Start node-exporter
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/node-exporter"
    state: present
```

**File: `deploy/ansible/templates/compose/node-exporter.j2`**

```yaml
# Node Exporter — managed by Ansible
name: llamenos

services:
  node-exporter:
    image: prom/node-exporter:v1.9.0
    restart: unless-stopped
    command:
      - '--path.rootfs=/host'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
      - '--collector.textfile.directory=/textfile'
    volumes:
      - /:/host:ro,rslave
      - {{ app_dir }}/metrics:/textfile:ro
    network_mode: host
    pid: host
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          memory: 64M
```

### Phase 3: Prometheus with Auto-Generated Scrape Config

**File: `deploy/ansible/roles/llamenos-prometheus/tasks/main.yml`**

```yaml
---
# Prometheus — metrics collection and alerting
# Runs on the observability host (first llamenos_servers host by default)

- name: Skip if Prometheus not enabled
  ansible.builtin.meta: end_host
  when: not (llamenos_prometheus_enabled | default(false))

- name: Skip if not the observability host
  ansible.builtin.meta: end_host
  when: >
    groups.get('llamenos_observability', []) | length > 0 and
    inventory_hostname not in groups.get('llamenos_observability', []) or
    (groups.get('llamenos_observability', []) | length == 0 and
     inventory_hostname != groups['llamenos_servers'][0])

- name: Create Prometheus directories
  ansible.builtin.file:
    path: "{{ app_dir }}/services/prometheus/{{ item }}"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
  loop:
    - ""
    - rules

- name: Template Prometheus config (scrape targets auto-generated from inventory)
  ansible.builtin.template:
    src: observability/prometheus.yml.j2
    dest: "{{ app_dir }}/services/prometheus/prometheus.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart prometheus

- name: Template alert rules
  ansible.builtin.template:
    src: observability/alert-rules.yml.j2
    dest: "{{ app_dir }}/services/prometheus/rules/alerts.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart prometheus

- name: Template Prometheus compose file
  ansible.builtin.template:
    src: compose/prometheus.j2
    dest: "{{ app_dir }}/services/prometheus/docker-compose.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart prometheus

- name: Start Prometheus
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/prometheus"
    state: present
```

**File: `deploy/ansible/templates/observability/prometheus.yml.j2`**

```yaml
# Prometheus Configuration — managed by Ansible
# Scrape targets auto-generated from inventory groups.
# Generated: {{ ansible_date_time.iso8601 | default('unknown') }}

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    deployment: "{{ domain }}"

rule_files:
  - /etc/prometheus/rules/*.yml

{% if llamenos_alert_webhook | default('') | length > 0 %}
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
{% endif %}

scrape_configs:
  # ── Node Exporter (system metrics) ──
  - job_name: 'node'
    static_configs:
{% for host in groups['llamenos_servers'] %}
      - targets: ['{{ hostvars[host]['ansible_host'] }}:9100']
        labels:
          instance: '{{ host }}'
{% endfor %}

  # ── Application metrics ──
{% if llamenos_app_enabled | default(true) %}
  - job_name: 'llamenos-app'
    metrics_path: '/api/metrics'
    static_configs:
{% for host in groups.get('llamenos_app', groups['llamenos_servers']) %}
      - targets: ['{{ hostvars[host]['ansible_host'] }}:3000']
        labels:
          instance: '{{ host }}'
{% endfor %}
{% endif %}

  # ── PostgreSQL metrics (via pg_exporter sidecar) ──
{% if llamenos_postgres_enabled | default(true) %}
  - job_name: 'postgres'
    static_configs:
{% for host in groups.get('llamenos_db', groups['llamenos_servers']) %}
      - targets: ['{{ hostvars[host]['ansible_host'] }}:9187']
        labels:
          instance: '{{ host }}'
{% endfor %}
{% endif %}

  # ── Caddy metrics ──
{% if llamenos_caddy_enabled | default(true) %}
  - job_name: 'caddy'
    static_configs:
{% for host in groups.get('llamenos_proxy', groups['llamenos_servers']) %}
      - targets: ['{{ hostvars[host]['ansible_host'] }}:2019']
        labels:
          instance: '{{ host }}'
{% endfor %}
{% endif %}

  # ── MinIO metrics ──
{% if llamenos_minio_enabled | default(true) %}
  - job_name: 'minio'
    metrics_path: '/minio/v2/metrics/cluster'
    static_configs:
{% for host in groups.get('llamenos_storage', groups['llamenos_servers']) %}
      - targets: ['{{ hostvars[host]['ansible_host'] }}:9000']
        labels:
          instance: '{{ host }}'
{% endfor %}
{% endif %}

  # ── Prometheus self-monitoring ──
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # ── Textfile collector (app health + container restart metrics) ──
  # node-exporter reads .prom files from this directory.
  # The healthcheck cron (Phase 6) writes llamenos_health_up and
  # llamenos_container_restarts_total metrics here.
  # Enabled via --collector.textfile.directory on node-exporter.
```

**File: `deploy/ansible/templates/observability/alert-rules.yml.j2`**

```yaml
# Prometheus Alert Rules — managed by Ansible
groups:
  - name: llamenos_infrastructure
    rules:
      - alert: HighDiskUsage
        expr: 100 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100) > {{ llamenos_alert_disk_percent }}
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk usage above {{ llamenos_alert_disk_percent }}% on {{ '{{' }} $labels.instance {{ '}}' }}"
          description: "Current usage: {{ '{{' }} $value | humanize {{ '}}' }}%"

      - alert: HighMemoryUsage
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > {{ llamenos_alert_memory_percent }}
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage above {{ llamenos_alert_memory_percent }}% on {{ '{{' }} $labels.instance {{ '}}' }}"

      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "{{ '{{' }} $labels.job {{ '}}' }} is down on {{ '{{' }} $labels.instance {{ '}}' }}"

      - alert: AppHealthCheckFailing
        expr: llamenos_health_up == 0
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "Llamenos app health check failing on {{ '{{' }} $labels.instance {{ '}}' }}"

      - alert: PostgreSQLDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down on {{ '{{' }} $labels.instance {{ '}}' }}"

      - alert: PostgreSQLConnectionsHigh
        expr: pg_stat_activity_count / pg_settings_max_connections * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL connection pool at {{ '{{' }} $value | humanize {{ '}}' }}% on {{ '{{' }} $labels.instance {{ '}}' }}"

      - alert: NTPClockDrift
        expr: abs(node_timex_offset_seconds) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "NTP clock drift {{ '{{' }} $value | humanize {{ '}}' }}s on {{ '{{' }} $labels.instance {{ '}}' }} (Schnorr signatures may fail at >5min drift)"

      - alert: CertificateExpiringSoon
        expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < {{ llamenos_alert_cert_expiry_days }}
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "TLS certificate expires in {{ '{{' }} $value | humanize {{ '}}' }} days"

  - name: llamenos_application
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Error rate above 5% on {{ '{{' }} $labels.instance {{ '}}' }}"

      - alert: ContainerRestarting
        expr: increase(llamenos_container_restarts_total[1h]) > 3
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Container {{ '{{' }} $labels.name {{ '}}' }} has restarted {{ '{{' }} $value {{ '}}' }} times in the last hour"
```

### Phase 4: Grafana with Pre-Built Dashboards

**File: `deploy/ansible/roles/llamenos-grafana/tasks/main.yml`**

```yaml
---
# Grafana — dashboards and visualization
# Runs on the observability host

- name: Skip if Grafana not enabled
  ansible.builtin.meta: end_host
  when: not (llamenos_grafana_enabled | default(false))

- name: Create Grafana directories
  ansible.builtin.file:
    path: "{{ app_dir }}/services/grafana/{{ item }}"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"
  loop:
    - ""
    - provisioning/dashboards
    - provisioning/datasources
    - dashboards

- name: Template Grafana datasource provisioning
  ansible.builtin.template:
    src: observability/grafana-datasources.yml.j2
    dest: "{{ app_dir }}/services/grafana/provisioning/datasources/default.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"

- name: Template Grafana dashboard provisioning
  ansible.builtin.copy:
    dest: "{{ app_dir }}/services/grafana/provisioning/dashboards/default.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
    content: |
      apiVersion: 1
      providers:
        - name: 'Llamenos'
          orgId: 1
          folder: 'Llamenos'
          type: file
          disableDeletion: false
          updateIntervalSeconds: 30
          options:
            path: /var/lib/grafana/dashboards

- name: Copy pre-built dashboards
  ansible.builtin.template:
    src: "observability/dashboards/{{ item }}"
    dest: "{{ app_dir }}/services/grafana/dashboards/{{ item | replace('.j2', '') }}"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  loop:
    - overview.json.j2
    - postgres.json.j2
    - system.json.j2
    - backup-status.json.j2

- name: Template Grafana compose file
  ansible.builtin.template:
    src: compose/grafana.j2
    dest: "{{ app_dir }}/services/grafana/docker-compose.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart grafana

- name: Start Grafana
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/grafana"
    state: present
```

Pre-built dashboards to include:

1. **Overview Dashboard** (`overview.json.j2`): Active calls, connected volunteers, request rate, error rate, uptime, last deploy time.
2. **PostgreSQL Dashboard** (`postgres.json.j2`): Connection pool usage, query duration p95, rows inserted/updated/deleted, table sizes, vacuum status.
3. **System Dashboard** (`system.json.j2`): CPU, memory, disk I/O, network I/O, per-host. Based on node-exporter metrics.
4. **Backup Status Dashboard** (`backup-status.json.j2`): Last backup time per service, backup sizes over time, backup duration trends, alert history.

### Phase 5: Loki for Centralized Logging

**File: `deploy/ansible/roles/llamenos-loki/tasks/main.yml`**

```yaml
---
# Loki — centralized log aggregation
# Runs on the observability host

- name: Skip if Loki not enabled
  ansible.builtin.meta: end_host
  when: not (llamenos_loki_enabled | default(false))

- name: Create Loki directory
  ansible.builtin.file:
    path: "{{ app_dir }}/services/loki"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Template Loki config
  ansible.builtin.template:
    src: observability/loki-config.yml.j2
    dest: "{{ app_dir }}/services/loki/loki-config.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart loki

- name: Template Loki compose file
  ansible.builtin.template:
    src: compose/loki.j2
    dest: "{{ app_dir }}/services/loki/docker-compose.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart loki

- name: Start Loki
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/loki"
    state: present
```

**File: `deploy/ansible/templates/observability/loki-config.yml.j2`**

```yaml
# Loki Configuration — managed by Ansible
auth_enabled: false

server:
  http_listen_port: 3100

common:
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory
  replication_factor: 1
  path_prefix: /loki

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: {{ llamenos_loki_retention }}
  max_query_length: 721h
  max_query_parallelism: 2

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

**Promtail runs on every host** to ship Docker container logs to Loki:

**File: `deploy/ansible/roles/llamenos-promtail/tasks/main.yml`**

```yaml
---
# Promtail — log shipper (runs on every host)

- name: Skip if Promtail not enabled
  ansible.builtin.meta: end_host
  when: not (llamenos_promtail_enabled | default(false))

- name: Create Promtail directory
  ansible.builtin.file:
    path: "{{ app_dir }}/services/promtail"
    state: directory
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Template Promtail config
  ansible.builtin.template:
    src: observability/promtail-config.yml.j2
    dest: "{{ app_dir }}/services/promtail/promtail-config.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart promtail

- name: Template Promtail compose file
  ansible.builtin.template:
    src: compose/promtail.j2
    dest: "{{ app_dir }}/services/promtail/docker-compose.yml"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0640"
  notify: Restart promtail

- name: Start Promtail
  community.docker.docker_compose_v2:
    project_src: "{{ app_dir }}/services/promtail"
    state: present
```

**File: `deploy/ansible/templates/observability/promtail-config.yml.j2`**

```yaml
# Promtail Configuration — managed by Ansible
# Ships Docker container logs to Loki.

server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

{% set loki_host = hostvars[groups.get('llamenos_observability', groups['llamenos_servers'])[0]]['ansible_host'] %}
clients:
  - url: http://{{ loki_host }}:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 10s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/?(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
      - replacement: '{{ inventory_hostname }}'
        target_label: 'host'
    pipeline_stages:
      - docker: {}
      # Drop health check logs (noisy)
      - match:
          selector: '{service="caddy"}'
          stages:
            - regex:
                expression: '.*"uri":"/api/health".*'
            - drop:
                source: ''
                expression: '.*'
```

### Phase 6: Lightweight Alternative (Health Polls + ntfy)

For single-box deployments that cannot run the full observability stack.

**File: `deploy/ansible/roles/llamenos-healthcheck/tasks/main.yml`**

```yaml
---
# Lightweight health monitoring — polls services and sends ntfy alerts
# Alternative to full Prometheus/Grafana stack for resource-constrained hosts

- name: Skip if healthcheck monitoring not enabled
  ansible.builtin.meta: end_host
  when: not (llamenos_healthcheck_enabled | default(true))

- name: Skip if full observability is enabled (use that instead)
  ansible.builtin.meta: end_host
  when: llamenos_observability_enabled | default(false)

- name: Create healthcheck script
  ansible.builtin.template:
    src: observability/lightweight-healthcheck.sh.j2
    dest: "{{ app_dir }}/scripts/healthcheck.sh"
    owner: "{{ deploy_user }}"
    group: "{{ deploy_group }}"
    mode: "0750"

- name: Configure healthcheck cron (every 5 minutes)
  ansible.builtin.cron:
    name: "Llamenos health check"
    user: "{{ deploy_user }}"
    minute: "*/5"
    job: "{{ app_dir }}/scripts/healthcheck.sh >> {{ app_dir }}/logs/healthcheck.log 2>&1"
    state: present

- name: Configure healthcheck log rotation
  ansible.builtin.copy:
    dest: /etc/logrotate.d/llamenos-healthcheck
    owner: root
    group: root
    mode: "0644"
    content: |
      {{ app_dir }}/logs/healthcheck.log {
          daily
          rotate 7
          compress
          delaycompress
          missingok
          notifempty
          create 0640 {{ deploy_user }} {{ deploy_group }}
      }
```

**File: `deploy/ansible/templates/observability/lightweight-healthcheck.sh.j2`**

```bash
#!/usr/bin/env bash
# Lightweight Health Check — managed by Ansible
# Polls key services and sends ntfy alerts on failure.
# Designed for single-box deployments that can't run Prometheus/Grafana.
set -euo pipefail

ALERT_WEBHOOK="{{ llamenos_alert_webhook | default('') }}"
STATE_DIR="{{ app_dir }}/logs/healthcheck-state"
HOST="{{ inventory_hostname }}"
DOMAIN="{{ domain }}"

mkdir -p "${STATE_DIR}"

send_alert() {
  local title="$1" message="$2" priority="${3:-default}"
  if [ -n "${ALERT_WEBHOOK}" ]; then
    if echo "${ALERT_WEBHOOK}" | grep -q "ntfy"; then
      curl -sf -d "${message}" \
        -H "Title: ${title}" \
        -H "Priority: ${priority}" \
        -H "Tags: {{ 'warning' if priority == 'high' else 'white_check_mark' }}" \
        "${ALERT_WEBHOOK}" 2>/dev/null || true
    fi
  fi
}

check_service() {
  local name="$1" url="$2"
  local state_file="${STATE_DIR}/${name}.failures"
  local max_failures={{ llamenos_alert_health_failures | default(3) }}

  if curl -sf --max-time 10 "${url}" > /dev/null 2>&1; then
    # Service is up — reset failure count
    if [ -f "${state_file}" ]; then
      local prev_failures
      prev_failures="$(cat "${state_file}")"
      if [ "${prev_failures}" -ge "${max_failures}" ]; then
        send_alert "Recovered: ${name} on ${HOST}" "${name} is back up after ${prev_failures} consecutive failures"
      fi
      rm -f "${state_file}"
    fi
    return 0
  else
    # Service is down — increment failure count
    local failures=1
    [ -f "${state_file}" ] && failures=$(( $(cat "${state_file}") + 1 ))
    echo "${failures}" > "${state_file}"

    if [ "${failures}" -eq "${max_failures}" ]; then
      send_alert "DOWN: ${name} on ${HOST}" \
        "${name} has failed ${failures} consecutive health checks. URL: ${url}" \
        "high"
    fi
    return 1
  fi
}

# ── Check core services ──
{% if llamenos_app_enabled | default(true) %}
check_service "app" "http://localhost:3000/api/health" || true
{% endif %}

{% if llamenos_postgres_enabled | default(true) %}
docker compose -f {{ app_dir }}/services/postgres/docker-compose.yml \
  exec -T postgres pg_isready -U llamenos -d llamenos > /dev/null 2>&1 || \
  check_service "postgres" "http://localhost:3000/api/health" || true  # Indirect check
{% endif %}

# ── Check disk space ──
DISK_USAGE="$(df "{{ app_dir }}" --output=pcent 2>/dev/null | tail -1 | tr -d ' %')"
if [ "${DISK_USAGE:-0}" -gt "{{ llamenos_alert_disk_percent }}" ]; then
  DISK_STATE="${STATE_DIR}/disk.alerted"
  if [ ! -f "${DISK_STATE}" ]; then
    send_alert "Disk Warning on ${HOST}" "Disk at ${DISK_USAGE}% on {{ app_dir }}" "high"
    touch "${DISK_STATE}"
  fi
else
  rm -f "${STATE_DIR}/disk.alerted"
fi

# ── Check TLS certificate expiry ──
{% if llamenos_caddy_enabled | default(true) %}
CERT_EXPIRY="$(echo | openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
if [ -n "${CERT_EXPIRY}" ]; then
  EXPIRY_EPOCH="$(date -d "${CERT_EXPIRY}" +%s 2>/dev/null || date -j -f '%b %d %H:%M:%S %Y %Z' "${CERT_EXPIRY}" +%s 2>/dev/null || echo 0)"
  DAYS_LEFT=$(( (EXPIRY_EPOCH - $(date +%s)) / 86400 ))
  if [ "${DAYS_LEFT}" -lt "{{ llamenos_alert_cert_expiry_days }}" ]; then
    CERT_STATE="${STATE_DIR}/cert.alerted"
    if [ ! -f "${CERT_STATE}" ]; then
      send_alert "Certificate Expiring on ${HOST}" "TLS cert for ${DOMAIN} expires in ${DAYS_LEFT} days" "high"
      touch "${CERT_STATE}"
    fi
  else
    rm -f "${STATE_DIR}/cert.alerted"
  fi
fi
{% endif %}

# ── Check NTP drift ──
OFFSET="$(chronyc tracking 2>/dev/null | grep 'System time' | awk '{print $4}' || echo 0)"
# Convert to seconds (chrony reports in seconds with +/- prefix)
if command -v bc &>/dev/null; then
  DRIFT_MS="$(echo "${OFFSET} * 1000" | bc 2>/dev/null | tr -d '-' || echo 0)"
  if [ "$(echo "${DRIFT_MS} > 50" | bc 2>/dev/null || echo 0)" = "1" ]; then
    send_alert "NTP Drift on ${HOST}" "Clock drift: ${OFFSET}s (Schnorr signature validation may fail at >5min)" "high"
  fi
fi

# ── Write Prometheus textfile metrics ──
# These are scraped by node-exporter's textfile collector and used by
# the AppHealthCheckFailing and ContainerRestarting Prometheus alerts.
METRICS_DIR="{{ app_dir }}/metrics"
mkdir -p "${METRICS_DIR}"
PROM_FILE="${METRICS_DIR}/llamenos.prom"

{
  # App health: 1 = healthy, 0 = failing
  APP_HEALTHY=1
  curl -sf --max-time 10 "http://localhost:3000/api/health" > /dev/null 2>&1 || APP_HEALTHY=0
  echo "# HELP llamenos_health_up Whether the app /api/health endpoint is reachable (1=up, 0=down)."
  echo "# TYPE llamenos_health_up gauge"
  echo "llamenos_health_up ${APP_HEALTHY}"

  # Container restart counts (from Docker)
  echo "# HELP llamenos_container_restarts_total Number of container restarts."
  echo "# TYPE llamenos_container_restarts_total counter"
  docker ps --format '{{ '{{' }}.Names{{ '}}' }}' 2>/dev/null | while read -r cname; do
    RESTARTS="$(docker inspect --format '{{ '{{' }}.RestartCount{{ '}}' }}' "${cname}" 2>/dev/null || echo 0)"
    echo "llamenos_container_restarts_total{name=\"${cname}\"} ${RESTARTS}"
  done
} > "${PROM_FILE}.tmp"
mv "${PROM_FILE}.tmp" "${PROM_FILE}"
```

### Phase 7: Caddy Reverse Proxy for Grafana

**Additions to `deploy/ansible/templates/caddy.j2`:**

```
{% if llamenos_grafana_enabled | default(false) %}
	# Grafana dashboard (authenticated)
	handle {{ llamenos_grafana_path | default('/grafana') }}/* {
		reverse_proxy grafana:3000
	}
{% endif %}
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `deploy/ansible/vars.example.yml` | Extend | Observability toggle vars, alert thresholds |
| `deploy/ansible/roles/llamenos-node-exporter/tasks/main.yml` | Create | Node exporter deployment |
| `deploy/ansible/roles/llamenos-prometheus/tasks/main.yml` | Create | Prometheus deployment with auto-config |
| `deploy/ansible/roles/llamenos-grafana/tasks/main.yml` | Create | Grafana with provisioned dashboards |
| `deploy/ansible/roles/llamenos-loki/tasks/main.yml` | Create | Loki log aggregation |
| `deploy/ansible/roles/llamenos-promtail/tasks/main.yml` | Create | Promtail log shipper (all hosts) |
| `deploy/ansible/roles/llamenos-healthcheck/tasks/main.yml` | Create | Lightweight health polling |
| `deploy/ansible/templates/compose/node-exporter.j2` | Create | Node exporter compose |
| `deploy/ansible/templates/compose/prometheus.j2` | Create | Prometheus compose |
| `deploy/ansible/templates/compose/grafana.j2` | Create | Grafana compose |
| `deploy/ansible/templates/compose/loki.j2` | Create | Loki compose |
| `deploy/ansible/templates/compose/promtail.j2` | Create | Promtail compose |
| `deploy/ansible/templates/observability/prometheus.yml.j2` | Create | Prometheus config with auto-scrape |
| `deploy/ansible/templates/observability/alert-rules.yml.j2` | Create | Prometheus alert rules |
| `deploy/ansible/templates/observability/loki-config.yml.j2` | Create | Loki configuration |
| `deploy/ansible/templates/observability/promtail-config.yml.j2` | Create | Promtail configuration |
| `deploy/ansible/templates/observability/grafana-datasources.yml.j2` | Create | Grafana datasource provisioning |
| `deploy/ansible/templates/observability/dashboards/*.json.j2` | Create | 4 pre-built Grafana dashboards |
| `deploy/ansible/templates/observability/lightweight-healthcheck.sh.j2` | Create | Lightweight health check script |
| `deploy/ansible/templates/caddy.j2` | Extend | Add Grafana reverse proxy block |
| `deploy/ansible/playbooks/deploy.yml` | Extend | Add observability roles to deployment |
| `deploy/ansible/justfile` | Extend | Add `grafana-password`, `observability-status` commands |

## Testing

1. **Full stack deployment**: Enable `llamenos_observability_enabled: true`, deploy. Verify Prometheus scrapes all targets (check `/targets` page). Verify Grafana loads with all 4 dashboards. Verify Loki receives logs from all containers.

2. **Lightweight monitoring**: Enable only `llamenos_healthcheck_enabled: true`, disable observability. Verify cron runs every 5 minutes. Simulate service failure (stop app container), verify ntfy alert fires after configured threshold.

3. **Auto-generated scrape config**: Deploy with 3-host inventory. Verify `prometheus.yml` contains all 3 hosts as scrape targets. Add a 4th host, re-deploy, verify it appears in scrape config without manual editing.

4. **Alert rules**: Trigger each alert rule (fill disk to threshold, stop a container, introduce clock drift). Verify alerts appear in Prometheus UI. If alertmanager configured, verify webhook delivery.

5. **Multi-host Promtail**: On 2-host deployment, verify logs from both hosts appear in Loki/Grafana with correct `host` label.

6. **Resource usage**: Measure RAM usage of full observability stack. Must be under 1.2 GB total for Prometheus + Grafana + Loki + Promtail + node-exporter.

## Acceptance Criteria

- [ ] `llamenos_observability_enabled: true` deploys Prometheus, Grafana, Loki, Promtail, node-exporter
- [ ] `llamenos_healthcheck_enabled: true` (default) provides lightweight health polling with ntfy alerts
- [ ] The two modes are mutually exclusive (full observability disables lightweight checks)
- [ ] Prometheus scrape config is auto-generated from inventory groups
- [ ] 4 pre-built Grafana dashboards are provisioned automatically
- [ ] Loki receives and indexes Docker container logs from all hosts
- [ ] Alert rules cover: disk, memory, service down, PostgreSQL, NTP drift, cert expiry, error rate, container restarts
- [ ] Grafana is accessible via Caddy reverse proxy at configurable path
- [ ] Lightweight health check sends ntfy alerts only after N consecutive failures (no flapping)
- [ ] NTP drift monitoring works (critical for Schnorr signature validation)
- [ ] Node exporter runs on all hosts in the deployment

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Observability stack uses too much RAM on small VPS | Medium | Medium | Lightweight alternative is the default; full stack is opt-in with documented requirements |
| Prometheus retention fills disk | Low | Medium | Default 30-day retention; configurable via `llamenos_prometheus_retention`; disk alert fires before full |
| Grafana exposed without auth | Low | High | Grafana behind Caddy with authentication; admin password required in vars |
| Promtail Docker socket access is a security surface | Low | Medium | Promtail container runs read-only with `no-new-privileges`; Docker socket is read-only mount |
| Alert fatigue from false positives | Medium | Medium | Conservative thresholds; N-consecutive-failures before alerting; recovery notifications |
