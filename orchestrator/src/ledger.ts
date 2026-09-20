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
 *
 * UNVERIFIED is the same idea applied to this fleet's OWN plumbing rather
 * than a provider's. Issue #870: `fleet-backend-705`, `fleet-desktop-775`,
 * and `fleet-infra-722` all wrote a real terminal `SUCCESS` to their own
 * status file, with a real, working PR — and the ledger recorded all three
 * `FAILED` anyway, because something between the worker and this ledger
 * broke: a re-dispatch's own launch call (`dispatch-one.sh`, which returns
 * almost immediately under normal load) outran its short supervising
 * timeout while three lanes contended for one box at once (backend/705,
 * desktop/775), and a review round's `tmux send-keys` addressed a session
 * the worker had already exited on its own after finishing (infra/722). In
 * neither case did the WORK fail; this fleet's own attempt to talk to or
 * about the worker did. `UNVERIFIED` names that outcome so it reads as
 * "the fleet couldn't confirm this, look at the PR yourself" rather than as
 * "the task failed" — and, like QUOTA, it must never feed
 * `circuit.ts`'s consecutive-failure streak: three verification gaps in a
 * row are not three failures, and halting the fleet over them is exactly
 * the false alarm this outcome exists to prevent.
 */
export type Outcome =
  | 'DISPATCHED' | 'SUCCESS' | 'FAILED' | 'BLOCKED'
  | 'TIMEOUT' | 'SHADOW' | 'REJECTED' | 'QUOTA' | 'UNVERIFIED'

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

// UNVERIFIED counts here (bounding an item's per-attempt retries — same
// reasoning as BLOCKED, immediately below in this list) even though it must
// NOT feed circuit.ts's fleet-wide streak (see the `Outcome` doc comment
// above): an item whose verification keeps coming back inconclusive still
// needs to stop being re-claimed forever, it just must not take the whole
// fleet down while it does.
const TERMINAL_FAILURES: ReadonlySet<Outcome> = new Set<Outcome>(['FAILED', 'TIMEOUT', 'BLOCKED', 'REJECTED', 'UNVERIFIED'])

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
