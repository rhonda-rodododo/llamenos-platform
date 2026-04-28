# Epic 236: Node.js Production Deployment Primacy & Infrastructure Hardening
> **Note**: MinIO has been replaced by RustFS as of PR #40. All references to MinIO in this document should be read as RustFS.


## Goal

1. Shift documentation and developer experience to treat Node.js + PostgreSQL as the **primary production path** (CF Workers = demo only)
2. Fix concrete infrastructure issues found in the deployment audit across Docker Compose, Helm, Ansible, and OpenTofu
3. Add missing observability, health checks, and operational tooling

## Context

The architecture audit (2026-03-03) found the Node.js platform is fully implemented (Epic 55) but:

- Docs still frame CF Workers as primary
- No `bun run dev:node` for local development against the production runtime
- Health check is a bare `200 OK` — doesn't verify database/relay/storage connectivity
- Helm chart has structural issues (RustFS as Deployment instead of StatefulSet, no HPA/PDB)
- No Prometheus metrics endpoint for Kubernetes monitoring
- No structured logging
- Docker build has minor security gaps (sourcemaps in production, fragile workspace stripping)
- Ansible backup doesn't cover RustFS blob storage
- OpenTofu allows SSH from 0.0.0.0/0

For a crisis response hotline used by activist organizations, self-hosted is the expected deployment. These improvements are critical for production readiness.

## Implementation

### Phase 1: Documentation Reframing

#### 1.1 CLAUDE.md Tech Stack Reorder

List Node.js first, CF second:

```markdown
- **Backend (Production)**: Node.js 20+ with Hono, PostgreSQL 17, RustFS (S3), strfry (Nostr relay)
- **Backend (Demo/Eval)**: Cloudflare Workers + Durable Objects (zero-infra evaluation)
```

#### 1.2 Development Commands

Add Node.js dev commands to CLAUDE.md and package.json:

```markdown
# Backend (production runtime)
bun run dev:node                         # Local Node.js dev server (PostgreSQL + RustFS via Docker)
bun run build:node                       # Build Node.js server
bun run start:node                       # Run built server

# Backend (demo/evaluation)
bun run dev:worker                       # Wrangler dev server (CF Workers + DOs)
```

#### 1.3 PROTOCOL.md

Add deployment models section:
```markdown
## Deployment Models
- **Self-hosted (recommended)**: Node.js + PostgreSQL + RustFS on EU-jurisdiction VPS
- **Cloud evaluation**: Cloudflare Workers (demo deployments, zero-infrastructure evaluation)
```

#### 1.4 Architecture Diagrams

Update `docs/ARCHITECTURE.md` with clear deployment topology diagrams showing production (Node.js) vs demo (CF) architectures.

#### 1.5 QUICKSTART.md

Add Kubernetes/Helm deployment path alongside existing Docker Compose guide.

### Phase 2: Health Check Enhancement

Current health check is a bare `200 OK` — completely useless for production monitoring.

#### 2.1 Detailed Health Endpoint

Replace the current `/api/health` with a comprehensive check:

```typescript
// apps/worker/routes/health.ts
api.get('/health', async (c) => {
  const checks: Record<string, 'ok' | 'failing'> = {}

  // PostgreSQL connectivity
  try {
    await c.env.IDENTITY_DO.idFromName('health').get().fetch('/health')
    checks.database = 'ok'
  } catch { checks.database = 'failing' }

  // RustFS/R2 connectivity
  try {
    await c.env.R2_BUCKET.head('health-check')
    checks.storage = 'ok'
  } catch { checks.storage = 'ok' } // 404 is fine, just checking connectivity

  // Nostr relay connectivity (strfry)
  try {
    // Simple WebSocket ping or HTTP check
    checks.relay = 'ok'
  } catch { checks.relay = 'failing' }

  const status = Object.values(checks).every(v => v === 'ok') ? 'ok' : 'degraded'
  const code = status === 'ok' ? 200 : 503

  return c.json({ status, checks, version: __BUILD_VERSION__, uptime: process.uptime() }, code)
})

// Lightweight probe for Kubernetes (no dependency checks)
api.get('/health/live', (c) => c.json({ status: 'ok' }))
// Full dependency check for readiness
api.get('/health/ready', /* same as /health */)
```

