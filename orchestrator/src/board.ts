import { checkHalt } from './killswitch.js'
import { isQuotaHaltReason } from './circuit.js'
import { REPO, ghJson } from './gh.js'
import { VERIFY_JOB, REVIEW_JOB } from './ci.js'

/**
 * `llamenos-fleet board` — the deterministic gate decision table.
 *
 * Same principle as `status.ts` (G1, see its own module comment): every fact
 * is derived live from `gh` at read time, nothing is cached, nothing is a
 * label. This module adds two things `status.ts` does not need for a single
 * item: a total classification of EVERY open PR into exactly one action, and
 * the infrastructure-vs-substantive split for a failed `fleet/review`.
 *
 * Split the same way `ci.ts`/`status.ts` are: a pure decision function
 * (`buildBoard`) that takes an already-gathered `BoardFacts` and returns a
 * `BoardView` — this is where the classification tests live, with zero
 * network — and a separate, impure gather step (`fetchBoardFacts`) that
 * turns real `gh` calls into that same `BoardFacts` shape. `board` itself
 * (cli.ts) does nothing but call gather then render; it never labels,
 * approves, merges, or re-runs anything (see the module-level "Read-only"
 * note near `renderBoard`).
 */

// ---------------------------------------------------------------------------
// Facts — exactly what `gh` can answer, nothing inferred yet.
// ---------------------------------------------------------------------------

export type CheckState = 'PASS' | 'FAIL' | 'PENDING'

export type ReviewFailureKind = 'infrastructure' | 'substantive'

/**
 * One GraphQL `CheckRun` or `StatusContext` off a PR's `commits(last:1)`
 * rollup. Today every one of `ci-status`/`fleet/verify`/`fleet/review` is a
 * genuine GitHub Actions job — see `ci.ts`'s own comment ("An Actions job
 * already IS a check run... posting a same-named status on top would be a
 * second copy") — so all three currently surface as `CheckRun`, never
 * `StatusContext`. Both shapes are still fetched and normalized here: a
 * commit status (`StatusContext`) is how an external tool (a third-party CI,
 * a status-API-only GitHub App) would post instead, and a query that only
 * read one shape would silently never see a required context implemented
 * that way — the asymmetry that let the by-hand version of this command trip
 * on `fleet/review` before this command existed. This type carries both so
 * `buildBoard` does not have to care which one any given context turns out
 * to be.
 *
 * `sha` is carried explicitly, not assumed to already equal the PR's head —
 * even though `fetchBoardFacts` always sets it from the SAME `commits(last:1)`
 * node the rollup came from (so in practice it is always the head). The
 * field exists so `buildBoard` can — and does — enforce the head-binding
 * rule ITSELF (see `checksOnHead` below) rather than trusting that whatever
 * gathered these facts already filtered correctly. That is what makes the
 * #862 regression (a `fleet/review` SUCCESS read off a stale SHA) a case
 * `buildBoard`'s own tests can pin down with nothing but a `BoardFacts`
 * literal — no mocked `gh` calls involved.
 */
export interface PrCheckContext {
  name: string
  kind: 'CheckRun' | 'StatusContext'
  sha: string
  state: CheckState
  /** CheckRun only. The workflow run's own `run_attempt` — used to tell "an
   *  infra-failed fleet/review that has not been retried yet" from "already
   *  retried once and still infra-failing" without any state file (see
   *  `classifyReviewFailure`'s own comment). `undefined` for a
   *  `StatusContext`, or when the run could not be resolved. */
  runAttempt?: number
  /** Populated ONLY for a FAILed `fleet/review` CheckRun — the job's own
   *  step list, already classified by `classifyReviewFailure`. Every other
   *  context (passing, pending, or not `fleet/review`) leaves this
   *  `undefined`; `buildBoard` never reads it for anything but a failed
   *  `fleet/review` context, so an unrelated context populating it would be
   *  inert, not misleading. */
  reviewFailureKind?: ReviewFailureKind
}

