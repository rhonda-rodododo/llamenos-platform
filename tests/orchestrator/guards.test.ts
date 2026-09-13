import { describe, it, expect, afterEach } from 'vitest'
import { LANES, NEVER_WRITE_PATHS, loadLanes, readLaneModes, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import { classifyImpact, HIGH_IMPACT_PATHS } from '../../orchestrator/src/impact.js'
import { checkScope } from '../../orchestrator/src/scope.js'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { codeownersMatcher, codeownersPatterns, trackedFiles, trackedFilesUnder } from './codeowners.js'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('rail: a live lane must have a write scope', () => {
  // Asserted against a synthetic lane, not the live config: every configured
  // lane defaults to `off`, so looping over them would execute no assertion at
  // all — a test that passes by never running its check.
  it('throws rather than running a live lane with an empty scope', () => {
    expect(() => assertLiveLanesHaveScope([{
      id: 'ios', mode: 'live', cap: 1, engine: 'claude',
      requireLabel: 'agent-dispatchable', vetoLabels: [],
      scope: { owned: [], notOwned: [] },
    }])).toThrow()
  })

  it('parses a non-empty scope for every configured lane', async () => {
    // Point lane modes at a fixture that cannot exist, rather than the real
    // ~/.llamenos-fleet/lanes.json: this test asserts fragment PARSING, not
    // anything about live/shadow state, and reading the operator's actual
    // runtime state would make the test's outcome depend on whatever that
    // machine happens to have turned on (e.g. assertLiveLanesHaveScope
    // throwing for a real live lane, for reasons unrelated to what this test
    // checks).
    const lanes = await loadLanes(process.cwd(), '/nonexistent/fixture-lanes.json')
    for (const l of lanes) {
      expect(l.scope.owned.length, `lane ${l.id} parsed no owned paths from its fragment`).toBeGreaterThan(0)
    }
  })
})

describe('rail: the fleet cannot merge its own changes', () => {
  it('classifies orchestrator source as high impact', () => {
    expect(classifyImpact(['orchestrator/src/tick.ts'], 1).impact).toBe('high')
  })
  it('classifies its own tests as high impact', () => {
    expect(classifyImpact(['tests/orchestrator/guards.test.ts'], 1).impact).toBe('high')
  })

  // `classifyImpact` only DESCRIBES a diff now — it gated nothing that
  // anything outside this process ever saw. The gate is GitHub's own
  // "require review from Code Owners" rule over CODEOWNERS, so the property
  // that has to hold is about REAL FILES, not about two lists of strings
  // agreeing with each other.
  //
  // The previous version of this test compared patterns with `startsWith`,
  // and passed on a CODEOWNERS in which sixteen of the auth/session/identity
  // rules matched nothing whatsoever: CODEOWNERS is gitignore syntax, where
  // `apps/worker/lib/auth` means a file NAMED `auth`, not `auth.ts`. The
  // string check could not see that, because a string check can only tell you
  // two lists agree — never that either one means anything. These two assert
  // against `git ls-files` with the same matcher GitHub uses.
  it('every HIGH_IMPACT_PATH matches at least one tracked file — a gate over nothing is not a gate', () => {
    const files = trackedFiles()
    for (const p of HIGH_IMPACT_PATHS) {
      expect(trackedFilesUnder(p, files).length, `HIGH_IMPACT_PATHS entry "${p}" matches no tracked file`)
        .toBeGreaterThan(0)
    }
  })

  it('CODEOWNERS owns every tracked file under every HIGH_IMPACT_PATH, by gitignore semantics', () => {
    const files = trackedFiles()
    const owner = codeownersMatcher()
    const unowned: string[] = []
    for (const p of HIGH_IMPACT_PATHS) {
      for (const f of trackedFilesUnder(p, files)) {
        if (!owner.owns(f)) unowned.push(`${f} (under ${p})`)
      }
    }
    expect(unowned, `high-impact files with no CODEOWNERS owner:\n${unowned.join('\n')}`).toEqual([])
  })

  it('has no catch-all `*` rule — one would gate every PR and stop the fleet merging anything', () => {
    expect(codeownersPatterns()).not.toContain('*')
  })
})

/**
 * A grep, deliberately, and the ONE place in this suite where that is the
 * right instrument: it guards a property of the ARGV, of which there is no
 * behaviour to assert beyond "nobody wrote the flag".
 *
 * Two invariants, both true of this repo today:
 *   - the fleet never bypasses a PR's checks. No `--admin`, no `--force`, no
 *     `--bypass`, anywhere under `orchestrator/`. The operator's standing
 *     rule is per-command: nothing bypasses checks unless they say so, for
 *     that command.
 *   - the fleet never posts a GitHub REVIEW. `postReview` records the
 *     non-author verdict as a COMMENT; an approving review is one ruleset
 *     edit away from being an approval the fleet grants itself.
 *
 * `--match-head-commit` is deliberately NOT forbidden: it is a pin, the
 * opposite of a bypass, and `mergePr` passing it is exactly what stops a
 * branch that moved after verification from being merged.
 */
describe('rail: the fleet never bypasses a PR\'s checks, and never reviews', () => {
  function orchestratorSources(): { file: string; text: string }[] {
    const out: { file: string; text: string }[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (e.name.endsWith('.ts')) out.push({ file: full, text: readFileSync(full, 'utf8') })
      }
    }
    walk(join(process.cwd(), 'orchestrator', 'src'))
    return out
  }

  it('finds orchestrator sources to scan at all — the grep must not pass vacuously', () => {
    expect(orchestratorSources().length).toBeGreaterThan(10)
  })

  const GH_CALL = /gh\(\s*\[[^\]]*\]/g
  const ghCalls = (text: string): string[] => text.match(GH_CALL) ?? []

  /**
   * Whole-file, NOT scoped to a `gh([...])` literal. A scan that only reads
   * literal argv arrays is evaded by hoisting one:
   *
   *     const args = ['pr', 'merge', pr, '--admin']
   *     await gh(args)
   *
   * None of these strings has any legitimate reason to appear anywhere under
   * `orchestrator/src` — not in argv, not in a variable, not in prose — so
   * the file text is the right granularity and there is no false positive to
   * trade away for it. `--approve`/`--request-changes` are here for the same
   * reason: the fleet records the non-author verdict as a COMMENT, and an
   * approving review is one ruleset edit from being an approval it grants
   * itself.
   */
  const FORBIDDEN_ANYWHERE = ['--admin', '--bypass', '--approve', '--request-changes']

  it('contains no bypass or review flag anywhere, however the argv is built', () => {
    for (const { file, text } of orchestratorSources()) {
      for (const flag of FORBIDDEN_ANYWHERE) {
        expect(text, `${file} contains ${flag}`).not.toContain(flag)
      }
    }
  })

  it('finds gh calls to scan — the grep must not pass vacuously', () => {
    const total = orchestratorSources().reduce((n, { text }) => n + ghCalls(text).length, 0)
    expect(total).toBeGreaterThan(5)
  })

  // `--force` is the one that CANNOT be whole-file: `git worktree remove
  // --force` is a legitimate, unrelated use, and a rail that fires on correct
  // code gets trained away rather than fixed. Scoped to gh argv, where it
  // would mean force-pushing or forcing a merge.
  it('passes no --force to gh', () => {
    for (const { file, text } of orchestratorSources()) {
      for (const call of ghCalls(text)) {
        expect(call, `${file}: gh call passes --force`).not.toContain('--force')
      }
    }
  })

  // Every merge this fleet performs is pinned to the commit that was
  // verified. A `gh pr merge` without the pin would merge whatever the branch
  // happens to point at now, which is the race `mayAutoMerge`'s own
  // verified-commit comparison exists to close.
  it('pins every `gh pr merge` to the verified commit', () => {
    const PR_MERGE = /\[\s*'pr'\s*,\s*'merge'[^\]]*\]/g
    let seen = 0
    for (const { file, text } of orchestratorSources()) {
      for (const call of text.match(PR_MERGE) ?? []) {
        seen++
        expect(call, `${file}: gh pr merge without --match-head-commit`).toContain("'--match-head-commit'")
      }
    }
    expect(seen).toBe(1)
  })
})