#### 2.2 Update All Consumers

- Docker Compose health check: `/health/ready`
- Kubernetes liveness probe: `/health/live`
- Kubernetes readiness probe: `/health/ready`
- Kubernetes startup probe: `/health/live`
- Ansible wait-for: `/health/ready`

### Phase 3: Docker Compose Improvements

#### 3.1 Fix Whisper Image Pinning

```yaml
# Current (mutable tag):
whisper:
  image: fedirz/faster-whisper-server:0.4.1

# Fixed (pinned to digest):
whisper:
  image: fedirz/faster-whisper-server:0.4.1@sha256:<DIGEST>
```

#### 3.2 Add Restart Policies to Optional Services

```yaml
whisper:
  restart: unless-stopped
asterisk-bridge:
  restart: unless-stopped
signal-cli:
  restart: unless-stopped
```

#### 3.3 Fix Workspace Stripping in Dockerfile

```dockerfile
# Current (fragile sed regex):
RUN sed -i '/"workspaces"/,/]/d' package.json

# Fixed (robust jq):
RUN jq 'del(.workspaces)' package.json > tmp.json && mv tmp.json package.json
```

Requires adding `jq` to the build stage dependencies.

#### 3.4 Remove Sourcemaps from Production Build

```javascript
// esbuild.node.mjs
sourcemap: process.env.NODE_ENV !== 'production'  // was: true
```

#### 3.5 Add Caddy Rate Limiting

```caddyfile
{$DOMAIN:localhost} {
    # Rate limit: 100 requests/minute per IP
    rate_limit {remote.ip} 100r/m

    # Existing config...
}
```

#### 3.6 Enable Caddy Access Logging

```caddyfile
{$DOMAIN:localhost} {
    log {
        output file /var/log/caddy/access.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
    # ...
}
```

#### 3.7 One-Command First-Run Setup

Create `deploy/docker/first-run.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Llamenos First-Run Setup ==="

# Generate .env from template if missing
if [ ! -f .env ]; then
  cp .env.example .env

  # Auto-generate all secrets
  sed -i "s|^PG_PASSWORD=.*|PG_PASSWORD=$(openssl rand -base64 24)|" .env
  sed -i "s|^HMAC_SECRET=.*|HMAC_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^STORAGE_ACCESS_KEY=.*|STORAGE_ACCESS_KEY=$(openssl rand -base64 16)|" .env
  sed -i "s|^STORAGE_SECRET_KEY=.*|STORAGE_SECRET_KEY=$(openssl rand -base64 24)|" .env
  sed -i "s|^SERVER_NOSTR_SECRET=.*|SERVER_NOSTR_SECRET=$(openssl rand -hex 32)|" .env

  echo "Generated .env with random secrets"
fi

# Start stack
docker compose up -d

# Wait for health
echo "Waiting for services..."
until curl -sf http://localhost:3000/api/health/ready > /dev/null 2>&1; do
  sleep 2
done

echo ""
echo "=== Llamenos is running ==="
echo "Bootstrap an admin account:"
echo "  docker compose exec app node -e \"...\""
echo ""
echo "Then open https://your-domain and log in."
```

### Phase 4: Helm Chart Fixes

#### 4.1 Convert RustFS from Deployment to StatefulSet

**Critical**: RustFS as a Deployment risks data loss on pod eviction.

```yaml
# templates/statefulset-rustfs.yaml (replaces deployment-rustfs.yaml)
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "llamenos.fullname" . }}-rustfs
spec:
  serviceName: {{ include "llamenos.fullname" . }}-rustfs
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: rustfs
  template:
    # ... same pod spec as current deployment
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.rustfs.persistence.size | default "10Gi" }}
```

