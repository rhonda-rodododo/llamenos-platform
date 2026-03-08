# Epic 286: Online Data Migration Framework

**Status**: PENDING
**Priority**: High
**Depends on**: None
**Blocks**: Epic 287
**Branch**: `desktop`

## Summary

Upgrade the existing migration framework from a bare-bones runner with an empty registry into a production-ready data migration system with progress tracking, rollback support, dry-run mode, admin visibility, CLI tooling, and DO-level schema versioning. The framework already exists at `packages/shared/migrations/` with `runner.ts`, `types.ts`, and an empty `index.ts` registry. All 7 DOs already call `runMigrations()` in their `fetch()` handlers (except BlastDO which is missing it). This epic fills the gaps for real-world use.

## Problem Statement

The migration runner (`packages/shared/migrations/runner.ts`) was implemented in Epic 59 but remains skeletal:

1. **No migrations exist** — the registry is empty, so the framework has never been exercised
2. **No rollback support** — if a migration corrupts data, there is no `down()` path
3. **No progress tracking** — large migrations run silently with only console.log; no way for admins to know what is happening
4. **No admin visibility** — no API endpoint or dashboard widget to see migration status
5. **No dry-run mode** — cannot preview what a migration would change before committing
6. **No CLI tooling** — `bun run migrate:status` and friends were planned in Epic 59 but never implemented
7. **Production startup guard missing** — migrations run automatically on startup in Node.js (`startup-migrations.ts`), which is dangerous in production without explicit opt-in
8. **BlastDO missing migration hook** — 6 of 7 DOs call `runMigrations()`, but `blast-do.ts` does not
9. **No DO-level schema versioning** — DOs rely on `ensureInit()` with defaults but have no explicit version tracking for schema changes within their storage

## Implementation

### Step 1: Enhanced Migration Types

Extend `Migration` interface with `down()` for rollback and metadata for progress tracking.

**File: `packages/shared/migrations/types.ts`**

```typescript
export interface MigrationStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void | boolean>
  list(options?: { prefix?: string }): Promise<Map<string, unknown>>
}

export interface Migration {
  /** Sequential version number — migrations run in order */
  version: number
  /** Human-readable name for logging/status */
  name: string
  /** Description of what this migration does */
  description?: string
  /** The migration function — receives storage and performs data transformations */
  run(storage: MigrationStorage, options?: MigrationRunOptions): Promise<void>
  /** Rollback function — reverses the migration. Optional but recommended. */
  down?(storage: MigrationStorage): Promise<void>
}

export interface MigrationRunOptions {
  /** If true, migration should validate/preview changes without writing */
  dryRun?: boolean
  /** Callback for progress updates during long-running migrations */
  onProgress?: (progress: MigrationProgress) => void
}

export interface MigrationProgress {
  /** Current step within the migration (1-based) */
  step: number
  /** Total number of steps (0 = unknown) */
  totalSteps: number
  /** Description of the current step */
  message: string
}

/** Persisted migration status for admin visibility */
export interface MigrationStatus {
  /** Current schema version for this namespace */
  currentVersion: number
  /** Highest available migration version */
  latestVersion: number
  /** Number of pending migrations */
  pendingCount: number
  /** Timestamp of last successful migration run */
  lastRunAt: string | null
  /** Name of the last applied migration */
  lastMigrationName: string | null
  /** Whether a migration is currently in progress */
  running: boolean
  /** Progress of the currently running migration, if any */
  currentProgress: MigrationProgress | null
  /** History of applied migrations */
  history: MigrationHistoryEntry[]
}

export interface MigrationHistoryEntry {
  version: number
  name: string
  appliedAt: string
  durationMs: number
  status: 'applied' | 'rolled-back'
}

export const MIGRATION_VERSION_KEY = '__migrations:version'
export const MIGRATION_HISTORY_KEY = '__migrations:history'
export const MIGRATION_STATUS_KEY = '__migrations:status'
```

### Step 2: Enhanced Migration Runner

Rewrite `runner.ts` to support progress tracking, dry-run, rollback, and status persistence.

**File: `packages/shared/migrations/runner.ts`**

