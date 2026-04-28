#!/usr/bin/env bun
/**
 * Apply Drizzle SQL migrations in order before the app starts.
 *
 * Reads all *.sql files from drizzle/migrations/, sorts them by filename
 * (numeric prefix), and executes each one. Statements are split on the
 * Drizzle `--> statement-breakpoint` marker so each DDL runs individually.
 *
 * Safe to run repeatedly — migrations use IF NOT EXISTS / IF EXISTS guards.
 */
import { SQL } from 'bun'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[migrate] DATABASE_URL is required')
  process.exit(1)
}

const migrationsDir = join(import.meta.dir, '..', 'drizzle', 'migrations')

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.log('[migrate] No migration files found')
  process.exit(0)
}

const sql = new SQL({ url: databaseUrl, max: 1, connectionTimeout: 30 })

try {
  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8')
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt)
      } catch (err: unknown) {
        // Tolerate "already exists" / "does not exist" errors from re-runs
        const msg = err instanceof Error ? err.message : String(err)
        if (
          msg.includes('already exists') ||
          msg.includes('does not exist') ||
          msg.includes('duplicate key')
        ) {
          console.log(`[migrate] ${file}: skipped (${msg.slice(0, 80)})`)
        } else {
          console.error(`[migrate] ${file}: FAILED — ${msg}`)
          throw err
        }
      }
    }
    console.log(`[migrate] ${file}: applied`)
  }
  console.log('[migrate] All migrations applied successfully')
} finally {
  await sql.close()
}
