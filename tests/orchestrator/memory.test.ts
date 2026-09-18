import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadContracts, contractsFor, augmentBrief, buildMemoryContext,
  type Contract,
} from '../../orchestrator/src/memory.js'
import { buildBrief, renderBrief, type Brief } from '../../orchestrator/src/brief.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'
import type { RunRecord } from '../../orchestrator/src/ledger.js'

const dirs: string[] = []
function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-memory-test-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d) rmSync(d, { recursive: true, force: true })
  }
})

function writeContract(repoRoot: string, filename: string, contents: string): void {
  const dir = join(repoRoot, '.claude', 'coordination', 'contracts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, filename), contents)
}

const HUB_KEY_CONTRACT = `---
title: Hub-key wrap envelope shape
owner: shared-supervisor
governs:
  - packages/protocol/schemas/hub-key.ts
  - apps/desktop/src/
---

The hub key wrap envelope is HPKE-sealed per recipient under LABEL_HUB_KEY_WRAP.
`

const I18N_CONTRACT = `---
title: Locale key casing
owner: shared-supervisor
governs:
  - packages/i18n/locales/
---

Locale keys are camelCase, never snake_case.
`

const emptyBrief: Brief = { sections: [{ heading: 'Issue #1: x', body: 'body' }] }

function record(overrides: Partial<RunRecord>): RunRecord {
  return {
    ts: 1, runId: 'r', lane: 'backend', itemId: '42', itemName: 'Fix the thing',
    engine: 'claude', outcome: 'FAILED', ...overrides,
  }
}

describe('loadContracts + contractsFor', () => {
  it('selects a contract whose governs globs match a changed path', async () => {
    const repo = tempRepo()
    writeContract(repo, 'hub-key.md', HUB_KEY_CONTRACT)
    writeContract(repo, 'i18n.md', I18N_CONTRACT)
    const contracts = await loadContracts(repo)
    expect(contracts).toHaveLength(2)

    const selected = contractsFor(['apps/desktop/src/lib/hub-key-manager.ts'], contracts)
    expect(selected.map((c) => c.title)).toEqual(['Hub-key wrap envelope shape'])
  })

  it('omits a contract whose globs do not match any changed path', async () => {
    const repo = tempRepo()
    writeContract(repo, 'hub-key.md', HUB_KEY_CONTRACT)
    writeContract(repo, 'i18n.md', I18N_CONTRACT)
    const contracts = await loadContracts(repo)

    const selected = contractsFor(['apps/worker/routes/notes.ts'], contracts)
    expect(selected).toHaveLength(0)
  })

  it('ignores the README and returns an empty list when the directory is absent', async () => {
    const repo = tempRepo()
    writeContract(repo, 'README.md', '# not a contract\n')
    const contracts = await loadContracts(repo)
    expect(contracts).toHaveLength(0)

    const noDirRepo = tempRepo()
    expect(await loadContracts(noDirRepo)).toEqual([])
  })
})

describe('buildMemoryContext', () => {
  it('filters prior attempts to the given item — another item\'s history never leaks in', () => {
    const rows: RunRecord[] = [
      record({ ts: 10, itemId: '42', note: 'mine' }),
      record({ ts: 20, itemId: '99', note: 'not mine' }),
      record({ ts: 30, itemId: '42', note: 'also mine' }),
    ]
    const ctx = buildMemoryContext('42', rows, [])
    expect(ctx.priorAttempts.every((r) => r.itemId === '42')).toBe(true)
    expect(ctx.priorAttempts.map((r) => r.note)).toEqual(['also mine', 'mine'])
  })

  it('caps prior attempts at the three most recent', () => {
    const rows: RunRecord[] = [1, 2, 3, 4, 5].map((n) =>
      record({ ts: n, itemId: '42', note: `attempt-${n}` }))
    const ctx = buildMemoryContext('42', rows, [])
    expect(ctx.priorAttempts).toHaveLength(3)
    expect(ctx.priorAttempts.map((r) => r.note)).toEqual(['attempt-5', 'attempt-4', 'attempt-3'])
  })
})

describe('augmentBrief', () => {
  it('adds nothing for a clean item with no history, no verdict, no contracts', () => {
    const ctx = buildMemoryContext('42', [], [])
    const augmented = augmentBrief(emptyBrief, ctx)
    expect(augmented.sections).toEqual(emptyBrief.sections)
  })

  it('adds a prior-attempts section carrying the failure note', () => {
    const rows: RunRecord[] = [record({ itemId: '42', outcome: 'REJECTED', note: 'scope violation' })]
    const ctx = buildMemoryContext('42', rows, [])
    const augmented = augmentBrief(emptyBrief, ctx)
    const body = augmented.sections.map((s) => s.body).join('\n')
    expect(body).toContain('scope violation')
  })

  it('adds the last reviewer verdict when present', () => {
    const ctx = buildMemoryContext('42', [], [])
    ctx.lastReviewVerdict = { verdict: 'FAIL', text: 'weakened a test assertion' }
    const augmented = augmentBrief(emptyBrief, ctx)
    const body = augmented.sections.map((s) => s.body).join('\n')
    expect(body).toContain('weakened a test assertion')
  })

  it('adds a governing contract when one applies', () => {
    const contract: Contract = {
      path: '/x/hub-key.md', title: 'Hub-key wrap envelope shape', owner: 'shared-supervisor',
      governs: ['apps/desktop/src/'], body: 'The envelope is HPKE-sealed.',
    }
    const ctx = buildMemoryContext('42', [], [contract])
    const augmented = augmentBrief(emptyBrief, ctx)
    const body = augmented.sections.map((s) => s.body).join('\n')
    expect(body).toContain('Hub-key wrap envelope shape')
    expect(body).toContain('HPKE-sealed')
  })

  it('never regenerates or drops the base brief\'s sections', () => {
    const rows: RunRecord[] = [record({ itemId: '42' })]
    const ctx = buildMemoryContext('42', rows, [])
    const augmented = augmentBrief(emptyBrief, ctx)
    expect(augmented.sections[0]).toEqual(emptyBrief.sections[0])
  })
})

/**
 * Fix round 2, M2: buildBrief (brief.ts) and augmentBrief (memory.ts) used
 * to independently render prior-attempt history under two different
 * headings ("Previous attempts" vs "Prior attempts on this item"). A
 * caller wiring both into one dispatch — which is exactly what tick.ts was
 * always going to do, since buildBrief supplies the base brief and
 * augmentBrief is the documented way to add history — would have shown the
 * same failure history twice, with no test catching it because each file's
 * own tests only ever exercised itself in isolation. buildBrief no longer
 * owns any of this (see brief.test.ts); this test exercises the actual
 * full path — buildBrief then augmentBrief, the way a real caller uses
 * them together — and asserts the heading appears exactly once.
 */
describe('the full path (buildBrief -> augmentBrief) renders prior-attempt history exactly once', () => {
  const lane: Lane = {
    id: 'backend', mode: 'live', cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned: ['apps/worker/'], notOwned: ['tests/'] },
  }
  const item: WorkItem = {
    id: '42', title: 'Fix the thing', body: 'x'.repeat(300),
    url: 'https://github.com/o/r/issues/42', labels: ['agent-dispatchable', 'lane:backend'],
  }

  it('renders the prior-attempts heading exactly once, not zero and not twice', () => {
    const rows: RunRecord[] = [record({ itemId: '42', outcome: 'REJECTED', note: 'scope violation' })]
    const base = buildBrief(item, lane, 'auto/backend-x')
    const ctx = buildMemoryContext('42', rows, [])
    const full = renderBrief(augmentBrief(base, ctx))

    const headingMatches = full.match(/prior attempts on this item/gi) ?? []
    expect(headingMatches).toHaveLength(1)
    // and the content itself is not duplicated either — not just the heading
    const noteMatches = full.match(/scope violation/g) ?? []
    expect(noteMatches).toHaveLength(1)
  })
})
