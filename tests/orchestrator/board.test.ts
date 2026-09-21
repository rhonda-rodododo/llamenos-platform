import { describe, it, expect, vi } from 'vitest'
import {
  buildBoard, classifyPr, classifyReviewFailure, isBotAuthor,
  normalizeCheckRunState, normalizeStatusContextState, renderBoard, renderBoardPorcelain,
  fetchBoardFactsWith,
  REQUIRED_CHEAP_CONTEXTS,
  type BoardFacts, type PrFact, type PrCheckContext, type FleetStateFact, type BoardFetchDeps,
} from '../../orchestrator/src/board.js'
import { VERIFY_JOB, REVIEW_JOB } from '../../orchestrator/src/ci.js'

const HEAD = 'head-sha-111'
const OTHER_SHA = 'stale-sha-999'

const FLEET_OK: FleetStateFact = { halted: false, isQuotaHalt: false }

/** Every cheap required context PASSing on the current head — the baseline
 *  every classification test starts from and overrides away from. */
function cheapPassChecks(sha = HEAD): PrCheckContext[] {
  return REQUIRED_CHEAP_CONTEXTS.map((name) => ({ name, kind: 'CheckRun', sha, state: 'PASS' }))
}

function pr(overrides: Partial<PrFact> = {}): PrFact {
  return {
    number: 1,
    authorLogin: 'someone',
    isDraft: false,
    createdAt: '2026-01-01T00:00:00Z',
    headRefOid: HEAD,
    headRefName: 'fleet/backend/1',
    mergeStateStatus: 'CLEAN',
    labels: [],
    reviewDecision: null,
    checks: cheapPassChecks(),
    ...overrides,
  }
}

function reviewCheck(overrides: Partial<PrCheckContext> = {}): PrCheckContext {
  return { name: REVIEW_JOB, kind: 'CheckRun', sha: HEAD, state: 'PASS', ...overrides }
}

const facts = (prs: PrFact[], fleet: FleetStateFact = FLEET_OK): BoardFacts => ({ fleet, prs })

describe('classifyReviewFailure', () => {
  it('is substantive when the step literally named "Review" failed', () => {
    expect(classifyReviewFailure([
      { name: 'Setup Bun', conclusion: 'success' },
      { name: 'Review', conclusion: 'failure' },
    ])).toBe('substantive')
  })

  it('is infrastructure when a setup step failed and Review never ran', () => {
    expect(classifyReviewFailure([
      { name: 'Install the non-author review engine', conclusion: 'failure' },
      { name: 'Review', conclusion: null },
    ])).toBe('infrastructure')
  })

  it('is infrastructure when there is no "Review" step in the list at all', () => {
    expect(classifyReviewFailure([{ name: 'Checkout the PR BASE (trusted)', conclusion: 'failure' }])).toBe('infrastructure')
  })

  // Mutation rail (mandatory, per the brief): treating every review failure
  // as infrastructure must be distinguishable from the real function — this
  // pins the one input where they disagree.
  it('disagrees with an always-infrastructure classifier on a Review-step failure', () => {
    const alwaysInfra = (): 'infrastructure' => 'infrastructure'
    const steps = [{ name: 'Review', conclusion: 'failure' }]
    expect(classifyReviewFailure(steps)).not.toBe(alwaysInfra())
  })
})

describe('isBotAuthor', () => {
  it.each(['app/dependabot', 'app/github-actions', 'dependabot[bot]', 'github-actions[bot]', 'some-app[bot]', 'app/whatever'])(
    'treats %s as a bot', (login) => { expect(isBotAuthor(login)).toBe(true) })
  it.each(['rhonda-rodododo', 'a-human'])('does not treat %s as a bot', (login) => { expect(isBotAuthor(login)).toBe(false) })
})

describe('normalizeCheckRunState', () => {
  it('is PENDING while not completed', () => { expect(normalizeCheckRunState('IN_PROGRESS', null)).toBe('PENDING') })
  it.each(['SUCCESS', 'SKIPPED', 'NEUTRAL'])('is PASS for a completed %s', (c) => {
    expect(normalizeCheckRunState('COMPLETED', c)).toBe('PASS')
  })
  it.each(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'])(
    'is FAIL for a completed %s', (c) => { expect(normalizeCheckRunState('COMPLETED', c)).toBe('FAIL') })
})

