import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineId, Lane } from './config.js'
import type { VerifyInput, VerifyReport } from './verify.js'
import { gh } from './gh.js'
import { HIGH_IMPACT_PATHS } from './impact.js'

const execFileAsync = promisify(execFile)

/**
 * Thrown by `secondOpinion` (below) specifically when the non-author
 * verifier appears to have modified the AUTHOR'S OWN worktree during
 * review — see the long comment above `gitState`. A distinct class, rather
 * than matching this error's message text, is what lets `runReviewLoop`
 * treat this one failure mode specially (trip the kill switch, never
 * retry) without the fragility of pattern-matching prose that could shift
 * under a future edit — the same reasoning this project already applies
 * elsewhere to preferring one structural definition over two lists that
 * can silently drift apart.
 */
export class VerifierTamperedWorktreeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VerifierTamperedWorktreeError'
  }
}

/** The Claude Code subagent that reviews cryptographic diffs against the
 *  current HPKE/Ed25519/X25519 architecture — see
 *  `.claude/agents/crypto-security-reviewer.md`. */
export const CRYPTO_SECURITY_REVIEWER_AGENT = 'crypto-security-reviewer'

/**
 * Keywords that pick the crypto/auth/session/sigchain subset OUT of
 * `HIGH_IMPACT_PATHS` (impact.ts) rather than retyping those paths as a
 * second literal list here. `HIGH_IMPACT_PATHS` is the single source of
 * truth for "this path is sensitive"; this file only needs to know WHICH
 * of those sensitive paths are specifically cryptographic — a path added to
 * `HIGH_IMPACT_PATHS` that matches one of these keywords is automatically
 * covered here too, so the two lists cannot drift apart the way two
 * independently-maintained lists inevitably do.
 */
const CRYPTO_PATH_KEYWORDS: readonly string[] = [
  'crypto', 'auth', 'session', 'webauthn', 'sigchain',
  'server-identity', 'agent-identity', 'timing-safe', 'blind-index',
  'platform.ts', 'CryptoService', 'protocol/schemas',
]

export const CRYPTO_REVIEW_PATHS: readonly string[] = HIGH_IMPACT_PATHS.filter((p) =>
  CRYPTO_PATH_KEYWORDS.some((k) => p.toLowerCase().includes(k.toLowerCase())))

/**
 * Any diff touching `packages/crypto/`, `packages/protocol/schemas/`,
 * `crypto-labels.json`, or auth/session/sigchain code needs the
 * crypto-security-reviewer's eyes on it — a mistake in any of those is not
 * a bug, it is an identity disclosure, which is this project's entire
 * threat model.
 */
export function isCryptoDiff(changedFiles: string[]): boolean {
  return changedFiles.some((f) => CRYPTO_REVIEW_PATHS.some((p) => f.startsWith(p) || f.includes(`/${p}`)))
}

/**
 * The reviewers a diff requires. The non-author second opinion
 * (`secondOpinion` below) is mandatory for every diff and is never listed
 * here — this function only names what gets added ON TOP of it. For a
 * crypto diff that is exactly one thing: the crypto-security-reviewer
 * agent, as an ADDITIONAL mandatory reviewer, never a substitute for the
 * non-author opinion.
 *
 * Its verdict is advisory to a human and is never a merge permission: every
 * crypto path is owned in `CODEOWNERS`, so GitHub's own "require review from
 * Code Owners" rule holds the PR until a human approves it, regardless of
 * what any reviewer says about it. The point of requesting it is that the
 * human who ultimately approves starts from a security review instead of
 * from scratch.
 */
export function requiredAdditionalReviewers(changedFiles: string[]): readonly string[] {
  return isCryptoDiff(changedFiles) ? [CRYPTO_SECURITY_REVIEWER_AGENT] : []
}

/**
 * Spec rail 1, and the reason a live lane is defensible at all. This brief is
 * sent verbatim to whichever engine `verifierFor` selects, ahead of the diff
 * itself. Every sentence here corresponds to a rule this file enforces in
 * code — the brief is not decoration, it is the reviewer's only way of
 * knowing what it is being asked to do and what it must refuse to do.
 */
