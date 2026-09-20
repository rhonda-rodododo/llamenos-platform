import { describe, it, expect, afterEach, vi } from 'vitest'
import { LANES, NEVER_WRITE_PATHS, loadLanes, readLaneModes, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import { classifyImpact, HIGH_IMPACT_PATHS } from '../../orchestrator/src/impact.js'
import { checkScope } from '../../orchestrator/src/scope.js'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { codeownersMatcher, codeownersPatterns, trackedFiles, trackedFilesUnder } from './codeowners.js'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runReviewCi, decideReviewGate, type CiContext, type ReviewCiDeps } from '../../orchestrator/src/ci.js'
import { DEFAULT_MAX_TURNS, HIGH_IMPACT_MAX_TURNS, DEFAULT_TIMEOUT_MS, HIGH_IMPACT_TIMEOUT_MS } from '../../orchestrator/src/review.js'
import { diffHash, cacheArtifactName, type ReviewCache, type CachedVerdict, type ReviewCacheKey } from '../../orchestrator/src/review-cache.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { VerifyReport } from '../../orchestrator/src/verify.js'

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

  // fleet/verify's judge is vitest's MAIN process, and that process executes
  // the config. A root vitest config added later must be owned and described
  // as high-impact from its first commit — not once someone remembers.
  it('every root vitest config is code-owned and high impact', () => {
    const configs = trackedFiles().filter((f) => /^vitest\.[^/]+\.config\.ts$/.test(f))
    expect(configs).toContain('vitest.orchestrator.config.ts')
    expect(configs).toContain('vitest.unit.config.ts')
    const owner = codeownersMatcher()
    for (const f of configs) {
      expect(owner.owns(f), `${f} has no CODEOWNERS owner`).toBe(true)
      expect(HIGH_IMPACT_PATHS, `${f} is missing from HIGH_IMPACT_PATHS`).toContain(f)
    }
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

/**
 * `fleet/review`'s non-author engine is opencode, and until 2026-09-15 its
 * provider (`kimi-for-coding`) and model (`kimi-for-coding/k3-256k`) were
 * both string literals baked into the workflow file — twice, once for
 * `auth.json`'s key and once for the smoke-test's `--model` flag. When that
 * provider's weekly quota ran out, the ONLY way to switch providers was a PR
 * editing a required, code-owned workflow file — which cannot itself go
 * green while the current review engine has no quota. This rail asserts the
 * property that makes a provider switch an operator action instead: the job
 * reads `vars.FLEET_REVIEW_PROVIDER` / `vars.FLEET_REVIEW_MODEL` (with safe
 * defaults matching today's engine, so an unconfigured repo behaves exactly
 * as before), the `auth.json` key comes from that variable rather than a
 * literal, and the smoke step can name why the engine failed.
 *
 * `fleet/review` moved out of `ci.yml` into its own `fleet-review.yml` in the
 * PR that also fixed its fail-open trigger bug — see the "runs once, at
 * merge time" rail below for that history. This rail reads `fleet-review.yml`
 * now, not `ci.yml`.
 *
 * A grep over the workflow YAML's raw text, deliberately — like the
 * `--admin`/`--force` rail above, there is no runtime behaviour to invoke
 * here (this is CI-only shell, never imported by orchestrator code), so the
 * argv/config text IS the thing to assert.
 */
describe('rail: the review engine provider is a repo variable, never a hardcoded literal', () => {
  const FLEET_REVIEW_YML_PATH = join(process.cwd(), '.github', 'workflows', 'fleet-review.yml')

  function fleetReviewJobText(): string {
    const text = readFileSync(FLEET_REVIEW_YML_PATH, 'utf8')
    // From the `fleet-review:` job key to the next top-level (2-space
    // indented) job key, if any (this file has exactly one job today, so
    // this normally runs to EOF) — scoped rather than trusting "whole file
    // has one job" as an invariant, so a future second job in this file
    // can never satisfy this rail by accident.
    const start = text.indexOf('\n  fleet-review:')
    expect(start, 'fleet-review job not found in fleet-review.yml').toBeGreaterThan(-1)
    const rest = text.slice(start + 1)
    const nextJob = rest.slice('  fleet-review:'.length).search(/\n {2}\S/)
    return nextJob === -1 ? rest : rest.slice(0, '  fleet-review:'.length + nextJob)
  }

  it('finds the fleet-review job to scan at all — the grep must not pass vacuously', () => {
    expect(fleetReviewJobText().length).toBeGreaterThan(500)
  })

  it('reads FLEET_REVIEW_PROVIDER from vars with the kimi-for-coding default', () => {
    expect(fleetReviewJobText()).toMatch(
      /FLEET_REVIEW_PROVIDER:\s*\$\{\{\s*vars\.FLEET_REVIEW_PROVIDER\s*\|\|\s*'kimi-for-coding'\s*\}\}/,
    )
  })

  it('reads FLEET_REVIEW_MODEL from vars with the kimi-for-coding/k3-256k default', () => {
    expect(fleetReviewJobText()).toMatch(
      /FLEET_REVIEW_MODEL:\s*\$\{\{\s*vars\.FLEET_REVIEW_MODEL\s*\|\|\s*'kimi-for-coding\/k3-256k'\s*\}\}/,
    )
  })

  it('derives the auth.json key from the provider variable, not a literal', () => {
    const text = fleetReviewJobText()
    // The dynamic-key jq construction: `--arg p "$FLEET_REVIEW_PROVIDER"`
    // feeding a `{($p): ...}` filter. Reverting to a hardcoded provider name
    // here (`jq -n --arg k "$FLEET_REVIEW_API_KEY" '{"kimi-for-coding":...}'`)
    // is exactly the regression this asserts against: the auth file would
    // silently stop matching whatever `vars.FLEET_REVIEW_PROVIDER` was set to.
    expect(text).toMatch(/--arg p "\$FLEET_REVIEW_PROVIDER"/)
    expect(text).toMatch(/\{\(\$p\):\s*\{"type":"api","key":\$k\}\}/)
    expect(text, 'auth.json is keyed by a hardcoded provider literal again')
      .not.toMatch(/\{"kimi-for-coding":\s*\{"type":"api"/)
  })

  it('passes the model variable, not a literal, to the smoke-test --model flag', () => {
    const text = fleetReviewJobText()
    expect(text).toMatch(/opencode run --pure --model "\$FLEET_REVIEW_MODEL"/)
    expect(text, 'smoke test pins a literal model again instead of the variable')
      .not.toMatch(/opencode run --pure --model kimi-for-coding\/k3-256k/)
  })

  it('classifies a smoke-test failure as engine-quota, engine-auth, or engine-unavailable', () => {
    const text = fleetReviewJobText()
    for (const cause of ['engine-quota', 'engine-auth', 'engine-unavailable']) {
      expect(text, `${cause} classification missing from the smoke-test step`).toContain(cause)
    }
  })

  it('review.ts reads the opencode model from FLEET_REVIEW_MODEL, not a bare literal', () => {
    const text = readFileSync(join(process.cwd(), 'orchestrator', 'src', 'review.ts'), 'utf8')
    expect(text).toMatch(/opencode:\s*\{\s*binary:\s*'opencode',\s*model:\s*process\.env\['FLEET_REVIEW_MODEL'\]\s*\|\|\s*DEFAULT_OPENCODE_MODEL\s*\}/)
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

  function tempModesFile(modes: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-guards-lane-modes-'))
    dirs.push(dir)
    const file = join(dir, 'lanes.json')
    writeFileSync(file, JSON.stringify(modes))
    return file
  }

  it('readLaneModes reads a lane mode from file content, not from source', () => {
    const file = tempModesFile({ backend: 'shadow' })
    expect(readLaneModes(file)).toEqual({ backend: { mode: 'shadow' } })
  })

  it('loadLanes turns a lane on from the modes file alone, with no source change', async () => {
    const file = tempModesFile({ ios: 'live' })
    const lanes = await loadLanes(process.cwd(), file)
    expect(lanes.find((l) => l.id === 'ios')?.mode).toBe('live')
    // Every other lane is untouched by that same file.
    expect(lanes.filter((l) => l.id !== 'ios').every((l) => l.mode === 'off')).toBe(true)
  })

  it('loadLanes applies the object shape on top of the LANES defaults', async () => {
    const file = tempModesFile({
      backend: { mode: 'shadow', engine: 'opencode', model: 'kimi-for-coding/k3-256k' },
    })
    const lanes = await loadLanes(process.cwd(), file)
    const backend = lanes.find((l) => l.id === 'backend')
    expect(backend).toMatchObject({ mode: 'shadow', engine: 'opencode', model: 'kimi-for-coding/k3-256k' })
    const ios = lanes.find((l) => l.id === 'ios')
    expect(ios).toMatchObject({ mode: 'off', engine: 'claude' })
    expect(ios?.model).toBeUndefined()
  })

  it('loadLanes fails closed: a rejected override leaves the lane off', async () => {
    const file = tempModesFile({ backend: { mode: 'live', engine: 'wat' } })
    const rejections: string[] = []
    const lanes = await loadLanes(process.cwd(), file, (_id, reason) => { rejections.push(reason) })
    expect(lanes.find((l) => l.id === 'backend')?.mode).toBe('off')
    expect(rejections).toHaveLength(1)
    expect(rejections[0]).toMatch(/invalid engine/i)
  })

  // End-to-end proof of the PR #840 fleet/review finding: a poisoned
  // `__proto__` entry must not turn unlisted lanes live through prototype
  // inheritance. Raw JSON string — `tempModesFile({ "__proto__": ... })` would
  // set the fixture object's own prototype and JSON.stringify would drop the
  // key, silently neutering the test.
  it('loadLanes fails closed on a poisoned __proto__ entry: every lane except backend stays off', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-guards-lane-modes-'))
    dirs.push(dir)
    const file = join(dir, 'lanes.json')
    writeFileSync(file, '{"__proto__":{"mode":"live"},"backend":"shadow"}')
    const rejections: string[] = []
    const lanes = await loadLanes(process.cwd(), file, (_id, reason) => { rejections.push(reason) })
    expect(lanes.find((l) => l.id === 'backend')?.mode).toBe('shadow')
    expect(lanes.filter((l) => l.id !== 'backend').every((l) => l.mode === 'off')).toBe(true)
    expect(rejections).toHaveLength(1)
    expect(rejections[0]).toMatch(/unknown lane id/i)
  })
})

/**
 * `fleet/review` moved off `pull_request` and onto `merge_group` (#812): the
 * old trigger re-ran a non-author MODEL call — against a paid, weekly-quota'd
 * provider — on every push and every `gh pr update-branch`, and that call
 * volume is what exhausted the quota and made the repo unmergeable. That fix
 * had its own bug, found and fixed at #844: the job stayed in `ci.yml`,
 * gated by a job-level `if:` — but `ci.yml` ALSO triggers on `pull_request`,
 * so on every ordinary PR the job was still INSTANTIATED and merely skipped
 * by that `if:`, and GitHub treats a *skipped* required check as satisfying
 * it, exactly like a green one. #844 itself merged this way, with
 * `fleet/review` reporting "skipping" and no model review ever run. The real
 * fix was not a smarter `if:` — GitHub does not distinguish "correctly
 * skipped" from "should have blocked" once a job exists on the trigger at
 * all — so `fleet/review` moved into its OWN workflow file
 * (`fleet-review.yml`) at #848, on `workflow_dispatch` + `merge_group` only.
 *
 * #848's own trigger had a DIFFERENT bug, found on #848 itself:
 * `workflow_dispatch` is a repository-level event with no PR of its own, so
 * a dispatched run's check result — even a correct, passing one, verified
 * against #848's real run — never counts toward a PR's required contexts at
 * all. `gh pr view 848 --json statusCheckRollup` never listed it, and
 * `gh pr merge` refused with "the base branch policy prohibits the merge".
 * The fix here: trigger from the PR's OWN check suite — `pull_request`,
 * scoped to `types: [labeled]` so it fires on exactly one signal (the
 * `review` label), never on an ordinary push. A `pull_request`-triggered
 * run's check result attaches to the PR head SHA automatically, which is
 * what actually satisfies a required context — the same mechanism
 * `fleet/verify` already relies on. `merge_group` is dropped as a trigger
 * (see the "reports on merge_group" rail below for why that is safe today).
 *
 * Text assertions over the workflow files are the right instrument here, the
 * same reasoning `guards.test.ts` already applies to `orchestrator/src` argv
 * rails above: there is no runtime behaviour of a YAML trigger condition to
 * exercise, only the literal condition itself, and a regex over the source is
 * what a mutation to it actually breaks.
 *
 * `fleet/verify` moved out of `ci.yml` into its own `fleet-verify.yml` in
 * round 3 of #844 (CodeQL cache-poisoning — see the rail below this one for
 * why). `fleet/review` made the same move at #848 and changed its own
 * trigger again here, so this block now reads three files.
 */
describe('rail: fleet/review runs once per review label, not on every push', () => {
  const workflowYaml = (file: string): string =>
    readFileSync(join(process.cwd(), '.github', 'workflows', file), 'utf8')
  const ciYaml = (): string => workflowYaml('ci.yml')
  const fleetVerifyYaml = (): string => workflowYaml('fleet-verify.yml')
  const fleetReviewYaml = (): string => workflowYaml('fleet-review.yml')

  /** The text of one named job, from its `  <name>:` line up to (but not
   *  including) the next job at the same two-space indentation — matching
   *  every job key actually declared in the file, not a hardcoded guess at
   *  what might come next. */
  function jobBlock(text: string, name: string): string {
    const jobHeaderRe = /\n {2}([a-zA-Z0-9_-]+):\n/g
    const starts: { name: string; index: number }[] = []
    for (const m of text.matchAll(jobHeaderRe)) starts.push({ name: m[1] as string, index: m.index })
    const at = starts.findIndex((s) => s.name === name)
    if (at === -1) throw new Error(`no "${name}:" job found in this workflow file — the grep must not pass vacuously`)
    const end = at + 1 < starts.length ? starts[at + 1]?.index : text.length
    return text.slice(starts[at]?.index, end)
  }

  it('finds fleet-verify (fleet-verify.yml) and fleet-review (fleet-review.yml) as real jobs — the parser must not pass vacuously', () => {
    expect(jobBlock(fleetVerifyYaml(), 'fleet-verify')).toContain('name: fleet/verify')
    expect(jobBlock(fleetReviewYaml(), 'fleet-review')).toContain('name: fleet/review')
  })

  // The load-bearing assertion of this whole rail, in its post-#844-fail-open
  // form: `fleet/review` must not exist as a job anywhere in `ci.yml` at all
  // — not gated by an `if:`, not skipped, ABSENT. A job that exists on
  // `ci.yml`'s `pull_request`/`push` trigger and is merely `if:`-gated to
  // skip on those events is exactly the regression this rail exists to catch
  // (a skipped required check satisfies branch protection same as a green
  // one), and re-adding the job under any `if:` reproduces it.
  it('ci.yml contains no job named fleet-review — the job must be ABSENT on pull_request, not skipped', () => {
    expect(() => jobBlock(ciYaml(), 'fleet-review')).toThrow()
  })

  it('ci.yml triggers on merge_group at the workflow level (ci-status, the repo\'s own required aggregate, still must report there)', () => {
    // Scoped to before the `jobs:` key: `merge_group` also appears in prose
    // comments and in job bodies (context field names, env vars), and this
    // assertion is specifically about the workflow's OWN `on:` block.
    const onBlock = ciYaml().split(/\njobs:\n/)[0] ?? ''
    expect(onBlock).toMatch(/\n {2}merge_group:/)
  })

  it('fleet-verify.yml triggers on merge_group AND pull_request, and nothing else with default-branch cache-write access', () => {
    const onBlock = fleetVerifyYaml().split(/\njobs:\n/)[0] ?? ''
    expect(onBlock).toMatch(/\n {2}pull_request:/)
    expect(onBlock).toMatch(/\n {2}merge_group:/)
    // The whole point of the split (see the CodeQL rail below): none of
    // these may appear at the top level, or CodeQL's
    // hasDefaultBranchCacheWriteAccess goes true again for this job.
    for (const cacheWriteEvent of ['push', 'workflow_dispatch', 'repository_dispatch', 'schedule']) {
      expect(onBlock).not.toMatch(new RegExp(`\\n {2}${cacheWriteEvent}:`))
    }
  })

  // The load-bearing assertion for fleet-review.yml's own trigger list:
  // `pull_request` scoped to `types: [labeled]` ONLY (never `synchronize`,
  // which would reopen the every-push bug #812 fixed the first time) plus
  // `workflow_dispatch` for manual debugging, and specifically never `push`
  // or `merge_group` — `merge_group` reachable here without a matching `if:`
  // arm (asserted below) would reintroduce the fail-open bug this whole rail
  // exists to prevent (a job instantiated on an event it then skips via
  // `if:`, which GitHub's branch protection treats as satisfied).
  it('fleet-review.yml triggers on pull_request (labeled only) AND workflow_dispatch, and NEVER push or merge_group', () => {
    const onBlock = fleetReviewYaml().split(/\njobs:\n/)[0] ?? ''
    expect(onBlock).toMatch(/\n {2}pull_request:\n {4}types:\s*\[\s*labeled\s*\]/)
    expect(onBlock).toMatch(/\n {2}workflow_dispatch:/)
    // Scoped to the LITERAL pull_request trigger sub-block (from its own
    // `\n  pull_request:` line to the next 2-space-indented key), not the
    // whole pre-`jobs:` text — the file's own prose comments above `on:`
    // legitimately discuss why `synchronize` is absent, and a whole-text
    // check would fail on that explanation rather than on an actual second
    // `types:` entry.
    const pullRequestBlock = onBlock.match(/\n {2}pull_request:\n((?:\n| {4,}.*\n)*)/)?.[0] ?? ''
    expect(pullRequestBlock.length, 'pull_request trigger sub-block not found').toBeGreaterThan(0)
    expect(pullRequestBlock, 'fleet-review.yml pull_request trigger must be labeled-only — adding synchronize reopens the every-push bug')
      .not.toContain('synchronize')
    for (const forbiddenEvent of ['push', 'merge_group']) {
      expect(onBlock, `fleet-review.yml must never trigger on "${forbiddenEvent}" — that reopens the fail-open bug`)
        .not.toMatch(new RegExp(`\\n {2}${forbiddenEvent}:`))
    }
  })

  /** The JOB-level `if:`, not a step's — always at exactly four-space
   *  indentation, always before `steps:`, in this file's own convention
   *  (matching `runs-on:`/`permissions:` at the same level). A step-level
   *  `if:` (e.g. `lint`'s `if: steps.changed.outputs.files != ''`) sits
   *  deeper, inside `steps:`, and must never be mistaken for this one. */
  function jobLevelIf(block: string): string {
    const beforeSteps = block.split(/\n {4}steps:\n/)[0] ?? block
    return beforeSteps.match(/\n {4}if:\s*(.+)/)?.[1] ?? ''
  }

  it('fleet/verify runs on merge_group (in addition to pull_request)', () => {
    const ifLine = jobLevelIf(jobBlock(fleetVerifyYaml(), 'fleet-verify'))
    expect(ifLine).toContain('merge_group')
    expect(ifLine).toContain('pull_request')
  })

  /**
   * #848 fixed the fail-open bug once, by moving the job out of `ci.yml`,
   * and then reintroduced the SAME bug class inside this very file: a
   * job-level `if: github.event_name == 'workflow_dispatch' ||
   * github.event.label.name == 'review'` on a job whose trigger is
   * `pull_request: types: [labeled]` — which GitHub cannot filter by label
   * VALUE — so applying ANY other label (e.g. `agent-dispatchable`) still
   * INSTANTIATES the job and the `if:` then SKIPS it, satisfying branch
   * protection with no review ever run. `fleet/review`'s own verdict on
   * this PR (#848's own follow-up) is what caught it before merge.
   *
   * The fix this rail pins: NO job-level `if:` at all, ever again. What
   * used to be that `if:` is now the "Decide whether to run the review
   * engine" step, further down in the job, whose exit code and `outcome`
   * output are what the LATER steps key off — see the rails below this one.
   */
  it('fleet/review carries NO job-level if: at all — a job-level if: on this trigger is exactly the fail-open bug this file exists to prevent', () => {
    const ifLine = jobLevelIf(jobBlock(fleetReviewYaml(), 'fleet-review'))
    expect(ifLine).toBe('')
  })

  /** A single step's own `if:`, found by its `name:` — scoped from that
   *  step's own `- name: <name>` line to the next `\n      - name:` (or
   *  `\n      - uses:`) at the same six-space step indentation, so a later
   *  step's `if:` (or lack of one) is never mistaken for this step's. */
  function stepIf(block: string, stepName: string): string {
    const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stepHeaderRe = new RegExp(`\\n {6}- name: ${escaped}\\n`)
    const m = block.match(stepHeaderRe)
    if (m === null || m.index === undefined) {
      throw new Error(`no "- name: ${stepName}" step found — the grep must not pass vacuously`)
    }
    // The newline ending the "- name: ..." line itself, kept as the LEADING
    // newline of `rest` — every downstream match below (the next step
    // header, this step's own `if:`) is anchored on `\n {N}...`, so a `rest`
    // missing its own leading newline would silently fail to match its
    // FIRST line, exactly the bug this comment replaces.
    const nameLineEnd = block.indexOf('\n', m.index + 1)
    const rest = block.slice(nameLineEnd)
    const nextStep = rest.search(/\n {6}- (name|uses):/)
    const stepBlock = nextStep === -1 ? rest : rest.slice(0, nextStep)
    return stepBlock.match(/\n {8}if:\s*(.+)/)?.[1] ?? ''
  }

  it('finds real steps to scan at all — the stepIf grep must not pass vacuously', () => {
    const block = jobBlock(fleetReviewYaml(), 'fleet-review')
    expect(() => stepIf(block, 'Setup Bun')).not.toThrow()
  })

  // The ctx step's own shell computes `requested` — the property the old
  // job-level `if:` encoded — from the SAME two conditions the old `if:`
  // used: a manual workflow_dispatch, or the label just applied being named
  // exactly `review`. A mutation that drops the label condition, or widens
  // it to a bare `event_name == 'pull_request'` (which would make every
  // label event "requested"), must fail this test — that is the exact
  // fail-open shape #848 shipped.
  it('the ctx step computes "requested" from workflow_dispatch OR the review label, never a bare pull_request event_name check', () => {
    const block = jobBlock(fleetReviewYaml(), 'fleet-review')
    expect(block).toMatch(/EVENT_NAME"\s*==\s*"workflow_dispatch"\s*\|\|\s*"\$LABEL_NAME"\s*==\s*"review"/)
    expect(block).not.toMatch(/"\$EVENT_NAME"\s*==\s*"pull_request"\s*\]\];\s*then\s*\n\s*requested=true/)
    expect(block).toMatch(/echo "requested=\$requested"/)
  })

  // The gate step is what used to be the job-level `if:` (see the rail
  // above) — it must never itself be conditioned on its OWN output, or it
  // could never run at all.
  it('the "Decide whether to run the review engine" step (the gate) always runs — it is never itself gated', () => {
    const block = jobBlock(fleetReviewYaml(), 'fleet-review')
    expect(stepIf(block, 'Decide whether to run the review engine')).toBe('')
    expect(block).toMatch(/- name: Decide whether to run the review engine\n\s+id: gate\n/)
    expect(block).toContain('bun orchestrator/src/cli.ts review-gate')
  })

  // The load-bearing assertion for the new design: EVERY step that can
  // spend a model call — installing the engine, authenticating it, the
  // smoke test (which itself makes a real provider call), and the real
  // review — is gated on `steps.gate.outputs.outcome == 'run-engine'`.
  // Dropping this `if:` from any one of them is branch (a)/(c) calling the
  // engine anyway — exactly the "cheap and non-destructive" property the
  // cache-hit/not-requested branches exist to guarantee.
  it.each([
    'Install the non-author review engine',
    'Authenticate the review engine',
    'Smoke-test the review engine',
    'Check the base provides the gate',
    'Review',
  ])('the "%s" step only runs when the gate said run-engine', (stepName) => {
    const block = jobBlock(fleetReviewYaml(), 'fleet-review')
    expect(stepIf(block, stepName)).toBe("steps.gate.outputs.outcome == 'run-engine'")
  })

  // Branch (c)'s fail-closed message, verbatim — an operator or agent
  // reading a red `fleet/review` must be told exactly what to do (apply the
  // `review` label), not left to guess why a check that "did nothing" is
  // failing.
  it('the review-gate CLI command fails with the exact "review not requested" message on branch (c)', () => {
    const text = readFileSync(join(process.cwd(), 'orchestrator', 'src', 'cli.ts'), 'utf8')
    // Backtick-escaped in the SOURCE (this string is built inside a
    // template literal, so a literal backtick in the source is `\``, not
    // `` ` ``) — matched here against the raw file text, not the runtime
    // string it evaluates to.
    expect(text).toContain('review not requested — add the \\`review\\` label to run the non-author review')
  })

  it('fleet/review still carries no write permission and no --approve', () => {
    const block = jobBlock(fleetReviewYaml(), 'fleet-review')
    const permsBlock = block.match(/\n {4}permissions:\n((?:\s{6}.*\n)*)/)?.[1] ?? ''
    expect(permsBlock.length, 'fleet-review has no permissions: block to check').toBeGreaterThan(0)
    // Actual `key: value` permission lines only — comment lines (this very
    // block explains, in prose, why there is no `: write` here, which would
    // otherwise make the string "`: write`" match its own explanation).
    const permissionLines = permsBlock.split('\n').filter((l) => !l.trim().startsWith('#') && l.trim().length > 0)
    for (const line of permissionLines) expect(line).not.toMatch(/:\s*write\b/)
    expect(fleetReviewYaml()).not.toContain('--approve')
    // The workflow-level `permissions: {}` (deny-all) too, matching
    // fleet-verify.yml's and ci.yml's own convention — belt-and-suspenders
    // on top of the job-level grants asserted above. Zero-indented: a
    // top-level key, sibling to `on:`/`jobs:`, not nested under either.
    const onBlock = fleetReviewYaml().split(/\njobs:\n/)[0] ?? ''
    expect(onBlock).toMatch(/\npermissions:\s*\{\}/)
  })

  // `ci-status` aggregates the repo's OWN required jobs (never fleet/verify
  // or fleet/review — see the "Fleet gates" comment above fleet-verify for
  // why those stay out of its `needs`). Every one of them must also report
  // on `merge_group`: a required check that only reports on `pull_request`
  // or `push` leaves its status permanently missing on the queue ref, and a
  // missing required check blocks the queue forever rather than failing it
  // loudly.
  it('every job ci-status depends on can report on merge_group', () => {
    const yaml = ciYaml()
    const needsLine = jobBlock(yaml, 'ci-status').match(/\n\s*needs:\s*\[([^\]]+)\]/)?.[1] ?? ''
    const required = needsLine.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    expect(required.length, 'ci-status needs list parsed empty — the grep must not pass vacuously').toBeGreaterThan(5)

    const excludesMergeGroup = (ifLine: string): boolean => {
      // A job with NO if: at all runs on every event the workflow triggers
      // on — merge_group included, now that it is in the workflow's `on:`.
      if (ifLine.length === 0) return false
      // An `if:` that names an event at all must name merge_group too, or
      // it silently excludes the one event this rail is about; an `if:`
      // that never mentions an event (e.g. `needs.changes.outputs...`) is
      // unaffected by which event triggered the run and passes through.
      const namesAnEvent = /event_name|github\.event\.(before|after|head_commit)/.test(ifLine)
      return namesAnEvent && !ifLine.includes('merge_group')
    }

    const offenders: string[] = []
    for (const job of required) {
      const ifLine = jobLevelIf(jobBlock(yaml, job))
      if (excludesMergeGroup(ifLine)) offenders.push(`${job}: if: ${ifLine}`)
    }
    expect(offenders, `required job(s) whose if: excludes merge_group:\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * #812: a release PR (knope, title `chore(release): v...`) was permanently
 * unmergeable. `changes` (ci.yml) and its ios-e2e.yml twin both carried
 * `if: "!startsWith(github.event.head_commit.message, 'chore(release):')"`,
 * unconditionally, on a workflow that ALSO triggers on `pull_request` and
 * `merge_group`. `github.event.head_commit` only exists on a `push`
 * payload — on every other event it is `null`, and `startsWith(null, ...)`
 * coerces to `startsWith('', ...)`, which is `false`, so the negated guard
 * happened to evaluate to "run" there. That is an accident of null
 * coercion, not a scoped condition: the day this job (or one shaped like
 * it) gains any OTHER push-shaped trigger, or GitHub's null-coercion
 * behavior for a removed context field ever changes, the same starvation
 * reappears from a different angle. `ci-status`, `gitleaks`, `fleet/verify`
 * and `fleet/review` are all REQUIRED contexts (ruleset 15885614); a
 * required context that never reports blocks a merge exactly like a red
 * one, and unlike a plain bug this one is invisible in a diff review — the
 * guard reads correct in isolation, it only starves on the specific event
 * type its author never pictured a release commit arriving as.
 *
 * The fix pins the scope explicitly instead of relying on the coercion:
 * `github.event_name != 'push' || !startsWith(...)`. On `push`, behavior is
 * unchanged (the original, since-#812 intent — see commit 60b1e6c69,
 * `fix(security): audit R6 medium`, which introduced this exact guard on
 * the (now-removed) `audit` job to skip its own then-adjacent `version` job
 * on the automated release commit — knope's PR-based release flow, and
 * therefore any `pull_request` shape for a release commit, did not exist
 * yet). On every other event, the first clause short-circuits the guard to
 * always-run, by construction rather than by what a missing field happens
 * to coerce to.
 */
describe('rail: the release-commit guard never starves a pull_request/merge_group run (#812)', () => {
  const workflowYaml = (file: string): string =>
    readFileSync(join(process.cwd(), '.github', 'workflows', file), 'utf8')

  /** Job block extraction — same convention as the other describe blocks in
   *  this file: from a job's `  <name>:` header to the next job at the same
   *  two-space indentation. */
  function jobBlock(text: string, name: string): string {
    const jobHeaderRe = /\n {2}([a-zA-Z0-9_-]+):\n/g
    const starts: { name: string; index: number }[] = []
    for (const m of text.matchAll(jobHeaderRe)) starts.push({ name: m[1] as string, index: m.index })
    const at = starts.findIndex((s) => s.name === name)
    if (at === -1) throw new Error(`no "${name}:" job found in this workflow file — the grep must not pass vacuously`)
    const end = at + 1 < starts.length ? starts[at + 1]?.index : text.length
    return text.slice(starts[at]?.index, end)
  }

  /** The JOB-level `if:` — four-space indentation, before `steps:`, matching
   *  this file's other `jobLevelIf` helpers. */
  function jobLevelIf(block: string): string {
    const beforeSteps = block.split(/\n {4}steps:\n/)[0] ?? block
    return beforeSteps.match(/\n {4}if:\s*(.+)/)?.[1] ?? ''
  }

  /**
   * Evaluates ONLY the exact two-clause shape this guard is pinned to
   * (`github.event_name != '<event>' || !startsWith(github.event.head_
   * commit.message, '<prefix>')`), against a literal (event, message) pair.
   * `headCommitMessage: null` models a payload where `head_commit` does not
   * exist at all (every non-`push` event) — GitHub Actions' own null
   * coercion for `startsWith` treats that as `''`, reproduced here rather
   * than re-invoked, since no GitHub Actions expression engine is available
   * in a unit test.
   *
   * Throwing when the shape doesn't match is deliberate, not a missing
   * feature: re-adding the old unscoped guard (no `event_name` clause at
   * all) must fail this rail, not silently pass it by falling through to
   * some looser match.
   */
  function evalReleaseGuard(ifLine: string, eventName: string, headCommitMessage: string | null): boolean {
    const m = ifLine.match(/^"?github\.event_name != '(\w+)' \|\| !startsWith\(github\.event\.head_commit\.message, '([^']+)'\)"?$/)
    if (m === null) throw new Error(`"${ifLine}" does not match the expected two-clause, push-scoped guard shape`)
    const pushEvent = m[1] as string
    const prefix = m[2] as string
    if (eventName !== pushEvent) return true
    return !(headCommitMessage ?? '').startsWith(prefix)
  }

  for (const file of ['ci.yml', 'ios-e2e.yml']) {
    it(`${file}'s "changes" job guard names github.event_name — not just the message`, () => {
      const ifLine = jobLevelIf(jobBlock(workflowYaml(file), 'changes'))
      expect(ifLine, `no if: found on ${file}'s changes job`).not.toBe('')
      expect(ifLine).toContain("github.event_name != 'push'")
    })

    it(`${file}: a "chore(release):"-titled commit still yields a run on pull_request and merge_group (mutation: re-add the unscoped guard → this fails)`, () => {
      const ifLine = jobLevelIf(jobBlock(workflowYaml(file), 'changes'))
      // Original push-only intent preserved: a real release commit landing
      // via push still skips this job.
      expect(evalReleaseGuard(ifLine, 'push', 'chore(release): v1.2.3')).toBe(false)
      // Any other push commit message still runs it.
      expect(evalReleaseGuard(ifLine, 'push', 'fix: something')).toBe(true)
      // pull_request, merge_group and workflow_dispatch never carry
      // head_commit at all — the job must run regardless of what a
      // release-shaped title would have said.
      for (const eventName of ['pull_request', 'merge_group', 'workflow_dispatch']) {
        expect(evalReleaseGuard(ifLine, eventName, null)).toBe(true)
        expect(evalReleaseGuard(ifLine, eventName, 'chore(release): v1.2.3')).toBe(true)
      }
    })
  }
})

/**
 * CodeQL `actions/cache-poisoning/poisonable-step` (3 HIGH alerts, PR #844
 * round 3, originally at the "Install dependencies", "Check the base
 * provides the gate" and "Verify" steps of `fleet-verify` back when it lived
 * in `ci.yml`). The mechanism, read from CodeQL's own `actions` query pack
 * (`codeql/actions-all`, `CachePoisoningQuery.qll` + `PoisonableSteps.qll` +
 * `ext/config/poisonable_steps.yml`), is NOT about any specific
 * cache-writing action:
 *
 * - `poisonableCommandsDataModel` lists bare command names whose lifecycle
 *   scripts/plugins could act on the job's ambient `ACTIONS_RUNTIME_TOKEN`
 *   (which grants cache read/write independent of any `actions/cache` step
 *   being present at all) — `bun` is literally on that list, alongside
 *   `npm`/`cargo`/`pip install -r`/etc. Every `run: bun ...` step in the job
 *   is a "poisonable step" by definition, regardless of caching config.
 * - `hasDefaultBranchCacheWriteAccess(job, event)` is true when the job's
 *   EVENT has default-branch cache-write scope — `push`, `workflow_dispatch`,
 *   `repository_dispatch`, `delete`, `registry_package`, `page_build`, or
 *   `schedule` (NOT `pull_request`, NOT `merge_group` — neither appears in
 *   that list). Critically, `JobImpl.getATriggerEvent()` returns every event
 *   the ENCLOSING WORKFLOW responds to, not filtered by the job's own `if:`.
 *   `fleet-verify` sat in `ci.yml`, which also triggers on `push` and
 *   `workflow_dispatch` for its other jobs, so CodeQL treated `fleet-verify`
 *   as reachable from both — regardless of its `if:` excluding them.
 *
 * Tried first and confirmed NOT sufficient: `no-cache: true` on the "Setup
 * Bun" step. It genuinely disables `setup-bun`'s own cache-save (verified by
 * reading its `dist/setup/index.js` and `dist/cache-save/index.js`), but
 * CodeQL's model never inspects that input at all — the flagged "poisonable
 * steps" are the `bun` commands themselves. The fix that actually cleared
 * the alerts (verified via the `code-scanning/alerts` API against the exact
 * commit) is what this rail asserts: `fleet-verify` moved into its OWN
 * workflow file (`fleet-verify.yml`) whose `on:` block is `pull_request` +
 * `merge_group` only — neither has default-branch cache-write access, so
 * `hasDefaultBranchCacheWriteAccess` is false for every event this job can
 * be triggered by, full stop. `no-cache: true` is kept as defense in depth
 * (asserted below) but is not what CodeQL is actually satisfied by.
 *
 * `fleet/review` is deliberately NOT covered here: it never executes HEAD
 * code, only reads it as data for the review model (the "Export the PR head
 * as data" step strips and never runs it), and its explicit
 * `secrets.FLEET_REVIEW_API_KEY` access makes CodeQL's `isPrivileged()` true
 * for that job — which this specific query excludes on purpose (a privileged
 * job reachable by an externally-triggerable event is the subject of a
 * different, more severe query instead). CodeQL agrees either way: 0 alerts
 * on `fleet/review`. If a future job gains both a head-code-execution step
 * and reachability from a workflow with `push`/`workflow_dispatch`, it needs
 * the same file-isolation treatment, not a per-step cache tweak.
 */
describe('rail: the job that executes the judged commit\'s code cannot be reached by a cache-write event', () => {
  const workflowYaml = (file: string): string =>
    readFileSync(join(process.cwd(), '.github', 'workflows', file), 'utf8')

  /** One named job's text, from its `  <name>:` line up to the next job at
   *  the same two-space indentation. */
  function jobBlock(text: string, name: string): string {
    const jobHeaderRe = /\n {2}([a-zA-Z0-9_-]+):\n/g
    const starts: { name: string; index: number }[] = []
    for (const m of text.matchAll(jobHeaderRe)) starts.push({ name: m[1] as string, index: m.index })
    const at = starts.findIndex((s) => s.name === name)
    if (at === -1) throw new Error(`no "${name}:" job found in this workflow file — the grep must not pass vacuously`)
    const end = at + 1 < starts.length ? starts[at + 1]?.index : text.length
    return text.slice(starts[at]?.index, end)
  }

  /** One named step's text within a job block, from its `      - name:` line
   *  (six-space indent — every step in these files) up to the next step at
   *  the same indentation. */
  function stepBlock(block: string, name: string): string {
    const stepHeaderRe = /\n {6}- name: ([^\n]+)\n/g
    const starts: { name: string; index: number }[] = []
    for (const m of block.matchAll(stepHeaderRe)) starts.push({ name: (m[1] as string).trim(), index: m.index })
    const at = starts.findIndex((s) => s.name === name)
    if (at === -1) throw new Error(`no "${name}" step found in this job block — the grep must not pass vacuously`)
    const end = at + 1 < starts.length ? starts[at + 1]?.index : block.length
    return block.slice(starts[at]?.index, end)
  }

  // Hardcoded, not derived — see the doc comment above. Each entry is a job
  // that has a step running code from the PR HEAD export, mapped to the
  // workflow file that must isolate it from default-branch-cache-write
  // events. Mirrors this file's existing convention of a hardcoded,
  // human-reviewed table (see `REQUIRED_CONTEXT_WORKFLOWS` below) rather than
  // a derived lookup that could only ever agree with itself.
  const JOBS_THAT_EXECUTE_HEAD_CODE: { job: string; file: string }[] = [{ job: 'fleet-verify', file: 'fleet-verify.yml' }]

  // Any event name CodeQL's `defaultBranchCacheWriteEvent()` treats as
  // granting cache-write access to the default branch. `pull_request` and
  // `merge_group` are deliberately absent from this list — they are the only
  // two events fleet-verify.yml may trigger on.
  const CACHE_WRITE_EVENTS = ['push', 'workflow_dispatch', 'repository_dispatch', 'delete', 'registry_package', 'page_build', 'schedule']

  for (const { job, file } of JOBS_THAT_EXECUTE_HEAD_CODE) {
    it(`${job} (${file}) still executes HEAD code (the premise this rail depends on)`, () => {
      const block = jobBlock(workflowYaml(file), job)
      // The "Verify" step is what actually runs the judged commit's tests —
      // see verify-ci in orchestrator/src/ci.ts. If this step is ever
      // renamed or removed, the premise of this rail changes and it must be
      // revisited, not silently pass.
      expect(() => stepBlock(block, 'Verify')).not.toThrow()
    })

    it(`${job}'s workflow (${file}) triggers on pull_request and merge_group only — no default-branch-cache-write event`, () => {
      const onBlock = workflowYaml(file).split(/\njobs:\n/)[0] ?? ''
      expect(onBlock).toMatch(/\n {2}pull_request:/)
      expect(onBlock).toMatch(/\n {2}merge_group:/)
      for (const cacheWriteEvent of CACHE_WRITE_EVENTS) {
        expect(onBlock, `${file} must not trigger on "${cacheWriteEvent}" — that would restore CodeQL's cache-write reachability`)
          .not.toMatch(new RegExp(`\\n {2}${cacheWriteEvent}:`))
      }
    })

    it(`${job}'s "Setup Bun" step disables cache-save (no-cache: true) — defense in depth, not the CodeQL fix itself`, () => {
      const setupBun = stepBlock(jobBlock(workflowYaml(file), job), 'Setup Bun')
      expect(setupBun).toContain('oven-sh/setup-bun@')
      expect(setupBun).toMatch(/\n\s*no-cache:\s*true\b/)
    })
  }

  // fleet/review is the documented exception: it never executes HEAD code,
  // so its own workflow file (fleet-review.yml, which DOES also trigger on
  // workflow_dispatch) needing no CodeQL cache-poisoning isolation is
  // correct, not an oversight — see that file's own header comment. This
  // assertion exists so a future edit can't "fix" that job's isolation the
  // same way without first confirming it still holds.
  it('fleet/review (fleet-review.yml) still never runs a step named "Verify" (the exception this rail relies on)', () => {
    const block = jobBlock(workflowYaml('fleet-review.yml'), 'fleet-review')
    expect(() => {
      const stepHeaderRe = /\n {6}- name: Verify\n/
      if (stepHeaderRe.test(block)) throw new Error('fleet-review now has a "Verify" step')
    }).not.toThrow()
  })
})

/**
 * Ruleset 15885614 (the merge queue's branch protection ruleset) requires
 * exactly these four status contexts before a PR can merge: `ci-status`,
 * `gitleaks`, `fleet/verify`, `fleet/review`. A required context that never
 * reports on the queue's own `merge_group` ref blocks the merge queue
 * forever — GitHub waits indefinitely for a check that will never appear,
 * rather than failing loudly. `CodeQL` is the fifth required context but is
 * GitHub default-setup, not a workflow file in this repo, so it is
 * deliberately excluded from this table (see the operator step in the PR
 * body for verifying it separately once the queue is live).
 *
 * The mapping below is hardcoded rather than derived, on purpose: this rail
 * exists to catch a workflow file quietly losing its `merge_group` trigger
 * (as `secret-scan.yml` had, until #844), and a derived lookup would only
 * ever tell you the code agrees with itself.
 *
 * `fleet/verify` moved from `ci.yml` to its own `fleet-verify.yml` in round 3
 * of #844 (CodeQL cache-poisoning isolation — see the rail above), updated
 * here to match, or this rail would itself start failing vacuously against a
 * job that no longer exists in `ci.yml`.
 *
 * `fleet/review` is DELIBERATELY NOT in this table. It moved off
 * `merge_group` entirely (see the "runs once per review label" rail above):
 * a `workflow_dispatch`-only trigger could never satisfy a required PR
 * context in the first place (verified on #848), and keeping `merge_group`
 * as a trigger while excluding it from the job's `if:` would recreate the
 * exact fail-open bug this whole file of rails exists to catch. This is safe
 * TODAY because this repo's merge queue is unavailable (owner type `User` —
 * the ruleset's `merge_queue` rule is rejected outright, see
 * fleet-review.yml's own header). The day an org migration enables the
 * queue, `fleet/review` genuinely will not report on a `merge_group` ref and
 * the queue will stall on it forever — that migration must re-add a
 * `merge_group` arm to both the trigger and the job's `if:` together, not
 * silently inherit this gap. The assertion below pins that `fleet/review`
 * does NOT trigger on `merge_group`, specifically so a future PR that adds
 * it back without also fixing the `if:` fails loudly here instead of
 * reintroducing the bug quietly.
 */
describe('rail: every ruleset-15885614-required context reports on merge_group, except fleet/review', () => {
  const REQUIRED_CONTEXT_WORKFLOWS: Record<string, string> = {
    'ci-status': 'ci.yml',
    'fleet/verify': 'fleet-verify.yml',
    gitleaks: 'secret-scan.yml',
  }

  const workflowYaml = (file: string): string =>
    readFileSync(join(process.cwd(), '.github', 'workflows', file), 'utf8')

  /** Scoped to the workflow's own top-level `on:` block, before `jobs:` —
   *  `merge_group` also shows up in prose comments and job bodies (env vars,
   *  context field names), and this must only match the trigger itself. */
  function triggersOnMergeGroup(yaml: string): boolean {
    const onBlock = yaml.split(/\njobs:\n/)[0] ?? ''
    return /\n {2}merge_group:/.test(onBlock)
  }

  it('the mapping table itself is non-empty and covers the three merge_group-reporting contexts', () => {
    expect(Object.keys(REQUIRED_CONTEXT_WORKFLOWS).sort()).toEqual(
      ['ci-status', 'fleet/verify', 'gitleaks'].sort(),
    )
  })

  for (const [context, workflowFile] of Object.entries(REQUIRED_CONTEXT_WORKFLOWS)) {
    it(`"${context}" is produced by ${workflowFile}, which triggers on merge_group`, () => {
      expect(triggersOnMergeGroup(workflowYaml(workflowFile))).toBe(true)
    })
  }

  it('fleet/review (fleet-review.yml) does NOT trigger on merge_group — known and deliberate while the merge queue is unavailable', () => {
    expect(triggersOnMergeGroup(workflowYaml('fleet-review.yml'))).toBe(false)
  })
})

/**
 * The review engine's own turn/timeout budget (review.ts) — cut from a
 * 20-turn/25-minute high-impact allowance to a single pass, because that
 * allowance was enough for one review to explore the export at length
 * rather than read the diff and file list it was already handed (both are
 * now in the prompt — see `buildReviewPrompt`), which burned the same
 * provider quota per call that moving off `pull_request` (the rail above)
 * fixed per PR. Pinned to the actual exported numbers, not a description of
 * them: a PR that quietly raises `HIGH_IMPACT_MAX_TURNS` back toward its old
 * value must fail THIS test, not just read wrong in a comment.
 */
describe('rail: the reviewer gets a single pass, not an investigation', () => {
  it('caps turns at a small, single-pass budget', () => {
    expect(DEFAULT_MAX_TURNS).toBe(2)
    expect(HIGH_IMPACT_MAX_TURNS).toBe(3)
    // High impact may get a LITTLE more room, never a return to "explore the
    // export" scale — this is the inequality a mutation raising the cap back
    // toward 20 would still violate even if it forgot to update the exact
    // values above.
    expect(HIGH_IMPACT_MAX_TURNS).toBeGreaterThanOrEqual(DEFAULT_MAX_TURNS)
    expect(HIGH_IMPACT_MAX_TURNS).toBeLessThanOrEqual(3)
  })

  it('drops the high-impact timeout from 25 minutes to about 8', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(5 * 60_000)
    expect(HIGH_IMPACT_TIMEOUT_MS).toBe(8 * 60_000)
    expect(HIGH_IMPACT_TIMEOUT_MS).toBeLessThanOrEqual(10 * 60_000)
    expect(HIGH_IMPACT_TIMEOUT_MS).toBeGreaterThanOrEqual(DEFAULT_TIMEOUT_MS)
  })
})

describe('review-cache: pure key functions', () => {
  it('hashes deterministically, and differently for a different diff', () => {
    const a = diffHash('diff --git a/x b/x\n+hello\n')
    const b = diffHash('diff --git a/x b/x\n+hello\n')
    const c = diffHash('diff --git a/x b/x\n+goodbye\n')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('names an artifact with only characters safe in a URL query param and an Actions artifact name', () => {
    const name = cacheArtifactName('42', diffHash('anything'))
    expect(name).toMatch(/^[a-zA-Z0-9-]+$/)
    expect(name).toContain('42')
  })

  it('never names two different PRs\' identical diffs the same artifact', () => {
    const hash = diffHash('same diff content')
    expect(cacheArtifactName('1', hash)).not.toBe(cacheArtifactName('2', hash))
  })
})

/**
 * "Exactly one review per PR" — the operator addendum this rail pins. Tested
 * against `runReviewCi` directly with an injected in-memory `ReviewCache`,
 * never against the real `artifactReviewCache` (which talks to the Actions
 * API): the property under test is `ci.ts`'s OWN branching — look up before
 * invoking the engine, record only a fresh PASS, treat a lookup failure
 * exactly like a miss — not whether GitHub's artifact API works.
 */
describe('rail: fleet/review reviews exactly once per diff, never twice on an identical re-queue', () => {
  const lane = (): Lane => ({
    id: 'ios', mode: 'off', cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: ['needs-human'],
    scope: { owned: ['apps/ios/'], notOwned: [] },
  })
  const ctx = (): CiContext => ({
    branch: 'fleet/ios/123', repoDir: '/base', headDir: '/tmp/head',
    baseSha: 'base111', headSha: 'head222', pr: '42',
  })
  const passing: VerifyReport = {
    passed: true, reasons: [], changedFiles: ['apps/ios/a.swift'], addedLines: 3,
    impact: 'low', impactReasons: [], testsRun: ['orchestrator'], testsPassed: true, verifiedCommit: 'c0ffee',
  }

  /** An in-memory `ReviewCache`, seeded with zero or one PASS entries — never
   *  the real Actions-backed one, which this suite is not testing. */
  function fakeCache(seed?: { key: ReviewCacheKey; verdict: CachedVerdict }): ReviewCache & { recordCalls: number } {
    const store = new Map<string, CachedVerdict>()
    if (seed !== undefined) store.set(`${seed.key.pr}:${seed.key.diffHash}`, seed.verdict)
    const cache = {
      recordCalls: 0,
      async lookup(key: ReviewCacheKey) { return store.get(`${key.pr}:${key.diffHash}`) },
      async record(key: ReviewCacheKey, verdict: CachedVerdict) {
        cache.recordCalls += 1
        store.set(`${key.pr}:${key.diffHash}`, verdict)
      },
    }
    return cache
  }

  const deps = (over: Partial<ReviewCiDeps> = {}): ReviewCiDeps => ({
    ctx: ctx(),
    apiKey: 'a-key',
    lanes: async () => [lane()],
    verify: vi.fn(async () => passing),
    pathExists: (p) => p !== '/tmp/head/.git',
    log: () => {},
    prDiff: vi.fn(async () => 'diff --git a/x b/x\n+hello\n'),
    secondOpinion: vi.fn(async () => ({ verdict: 'PASS' as const, text: 'looks fine\nVERDICT: PASS' })),
    ...over,
  })

  it('records a fresh PASS exactly once', async () => {
    const cache = fakeCache()
    const v = await runReviewCi(deps({ cache }))
    expect(v.ok).toBe(true)
    expect(cache.recordCalls).toBe(1)
  })

  it('re-publishes a cached PASS for an identical diff instead of invoking the engine again', async () => {
    const diff = 'diff --git a/x b/x\n+hello\n'
    const cache = fakeCache({
      key: { pr: '42', diffHash: diffHash(diff) },
      verdict: { verdict: 'PASS', text: 'VERDICT: PASS (cached)' },
    })
    const secondOpinion = vi.fn(async () => ({ verdict: 'PASS' as const, text: 'VERDICT: PASS' }))
    const v = await runReviewCi(deps({ cache, prDiff: vi.fn(async () => diff), secondOpinion }))
    expect(v.ok).toBe(true)
    expect(secondOpinion).not.toHaveBeenCalled()
  })

  // A re-queue after the queue rebases this PR onto a newer main changes the
  // head SHA but not the PR's own diff — the cache must still hit. Proven
  // here by feeding the SAME diff text through two calls with a DIFFERENT
  // ctx.headSha, rather than trusting that the key is diff-based by reading
  // the implementation.
  it('hits the cache across two different head SHAs, given the identical diff', async () => {
    const diff = 'diff --git a/x b/x\n+hello\n'
    const cache = fakeCache()
    const secondOpinion = vi.fn(async () => ({ verdict: 'PASS' as const, text: 'VERDICT: PASS' }))
    await runReviewCi(deps({ cache, prDiff: vi.fn(async () => diff), secondOpinion, ctx: ctx() }))
    expect(secondOpinion).toHaveBeenCalledTimes(1)
    await runReviewCi(deps({
      cache, prDiff: vi.fn(async () => diff), secondOpinion,
      ctx: { ...ctx(), headSha: 'a-totally-different-rebased-head-sha' },
    }))
    expect(secondOpinion).toHaveBeenCalledTimes(1)
  })

  // The load-bearing property: nothing that ever returns FAIL is reused. A
  // FAIL is never recorded in the first place, so a second call with the
  // identical diff invokes the engine again rather than re-publishing.
  it('never reuses a FAIL — a diff that failed is reviewed again next time', async () => {
    const diff = 'diff --git a/x b/x\n+bad\n'
    const cache = fakeCache()
    const failing = vi.fn(async () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL — leaks a key' }))
    const first = await runReviewCi(deps({ cache, prDiff: vi.fn(async () => diff), secondOpinion: failing }))
    expect(first.ok).toBe(false)
    expect(cache.recordCalls).toBe(0)

    const second = await runReviewCi(deps({ cache, prDiff: vi.fn(async () => diff), secondOpinion: failing }))
    expect(second.ok).toBe(false)
    expect(failing).toHaveBeenCalledTimes(2)
  })

  // "If the lookup errors, run the engine (fail safe)." A cache whose lookup
  // throws must never be mistaken for a cache that found nothing AND must
  // never be mistaken for a cache that found a PASS — the only safe
  // direction is to run the engine, exactly like a real miss.
  it('runs the engine when the cache lookup throws, rather than failing the job or assuming a pass', async () => {
    const cache: ReviewCache = {
      lookup: vi.fn(async () => { throw new Error('artifacts API rate limited') }),
      record: vi.fn(async () => {}),
    }
    const secondOpinion = vi.fn(async () => ({ verdict: 'PASS' as const, text: 'VERDICT: PASS' }))
    const v = await runReviewCi(deps({ cache, secondOpinion }))
    expect(v.ok).toBe(true)
    expect(secondOpinion).toHaveBeenCalledTimes(1)
  })

  // A cache record failure must not un-pass a review the engine already
  // passed — recording is a courtesy to the NEXT run, not a gate on this one.
  it('still returns the fresh PASS even when recording it fails', async () => {
    const cache: ReviewCache = {
      lookup: vi.fn(async () => undefined),
      record: vi.fn(async () => { throw new Error('disk full') }),
    }
    const v = await runReviewCi(deps({ cache }))
    expect(v.ok).toBe(true)
  })

  // No `cache` at all (the default before this existed, and any call site
  // that never heard of one) must behave exactly as it always did: review
  // every time, no lookup, no record.
  it('behaves exactly as before when no cache is wired in at all', async () => {
    const secondOpinion = vi.fn(async () => ({ verdict: 'PASS' as const, text: 'VERDICT: PASS' }))
    const v = await runReviewCi(deps({ secondOpinion }))
    expect(v.ok).toBe(true)
    expect(secondOpinion).toHaveBeenCalledTimes(1)
  })
})

/**
 * `decideReviewGate` is what `fleet-review.yml`'s "Decide whether to run the
 * review engine" step calls — the runtime logic behind the three branches
 * the file header (and the YAML rails above) describe. Those YAML rails pin
 * the WIRING (which steps key off `outcome == 'run-engine'`, that no
 * job-level `if:` exists); these pin the DECISION ITSELF — the same
 * bootstrap-order split as the CLI: `review-gate` (#851) needs this decision
 * on the base ref before `fleet-review.yml` (#848) can call it — so a
 * mutation that keeps the wiring intact but flips the logic — e.g.
 * concluding `run-engine` when `requested` is false, or `not-requested` when
 * a cache hit exists — still fails a test, even before any workflow YAML
 * exists to call it. Mirrors the `fakeCache` pattern from the "reviews
 * exactly once per diff" rail above, deliberately not shared with it: that
 * suite exercises `runReviewCi`'s full pipeline (verify, secondOpinion,
 * recording); this one exercises only the preflight decision, with no
 * `verify`/`secondOpinion` in sight — a passing test here cannot be mistaken
 * for a passing review.
 */
describe('rail: decideReviewGate enforces the three fleet/review branches (cache-hit / not-requested / run-engine)', () => {
  const ctx = (): CiContext => ({
    branch: 'fleet/ios/123', repoDir: '/base', headDir: '/tmp/head',
    baseSha: 'base111', headSha: 'head222', pr: '42',
  })

  function fakeCache(seed?: { key: ReviewCacheKey; verdict: CachedVerdict }): ReviewCache {
    const store = new Map<string, CachedVerdict>()
    if (seed !== undefined) store.set(`${seed.key.pr}:${seed.key.diffHash}`, seed.verdict)
    return {
      async lookup(key: ReviewCacheKey) { return store.get(`${key.pr}:${key.diffHash}`) },
      async record() { /* decideReviewGate never records — only runReviewCi does */ },
    }
  }

  const diff = 'diff --git a/x b/x\n+hello\n'

  // Branch (a): a cache hit concludes `cache-hit` regardless of whether this
  // event was the `review` label — an unrelated label event on an
  // already-reviewed diff must reuse the verdict, never fall through to
  // `not-requested` or `run-engine`. Proven with `requested: false`, the
  // harder of the two cases: a mutation that checked `requested` BEFORE the
  // cache would send this down the `not-requested` branch instead of
  // reusing the cached PASS.
  it('concludes cache-hit when a prior PASS exists, even when this event did not request a review', async () => {
    const cache = fakeCache({
      key: { pr: '42', diffHash: diffHash(diff) },
      verdict: { verdict: 'PASS', text: 'VERDICT: PASS (cached)' },
    })
    const outcome = await decideReviewGate({
      ctx: ctx(), prDiff: async () => diff, cache, requested: false, log: () => {},
    })
    expect(outcome.kind).toBe('cache-hit')
  })

  // Branch (c): a cache miss on an event that did NOT request a review
  // fails closed — the exact regression this whole PR exists to prevent.
  it('concludes not-requested on a cache miss when this event did not request a review', async () => {
    const cache = fakeCache()
    const outcome = await decideReviewGate({
      ctx: ctx(), prDiff: async () => diff, cache, requested: false, log: () => {},
    })
    expect(outcome.kind).toBe('not-requested')
  })

  // Branch (b): a cache miss on an event that DID request a review (the
  // `review` label, or workflow_dispatch) proceeds to the engine.
  it('concludes run-engine on a cache miss when this event requested a review', async () => {
    const cache = fakeCache()
    const outcome = await decideReviewGate({
      ctx: ctx(), prDiff: async () => diff, cache, requested: true, log: () => {},
    })
    expect(outcome.kind).toBe('run-engine')
  })

  // Same fail-safe direction as `runReviewCi`'s own cache lookup: a lookup
  // that THROWS must never be mistaken for a hit, and must never crash the
  // step — it degrades to a miss, which then still respects `requested`.
  it('treats a throwing cache lookup as a miss, never a hit and never a crash', async () => {
    const cache: ReviewCache = {
      lookup: async () => { throw new Error('artifacts API rate limited') },
      record: async () => {},
    }
    const requestedOutcome = await decideReviewGate({
      ctx: ctx(), prDiff: async () => diff, cache, requested: true, log: () => {},
    })
    expect(requestedOutcome.kind).toBe('run-engine')

    const unrequestedOutcome = await decideReviewGate({
      ctx: ctx(), prDiff: async () => diff, cache, requested: false, log: () => {},
    })
    expect(unrequestedOutcome.kind).toBe('not-requested')
  })

  // The cache key is diff-content-based, matching `runReviewCi`'s own — a
  // hit for PR #42's diff must never leak into a decision for PR #7's
  // identical diff text.
  it('never cross-publishes a cache hit between two different PRs with the identical diff', async () => {
    const cache = fakeCache({
      key: { pr: '42', diffHash: diffHash(diff) },
      verdict: { verdict: 'PASS', text: 'VERDICT: PASS (cached)' },
    })
    const outcome = await decideReviewGate({
      ctx: { ...ctx(), pr: '7' }, prDiff: async () => diff, cache, requested: false, log: () => {},
    })
    expect(outcome.kind).toBe('not-requested')
  })
})

/**
 * `decideReviewGate` itself was never the bug (the suite above already
 * proved every one of its branches, including a throwing cache lookup,
 * degrades correctly). The real, observed failure — run 35403493398 on
 * #630, and the same run class on #626 — was one step earlier: `bun
 * orchestrator/src/cli.ts review-gate` a few steps into `fleet-review.yml`
 * assumes the BASE checkout it runs from has both `orchestrator/src/cli.ts`
 * and a `review-gate` command registered in it. GitHub does not refresh an
 * open PR's `base.sha` on every push to the base branch — only on a
 * synchronize/update event on the PR itself — so a PR nobody has touched in
 * days (dependabot PRs routinely sit for weeks) can carry a `base.sha` from
 * well before either landed on main, with nothing on the PR side having
 * removed anything.
 *
 * #630's base predated `orchestrator/src/cli.ts` entirely → bun's own
 * uncaught `error: Module not found`, no `outcome` output, job goes red
 * with no diagnostic. #626's base had `cli.ts` but predated `review-gate`
 * being registered in `HANDLERS` → `usage: llamenos-fleet <doctor|tick|...>`
 * (no `review-gate` in the list), exit 2, same result. Because the crash
 * happens INSIDE the gate step, the existing "Check the base provides the
 * gate" step (guarding `review-ci`, further down, `if:
 * steps.gate.outputs.outcome == 'run-engine'`) can never be reached to
 * explain either case — `outcome` was never set.
 *
 * This rail pins the fix: a NEW, unconditional step — "Check the base
 * provides the review gate itself" — runs BEFORE "Decide whether to run the
 * review engine" and checks both failure shapes in bash (the only language
 * that can run before bun has even confirmed `cli.ts` exists), turning a
 * bare crash into one clear, actionable message.
 */
describe('rail: a base-provides-the-gate check runs BEFORE the gate step ever invokes bun', () => {
  const fleetReviewYaml = (): string =>
    readFileSync(join(process.cwd(), '.github', 'workflows', 'fleet-review.yml'), 'utf8')

  const GUARD_STEP = '- name: Check the base provides the review gate itself'
  const GATE_STEP = '- name: Decide whether to run the review engine'

  function guardBlock(yaml: string): string {
    const guardIdx = yaml.indexOf(GUARD_STEP)
    const gateIdx = yaml.indexOf(GATE_STEP)
    expect(guardIdx, 'bootstrap guard step not found — the grep must not pass vacuously').toBeGreaterThan(-1)
    expect(gateIdx, 'gate step not found — the grep must not pass vacuously').toBeGreaterThan(-1)
    expect(guardIdx, 'the guard must run BEFORE the gate step it protects').toBeLessThan(gateIdx)
    return yaml.slice(guardIdx, gateIdx)
  }

  it('the guard step exists and precedes the gate step', () => {
    // guardBlock() itself asserts both existence and ordering — a non-throw
    // here already proves the property; this test names it explicitly so a
    // failure reads as "ordering broke", not as an assertion buried in a
    // helper used by every other test in this suite.
    expect(() => guardBlock(fleetReviewYaml())).not.toThrow()
  })

  it('the guard checks cli.ts exists BEFORE ever invoking bun on it — the exact shape of the #630 crash', () => {
    const block = guardBlock(fleetReviewYaml())
    const fileCheckIdx = block.indexOf('if [ ! -f orchestrator/src/cli.ts ]')
    const firstBunCallIdx = block.indexOf('bun orchestrator/src/cli.ts')
    expect(fileCheckIdx, 'no file-existence check found').toBeGreaterThan(-1)
    expect(firstBunCallIdx, 'no bun invocation found in the guard').toBeGreaterThan(-1)
    expect(fileCheckIdx).toBeLessThan(firstBunCallIdx)
  })

  it('the guard checks the base\'s usage output for "review-gate" — the exact shape of the #626 crash', () => {
    const block = guardBlock(fleetReviewYaml())
    expect(block).toContain('*review-gate*')
  })

  // Never itself gated — same reasoning as "Decide whether to run the
  // review engine" (see the rail on that step in the `describe` above): a
  // guard that only runs conditionally could be skipped exactly when a
  // stale base needs it most.
  it('the guard step carries no step-level if: of its own — it must always run', () => {
    const block = guardBlock(fleetReviewYaml())
    expect(block).not.toMatch(/\n {8}if:/)
  })

  it('the guard fails closed with an actionable message naming the review label re-apply step, for both crash shapes', () => {
    const block = guardBlock(fleetReviewYaml())
    expect(block).toMatch(/exit 1/)
    // Backtick-escaped in the YAML source itself (double-quoted bash
    // string), so the raw file text carries a literal backslash before each
    // backtick — matched here against that raw text, not the string bash
    // would ultimately print.
    expect(block).toContain('re-apply the \\`review\\` label')
  })
})