describe('normalizeStatusContextState', () => {
  it('is PASS for SUCCESS', () => { expect(normalizeStatusContextState('SUCCESS')).toBe('PASS') })
  it.each(['PENDING', 'EXPECTED'])('is PENDING for %s', (s) => { expect(normalizeStatusContextState(s)).toBe('PENDING') })
  it.each(['ERROR', 'FAILURE'])('is FAIL for %s', (s) => { expect(normalizeStatusContextState(s)).toBe('FAIL') })
})

describe('classifyPr — OPERATOR', () => {
  it('a draft is OPERATOR regardless of everything else', () => {
    expect(classifyPr(pr({ isDraft: true, checks: [] })).action).toBe('OPERATOR')
  })

  it('the knope release PR (branch "release", bot author) is OPERATOR', () => {
    expect(classifyPr(pr({ headRefName: 'release', authorLogin: 'app/github-actions' })).action).toBe('OPERATOR')
  })

  it('a human PR on a branch literally named "release" is NOT auto-classified OPERATOR by branch alone', () => {
    expect(classifyPr(pr({ headRefName: 'release', authorLogin: 'a-human', checks: [...cheapPassChecks(), reviewCheck()] })).action)
      .toBe('MERGE')
  })
})

describe('classifyPr — cheap required contexts', () => {
  it('NEEDS_FIX when a cheap context failed, and names it', () => {
    const result = classifyPr(pr({ checks: [{ name: VERIFY_JOB, kind: 'CheckRun', sha: HEAD, state: 'FAIL' }, { name: 'ci-status', kind: 'CheckRun', sha: HEAD, state: 'PASS' }] }))
    expect(result.action).toBe('NEEDS_FIX')
    expect(result.failingContexts).toContain(VERIFY_JOB)
  })

  it('WAITING when a cheap context is still pending', () => {
    const result = classifyPr(pr({ checks: [{ name: VERIFY_JOB, kind: 'CheckRun', sha: HEAD, state: 'PENDING' }, { name: 'ci-status', kind: 'CheckRun', sha: HEAD, state: 'PASS' }] }))
    expect(result.action).toBe('WAITING')
  })

  it('WAITING when a cheap context has not posted on this head at all', () => {
    const result = classifyPr(pr({ checks: [{ name: 'ci-status', kind: 'CheckRun', sha: HEAD, state: 'PASS' }] }))
    expect(result.action).toBe('WAITING')
  })
})

describe('classifyPr — fleet/review tree', () => {
  it('MERGE when review PASSes and author is not a bot', () => {
    expect(classifyPr(pr({ authorLogin: 'a-human', checks: [...cheapPassChecks(), reviewCheck()] })).action).toBe('MERGE')
  })

  it('APPROVE_THEN_MERGE for a bot author with no code-owner approval yet', () => {
    expect(classifyPr(pr({ authorLogin: 'app/dependabot', checks: [...cheapPassChecks(), reviewCheck()] })).action)
      .toBe('APPROVE_THEN_MERGE')
  })

  it('MERGE for a bot author that already carries a code-owner APPROVED decision', () => {
    expect(classifyPr(pr({
      authorLogin: 'app/dependabot', reviewDecision: 'APPROVED', checks: [...cheapPassChecks(), reviewCheck()],
    })).action).toBe('MERGE')
  })

  it('WAITING while fleet/review is in flight', () => {
    expect(classifyPr(pr({ checks: [...cheapPassChecks(), reviewCheck({ state: 'PENDING' })] })).action).toBe('WAITING')
  })

  it('STALE_LABEL when the "review" label is present but there is no verdict on this head', () => {
    const result = classifyPr(pr({ labels: ['review'], checks: cheapPassChecks() }))
    expect(result.action).toBe('STALE_LABEL')
  })

  it('RERUN_REVIEW for an infrastructure failure not yet retried', () => {
    const result = classifyPr(pr({
      checks: [...cheapPassChecks(), reviewCheck({ state: 'FAIL', reviewFailureKind: 'infrastructure', runAttempt: 1 })],
    }))
    expect(result.action).toBe('RERUN_REVIEW')
  })

  it('NEEDS_FIX for an infrastructure failure already retried once', () => {
    const result = classifyPr(pr({
      checks: [...cheapPassChecks(), reviewCheck({ state: 'FAIL', reviewFailureKind: 'infrastructure', runAttempt: 2 })],
    }))
    expect(result.action).toBe('NEEDS_FIX')
  })

  // Mandatory rail #2 (brief): a substantive review FAIL must never become
  // RERUN_REVIEW, regardless of run_attempt — auto-retrying a real verdict
  // would silently re-roll it instead of surfacing it to a human.
  it('NEEDS_FIX for a substantive review failure, never RERUN_REVIEW, even on the first attempt', () => {
    const result = classifyPr(pr({
      checks: [...cheapPassChecks(), reviewCheck({ state: 'FAIL', reviewFailureKind: 'substantive', runAttempt: 1 })],
    }))
    expect(result.action).toBe('NEEDS_FIX')
    expect(result.action).not.toBe('RERUN_REVIEW')
    expect(result.failingContexts).toContain(REVIEW_JOB)
  })
})