export const VERIFIER_BRIEF = `You are the non-author reviewer for a pull request opened by an autonomous \
coding agent working on Llámenos, a secure crisis response hotline. Callers' \
and volunteers' safety depends on this codebase; treat every diff as if a \
mistake in it could disclose a caller's or volunteer's identity to a \
well-funded adversary.

You are running on a DIFFERENT engine from the one that wrote this diff. \
That is deliberate: a model reviewing its own output shares its own blind \
spots, so your job only has value because your failure modes are different \
from the author's. Do not defer to the author's own commit messages or PR \
description as if they settled the question — read the diff yourself.

You are READ-ONLY. You are a reader, not an editor: do not modify any file, \
do not run any command that writes to the repository or to any external \
system, and do not attempt to fix anything you find wrong. If something is \
wrong, say so in your verdict — do not try to patch it yourself.

Check, at minimum:
- Does the diff do what the PR claims, and nothing else?
- Is it confined to the files and directories the author's lane owns?
- Does it introduce any secret, credential, or key material into the repo?
- Does it weaken any existing test, assertion, or security check rather than
  fixing the underlying problem?
- For anything touching crypto, auth, sessions, or identity: does it uphold
  the zero-knowledge and per-user encryption guarantees this project
  requires, or does it quietly narrow them?

End your response with exactly one line, and nothing after it:

  VERDICT: PASS

or

  VERDICT: FAIL — <one-sentence reason>

If you are not confident enough in either direction to write one of those two \
lines, do not guess and do not write anything that could be misread as a \
verdict — an ambiguous or missing verdict is treated as UNREADABLE, which \
blocks the merge exactly as a FAIL would. A confused non-answer must never be \
mistaken for an approval.`

/**
 * `EngineId` has exactly two values, so "a different engine" and "the other
 * one" are the same statement — but written as a lookup rather than a
 * negation so a third engine, if one is ever added, fails to compile here
 * instead of silently reviewing itself.
 */
const OTHER_ENGINE: Record<EngineId, EngineId> = {
  claude: 'opencode',
  opencode: 'claude',
}

export function verifierFor(authorEngine: EngineId): EngineId {
  return OTHER_ENGINE[authorEngine]
}

/**
 * Reads a `VERDICT: PASS|FAIL` line anywhere in the reviewer's output,
 * case-insensitively, tolerating leading whitespace and any text before or
 * after it on the same response. Anything else — no line at all, a hedge
 * ("I think it looks fine"), empty output from a reviewer that never ran —
 * is UNREADABLE, never a pass. A missing verdict defaulting to PASS is
 * exactly how a naive implementation of this gate silently degrades into
 * having no review at all.
 */
export function parseVerdict(output: string): 'PASS' | 'FAIL' | 'UNREADABLE' {
  const m = /verdict:\s*(pass|fail)/i.exec(output)
  const captured = m?.[1]
  if (captured === undefined) return 'UNREADABLE'
  return captured.toUpperCase() as 'PASS' | 'FAIL'
}

/**
 * Which binary and model each engine resolves to for a one-shot, read-only
 * review invocation — independent of `dispatch-one.sh`'s own model aliasing
 * (engines.ts's `dispatch()` is for a long-running worker session with a
 * worktree, a tmux session, and a status file; a reviewer is none of those,
 * it is a single read and a single verdict).
 *
 * The opencode model was `kimi-for-coding/k2p6`, which does not exist in
 * opencode's model registry — asked for it directly and the provider returns
 * `Unexpected server error`. That, plus the invalid `--format text` below,
 * meant the non-author review had never once returned a verdict: every call
 * failed and was recorded UNREADABLE, which correctly blocked but looked
 * exactly like "the engine was unreachable". `kimi-for-coding/k3-256k` is a
 * real id in the registry (`opencode models`), and its 256k context is the
 * reason to prefer it over `k3` for a whole-diff review.
 */
const VERIFIER_ENGINE: Record<EngineId, { binary: string; model: string }> = {
  claude: { binary: 'claude', model: 'sonnet' },
  opencode: { binary: 'opencode', model: 'kimi-for-coding/k3-256k' },
}

/**
 * A high-impact diff gets a longer review: more turns to actually read
 * everything the impact classifier flagged, and more wall-clock time to do
 * it in. A routine diff gets a fast pass — this gate must not become the
 * fleet's bottleneck for the common case.
 */
const DEFAULT_MAX_TURNS = 6
const HIGH_IMPACT_MAX_TURNS = 20
const DEFAULT_TIMEOUT_MS = 10 * 60_000
const HIGH_IMPACT_TIMEOUT_MS = 25 * 60_000

