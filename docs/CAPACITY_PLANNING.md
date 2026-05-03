# Capacity Planning Guide

> Last updated: 2026-03-08
> Status: Template — populate with real metrics after running load tests.

## Workload Profiles

### Small (Community Hotline)

| Metric | Value |
|--------|-------|
| Concurrent calls | 1-5 |
| Messages/hour | < 100 |
| Volunteers on shift | 2-5 |
| Notes created/day | < 50 |

**Hardware recommendation:**
- 1 vCPU, 1 GB RAM
- PostgreSQL: shared instance or managed (e.g., Neon free tier)
- Disk: 10 GB SSD

### Medium (Regional Organization)

| Metric | Value |
|--------|-------|
| Concurrent calls | 5-25 |
| Messages/hour | 100-500 |
| Volunteers on shift | 5-20 |
| Notes created/day | 50-500 |

**Hardware recommendation:**
- 2 vCPU, 4 GB RAM
- PostgreSQL: dedicated instance, 2 vCPU / 4 GB RAM
- Disk: 50 GB SSD

### Large (National/Multi-Region)

| Metric | Value |
|--------|-------|
| Concurrent calls | 25-100 |
| Messages/hour | 500-2000 |
| Volunteers on shift | 20-100 |
| Notes created/day | 500-5000 |

**Hardware recommendation:**
- 4 vCPU, 8 GB RAM (horizontal scale: 2-4 instances behind load balancer)
- PostgreSQL: dedicated instance, 4 vCPU / 16 GB RAM with read replicas
- Disk: 200 GB SSD with automated backups
- Redis: dedicated for session caching (optional)

## Bottleneck Analysis

### PostgreSQL

| Concern | Indicator | Mitigation |
|---------|-----------|------------|
| Connection exhaustion | `max_connections` near limit | Connection pooling (PgBouncer) |
| Slow queries | p95 query time > 100ms | Add indexes, EXPLAIN ANALYZE |
| Write contention | Lock wait time increasing | Batch inserts, advisory locks |
| Storage growth | DB size approaching disk limit | Retention policies, archival |

**Key queries to monitor:**
- Note encryption/decryption (JSONB operations)
- Audit log inserts (append-only, high write volume)
- Shift schedule lookups (frequent reads during routing)
- Volunteer availability checks (per incoming call)

### Memory

| Concern | Indicator | Mitigation |
|---------|-----------|------------|
| Bun process heap growth | RSS > 80% of container limit | Profile with `bun --inspect`, check for listener/timer leaks |
| WebSocket connections | Memory per connection ~50-100 KB | Set max connections limit |
| Crypto operations | ECIES envelope creation is CPU+memory bound | Pool crypto workers |

### Disk I/O

| Concern | Indicator | Mitigation |
|---------|-----------|------------|
| WAL write latency | pg_stat_wal shows high write time | Faster storage class, WAL compression |
| Log volume | Application logs filling disk | Structured logging with rotation, ship to external |
| Backup impact | pg_dump causing I/O spikes | Use pg_basebackup with streaming |

## Scaling Recommendations

### Vertical Scaling (Single Instance)

1. **Start here.** A single 2 vCPU / 4 GB instance handles most deployments.
2. Monitor p95 latencies from load tests — if consistently above thresholds, scale up.
3. PostgreSQL benefits most from RAM (larger shared_buffers = fewer disk reads).

### Horizontal Scaling

1. **Application tier:** Stateless Bun HTTP server — add instances behind a load balancer.
   - WebSocket connections require sticky sessions or a shared pub/sub layer (Redis, NATS).
   - Nostr relay handles real-time event distribution, reducing direct WS fanout needs.
2. **Database tier:** Read replicas for volunteer list, shift schedule, audit log reads.
   - Write operations (notes, audit entries) stay on primary.
3. **Telephony:** Twilio handles scaling on their side. Monitor concurrent call limits in your Twilio account.

## Load Test Results

> Run `bun run load:all` against your target environment and record results below.

### Concurrent Calls

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| p95 call setup | _pending_ | < 2000ms | -- |
| p95 call answer | _pending_ | < 1000ms | -- |
| Error rate | _pending_ | < 5% | -- |
| Max VUs sustained | _pending_ | 50 | -- |

### Messaging Throughput

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| p95 message latency | _pending_ | < 500ms | -- |
| Error rate | _pending_ | < 2% | -- |
| Sustained rate | _pending_ | 17/min | -- |

### Mixed Operations

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| p95 health check | _pending_ | < 500ms | -- |
| p95 notes list | _pending_ | < 1500ms | -- |
| p95 volunteers list | _pending_ | < 1500ms | -- |
| p95 audit log | _pending_ | < 2000ms | -- |
| p95 shifts list | _pending_ | < 1500ms | -- |
| p95 settings read | _pending_ | < 1000ms | -- |
| Error rate | _pending_ | < 5% | -- |

### Burst Traffic

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| p95 normal phase | _pending_ | < 1000ms | -- |
| p95 burst phase | _pending_ | N/A | -- |
| p95 recovery phase | _pending_ | < 2000ms | -- |
| Error rate (overall) | _pending_ | < 10% | -- |