describe('classifyPr — the head-binding rule (mandatory rail #1, per the brief)', () => {
  // #862's own shape: a fleet/review SUCCESS was recorded, but against a SHA
  // that is not the PR's current head. It must never be treated as a live
  // MERGE-worthy verdict — it must read as if fleet/review were simply
  // ABSENT on this head, which (with no "review" label present) makes the
  // sole open PR a LABEL_FOR_REVIEW candidate, not a merge.
  it('a fleet/review PASS on a stale SHA is treated as ABSENT, not as a live PASS', () => {
    const staleReview = reviewCheck({ sha: OTHER_SHA, state: 'PASS' })
    const result = classifyPr(pr({ checks: [...cheapPassChecks(), staleReview] }))
    expect(result.action).not.toBe('MERGE')
    expect(result.action).not.toBe('APPROVE_THEN_MERGE')
    expect(result.action).toBe('LABEL_FOR_REVIEW_CANDIDATE')
  })

  it('the same PR, surfaced through buildBoard as the sole open PR, becomes LABEL_FOR_REVIEW — never MERGE', () => {
    const staleReview = reviewCheck({ sha: OTHER_SHA, state: 'PASS' })
    const view = buildBoard(facts([pr({ number: 862, checks: [...cheapPassChecks(), staleReview] })]))
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]?.action).toBe('LABEL_FOR_REVIEW')
  })

  it('a cheap context (ci-status) on a stale SHA is treated as missing, not as a live PASS', () => {
    const staleCiStatus: PrCheckContext = { name: 'ci-status', kind: 'CheckRun', sha: OTHER_SHA, state: 'PASS' }
    const verifyOnHead: PrCheckContext = { name: VERIFY_JOB, kind: 'CheckRun', sha: HEAD, state: 'PASS' }
    const result = classifyPr(pr({ checks: [staleCiStatus, verifyOnHead] }))
    expect(result.action).toBe('WAITING')
  })
})

describe('buildBoard — LABEL_FOR_REVIEW is capped to one per invocation', () => {
  it('picks exactly one, the OLDEST eligible by PR number, and defers the rest to WAITING', () => {
    const candidate = (n: number): PrFact => pr({ number: n, checks: cheapPassChecks() })
    const view = buildBoard(facts([candidate(50), candidate(12), candidate(99)]))

    const labelled = view.rows.filter((r) => r.action === 'LABEL_FOR_REVIEW')
    expect(labelled).toHaveLength(1)
    expect(labelled[0]?.number).toBe(12)

    const deferred = view.rows.filter((r) => r.number !== 12)
    expect(deferred.every((r) => r.action === 'WAITING')).toBe(true)
  })

  it('is a no-op cap when only one PR is eligible', () => {
    const view = buildBoard(facts([pr({ number: 7, checks: cheapPassChecks() })]))
    expect(view.rows.map((r) => r.action)).toEqual(['LABEL_FOR_REVIEW'])
  })
})