function buildReviewPrompt(pr: string, diff: string, report: VerifyReport): string {
  const impactNote = report.impact === 'high'
    ? `\n\nThis diff was classified HIGH IMPACT for:\n${report.impactReasons.map((r) => `- ${r}`).join('\n')}\n\n` +
      `Give it a slower, more careful pass than a routine diff would get.`
    : ''
  return `${VERIFIER_BRIEF}${impactNote}\n\n## Pull request\n\n${pr}\n\n## Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n`
}

/**
 * Fix-round finding "V1": running the verifier with `cwd: input.worktree`
 * put it directly in the AUTHOR'S OWN worktree — `.git`, remote, and (via
 * the inherited process environment) every credential that let the worker
 * push in the first place all present. An engine with no enforced
 * read-only mode could then edit, commit, and push the very diff it was
 * supposed to be checking, then print `VERDICT: PASS` on its own patched
 * state.
 *
 * Fix-round finding "W1" narrowed what that first fix actually buys. Once
 * `opencode` was confirmed to authenticate via `~/.local/share/opencode/
 * auth.json` rather than an env var, it became clear that `HOME` has to be
 * in the verifier's environment for it to authenticate at all (see
 * `VERIFIER_ENV_ALLOWLIST` below) — and a process with `HOME` can read
 * `~/.config/gh/hosts.yml` and `~/.ssh` directly as FILES, with no
 * dependency on `GH_TOKEN` or `SSH_AUTH_SOCK` being set. A model with shell
 * access and a home directory can `git clone` this repo somewhere else
 * entirely and push from there. **Full containment of that is not
 * achievable by filtering environment variables, and this comment will not
 * pretend otherwise.** What the two mechanisms below actually buy, stated
 * honestly:
 *
 *   1. `exportReviewSnapshot` removes the CONVENIENT path: the verifier is
 *      never hand-fed the author's own worktree to edit and push from
 *      directly. It gets a `.git`-less export instead, so there is nothing
 *      to commit into or push from IN PLACE. `verifierEnv` removes the
 *      CONVENIENT credentials (`GH_TOKEN`, `GITHUB_TOKEN`, `SSH_AUTH_SOCK`,
 *      `GIT_ASKPASS`) — cheap, and it costs nothing, but it does not and
 *      cannot remove the capability once `HOME` is present.
 *   2. `gitState`, checked before and after the review call in
 *      `secondOpinion`, is DETECTIVE, not preventive: it tells us a
 *      verifier modified the author's actual worktree rather than silently
 *      discarding that evidence. It cannot stop a verifier from tampering
 *      by an entirely separate path (a clone elsewhere, a push from there)
 *      that never touches this worktree at all.
 *
 * The defense that actually holds against a verifier with real push access
 * is no longer in this repo's code at all — it is GitHub's. Every fleet gate
 * is a commit status attached to ONE head SHA (ci.ts), and the repo ruleset
 * requires them; a push to the branch moves the head, and the new one
 * carries no green `fleet/verify` or `fleet/review` of its own, so
 * auto-merge simply does not fire. A verifier that pushes a modified branch,
 * by whatever path, invalidates its own approval rather than getting it
 * merged — and no process in this repo has to notice for that to hold.
 */
async function gitState(worktree: string): Promise<{ head: string; status: string }> {
  const { stdout: head } = await execFileAsync('git', ['-C', worktree, 'rev-parse', 'HEAD'])
  const { stdout: status } = await execFileAsync('git', ['-C', worktree, 'status', '--porcelain'])
  return { head: head.trim(), status }
}

interface ReviewSnapshot { dir: string; cleanup(): Promise<void> }

/**
 * Exports the tree at `headSha` into a fresh directory via `git archive |
 * tar -x` — deliberately NOT `git worktree add` (which still shares the
 * same `.git` and the same configured remote as the author's checkout,
 * so a verifier there could still commit and push) and NOT a plain
 * recursive file copy (which would also copy `.git`). The result has no
 * git object database at all: nothing to commit into, nothing to push
 * from — the tamper capability is structurally absent, not just unused.
 *
 * Piped via `spawn`, not buffered through `execFile`, so an archive of any
 * realistic repo size streams straight into `tar` rather than sitting in
 * process memory first.
 */
