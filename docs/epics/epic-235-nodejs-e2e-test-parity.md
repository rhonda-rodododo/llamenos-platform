# Epic 235: Node.js Platform E2E Test Parity

## Goal

Ensure the Node.js + PostgreSQL production runtime has the same E2E test coverage as the Cloudflare Workers demo deployment. Currently, Playwright tests only run against the CF wrangler dev server. The production Node.js stack (Docker Compose) has no automated E2E validation beyond unit tests.

## Context

The architecture audit (2026-03-03) revealed:

- **295 Worker unit tests** validate business logic (Vitest)
- **224 Playwright BDD tests** validate desktop UI flows — but only against `wrangler dev`
- **Docker Compose stack** exists and is functional but has **zero E2E test coverage**
- **Node.js platform shim** (`src/platform/node/`) has no integration tests for:
  - PostgreSQL advisory lock contention under concurrent access
  - Alarm polling (`FOR UPDATE SKIP LOCKED`) with multiple replicas
  - RustFS blob storage lifecycle (upload → retrieve → delete)
  - WebSocket shim (CallRouterDO WebSocket tag management)
  - Migration framework execution on startup

This is a critical gap: the production deployment path has less test coverage than the demo path.

## Implementation

### Phase 1: Node.js Integration Tests

Create `tests/integration/node/` with tests targeting the actual Node.js server:

#### 1.1 PostgreSQL Storage Tests
```typescript
// Test advisory lock contention — two concurrent writes to same namespace
// Test JSONB storage roundtrip (objects, arrays, nested structures)
// Test key enumeration (list operations)
// Test namespace isolation (data doesn't leak between DOs)
```

#### 1.2 Alarm Polling Tests
```typescript
// Test alarm fires within expected window (30s poll interval)
// Test FOR UPDATE SKIP LOCKED with 2 replicas (only one fires)
// Test alarm cancellation
// Test alarm rescheduling
```

#### 1.3 WebSocket Shim Tests
```typescript
// Test WebSocketPair creation and message passing
// Test tag-based WebSocket tracking
// Test connection cleanup on close
```

#### 1.4 RustFS Blob Storage Tests
```typescript
// Test put/get/delete lifecycle
// Test large file upload (>5MB multipart)
// Test content-type preservation
```

#### 1.5 Migration Framework Tests
```typescript
// Test migrations run on first access
// Test migrations are idempotent (run twice = no error)
// Test version tracking per namespace
```

### Phase 2: Playwright Against Docker Compose

#### 2.1 Test Infrastructure

Add a `playwright.docker.config.ts` that:
- Starts Docker Compose stack (`bun run test:docker:up`)
- Waits for health check (`/api/health`)
- Runs existing Playwright BDD tests against `http://localhost:3000`
- Tears down after (`bun run test:docker:down`)

#### 2.2 CI Workflow

Add `e2e-node` job to `ci.yml`:
```yaml
e2e-node:
  runs-on: ubuntu-latest
  timeout-minutes: 30
  services:
    postgres:
      image: postgres:17-alpine
    rustfs:
      image: rustfs/rustfs
  steps:
    - uses: actions/checkout@v4
    - name: Build Node.js server
      run: bun run build:node
    - name: Start server
      run: node dist/server/index.js &
    - name: Run Playwright tests
      run: bun run test --config playwright.docker.config.ts
```

#### 2.3 Test Parity Validation

Create `scripts/validate-e2e-parity.ts`:
- Compares test results from CF run vs Docker run
- Flags any tests that pass on CF but fail on Node.js
- Reports platform-specific failures

### Phase 3: Load Testing (Optional)

Using `k6` or `autocannon`:
- Advisory lock contention under 50 concurrent writers
- Connection pool exhaustion recovery
- Alarm polling reliability under load
- Health check latency percentiles (p50, p95, p99)

## Environment Requirements

- Docker Compose with PostgreSQL 17, RustFS
- Node.js 20+ runtime
- `.env` with `PG_PASSWORD`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `HMAC_SECRET`

## Verification

1. All 295 unit tests pass against Node.js runtime
2. All Playwright BDD tests pass against Docker Compose stack
3. Integration tests cover all Node.js-specific shim code
4. CI runs both CF and Node.js E2E tests on every PR
5. Zero platform-specific failures (CF tests = Node.js tests)

## Dependencies

- Epic 55 (Multi-Platform Deployment) — COMPLETE
- Epic 233 (Worker Backend Test Suite) — COMPLETE

## Risk

- **Medium**: Docker Compose startup time may make CI slow (mitigate with health check polling)
- **Low**: PostgreSQL advisory lock semantics may differ from CF DO single-writer guarantee under edge cases
- **Low**: RustFS S3 API may have subtle differences from Cloudflare R2