export interface PrFact {
  number: number
  authorLogin: string
  isDraft: boolean
  createdAt: string
  headRefOid: string
  headRefName: string
  mergeStateStatus: string
  labels: string[]
  /** `APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | `null` — GitHub's
   *  own `reviewDecision`, straight through. */
  reviewDecision: string | null
  /** Every context off `commits(last:1)`'s rollup — CheckRun and
   *  StatusContext both, unfiltered by SHA (see `PrCheckContext.sha`). */
  checks: PrCheckContext[]
}

export interface FleetStateFact {
  halted: boolean
  haltReason?: string
  /** `true` for exactly the halt reasons `circuit.ts`'s `quotaBreaker`
   *  produces (`isQuotaHaltReason`) — never for a human-typed halt, a
   *  GitHub `halt`-labelled issue, or the plain consecutive-failures/rate
   *  breakers. */
  isQuotaHalt: boolean
}

export interface BoardFacts {
  fleet: FleetStateFact
  prs: PrFact[]
}

// ---------------------------------------------------------------------------
// Classification — every open PR lands in exactly one of these.
// ---------------------------------------------------------------------------

export type BoardAction =
  | 'MERGE' | 'APPROVE_THEN_MERGE' | 'LABEL_FOR_REVIEW' | 'RERUN_REVIEW'
  | 'NEEDS_FIX' | 'WAITING' | 'STALE_LABEL' | 'OPERATOR'

export interface BoardRow {
  number: number
  author: string
  action: BoardAction
  headRefOid: string
  /** Names of the required contexts that are actually failing — populated
   *  only for `NEEDS_FIX`; empty for every other action. */
  failingContexts: string[]
  reason: string
}

export interface BoardView {
  fleet: FleetStateFact
  /** Sorted by action (most-actionable first — see `ACTION_ORDER`), then by
   *  PR number within an action. */
  rows: BoardRow[]
}

/** Branch name knope's own release-PR automation uses — never a fleet branch
 *  (`fleet/<lane>/<item>`), so `ci.ts`'s `laneIdFromBranch` already treats it
 *  as unscoped; this module only needs the literal name to recognise it. */
const RELEASE_BRANCH = 'release'

/**
 * GitHub's bot logins are inconsistent across surfaces: the REST API
 * typically reports `dependabot[bot]`/`github-actions[bot]`, but a live
 * `gh api graphql` query against THIS repo's own open PRs (verified
 * 2026-09-19, PR #594 authored by knope's release automation and #626/#630/
 * #831/#832 by Dependabot) shows GraphQL's `PullRequest.author.login`
 * returning the bare `github-actions` / `dependabot` — no `[bot]` suffix, no
 * `app/` prefix. All four shapes are matched, plus the two general
 * suffix/prefix patterns GitHub uses for other bot/App accounts, so a future
 * surface returning yet another format is still caught. Overinclusive on
 * purpose: the only consequence of a false positive here is asking for one
 * extra code-owner approval that `require_extra_approval_for_unattributed_
 * changes` did not actually require, never a false MERGE of unreviewed
 * bot-authored code.
 */
const KNOWN_BOT_LOGINS: ReadonlySet<string> = new Set([
  'dependabot', 'github-actions', 'app/dependabot', 'app/github-actions',
  'dependabot[bot]', 'github-actions[bot]',
])

export function isBotAuthor(login: string): boolean {
  return KNOWN_BOT_LOGINS.has(login) || login.endsWith('[bot]') || login.startsWith('app/')
}

/**
 * The "cheap", mechanical required contexts — everything the ruleset demands
 * OTHER than the non-author model review, which gets its own richer
 * classification tree below (ABSENT / PASS / FAIL, and FAIL split into
 * infrastructure vs substantive). Kept as a literal list, not derived from
 * the ruleset itself — this repo's branch-protection ruleset lives in
 * GitHub's own UI/API configuration, not a file this command can read — and
 * mirrors the comment above `enableAutoMerge` in cli.ts, which names the
 * same three contexts (`ci-status`, `fleet/verify`, `fleet/review`).
 */
export const REQUIRED_CHEAP_CONTEXTS: readonly string[] = ['ci-status', VERIFY_JOB]

/**
 * THE head-binding rule (see the module docstring and `PrCheckContext.sha`'s
 * own comment): every context this module ever looks at is filtered down to
 * ones bound to the PR's CURRENT `headRefOid` first. A context recorded
 * against any other commit does not exist as far as classification is
 * concerned — it is never "helpfully" reused, which is exactly the #862
 * regression (a `fleet/review` SUCCESS read off a stale SHA very nearly
 * green-lit a merge).
 */