#### 4.2 Add HorizontalPodAutoscaler

```yaml
# templates/hpa.yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "llamenos.fullname" . }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "llamenos.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas | default 2 }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas | default 10 }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPU | default 70 }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemory | default 80 }}
{{- end }}
```

#### 4.3 Add PodDisruptionBudget

```yaml
# templates/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "llamenos.fullname" . }}
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: app

---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "llamenos.fullname" . }}-strfry
spec:
  maxUnavailable: 0
  selector:
    matchLabels:
      app.kubernetes.io/component: strfry
```

#### 4.4 Add Prometheus ServiceMonitor

```yaml
# templates/servicemonitor.yaml
{{- if .Values.metrics.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "llamenos.fullname" . }}
spec:
  selector:
    matchLabels:
      app.kubernetes.io/component: app
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
{{- end }}
```

#### 4.5 Add Resource Defaults for strfry

```yaml
# values.yaml addition
strfry:
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 512Mi
```

#### 4.6 Split Probes (Liveness vs Readiness)

Update `deployment-app.yaml`:
```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: http
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /api/health/ready
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /api/health/live
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

#### 4.7 Bump Chart Version

```yaml
# Chart.yaml
version: 0.2.0  # was 0.1.0
appVersion: "0.20.0"
```

### Phase 5: Ansible Improvements

#### 5.1 Add RustFS Blob Storage to Backup

Current backup only covers PostgreSQL. Add RustFS backup:

```yaml
# roles/backup/templates/backup.sh.j2 addition
echo "[$(date)] Backing up RustFS data..."
docker compose exec -T rustfs mc mirror /data /tmp/rustfs-backup
tar czf "${backup_dir}/rustfs-${timestamp}.tar.gz" -C /tmp rustfs-backup
age -r {{ backup_age_public_key }} -o "${backup_dir}/rustfs-${timestamp}.tar.gz.age" \
  "${backup_dir}/rustfs-${timestamp}.tar.gz"
