import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { matchesPath } from './fragments.js'
import type { Brief, BriefSection } from './brief.js'
import type { RunRecord } from './ledger.js'

/**
 * The reference system's sharpest gap: its ledger is written by the
 * orchestrator and read by nothing that briefs a worker, so every run starts
 * from zero and an item simply fails three times before being set aside.
 * This file is the read side of the ledger — it turns history that already
 * exists into context a fresh worker actually sees.
 */
export interface Contract {
  path: string
  title: string
  owner: string
  governs: string[]
  body: string
}

export interface MemoryContext {
  priorAttempts: RunRecord[]
  lastReviewVerdict?: { verdict: string; text: string }
  contracts: Contract[]
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/

/**
 * A contract file is front-matter (`title`, `owner`, `governs: [glob, ...]`)
 * plus a body, same shape as the supervisor agent fragments. A file with no
 * parseable front-matter is skipped rather than thrown on — one malformed
 * contract must not take every other contract down with it.
 */
function parseContract(path: string, markdown: string): Contract | undefined {
  const m = FRONT_MATTER.exec(markdown)
  if (!m) return undefined
  const [, rawFrontMatter, body] = m
  let parsed: unknown
  try {
    parsed = parseYaml(rawFrontMatter ?? '')
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const fm = parsed as Record<string, unknown>
  const title = fm['title']
  const owner = fm['owner']
  const governs = fm['governs']
  if (typeof title !== 'string' || typeof owner !== 'string' || !Array.isArray(governs)) return undefined
  if (!governs.every((g) => typeof g === 'string')) return undefined
  return { path, title, owner, governs: governs as string[], body: (body ?? '').trim() }
}

/**
 * Reads every `*.md` under `.claude/coordination/contracts/`, excluding the
 * README (format documentation, not a contract). Contracts live in git,
 * deliberately: a contract says "the backend's API shape is X, so iOS and
 * Android must match," which must be true AT A COMMIT and must change in the
 * PR that changes the interface. A contract in a GitHub comment is read by a
 * worker checked out at an older commit as a description of code that
 * worker does not have — the commit and the claim about it would drift
 * apart with no way to tell.
 */
export async function loadContracts(repoRoot: string): Promise<Contract[]> {
  const dir = join(repoRoot, '.claude', 'coordination', 'contracts')
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const out: Contract[] = []
  for (const f of files) {
    if (!f.endsWith('.md') || f === 'README.md') continue
    const full = join(dir, f)
    const text = await readFile(full, 'utf8')
    const contract = parseContract(full, text)
    if (contract) out.push(contract)
  }
  return out
}

/**
 * Selects the contracts governing any of the given paths. Reuses
 * `matchesPath` from fragments.ts rather than writing a second glob
 * matcher — one matcher, one set of edge cases, everywhere paths are
 * matched against globs in this fleet.
 */
export function contractsFor(changedOrScopePaths: string[], contracts: Contract[]): Contract[] {
  return contracts.filter((c) =>
    c.governs.some((glob) => changedOrScopePaths.some((p) => matchesPath(p, glob))))
}

const MAX_PRIOR_ATTEMPTS = 3

/**
 * Builds the context `augmentBrief` renders, scoped to exactly one item.
 * Filtering happens HERE, once, rather than trusting every call site to
 * remember it: `allRuns` is the whole ledger — every lane, every item — and
 * a `MemoryContext` that let another item's failures leak into this item's
 * brief would be actively misleading, not merely unhelpful. Sorted newest
 * first and capped at the three most recent, matching `buildBrief`'s own
 * prior-attempts section.
 */
export function buildMemoryContext(
  itemId: string,
  allRuns: RunRecord[],
  contracts: Contract[],
  lastReviewVerdict?: { verdict: string; text: string },
): MemoryContext {
  const priorAttempts = allRuns
    .filter((r) => r.itemId === itemId)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_PRIOR_ATTEMPTS)
  return { priorAttempts, lastReviewVerdict, contracts }
}

/**
 * Adds sections to the composable brief Task 3 built — never regenerates or
 * string-splices it. Adds nothing when there is no history: a brief padded
 * with empty "Previous attempts: none" sections wastes the worker's context
 * window for no information. Expects `ctx.priorAttempts` to already be
 * scoped to this item (see `buildMemoryContext`) — this function renders
 * whatever it is given, it does not re-filter.
 */
export function augmentBrief(base: Brief, ctx: MemoryContext): Brief {
  const sections: BriefSection[] = [...base.sections]

  if (ctx.priorAttempts.length > 0) {
    const lines = ctx.priorAttempts.map((r, i) =>
      `${i + 1}. **${r.outcome}** — ${r.note ?? '(no note recorded)'}`)
    sections.push({
      heading: 'Prior attempts on this item',
      body:
        `This item has been attempted before. Read what happened so you do not repeat it:\n\n` +
        `${lines.join('\n')}`,
    })
  }

  if (ctx.lastReviewVerdict) {
    sections.push({
      heading: 'Last reviewer verdict',
      body: `${ctx.lastReviewVerdict.verdict}\n\n${ctx.lastReviewVerdict.text}`,
    })
  }

  if (ctx.contracts.length > 0) {
    const lines = ctx.contracts.map((c) => `### ${c.title} (owner: ${c.owner})\n\n${c.body}`)
    sections.push({
      heading: 'Governing contracts',
      body:
        `The following interface contracts govern paths this work touches. Their terms are ` +
        `binding — if your change would violate one, stop and say so rather than proceeding:\n\n` +
        `${lines.join('\n\n')}`,
    })
  }

  return { sections }
}
