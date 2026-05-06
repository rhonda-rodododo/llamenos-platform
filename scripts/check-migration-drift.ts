#!/usr/bin/env bun
/**
 * check-migration-drift.ts — Detect Drizzle schema changes without corresponding migrations.
 *
 * Uses drizzle-kit's programmatic API to generate a snapshot from the current schema,
 * then compares it against the last committed snapshot. If the table/column structure
 * differs, the schema has drifted from the committed migrations.
 *
 * Usage:
 *   bun scripts/check-migration-drift.ts          # run drift check
 *   bun scripts/check-migration-drift.ts --ci     # CI mode (show detailed diff)
 */

import { generateDrizzleJson } from 'drizzle-kit/api'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Glob } from 'bun'

const CI_MODE = process.argv.includes('--ci')
const MIGRATIONS_DIR = 'drizzle/migrations'
const SCHEMA_GLOB = 'apps/worker/db/schema/*.ts'

type SnapshotTable = {
  name: string
  columns: Record<string, { name: string; type: string; primaryKey: boolean; notNull: boolean; default?: unknown }>
  indexes: Record<string, unknown>
  foreignKeys: Record<string, unknown>
  compositePrimaryKeys: Record<string, unknown>
  uniqueConstraints: Record<string, unknown>
}

type Snapshot = {
  tables: Record<string, SnapshotTable>
  enums: Record<string, unknown>
  sequences: Record<string, unknown>
}

async function loadSchemaModules(): Promise<Record<string, unknown>> {
  const glob = new Glob(SCHEMA_GLOB)
  const modules: Record<string, unknown> = {}
  for await (const path of glob.scan('.')) {
    const mod = await import(join(process.cwd(), path))
    Object.assign(modules, mod)
  }
  return modules
}

async function getLatestSnapshot(): Promise<Snapshot | null> {
  const metaDir = join(MIGRATIONS_DIR, 'meta')
  const files = await readdir(metaDir)
  const snapshots = files
    .filter(f => f.endsWith('_snapshot.json'))
    .sort()

  if (snapshots.length === 0) return null

  const latest = snapshots[snapshots.length - 1]
  const content = await readFile(join(metaDir, latest), 'utf-8')
  return JSON.parse(content) as Snapshot
}

