import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  rejectionHistogram,
  outcomeHistogram,
  waitingOnHuman,
  renderDigest,
  computeBanner,
  resumeCommand,
  commandExecutablePath,
  commandExecutableExists,
  type DigestInput,
} from '../../orchestrator/src/digest.js'
import { notify, sinksFromEnv, type NotifySink } from '../../orchestrator/src/notify.js'
import type { RunRecord, Outcome } from '../../orchestrator/src/ledger.js'
import type { DependencyReport } from '../../orchestrator/src/dependency.js'

const REPO_ROOT = join(import.meta.dirname, '..', '..')

const r = (outcome: Outcome, ts: number, itemId = '1', overrides: Partial<RunRecord> = {}): RunRecord =>
  ({ ts, runId: `run-${ts}`, lane: 'backend', itemId, itemName: `item ${itemId}`, engine: 'claude', outcome, ...overrides })

const DEP_OK: DependencyReport = { ok: true, problems: [], commit: 'abc123' }

describe('rejectionHistogram', () => {
  it('dedupes by item so one item counts once', () => {
    const h = rejectionHistogram([
      { id: '1', reason: 'other-lane' }, { id: '1', reason: 'other-lane' },
      { id: '1', reason: 'body-too-short' },
    ])
    expect(h.reduce((n, r) => n + r.count, 0)).toBe(1)
  })

  it('reports the most specific reason, not other-lane', () => {
    const h = rejectionHistogram([{ id: '1', reason: 'other-lane' }, { id: '1', reason: 'vetoed' }])
    expect(h[0]?.reason).toBe('vetoed')
  })

  it('omits an item whose only reason is other-lane', () => {
    expect(rejectionHistogram([{ id: '1', reason: 'other-lane' }])).toEqual([])
  })

  it('the issue #641 scenario: 17 rejections over 3 items reduces to at most 3 entries total count', () => {
    // Every lane (6 of them) rejects every item not its own as other-lane;
    // one item also gets a real reason from its own lane.
    const rejections: { id: string; reason: 'other-lane' | 'vetoed' | 'body-too-short' }[] = []
    for (const id of ['1', '2', '3']) {
      for (let lane = 0; lane < 6; lane++) rejections.push({ id, reason: 'other-lane' })
    }
    rejections.push({ id: '2', reason: 'vetoed' })
    rejections.push({ id: '3', reason: 'body-too-short' })
    const h = rejectionHistogram(rejections)
    const total = h.reduce((n, x) => n + x.count, 0)
    expect(total).toBe(2) // item 1 drops out entirely; items 2 and 3 count once each
    expect(h.find((x) => x.reason === 'vetoed')?.count).toBe(1)
    expect(h.find((x) => x.reason === 'body-too-short')?.count).toBe(1)
    expect(h.some((x) => (x.reason as string) === 'other-lane')).toBe(false)
  })

  it('is empty for no rejections', () => {
    expect(rejectionHistogram([])).toEqual([])
  })
})

describe('outcomeHistogram', () => {
  it('counts runs by outcome', () => {
    const h = outcomeHistogram([r('SUCCESS', 1), r('SUCCESS', 2), r('FAILED', 3)])
    expect(h.find((x) => x.reason === 'SUCCESS')?.count).toBe(2)
    expect(h.find((x) => x.reason === 'FAILED')?.count).toBe(1)
  })
})

