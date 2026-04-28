# Epic 357: Migrate from Node.js to Bun Runtime

## Context

The Llamenos self-hosted backend currently uses Node.js 22 as its production runtime. The build pipeline uses esbuild (invoked via `node esbuild.node.mjs`), the server runs via `node dist/server/index.js`, the production Docker image is `node:22-slim`, and the PostgreSQL driver is `postgres` (postgres.js).

Bun is already the project's package manager and dev tooling runtime. This epic completes the migration by replacing Node.js as the **server runtime**, **bundler**, **test runner**, and **Docker base image** with Bun across all self-hosted deployments and development workflows.

### Why Bun?

1. **Performance**: Bun's JavaScriptCore engine starts ~4x faster than V8. HTTP serving via `Bun.serve()` benchmarks 2-3x higher throughput than Node.js `http` module. Built-in SQL driver is faster than postgres.js.
2. **Memory safety**: Bun is primarily implemented in Zig, which provides compile-time memory safety (no buffer overflows, use-after-free, etc.) without a garbage collector for the runtime internals. V8 is C++ with extensive fuzzing but no compile-time memory safety guarantees. Both are well-tested, but Zig's safety model reduces the class of possible runtime bugs.
3. **Simplification**: Eliminates the Node.js/esbuild build step entirely. Bun runs TypeScript natively — no transpilation needed. Removes `@hono/node-server`, `@hono/node-ws`, `esbuild` as dependencies. The dev server can use `bun --watch` instead of the esbuild watch + node watch double-process pattern.
4. **Built-in PostgreSQL**: Bun ships a native `Bun.sql` / `SQL` driver with connection pooling, prepared statements, and `--sql-preconnect` for zero-latency first queries. Eliminates the `postgres` npm dependency.
5. **Unified tooling**: One runtime for everything — package management, dev server, production server, bundling, testing. No more "Bun for tooling, Node for runtime" split.

## Scope

### In Scope
- Replace Node.js runtime with Bun for self-hosted API server
- Replace esbuild bundler with `bun build` (or run TS directly)
- Replace `postgres` (postgres.js) with Bun's built-in `SQL` driver
- Replace `@hono/node-server` with Hono's Bun adapter
- Replace `ws` package with Bun's native WebSocket
- Update Docker images from `node:22-slim` to `oven/bun:1-slim`
- Update all scripts (`dev-node.sh`, package.json scripts)
- Update documentation references
- Update CI/CD workflows
- Migrate Vitest configs to Bun test runner (where practical)
- Update Helm chart and deployment configs

### Out of Scope
- Cloudflare Workers (already a separate runtime — no change)
- Desktop/Tauri (Rust runtime — no change)
- iOS/Android (native — no change)
- Frontend Vite dev server (already works with Bun)

## Migration Plan

### Phase 1: Server Entry Point — `@hono/node-server` → Hono Bun Adapter

**Current** (`src/platform/node/server.ts`):
```typescript
import { serve } from '@hono/node-server'
// ...
const server = serve({
  fetch: app.fetch,
  port,
}, async (info) => { /* ... */ })
```

**After** (`src/platform/bun/server.ts` — rename `node/` → `bun/`):
```typescript
// Bun runs TypeScript natively — no build step needed
import { Hono } from 'hono'
import { createBunEnv } from './env'

console.log('[llamenos] Starting Bun server...')
const env = await createBunEnv()
console.log('[llamenos] Environment initialized')

const { default: workerApp } = await import('../../../apps/worker/app')

const app = new Hono()
app.use('*', async (c, next) => {
  ;(c as any).env = env
  await next()
})
app.route('/', workerApp as any)
app.all('*', (c) => c.json({ error: 'Not Found' }, 404))

const port = parseInt(process.env.PORT || '3000')

// Bun auto-starts an HTTP server from export default { fetch, port }
export default {
  fetch: app.fetch,
  port,
}

console.log(`[llamenos] Server running at http://localhost:${port}`)