async function exportReviewSnapshot(worktree: string, headSha: string): Promise<ReviewSnapshot> {
  const dir = await mkdtemp(join(tmpdir(), 'llamenos-fleet-review-'))
  const cleanup = async (): Promise<void> => {
    await rm(dir, { recursive: true, force: true })
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const git = spawn('git', ['-C', worktree, 'archive', headSha], { stdio: ['ignore', 'pipe', 'pipe'] })
      const tar = spawn('tar', ['-x', '-C', dir], { stdio: ['pipe', 'ignore', 'pipe'] })
      let gitErr = ''
      let tarErr = ''
      let settled = false
      const fail = (message: string): void => {
        if (settled) return
        settled = true
        reject(new Error(message))
      }
      const succeed = (): void => {
        if (settled) return
        settled = true
        resolve()
      }
      git.stdout.pipe(tar.stdin)
      git.stderr.on('data', (d: Buffer) => { gitErr += d.toString() })
      tar.stderr.on('data', (d: Buffer) => { tarErr += d.toString() })
      git.on('error', (e) => fail(`git archive failed to start: ${e.message}`))
      tar.on('error', (e) => fail(`tar extract failed to start: ${e.message}`))
      git.on('close', (code) => { if (code !== 0) fail(`git archive exited ${code}: ${gitErr}`) })
      tar.on('close', (code) => (code !== 0 ? fail(`tar extract exited ${code}: ${tarErr}`) : succeed()))
    })
  } catch (e) {
    await cleanup()
    throw e
  }
  return { dir, cleanup }
}

/**
 * An ALLOWLIST, not a denylist: a denylist only stops the credentials
 * someone remembered to name, and the next one added to the orchestrator's
 * own environment (a new provider key, a new deploy token) would leak
 * through silently.
 *
 * Read this list for what it honestly is, not more: `HOME` and `PATH` are
 * here because both engines NEED them to run at all — `claude` reads its
 * own login state from under `HOME`, and `opencode` reads
 * `~/.local/share/opencode/auth.json` (confirmed; there is no
 * `OPENCODE_API_KEY` env var — an earlier version of this list invented
 * one). `ZHIPU_API_KEY` is the provider key `dispatch-one.sh` actually uses
 * for the zai/GLM provider opencode calls into. `ANTHROPIC_API_KEY` is kept
 * for a claude verifier that authenticates that way instead of via its
 * `HOME` login state.
 *
 * This allowlist does NOT and CANNOT make the verifier's environment safe
 * on its own: `HOME` alone is enough for it to read `~/.config/gh/
 * hosts.yml` and `~/.ssh` as plain files, regardless of whether
 * `GH_TOKEN`/`SSH_AUTH_SOCK` are set. Excluding `GH_TOKEN`, `GITHUB_TOKEN`,
 * `SSH_AUTH_SOCK`, and `GIT_ASKPASS` removes the CONVENIENT path and costs
 * nothing — worth doing regardless — but it is not the defense this fleet
 * relies on. That defense is GitHub's per-SHA required statuses (see the
 * comment above `gitState`).
 */
const VERIFIER_ENV_ALLOWLIST: readonly string[] = [
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP',
  'ANTHROPIC_API_KEY',
  'ZHIPU_API_KEY',
]

function verifierEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of VERIFIER_ENV_ALLOWLIST) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

/**
 * Invokes the verifier engine directly by argv — no shell, matching every
 * other subprocess call in this fleet — with the prompt piped over stdin
 * rather than passed as an argv element, so its length is never bounded by
 * the OS argv limit and it can never be mistaken for a CLI flag.
 *
 * Claude gets `--permission-mode plan`: it can read and reason but cannot
 * edit files or run destructive commands, which is what makes "read-only"
 * an enforced property here rather than only a sentence in the prompt.
 * `--dangerously-skip-permissions` (used for workers in engines.ts /
 * dispatch-one.sh) is deliberately NOT passed here — that flag is what lets
 * a worker write without being asked, which is exactly what a reviewer must
 * never be able to do. `cwd` is always a throwaway export from
 * `exportReviewSnapshot`, never the author's real worktree — see the V1 fix
 * note above `gitState`.
 */
