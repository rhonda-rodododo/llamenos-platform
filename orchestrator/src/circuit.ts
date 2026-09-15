import { existsSync, readFileSync } from 'node:fs'
import { halt, defaultHaltNotifyDeps, type HaltNotifyDeps } from './killswitch.js'
import { RESUMED_AT_FILE } from './paths.js'
import type { Outcome, RunRecord } from './ledger.js'

export interface Limits {
  maxDispatchesPerHour: number
  consecutiveFailuresToHalt: number
  quotaCooldownMs: number
}

const HOUR = 3_600_000

/**
 * QUOTA is excluded: a provider rate limit is not the fleet misbehaving.
 *
 * REJECTED counts toward the streak; BLOCKED deliberately does not. REJECTED
 * means a worker's output failed verification — three of those in a row is
 * exactly the fleet misbehaving, which is what this breaker exists to catch.
 * BLOCKED means a worker correctly reported it cannot proceed (e.g. a scope
 * conflict) — that is the system working as designed, and the per-item
 * attempt limit (see ledger.ts's failedAttemptsFor) already bounds it, so it
 * must not also feed a fleet-wide halt.
 */
const STREAK_FAILURES: ReadonlySet<Outcome> = new Set<Outcome>(['FAILED', 'TIMEOUT', 'REJECTED'])
// SHADOW is excluded from both sets, like QUOTA — a shadow lane writes a
// SHADOW row on every pass it runs, so in the mixed ramp the spec prescribes
// (some lanes live, some shadow), the newest row would always be a SHADOW
// row. Treating it as a reset would mean the newest row resets the streak on
// every single pass, so the consecutive-failure breaker could never trip for
// a live lane running alongside a shadow one. It must be ignored entirely so
// the streak is computed only from the outcomes that actually bear on it.
const STREAK_RESETS: ReadonlySet<Outcome> = new Set<Outcome>(['SUCCESS'])

export function rateBreaker(rows: RunRecord[], limits: Limits, now: number): string | undefined {
  const n = rows.filter((x) => x.outcome === 'DISPATCHED' && now - x.ts <= HOUR).length
  return n > limits.maxDispatchesPerHour
    ? `dispatch rate ${n}/h exceeds ceiling of ${limits.maxDispatchesPerHour}`
    : undefined
}

export function failureBreaker(rows: RunRecord[], limits: Limits, resumedAt: number): string | undefined {
  const considered = rows
    .filter((x) => x.ts > resumedAt)
    .filter((x) => STREAK_FAILURES.has(x.outcome) || STREAK_RESETS.has(x.outcome))
    .sort((a, b) => b.ts - a.ts)
  let streak = 0
  for (const x of considered) {
    if (STREAK_RESETS.has(x.outcome)) break
    streak++
  }
  return streak >= limits.consecutiveFailuresToHalt
    ? `${streak} consecutive failures since last success`
    : undefined
}

export function readResumedAt(): number {
  if (!existsSync(RESUMED_AT_FILE)) return 0
  const n = Number.parseInt(readFileSync(RESUMED_AT_FILE, 'utf8').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Issue #638: the spec promises "a tripped breaker writes the same halt file
 * a human would — one halted state, one recovery path", and killswitch.ts's
 * own comment on `halt()` says breakers call it. Until now, nothing did — a
 * tripped breaker aborted the one pass and logged a line, but `doctor` kept
 * reporting `not halted` and an operator had no reason to run `resume`. The
 * breaker name is folded into the reason passed to `halt()` (not into the
 * string returned here, which callers already prefix with their own
 * "breaker tripped:" wording) so the halt reason file — read by both `doctor`
 * and `status` — names which breaker fired, not just that something did.
 */
/**
 * `notifyDeps` defaults to the real GitHub-backed deps (production
 * behaviour, unchanged) but is threaded through to `halt()` so tests can
 * inject a fake and assert on it — or simply avoid a real network call —
 * without mocking `node:child_process` wholesale. See killswitch.test.ts.
 */
export async function checkBreakers(
  rows: RunRecord[],
  limits: Limits,
  now: number,
  resumedAt: number,
  notifyDeps: HaltNotifyDeps = defaultHaltNotifyDeps(),
): Promise<string | undefined> {
  const rate = rateBreaker(rows, limits, now)
  if (rate !== undefined) {
    // Issue #838: awaited, not fire-and-forget — tick.ts's caller chain runs
    // inside a one-shot CLI process (`process.exit(await handler(...))`,
    // cli.ts's `main()`), which kills anything still in flight the instant
    // the promise this function returns resolves. Not awaiting here would
    // mean the BLOCKED ping `halt()` sends usually, but not reliably, makes
    // it out before the process dies.
    await halt(`rate breaker tripped: ${rate}`, notifyDeps)
    return rate
  }
  const failure = failureBreaker(rows, limits, resumedAt)
  if (failure !== undefined) {
    await halt(`failure breaker tripped: ${failure}`, notifyDeps)
    return failure
  }
  return undefined
}

/** Lane-level backoff instead of a global halt: one provider's quota should not
 *  stop five other lanes that use a different one. */
export function inQuotaCooldown(rows: RunRecord[], lane: string, now: number, limits: Limits): boolean {
  const last = rows.filter((x) => x.lane === lane && x.outcome === 'QUOTA').sort((a, b) => b.ts - a.ts)[0]
  return last !== undefined && now - last.ts < limits.quotaCooldownMs
}
