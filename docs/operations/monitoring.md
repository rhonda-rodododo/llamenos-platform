# Monitoring and Observability

The observability stack is deployed via `deploy/ansible/playbooks/observability.yml`. Two modes are available:

- **Full stack** — Prometheus, Grafana, Loki, Promtail, Alertmanager, Node Exporter
- **Healthcheck-only** — Lightweight HTTP health polling with ntfy push notifications (no Prometheus/Grafana)

## Prerequisites

- Ansible 2.15+ and the `community.docker` collection installed
- `deploy/ansible/inventory.yml` configured
- `observability_enabled: true` set in `deploy/ansible/vars.yml`

## Configuration

Edit `deploy/ansible/vars.yml` (copy from `vars.example.yml`):

```yaml
# ─── Observability ───────────────────────────────────────────────
observability_enabled: true

# Individual component toggles
prometheus_enabled: true
grafana_enabled: true
loki_enabled: true
alertmanager_enabled: true
node_exporter_enabled: true

# Set to true to skip Prometheus/Grafana/Loki and use simple health polling
healthcheck_only: false

# Grafana
grafana_admin_password: ""   # openssl rand -base64 24
grafana_allow_signup: false

# Prometheus retention
prometheus_retention: 15d
prometheus_retention_size: 5GB
prometheus_scrape_interval: 15s

# Loki log retention
loki_retention_period: 168h  # 7 days

# Alertmanager — push notifications via ntfy
alert_notification_method: ntfy
alert_ntfy_url: "https://ntfy.sh"
alert_ntfy_topic: "llamenos-alerts"
alert_ntfy_token: ""    # Optional auth token

# Healthcheck-only mode ntfy settings
healthcheck_ntfy_url: "https://ntfy.sh"
healthcheck_ntfy_topic: "llamenos-health"
```

## Deploy the Observability Stack

```bash
cd deploy/ansible
ansible-playbook playbooks/observability.yml --ask-vault-pass
```

Deploy a single component only:

```bash
ansible-playbook playbooks/observability.yml --ask-vault-pass --tags prometheus
ansible-playbook playbooks/observability.yml --ask-vault-pass --tags grafana
ansible-playbook playbooks/observability.yml --ask-vault-pass --tags loki
ansible-playbook playbooks/observability.yml --ask-vault-pass --tags alertmanager
ansible-playbook playbooks/observability.yml --ask-vault-pass --tags node-exporter
ansible-playbook playbooks/observability.yml --ask-vault-pass --tags healthcheck
```

## Accessing Services

After deployment, services are available at paths under your domain (proxied by Caddy):

| Service | URL |
|---------|-----|
| Grafana | `https://hotline.yourorg.org/grafana/` |
| Prometheus | `https://hotline.yourorg.org/prometheus/` |
| Alertmanager | `https://hotline.yourorg.org/alertmanager/` |

Log in to Grafana with username `admin` and the password from `grafana_admin_password`.

## Health Endpoints

The application exposes standard Kubernetes-compatible health probes:

```bash
# Liveness probe
curl -s http://localhost:3000/health/live

# Readiness probe
curl -s http://localhost:3000/health/ready

# Public health check (used for external uptime monitors)
curl -s https://hotline.yourorg.org/api/health
# Expected: {"status":"ok"}
```

A Prometheus `ServiceMonitor` is pre-configured. Metrics are scraped from the `/metrics` endpoint on the app container.

## Lightweight Mode (Healthcheck-Only)

For minimal deployments where a full Prometheus/Grafana stack is too heavy:

```yaml
# In vars.yml
observability_enabled: true
healthcheck_only: true
healthcheck_ntfy_url: "https://ntfy.sh"
healthcheck_ntfy_topic: "llamenos-health"
```

This deploys a simple poller that sends ntfy notifications when the health endpoint is non-200.

## External Uptime Monitoring

Regardless of which internal stack is used, configure an external uptime monitor (UptimeRobot, Healthchecks.io, BetterUptime, or similar) to ping:

```
https://hotline.yourorg.org/api/health
```

Alert on any non-200 response. This provides independent monitoring that is not affected by server-side issues.

## Log Access

With Loki + Promtail deployed, all Docker container logs are ingested and queryable in Grafana (Explore > Loki datasource). Useful LogQL queries:

```
{job="docker"} |= "ERROR"
{job="docker", container="llamenos-app"} | json
{job="docker", container="llamenos-postgres"} |= "FATAL"
```

Log retention defaults to 7 days (`loki_retention_period: 168h`). Adjust in `vars.yml`.

## See Also

- `deploy/ansible/playbooks/observability.yml` — full playbook
- `deploy/ansible/vars.example.yml` — all configurable observability options
- `docs/RUNBOOK.md` — alert triage and on-call procedures
- `docs/CAPACITY_PLANNING.md` — resource planning and scaling guidance
