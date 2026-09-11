import { existsSync, readFileSync } from 'node:fs'
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
const STREAK_RESETS: ReadonlySet<Outcome> = new Set<Outcome>(['SUCCESS', 'SHADOW'])

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

export function checkBreakers(rows: RunRecord[], limits: Limits, now: number, resumedAt: number): string | undefined {
  return rateBreaker(rows, limits, now) ?? failureBreaker(rows, limits, resumedAt)
}

/** Lane-level backoff instead of a global halt: one provider's quota should not
 *  stop five other lanes that use a different one. */
export function inQuotaCooldown(rows: RunRecord[], lane: string, now: number, limits: Limits): boolean {
  const last = rows.filter((x) => x.lane === lane && x.outcome === 'QUOTA').sort((a, b) => b.ts - a.ts)[0]
  return last !== undefined && now - last.ts < limits.quotaCooldownMs
}