// Write OpenAPI snapshot in development (preserved from Node.js version)
if (process.env.ENVIRONMENT === 'development') {
  try {
    const { resolve } = await import('path')
    const snapshotPath = resolve(process.cwd(), 'packages/protocol/openapi-snapshot.json')
    const response = await app.fetch(new Request(`http://localhost:${port}/api/openapi.json`))
    const spec = await response.json()
    await Bun.write(snapshotPath, JSON.stringify(spec, null, 2) + '\n')
    console.log('[llamenos] OpenAPI snapshot written')
  } catch (err) {
    console.warn(`[llamenos] Failed to write OpenAPI snapshot: ${err}`)
  }
}

// Graceful shutdown
// NOTE: With `export default { fetch }`, there's no `server.close()` method.
// Bun handles connection draining on SIGTERM automatically. We just need
// to clean up our own resources (DB pool, pollers, WebSockets).
const shutdown = async () => {
  console.log('[llamenos] Shutting down...')
  const { stopAlarmPoller } = await import('./storage/alarm-poller')
  const { closePool } = await import('./storage/postgres-pool')
  stopAlarmPoller()
  await closePool()

  try {
    const { getNostrPublisher } = await import('../../../apps/worker/lib/do-access')
    getNostrPublisher(env as any).close()
  } catch {}

  console.log('[llamenos] Server stopped')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

Bun recognizes `export default { fetch, port }` as a server definition. This eliminates the `@hono/node-server` dependency entirely. Hono also provides `import { upgradeWebSocket, websocket } from 'hono/bun'` for WebSocket support if needed later.

**Key difference from Node.js version**: No `server.close(callback)` — Bun's built-in server handles connection draining on SIGTERM. Our shutdown only cleans up application resources (DB pool, alarm poller, Nostr WebSocket). Uses `Bun.write()` instead of `fs/promises.writeFile()` for the OpenAPI snapshot.

**Files to modify:**
- Rename `src/platform/node/` → `src/platform/bun/`
- `src/platform/bun/server.ts` — replace `@hono/node-server` serve with `export default`
- `src/platform/index.ts` — update re-exports if referencing `node/`

### Phase 2: PostgreSQL Driver — postgres.js → `Bun.sql`

**Current** (`src/platform/node/storage/postgres-pool.ts`):
```typescript
import postgres from 'postgres'

pool = postgres(databaseUrl, {
  max: poolSize,
  idle_timeout: 20,
  connect_timeout: 10,
})

// Tagged template queries
await pool`SELECT * FROM kv_store WHERE namespace = ${ns}`
```

**After** (`src/platform/bun/storage/postgres-pool.ts`):
```typescript
import { SQL } from 'bun'

let pool: SQL | null = null

export async function initPostgresPool(): Promise<SQL> {
  if (pool) return pool

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const poolSize = parseInt(process.env.PG_POOL_SIZE || '10', 10)

  pool = new SQL({
    url: databaseUrl,
    max: poolSize,
    idleTimeout: 20,
    connectionTimeout: 10,
  })

  // Auto-create tables (same SQL as before)
  // Bun.sql uses the same tagged template syntax as postgres.js
  try {
    await pool`
      CREATE TABLE IF NOT EXISTS kv_store (
        namespace TEXT NOT NULL,
        key       TEXT NOT NULL,
        value     JSONB NOT NULL,
        PRIMARY KEY (namespace, key)
      )
    `
    // ... (same DDL statements)
  } catch (err: unknown) {
    // Same error handling
  }

  console.log(`[postgres] Pool initialized (max ${poolSize} connections)`)
  return pool
}

export function getPool(): SQL {
  if (!pool) throw new Error('PostgreSQL pool not initialized')
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
    console.log('[postgres] Pool closed')
  }
}
```

**Key differences**:
- `import { SQL } from 'bun'` instead of `import postgres from 'postgres'`
- Constructor: `new SQL({ url, max, idleTimeout, connectionTimeout })` — note camelCase property names
- Close: `pool.close()` instead of `pool.end()`
- Tagged template query syntax is **identical** — all `pool\`SELECT ...\`` queries work unchanged
- Use `bun --sql-preconnect` in production CMD for zero-latency first query

**JSONB handling — MIGRATION HAZARD:**
Bun.sql has **NO `sql.json()` equivalent**. The codebase uses `sql.json(value)` in 4 places:
- `postgres-storage.ts:83` — `sql.json(v as JSONValue)` in bulk `put()` (entries overload)
- `postgres-storage.ts:112` — `sql.json(value as JSONValue)` in single `put()`
- `outbox.ts:26` — `sql.json(eventJson as JSONValue)` in `enqueue()`

There's also a known Bun bug ([#23129](https://github.com/oven-sh/bun/issues/23129)) where JSONB array serialization can fail.

**Mitigation options:**
1. **Use `JSON.stringify()` with `::jsonb` cast**: `VALUES (${JSON.stringify(value)}::jsonb)` — explicit but verbose
2. **Test if passing plain objects works**: Bun.sql may auto-serialize objects to JSONB (MySQL docs confirm this behavior; PostgreSQL behavior needs empirical verification)
3. **Write a thin `jsonb()` helper**: `function jsonb(v: unknown) { return JSON.stringify(v) }` — drop-in replacement

Also: `outbox.ts:8` imports `type { JSONValue } from 'postgres'` — this type must be replaced with a local definition (simple: `type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }`).

**Files to modify:**
- `src/platform/bun/storage/postgres-pool.ts` — swap driver
- `src/platform/bun/storage/postgres-storage.ts` — replace `sql.json()` calls, update type annotations (`ReturnType<typeof postgres>` → `SQL`)
- `src/platform/bun/storage/outbox.ts` — replace `sql.json()`, replace `JSONValue` type import
- `src/platform/bun/storage/alarm-poller.ts` — uses `getPool()`, queries unchanged
- `src/platform/bun/storage/nostr-outbox.ts` — uses `getPool()`, queries unchanged

### Phase 3: Remove esbuild — Bun Runs TypeScript Natively

**Current build pipeline:**
1. `node esbuild.node.mjs` bundles `src/platform/node/server.ts` → `dist/server/index.js`
2. esbuild resolves `cloudflare:workers` → `src/platform/index.ts` via alias
3. esbuild resolves `@worker/*`, `@shared/*`, `@protocol/*` via plugin
4. `node dist/server/index.js` runs the bundled output

**After:**
Bun runs `.ts` files directly. No transpilation step. Path aliases are resolved from `tsconfig.json` natively. The `cloudflare:workers` alias needs to be handled.

**Option A: Direct execution (preferred)**

```bash
# Development
bun --watch src/platform/bun/server.ts

# Production
bun --sql-preconnect src/platform/bun/server.ts
```

For the `cloudflare:workers` import alias, add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "cloudflare:workers": ["./src/platform/index.ts"]
    }
  }
}
```

Bun respects `tsconfig.json` `paths` for runtime resolution. This eliminates the entire esbuild config.

**CAVEAT: `cloudflare:` protocol prefix risk.** Bun may treat `cloudflare:` as a built-in protocol prefix (like `node:` and `bun:`) and short-circuit module resolution before consulting tsconfig paths. This must be empirically tested. If it fails, alternatives:
1. **Replace all `import ... from 'cloudflare:workers'` with direct imports** — the DO base class import could point to `src/platform/index.ts` directly
2. **Use Bun's `bunfig.toml` module resolution overrides** if available
3. **Use `bun build` with `--external cloudflare:workers` + alias** instead of direct execution

**Option B: `bun build` for production (if startup time matters)**

```bash
bun build src/platform/bun/server.ts \
  --target=bun \
  --outdir=dist/server \
  --sourcemap \
  --define 'process.env.PLATFORM="bun"'
