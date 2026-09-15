import { describe, it, expect } from 'vitest'
import { statusToOutcome, parseStatusFile, buildArgs, isTerminalStatus } from '../../orchestrator/src/engines.js'
import { itemIdFromBranch, laneIdFromBranch } from '../../orchestrator/src/ci.js'
import type { Lane } from '../../orchestrator/src/config.js'

describe('parseStatusFile', () => {
  it('parses the key: value protocol', () => {
    const r = parseStatusFile('session: x\nstatus: SUCCESS\npr: 42\nduration_sec: 10\nnotes: did the thing\n')
    expect(r['status']).toBe('SUCCESS')
    expect(r['pr']).toBe('42')
    expect(r['notes']).toBe('did the thing')
  })
  it('keeps colons inside a value', () => {
    expect(parseStatusFile('notes: fixed a: b mapping')['notes']).toBe('fixed a: b mapping')
  })
  it('tolerates a truncated final line', () => {
    expect(parseStatusFile('status: SUCCESS\npr')['status']).toBe('SUCCESS')
  })
})

describe('statusToOutcome', () => {
  it.each([
    ['SUCCESS', 'SUCCESS'], ['BLOCKED', 'BLOCKED'], ['FAILED', 'FAILED'],
    ['NEEDS_CONTEXT', 'BLOCKED'], ['PARTIAL', 'BLOCKED'],
  ])('maps %s to %s', (s, o) => expect(statusToOutcome(s)).toBe(o))

  it('maps a non-terminal status to FAILED rather than guessing success', () => {
    expect(statusToOutcome('IN_PROGRESS')).toBe('FAILED')
    expect(statusToOutcome('DISPATCHED')).toBe('FAILED')
  })

  it('maps an unknown status to FAILED', () => {
    expect(statusToOutcome('WAT')).toBe('FAILED')
  })

  // The launcher footer in dispatch-one.sh writes UNCONFIRMED when the
  // runtime exits cleanly but the worker never wrote a terminal status
  // itself. It must map to FAILED, not SUCCESS.
  it('maps UNCONFIRMED to FAILED', () => {
    expect(statusToOutcome('UNCONFIRMED')).toBe('FAILED')
  })
})

// dispatch-one.sh's full status vocabulary (audited directly against the
// script — see the comment on TERMINAL_STATUSES in engines.ts). Every value
// the script can write to a .status file's `status:` key must be classified
// here explicitly, so a value the poll loop fails to recognize as terminal
// — which costs a capped lane its full dispatch timeout waiting on a worker
// that already finished — is a unit-test failure, not a production incident.
describe('isTerminalStatus', () => {
  it.each(['SUCCESS', 'BLOCKED', 'FAILED', 'PARTIAL', 'NEEDS_CONTEXT', 'UNCONFIRMED'])(
    'treats %s as terminal', (s) => expect(isTerminalStatus(s)).toBe(true))

  it.each(['DISPATCHED', 'IN_PROGRESS', 'WAT'])(
    'does not treat %s as terminal', (s) => expect(isTerminalStatus(s)).toBe(false))
})

describe('buildArgs', () => {
  const lane: Lane = {
    id: 'backend', mode: 'live', cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned: ['apps/worker/', 'sip-bridge/'], notOwned: [] },
  }
  it('passes the lane supervisor as --agent', () => {
    expect(buildArgs({ name: 'n', itemId: '704', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toContain('--agent')
    expect(buildArgs({ name: 'n', itemId: '704', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toContain('backend-supervisor')
  })
  it('passes the lane scope as --owns, comma separated', () => {
    const a = buildArgs({ name: 'n', itemId: '704', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a[a.indexOf('--owns') + 1]).toBe('apps/worker/,sip-bridge/')
  })
  it('refuses to build args for a lane with an empty scope', () => {
    const bare = { ...lane, scope: { owned: [], notOwned: [] } }
    expect(() => buildArgs({ name: 'n', itemId: '704', briefPath: '/b', lane: bare, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toThrow(/scope/i)
  })
  it('always injects the llamenos project rules', () => {
    const a = buildArgs({ name: 'n', itemId: '704', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a[a.indexOf('--rules') + 1]).toBe('llamenos')
  })
  // Issue #812: without --branch, dispatch-one.sh cuts the worktree on the
  // worker NAME (`fleet-backend-704`), which the fleet's own branch grammar
  // does not recognise — verify is skipped and CI treats the PR as unscoped.
  // Dropping the flag (mutation) fails this test: indexOf misses and the
  // branch assertions below never see the grammar.
  it('passes --branch fleet/<lane>/<item> on every dispatch', () => {
    const a = buildArgs({ name: 'fleet-backend-704', itemId: '704', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a).toContain('--branch')
    const branch = a[a.indexOf('--branch') + 1] ?? ''
    expect(branch).toBe('fleet/backend/704')
    expect(laneIdFromBranch(branch)).toBe('backend')
    expect(itemIdFromBranch(branch)).toBe('704')
  })
  it('refuses to build a branch the fleet grammar cannot read back', () => {
    expect(() => buildArgs({ name: 'n', itemId: '7/04', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toThrow(/fleet branch/)
  })
  it('passes name, brief path, timeout and model as positionals after the flags', () => {
    const a = buildArgs({ name: 'n', itemId: '704', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a.slice(-4)).toEqual(['n', '/b', '60', 'sonnet'])
  })
})
