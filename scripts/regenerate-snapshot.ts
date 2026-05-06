#!/usr/bin/env bun
/**
 * regenerate-snapshot.ts — Regenerate the drizzle-kit snapshot from current schema.
 *
 * Use this when the snapshot is out of sync with manually-written migrations.
 * After running, the check-migration-drift script will use this as the baseline.
 */

import { generateDrizzleJson } from 'drizzle-kit/api'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Glob } from 'bun'

const MIGRATIONS_DIR = 'drizzle/migrations'
const SCHEMA_GLOB = 'apps/worker/db/schema/*.ts'

async function loadSchemaModules(): Promise<Record<string, unknown>> {
  const glob = new Glob(SCHEMA_GLOB)
  const modules: Record<string, unknown> = {}
  for await (const path of glob.scan('.')) {
    const mod = await import(join(process.cwd(), path))
    Object.assign(modules, mod)
  }
  return modules
}

async function main() {
  const schemaModules = await loadSchemaModules()
  const snapshot = generateDrizzleJson(schemaModules)

  // Read journal to determine the latest index
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf-8'))

  // Get all SQL files to build journal entries
  const glob = new Glob('*.sql')
  const sqlFiles: string[] = []
  for await (const f of glob.scan(MIGRATIONS_DIR)) {
    sqlFiles.push(f.replace('.sql', ''))
  }
  sqlFiles.sort()

  // Build journal entries for all SQL files
  const entries = sqlFiles.map((tag, idx) => ({
    idx,
    version: '7',
    when: journal.entries[0]?.when ?? Date.now(),
    tag,
    breakpoints: true,
  }))

  // Update journal
  journal.entries = entries
  await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n')

  // Write snapshot with the latest tag's index
  const latestIdx = entries.length > 0 ? entries[entries.length - 1].idx : 0
  const snapshotPath = join(MIGRATIONS_DIR, 'meta', `${String(latestIdx).padStart(4, '0')}_snapshot.json`)
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n')

  console.log(`Updated journal with ${entries.length} entries`)
  console.log(`Written snapshot to ${snapshotPath}`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