async function invokeVerifierEngine(input: {
  engine: EngineId
  cwd: string
  prompt: string
  maxTurns: number
  timeoutMs: number
}): Promise<{ reached: boolean; output: string }> {
  const cfg = VERIFIER_ENGINE[input.engine]
  // `--format text` was not a valid choice (opencode accepts only `default`
  // or `json`); passing it made `opencode run` print its help and exit
  // without ever contacting a model. `--pure` skips external plugins, so the
  // reviewer's behaviour does not depend on whatever plugins happen to be
  // configured on the machine it runs on. The prompt goes on stdin — verified
  // against opencode 1.18.30, which accepts it there as well as positionally.
  const args = input.engine === 'claude'
    ? ['--print', '--permission-mode', 'plan', '--model', cfg.model, '--max-turns', String(input.maxTurns)]
    : ['run', '--pure', '--model', cfg.model, '--format', 'default', '--dir', input.cwd]

  try {
    // execFile (unlike execFileSync) has no `input` option — the prompt must
    // be written to the child's own stdin instead. `promisify(execFile)`
    // still returns a `PromiseWithChild`, so `.child` is available
    // synchronously before the promise settles.
    const call = execFileAsync(cfg.binary, args, {
      cwd: input.cwd,
      env: verifierEnv(),
      timeout: input.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    })
    call.child?.stdin?.end(input.prompt)
    const { stdout } = await call
    return { reached: true, output: stdout }
  } catch (e) {
    // A crash, a timeout, or a missing binary. An unreachable reviewer is
    // not a pass — return whatever partial output exists (often none) and
    // let the caller record this explicitly as UNREADABLE rather than
    // silently falling through parseVerdict's own "no VERDICT line" path.
    const err = e as { stdout?: string }
    return { reached: false, output: err.stdout ?? '' }
  }
}

export interface SecondOpinionInput {
  authorEngine: EngineId
  pr: string
  /**
   * The AUTHOR'S OWN worktree — the operator-box path only. Present when the
   * fleet reviews its worker's tree in place: a snapshot is exported from it
   * and it is checked before and after for tampering. Mutually exclusive
   * with `snapshotDir`.
   */
  worktree?: string
  /**
   * A `git archive` export that ALREADY exists — the CI path. When given,
   * this function runs no git command at all and exports nothing: the tree
   * under judgement was extracted as data before this process started, and
   * there is no worktree to tamper with because none was ever created.
   *
   * This is what keeps the review job free of any execution of the code it
   * is judging, which is the whole reason the job may hold the review key.
   */
  snapshotDir?: string
  diff: string
  report: VerifyReport
}

export interface SecondOpinionResult {
  verdict: 'PASS' | 'FAIL' | 'UNREADABLE'
  text: string
}

/**
 * A second opinion is requested ONLY when the mechanical gates already
 * passed, and it may only turn a pass into a fail — never rescue a
 * mechanical failure. That rule is enforced here, not left to callers to
 * remember: a report that did not pass mechanically has no business being
 * handed to a reviewer at all, so this throws rather than silently
 * reviewing (and possibly approving) code that already failed scope or
 * tests. Same reasoning as `assertLiveLanesHaveScope` — a loud failure at
 * the call site beats a quiet, unearned review.
 */