```typescript
import type { Migration, MigrationStorage, MigrationRunOptions, MigrationStatus, MigrationHistoryEntry, MigrationProgress } from './types'
import { MIGRATION_VERSION_KEY, MIGRATION_HISTORY_KEY, MIGRATION_STATUS_KEY } from './types'

/**
 * Run all pending migrations against a storage instance.
 * Safe to call multiple times — only runs migrations with version > current.
 */
export async function runMigrations(
  storage: MigrationStorage,
  migrations: Migration[],
  namespace?: string,
  options?: MigrationRunOptions,
): Promise<{ applied: number; dryRun: boolean }> {
  if (migrations.length === 0) return { applied: 0, dryRun: false }

  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const pending = sorted.filter(m => m.version > currentVersion)

  if (pending.length === 0) return { applied: 0, dryRun: false }

  const label = namespace ? ` [${namespace}]` : ''
  const dryRun = options?.dryRun ?? false
  const history = (await storage.get<MigrationHistoryEntry[]>(MIGRATION_HISTORY_KEY)) ?? []

  // Update status to "running"
  if (!dryRun) {
    await persistStatus(storage, sorted, currentVersion, true, null)
  }

  let appliedCount = 0

  for (const migration of pending) {
    const prefix = dryRun ? '[DRY-RUN]' : ''
    console.log(`[migrations]${label}${prefix} Running v${migration.version}: ${migration.name}`)

    const startMs = Date.now()

    // Wrap progress callback with namespace label
    const wrappedOptions: MigrationRunOptions = {
      ...options,
      onProgress: options?.onProgress
        ? (p: MigrationProgress) => {
            if (!dryRun) {
              // Fire-and-forget status update — do not await in hot loop
              persistStatus(storage, sorted, migration.version - 1, true, p).catch(() => {})
            }
            options.onProgress!(p)
          }
        : undefined,
    }

    await migration.run(storage, wrappedOptions)

    if (!dryRun) {
      await storage.put(MIGRATION_VERSION_KEY, migration.version)
      history.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
        status: 'applied',
      })
      await storage.put(MIGRATION_HISTORY_KEY, history)
    }

    appliedCount++
  }

  // Update status to "not running"
  if (!dryRun) {
    const finalVersion = pending[pending.length - 1].version
    await persistStatus(storage, sorted, finalVersion, false, null)
    console.log(`[migrations]${label} Complete — now at v${finalVersion}`)
  }

  return { applied: appliedCount, dryRun }
}

/**
 * Roll back the most recent migration (or to a target version).
 */
export async function rollbackMigration(
  storage: MigrationStorage,
  migrations: Migration[],
  namespace?: string,
  targetVersion?: number,
): Promise<{ rolledBack: number }> {
  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0
  if (currentVersion === 0) return { rolledBack: 0 }

  const sorted = [...migrations].sort((a, b) => b.version - a.version) // descending
  const target = targetVersion ?? currentVersion - 1
  const toRollback = sorted.filter(m => m.version > target && m.version <= currentVersion)

  const label = namespace ? ` [${namespace}]` : ''
  const history = (await storage.get<MigrationHistoryEntry[]>(MIGRATION_HISTORY_KEY)) ?? []
  let rolledBackCount = 0

  for (const migration of toRollback) {
    if (!migration.down) {
      throw new Error(
        `Migration v${migration.version} (${migration.name}) has no down() — cannot rollback`
      )
    }

    console.log(`[migrations]${label} Rolling back v${migration.version}: ${migration.name}`)
    const startMs = Date.now()
    await migration.down(storage)
    await storage.put(MIGRATION_VERSION_KEY, migration.version - 1)

    history.push({
      version: migration.version,
      name: migration.name,
      appliedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      status: 'rolled-back',
    })
    await storage.put(MIGRATION_HISTORY_KEY, history)
    rolledBackCount++
  }

  return { rolledBack: rolledBackCount }
}

/**
 * Get migration status for a namespace without running anything.
 */
export async function getMigrationStatus(
  storage: MigrationStorage,
  migrations: Migration[],
): Promise<MigrationStatus> {
  const currentVersion = (await storage.get<number>(MIGRATION_VERSION_KEY)) ?? 0
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const latestVersion = sorted.length > 0 ? sorted[sorted.length - 1].version : 0
  const pending = sorted.filter(m => m.version > currentVersion)
  const history = (await storage.get<MigrationHistoryEntry[]>(MIGRATION_HISTORY_KEY)) ?? []
  const status = (await storage.get<{ running: boolean; currentProgress: MigrationProgress | null }>(MIGRATION_STATUS_KEY))

  const lastApplied = history.filter(h => h.status === 'applied').sort((a, b) => b.version - a.version)[0]

  return {
    currentVersion,
    latestVersion,
    pendingCount: pending.length,
    lastRunAt: lastApplied?.appliedAt ?? null,
    lastMigrationName: lastApplied?.name ?? null,
    running: status?.running ?? false,
    currentProgress: status?.currentProgress ?? null,
    history,
  }
}

async function persistStatus(
  storage: MigrationStorage,
  _migrations: Migration[],
  _currentVersion: number,
  running: boolean,
  currentProgress: MigrationProgress | null,
): Promise<void> {
  await storage.put(MIGRATION_STATUS_KEY, { running, currentProgress })
}
```

