import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { LEDGER_FILE } from './paths.js'

/**
 * QUOTA is deliberately not a flavour of FAILED. A provider rate limit is not
 * the fleet misbehaving, and letting it feed the consecutive-failure breaker
 * turns a billing event into a global halt.
 */
export type Outcome =
  | 'DISPATCHED' | 'SUCCESS' | 'FAILED' | 'BLOCKED'
  | 'TIMEOUT' | 'SHADOW' | 'REJECTED' | 'QUOTA'

export interface RunRecord {
  ts: number
  runId: string
  lane: string
  itemId: string
  itemName: string
  engine: string
  branch?: string
  pr?: string
  outcome: Outcome
  note?: string
}

/** JSONL, not SQLite: a truncated final line costs one record; a locked
 *  database wedges every future pass. */
export function parseLedger(text: string): RunRecord[] {
  const out: RunRecord[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { out.push(JSON.parse(t) as RunRecord) } catch { /* truncated tail */ }
  }
  return out
}

export function readAll(): RunRecord[] {
  if (!existsSync(LEDGER_FILE)) return []
  return parseLedger(readFileSync(LEDGER_FILE, 'utf8'))
}

export function append(r: RunRecord): void {
  mkdirSync(dirname(LEDGER_FILE), { recursive: true })
  appendFileSync(LEDGER_FILE, JSON.stringify(r) + '\n')
}

export function sinceIn(rows: RunRecord[], windowMs: number, now: number): RunRecord[] {
  return rows.filter((r) => now - r.ts <= windowMs)
}

export function since(windowMs: number, now = Date.now()): RunRecord[] {
  return sinceIn(readAll(), windowMs, now)
}

const TERMINAL_FAILURES: ReadonlySet<Outcome> = new Set<Outcome>(['FAILED', 'TIMEOUT', 'BLOCKED', 'REJECTED'])

/** Counts backward from the newest record for this item and stops at a SUCCESS. */
export function failedAttemptsIn(rows: RunRecord[], itemId: string): number {
  const mine = rows.filter((r) => r.itemId === itemId).sort((a, b) => b.ts - a.ts)
  let n = 0
  for (const r of mine) {
    if (r.outcome === 'SUCCESS') break
    if (TERMINAL_FAILURES.has(r.outcome)) n++
  }
  return n
}

export function failedAttemptsFor(itemId: string): number {
  return failedAttemptsIn(readAll(), itemId)
}