describe('waitingOnHuman', () => {
  it('lists BLOCKED items, deduped to their most recent row', () => {
    const rows = [r('BLOCKED', 1, 'a'), r('BLOCKED', 5, 'a'), r('FAILED', 2, 'b'), r('BLOCKED', 3, 'c')]
    const waiting = waitingOnHuman(rows)
    expect(waiting.map((x) => x.itemId).sort()).toEqual(['a', 'c'])
    expect(waiting.find((x) => x.itemId === 'a')?.ts).toBe(5)
  })

  // G1: SUCCESS is a CANDIDATE too — since the redesign, a SUCCESS row no
  // longer implies "merged" (ledger.ts's module comment), so it can be
  // either a clean auto-merge or a claimed success the fleet could not
  // verify and left for a human. `waitingOnHuman` alone cannot tell those
  // apart (it does no I/O) — `runDigest` (cli.ts) resolves the difference
  // with a live `gh` query before this candidate list becomes the digest's
  // actual "Waiting on a human" section.
  it('lists SUCCESS as a candidate too, since SUCCESS no longer implies merged', () => {
    expect(waitingOnHuman([r('SUCCESS', 1, 'a')]).map((x) => x.itemId)).toEqual(['a'])
  })

  it('is empty when nothing is blocked or a claimed success', () => {
    expect(waitingOnHuman([r('FAILED', 1), r('REJECTED', 2), r('TIMEOUT', 3)])).toEqual([])
  })

  // Issue #870: UNVERIFIED means the fleet's own verification pipeline could
  // not reach a verdict on an otherwise-open PR — exactly the shape this
  // section exists to surface, alongside SUCCESS and BLOCKED.
  it('lists UNVERIFIED as a candidate — a verification gap still leaves a PR waiting on a human', () => {
    expect(waitingOnHuman([r('UNVERIFIED', 1, 'a')]).map((x) => x.itemId)).toEqual(['a'])
  })
})

describe('resume command', () => {
  it('resolves to a real, executable file on disk — not a string that merely matches a constant', () => {
    const cmd = resumeCommand(REPO_ROOT)
    const path = commandExecutablePath(cmd)
    // Prove the assertion actually inspects the filesystem: a path that
    // matches the command's own shape but does not exist must fail this
    // same check, otherwise the test could pass on a typo'd or deleted script.
    expect(existsSync(path)).toBe(true)
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0)
    expect(commandExecutableExists(cmd)).toBe(true)
  })

  it('reports false for a command whose executable does not exist', () => {
    expect(commandExecutableExists(`${join(REPO_ROOT, 'orchestrator', 'bin', 'does-not-exist')} resume`)).toBe(false)
  })

  it('the digest renders this exact resume command in the halt banner', () => {
    const cmd = resumeCommand(REPO_ROOT)
    const input: DigestInput = {
      halted: true,
      haltReason: 'failure breaker tripped: 3 consecutive failures since last success',
      resumeCommand: cmd,
      lanes: [{ id: 'backend', mode: 'live' }],
      recentRuns: [],
      awaitingHuman: [],
      rejections: [],
      dependency: DEP_OK,
    }
    const out = renderDigest(input)
    expect(out).toContain('HALTED')
    expect(out).toContain(cmd)
    expect(commandExecutableExists(cmd)).toBe(true)
  })
})

