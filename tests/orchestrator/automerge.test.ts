import { describe, it, expect, vi } from 'vitest'
import {
  shouldStandardAutoMerge,
  isFleetOwnedBranch,
  armStandardAutoMergeAtOpen,
  EXCLUDE_RELEASE_PR_FROM_STANDARD_AUTO_MERGE,
} from '../../orchestrator/src/automerge.js'
import { KNOPE_RELEASE_BRANCH } from '../../orchestrator/src/roles/release.js'

describe('EXCLUDE_RELEASE_PR_FROM_STANDARD_AUTO_MERGE — the switch itself', () => {
  it('defaults to OFF: release PRs auto-merge today', () => {
    expect(EXCLUDE_RELEASE_PR_FROM_STANDARD_AUTO_MERGE).toBe(false)
  })
})

describe('isFleetOwnedBranch — scope fence, independent of the release switch', () => {
  it('recognizes a fleet-dispatched branch', () => {
    expect(isFleetOwnedBranch('fleet/backend/123')).toBe(true)
  })

  it('recognizes the knope release branch', () => {
    expect(isFleetOwnedBranch(KNOPE_RELEASE_BRANCH)).toBe(true)
  })

  it('refuses a human or ad hoc branch this module has no business touching', () => {
    expect(isFleetOwnedBranch('my-personal-feature')).toBe(false)
    expect(isFleetOwnedBranch('ll-auto-merge-standard')).toBe(false)
  })
})

describe('shouldStandardAutoMerge — the rail (switch tested in BOTH positions)', () => {
  it('switch OFF (today\'s default): the release PR gets standard auto-merge', () => {
    expect(shouldStandardAutoMerge(KNOPE_RELEASE_BRANCH, false)).toBe(true)
  })

  it('switch OFF: an ordinary fleet branch also gets standard auto-merge', () => {
    expect(shouldStandardAutoMerge('fleet/desktop/742', false)).toBe(true)
  })

  it('switch ON: the release PR does NOT get standard auto-merge', () => {
    expect(shouldStandardAutoMerge(KNOPE_RELEASE_BRANCH, true)).toBe(false)
  })

  it('switch ON: an ordinary fleet branch still gets standard auto-merge', () => {
    expect(shouldStandardAutoMerge('fleet/desktop/742', true)).toBe(true)
  })

  it('a branch outside fleet ownership never gets it, regardless of the switch', () => {
    expect(shouldStandardAutoMerge('some-humans-branch', false)).toBe(false)
    expect(shouldStandardAutoMerge('some-humans-branch', true)).toBe(false)
  })

  it('MUTATION GUARD: a switch that ignores its input fails at least one of the two positions above', () => {
    // A mutant that hardcodes the exclusion check to `false` (i.e. always
    // treats the switch as OFF) still passes every "switch OFF" test above,
    // but must fail this one: with the switch forced ON, the release PR
    // must be excluded.
    const brokenAlwaysOff = (headRefName: string): boolean => shouldStandardAutoMerge(headRefName, false)
    expect(brokenAlwaysOff(KNOPE_RELEASE_BRANCH)).toBe(true) // matches switch-OFF behavior
    // The real function, called with the switch actually ON, must differ
    // from the always-OFF mutant's behavior on the one input that matters:
    expect(shouldStandardAutoMerge(KNOPE_RELEASE_BRANCH, true)).not.toBe(brokenAlwaysOff(KNOPE_RELEASE_BRANCH))

    // Symmetric check: a mutant that hardcodes the switch to always-ON
    // still passes every "switch ON" test above, but must fail this one:
    // with the switch actually OFF, the release PR must be included.
    const brokenAlwaysOn = (headRefName: string): boolean => shouldStandardAutoMerge(headRefName, true)
    expect(brokenAlwaysOn(KNOPE_RELEASE_BRANCH)).toBe(false) // matches switch-ON behavior
    expect(shouldStandardAutoMerge(KNOPE_RELEASE_BRANCH, false)).not.toBe(brokenAlwaysOn(KNOPE_RELEASE_BRANCH))
  })
})

describe('armStandardAutoMergeAtOpen — the one production call site', () => {
  it('requests auto-merge for a fresh fleet PR', async () => {
    const enableAutoMerge = vi.fn(async () => {})
    const log = vi.fn()
    await armStandardAutoMergeAtOpen(
      { pr: '123', headRefName: 'fleet/backend/45', branchMismatch: undefined },
      { enableAutoMerge, log },
    )
    expect(enableAutoMerge).toHaveBeenCalledWith('123')
    expect(log.mock.calls.some(([msg]) => /requested standard auto-merge/.test(msg))).toBe(true)
  })

  it('does nothing when there is no PR yet', async () => {
    const enableAutoMerge = vi.fn(async () => {})
    const log = vi.fn()
    await armStandardAutoMergeAtOpen(
      { pr: undefined, headRefName: 'fleet/backend/45', branchMismatch: undefined },
      { enableAutoMerge, log },
    )
    expect(enableAutoMerge).not.toHaveBeenCalled()
  })

  it('never requests auto-merge on a branch-mismatched PR', async () => {
    const enableAutoMerge = vi.fn(async () => {})
    const log = vi.fn()
    await armStandardAutoMergeAtOpen(
      { pr: '123', headRefName: 'fleet/backend/45', branchMismatch: 'some-other-branch' },
      { enableAutoMerge, log },
    )
    expect(enableAutoMerge).not.toHaveBeenCalled()
  })

  it('is best-effort: a throwing enableAutoMerge is caught and logged, never rethrown', async () => {
    const enableAutoMerge = vi.fn(async () => { throw new Error('gh unreachable') })
    const log = vi.fn()
    await expect(
      armStandardAutoMergeAtOpen(
        { pr: '123', headRefName: 'fleet/backend/45', branchMismatch: undefined },
        { enableAutoMerge, log },
      ),
    ).resolves.toBeUndefined()
    expect(log.mock.calls.some(([msg]) => /could not request standard auto-merge/.test(msg))).toBe(true)
  })
})