function checksOnHead(pr: PrFact): PrCheckContext[] {
  return pr.checks.filter((c) => c.sha === pr.headRefOid)
}

function findCheapContext(onHead: PrCheckContext[], name: string): PrCheckContext | undefined {
  return onHead.find((c) => c.name === name)
}

/**
 * `fleet-review.yml`'s own step names, verbatim (see the file's own
 * comments): "Resolve the base/head SHAs...", "Checkout the PR BASE
 * (trusted)", "Export the PR head as data", "Setup Bun", "Install
 * dependencies (base lockfile, no install scripts)", "Check the base
 * provides the review gate itself", "Decide whether to run the review
 * engine", "Install the non-author review engine", "Authenticate the review
 * engine", "Smoke-test the review engine", "Check the base provides the
 * gate", "Review", "Cache the verdict, if this run produced a fresh PASS".
 *
 * A failure in the step named exactly "Review" is the model's OWN verdict —
 * substantive, and this classifier must never suggest retrying it: a retry
 * of a real FAIL is not what "an engine that could not run" needs, and
 * treating it as infrastructure would let a genuine problem get silently
 * re-rolled instead of surfaced to a human (see `RERUN_REVIEW`'s own
 * doc comment on `classifyPr` below, and the rail in board.test.ts pinning
 * this exact case).
 *
 * Every other step failing — checkout, dependency install, either
 * "base provides..." bootstrap guard, the engine install/auth/smoke-test —
 * is this fleet's OWN infrastructure breaking before the model ever ran, and
 * is exactly what `RERUN_REVIEW` exists to recover from automatically. A
 * step list with no step literally named "Review" present at all (the job
 * failed before reaching it) falls into this branch for the same reason.
 */
export interface WorkflowStep { name: string; conclusion: string | null }

export function classifyReviewFailure(steps: WorkflowStep[]): ReviewFailureKind {
  const reviewStep = steps.find((s) => s.name === 'Review')
  if (reviewStep !== undefined && reviewStep.conclusion === 'failure') return 'substantive'
  return 'infrastructure'
}

/**
 * `classifyPr`'s own action space is one wider than the public `BoardAction`:
 * `LABEL_FOR_REVIEW_CANDIDATE` marks a PR that passed every cheap check and
 * has no `fleet/review` verdict on its head and no `review` label yet — a
 * CANDIDATE for `LABEL_FOR_REVIEW`, not yet the verdict. `buildBoard` caps
 * how many candidates actually become `LABEL_FOR_REVIEW` to one per
 * invocation (see its own comment), demoting every other candidate to
 * `WAITING`. This internal action never reaches a `BoardRow` — `buildBoard`
 * resolves every one of them before rows are built.
 */
export interface PrClassification {
  action: BoardAction | 'LABEL_FOR_REVIEW_CANDIDATE'
  reason: string
  failingContexts: string[]
}

/**
 * The one, total function every open PR passes through. Every branch below
 * returns — there is no fallthrough default, so a PR can never silently miss
 * the board the way #862's stale-SHA read did.
 */