export async function secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult> {
  if (!input.report.passed) {
    throw new Error(
      'secondOpinion called with a VerifyReport that did not pass mechanical verification — ' +
      'a review may only downgrade a pass, never rescue a failure',
    )
  }

  if ((input.worktree === undefined) === (input.snapshotDir === undefined)) {
    throw new Error(
      'secondOpinion needs exactly one of `worktree` (export a snapshot from the author\'s tree ' +
      'and watch it for tampering) or `snapshotDir` (an export that already exists) — ' +
      'never both, and never neither',
    )
  }

  const engine = verifierFor(input.authorEngine)
  const highImpact = input.report.impact === 'high'
  const prompt = buildReviewPrompt(input.pr, input.diff, input.report)
  const turns = { maxTurns: highImpact ? HIGH_IMPACT_MAX_TURNS : DEFAULT_MAX_TURNS,
    timeoutMs: highImpact ? HIGH_IMPACT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS }

  // CI path: the export is already on disk, made by `git archive` before this
  // process began. No git runs, nothing is created, and there is no author
  // worktree for a verifier to modify — so the tamper detection below has
  // nothing to detect and is correctly absent rather than vacuously "passing".
  if (input.snapshotDir !== undefined) {
    const result = await invokeVerifierEngine({ engine, cwd: input.snapshotDir, prompt, ...turns })
    if (!result.reached) {
      return { verdict: 'UNREADABLE', text: result.output.length > 0 ? result.output : '(reviewer engine was unreachable)' }
    }
    return { verdict: parseVerdict(result.output), text: result.output }
  }

  const worktree = input.worktree as string
  const before = await gitState(worktree)
  const snapshot = await exportReviewSnapshot(worktree, before.head)
  try {
    const result = await invokeVerifierEngine({ engine, cwd: snapshot.dir, prompt, ...turns })

    // Detective layer (see the honest accounting in the comment above
    // `gitState`): with GitHub's per-SHA required statuses as the actual
    // defense, this check is no longer what PREVENTS a tampering
    // verifier from getting its changes merged — it is what TELLS US one
    // tried, rather than silently discarding the evidence. That distinction
    // matters: a verifier that modified the author's own worktree mid-review
    // is not "this one item failed," it is "the fleet's non-author
    // verification rail is compromised" — a fleet-level trust failure that
    // every other in-flight review shares, not a per-item flake. This
    // function throws, which fails the one item currently in front of it;
    // it does NOT halt the fleet (killswitch.ts) or stop any other lane's
    // dispatch. RECOMMENDATION, not implemented here: whatever calls
    // `secondOpinion` (the review loop, task 13) should catch specifically
    // this error and trip the kill switch fleet-wide rather than only
    // record this one run as failed — left to that caller because tripping
    // the kill switch here would reach outside this file's own concern and
    // into `tick`'s orchestration of every lane, not just this review.
    const after = await gitState(worktree)
    if (after.head !== before.head || after.status !== before.status) {
      throw new VerifierTamperedWorktreeError(
        `the non-author verifier appears to have modified the AUTHOR'S OWN worktree at ` +
        `${worktree} during review (HEAD ${before.head} -> ${after.head}${
          after.status !== before.status ? ', working-tree status also changed' : ''
        }) — refusing to trust this verdict. This is a fleet-level trust failure in the ` +
        'non-author verification rail itself, not a flake in this one review; the caller ' +
        'should treat it as fleet-wide and consider halting dispatch entirely, not just ' +
        'recording this item as failed.',
      )
    }

    if (!result.reached) {
      return { verdict: 'UNREADABLE', text: result.output.length > 0 ? result.output : '(reviewer engine was unreachable)' }
    }
    return { verdict: parseVerdict(result.output), text: result.output }
  } finally {
    await snapshot.cleanup()
  }
}

/**
 * Posts the loop's verdict to the PR as a plain COMMENT, never as a GitHub
 * REVIEW of any kind.
 *
 * It used to approve or request changes, back when this verdict fed the
 * orchestrator's own merge decision. It no longer does: `fleet/review`
 * (ci.ts), computed on GitHub's runner against the exact head SHA, is the
 * verdict of record, and this loop's only remaining job is revising the work
 * before the PR is final. An approving review from the fleet would now be a
 * review GitHub COUNTS — today harmlessly (`required_approving_review_count`
 * is 0), but it is one ruleset edit away from being an approval the fleet
 * grants itself. A comment records the same text in the same thread and can
 * never be that. The flags are deliberately not written anywhere under
 * `orchestrator/` — see the rail in tests/orchestrator/guards.test.ts.
 */
export async function postReview(pr: string, verdict: 'PASS' | 'FAIL' | 'UNREADABLE', body: string): Promise<void> {
  await gh(['pr', 'comment', pr, '--body', `Non-author review (advisory, pre-PR loop) — ${verdict}\n\n${body}`])
}

/**
 * G3: an UNREADABLE verdict already gets a `--request-changes` review (same
 * as FAIL, above) — but that review's body is either the reviewer's own raw,
 * incoherent output or the terse `(reviewer engine was unreachable)`
 * placeholder, and its "Changes requested" framing reads to a human as "the
 * reviewer found a problem", not "there was no reviewer". Root-caused live
 * against issue #660/PR #662: this box has no opencode/`ZHIPU_API_KEY`
 * configured, so `invokeVerifierEngine` could not even start the non-author
 * engine — the fail-safe worked (UNREADABLE is posted as `fleet/review` =
 * `error`, which GitHub will not merge on), but nothing told the human reviewing the PR that they were
 * the ONLY review it had gotten. This is that explicit comment, posted in
 * ADDITION to the review above, in plain language a human skimming the PR
 * will actually notice.
 */