describe('buildBoard — totality', () => {
  it('every PR lands in exactly one row, and every action is one of the eight public actions', () => {
    const view = buildBoard(facts([
      pr({ number: 1, isDraft: true }),
      pr({ number: 2, checks: cheapPassChecks() }),
      pr({ number: 3, authorLogin: 'a-human', checks: [...cheapPassChecks(), reviewCheck()] }),
    ]))
    expect(view.rows).toHaveLength(3)
    const publicActions = new Set(['MERGE', 'APPROVE_THEN_MERGE', 'LABEL_FOR_REVIEW', 'RERUN_REVIEW', 'NEEDS_FIX', 'WAITING', 'STALE_LABEL', 'OPERATOR'])
    for (const row of view.rows) expect(publicActions.has(row.action)).toBe(true)
  })

  it('carries the fleet state through unchanged', () => {
    const halted: FleetStateFact = { halted: true, haltReason: 'engine quota exhausted (claude) — retry after 2026-01-01T00:00:00.000Z', isQuotaHalt: true }
    const view = buildBoard(facts([], halted))
    expect(view.fleet).toEqual(halted)
  })
})

describe('renderBoard', () => {
  it('groups by action and includes the fleet line', () => {
    const view = buildBoard(facts([pr({ number: 5, authorLogin: 'a-human', checks: [...cheapPassChecks(), reviewCheck()] })]))
    const out = renderBoard(view)
    expect(out).toContain('fleet: not halted')
    expect(out).toContain('## MERGE')
    expect(out).toContain('#5 @a-human')
  })

  it('says so when there are no open PRs', () => {
    expect(renderBoard(buildBoard(facts([])))).toContain('no open pull requests')
  })
})

describe('renderBoardPorcelain', () => {
  it('emits one unpadded pipe-delimited fleet line first, then one row per PR', () => {
    const view = buildBoard(facts([pr({ number: 9, authorLogin: 'a-human', checks: [...cheapPassChecks(), reviewCheck()] })]))
    const lines = renderBoardPorcelain(view).split('\n')
    expect(lines[0]?.startsWith('fleet|no|')).toBe(true)
    expect(lines).toHaveLength(2)
    const fields = lines[1]?.split('|') ?? []
    expect(fields[0]).toBe('9')
    expect(fields[1]).toBe('MERGE')
    expect(fields[2]).toBe('a-human')
  })

  it('never contains a padded/aligned column — porcelain rows are the raw join, no column(1) formatting', () => {
    const view = buildBoard(facts([pr({ number: 1, checks: cheapPassChecks() })]))
    const out = renderBoardPorcelain(view)
    expect(out).not.toMatch(/ {2,}/)
  })
})