export function classifyPr(pr: PrFact): PrClassification {
  if (pr.isDraft) {
    return { action: 'OPERATOR', reason: 'draft PR — never auto-actionable', failingContexts: [] }
  }
  if (pr.headRefName === RELEASE_BRANCH && isBotAuthor(pr.authorLogin)) {
    return {
      action: 'OPERATOR',
      reason: 'knope release PR on branch "release" — cutting a release is a human decision, never automated',
      failingContexts: [],
    }
  }

  const onHead = checksOnHead(pr)
  const cheap = REQUIRED_CHEAP_CONTEXTS.map((name) => ({ name, ctx: findCheapContext(onHead, name) }))
  const cheapFailing = cheap.filter((c) => c.ctx !== undefined && c.ctx.state === 'FAIL')
  const cheapPendingOrMissing = cheap.filter((c) => c.ctx === undefined || c.ctx.state === 'PENDING')

  if (cheapFailing.length > 0) {
    return {
      action: 'NEEDS_FIX',
      reason: 'required check(s) failed',
      failingContexts: cheapFailing.map((c) => c.name),
    }
  }
  if (cheapPendingOrMissing.length > 0) {
    return {
      action: 'WAITING',
      reason: `required check(s) still in flight or not yet posted on this head: ${cheapPendingOrMissing.map((c) => c.name).join(', ')}`,
      failingContexts: [],
    }
  }

  // Every cheap context is pass-or-skip on the current head. `fleet/review`
  // gets its own tree from here — ABSENT / PENDING / PASS / FAIL, FAIL split
  // into infrastructure vs substantive.
  const review = onHead.find((c) => c.name === REVIEW_JOB)
  const hasReviewLabel = pr.labels.includes('review')

  if (review === undefined) {
    if (hasReviewLabel) {
      // #862's own shape: the label says "review requested" but there is no
      // verdict bound to THIS head — re-triggering means removing and
      // re-adding the label (see the brief), never inferred as a pending
      // request.
      return {
        action: 'STALE_LABEL',
        reason: 'carries the "review" label but has no fleet/review verdict on the current head — remove and re-add the label to re-trigger',
        failingContexts: [],
      }
    }
    return { action: 'LABEL_FOR_REVIEW_CANDIDATE', reason: 'cheap checks pass; no review requested yet', failingContexts: [] }
  }

  if (review.state === 'PENDING') {
    return { action: 'WAITING', reason: 'fleet/review is in flight on the current head', failingContexts: [] }
  }

  if (review.state === 'PASS') {
    if (isBotAuthor(pr.authorLogin)) {
      if (pr.reviewDecision === 'APPROVED') {
        return {
          action: 'MERGE',
          reason: 'bot-authored PR already carries a code-owner approval; every required context is green',
          failingContexts: [],
        }
      }
      return {
        action: 'APPROVE_THEN_MERGE',
        reason: 'bot-authored PR needs a code-owner approval (require_extra_approval_for_unattributed_changes) before GitHub will merge',
        failingContexts: [],
      }
    }
    return { action: 'MERGE', reason: 'every required context is pass-or-skip on the current head', failingContexts: [] }
  }

  // review.state === 'FAIL'
  if (review.reviewFailureKind === 'substantive') {
    return {
      action: 'NEEDS_FIX',
      reason: 'fleet/review found a real problem on the current head — never auto-retried',
      failingContexts: [REVIEW_JOB],
    }
  }
  if ((review.runAttempt ?? 1) <= 1) {
    return {
      action: 'RERUN_REVIEW',
      reason: 'fleet/review failed for an infrastructure reason (not the "Review" step itself) and has not been retried yet',
      failingContexts: [],
    }
  }
  return {
    action: 'NEEDS_FIX',
    reason: 'fleet/review failed for an infrastructure reason and was already retried once — needs a human, not another auto-retry',
    failingContexts: [REVIEW_JOB],
  }
}

/** Most-actionable first — see `renderBoard`'s own comment for why this
 *  ordering, not alphabetical or PR-number order, is the default grouping. */
const ACTION_ORDER: readonly BoardAction[] = [
  'MERGE', 'APPROVE_THEN_MERGE', 'RERUN_REVIEW', 'NEEDS_FIX',
  'LABEL_FOR_REVIEW', 'STALE_LABEL', 'WAITING', 'OPERATOR',
]

/**
 * Pure: every fact `buildBoard` needs is already in `facts` — no `gh` call,
 * no filesystem read, no label read. `classifyPr` decides every PR
 * independently; this function's only extra job is the cross-PR
 * `LABEL_FOR_REVIEW` cap (batching review requests correlates with engine
 * smoke failures — see the brief — so at most one PR per invocation ever
 * carries it, chosen as the OLDEST eligible by PR number, never by
 * `createdAt` or list order).
 */