describe('renderDigest', () => {
  const baseInput: DigestInput = {
    halted: false,
    resumeCommand: resumeCommand(REPO_ROOT),
    lanes: [{ id: 'backend', mode: 'live' }, { id: 'ios', mode: 'off' }],
    recentRuns: [r('SUCCESS', 1000, 'a'), r('BLOCKED', 2000, 'b')],
    // G1: renderDigest renders whatever the caller already resolved live —
    // it does not derive this from recentRuns itself. See runDigest (cli.ts).
    awaitingHuman: [r('BLOCKED', 2000, 'b')],
    rejections: [{ id: 'c', reason: 'other-lane' }, { id: 'd', reason: 'vetoed' }],
    dependency: DEP_OK,
  }

  it('does not print a halt banner when not halted', () => {
    const out = renderDigest(baseInput)
    expect(out).not.toContain('HALTED')
  })

  it('lists lane modes', () => {
    const out = renderDigest(baseInput)
    expect(out).toContain('backend: live')
    expect(out).toContain('ios: off')
  })

  it('includes the deduped rejection histogram, not a raw rejection count', () => {
    const out = renderDigest(baseInput)
    expect(out).toContain('Not picked up (1)') // "d" (vetoed); "c" is other-lane-only and dropped
    expect(out).toContain('vetoed: 1')
  })

  it('includes what is waiting on a human', () => {
    const out = renderDigest(baseInput)
    expect(out).toContain('Waiting on a human')
    expect(out).toContain('backend/b')
  })

  it('surfaces dispatch dependency problems prominently, never hiding them behind a quiet digest', () => {
    const broken: DependencyReport = { ok: false, problems: ['dispatch script is not executable: /x'], commit: undefined }
    const out = renderDigest({ ...baseInput, dependency: broken })
    expect(out).toContain('PROBLEM: dispatch script is not executable')
    expect(out).toContain('ok: no')
  })

  // K1: reproduces the reviewer's realistic case — a broken dispatch
  // dependency with an otherwise-empty pass must not read as a quiet night.
  // Before this fix, the failure appeared only as the LAST of six sections,
  // at the same visual weight as five "(none)" sections above it.
  describe('degraded banner (K1)', () => {
    const broken: DependencyReport = { ok: false, problems: ['dispatch script is not executable: /x'], commit: undefined }
    const quietBrokenInput: DigestInput = {
      halted: false,
      resumeCommand: resumeCommand(REPO_ROOT),
      lanes: [{ id: 'backend', mode: 'live' }],
      recentRuns: [],
      awaitingHuman: [],
      rejections: [],
      dependency: broken,
    }

    it('a failed dependency with no halt leads with a degraded banner', () => {
      const out = renderDigest(quietBrokenInput)
      expect(out.startsWith('# ⚠️ FLEET DEGRADED')).toBe(true)
      expect(computeBanner(quietBrokenInput).level).toBe('degraded')
    })

    it('the problem text appears above the per-section body, not only in the trailing dependency section', () => {
      const out = renderDigest(quietBrokenInput)
      const bannerIdx = out.indexOf('FLEET DEGRADED')
      const laneSectionIdx = out.indexOf('## Lane modes')
      const dependencySectionIdx = out.indexOf('## Dispatch dependency')
      expect(bannerIdx).toBeGreaterThanOrEqual(0)
      expect(bannerIdx).toBeLessThan(laneSectionIdx)
      // The banner itself names the problem, not just a generic warning —
      // an operator reading only the first line still learns what's broken.
      expect(out.slice(bannerIdx, laneSectionIdx)).toContain('dispatch dependency is broken')
      expect(dependencySectionIdx).toBeGreaterThan(laneSectionIdx)
    })

    it('a genuinely quiet, healthy pass still renders the plain title with no banner', () => {
      const healthy: DigestInput = { ...quietBrokenInput, dependency: DEP_OK }
      const out = renderDigest(healthy)
      expect(out.startsWith('# Fleet digest')).toBe(true)
      expect(out).not.toContain('DEGRADED')
      expect(out).not.toContain('HALTED')
      expect(computeBanner(healthy).level).toBe('ok')
    })

    it('halted always wins over degraded — a halted fleet needs the resume instruction, not a generic warning', () => {
      const haltedAndBroken: DigestInput = { ...quietBrokenInput, halted: true, haltReason: 'rate breaker tripped' }
      const banner = computeBanner(haltedAndBroken)
      expect(banner.level).toBe('halted')
      expect(banner.text).toContain('HALTED')
      expect(banner.text).toContain(quietBrokenInput.resumeCommand)
    })

    it('an unreadable lane source also degrades the digest even when the dependency is healthy', () => {
      const input: DigestInput = { ...quietBrokenInput, dependency: DEP_OK, sourceUnreadable: true }
      const out = renderDigest(input)
      expect(out.startsWith('# ⚠️ FLEET DEGRADED')).toBe(true)
      expect(out).toContain('source could not be read')
    })
  })

  // Issue #817: a quota-shaped halt is self-healing (tick.ts clears it on its
  // own once the embedded reset time passes) — it must never render as the
  // same "🛑 FLEET HALTED / run resume" banner a human-declared halt gets,
  // which would send an operator to run a command the condition does not
  // need. Real 2026-09-18/19 evidence: the fleet sat halted on
  // "failure breaker tripped: 7 consecutive failures" (then again "3
  // consecutive failures") for hours with nobody told it was just a quota
  // window, not a broken fleet.
  describe('quota-exhaustion halt renders degraded, not halted (issue #817)', () => {
    const quotaInput: DigestInput = {
      halted: true,
      haltReason: 'engine quota exhausted (opencode) — retry after 2026-09-19T06:30:00.000Z',
      resumeCommand: resumeCommand(REPO_ROOT),
      lanes: [{ id: 'android', mode: 'live' }],
      recentRuns: [],
      awaitingHuman: [],
      rejections: [],
      dependency: DEP_OK,
    }

    it('renders a degraded banner naming the engine and the resume time, not a halted one', () => {
      const banner = computeBanner(quotaInput)
      expect(banner.level).toBe('degraded')
      expect(banner.text).toContain('degraded — engine quota exhausted until 2026-09-19T06:30:00.000Z')
      expect(banner.text).not.toContain('HALTED')
    })

    it('the full digest never tells the operator to run resume for this condition', () => {
      const out = renderDigest(quotaInput)
      expect(out.startsWith('# ⚠️ FLEET DEGRADED')).toBe(true)
      expect(out).not.toContain(quotaInput.resumeCommand)
    })

    it('a human-declared halt with an unrelated reason still renders the ordinary HALTED banner', () => {
      const humanHalt: DigestInput = { ...quotaInput, haltReason: 'halted by hand' }
      const banner = computeBanner(humanHalt)
      expect(banner.level).toBe('halted')
      expect(banner.text).toContain('HALTED')
      expect(banner.text).toContain(quotaInput.resumeCommand)
    })
  })

  it('surfaces the dependency HEAD commit', () => {
    const out = renderDigest(baseInput)
    expect(out).toContain('abc123')
  })

  it('a quiet digest (no runs, no rejections, no problems) says so rather than omitting the sections', () => {
    const out = renderDigest({
      halted: false,
      resumeCommand: resumeCommand(REPO_ROOT),
      lanes: [{ id: 'backend', mode: 'live' }],
      recentRuns: [],
      awaitingHuman: [],
      rejections: [],
      dependency: DEP_OK,
    })
    expect(out).toContain('Not picked up (0)')
    expect(out.toLowerCase()).toContain('none')
  })
})