describe('fetchBoardFactsWith', () => {
  const deps = (over: Partial<BoardFetchDeps> = {}): BoardFetchDeps => ({
    queryOpenPrs: vi.fn(async () => ({ data: { repository: { pullRequests: { nodes: [] } } } })),
    fetchRunJobs: vi.fn(async () => undefined),
    checkFleetHalt: vi.fn(async () => ({ halted: false })),
    ...over,
  })

  it('reads the fleet halt state through checkFleetHalt, not a re-implemented file read', async () => {
    const result = await fetchBoardFactsWith(deps({ checkFleetHalt: async () => ({ halted: true, reason: 'halted by hand' }) }))
    expect(result.fleet).toEqual({ halted: true, haltReason: 'halted by hand', isQuotaHalt: false })
  })

  it('classifies a QUOTA halt reason correctly', async () => {
    const reason = 'engine quota exhausted (claude) — retry after 2026-01-01T00:00:00.000Z'
    const result = await fetchBoardFactsWith(deps({ checkFleetHalt: async () => ({ halted: true, reason }) }))
    expect(result.fleet.isQuotaHalt).toBe(true)
  })

  it('maps a GraphQL PR node into a PrFact, with both CheckRun and StatusContext contexts normalized', async () => {
    const gqlDeps = deps({
      queryOpenPrs: async () => ({
        data: {
          repository: {
            pullRequests: {
              nodes: [{
                number: 41,
                author: { login: 'a-human' },
                isDraft: false,
                createdAt: '2026-01-01T00:00:00Z',
                headRefOid: HEAD,
                headRefName: 'fleet/backend/41',
                mergeStateStatus: 'CLEAN',
                reviewDecision: null,
                labels: { nodes: [{ name: 'agent-dispatchable' }] },
                commits: {
                  nodes: [{
                    commit: {
                      oid: HEAD,
                      statusCheckRollup: {
                        contexts: {
                          nodes: [
                            { __typename: 'CheckRun', name: 'ci-status', status: 'COMPLETED', conclusion: 'SUCCESS' },
                            { __typename: 'StatusContext', context: VERIFY_JOB, state: 'SUCCESS' },
                          ],
                        },
                      },
                    },
                  }],
                },
              }],
            },
          },
        },
      }),
    })
    const result = await fetchBoardFactsWith(gqlDeps)
    expect(result.prs).toHaveLength(1)
    const [pr0] = result.prs
    expect(pr0?.labels).toEqual(['agent-dispatchable'])
    expect(pr0?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ci-status', kind: 'CheckRun', state: 'PASS' }),
      expect.objectContaining({ name: VERIFY_JOB, kind: 'StatusContext', state: 'PASS' }),
    ]))
  })

  it('only calls fetchRunJobs for a FAILed fleet/review CheckRun, never for a passing or unrelated one', async () => {
    const fetchRunJobs = vi.fn(async () => ({ steps: [{ name: 'Review', conclusion: 'failure' as const }], runAttempt: 1 }))
    const gqlDeps = deps({
      fetchRunJobs,
      queryOpenPrs: async () => ({
        data: {
          repository: {
            pullRequests: {
              nodes: [{
                number: 1,
                author: { login: 'a-human' },
                isDraft: false,
                createdAt: '2026-01-01T00:00:00Z',
                headRefOid: HEAD,
                headRefName: 'fleet/backend/1',
                mergeStateStatus: 'CLEAN',
                reviewDecision: null,
                labels: { nodes: [] },
                commits: {
                  nodes: [{
                    commit: {
                      oid: HEAD,
                      statusCheckRollup: {
                        contexts: {
                          nodes: [
                            { __typename: 'CheckRun', name: 'ci-status', status: 'COMPLETED', conclusion: 'SUCCESS' },
                            {
                              __typename: 'CheckRun', name: REVIEW_JOB, status: 'COMPLETED', conclusion: 'FAILURE',
                              checkSuite: { workflowRun: { databaseId: 555 } },
                            },
                          ],
                        },
                      },
                    },
                  }],
                },
              }],
            },
          },
        },
      }),
    })
    const result = await fetchBoardFactsWith(gqlDeps)
    expect(fetchRunJobs).toHaveBeenCalledTimes(1)
    expect(fetchRunJobs).toHaveBeenCalledWith(555)
    const review = result.prs[0]?.checks.find((c) => c.name === REVIEW_JOB)
    expect(review?.reviewFailureKind).toBe('substantive')
    expect(review?.runAttempt).toBe(1)
  })

  it('an unreadable run is treated as an infrastructure failure, fail-safe toward "worth a retry"', async () => {
    const gqlDeps = deps({
      fetchRunJobs: async () => undefined,
      queryOpenPrs: async () => ({
        data: {
          repository: {
            pullRequests: {
              nodes: [{
                number: 2,
                author: { login: 'a-human' },
                isDraft: false,
                createdAt: '2026-01-01T00:00:00Z',
                headRefOid: HEAD,
                headRefName: 'fleet/backend/2',
                mergeStateStatus: 'CLEAN',
                reviewDecision: null,
                labels: { nodes: [] },
                commits: {
                  nodes: [{
                    commit: {
                      oid: HEAD,
                      statusCheckRollup: {
                        contexts: {
                          nodes: [{
                            __typename: 'CheckRun', name: REVIEW_JOB, status: 'COMPLETED', conclusion: 'FAILURE',
                            checkSuite: { workflowRun: { databaseId: 777 } },
                          }],
                        },
                      },
                    },
                  }],
                },
              }],
            },
          },
        },
      }),
    })
    const result = await fetchBoardFactsWith(gqlDeps)
    const review = result.prs[0]?.checks.find((c) => c.name === REVIEW_JOB)
    expect(review?.reviewFailureKind).toBe('infrastructure')
  })
})
