---
name: platform-abstraction-development
description: Use when adding new Durable Objects, modifying the Node.js/PostgreSQL platform shim, working with storage migrations, configuring the alarm poller, or debugging CF-vs-Node.js divergence. Also use when the user mentions "platform abstraction", "PostgreSQL shim", "advisory lock", "alarm poller", "env.ts", "createDONamespace", "StorageApi", or needs to understand how the CF Workers and Node.js deployments share the same DO code.
---

# Platform Abstraction Development

## Architecture Overview

The same Durable Object code runs on both Cloudflare Workers and Node.js/PostgreSQL via a **build-time aliasing** trick:

| Platform | How it works |
|----------|-------------|
| **Cloudflare Workers** | DOs use native `cloudflare:workers` APIs directly |
| **Node.js (self-hosted)** | esbuild maps `cloudflare:workers` to `src/platform/index.ts`, which re-exports PostgreSQL-backed shims |

```
CF Workers build:  cloudflare:workers  ->  (native CF runtime)
Node.js build:     cloudflare:workers  ->  src/platform/index.ts  ->  node/ shims
```

The shim implements the same structural interfaces (`DONamespace`, `DOStub`, `StorageApi`) so DO code never imports platform-specific modules.

### Key Files

| File | Purpose |
|------|---------|
| `src/platform/types.ts` | Shared interfaces: `StorageApi`, `DOContext`, `BlobStorage`, `TranscriptionService` |
| `src/platform/index.ts` | Re-export hub (aliased from `cloudflare:workers` in Node.js builds) |
| `src/platform/cloudflare.ts` | Passthrough to native `cloudflare:workers` |
| `src/platform/node/env.ts` | Creates full `Env` object; dynamically imports all DOs |
| `src/platform/node/durable-object.ts` | Base class shim + `WebSocketManager` + `createDONamespace()` + `storageInstances` map |
| `src/platform/node/storage/postgres-storage.ts` | `StorageApi` impl with per-operation advisory locks |
| `src/platform/node/storage/alarm-poller.ts` | 30s background loop firing due alarms |
| `src/platform/node/storage/startup-migrations.ts` | Runs migrations per-namespace at boot |
| `src/platform/node/storage/postgres-pool.ts` | Connection pool (postgres.js) |
| `src/platform/node/blob-storage.ts` | MinIO S3 client implementing `BlobStorage` |
| `src/platform/node/transcription.ts` | Self-hosted Whisper HTTP client |
| `apps/worker/types.ts` | `Env` type with all DO namespace bindings |
| `apps/worker/lib/do-access.ts` | `getDOs()` / `getScopedDOs()` / `getHubDOs()` helpers |

## Adding a New Durable Object -- Complete Checklist

Missing ANY step causes a runtime failure on one or both platforms. Follow every step.

### Step 1: Create the DO class

Create `apps/worker/durable-objects/example-do.ts`:

```typescript
import { DurableObject } from 'cloudflare:workers'
import { DORouter } from '../lib/do-router'
import type { Env } from '../types'

export class ExampleDO extends DurableObject<Env> {
  private router = new DORouter()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router.get('/items', (req) => this.listItems(req))
    this.router.post('/items', (req) => this.createItem(req))
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.handle(request)
  }

  // Optional: alarm handler (CF calls natively; alarm poller calls on Node.js)
  async alarm(): Promise<void> { /* ... */ }
}
```

### Step 2: Export from worker entry

In `apps/worker/index.ts`:

```typescript
export { ExampleDO } from './durable-objects/example-do'
```

### Step 3: Add wrangler.jsonc binding + migration tag

In `apps/worker/wrangler.jsonc`, add to `durable_objects.bindings`:

```jsonc
{ "name": "EXAMPLE_DO", "class_name": "ExampleDO" }
```

Append a new migration entry (never modify existing tags):

```jsonc
{ "tag": "v<next>", "new_classes": ["ExampleDO"] }
```

### Step 4: Add to Env type

In `apps/worker/types.ts`:

```typescript
export interface Env {
  // ... existing bindings
  EXAMPLE_DO: DONamespace
}
```

### Step 5: Add to do-access.ts

In `apps/worker/lib/do-access.ts`:

```typescript
const EXAMPLE_ID = 'global-example'

export interface DurableObjects {
  // ... existing
  example: DOStub
}

export function getDOs(env: Env): DurableObjects {
  return {
    // ... existing
    example: env.EXAMPLE_DO.get(env.EXAMPLE_DO.idFromName(EXAMPLE_ID)),
  }
}
```

If the DO is hub-scoped, also add it to `getHubDOs()` and `HubDurableObjects`.

### Step 6: Add to Node.js env.ts (CRITICAL -- most commonly forgotten)

In `src/platform/node/env.ts`, add the dynamic import and `createDONamespace()` call:

```typescript
const { ExampleDO } = await import('../../../apps/worker/durable-objects/example-do')
// ... later, after env object is created:
env.EXAMPLE_DO = createDONamespace(ExampleDO as any, 'example', env)
```

The namespace string (`'example'`) becomes the PostgreSQL `kv_store.namespace` value. The `storageInstances` map is auto-populated by `createDONamespace()`, enabling the alarm poller to find it.

### Verification

After all 6 steps:

```bash
bun run dev:worker          # CF Workers via wrangler dev
bun run build:node          # Node.js esbuild -- confirms aliasing works
```

## StorageApi Interface

All DO storage goes through this interface, satisfied by CF `DurableObjectStorage` natively and `PostgresStorage` on Node.js:

| Method | Signature | Notes |
|--------|-----------|-------|
| `get` | `get<T>(key: string): Promise<T \| undefined>` | Single key read |
| `put` | `put(key: string, value: unknown): Promise<void>` | Upsert with advisory lock |
| `delete` | `delete(key: string): Promise<void>` | Single key delete |
| `deleteAll` | `deleteAll(): Promise<void>` | Clears namespace (advisory-locked) |
| `list` | `list(options?: { prefix?: string }): Promise<Map<string, unknown>>` | Prefix scan via SQL LIKE |
| `setAlarm` | `setAlarm(scheduledTime: number \| Date): Promise<void>` | Schedule alarm |
| `getAlarm` | `getAlarm(): Promise<number \| null>` | Check pending alarm |
| `deleteAlarm` | `deleteAlarm(): Promise<void>` | Cancel alarm |

PostgreSQL schema: `kv_store` table (`namespace TEXT, key TEXT, value JSONB`, PK on `(namespace, key)`) and `alarms` table (`namespace TEXT PRIMARY KEY, scheduled_at BIGINT`).

## Advisory Locks

PostgreSQL advisory locks emulate CF's single-writer DO guarantee. Every mutating `PostgresStorage` operation wraps in a transaction with:

```sql
SELECT pg_advisory_xact_lock(hashtext('namespace_string'))
```

- Lock is **transaction-scoped** -- released automatically on commit/rollback.
- `hashtext()` converts namespace string to int4 for the lock ID.
- `put()` and `deleteAll()` already acquire the lock internally.
- Multi-step read-modify-write in DO code is safe on CF (single-threaded) but needs explicit locking on Node.js. The shim serializes at the request level via the same advisory lock.
- Migrations use a separate lock key: `hashtext('migrate:' + namespace)`.

## Alarm Poller

On CF Workers, `alarm()` is called natively. On Node.js, a background poller in `src/platform/node/storage/alarm-poller.ts` simulates this.

**Configuration:**
- Poll interval: 30 seconds (`POLL_INTERVAL_MS = 30_000`)
- Initial delay: 5 seconds after startup
- Started automatically by `createNodeEnv()` after migrations complete

**How it works:**

1. Polls `alarms` table for rows where `scheduled_at <= Date.now()`
2. Claims and deletes rows atomically:
   ```sql
   DELETE FROM alarms
   WHERE namespace IN (
     SELECT namespace FROM alarms WHERE scheduled_at <= $now
     FOR UPDATE SKIP LOCKED
   ) RETURNING namespace
   ```
3. `FOR UPDATE SKIP LOCKED` prevents duplicate firing across multiple Node.js replicas
4. Looks up the `PostgresStorage` instance by namespace from `storageInstances` map
5. Calls `storage.fireAlarm()` which invokes the DO's registered `alarmCallback`
6. Alarm callbacks fire asynchronously -- failures are logged, never propagated to the poller

**Wiring:** Each `PostgresStorage` has `setAlarmCallback(cb)`. The DO shim base class registers `() => this.alarm()` during construction.

## Docker Compose Services

Core services (always run):

| Service | Image | Purpose |
|---------|-------|---------|
| `app` | `Dockerfile.build` | Node.js server (esbuild output) |
| `postgres` | `postgres:16` | KV store + alarms tables |
| `caddy` | `caddy:2` | TLS termination, reverse proxy |
| `minio` | `minio/minio` | S3-compatible blob storage (R2 shim) |

Optional services (via Docker Compose profiles):

| Service | Profile | Purpose |
|---------|---------|---------|
| `whisper` | `transcription` | faster-whisper HTTP API |
| `asterisk` | `telephony` | Asterisk PBX + ARI bridge |
| `signal` | `messaging` | signal-cli REST bridge |

## Common Mistakes

### 1. Forgetting env.ts registration
**Symptom:** Works on CF Workers, crashes on Node.js with "Cannot read properties of undefined (reading 'idFromName')".
**Fix:** Always add the dynamic import + `createDONamespace()` call in `src/platform/node/env.ts`. This is the single most common miss because CF deployments never exercise this code path.

### 2. Missing wrangler.jsonc migration tag
**Symptom:** `wrangler dev` or `wrangler deploy` fails with "class ExampleDO is not declared in a migration tag".
**Fix:** Append a new `{ "tag": "v<next>", "new_classes": ["ExampleDO"] }` to the `migrations` array. Never modify existing tags.

### 3. Skipping advisory locks in multi-step operations
**Symptom:** Data races under concurrent requests on Node.js (CF single-writer prevents this natively).
**Fix:** Individual `put()` / `deleteAll()` calls are auto-locked. But custom multi-key read-modify-write sequences in DO code rely on the request-level serialization the shim provides. If bypassing `StorageApi` with raw SQL, wrap in `sql.begin()` with `pg_advisory_xact_lock`.

### 4. Nostr publisher singleton lifecycle
**Symptom:** Stale WebSocket connection after relay restart; events silently dropped.
**Fix:** The `cachedPublisher` in `do-access.ts` is module-scoped. On CF Workers, each isolate gets its own. On Node.js, it persists for the process lifetime. The publisher must handle reconnection internally.

### 5. DORouter silent 404s
**Symptom:** DO method returns `{ status: 404 }` with no error log.
**Fix:** `DORouter` returns 404 for unregistered routes without logging. Verify the route is registered in the constructor and that the HTTP method matches (`.get()` vs `.post()`).

### 6. Migrations running async without failure propagation
**Symptom:** Server starts accepting traffic with stale data, or migration errors go unnoticed.
**Fix:** `runStartupMigrations()` is `await`ed in `createNodeEnv()` before the alarm poller starts and before the server binds. If it throws, server startup fails. Never move it to a fire-and-forget call. Migrations use their own advisory lock key (`hashtext('migrate:' + namespace)`) to serialize across replicas.