describe('notify', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is a success with no configured sinks — the digest being printed is the delivery', async () => {
    const res = await notify('subject', 'body', [])
    expect(res.attempted).toBe(0)
    expect(res.ok).toBe(true)
  })

  it('fans out to every sink and never throws even when a sink fails', async () => {
    const ok = vi.fn<NotifySink>().mockResolvedValue(undefined)
    const bad = vi.fn<NotifySink>().mockImplementation(() => { throw new Error('sink boom') })
    const res = await notify('subject', 'body', [ok, bad])
    expect(ok).toHaveBeenCalledWith('subject', 'body')
    expect(bad).toHaveBeenCalled()
    expect(res.attempted).toBe(2)
    expect(res.succeeded).toBe(1)
    expect(res.errors).toHaveLength(1)
    expect(res.ok).toBe(false)
  })

  it('a rejected async sink is also caught, not thrown', async () => {
    const rejecting = vi.fn<NotifySink>().mockRejectedValue(new Error('async boom'))
    await expect(notify('s', 'b', [rejecting])).resolves.toMatchObject({ attempted: 1, succeeded: 0, ok: false })
  })

  it('sinksFromEnv reads no sinks from an empty environment', () => {
    expect(sinksFromEnv({})).toHaveLength(0)
  })

  it('sinksFromEnv wires a command sink when FLEET_NOTIFY_COMMAND is set', () => {
    expect(sinksFromEnv({ FLEET_NOTIFY_COMMAND: '/bin/true' })).toHaveLength(1)
  })

  it('sinksFromEnv wires a webhook sink when FLEET_NOTIFY_WEBHOOK_URL is set', () => {
    expect(sinksFromEnv({ FLEET_NOTIFY_WEBHOOK_URL: 'https://example.invalid/hook' })).toHaveLength(1)
  })

  it('wires both sinks independently', () => {
    expect(sinksFromEnv({ FLEET_NOTIFY_COMMAND: '/bin/true', FLEET_NOTIFY_WEBHOOK_URL: 'https://example.invalid/hook' })).toHaveLength(2)
  })
})