rm -f "${backup_dir}/rustfs-${timestamp}.tar.gz"
```

#### 5.2 Add Backup Restore Test

Add `playbooks/test-restore.yml`:

```yaml
- name: Test backup restore
  hosts: llamenos
  tasks:
    - name: Create test database
      shell: |
        docker compose exec -T postgres createdb -U llamenos llamenos_restore_test
    - name: Restore latest backup to test database
      shell: |
        latest=$(ls -t /opt/llamenos/backups/*.sql.gz.age | head -1)
        age -d -i {{ backup_age_private_key_path }} "$latest" | \
          gunzip | \
          docker compose exec -T postgres psql -U llamenos llamenos_restore_test
    - name: Verify restore
      shell: |
        docker compose exec -T postgres psql -U llamenos llamenos_restore_test \
          -c "SELECT count(*) FROM kv_store"
      register: restore_result
    - name: Cleanup test database
      shell: |
        docker compose exec -T postgres dropdb -U llamenos llamenos_restore_test
    - name: Report result
      debug:
        msg: "Restore test {{ 'PASSED' if restore_result.rc == 0 else 'FAILED' }}"
```

#### 5.3 Add Caddy Rate Limiting to Ansible Template

Update `templates/caddy.j2` to include rate limiting directives.

#### 5.4 Restrict SSH in Ansible

```yaml
# roles/firewall/tasks/main.yml
- name: Allow SSH from admin CIDRs only
  community.general.ufw:
    rule: allow
    port: "{{ ssh_port }}"
    proto: tcp
    from_ip: "{{ item }}"
  loop: "{{ ssh_allowed_cidrs | default(['0.0.0.0/0']) }}"
```

### Phase 6: OpenTofu Improvements

#### 6.1 Restrict SSH Source IPs

```hcl
# modules/hetzner/variables.tf
variable "admin_ssh_cidrs" {
  description = "CIDRs allowed to SSH (restrict for production)"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Override in production!
}

# modules/hetzner/main.tf — SSH rule
resource "hcloud_firewall_rule" "ssh" {
  direction  = "in"
  protocol   = "tcp"
  port       = var.ssh_port
  source_ips = var.admin_ssh_cidrs  # was ["0.0.0.0/0"]
}
```

#### 6.2 Add DNS Module (Optional)

Add a Cloudflare DNS module for automatic A record creation:

```hcl
module "dns" {
  source  = "./modules/cloudflare-dns"
  count   = var.cloudflare_api_token != "" ? 1 : 0

  zone_id = var.cloudflare_zone_id
  domain  = var.domain
  ip      = module.hetzner.server_ip
}
```

### Phase 7: Observability

#### 7.1 Prometheus Metrics Endpoint

Add `/metrics` endpoint to the app using `prom-client`:

```typescript
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client'

const register = new Registry()
collectDefaultMetrics({ register })

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
})

const activeConnections = new Gauge({
  name: 'active_websocket_connections',
  help: 'Number of active WebSocket connections',
  registers: [register],
})

api.get('/metrics', async (c) => {
  const metrics = await register.metrics()
  return c.text(metrics, 200, { 'Content-Type': register.contentType })
})
```

Metrics to track:
- HTTP request duration (histogram by method/route/status)
- Active WebSocket connections (gauge)
- DO storage operation duration (histogram)
- Alarm poll cycle duration (histogram)
- Auth token verification rate (counter, success/failure)
- Note encryption operations (counter)

#### 7.2 Structured JSON Logging

Replace `console.log` with structured logger:

```typescript
import { createLogger } from './lib/logger'
const log = createLogger('app')

// Output:
// {"level":"info","ts":"2026-03-03T...","component":"app","msg":"Request","method":"GET","path":"/api/health","status":200,"duration_ms":12}
```

Compatible with: Loki, ELK, CloudWatch, Datadog.

#### 7.3 Docker Compose Logging Config

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
        tag: "llamenos-app"
```

### Phase 8: Local Node.js Dev Server

#### 8.1 `bun run dev:node` Script

Add to `package.json`:

```json
{
  "scripts": {
    "dev:node": "scripts/dev-node.sh",
    "dev:node:services": "docker compose -f deploy/docker/docker-compose.dev.yml up -d",
    "dev:node:stop": "docker compose -f deploy/docker/docker-compose.dev.yml down"
  }
}
```

#### 8.2 Dev-Only Docker Compose

Create `deploy/docker/docker-compose.dev.yml` with just PostgreSQL + RustFS + strfry (no app container):

```yaml
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: llamenos
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: llamenos
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U llamenos"]
      interval: 5s
      timeout: 3s
      retries: 5

  rustfs:
    image: rustfs/rustfs
    ports:
      - "9000:9000"
    environment:
      MINIO_ROOT_USER: rustfsadmin
      MINIO_ROOT_PASSWORD: rustfsadmin
    command: server /data
    volumes:
      - rustfsdata:/data

  strfry:
    image: dockurr/strfry:latest
    ports:
      - "7777:7777"
    volumes:
      - strfrydata:/app/strfry-db

volumes:
  pgdata:
  rustfsdata:
  strfrydata:
```

#### 8.3 Dev Server Script

Create `scripts/dev-node.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Start backing services if not running
if ! docker compose -f deploy/docker/docker-compose.dev.yml ps --status running | grep -q postgres; then
  echo "Starting PostgreSQL, RustFS, strfry..."
  docker compose -f deploy/docker/docker-compose.dev.yml up -d
  echo "Waiting for PostgreSQL..."
  until docker compose -f deploy/docker/docker-compose.dev.yml exec -T postgres pg_isready -U llamenos; do sleep 1; done
fi

# Set dev environment
export PG_HOST=localhost
export PG_PORT=5432
export PG_USER=llamenos
export PG_PASSWORD=dev
export PG_DATABASE=llamenos
export STORAGE_ENDPOINT=http://localhost:9000
export STORAGE_ACCESS_KEY=rustfsadmin
export STORAGE_SECRET_KEY=rustfsadmin
export HMAC_SECRET=$(echo -n "dev-hmac-secret-not-for-production" | sha256sum | cut -d' ' -f1)
export SERVER_NOSTR_SECRET=$(echo -n "dev-nostr-secret-not-for-production" | sha256sum | cut -d' ' -f1)
export ADMIN_PUBKEY=${ADMIN_PUBKEY:-"0000000000000000000000000000000000000000000000000000000000000000"}
export NOSTR_RELAY_URL=ws://localhost:7777

# Build and run with watch
echo "Building Node.js server..."
bun run build:node

echo "Starting server with --watch..."
node --watch dist/server/index.js
```

### Phase 9: Production Checklist

Create `deploy/PRODUCTION_CHECKLIST.md`:

```markdown
# Production Deployment Checklist

## Infrastructure
- [ ] EU-jurisdiction VPS provisioned (Hetzner, OVH, or equivalent)
- [ ] Minimum specs: 2 vCPU, 4 GB RAM, 40 GB SSD
- [ ] Domain name configured with A record
- [ ] SSH restricted to admin IP addresses

## Security
- [ ] All secrets generated with cryptographic randomness
- [ ] SSH key-based auth only (password disabled)
- [ ] Firewall allows only ports 80, 443, SSH
- [ ] Kernel hardening applied (Ansible or manual)
- [ ] Docker daemon hardened (userns-remap, no-new-privileges)
- [ ] fail2ban active for SSH

## Application
- [ ] Admin keypair bootstrapped (`bun run bootstrap-admin`)
- [ ] TLS certificates provisioned (Caddy auto or manual)
- [ ] Health check returning 200 at /api/health/ready
- [ ] Telephony provider configured and tested
- [ ] Nostr relay (strfry) running and connected

## Backup & Recovery
- [ ] age encryption key generated (public key in config, private key offline)
- [ ] Backup cron running daily
- [ ] rclone configured for offsite backup
- [ ] Restore procedure tested at least once
- [ ] RTO target: 1 hour, RPO target: 24 hours

## Monitoring
- [ ] Health check endpoint monitored externally (UptimeRobot, Healthchecks.io)
- [ ] Disk space alerts configured
- [ ] Docker container restart alerts
- [ ] Backup success/failure notifications
```

## Verification

1. CLAUDE.md tech stack section lists Node.js before CF Workers
2. `bun run dev:node` starts a working local dev server against PostgreSQL
3. `/api/health/ready` verifies database, storage, and relay connectivity
4. Helm chart passes `helm lint` and `helm template` validation
5. RustFS runs as StatefulSet in Kubernetes
6. HPA scales app replicas based on CPU/memory
7. PDB prevents all pods from being evicted simultaneously
8. Backup script covers both PostgreSQL and RustFS
9. `deploy/docker/first-run.sh` provisions a working instance from scratch
10. `/metrics` endpoint returns Prometheus-compatible metrics
11. Structured JSON logs visible in `docker compose logs`
12. All documentation frames self-hosted as the recommended production path

## Dependencies

- Epic 55 (Multi-Platform Deployment) — COMPLETE
- Epic 66 (Deployment Hardening Tooling) — COMPLETE
- Epic 235 (Node.js E2E Test Parity) — should run in parallel

## Risk

- **Medium**: Health check dependency verification adds latency to probe responses (mitigate with separate /health/live and /health/ready)
- **Low**: Prometheus metrics add memory overhead (~5-10 MB for prom-client)
- **Low**: Structured logging changes may break existing log parsing scripts
- **Low**: RustFS StatefulSet migration requires manual PVC data migration for existing deployments