```

Or with bytecode compilation for fastest cold start:
```bash
bun build --bytecode --compile \
  src/platform/bun/server.ts \
  --outfile=dist/server/llamenos
```

This produces a single self-contained binary. No runtime deps needed.

**Recommendation**: Start with Option A (direct execution) for simplicity. If startup time becomes a concern in production, add Option B as an optimization. The bytecode-compiled binary is particularly attractive for Docker — the production image only needs the binary, not Bun itself.

**Files to delete:**
- `esbuild.node.mjs` — no longer needed

**Files to modify:**
- `tsconfig.json` — add `cloudflare:workers` path alias
- `package.json` — update `build:node`, `start:node`, `dev:node` scripts

### Phase 4: Docker Image

**Current** (`deploy/docker/Dockerfile`):
```dockerfile
# Stage 1: Build with Bun + esbuild
FROM oven/bun:1 AS backend
RUN node esbuild.node.mjs

# Stage 2: Install runtime deps
FROM oven/bun:1 AS deps
RUN bun install --production --ignore-scripts

# Stage 3: Run with Node.js
FROM node:22-slim
RUN apt-get install -y curl
CMD ["node", "dist/server/index.js"]
```

**After** (direct execution approach):
```dockerfile
# Stage 1: Install deps
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# Stage 2: Production
FROM oven/bun:1-slim
WORKDIR /app

