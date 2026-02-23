# Epic 59: Unified Storage Migrations

## Overview

As the app moves toward production, we need a data migration framework that works across both deployment targets — Cloudflare Durable Objects and PostgreSQL (Node.js self-hosted). Migrations should be written once against the `StorageApi` interface and execute identically on both platforms.

Since the app is pre-production, this epic is about establishing the framework before any real data exists. The goal is to have the infrastructure in place so that post-launch schema changes, data transformations, and key renames are safe and automatic.

## Goals

1. Write migrations once — same code runs on CF DOs and PostgreSQL
2. Migrations run automatically at startup (or on first DO access for CF)
3. Track migration version per namespace (per DO instance)
4. Migrations are idempotent and ordered
5. Zero downtime for read-heavy operations during migration
6. Clear developer ergonomics — adding a migration should be trivial

## Architecture

### Migration Registry

Migrations are defined as ordered functions that receive a `StorageApi` instance:

```typescript
// src/shared/migrations/index.ts
export interface Migration {
  version: number
  name: string
  run(storage: StorageApi): Promise<void>
}

export const migrations: Migration[] = [
  // Example:
  // { version: 1, name: 'rename-settings-keys', run: async (storage) => { ... } },
]
```

### Version Tracking

Each DO namespace tracks its current migration version via a reserved key:

```
Key: "__migrations:version"
Value: number (0 = no migrations applied)
```

This key is stored in the same `StorageApi` as all other data, so it works identically on CF DOs (KV) and PostgreSQL (`kv_store` table).

### Execution Strategy

**Cloudflare Workers (DOs):**
- Check migration version on first request to each DO (in the `DORouter` dispatch or `fetch()` handler)
- Run pending migrations before processing the request
- CF's single-writer guarantee means no concurrent migration risk

**Node.js (PostgreSQL):**
- Run migrations at server startup, before accepting HTTP traffic
- Iterate all known namespaces (from `SELECT DISTINCT namespace FROM kv_store`)
- Advisory locks (`pg_advisory_xact_lock`) prevent concurrent migration across replicas
- New namespaces created after startup get migrations applied on first access

### Migration Runner

```typescript
// src/shared/migrations/runner.ts
export async function runMigrations(storage: StorageApi, migrations: Migration[]): Promise<void> {
  const currentVersion = (await storage.get<number>('__migrations:version')) ?? 0
  const pending = migrations.filter(m => m.version > currentVersion)

  for (const migration of pending) {
    await migration.run(storage)
    await storage.put('__migrations:version', migration.version)
  }
}
```

## Implementation Steps

### Step 1: Migration Infrastructure

1. **`src/shared/migrations/types.ts`** — `Migration` interface
2. **`src/shared/migrations/runner.ts`** — `runMigrations()` function
3. **`src/shared/migrations/index.ts`** — migration registry (empty array initially)

### Step 2: CF DO Integration

4. **Update `DORouter`** or each DO's `fetch()` — call `runMigrations(this.ctx.storage, migrations)` on first access (with a `migrated` boolean flag to avoid re-checking)

### Step 3: Node.js Integration

5. **Update `src/platform/node/env.ts`** — after pool init, run migrations for all existing namespaces
6. **Update `src/platform/node/durable-object.ts`** — run migrations for new namespaces on `createDOContext()`

### Step 4: Developer Tooling

7. **`bun run migrate:status`** — CLI command to show current migration version for each namespace
8. **`bun run migrate:run`** — CLI command to manually trigger migrations (useful for debugging)

### Step 5: Documentation

9. **Add migration guide to `CLAUDE.md`** — how to add a new migration
10. **Add migration docs to the marketing site** — self-hosting section

## Scope Boundaries

**In scope:**
- Migration framework and runner
- Version tracking per namespace
- Startup execution (Node.js) and first-access execution (CF)
- CLI tooling for status/manual runs

**Out of scope:**
- Rollback support (pre-production, no need yet — can add later)
- UI for migration status (CLI only)
- Cross-namespace migrations (each DO migrates independently)
- PostgreSQL schema migrations (the `kv_store`/`alarms` tables are created at startup and unlikely to change)

## Acceptance Criteria

- [ ] Migration runner exists in `src/shared/migrations/` and is importable from both platforms
- [ ] Migrations run automatically on CF DO first access
- [ ] Migrations run automatically on Node.js startup
- [ ] Adding a migration is as simple as appending to the registry array
- [ ] Version tracking uses `__migrations:version` key in each namespace
- [ ] Concurrent migration attempts on PostgreSQL are serialized via advisory locks
- [ ] `bun run migrate:status` shows version per namespace
