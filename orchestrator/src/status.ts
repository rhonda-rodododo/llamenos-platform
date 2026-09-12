import type { Outcome, RunRecord } from './ledger.js'

/**
 * G1: `llamenos-fleet status <issue>` derives everything it prints from a
 * live query — `gh` for the PR's actual state, this ledger for the fleet's
 * own past actions, and `git`/the filesystem for whether a worktree or
 * branch still exists. Nothing here is a label. See ledger.ts's own module
 * comment for why: a label the fleet writes to describe an outcome is a
 * cache that can drift from reality (issue #660's `fleet:merged` on a PR
 * that was never merged) — this module exists so nothing needs to.
 */

export type PrState = 'OPEN' | 'CLOSED' | 'MERGED'

export interface PrReview { state: string; author: string }

/** Exactly the facts `gh pr view --json state,headRefOid,reviews` (plus
 *  GitHub's own MERGED state, which `gh` folds into `state` directly) can
 *  answer — nothing here is ever a label on the linked issue. */
export interface PrFacts {
  number: string
  state: PrState
  headRefOid: string
  reviews: PrReview[]
}

export interface ItemStatusFacts {
  itemId: string
  /** Every ledger row for this item, any order. */
  rows: RunRecord[]
  /** `undefined`: no PR was ever recorded for this item, or the live `gh`
   *  read failed — the two are rendered identically ("no PR found"), since
   *  neither gives this command anything to report. */
  pr?: PrFacts
  /** `undefined` when not checked (e.g. no branch to check at all). */
  branchExists?: boolean
  worktreeExists?: boolean
}

export interface ItemStatusView {
  itemId: string
  /** Newest first. */
  rows: RunRecord[]
  /** Parsed from the most recent row whose G2 gate-trace note carries a
   *  `sha=<commit>` field — the exact commit `verifyMechanical` examined,
   *  never re-derived from the PR's current head. `undefined` when no row
   *  ever ran verification (e.g. the item was never dispatched, or every
   *  attempt stopped before verification). */
  lastVerifiedSha?: string
  pr?: PrFacts & {
    merged: boolean
    /** `undefined` only when there is no verified SHA to compare against at
     *  all (verification never ran) — never a silent `true`. */
    headMatchesVerified?: boolean
  }
  /** A fleet SUCCESS or BLOCKED row exists for this item AND `gh` says the
   *  PR is still open and unmerged — a fact computed fresh every call, per
   *  the digest's own "waiting on a human" definition (digest.ts). */
  awaitingHuman: boolean
  branchExists?: boolean
  worktreeExists?: boolean
}

/** `verify=`/`review=`/`merge=` etc. all use `=`, so anchoring on `sha=`
 *  specifically (rather than splitting the whole note on spaces) is safe
 *  even though the reason text after other fields can itself contain `=`
 *  or spaces — `sha` is always the LAST field `buildGateTrace` emits and its
 *  value is a bare hex commit (or the literal `none`), never free text. */
const SHA_FIELD_RE = /(?:^|\s)sha=(\S+)/

export function extractVerifiedSha(note: string | undefined): string | undefined {
  if (note === undefined) return undefined
  const m = SHA_FIELD_RE.exec(note)
  const sha = m?.[1]
  if (sha === undefined || sha === 'none') return undefined
  return sha
}

const OUTCOMES_MEANING_A_PR_WAS_LEFT_FOR_A_HUMAN: ReadonlySet<Outcome> = new Set<Outcome>(['SUCCESS', 'BLOCKED'])

/**
 * Pure: every fact this needs is already gathered in `facts`. No `gh` call,
 * no filesystem check, no label read — see the module comment above.
 */
export function deriveItemStatus(facts: ItemStatusFacts): ItemStatusView {
  const rows = [...facts.rows].sort((a, b) => b.ts - a.ts)
  const lastVerifiedSha = rows.map((r) => extractVerifiedSha(r.note)).find((sha) => sha !== undefined)

  const pr = facts.pr === undefined ? undefined : {
    ...facts.pr,
    merged: facts.pr.state === 'MERGED',
    headMatchesVerified: lastVerifiedSha === undefined ? undefined : facts.pr.headRefOid === lastVerifiedSha,
  }

  const latestTerminal = rows.find((r) => r.outcome !== 'DISPATCHED')
  const awaitingHuman = pr !== undefined && pr.state === 'OPEN' &&
    latestTerminal !== undefined && OUTCOMES_MEANING_A_PR_WAS_LEFT_FOR_A_HUMAN.has(latestTerminal.outcome)

  return {
    itemId: facts.itemId,
    rows,
    lastVerifiedSha,
    pr,
    awaitingHuman,
    branchExists: facts.branchExists,
    worktreeExists: facts.worktreeExists,
  }
}

function yesNoUnknown(v: boolean | undefined): string {
  return v === undefined ? 'unknown' : v ? 'yes' : 'no'
}

export function renderItemStatus(view: ItemStatusView): string {
  const lines: string[] = [`# Item ${view.itemId}`, '', '## Ledger']

  if (view.rows.length === 0) {
    lines.push('  (no runs recorded)')
  } else {
    for (const r of view.rows) {
      const prSuffix = r.pr !== undefined ? ` pr=${r.pr}` : ''
      const noteSuffix = r.note !== undefined ? ` — ${r.note}` : ''
      lines.push(`- [${new Date(r.ts).toISOString()}] ${r.outcome} (run ${r.runId}, lane ${r.lane})${prSuffix}${noteSuffix}`)
    }
  }

  lines.push('', '## Pull request')
  if (view.pr === undefined) {
    lines.push('  (no PR found for this item)')
  } else {
    lines.push(`- state: ${view.pr.state}${view.pr.merged ? ' — MERGED' : ''}`)
    lines.push(`- head SHA: ${view.pr.headRefOid}`)
    lines.push(`- last verified SHA: ${view.lastVerifiedSha ?? '(none recorded — verification never ran or was never recorded)'}`)
    if (view.pr.headMatchesVerified !== undefined) {
      lines.push(
        view.pr.headMatchesVerified
          ? '- head matches the last verified SHA'
          : '- head DOES NOT MATCH the last verified SHA — the branch moved since verification',
      )
    }
    lines.push(`- reviews: ${view.pr.reviews.length === 0
      ? '(none)'
      : view.pr.reviews.map((r) => `${r.author}:${r.state}`).join(', ')}`)
  }

  lines.push('', '## Worktree / branch')
  lines.push(`- branch exists: ${yesNoUnknown(view.branchExists)}`)
  lines.push(`- worktree exists: ${yesNoUnknown(view.worktreeExists)}`)

  lines.push('', `## Awaiting a human: ${view.awaitingHuman ? 'YES' : 'no'}`)

  return lines.join('\n')
}