# Create non-root user
RUN groupadd -r llamenos && useradd -r -g llamenos -d /app -s /sbin/nologin llamenos

# Copy deps and source
COPY --from=deps /app/node_modules/ node_modules/
COPY package.json ./
COPY src/ src/
COPY apps/worker/ apps/worker/
COPY packages/shared/ packages/shared/
COPY packages/i18n/ packages/i18n/
COPY packages/protocol/ packages/protocol/
COPY tsconfig.json ./
COPY deploy/docker/download-page/ public/

RUN chown -R llamenos:llamenos /app
USER llamenos

ENV PLATFORM=bun PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)})" || exit 1

CMD ["bun", "--sql-preconnect", "src/platform/bun/server.ts"]
```

**After** (compiled binary approach — smallest image):
```dockerfile
# Stage 1: Build
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun build --bytecode --compile \
  --target=bun \
  src/platform/bun/server.ts \
  --outfile=dist/llamenos-server

# Stage 2: Minimal production image
FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=builder /app/dist/llamenos-server /app/server
COPY deploy/docker/download-page/ public/
EXPOSE 3000
CMD ["/app/server"]
```

**Key improvements:**
- Eliminates the esbuild build stage entirely
- `bun:1-slim` is smaller than `node:22-slim` (no V8 overhead)
- `--sql-preconnect` warms PostgreSQL connections at startup
- Healthcheck uses `bun -e` instead of requiring `curl` package
- Compiled binary option enables distroless images (extreme hardening)
- `--start-period` reduced from 20s to 10s (Bun starts faster)

**Trade-off: direct execution copies source into image.** The current Dockerfile copies only the bundled `dist/server/index.js` (~few hundred KB). The direct execution approach copies full source (`src/`, `apps/worker/`, `packages/`) — a larger image layer. The compiled binary approach avoids this entirely (single ~50-90MB self-contained binary, no source or node_modules). **Recommendation: use the compiled binary approach for production** — smallest image, fastest startup, no source code in the container.

**Note on `bun:1-slim` user creation:** The slim image is Debian-based and includes `groupadd`/`useradd`. For the distroless approach, use `USER 65534` (nobody) instead since distroless has no user management tools.

### Phase 5: Development Scripts

**`scripts/dev-node.sh` → `scripts/dev-bun.sh`:**
```bash
#!/usr/bin/env bash
# Local Bun development server
set -euo pipefail

COMPOSE_FILE="deploy/docker/docker-compose.dev.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

