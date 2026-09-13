import { describe, it, expect, afterEach } from 'vitest'
import { LANES, NEVER_WRITE_PATHS, loadLanes, readLaneModes, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import { classifyImpact, HIGH_IMPACT_PATHS } from '../../orchestrator/src/impact.js'
import { checkScope } from '../../orchestrator/src/scope.js'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { codeownersMatcher, codeownersPatterns, trackedFiles, trackedFilesUnder } from './codeowners.js'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

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
 * `--match-head-commit` is not mentioned here at all any more: `mergePr` and
 * its pin are gone, because the fleet no longer merges anything. What
 * replaced the pin is a property of the platform — a check run attaches to
 * ONE commit, so a push moves the head and the new head carries no green
 * `fleet/verify` or `fleet/review` of its own. See the merge-call block
 * below for what does remain.
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

  /**
   * The fleet must never ask "who am I?" and compare that to a PR's author.
   *
   * This is not hypothetical tidiness — it encodes a decision already taken
   * twice. A proposal to "verify unless the author is the human owner" was
   * rejected because the fleet pushed with the operator's own account, so
   * author login could not discriminate anything. Now the opposite holds:
   * the fleet authors as a dedicated machine user and the sole code owner
   * approves, because GitHub forbids self-approval. Either way, an identity
   * check here would be wrong — and in the second arrangement it would
   * silently do the wrong thing rather than fail.
   *
   * Authors ARE read (`PrFacts.reviews`), but only to render; nothing
   * compares them. These are the calls that would introduce a self-identity
   * to compare against.
   */
  it('never resolves its own GitHub identity', () => {
    for (const { file, text } of orchestratorSources()) {
      // Argv-aware rather than literal-string: `'api', 'user'` with the exact
      // spacing was trivially evaded by `gh(['api','/user'])`. Any `user`
      // path segment inside a gh call is the thing to catch, however spaced
      // or quoted.
      for (const call of ghCalls(text)) {
        for (const seg of ["'user'", '"user"', "'/user'", '"/user"']) {
          expect(call, `${file}: gh call resolves the authenticated user (${seg})`).not.toContain(seg)
        }
      }
      // GraphQL's `viewer` has no other meaning in this codebase, so the bare
      // word is forbidden outright — no construction evades it.
      expect(text, `${file} uses the GraphQL viewer (self) field`).not.toMatch(/\bviewer\b/)
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

  /**
   * `mergePr` and its `--match-head-commit` pin are gone: the fleet no longer
   * merges anything. What replaced the pin is a property of the platform —
   * a check run is attached to ONE commit, so a push moves the head and the
   * new head carries no green `fleet/verify` or `fleet/review` of its own,
   * and auto-merge does not fire.
   *
   * Exactly two `gh pr merge` calls remain and they are a pair: one ARMS
   * GitHub's auto-merge, reached only after mechanical verification and the
   * non-author review have both passed; one can only UN-arm, for a PR an
   * earlier attempt armed before this one rejected it. Anything that is
   * neither — a bare merge, or a third call — would be this process deciding
   * something that is GitHub's to decide.
   */
  it('invokes `gh pr merge` only to arm or to un-arm auto-merge, never to merge', () => {
    const PR_MERGE = /\[\s*'pr'\s*,\s*'merge'[^\]]*\]/g
    const calls: string[] = []
    for (const { file, text } of orchestratorSources()) {
      for (const call of text.match(PR_MERGE) ?? []) {
        calls.push(call)
        const arms = call.includes("'--auto'")
        const disarms = call.includes("'--disable-auto'")
        expect(arms !== disarms, `${file}: gh pr merge that neither arms nor disarms: ${call}`).toBe(true)
      }
    }
    expect(calls.filter((c) => c.includes("'--auto'"))).toHaveLength(1)
    expect(calls.filter((c) => c.includes("'--disable-auto'"))).toHaveLength(1)
    expect(calls).toHaveLength(2)
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
  // low-impact (owned in CODEOWNERS via #615's policy, but not part of the
  // gate's own trust base). `ci.yml` is now HIGH impact, because it is where
  // "check out the base, not the head" is written down: a PR editing the
  // gate's own definition is editing the machinery that judges it.
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

/**
 * The gate's own workflow shape, asserted against the real YAML — the only
 * place these properties are visible, because none of them is reachable from
 * a unit test.
 *
 * The load-bearing one: on `pull_request`, GitHub runs the PR's OWN workflow
 * files. Anything in `ci.yml` that can act on a pull request is therefore
 * PR-controlled — an approve step there approves whatever the PR says it
 * should, which is how the first version of this change approved its own pull
 * request. So `ci.yml` must hold NO write scope over pull requests at all,
 * and the approval lives in `fleet-approve.yml`, which `workflow_run` always
 * runs from the base branch.
 */
describe('rail: the gate workflow grants only what it must', () => {
  interface Step { name?: string; id?: string; if?: string; run?: string; 'continue-on-error'?: boolean }
  interface Job { permissions?: Record<string, string>; steps?: Step[] }
  interface Workflow { on?: unknown; permissions?: Record<string, string>; jobs: Record<string, Job> }

  const workflow = (file: string): Workflow =>
    parseYaml(readFileSync(join(process.cwd(), '.github', 'workflows', file), 'utf8')) as Workflow
  const ci = (): Workflow => workflow('ci.yml')
  const approve = (): Workflow => workflow('fleet-approve.yml')
  const runsOf = (j?: Job): string[] => (j?.steps ?? []).map((st) => st.run ?? '')

  it('finds both gate jobs and the approval workflow — nothing below may pass vacuously', () => {
    expect(Object.keys(ci().jobs)).toEqual(expect.arrayContaining(['fleet-verify', 'fleet-review']))
    expect(Object.keys(approve().jobs).length).toBeGreaterThan(0)
  })

  // toEqual, not key-by-key: `statuses`, `actions`, `checks` or `id-token`
  // write would all slip past a check that only looks at two keys.
  it('both gate jobs hold read-only permissions, exactly', () => {
    expect(ci().jobs['fleet-verify']?.permissions).toEqual({ contents: 'read' })
    expect(ci().jobs['fleet-review']?.permissions).toEqual({ contents: 'read' })
  })

  // Not just the two gate jobs: ANY job in ci.yml gaining pull-request write
  // reopens the hole, since ci.yml runs from the PR.
  it('no job in ci.yml can write pull requests, and none reviews one', () => {
    // Scoped to `pull-requests`: `docker-canary` legitimately holds
    // packages/id-token/attestations write for image publishing and
    // attestation, and a rail that fires on those gets trained away rather
    // than fixed. It is pull-request write specifically that reopens the hole.
    for (const [name, job] of Object.entries(ci().jobs)) {
      expect(job.permissions?.['pull-requests'], `job ${name} can write pull requests`).not.toBe('write')
      for (const run of runsOf(job)) {
        expect(run, `job ${name} acts on reviews`)
          .not.toMatch(/--approve|--request-changes|event=(APPROVE|REQUEST_CHANGES)|\/reviews/)
      }
    }
  })

  // `continue-on-error` or a missing id would let a FAILED verdict read as a
  // success downstream. The verdict IS the step's outcome.
  it('the review step is identified and cannot swallow its own failure', () => {
    // `cli.ts review-ci`, not bare `review-ci`: the bootstrap guard step
    // mentions the command name too and comes first.
    const step = (ci().jobs['fleet-review']?.steps ?? []).find((st) => (st.run ?? '').includes('cli.ts review-ci'))
    expect(step, 'no review-ci step found').toBeDefined()
    expect(step?.id).toBe('review')
    expect(step?.['continue-on-error']).toBeUndefined()
  })

  it('the reviewer is constrained to read-only and installed off the shared PATH', () => {
    const runs = runsOf(ci().jobs['fleet-review']).join('\n')
    expect(runs).toContain('"action": "deny"')
    // What matters is what goes ON the PATH, not whether the old path is
    // mentioned — it is, in the comment explaining why it is not used.
    expect(runs).toMatch(/echo "\$RUNNER_TEMP\/opencode-bin" >> "\$GITHUB_PATH"/)
    expect(runs).not.toMatch(/echo "\$HOME\/\.local\/bin" >> "\$GITHUB_PATH"/)
  })
})

/**
 * `fleet-approve.yml` holds the only pull-request write token in the design.
 * `workflow_run` is what makes that safe — it always runs the BASE branch's
 * copy of this file, so the commit under judgement cannot edit the thing that
 * approves it, grant itself the scope, or reach the token.
 */
describe('rail: the approval workflow runs from base and pins what it approves', () => {
  interface Step { run?: string; env?: Record<string, string> }
  interface Job { steps?: Step[] }
  interface Workflow { on?: Record<string, { workflows?: string[]; types?: string[] }>; permissions?: Record<string, string>; jobs: Record<string, Job> }
  const wf = (): Workflow =>
    parseYaml(readFileSync(join(process.cwd(), '.github', 'workflows', 'fleet-approve.yml'), 'utf8')) as Workflow
  const allRuns = (): string => Object.values(wf().jobs).flatMap((j) => (j.steps ?? []).map((s) => s.run ?? '')).join('\n')

  // `on: pull_request` here would run the PR's own copy and reinstate the
  // exact hole this file exists to close.
  it('triggers only on workflow_run completing, never on pull_request', () => {
    const on = wf().on ?? {}
    expect(Object.keys(on)).toEqual(['workflow_run'])
    expect(on['workflow_run']?.workflows).toEqual(['CI'])
    expect(on['workflow_run']?.types).toEqual(['completed'])
  })

  it('holds pull-request write and nothing else', () => {
    expect(wf().permissions).toEqual({ contents: 'read', 'pull-requests': 'write' })
  })

  // The verdict is the check-run conclusion for the exact SHA, not the
  // workflow_run's own result, which aggregates every job in CI and would
  // approve a green build carrying a red review.
  it('reads the fleet/review check conclusion for the head SHA', () => {
    const runs = allRuns()
    expect(runs).toMatch(/check-runs/)
    expect(runs).toContain('fleet/review')
    // The SHA reaches the script through `env:`, which is the injection-safe
    // form — so it is asserted there, not in the run body.
    const envs = Object.values(wf().jobs)
      .flatMap((j) => (j.steps ?? []).map((st) => JSON.stringify(st.env ?? {})))
      .join('\n')
    expect(envs).toContain('workflow_run.head_sha')
  })

  // Without commit_id the approval lands on whatever the head is when the
  // request arrives — after a push in the gap, a commit nobody reviewed.
  it('pins the approval to the reviewed commit', () => {
    expect(allRuns()).toMatch(/-f commit_id="\$\{SHA\}"/)
  })

  it('approves only on success', () => {
    expect(allRuns()).toMatch(/if \[ "\$verdict" = "success" \]/)
  })

  // knope's release PRs are bot-authored and GitHub answers 422 on
  // self-approval; under `set -e` that would turn a PASS into a red check.
  it('skips bot-authored pull requests rather than failing on them', () => {
    const runs = allRuns()
    expect(runs).toContain('github-actions[bot]')
    expect(runs).toMatch(/continue/)
  })

  it('dismisses via the dismissals endpoint, not by talking about it', () => {
    const runs = allRuns()
    expect(runs).toMatch(/api -X PUT "repos\/\$\{R\}\/pulls\/\$\{pr\}\/reviews\/\$\{id\}\/dismissals"/)
    expect(runs).toContain('-f event=DISMISS')
  })

  it('uses gh by absolute path — the only write token must not be shadowable', () => {
    expect(allRuns()).toContain('GH=/usr/bin/gh')
  })
})