describe('rail: crypto and protocol always reach a human', () => {
  it.each([
    'packages/crypto/src/hpke.rs',
    'packages/protocol/schemas/note.ts',
    'packages/protocol/crypto-labels.json',
    'apps/worker/lib/auth.ts',
    // The key-boundary wrapper: not the crypto crate itself, but the single
    // abstraction (per CLAUDE.md) keeping a device private key out of the
    // webview. A quiet mistake here is an identity disclosure exactly like a
    // mistake in packages/crypto/ itself — see impact.ts's CORRECTED comment
    // for why this was briefly (and wrongly) narrowed out, then restored.
    'src/client/lib/platform.ts',
  ])('%s is high impact', (f) => {
    expect(classifyImpact([f], 1).impact).toBe('high')
  })
})

describe('rail: never-write binds even an unrestricted lane', () => {
  it('forbids secrets for a lane with no declared scope', () => {
    expect(checkScope(['.env'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden).toEqual(['.env'])
  })

  it('forbids a nested secrets file for a lane with no declared scope', () => {
    expect(checkScope(['apps/worker/config/.env'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual(['apps/worker/config/.env'])
  })

  it('forbids a signing keystore for a lane with no declared scope', () => {
    expect(checkScope(['apps/android/keystore.properties'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual(['apps/android/keystore.properties'])
  })

  // CI and deploy stay WRITABLE — a lane owning them can still fix its own
  // CI, and never-write is about secrets, not about review. `deploy/` stays
  // low-impact and unowned in CODEOWNERS (PR #794: no production users yet,
  // so a bad deploy config is recoverable). `ci.yml` is HIGH impact via the
  // `.github/workflows/` prefix, because it is where "check out the base,
  // not the head" is written down: a PR editing the gate's own definition is
  // editing the machinery that judges it.
  it('leaves CI and deploy writable, and treats the gate definition itself as high impact', () => {
    expect(checkScope(['.github/workflows/ci.yml'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual([])
    expect(classifyImpact(['.github/workflows/ci.yml'], 1).impact).toBe('high')
    expect(classifyImpact(['deploy/helm/values.yaml'], 1).impact).toBe('low')
  })
})

describe('rail: the GitHub kill switch fails open', () => {
  it('does not halt when the issue list could not be read', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})

// The single-origin-remote invariant ("rail: origin points at
// llamenos-platform") used to be asserted here by shelling out to
// `git remote -v` on the machine running the test suite. Removed: it
// asserted the test-runner's own git config, not the code — it fails on any
// contributor's fork or differently-configured checkout for reasons that
// have nothing to do with the diff under test, and `doctor`
// (orchestrator/src/cli.ts) already enforces the stronger form of this
// invariant (exactly one remote, named origin) at runtime on the only
// machine where the answer is meaningful: the operator's.

describe('rail: every lane starts off', () => {
  it('ships no lane in live or shadow mode by default', () => {
    expect(LANES.filter((l) => l.mode !== 'off')).toHaveLength(0)
  })
})

describe('rail: lane modes are runtime state, not source', () => {
  // orchestrator/ is high-impact and human-gated. If a lane's mode lived in
  // config.ts, flipping it from off to shadow would need a reviewed PR —
  // defeating the point of a runtime dial. Proven behaviorally: write a real
  // modes file and show readLaneModes()/loadLanes() actually pick the mode
  // up from its content, rather than grepping config.ts's source text for a
  // constant name (a check a refactor could break, or a hardcoded mode could
  // satisfy, without the underlying property changing either way).
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  function tempModesFile(modes: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-guards-lane-modes-'))
    dirs.push(dir)
    const file = join(dir, 'lanes.json')
    writeFileSync(file, JSON.stringify(modes))
    return file
  }

  it('readLaneModes reads a lane mode from file content, not from source', () => {
    const file = tempModesFile({ backend: 'shadow' })
    expect(readLaneModes(file)).toEqual({ backend: 'shadow' })
  })

  it('loadLanes turns a lane on from the modes file alone, with no source change', async () => {
    const file = tempModesFile({ ios: 'live' })
    const lanes = await loadLanes(process.cwd(), file)
    expect(lanes.find((l) => l.id === 'ios')?.mode).toBe('live')
    // Every other lane is untouched by that same file.
    expect(lanes.filter((l) => l.id !== 'ios').every((l) => l.mode === 'off')).toBe(true)
  })
})