cmd_start() {
  # Start Docker Compose backing services (same as before)
  if ! docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q postgres; then
    log "Starting backing services (PostgreSQL, RustFS, strfry)..."
    docker compose -f "$COMPOSE_FILE" up -d --wait
  fi

  # Environment variables (same as before)
  export PLATFORM=bun
  export PORT=3000
  export DATABASE_URL="postgresql://llamenos:dev@localhost:5432/llamenos"
  # ... (all other env vars unchanged)

  log "Starting Bun server on http://localhost:${PORT}..."
  # Single process — Bun runs TS directly and watches for changes
  exec bun --watch --sql-preconnect src/platform/bun/server.ts
}
```

**Key simplification**: The current `dev-node.sh` runs THREE processes (esbuild build, esbuild watch, node watch). The Bun version runs ONE (`bun --watch`). Bun watches `.ts` source directly — no intermediate bundle.

**`package.json` script changes:**
```json
{
  "build:server": "bun build src/platform/bun/server.ts --target=bun --outdir=dist/server",
  "start:server": "PLATFORM=bun bun --sql-preconnect src/platform/bun/server.ts",
  "dev:server": "bash scripts/dev-bun.sh",
  "dev:node": null,
  "build:node": null,
  "start:node": null
}
```

Rename from `*:node` to `*:server` since the self-hosted backend is no longer Node.js-specific.

### Phase 6: WebSocket — Remove `ws` Package

The `ws` package is listed as an external dependency in the esbuild config and installed as a runtime dep, but the codebase **does NOT explicitly import it**. The Nostr publisher, DO WebSocket shim, and outbox poller all use the global `WebSocket` class (available in Node.js 22+ and natively in Bun).

**Migration**: Simply remove `ws` from `package.json` dependencies. No code changes needed — the global `WebSocket` is already used everywhere. Bun's native WebSocket is fully browser-API-compatible and also supports Bun-specific extensions (e.g., custom headers on upgrade requests).

**Files to modify:**
- `package.json` — remove `ws` from dependencies
- No source code changes required

### Phase 7: Test Runner Migration

**Current**: Vitest for unit and integration tests.

**Option A: Keep Vitest** (lower risk)
Vitest works on Bun. Keep the existing configs, just ensure they run via `bun vitest` (already the case via `bunx vitest`). No changes needed.

**Option B: Migrate to `bun test`** (full alignment)
Bun's built-in test runner uses Jest-compatible syntax (`describe`, `it`, `expect`). Migration is mostly mechanical:

```typescript
// Before (Vitest)
import { describe, it, expect } from 'vitest'

// After (Bun)
import { describe, it, expect } from 'bun:test'
```

**Recommendation**: Keep Vitest for now. The test files work as-is. Migrate to `bun test` in a follow-up epic if desired — it's a large surface area with low urgency.

### Phase 8: Remove Node.js Dependencies

**Packages to remove:**
- `@hono/node-server` — replaced by Bun's native `export default { fetch }`
- `@hono/node-ws` — replaced by Hono's Bun WebSocket adapter (`hono/bun`)
- `esbuild` — Bun runs TS natively / `bun build` replaces it
- `ws` — Bun has native WebSocket
- `postgres` — replaced by `Bun.sql` / `SQL` from `'bun'`

**Files to delete:**
- `esbuild.node.mjs`
- `scripts/dev-node.sh` (replaced by `scripts/dev-bun.sh`)

**Files to rename/move:**
- `src/platform/node/` → `src/platform/bun/`
- All internal references updated

### Phase 9: Deployment Configs — Full Sweep

Every file in `deploy/` and CI/CD that references Node.js must be updated.

#### Docker Compose — Production (`deploy/docker/docker-compose.yml`)

**Current:**
```yaml
# app - Llamenos application (Node.js)
environment:
  PLATFORM: node
```

**After:**
```yaml
# app - Llamenos application (Bun)
environment:
  PLATFORM: bun
```

#### Docker Compose — Dev (`deploy/docker/docker-compose.dev.yml`)

**Current comments:**
```yaml
# Llamenos Dev Services (Node.js development)
# Start the app with `bun run dev:node` or `node dist/server/index.js`
```

**After:**
```yaml
# Llamenos Dev Services
# Start the app with `bun run dev:server`
```

#### Reproducible Build Image (`Dockerfile.build`)

**Current** (line 41, 47-48):
```dockerfile
COPY ... esbuild.node.mjs ./
# Build Node.js server (esbuild) — reads SOURCE_DATE_EPOCH and GITHUB_SHA
RUN node esbuild.node.mjs
```

**After:**
```dockerfile
# No esbuild.node.mjs needed — Bun runs TS directly
# For reproducible server build:
RUN bun build src/platform/bun/server.ts --target=bun --outdir=dist/server --sourcemap
```

Or remove the server build from `Dockerfile.build` entirely if only the frontend reproducible build matters (server runs from source in production).

#### Helm Chart (`deploy/helm/llamenos/templates/deployment-app.yaml`)

**Current** (line 45):
```yaml
- name: PLATFORM
  value: "node"
```

**After:**
```yaml
- name: PLATFORM
  value: "bun"