### Step 3: First Migration — DO Schema Versioning

Create the first actual migration that adds a `__schema:version` key to each DO namespace, establishing a baseline.

**File: `packages/shared/migrations/index.ts`**

```typescript
import type { Migration } from './types'

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'add-schema-version-baseline',
    description: 'Establish schema version tracking in every DO namespace. Sets __schema:version to 1 to mark the initial known-good state.',
    async run(storage, options) {
      const existing = await storage.get<number>('__schema:version')
      if (existing !== undefined) {
        options?.onProgress?.({ step: 1, totalSteps: 1, message: 'Schema version already set — skipping' })
        return
      }
      if (!options?.dryRun) {
        await storage.put('__schema:version', 1)
      }
      options?.onProgress?.({ step: 1, totalSteps: 1, message: 'Set __schema:version = 1' })
    },
    async down(storage) {
      await storage.delete('__schema:version')
    },
  },
]
```

### Step 4: Add Migration Hook to BlastDO

BlastDO is the only DO missing the `runMigrations()` call in its `fetch()` handler.

**File: `apps/worker/durable-objects/blast-do.ts`**

Add at the top of the file:
```typescript
import { runMigrations } from '@shared/migrations/runner'
import { migrations } from '@shared/migrations'
```

Add a `private migrated = false` field and call in `fetch()`:
```typescript
async fetch(request: Request): Promise<Response> {
  if (!this.migrated) {
    await runMigrations(this.ctx.storage, migrations, 'blast')
    this.migrated = true
  }
  // ... existing handler
}
```

### Step 5: Admin API Endpoint

Add `GET /api/admin/migrations` that queries each DO for its migration status.

**File: `apps/worker/routes/settings.ts`** (add to existing admin settings routes)

```typescript
// GET /api/admin/migrations — admin-only migration status across all DOs
settings.get('/migrations', requirePermission('settings:manage'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const doNames = ['identity', 'settings', 'records', 'shifts', 'calls', 'conversations', 'blast'] as const

  const results: Record<string, MigrationStatus> = {}

  for (const name of doNames) {
    try {
      const doInstance = dos[name]
      const res = await doInstance.fetch(new Request('http://do/migrations/status'))
      if (res.ok) {
        results[name] = await res.json()
      } else {
        results[name] = { currentVersion: -1, latestVersion: -1, pendingCount: -1, lastRunAt: null, lastMigrationName: null, running: false, currentProgress: null, history: [] }
      }
    } catch {
      results[name] = { currentVersion: -1, latestVersion: -1, pendingCount: -1, lastRunAt: null, lastMigrationName: null, running: false, currentProgress: null, history: [] }
    }
  }

  return c.json({ namespaces: results })
})
```

Each DO gets a new `/migrations/status` route in its DORouter:

```typescript
this.router.get('/migrations/status', async () => {
  const status = await getMigrationStatus(this.ctx.storage, migrations)
  return Response.json(status)
})
```

### Step 6: DO Migration Status Routes

Add `/migrations/status` and `/migrations/rollback` routes to every DO's DORouter constructor.

For each DO (`SettingsDO`, `IdentityDO`, `RecordsDO`, `ShiftManagerDO`, `CallRouterDO`, `ConversationDO`, `BlastDO`):

```typescript
// --- Migration Status ---
this.router.get('/migrations/status', async () => {
  const status = await getMigrationStatus(this.ctx.storage, migrations)
  return Response.json(status)
})

this.router.post('/migrations/rollback', async (req) => {
  const { targetVersion } = await req.json() as { targetVersion?: number }
  const result = await rollbackMigration(this.ctx.storage, migrations, '<namespace>', targetVersion)
  return Response.json(result)
})
```