export function buildReviewUnavailableComment(reasonText: string): string {
  const reason = reasonText.trim().length > 0 ? reasonText.trim() : 'no reason was recorded'
  return [
    '**Non-author review was unavailable for this PR.**',
    '',
    'Every PR the fleet opens is meant to get an independent review from a DIFFERENT engine ' +
      'than the one that wrote the diff, before it can auto-merge. That review could not be ' +
      'completed here:',
    '',
    `> ${reason}`,
    '',
    'This PR has NOT received that second opinion. If you are reviewing it, you are currently ' +
      'the only review it has had — please treat it accordingly.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The bounded review loop (task 13, spec §5.6)
// ---------------------------------------------------------------------------

/**
 * In the reference system a rejected run is discarded entirely and a human
 * must rescue it. Here, the reviewer's verdict returns to the SAME author
 * session with its worktree intact so it can revise — but only for exactly
 * two rounds. A bounded loop is the difference between iteration and a
 * spiral: an unbounded one would burn a worker's budget and the fleet's
 * rate limit on the same stuck item at the same time.
 */
export const MAX_REVIEW_ROUNDS = 2

export interface ReviewLoopInput {
  authorEngine: EngineId
  pr: string
  worktree: string
  branch: string
  lane: Lane
}

export interface ReviewLoopDeps {
  /** Mechanical gates: scope, never-write, diff-targeted tests. A failure
   *  here is immediate and terminal for THIS round — no review is ever
   *  requested for a diff that failed mechanically (secondOpinion itself
   *  enforces this by throwing if handed a report that didn't pass), and a
   *  mechanical failure ends the loop outright rather than consuming a
   *  round waiting on a reviewer that will never be asked. */
  verifyMechanical(input: VerifyInput): Promise<VerifyReport>
  prDiff(pr: string): Promise<string>
  secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult>
  postReview(pr: string, verdict: SecondOpinionResult['verdict'], body: string): Promise<void>
  /**
   * G3: posts `buildReviewUnavailableComment`'s explicit "you are the only
   * review this PR has had" comment. Called whenever the loop ends with
   * UNREADABLE — both when `secondOpinion` itself returned it (a review WAS
   * posted via `postReview`, just an unhelpful one) and when a tamper
   * detection ends the loop before `postReview` is ever reached (zero
   * reviews posted at all). Best-effort from the caller's point of view: a
   * failure here must never be allowed to overwrite an already-decided
   * verdict or trip the kill switch a second time, so `runReviewLoop` itself
   * catches and logs rather than propagates a failure of this call.
   */
  commentOnPr(pr: string, body: string): Promise<void>
  /**
   * Sends the reviewer's verdict text back to the SAME worker session, its
   * worktree left intact (see engines.ts's `dispatch` — it deliberately
   * never tears the session or worktree down on return, exactly so this
   * call is possible), and resolves once the worker has finished revising.
   * Never called after the final round — there would be nothing left to
   * re-verify.
   */
  reviseWithWorker(input: { verdictText: string }): Promise<void>
  /**
   * Trips the kill switch fleet-wide. Called ONLY when `secondOpinion`
   * throws `VerifierTamperedWorktreeError` — a trust failure in the
   * non-author verification rail itself, not an ordinary review outcome —
   * never for a ordinary FAIL/UNREADABLE verdict, which is handled entirely
   * within the bounded loop instead.
   */
  haltFleet(reason: string): void
  log(msg: string): void
}

export interface ReviewLoopResult {
  finalVerdict: 'PASS' | 'FAIL' | 'UNREADABLE'
  rounds: number
  /** True whenever the loop did not end in PASS — a mechanical failure, an
   *  exhausted two rounds of FAIL/UNREADABLE, or a detected tamper attempt.
   *  The caller (tick.ts) uses this to decide whether to label the issue
   *  for a human rather than merge. */
  needsHuman: boolean
  /** The last mechanical verification report produced, whichever round it
   *  came from — `undefined` only if verifyMechanical itself never got a
   *  chance to run, which does not currently happen in this loop. */
  lastReport?: VerifyReport
  /** The last reviewer output — `secondOpinion`'s own `text`, or a fixed
   *  description of the tamper detection when that is what ended the loop.
   *  `undefined` only when no review was ever attempted (a mechanical
   *  failure on round one). Carried out to the caller (tick.ts) so G2's gate
   *  trace can show WHY an UNREADABLE verdict was unreadable, not just that
   *  it was. */
  lastVerdictText?: string
}

/**
 * Runs the bounded mechanical-verify -> second-opinion -> (on FAIL) revise
 * -> re-verify loop for one pull request, for AT MOST `MAX_REVIEW_ROUNDS`
 * rounds. A PASS ends the loop immediately at whatever round produced it —
 * round one never triggers a second round it doesn't need. A mechanical
 * failure ends the loop immediately too, on the same round it happened:
 * secondOpinion may only downgrade a pass, never rescue a failure, so
 * there is no reviewer verdict to revise against in that case, and no
 * `reviseWithWorker` call is made for it either (the mechanical reasons
 * are surfaced to the caller via `lastReport`, and the caller's own
 * `commentOnIssue` path — unchanged from before this loop existed — is
 * what tells the worker what went wrong).
 *
 * `secondOpinion` throwing `VerifierTamperedWorktreeError` is NOT retried,
 * under any circumstance, at any round: it means the review verdict itself
 * cannot be trusted, so revising against it and reviewing it again would
 * only feed a compromised signal back into the loop. `haltFleet` is
 * invoked instead and the loop returns immediately, `needsHuman: true`.
 */
export async function runReviewLoop(input: ReviewLoopInput, deps: ReviewLoopDeps): Promise<ReviewLoopResult> {
  let lastReport: VerifyReport | undefined
  let lastVerdict: SecondOpinionResult['verdict'] | undefined
  let lastVerdictText: string | undefined
  let rounds = 0

  // G3: best-effort — a comment failing here must never overwrite a verdict
  // already decided above it, nor look like the tamper/kill-switch path
  // itself failed. Logged and swallowed, same reasoning as every other
  // best-effort post in this fleet (see settle()'s own per-step try/catch).
  const safeCommentOnPr = async (reasonText: string): Promise<void> => {
    try {
      await deps.commentOnPr(input.pr, buildReviewUnavailableComment(reasonText))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      deps.log(`review loop: failed to post the "review unavailable" comment on PR ${input.pr}: ${msg}`)
    }
  }

  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    rounds = round

    const report = await deps.verifyMechanical({ worktree: input.worktree, branch: input.branch, lane: input.lane })
    lastReport = report
    if (!report.passed) {
      deps.log(`review loop: mechanical verification failed on round ${round} for PR ${input.pr} — ending the loop, no review requested`)
      return { finalVerdict: 'FAIL', rounds, needsHuman: true, lastReport }
    }

    const diff = await deps.prDiff(input.pr)
    let secondOp: SecondOpinionResult
    try {
      secondOp = await deps.secondOpinion({ authorEngine: input.authorEngine, pr: input.pr, worktree: input.worktree, diff, report })
    } catch (e) {
      if (e instanceof VerifierTamperedWorktreeError) {
        deps.haltFleet(`non-author verifier tampered with the author's own worktree during review of PR ${input.pr}: ${e.message}`)
        deps.log(`review loop: verifier tamper detected on PR ${input.pr} on round ${round} — kill switch tripped, NOT retrying`)
        // No `postReview` was ever reached on this round — the PR has ZERO
        // reviews at this point, not even an UNREADABLE one, so the "you are
        // the only review" comment matters more here than anywhere else.
        const tamperText = `the non-author verifier appears to have tampered with the worktree during review (${e.message}) — the fleet has halted, and this verdict cannot be trusted`
        await safeCommentOnPr(tamperText)
        return { finalVerdict: 'UNREADABLE', rounds, needsHuman: true, lastReport, lastVerdictText: tamperText }
      }
      throw e
    }

    await deps.postReview(input.pr, secondOp.verdict, secondOp.text)
    lastVerdict = secondOp.verdict
    lastVerdictText = secondOp.text

    if (secondOp.verdict === 'UNREADABLE') {
      await safeCommentOnPr(secondOp.text)
    }

    if (secondOp.verdict === 'PASS') {
      return { finalVerdict: 'PASS', rounds, needsHuman: false, lastReport, lastVerdictText }
    }

    if (round < MAX_REVIEW_ROUNDS) {
      deps.log(`review loop: round ${round} verdict ${secondOp.verdict} for PR ${input.pr} — sending back to the author for revision`)
      await deps.reviseWithWorker({ verdictText: secondOp.text })
    }
  }

  deps.log(`review loop: exhausted ${MAX_REVIEW_ROUNDS} round(s) for PR ${input.pr} without a PASS — a human is needed`)
  return { finalVerdict: lastVerdict ?? 'FAIL', rounds, needsHuman: true, lastReport, lastVerdictText }
}
