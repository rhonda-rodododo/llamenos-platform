import { existsSync, readFileSync } from 'node:fs'
import { halt } from './killswitch.js'
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
 *
 * UNVERIFIED is excluded for the same reason as QUOTA, not BLOCKED: issue
 * #870 (see the `Outcome` doc comment in ledger.ts) is three workers that
 * finished with a real terminal SUCCESS and a real PR, recorded FAILED only
 * because THIS fleet's own launch/revise plumbing broke down talking to
 * them. That is a verification gap, not a worker producing bad output — the
 * exact distinction REJECTED already draws against BLOCKED above, just
 * pointed at this fleet's own machinery instead of a worker's scope
 * violation. Three verification gaps in a row must never read as "the fleet
 * is misbehaving" the way three real REJECTEDs do.
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

/**
 * Issue #817: the exact halt-reason prefix `quotaBreaker` writes and
 * `isQuotaHaltReason`/`parseQuotaResumeAt` read back, so a human (or the
 * digest) has one string to grep for and this file has one place that can
 * ever go out of sync with itself.
 */
export const QUOTA_HALT_PREFIX = 'engine quota exhausted'

/** True for exactly the halt reasons `quotaBreaker` produces below — never
 *  for a human-typed halt, a GitHub `halt`-labelled issue, or the plain
 *  consecutive-failures/rate breakers, all of which must still require a
 *  human `resume`. */
export function isQuotaHaltReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.startsWith(QUOTA_HALT_PREFIX)
}

const QUOTA_RETRY_AFTER_RE = /retry after (.+)$/

/** Extracts the absolute ISO instant `quotaBreaker` embedded in its own halt
 *  reason. `undefined` for anything that is not that exact shape — a reason
 *  string a human wrote by hand (e.g. `halt "engine quota exhausted, just
 *  checking"`) must never be treated as carrying a real resume time. */
export function parseQuotaResumeAt(reason: string): number | undefined {
  const raw = QUOTA_RETRY_AFTER_RE.exec(reason)?.[1]
  if (raw === undefined) return undefined
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : undefined
}

/** Falls back to a flat hour when nothing among the tripping QUOTA rows
 *  parsed an absolute reset time (e.g. Kimi's "resets when the current
 *  5-hour window ends" — a real window, but not a clock time this fleet can
 *  resolve on its own). Halting forever on an un-parseable hint would be
 *  worse than a bounded, slightly-too-long wait. */
const QUOTA_DEFAULT_COOLDOWN_MS = 3_600_000

/**
 * Issue #817: `>= 2` `QUOTA` outcomes for the SAME engine, since the last
 * resume, is treated as that whole engine's quota being exhausted
 * fleet-wide — not one unlucky worker. Grouped by `engine` (not `lane`): a
 * provider-side 5-hour or weekly usage limit is shared across every lane
 * dispatched through that engine's account, so two DIFFERENT lanes each
 * hitting it once is exactly the same signal one lane hitting it twice
 * would be, and a single QUOTA row is deliberately not enough on its own —
 * a lone rejection could still be a transient blip.
 *
 * Never returns anything from `FAILED`/`TIMEOUT`/`REJECTED` rows: the
 * consecutive-failure breaker already owns those, and its own contract
 * (`failureBreaker`, above) explicitly excludes `QUOTA` from that count —
 * this function's whole reason to exist is to give quota exhaustion a
 * SEPARATE, self-describing, self-healing halt path instead of it silently
 * feeding "N consecutive failures".
 */
export function quotaBreaker(rows: RunRecord[], resumedAt: number, now: number): string | undefined {
  const quotaRows = rows.filter((x) => x.ts > resumedAt && x.outcome === 'QUOTA')
  const byEngine = new Map<string, RunRecord[]>()
  for (const r of quotaRows) {
    const list = byEngine.get(r.engine) ?? []
    list.push(r)
    byEngine.set(r.engine, list)
  }
  for (const [engine, list] of byEngine) {
    if (list.length < 2) continue
    const knownResets = list
      .map((r) => r.quotaResetAt)
      .filter((v): v is number => typeof v === 'number')
    const resumeAt = knownResets.length > 0 ? Math.max(...knownResets) : now + QUOTA_DEFAULT_COOLDOWN_MS
    return `${QUOTA_HALT_PREFIX} (${engine}) — retry after ${new Date(resumeAt).toISOString()}`
  }
  return undefined
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
export function checkBreakers(rows: RunRecord[], limits: Limits, now: number, resumedAt: number): string | undefined {
  const rate = rateBreaker(rows, limits, now)
  if (rate !== undefined) {
    halt(`rate breaker tripped: ${rate}`)
    return rate
  }
  // Checked BEFORE the consecutive-failure breaker, and — unlike rate/failure
  // — halted with its OWN reason text verbatim, never wrapped in a "breaker
  // tripped:" prefix: that exact string (`engine quota exhausted (<engine>)
  // — retry after <ISO>`) is what `tick()`'s auto-resume path and the
  // digest/status "degraded" banner both parse back out of the halt-reason
  // file (`isQuotaHaltReason`/`parseQuotaResumeAt`). A `QUOTA` outcome never
  // feeds `failureBreaker`'s streak (see `STREAK_FAILURES`, above) — this is
  // what gives the SAME condition a separate, self-healing halt path instead
  // of it eventually presenting as an opaque "N consecutive failures".
  const quota = quotaBreaker(rows, resumedAt, now)
  if (quota !== undefined) {
    halt(quota)
    return quota
  }
  const failure = failureBreaker(rows, limits, resumedAt)
  if (failure !== undefined) {
    halt(`failure breaker tripped: ${failure}`)
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