/** Normalize a snapshot to only the structurally significant parts for comparison */
function normalizeSnapshot(snap: Snapshot): string {
  // Extract just tables, their columns, indexes, foreign keys, constraints, enums, sequences
  const normalized = {
    tables: Object.fromEntries(
      Object.entries(snap.tables ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, table]) => [
        key,
        {
          name: table.name,
          columns: Object.fromEntries(
            Object.entries(table.columns ?? {}).sort(([a], [b]) => a.localeCompare(b)),
          ),
          indexes: Object.fromEntries(
            Object.entries(table.indexes ?? {}).sort(([a], [b]) => a.localeCompare(b)),
          ),
          foreignKeys: Object.fromEntries(
            Object.entries(table.foreignKeys ?? {}).sort(([a], [b]) => a.localeCompare(b)),
          ),
          compositePrimaryKeys: Object.fromEntries(
            Object.entries(table.compositePrimaryKeys ?? {}).sort(([a], [b]) => a.localeCompare(b)),
          ),
          uniqueConstraints: Object.fromEntries(
            Object.entries(table.uniqueConstraints ?? {}).sort(([a], [b]) => a.localeCompare(b)),
          ),
        },
      ]),
    ),
    enums: Object.fromEntries(
      Object.entries(snap.enums ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
    sequences: Object.fromEntries(
      Object.entries(snap.sequences ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  }
  return JSON.stringify(normalized)
}

/** Produce a human-readable summary of what changed */
function describeDiff(prev: Snapshot, curr: Snapshot): string[] {
  const diffs: string[] = []
  const prevTables = new Set(Object.keys(prev.tables ?? {}))
  const currTables = new Set(Object.keys(curr.tables ?? {}))

  // New tables
  for (const t of currTables) {
    if (!prevTables.has(t)) diffs.push(`+ Table added: ${t}`)
  }
  // Removed tables
  for (const t of prevTables) {
    if (!currTables.has(t)) diffs.push(`- Table removed: ${t}`)
  }
  // Changed tables
  for (const t of currTables) {
    if (!prevTables.has(t)) continue
    const prevCols = new Set(Object.keys(prev.tables[t]?.columns ?? {}))
    const currCols = new Set(Object.keys(curr.tables[t]?.columns ?? {}))

    for (const c of currCols) {
      if (!prevCols.has(c)) diffs.push(`+ Column added: ${prev.tables[t].name}.${c}`)
    }
    for (const c of prevCols) {
      if (!currCols.has(c)) diffs.push(`- Column removed: ${prev.tables[t].name}.${c}`)
    }

    // Check for column type/constraint changes
    for (const c of currCols) {
      if (!prevCols.has(c)) continue
      const prevCol = prev.tables[t].columns[c]
      const currCol = curr.tables[t].columns[c]
      if (JSON.stringify(prevCol) !== JSON.stringify(currCol)) {
        diffs.push(`~ Column modified: ${prev.tables[t].name}.${c}`)
      }
    }

    // Check for index changes
    const prevIdx = JSON.stringify(prev.tables[t]?.indexes ?? {})
    const currIdx = JSON.stringify(curr.tables[t]?.indexes ?? {})
    if (prevIdx !== currIdx) diffs.push(`~ Indexes changed on: ${prev.tables[t].name}`)

    // Check for FK changes
    const prevFk = JSON.stringify(prev.tables[t]?.foreignKeys ?? {})
    const currFk = JSON.stringify(curr.tables[t]?.foreignKeys ?? {})
    if (prevFk !== currFk) diffs.push(`~ Foreign keys changed on: ${prev.tables[t].name}`)
  }

  // Enum changes
  const prevEnums = JSON.stringify(prev.enums ?? {})
  const currEnums = JSON.stringify(curr.enums ?? {})
  if (prevEnums !== currEnums) diffs.push('~ Enums changed')

  return diffs
}

async function main() {
  // 1. Load current schema from source code
  const schemaModules = await loadSchemaModules()

  // 2. Generate a fresh snapshot from the current schema
  const currentSnapshot = generateDrizzleJson(schemaModules) as unknown as Snapshot

  // 3. Load the last committed snapshot
  const previousSnapshot = await getLatestSnapshot()
  if (!previousSnapshot) {
    console.error('No existing migration snapshot found in drizzle/migrations/meta/')
    console.error('Run `bunx drizzle-kit generate --name initial` to create the initial migration.')
    process.exit(1)
  }

  // 4. Compare normalized snapshots
  const prevNorm = normalizeSnapshot(previousSnapshot)
  const currNorm = normalizeSnapshot(currentSnapshot)

  if (prevNorm === currNorm) {
    if (CI_MODE) {
      console.log('✓ Schema and migrations are in sync — no drift detected.')
    }
    process.exit(0)
  }

  // Drift detected
  const diffs = describeDiff(previousSnapshot, currentSnapshot)

  console.error('')
  console.error('╔══════════════════════════════════════════════════════════════╗')
  console.error('║  MIGRATION DRIFT DETECTED                                  ║')
  console.error('╠══════════════════════════════════════════════════════════════╣')
  console.error('║  Your Drizzle schema has changes not captured in a          ║')
  console.error('║  migration file. This will break CI and production.        ║')
  console.error('║                                                            ║')
  console.error("║  Fix: run 'bunx drizzle-kit generate --name <description>' ║")
  console.error('║  and commit the resulting SQL file.                        ║')
  console.error('╚══════════════════════════════════════════════════════════════╝')
  console.error('')

  if (diffs.length > 0) {
    console.error('Changes detected:')
    for (const d of diffs) {
      console.error(`  ${d}`)
    }
  } else {
    console.error('Structural differences detected (column types, defaults, or constraints).')
  }

  process.exit(1)
}

main().catch((err) => {
  console.error('Migration drift check failed:', err)
  process.exit(2)
})
