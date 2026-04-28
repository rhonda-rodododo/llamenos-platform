#!/usr/bin/env bun
/**
 * Apply Drizzle SQL migrations in order before the app starts.
 *
 * Reads all *.sql files from drizzle/migrations/, sorts them by filename
 * (numeric prefix), and executes each one. Statements are split on the
 * Drizzle `--> statement-breakpoint` marker so each DDL runs individually.
 *
 * Safe to run repeatedly — DDL is pre-processed to add IF NOT EXISTS / IF EXISTS
 * guards, and remaining "already exists" errors are caught as a fallback.
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

/**
 * Make DDL statements idempotent by injecting IF NOT EXISTS / IF EXISTS guards.
 * Drizzle generates bare CREATE/DROP without these guards.
 */
function makeIdempotent(stmt: string): string {
  let s = stmt
  // CREATE TABLE → CREATE TABLE IF NOT EXISTS
  s = s.replace(
    /\bCREATE TABLE\b(?!\s+IF\s+NOT\s+EXISTS)/gi,
    'CREATE TABLE IF NOT EXISTS',
  )
  // CREATE INDEX → CREATE INDEX IF NOT EXISTS
  s = s.replace(
    /\bCREATE INDEX\b(?!\s+IF\s+NOT\s+EXISTS)/gi,
    'CREATE INDEX IF NOT EXISTS',
  )
  // CREATE UNIQUE INDEX → CREATE UNIQUE INDEX IF NOT EXISTS
  s = s.replace(
    /\bCREATE UNIQUE INDEX\b(?!\s+IF\s+NOT\s+EXISTS)/gi,
    'CREATE UNIQUE INDEX IF NOT EXISTS',
  )
  // DROP TABLE → DROP TABLE IF EXISTS
  s = s.replace(
    /\bDROP TABLE\b(?!\s+IF\s+EXISTS)/gi,
    'DROP TABLE IF EXISTS',
  )
  // DROP INDEX → DROP INDEX IF EXISTS
  s = s.replace(
    /\bDROP INDEX\b(?!\s+IF\s+EXISTS)/gi,
    'DROP INDEX IF EXISTS',
  )
  return s
}

const sql = new SQL({ url: databaseUrl, max: 1, connectionTimeout: 30 })

try {
  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8')
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const raw of statements) {
      const stmt = makeIdempotent(raw)
      try {
        await sql.unsafe(stmt)
      } catch (err: unknown) {
        // Fallback: tolerate "already exists" / "does not exist" from statements
        // that makeIdempotent() couldn't patch (ALTER TABLE ADD COLUMN, etc.)
        const msg = err instanceof Error ? err.message : String(err)
        if (
          msg.includes('already exists') ||
          msg.includes('does not exist') ||
          msg.includes('duplicate key') ||
          msg.includes('duplicate column')
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