### Step 7: Production Startup Guard

Modify `startup-migrations.ts` to check for an explicit `RUN_MIGRATIONS` environment variable in production.

**File: `src/platform/node/storage/startup-migrations.ts`**

```typescript
export async function runStartupMigrations(): Promise<void> {
  if (migrations.length === 0) {
    console.log('[migrations] No migrations registered — skipping')
    return
  }

  // In production, require explicit opt-in to prevent accidental migration on deploy
  const env = process.env.NODE_ENV || 'development'
  const explicitRun = process.env.RUN_MIGRATIONS === 'true'

  if (env === 'production' && !explicitRun) {
    console.log('[migrations] Production mode — set RUN_MIGRATIONS=true to run. Use CLI: bun run migrate:up')
    return
  }

  const sql = getPool()
  const rows = await sql`SELECT DISTINCT namespace FROM kv_store`
  const namespaces = rows.map((r: any) => r.namespace as string)

  if (namespaces.length === 0) {
    console.log('[migrations] No existing namespaces — skipping')
    return
  }

  console.log(`[migrations] Checking ${namespaces.length} namespace(s)...`)

  for (const namespace of namespaces) {
    await sql.begin(async (tx: any) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`migrate:${namespace}`}))`
      const storage = new PostgresStorage(namespace)
      await runMigrations(storage, migrations, namespace)
    })
  }
}
```

### Step 8: CLI Tooling

**File: `scripts/migrate.ts`**

```typescript
#!/usr/bin/env bun
/**
 * Migration CLI — manage data migrations for Node.js/PostgreSQL deployment.
 *
 * Usage:
 *   bun run migrate:status                   # Show migration status for all namespaces
 *   bun run migrate:up                       # Run all pending migrations
 *   bun run migrate:up --dry-run             # Preview migrations without applying
 *   bun run migrate:rollback                 # Roll back the most recent migration
 *   bun run migrate:rollback --to <version>  # Roll back to a specific version
 */
import { parseArgs } from 'util'
import { getPool } from '../src/platform/node/storage/postgres-pool'
import { PostgresStorage } from '../src/platform/node/storage/postgres-storage'
import { runMigrations, rollbackMigration, getMigrationStatus } from '../packages/shared/migrations/runner'
import { migrations } from '../packages/shared/migrations'

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    to: { type: 'string' },
  },
})

const command = positionals[0] || 'status'

async function getNamespaces(): Promise<string[]> {
  const sql = getPool()
  const rows = await sql`SELECT DISTINCT namespace FROM kv_store`
  return rows.map((r: any) => r.namespace as string)
}

async function main() {
  const namespaces = await getNamespaces()

  switch (command) {
    case 'status': {
      if (namespaces.length === 0) {
        console.log('No namespaces found.')
        return
      }
      for (const ns of namespaces) {
        const storage = new PostgresStorage(ns)
        const status = await getMigrationStatus(storage, migrations)
        console.log(`\n[${ns}] v${status.currentVersion}/${status.latestVersion} — ${status.pendingCount} pending`)
        if (status.lastRunAt) {
          console.log(`  Last run: ${status.lastRunAt} (${status.lastMigrationName})`)
        }
        if (status.history.length > 0) {
          console.log('  History:')
          for (const h of status.history.slice(-5)) {
            console.log(`    v${h.version} ${h.name} — ${h.status} at ${h.appliedAt} (${h.durationMs}ms)`)
          }
        }
      }
      break
    }

    case 'up': {
      const dryRun = values['dry-run'] ?? false
      if (namespaces.length === 0) {
        console.log('No namespaces found.')
        return
      }
      const sql = getPool()
      for (const ns of namespaces) {
        await sql.begin(async (tx: any) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${`migrate:${ns}`}))`
          const storage = new PostgresStorage(ns)
          const result = await runMigrations(storage, migrations, ns, {
            dryRun,
            onProgress: (p) => console.log(`  [${ns}] Step ${p.step}/${p.totalSteps}: ${p.message}`),
          })
          if (result.applied > 0) {
            console.log(`[${ns}] Applied ${result.applied} migration(s)${dryRun ? ' (dry-run)' : ''}`)
          }
        })
      }
      break
    }

    case 'rollback': {
      const targetVersion = values.to ? parseInt(values.to, 10) : undefined
      const sql = getPool()
      for (const ns of namespaces) {
        await sql.begin(async (tx: any) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${`migrate:${ns}`}))`
          const storage = new PostgresStorage(ns)
          const result = await rollbackMigration(storage, migrations, ns, targetVersion)
          if (result.rolledBack > 0) {
            console.log(`[${ns}] Rolled back ${result.rolledBack} migration(s)`)
          }
        })
      }
      break
    }

    default:
      console.error(`Unknown command: ${command}. Use: status, up, rollback`)
      process.exit(1)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Migration error:', err)
  process.exit(1)
})
```

**Add to `package.json` scripts:**
```json
{
  "migrate:status": "bun run scripts/migrate.ts status",
  "migrate:up": "bun run scripts/migrate.ts up",
  "migrate:rollback": "bun run scripts/migrate.ts rollback"
}
```

### Step 9: Admin Dashboard Widget

Add a migration status card to the admin settings page that shows current version, pending count, and last run time for each DO namespace.

**File: `src/client/components/admin-settings/migration-status-section.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSection } from '@/components/settings-section'
import { Badge } from '@/components/ui/badge'
import { request, hp } from '@/lib/api'
import type { MigrationStatus } from '@shared/migrations/types'