```

Also update the container command if hardcoded:
```yaml
command: ["bun", "--sql-preconnect", "src/platform/bun/server.ts"]
```

#### Ansible Templates

**`deploy/ansible/templates/env/app.j2`** (line 6):
```
PLATFORM=node  →  PLATFORM=bun
```

**`deploy/ansible/templates/docker-compose.j2`** (line 26):
```
PLATFORM=node  →  PLATFORM=bun
```

#### PLATFORM Environment Variable

The `PLATFORM` env var is checked in two places:
- `apps/worker/routes/health.ts:20` — `process.env?.PLATFORM === 'node'` (health endpoint reports runtime)
- `apps/worker/lib/logger.ts:25` — `process.env?.PLATFORM === 'node'` (structured logging format)

Both need updating to check for `'bun'` instead of `'node'`. Since both CF Workers and Node.js are being replaced with Bun (for self-hosted), the check becomes:
```typescript
const isSelfHosted = typeof process !== 'undefined' && process.env?.PLATFORM === 'bun'
```

#### Complete File List — Deploy Config Changes

| File | Change |
|------|--------|
| `deploy/docker/Dockerfile` | Full rewrite (see Phase 4) |
| `deploy/docker/docker-compose.yml` | `PLATFORM=node` → `PLATFORM=bun`, update comment |
| `deploy/docker/docker-compose.dev.yml` | Update comments |
| `deploy/docker/docker-compose.test.yml` | Check for Node.js refs |
| `Dockerfile.build` | Remove `esbuild.node.mjs` copy/run, replace with `bun build` |
| `deploy/helm/llamenos/templates/deployment-app.yaml` | `PLATFORM: "node"` → `PLATFORM: "bun"` |
| `deploy/helm/llamenos/values.yaml` | Review resource limits (lower for Bun) |
| `deploy/ansible/templates/env/app.j2` | `PLATFORM=node` → `PLATFORM=bun` |
| `deploy/ansible/templates/docker-compose.j2` | `PLATFORM=node` → `PLATFORM=bun` |
| `apps/worker/routes/health.ts` | `=== 'node'` → `=== 'bun'` |
| `apps/worker/lib/logger.ts` | `=== 'node'` → `=== 'bun'` |

### Phase 10: Documentation

**Documentation updates:**
- `CLAUDE.md` — update all Node.js references (commands, architecture, gotchas, tech stack)
- `docs/protocol/PROTOCOL.md` — update deployment section
- README / getting started docs
- Epic docs that reference `dev:node` or `start:node` scripts

**CI/CD updates:**
- GitHub Actions workflows — replace `node:22` with `oven/bun:1` where applicable
- Docker build workflow — simplified (fewer stages)
- Health check commands in Helm readiness/liveness probes

## Dependencies Removed

| Package | Replaced By |
|---------|-------------|
| `@hono/node-server` | Bun native `export default { fetch }` |
| `@hono/node-ws` | `hono/bun` WebSocket adapter |
| `esbuild` | `bun build` / direct TS execution |
| `ws` | Bun native `WebSocket` global |
| `postgres` | `import { SQL } from 'bun'` |

## Risks & Mitigations

### Risk: CRITICAL — `sql.json()` has no Bun.sql equivalent
**Impact**: 4 call sites in `postgres-storage.ts` and `outbox.ts` use `sql.json(value)` for JSONB writes. Bun.sql has NO equivalent method. There's also a known bug ([#23129](https://github.com/oven-sh/bun/issues/23129)) with JSONB array serialization.
**Mitigation**: Test empirically whether passing plain JS objects as parameters auto-serializes to JSONB (likely, based on Bun's MySQL behavior). If not, use `JSON.stringify(value)` with explicit `::jsonb` cast. Write a `jsonb()` helper to centralize the approach. The BDD test suite will validate correctness — all storage operations are exercised by existing tests.

### Risk: HIGH — `cloudflare:workers` import resolution
**Impact**: Bun may treat `cloudflare:` as a protocol prefix and bypass tsconfig paths.
**Mitigation**: Test empirically before committing to the approach. Fallback: replace all `import ... from 'cloudflare:workers'` in DO files with direct imports from `src/platform/index.ts`. This is a mechanical find-and-replace.

### Risk: MEDIUM — Graceful shutdown without `server.close()`
**Impact**: `export default { fetch }` provides no `server` object to call `.close()` on. Current code relies on `server.close(callback)` for connection draining.
**Mitigation**: Bun's built-in server handles connection draining on SIGTERM automatically. Our shutdown handler only needs to clean up application resources (DB pool, alarm poller, Nostr WebSocket). Alternatively, use `Bun.serve()` explicitly (returns a `Server` object with `.stop()` method) instead of `export default`.

### Risk: LOW — npm package compatibility
**Mitigation**: All remaining deps (Hono, nostr-tools, @noble/*, @simplewebauthn/*, @aws-sdk/client-s3) are pure JS/TS with no native modules. Verified: no `require()` calls in worker code, no `.node` native addons, no Node.js-specific APIs beyond what Bun supports. `@aws-sdk/client-s3` (RustFS client) is HTTP-based and works on Bun.

### Risk: LOW — `process.on('SIGINT/SIGTERM')` for graceful shutdown
**Mitigation**: Confirmed supported in Bun documentation. Works identically to Node.js.

### Risk: LOW — Docker healthcheck without curl
**Mitigation**: `bun -e "fetch(...).then(...)"` works — Bun supports top-level await and global `fetch`. ~25ms startup overhead per health check (vs ~5ms for curl), acceptable for 15s intervals. For compiled binary images, add a `--health` CLI flag instead.

### Risk: LOW — `type JSONValue` import from `postgres`
**Impact**: `outbox.ts` imports `type { JSONValue } from 'postgres'`. Package will be removed.
**Mitigation**: Define a local `JSONValue` type (trivial recursive type). Or use `unknown` since the values are already validated.

## Acceptance Criteria

- [ ] Self-hosted API server runs on Bun runtime (not Node.js)
- [ ] PostgreSQL queries use `Bun.sql` (not postgres.js)
- [ ] No esbuild in the build pipeline — Bun handles TS natively
- [ ] Docker production image uses `oven/bun:1-slim` (not `node:22-slim`)
- [ ] `ws` package removed — Bun native WebSocket used
- [ ] `@hono/node-server` and `@hono/node-ws` removed
- [ ] `bun run dev:server` starts the local dev server (single process, with --watch)
- [ ] `bun run start:server` runs production server
- [ ] All BDD tests pass against Bun-powered backend
- [ ] Healthcheck works without curl
- [ ] Graceful shutdown (SIGTERM) works correctly
- [ ] Docker image builds and runs successfully
- [ ] Helm chart updated for Bun runtime
- [ ] Ansible templates updated (`PLATFORM=bun`)
- [ ] Docker Compose files updated (prod, dev, test)
- [ ] `Dockerfile.build` updated (no esbuild)
- [ ] `PLATFORM` checks in health.ts and logger.ts updated
- [ ] CLAUDE.md and deployment docs updated
- [ ] CI/CD workflows updated
- [ ] `esbuild.node.mjs` deleted
- [ ] `scripts/dev-node.sh` replaced with `scripts/dev-bun.sh`

## Implementation Order

1. **Phase 1-2**: Server entry point + PostgreSQL driver (core migration)
2. **Phase 3**: Remove esbuild (simplification)
3. **Phase 4**: Docker image (deployment)
4. **Phase 5**: Dev scripts (DX)
5. **Phase 6**: WebSocket cleanup
6. **Phase 7**: Test runner (optional, defer if low priority)
7. **Phase 8**: Remove old deps
8. **Phase 9**: Deploy configs (Docker Compose, Helm, Ansible, `Dockerfile.build`, PLATFORM checks)
9. **Phase 10**: Docs + CI/CD

Phases 1-3 are the critical path. Phases 4-6 follow naturally. Phase 9 is mechanical but comprehensive — every deploy config file must be touched.

## Estimated Impact

- **5 npm packages removed** (`@hono/node-server`, `@hono/node-ws`, `esbuild`, `ws`, `postgres`)
- **1 build step eliminated** (esbuild transpilation)
- **Dev server: 3 processes → 1 process** (esbuild build + esbuild watch + node watch → bun --watch)
- **Docker image: ~180MB → ~100MB** (bun:1-slim is smaller than node:22-slim + curl)
- **Cold start: ~500ms → ~150ms** (no V8 warmup, no bundle parsing; further reduced with --sql-preconnect)
- **Memory: ~80MB → ~40MB baseline** (JavaScriptCore uses less memory than V8 for server workloads)
