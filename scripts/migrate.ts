#!/usr/bin/env bun
/**
 * CLI tool for managing data migrations.
 *
 * Usage:
 *   bun run migrate:status              Show migration status across all namespaces
 *   bun run migrate:up                  Run pending migrations
 *   bun run migrate:up --dry-run        Preview migrations without applying
 *   bun run migrate:rollback            Roll back the latest migration
 *   bun run migrate:rollback <ns>       Roll back only a specific namespace
 *
 * Environment:
 *   Connects to PostgreSQL using the same env vars as the app (PG_PASSWORD, etc).
 *   For Cloudflare Workers, use the admin API instead: GET /api/settings/migrations
 */

import { migrations } from '../src/shared/migrations'
import { runMigrations, rollbackMigration, getMigrationStatus } from '../src/shared/migrations/runner'
import type { MigrationStorage, MigrationHistoryEntry } from '../src/shared/migrations/types'

const HELP = `
Usage: bun run scripts/migrate.ts <command> [options]

Commands:
  status                Show migration status for all namespaces
  up                    Run all pending migrations
  up --dry-run          Preview pending migrations without applying
  rollback [namespace]  Roll back the latest migration (optionally for a single namespace)

Options:
  --help                Show this help message
`

// Minimal in-memory storage for status display when no DB is available
class InMemoryStorage implements MigrationStorage {
  private data = new Map<string, unknown>()
  async get<T>(key: string): Promise<T | undefined> { return this.data.get(key) as T | undefined }
  async put(key: string, value: unknown): Promise<void> { this.data.set(key, value) }
  async delete(key: string): Promise<void> { this.data.delete(key) }
  async list(options?: { prefix?: string }): Promise<Map<string, unknown>> {
    if (!options?.prefix) return new Map(this.data)
    const result = new Map<string, unknown>()
    for (const [k, v] of this.data) {
      if (k.startsWith(options.prefix)) result.set(k, v)
    }
    return result
  }
}

function formatStatus(history: MigrationHistoryEntry[]): void {
  if (history.length === 0) {
    console.log('  No migrations registered')
    return
  }
  const maxNameLen = Math.max(...history.map(h => h.name.length), 4)
  console.log(`  ${'Ver'.padEnd(5)} ${'Name'.padEnd(maxNameLen)} ${'Status'.padEnd(10)} Applied At`)
  console.log(`  ${'---'.padEnd(5)} ${'----'.padEnd(maxNameLen)} ${'------'.padEnd(10)} ----------`)
  for (const entry of history) {
    const status = entry.status === 'applied' ? '\x1b[32mapplied\x1b[0m' : '\x1b[33mpending\x1b[0m'
    const appliedAt = entry.appliedAt || '-'
    console.log(`  ${String(entry.version).padEnd(5)} ${entry.name.padEnd(maxNameLen)} ${status.padEnd(19)} ${appliedAt}`)
  }
}

async function tryConnectPostgres(): Promise<{ sql: any; PostgresStorage: any } | null> {
  try {
    const { initPostgresPool, getPool } = await import('../src/platform/node/storage/postgres-pool')
    const { PostgresStorage } = await import('../src/platform/node/storage/postgres-storage')
    await initPostgresPool()
    return { sql: getPool(), PostgresStorage }
  } catch {
    return null
  }
}

async function getNamespaces(sql: any): Promise<string[]> {
  try {
    const rows = await sql`SELECT DISTINCT namespace FROM kv_store`
    return rows.map((r: any) => r.namespace as string)
  } catch {
    return []
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    process.exit(0)
  }

  if (command === 'status') {
    console.log('\n=== Migration Registry ===')
    console.log(`Registered migrations: ${migrations.length}`)
    if (migrations.length > 0) {
      console.log(`Latest version: v${migrations[migrations.length - 1].version}`)
    }
    console.log('')

    // Show registered migrations
    const inMemory = new InMemoryStorage()
    const { history } = await getMigrationStatus(inMemory, migrations)
    console.log('Available migrations:')
    formatStatus(history)
    console.log('')

    // Try connecting to DB for live status
    const db = await tryConnectPostgres()
    if (db) {
      const namespaces = await getNamespaces(db.sql)
      if (namespaces.length === 0) {
        console.log('No namespaces found in database.')
      } else {
        console.log(`=== Database Status (${namespaces.length} namespace(s)) ===\n`)
        for (const ns of namespaces) {
          const storage = new db.PostgresStorage(ns)
          const status = await getMigrationStatus(storage, migrations)
          console.log(`[${ns}] v${status.currentVersion}/${status.latestVersion} (${status.pending} pending)`)
          if (status.lastRun) console.log(`  Last run: ${status.lastRun}`)
          formatStatus(status.history)
          console.log('')
        }
      }
      await db.sql.end()
    } else {
      console.log('(No database connection — showing registry only)')
      console.log('For Cloudflare Workers, use: GET /api/settings/migrations')
    }
    return
  }

  if (command === 'up') {
    const dryRun = args.includes('--dry-run')
    const db = await tryConnectPostgres()
    if (!db) {
      console.error('Cannot connect to PostgreSQL. For Cloudflare Workers, migrations run automatically on DO access.')
      process.exit(1)
    }

    const namespaces = await getNamespaces(db.sql)
    if (namespaces.length === 0) {
      console.log('No namespaces found.')
      await db.sql.end()
      return
    }

    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Running migrations for ${namespaces.length} namespace(s)...\n`)
    for (const ns of namespaces) {
      await db.sql.begin(async (tx: any) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`migrate:${ns}`}))`
        const storage = new db.PostgresStorage(ns)
        await runMigrations(storage, migrations, ns, {
          dryRun,
          onProgress: (p) => {
            console.log(`  [${ns}] v${p.currentVersion}: ${p.migrationName} (${p.completedCount}/${p.totalPending})`)
          },
        })
      })
    }
    console.log('\nDone.')
    await db.sql.end()
    return
  }

  if (command === 'rollback') {
    const targetNamespace = args[1]
    const db = await tryConnectPostgres()
    if (!db) {
      console.error('Cannot connect to PostgreSQL. For CF Workers, use the DO /migrations/rollback endpoint.')
      process.exit(1)
    }

    const namespaces = targetNamespace ? [targetNamespace] : await getNamespaces(db.sql)
    if (namespaces.length === 0) {
      console.log('No namespaces found.')
      await db.sql.end()
      return
    }

    console.log(`\nRolling back latest migration for ${namespaces.length} namespace(s)...\n`)
    for (const ns of namespaces) {
      await db.sql.begin(async (tx: any) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`migrate:${ns}`}))`
        const storage = new db.PostgresStorage(ns)
        try {
          const result = await rollbackMigration(storage, migrations, ns)
          if (result) {
            console.log(`  [${ns}] Rolled back v${result.rolledBackVersion} → v${result.newVersion}`)
          } else {
            console.log(`  [${ns}] Already at v0 — nothing to roll back`)
          }
        } catch (err) {
          console.error(`  [${ns}] Error: ${err instanceof Error ? err.message : err}`)
        }
      })
    }
    console.log('\nDone.')
    await db.sql.end()
    return
  }

  console.error(`Unknown command: ${command}`)
  console.log(HELP)
  process.exit(1)
}

main().catch((err) => {
  console.error('Migration error:', err)
  process.exit(1)
})
