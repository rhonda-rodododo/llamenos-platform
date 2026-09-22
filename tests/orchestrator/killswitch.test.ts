import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import {
  checkHalt, halt, haltedLocally, haltedOnGitHubFrom, resume, type HaltNotifyDeps,
} from '../../orchestrator/src/killswitch.js'
import { FLEET_DIR, HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE } from '../../orchestrator/src/paths.js'
import { failureBreaker, readResumedAt, checkBreakers, type Limits } from '../../orchestrator/src/circuit.js'
import { doctor } from '../../orchestrator/src/cli.js'
import type { WorkSink, SinkComment } from '../../orchestrator/src/sink.js'
import type { RunRecord, Outcome } from '../../orchestrator/src/ledger.js'

const LIMITS: Limits = { maxDispatchesPerHour: 6, consecutiveFailuresToHalt: 3, quotaCooldownMs: 3_600_000 }
const failedAt = (ts: number): RunRecord =>
  ({ ts, runId: 'r', lane: 'backend', itemId: '1', itemName: 'n', engine: 'claude', outcome: 'FAILED' })

/**
 * Issue #838: `halt()`/`resume()` now ping a GitHub issue, best-effort, via
 * an injectable `HaltNotifyDeps` — see killswitch.ts's own comment on why.
 * Every test in this file that calls `halt`/`resume`/`checkBreakers` (which
 * calls `halt` internally) passes one explicitly rather than relying on the
 * production default (`defaultHaltNotifyDeps()`, a real `GitHubSink`) — this
 * suite must never make a real network call, the same reasoning
 * integrator.test.ts's own header comment gives for mocking `gh` there.
 *
 * `resolveDigestIssue: async () => undefined` is the inert default: exactly
 * what `ensureDigestIssue()` itself returns on any failure, so `halt()`/
 * `resume()` silently skip the ping — fast, deterministic, no I/O. Tests
 * that care about the ping's content use `recordingDeps()` instead.
 */
const inertNotifyDeps: HaltNotifyDeps = {
  resolveDigestIssue: async () => undefined,
  sink: {
    comment: async () => {},
    addLabel: async () => {},
    removeLabel: async () => {},
    listComments: async () => [],
    editComment: async () => {},
  },
}

function recordingSink(): WorkSink & { comments: { id: string; body: string }[]; edits: { id: string; body: string }[] } {
  const comments: { id: string; body: string }[] = []
  const edits: { id: string; body: string }[] = []
  return {
    comments,
    edits,
    comment: async (id: string, body: string) => { comments.push({ id, body }) },
    addLabel: async () => {},
    removeLabel: async () => {},
    listComments: async (): Promise<SinkComment[]> => [],
    editComment: async (id: string, body: string) => { edits.push({ id, body }) },
  }
}

const recordingDeps = (issueId = '999'): { deps: HaltNotifyDeps; sink: ReturnType<typeof recordingSink> } => {
  const sink = recordingSink()
  return { deps: { resolveDigestIssue: async () => issueId, sink }, sink }
}

afterEach(() => {
  for (const f of [HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE]) {
    try { rmSync(f) } catch { /* absent */ }
  }
})

describe('haltedOnGitHubFrom', () => {
  it('halts when an open issue carries the halt label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'OPEN' }])).toBe(true)
  })

  it('does not halt on a closed halt issue', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'CLOSED' }])).toBe(false)
  })

  it('does not halt on the title alone without the label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [], state: 'OPEN' }])).toBe(false)
  })

  it('fails OPEN on an unreadable response', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})

describe('halt / resume', () => {
  it('halt() makes haltedLocally true and leaves a readable reason', async () => {
    await halt('test halt reason', inertNotifyDeps)
    expect(haltedLocally()).toBe(true)
    expect(readFileSync(HALT_REASON_FILE, 'utf8').trim()).toBe('test halt reason')
  })

  it('resume() makes haltedLocally false', async () => {
    await halt('will be cleared', inertNotifyDeps)
    await resume(inertNotifyDeps)
    expect(haltedLocally()).toBe(false)
  })

  it('resume() writes a resumedAt within a second or two of Date.now()', async () => {
    const before = Date.now()
    await resume(inertNotifyDeps)
    const resumedAt = readResumedAt()
    const after = Date.now()
    expect(resumedAt).toBeGreaterThanOrEqual(before)
    expect(resumedAt).toBeLessThanOrEqual(after + 2000)
  })

  it('resume() actually clears a tripped failure streak — the guard this whole marker exists for', async () => {
    // Three failures old enough to predate the resume marker: without the
    // marker, these are still the newest records and the very next pass
    // would re-trip the breaker immediately. This is the assertion that
    // would catch resume() being a no-op that only looks like it worked.
    const rows = [failedAt(1), failedAt(2), failedAt(3)]
    await resume(inertNotifyDeps)
    const resumedAt = readResumedAt()
    expect(failureBreaker(rows, LIMITS, resumedAt)).toBeUndefined()
  })

  it('checkHalt() reports halted with a reason when the local file is present', async () => {
    await halt('local halt reason', inertNotifyDeps)
    const result = await checkHalt()
    expect(result.halted).toBe(true)
    expect(result.reason).toBe('local halt reason')
  })

  // Issue #838's "extra requirement": halt() must post a BLOCKED: comment
  // immediately, naming the reason and the literal resume command — not
  // just wait for the next twice-daily digest.
  it('halt() posts a BLOCKED comment naming the reason and the resume command', async () => {
    const { deps, sink } = recordingDeps()
    await halt('breaker tripped: too much of something', deps)
    expect(sink.comments).toHaveLength(1)
    expect(sink.comments[0]?.id).toBe('999')
    expect(sink.comments[0]?.body).toContain('BLOCKED: breaker tripped: too much of something')
    expect(sink.comments[0]?.body).toContain('llamenos-fleet resume')
  })

  it('resume() posts a RESUMED comment', async () => {
    const { deps, sink } = recordingDeps()
    await resume(deps)
    expect(sink.comments).toHaveLength(1)
    expect(sink.comments[0]?.body).toContain('RESUMED')
  })

  // Best-effort: a ping that cannot resolve or reach the issue must never
  // make halt()/resume() throw — their own file-based contract is what the
  // rest of the fleet depends on.
  it('halt() still completes its file-based contract when the ping fails outright', async () => {
    const throwingDeps: HaltNotifyDeps = {
      resolveDigestIssue: async () => { throw new Error('network is down') },
      sink: inertNotifyDeps.sink,
    }
    await expect(halt('reason', throwingDeps)).resolves.toBeUndefined()
    expect(haltedLocally()).toBe(true)
  })

  // The sync fs writes must happen the instant halt()/resume() is CALLED —
  // before the returned (best-effort) promise even needs to be awaited —
  // exactly like before this fix, when halt()/resume() were plain sync
  // functions. A regression to `async function halt()` that let the writes
  // happen after an `await` would break every caller that fires-and-forgets.
  it('the sync file writes happen before the returned promise is awaited', () => {
    const pending = halt('unawaited on purpose', inertNotifyDeps)
    expect(haltedLocally()).toBe(true)
    // Prevent an unhandled-rejection warning; the assertion above is the
    // actual point of this test.
    void pending
  })
})