export function buildBoard(facts: BoardFacts): BoardView {
  const classified = facts.prs.map((pr) => ({ pr, result: classifyPr(pr) }))

  const candidates = classified
    .filter((c) => c.result.action === 'LABEL_FOR_REVIEW_CANDIDATE')
    .sort((a, b) => a.pr.number - b.pr.number)
  const chosenNumber = candidates[0]?.pr.number

  const rows: BoardRow[] = classified.map(({ pr, result }) => {
    if (result.action === 'LABEL_FOR_REVIEW_CANDIDATE') {
      const chosen = pr.number === chosenNumber
      return {
        number: pr.number,
        author: pr.authorLogin,
        headRefOid: pr.headRefOid,
        failingContexts: [],
        action: chosen ? 'LABEL_FOR_REVIEW' : 'WAITING',
        reason: chosen
          ? result.reason
          : `${result.reason} — deferred: only one PR gets labelled for review per invocation (#${chosenNumber} is older)`,
      }
    }
    return {
      number: pr.number,
      author: pr.authorLogin,
      headRefOid: pr.headRefOid,
      action: result.action,
      failingContexts: result.failingContexts,
      reason: result.reason,
    }
  })

  rows.sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) || a.number - b.number)

  return { fleet: facts.fleet, rows }
}

// ---------------------------------------------------------------------------
// Rendering — read-only. `board` never labels, approves, merges, or re-runs;
// keeping the observer free of side effects is what makes it safe to run on
// every heartbeat and safe to test (see the module docstring).
// ---------------------------------------------------------------------------

function fleetLine(fleet: FleetStateFact): string {
  if (!fleet.halted) return 'fleet: not halted'
  const classifier = fleet.isQuotaHalt ? 'QUOTA' : 'consecutive-failure (or other)'
  return `fleet: HALTED — ${fleet.haltReason ?? 'unknown reason'} [${classifier}]`
}

/** Default, human-facing table: grouped by action, most-actionable first —
 *  see `ACTION_ORDER`. Never parsed by another program; see `renderBoardPorcelain`. */
export function renderBoard(view: BoardView): string {
  const lines: string[] = [fleetLine(view.fleet), '']

  for (const action of ACTION_ORDER) {
    const rows = view.rows.filter((r) => r.action === action)
    if (rows.length === 0) continue
    lines.push(`## ${action} (${rows.length})`)
    for (const r of rows) {
      const failing = r.failingContexts.length > 0 ? ` [failing: ${r.failingContexts.join(', ')}]` : ''
      lines.push(`- #${r.number} @${r.author} (${r.headRefOid.slice(0, 8)})${failing} — ${r.reason}`)
    }
    lines.push('')
  }

  if (view.rows.length === 0) lines.push('(no open pull requests)')

  return lines.join('\n').trimEnd()
}

/**
 * One unpadded, pipe-delimited row per PR and nothing else — copying
 * `status.sh`'s own `--porcelain` contract exactly, including its lesson:
 * document the field order here, in one place, and never let a caller parse
 * the padded human table instead.
 *
 * Field order: `number|action|author|headRefOid|failingContexts|reason`
 *   - `failingContexts`: comma-joined context names, empty string if none.
 *   - `reason`: any literal `|` in the reason text is replaced with `/` so a
 *     naive `split('|')` by a caller can never be thrown off by it — every
 *     reason string in this module is fleet-authored prose, never
 *     free-form GitHub text, so this never fires in practice; it exists so
 *     that stays true by construction, not by convention.
 *
 * A leading `fleet|<halted:yes/no>|<reason>|<QUOTA|OTHER>` line always comes
 * first, distinguishable by its literal `fleet` first field — the same shape
 * `dstat`'s own porcelain output does not need (it has no fleet-wide state
 * line) but this command does, per the brief.
 */
