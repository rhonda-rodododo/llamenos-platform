# Production Readiness & Long-Term Lifecycle Design

**Date**: 2026-03-08
**Status**: Approved

## Overview

25 epics across 5 tracks to bring Llamenos from pre-production to a resilient, self-healing deployment that 2-3 part-time operators can sustain for hundreds/thousands of users.

## Key Decisions

1. **Ansible-first deployment** — matrix-docker-ansible-deploy style. One inventory, N machines, every service toggleable. No Cloudflare recommended.
2. **Multi-hub on single deployment** — 1-50 hubs per deployment, with unpredictable traffic spikes.
3. **Multi-machine support** — services split across hosts via inventory groups, automatic service discovery.
4. **Self-healing operations** — operators should check in weekly, not daily. Alerting for anomalies only.
5. **Client lifecycle management** — version negotiation, auto-update, crash reporting across all 3 platforms.

## Tracks

### Track 1: Ansible Fleet Deployment (Epics 276-280)
Matrix-docker-ansible-deploy style. Multi-machine inventory, toggleable services, observability stack, auto-healing, rolling updates.

### Track 2: Backend Resilience & Scale (Epics 281-285)
DO storage pagination, retry/circuit breakers, Zod validation, structured error handling, TTL cleanup.

### Track 3: Data Migrations & Schema Evolution (Epics 286-287)
Online migration framework with rollback, multi-report-type system with per-type custom fields.

### Track 4: Client Resilience & Lifecycle (Epics 288-293)
API versioning, desktop auto-update, mobile distribution, mobile transcription, offline sync, crash reporting.

### Track 5: Operational Sustainability (Epics 294-300)
Alerting, health dashboard, load testing, security automation, DR drills, operator handbook, mobile admin parity.

## Dependency Graph

```
Track 1: 276 → 277 → 278 → 279 → 280
Track 2: 283 → 284 → 281 → 282 → 285
Track 3: 286 → 287
Track 4: 288 → 289,290 → 291 → 292 → 293
Track 5: 294 → 295 → 296 → 297 → 298 → 299 → 300

Cross-track: 278 → 294 (observability enables alerting)
Cross-track: 286 → 287 (migration framework enables schema changes)
```