describe('checkBreakers halting the fleet (issue #638)', () => {
  const r = (outcome: Outcome, ts: number, lane = 'backend'): RunRecord =>
    ({ ts, runId: 'x', lane, itemId: '1', itemName: 'n', engine: 'claude', outcome })
  const LIMITS: Limits = { maxDispatchesPerHour: 6, consecutiveFailuresToHalt: 3, quotaCooldownMs: 3_600_000 }

  it('a tripped rate breaker actually halts the fleet, naming itself in the reason', async () => {
    expect(haltedLocally()).toBe(false)
    const rows = Array.from({ length: 7 }, (_, i) => r('DISPATCHED', 1000 + i))
    const reason = await checkBreakers(rows, LIMITS, 2000, 0, inertNotifyDeps)
    expect(reason).toMatch(/dispatch rate/i)
    expect(haltedLocally()).toBe(true)
    expect(readFileSync(HALT_REASON_FILE, 'utf8')).toMatch(/rate breaker/i)
  })

  it('a tripped failure breaker actually halts the fleet, naming itself in the reason', async () => {
    expect(haltedLocally()).toBe(false)
    const rows = [r('FAILED', 1), r('TIMEOUT', 2), r('FAILED', 3)]
    const reason = await checkBreakers(rows, LIMITS, 100, 0, inertNotifyDeps)
    expect(reason).toMatch(/consecutive/i)
    expect(haltedLocally()).toBe(true)
    expect(readFileSync(HALT_REASON_FILE, 'utf8')).toMatch(/failure breaker/i)
  })

  it('does not halt when neither breaker trips', async () => {
    await checkBreakers([r('SUCCESS', 1)], LIMITS, 100, 0, inertNotifyDeps)
    expect(haltedLocally()).toBe(false)
  })

  // MUTATION GUARD: a version of checkBreakers that only returned the string
  // without calling halt() would still pass every rateBreaker/failureBreaker
  // unit test elsewhere (they call those pure functions directly, never
  // checkBreakers, and never inspect the halt file) — this is the only place
  // that regression would be caught.
  it('halting is a hard side effect of the trip itself, not merely incidental to logging', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => r('DISPATCHED', 1000 + i))
    await checkBreakers(rows, LIMITS, 2000, 0, inertNotifyDeps)
    expect(haltedLocally()).toBe(true) // read from the filesystem, not from checkBreakers' return value
  })

  // A tripped breaker's BLOCKED ping carries the breaker's own reason, not a
  // generic "halted" string — an operator reading the issue must be able to
  // tell a rate trip from a failure trip without opening a terminal.
  it('a tripped breaker\'s BLOCKED ping names the specific breaker that fired', async () => {
    const { deps, sink } = recordingDeps()
    const rows = Array.from({ length: 7 }, (_, i) => r('DISPATCHED', 1000 + i))
    await checkBreakers(rows, LIMITS, 2000, 0, deps)
    expect(sink.comments).toHaveLength(1)
    expect(sink.comments[0]?.body).toContain('BLOCKED: rate breaker tripped')
  })

  // Operator-facing half: doctor is the command a human actually runs to ask
  // "is this thing OK", and before this fix it unconditionally reported
  // "not halted" because nothing ever called halt() from a breaker trip.
  it('doctor reports the halt and the literal resume command once a breaker has tripped', async () => {
    await checkBreakers(Array.from({ length: 7 }, (_, i) => r('DISPATCHED', 1000 + i)), LIMITS, 2000, 0, inertNotifyDeps)
    const lines: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk))
      return true
    })
    try {
      await doctor()
    } finally {
      spy.mockRestore()
    }
    const output = lines.join('')
    expect(output).toMatch(/FAIL\s+not halted/)
    expect(output).toContain('rate breaker tripped')
    expect(output).toContain('llamenos-fleet resume')
  })
})

describe('readResumedAt', () => {
  it('returns 0 when the file is absent', () => {
    expect(readResumedAt()).toBe(0)
  })

  it('returns 0 when the file contains garbage', () => {
    mkdirSync(FLEET_DIR, { recursive: true })
    writeFileSync(RESUMED_AT_FILE, 'not-a-number')
    expect(readResumedAt()).toBe(0)
  })
})