export function renderBoardPorcelain(view: BoardView): string {
  const lines: string[] = []
  const classifier = view.fleet.isQuotaHalt ? 'QUOTA' : 'OTHER'
  lines.push(['fleet', view.fleet.halted ? 'yes' : 'no', (view.fleet.haltReason ?? '').replace(/\|/g, '/'), classifier].join('|'))
  for (const r of view.rows) {
    lines.push([
      String(r.number), r.action, r.author, r.headRefOid,
      r.failingContexts.join(','), r.reason.replace(/\|/g, '/'),
    ].join('|'))
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Data acquisition — impure. Injected as `BoardFetchDeps` so this half is
// also unit-tested (a fake `graphql`/`jobSteps`), never exercised only by a
// real `gh` call.
// ---------------------------------------------------------------------------

const PR_QUERY = `
query($owner: String!, $repo: String!, $count: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: $count, orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes {
        number
        author { login }
        isDraft
        createdAt
        headRefOid
        headRefName
        mergeStateStatus
        reviewDecision
        labels(first: 50) { nodes { name } }
        commits(last: 1) {
          nodes {
            commit {
              oid
              statusCheckRollup {
                contexts(first: 50) {
                  nodes {
                    __typename
                    ... on CheckRun {
                      name
                      status
                      conclusion
                      checkSuite { workflowRun { databaseId } }
                    }
                    ... on StatusContext {
                      context
                      state
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`.trim()

interface GqlCheckRunNode {
  __typename: 'CheckRun'
  name: string
  status: string
  conclusion: string | null
  checkSuite?: { workflowRun?: { databaseId: number } | null } | null
}
interface GqlStatusContextNode {
  __typename: 'StatusContext'
  context: string
  state: string
}
type GqlContextNode = GqlCheckRunNode | GqlStatusContextNode

interface GqlPrNode {
  number: number
  author: { login: string } | null
  isDraft: boolean
  createdAt: string
  headRefOid: string
  headRefName: string
  mergeStateStatus: string
  reviewDecision: string | null
  labels: { nodes: { name: string }[] }
  commits: { nodes: { commit: { oid: string; statusCheckRollup: { contexts: { nodes: GqlContextNode[] } } | null } }[] }
}

interface GqlResponse {
  data?: { repository?: { pullRequests?: { nodes: GqlPrNode[] } } | null } | null
}

/** `CheckRun.status !== 'COMPLETED'` is still running or queued — never
 *  scored pass or fail. `SKIPPED`/`NEUTRAL` both count as pass-or-skip, per
 *  the brief; every other completed conclusion (`FAILURE`, `TIMED_OUT`,
 *  `CANCELLED`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, `STALE`) is a fail. */
export function normalizeCheckRunState(status: string, conclusion: string | null): CheckState {
  if (status !== 'COMPLETED') return 'PENDING'
  if (conclusion === 'SUCCESS' || conclusion === 'SKIPPED' || conclusion === 'NEUTRAL') return 'PASS'
  return 'FAIL'
}

/** `StatusState`: `EXPECTED`/`PENDING` are still running, `SUCCESS` passes,
 *  everything else (`ERROR`, `FAILURE`) fails. */
export function normalizeStatusContextState(state: string): CheckState {
  if (state === 'SUCCESS') return 'PASS'
  if (state === 'PENDING' || state === 'EXPECTED') return 'PENDING'
  return 'FAIL'
}

const BOARD_PR_LIMIT = 50

export interface BoardFetchDeps {
  /** `gh api graphql` for the query above — returns the raw response, or
   *  `undefined` on any failure (matching `ghJson`'s own contract). */
  queryOpenPrs(): Promise<GqlResponse | undefined>
  /** `gh api repos/{REPO}/actions/runs/{runId}/jobs` — only ever called for
   *  a `fleet/review` CheckRun whose conclusion is FAILURE, to classify why.
   *  `undefined` on any failure, which `fetchBoardFacts` treats as
   *  infrastructure (fail toward "worth a retry", never toward silently
   *  blessing a substantive failure as something else — see the module
   *  comment on `classifyReviewFailure`). */
  fetchRunJobs(runId: number): Promise<{ steps: WorkflowStep[]; runAttempt: number } | undefined>
  checkFleetHalt(): Promise<{ halted: boolean; reason?: string }>
}

function toCheckState(node: GqlContextNode): { name: string; kind: 'CheckRun' | 'StatusContext'; state: CheckState; workflowRunId?: number } {
  if (node.__typename === 'CheckRun') {
    return {
      name: node.name,
      kind: 'CheckRun',
      state: normalizeCheckRunState(node.status, node.conclusion),
      workflowRunId: node.checkSuite?.workflowRun?.databaseId ?? undefined,
    }
  }
  return { name: node.context, kind: 'StatusContext', state: normalizeStatusContextState(node.state) }
}

/**
 * Turns one `gh api graphql` response plus, for any FAILed `fleet/review`
 * CheckRun found in it, one `gh api .../actions/runs/{id}/jobs` lookup each,
 * into `BoardFacts`. The GraphQL call is the ONE query for all open PRs the
 * brief asks for; the per-run jobs lookup only ever fires for a PR whose
 * `fleet/review` is red, which is expected to be rare.
 */
export async function fetchBoardFactsWith(deps: BoardFetchDeps): Promise<BoardFacts> {
  const halt = await deps.checkFleetHalt()
  const fleet: FleetStateFact = { halted: halt.halted, haltReason: halt.reason, isQuotaHalt: isQuotaHaltReason(halt.reason) }

  const response = await deps.queryOpenPrs()
  const nodes = response?.data?.repository?.pullRequests?.nodes ?? []

  const prs = await Promise.all(nodes.map(async (node): Promise<PrFact> => {
    const commit = node.commits.nodes[0]?.commit
    const contextNodes = commit?.statusCheckRollup?.contexts.nodes ?? []
    const sha = commit?.oid ?? node.headRefOid

    const checks = await Promise.all(contextNodes.map(async (n): Promise<PrCheckContext> => {
      const base = toCheckState(n)
      const check: PrCheckContext = { name: base.name, kind: base.kind, sha, state: base.state }

      // Only a FAILed fleet/review CheckRun ever needs the infra-vs-
      // substantive split — every other context is inert past this point.
      if (base.kind === 'CheckRun' && base.name === REVIEW_JOB && base.state === 'FAIL' && base.workflowRunId !== undefined) {
        const jobInfo = await deps.fetchRunJobs(base.workflowRunId)
        if (jobInfo === undefined) {
          // Fail-safe toward "worth a retry": an unreadable run is treated
          // the same as an infra failure, never as a substantive one — the
          // same fail-safe direction `review-cache.ts`'s lookup already
          // uses for the identical reason (a read failure must never look
          // like a stronger verdict than it is).
          check.reviewFailureKind = 'infrastructure'
        } else {
          check.reviewFailureKind = classifyReviewFailure(jobInfo.steps)
          check.runAttempt = jobInfo.runAttempt
        }
      }
      return check
    }))

    return {
      number: node.number,
      authorLogin: node.author?.login ?? '(unknown)',
      isDraft: node.isDraft,
      createdAt: node.createdAt,
      headRefOid: node.headRefOid,
      headRefName: node.headRefName,
      mergeStateStatus: node.mergeStateStatus,
      labels: node.labels.nodes.map((l) => l.name),
      reviewDecision: node.reviewDecision,
      checks,
    }
  }))

  return { fleet, prs }
}

interface ActionsRunJob { name: string; run_attempt: number; steps: { name: string; conclusion: string | null }[] }
interface ActionsJobsResponse { jobs: ActionsRunJob[] }

function defaultBoardFetchDeps(): BoardFetchDeps {
  return {
    queryOpenPrs: async () => {
      const [owner, repoName] = REPO.split('/')
      return ghJson<GqlResponse>([
        'api', 'graphql',
        '-f', `query=${PR_QUERY}`,
        '-f', `owner=${owner ?? ''}`,
        '-f', `repo=${repoName ?? ''}`,
        '-F', `count=${BOARD_PR_LIMIT}`,
      ])
    },
    fetchRunJobs: async (runId) => {
      const data = await ghJson<ActionsJobsResponse>(['api', `repos/${REPO}/actions/runs/${runId}/jobs`])
      const job = data?.jobs[0]
      if (job === undefined) return undefined
      return { steps: job.steps.map((s) => ({ name: s.name, conclusion: s.conclusion })), runAttempt: job.run_attempt }
    },
    checkFleetHalt: checkHalt,
  }
}

export async function fetchBoardFacts(): Promise<BoardFacts> {
  return fetchBoardFactsWith(defaultBoardFetchDeps())
}

/** Wired into `cli.ts`'s `HANDLERS`. `--porcelain` anywhere in argv selects
 *  the machine-readable form; everything else prints the grouped table. */
export async function runBoard(args: string[]): Promise<number> {
  const facts = await fetchBoardFacts()
  const view = buildBoard(facts)
  const porcelain = args.includes('--porcelain')
  process.stdout.write((porcelain ? renderBoardPorcelain(view) : renderBoard(view)) + '\n')
  return 0
}
