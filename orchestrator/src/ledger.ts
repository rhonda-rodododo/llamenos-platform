import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { LEDGER_FILE } from './paths.js'

/**
 * G1 (2026-09-12): this ledger records ONLY the fleet's own actions and
 * observations, AT THE TIME they happened — never a durable claim about
 * external state that can drift out from under it. The concrete incident
 * this guards against: issue #660's terminal row recorded `SUCCESS` with a
 * PR link, and `worktree.ts` used to map that straight to a `fleet:merged`
 * label — but the PR was never merged, and nothing here ever re-checked. The
 * label was a CACHE of "what we believed happened", and it went stale the
 * instant it was written.
 *
 * The fix is not a better mapping — any label the fleet writes to describe
 * an outcome can drift the same way. Whether a PR is open, merged, or closed
 * is a fact about GitHub, and is DERIVED ON READ from `gh` (state, mergedAt,
 * headRefOid, reviews) plus this ledger's own rows plus `git` (does the
 * branch/worktree still exist) — see `llamenos-fleet status <issue>` and
 * `digest.ts`'s "waiting on a human" section, neither of which reads a
 * label. Do not add a field here (or a label in worktree.ts) that caches
 * "merged", "reviewed", or any other fact this ledger cannot itself
 * guarantee stays true after the row is written — if it's derivable from a
 * live query, derive it, every time, rather than remembering it once.
 */

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
  /**
   * Issue #817: populated only when `outcome === 'QUOTA'`, straight from the
   * worker's own raw log — `engines.ts`'s `detectQuotaFromLog`. `resetHint`
   * is the provider's own wording verbatim (e.g. "when the current 5-hour
   * window ends", or "1:20pm (America/New_York)") so a human reading the
   * ledger sees exactly what the provider said; `resetAt` is that hint
   * resolved to an absolute epoch ms ONLY when it named a parseable clock
   * time — `undefined` when the hint was a relative description with no
   * clock time to resolve (the 5-hour-window case), which is precisely when
   * `circuit.ts`'s `quotaBreaker` falls back to its own 60-minute default.
   */
  quotaResetHint?: string
  quotaResetAt?: number
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