interface Props {
  expanded: boolean
  onToggle: (open: boolean) => void
}

export function MigrationStatusSection({ expanded, onToggle }: Props) {
  const { t } = useTranslation()
  const [statuses, setStatuses] = useState<Record<string, MigrationStatus> | null>(null)

  useEffect(() => {
    if (!expanded) return
    request<{ namespaces: Record<string, MigrationStatus> }>(hp('/admin/settings/migrations'))
      .then(r => setStatuses(r.namespaces))
      .catch(() => setStatuses(null))
  }, [expanded])

  const totalPending = statuses
    ? Object.values(statuses).reduce((sum, s) => sum + Math.max(0, s.pendingCount), 0)
    : 0

  return (
    <SettingsSection
      title={t('settings.migrations', { defaultValue: 'Data Migrations' })}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={totalPending > 0 ? `${totalPending} pending` : 'Up to date'}
    >
      {/* Table of namespaces with version, pending count, last run */}
    </SettingsSection>
  )
}
```

### Step 10: Update DO `fetch()` Signatures

All DOs currently pass `migrations` (the global list) but the runner should now accept the enhanced `MigrationRunOptions`. The existing call sites (`runMigrations(this.ctx.storage, migrations, 'namespace')`) remain backward-compatible since `options` is optional.

No changes needed to existing DO `fetch()` methods beyond BlastDO (Step 4).

## Files to Modify

| File | Change |
|------|--------|
| `packages/shared/migrations/types.ts` | Add `down()`, `MigrationRunOptions`, `MigrationProgress`, `MigrationStatus`, `MigrationHistoryEntry` |
| `packages/shared/migrations/runner.ts` | Rewrite with progress tracking, dry-run, rollback, status persistence |
| `packages/shared/migrations/index.ts` | Add migration v1: `add-schema-version-baseline` |
| `apps/worker/durable-objects/blast-do.ts` | Add `runMigrations()` hook + `/migrations/status` route |
| `apps/worker/durable-objects/settings-do.ts` | Add `/migrations/status` + `/migrations/rollback` routes |
| `apps/worker/durable-objects/identity-do.ts` | Add `/migrations/status` + `/migrations/rollback` routes |
| `apps/worker/durable-objects/records-do.ts` | Add `/migrations/status` + `/migrations/rollback` routes |
| `apps/worker/durable-objects/shift-manager.ts` | Add `/migrations/status` + `/migrations/rollback` routes |
| `apps/worker/durable-objects/call-router.ts` | Add `/migrations/status` + `/migrations/rollback` routes |
| `apps/worker/durable-objects/conversation-do.ts` | Add `/migrations/status` + `/migrations/rollback` routes |
| `apps/worker/routes/settings.ts` | Add `GET /admin/settings/migrations` endpoint |
| `src/platform/node/storage/startup-migrations.ts` | Add production guard (`RUN_MIGRATIONS` env var) |
| `scripts/migrate.ts` | New CLI tool for status/up/rollback |
| `package.json` | Add `migrate:status`, `migrate:up`, `migrate:rollback` scripts |
| `src/client/components/admin-settings/migration-status-section.tsx` | New admin dashboard widget |
| `src/client/routes/admin/settings.tsx` | Wire up `MigrationStatusSection` |
| `packages/i18n/locales/en.json` | Add `settings.migrations` and related strings |

## Testing

### Unit Tests (Rust crypto — N/A for this epic)

### Playwright E2E Tests

**File: `tests/migrations.spec.ts`**

1. **Migration status visibility**: Log in as admin, navigate to Settings, expand Data Migrations section, verify it shows "Up to date" with current version numbers for each namespace
2. **Migration status API**: Direct API call to `GET /api/admin/settings/migrations` returns status for all 7 DOs with `currentVersion >= 1` (after first migration runs)
3. **Permission guard**: Non-admin cannot access migration status endpoint (403)

### Integration Tests

**File: `packages/shared/migrations/__tests__/runner.test.ts`**

1. **Forward migration**: Create 3 test migrations, run against in-memory storage, verify version advances to 3
2. **Idempotency**: Running the same migrations twice applies them only once
3. **Dry-run mode**: Run with `dryRun: true`, verify storage is unchanged
4. **Progress tracking**: Verify `onProgress` callback fires with correct step/totalSteps
5. **Rollback**: Apply 3 migrations, rollback 1, verify version is now 2
6. **Rollback without down()**: Attempting rollback on a migration without `down()` throws
7. **Rollback to target version**: Rollback from v3 to v1, verify 2 rollbacks executed
8. **History persistence**: After migrations, `MIGRATION_HISTORY_KEY` contains correct entries
9. **Status query**: `getMigrationStatus()` returns correct counts and history

### CLI Tests

Manual verification (not automated):
- `bun run migrate:status` shows version per namespace
- `bun run migrate:up` applies pending migrations
- `bun run migrate:up --dry-run` previews without applying
- `bun run migrate:rollback` rolls back the most recent migration

## Acceptance Criteria

- [ ] `Migration` interface includes optional `down()` for rollback and `description` field
- [ ] `runMigrations()` accepts `MigrationRunOptions` with `dryRun` and `onProgress` fields
- [ ] `rollbackMigration()` function exists and correctly reverses migrations that have `down()`
- [ ] `rollbackMigration()` throws a clear error when encountering a migration without `down()`
- [ ] `getMigrationStatus()` returns `MigrationStatus` with version, pending count, history, and running state
- [ ] Migration history (version, name, appliedAt, durationMs, status) is persisted in each namespace
- [ ] All 7 DOs call `runMigrations()` in their `fetch()` handler (BlastDO added)
- [ ] All 7 DOs expose `/migrations/status` route via DORouter
- [ ] First migration (`add-schema-version-baseline`) exists and sets `__schema:version = 1` in every namespace
- [ ] `GET /api/admin/settings/migrations` returns aggregated status across all DOs (admin-only)
- [ ] Admin settings page includes a "Data Migrations" section showing migration status
- [ ] `startup-migrations.ts` requires `RUN_MIGRATIONS=true` in production mode; runs freely in development
- [ ] CLI commands work: `bun run migrate:status`, `bun run migrate:up`, `bun run migrate:up --dry-run`, `bun run migrate:rollback`
- [ ] Existing migration call sites in DOs remain backward-compatible (no breaking changes)
- [ ] Playwright tests verify admin can see migration status and non-admin is denied
- [ ] Unit tests cover forward migration, idempotency, dry-run, rollback, history, and status query

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Migration corrupts DO storage | High | Low | Dry-run mode for preview; rollback support; migrations are idempotent |
| Concurrent migration on CF DOs | Medium | Very Low | CF's single-writer guarantee prevents concurrent access to same DO instance |
| Concurrent migration on PostgreSQL | Medium | Low | Advisory locks already implemented in `startup-migrations.ts` |
| Long-running migration blocks DO requests | Medium | Low | First migration is trivial (single key write); future migrations should be designed for speed |
| Production startup accidentally runs migrations | High | Medium | Production guard requires explicit `RUN_MIGRATIONS=true` env var |
| Rollback of irreversible migration | Medium | Medium | `down()` is optional; rollback throws if missing, preventing silent data loss |
| BlastDO migration hook breaks existing behavior | Low | Very Low | Same pattern as other 6 DOs; empty migration list is a no-op |
