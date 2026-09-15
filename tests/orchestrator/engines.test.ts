import { describe, it, expect } from 'vitest'
import { statusToOutcome, parseStatusFile, buildArgs, isTerminalStatus, resolveDispatchModel } from '../../orchestrator/src/engines.js'
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
    expect(buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toContain('--agent')
    expect(buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toContain('backend-supervisor')
  })
  it('passes the lane scope as --owns, comma separated', () => {
    const a = buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a[a.indexOf('--owns') + 1]).toBe('apps/worker/,sip-bridge/')
  })
  it('refuses to build args for a lane with an empty scope', () => {
    const bare = { ...lane, scope: { owned: [], notOwned: [] } }
    expect(() => buildArgs({ name: 'n', briefPath: '/b', lane: bare, timeoutSec: 60, model: 'sonnet', effort: 'medium' }))
      .toThrow(/scope/i)
  })
  it('always injects the llamenos project rules', () => {
    const a = buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a[a.indexOf('--rules') + 1]).toBe('llamenos')
  })
  it('passes name, brief path, timeout and model as positionals after the flags', () => {
    const a = buildArgs({ name: 'n', briefPath: '/b', lane, timeoutSec: 60, model: 'sonnet', effort: 'medium' })
    expect(a.slice(-4)).toEqual(['n', '/b', '60', 'sonnet'])
  })
})

describe('buildArgs with an opencode lane', () => {
  const ocLane: Lane = {
    id: 'backend', mode: 'live', cap: 1, engine: 'opencode',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned: ['apps/worker/'], notOwned: [] },
  }
  const req = { name: 'n', briefPath: '/b', timeoutSec: 60, effort: 'high' as const }

  it('omits --effort entirely (dispatch-one.sh only warns and ignores it for opencode)', () => {
    const a = buildArgs({ ...req, lane: ocLane, model: 'kimi' })
    expect(a).not.toContain('--effort')
  })

  it('still passes --effort for a claude lane', () => {
    const a = buildArgs({ ...req, lane: { ...ocLane, engine: 'claude' }, model: 'sonnet' })
    expect(a[a.indexOf('--effort') + 1]).toBe('high')
  })

  it('passes the lane model through as the final positional argument', () => {
    const a = buildArgs({ ...req, lane: ocLane, model: 'kimi-thinking' })
    expect(a[a.length - 1]).toBe('kimi-thinking')
    expect(a.slice(-4)).toEqual(['n', '/b', '60', 'kimi-thinking'])
  })

  it('maps the raw kimi registry model id to the dispatcher\'s kimi token', () => {
    const a = buildArgs({ ...req, lane: ocLane, model: 'kimi-for-coding/k3-256k' })
    expect(a[a.length - 1]).toBe('kimi')
  })

  it('wraps any other raw provider/model id as opencode:<model>', () => {
    const a = buildArgs({ ...req, lane: ocLane, model: 'zai-coding-plan/glm-4.6' })
    expect(a[a.length - 1]).toBe('opencode:zai-coding-plan/glm-4.6')
  })

  it('passes existing dispatcher tokens through untouched', () => {
    for (const token of ['kimi', 'kimi-thinking', 'opencode:foo/bar', 'glm', 'glm:glm-5.3-flash', 'copilot', 'copilot:gpt-5.4', 'kimi-cli', 'kimi-cli:kimi-code/kimi-for-coding']) {
      const a = buildArgs({ ...req, lane: ocLane, model: token })
      expect(a[a.length - 1]).toBe(token)
    }
  })
})

describe('resolveDispatchModel', () => {
  it('leaves claude-engine models untouched', () => {
    expect(resolveDispatchModel('claude', 'sonnet')).toBe('sonnet')
    expect(resolveDispatchModel('claude', 'opus')).toBe('opus')
  })

  it('maps the kimi registry id to the kimi token for the opencode engine', () => {
    expect(resolveDispatchModel('opencode', 'kimi-for-coding/k3-256k')).toBe('kimi')
  })

  it('wraps unknown raw ids as opencode:<model>', () => {
    expect(resolveDispatchModel('opencode', 'some-provider/some-model')).toBe('opencode:some-provider/some-model')
  })

  it('does not double-wrap a model that is already a dispatcher token', () => {
    expect(resolveDispatchModel('opencode', 'opencode:some-provider/some-model')).toBe('opencode:some-provider/some-model')
    expect(resolveDispatchModel('opencode', 'kimi-thinking')).toBe('kimi-thinking')
  })
})
