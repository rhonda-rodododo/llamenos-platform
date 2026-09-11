import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface LaneScope {
  owned: string[]
  notOwned: string[]
}

/**
 * Fragment authors write the "Owned paths" / "Does NOT own" sections in two
 * shapes, both of which appear in the real `.claude/agents/fragments/*.md`
 * files:
 *   - bulleted-block: the heading sits alone on its own line, and each path
 *     underneath is a `- \`path\`` bullet (ios, android, desktop, backend,
 *     shared, infra all use this for "Owned paths").
 *   - inline: heading and paths share one line, comma-separated, with free
 *     prose (typically the owning lane's name in parens) trailing after the
 *     last path — e.g. desktop's and backend's "Does NOT own" lines.
 * A parser that only handles the bulleted-block shape silently produces an
 * empty `notOwned` for every real lane, because both real "Does NOT own"
 * lines are inline. That was exactly the bug: desktop's owned `tests/` then
 * looked unqualified, overlapping backend's `tests/features/`/`tests/steps/`
 * — the write-collision this whole scope system exists to prevent. A bullet
 * or an inline heading can also list MORE than one backticked path on a
 * single line (e.g. infra's `Dockerfile*`, `knope.toml`, `Caddyfile*`), so
 * every backtick span on a line is a candidate, never just the first.
 *
 * Not every backtick span is a path, though: backend's sip-bridge bullet is
 * `` `apps/sip-bridge/` — ... (`PBX_TYPE` selects ARI/ESL/Kamailio) `` — the
 * second span is an env var name mentioned in the description, not a path.
 * Backtick spans are kept only when they look path-shaped (contain `/`, `.`,
 * or `*`); a bare identifier like `PBX_TYPE` has none of those and is
 * dropped. Every genuine path in the current fragments contains at least
 * one, so this does not lose real scope.
 *
 * New fragment authors: keep the heading on its own line if you want a
 * multi-bullet list below it, or put the heading and all paths on one line
 * if the whole section is one line — mixing (heading + one inline path, then
 * more bullets below) is not a shape this parser recognizes and will drop
 * the later bullets silently. And any backticked path must contain `/`, `.`,
 * or `*` or it will be silently treated as prose, not scope.
 */
const OWNED_HEADING = /^\*\*Owned paths:?\*\*\s*(.*)$/
const NOT_OWNED_HEADING = /^\*\*Does NOT own:?\*\*\s*(.*)$/i
const HEADING_LINE = /^\*\*/
const BULLET_LINE = /^[-*]\s+(.*)$/

/** A path-shaped backtick span has a directory separator, a file extension,
 *  or a glob star; a bare word like `PBX_TYPE` has none. */
function looksLikePath(s: string): boolean {
  return /[/.*]/.test(s)
}

function extractBackticks(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (m[1] && looksLikePath(m[1])) out.push(m[1])
  }
  return out
}

function collectSection(lines: string[], startIdx: number): string[] {
  const out: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const t = line.trim()
    if (HEADING_LINE.test(t)) break
    const bm = BULLET_LINE.exec(t)
    if (!bm) continue
    out.push(...extractBackticks(bm[1] ?? ''))
  }
  return out
}

/**
 * The scope breaker compares a worker's diff against these paths. They come
 * from the same fragment that briefs the worker, so a lane cannot be told it
 * owns something the breaker will then reject — the drift the reference system
 * could not prevent, because there scope lived in config and ownership lived in
 * prompt text.
 */
export function parseOwnedPaths(markdown: string): LaneScope {
  const lines = markdown.split('\n')
  let owned: string[] = []
  let notOwned: string[] = []
  lines.forEach((line, i) => {
    const t = line.trim()
    const ownedMatch = OWNED_HEADING.exec(t)
    const notOwnedMatch = NOT_OWNED_HEADING.exec(t)
    if (ownedMatch) {
      const inline = ownedMatch[1]?.trim() ?? ''
      owned = inline ? extractBackticks(inline) : collectSection(lines, i)
    } else if (notOwnedMatch) {
      const inline = notOwnedMatch[1]?.trim() ?? ''
      notOwned = inline ? extractBackticks(inline) : collectSection(lines, i)
    }
  })
  return { owned, notOwned }
}

/**
 * Owned-path patterns come straight from fragment prose and take three
 * shapes: a directory (`apps/ios/`, trailing slash — matches everything
 * beneath it), a glob (`Dockerfile*`, `.github/workflows/ios*.yml` — `*`
 * matches within one path segment, never across `/`), or a literal/prefix
 * path with no wildcard at all. The scope breaker (Task 8's `checkScope`)
 * used a bare `startsWith`, which judges `.github/workflows/ios-e2e.yml`
 * out-of-lane for the ios lane that owns `.github/workflows/ios*.yml` —
 * `*` was never translated into anything a prefix check understands.
 */
export function matchesPath(file: string, pattern: string): boolean {
  if (pattern.endsWith('/')) {
    return file.startsWith(pattern)
  }
  if (!pattern.includes('*')) {
    return file.startsWith(pattern)
  }
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${escaped}$`).test(file)
}

export async function loadLaneScopes(repoRoot: string): Promise<Record<string, LaneScope>> {
  const dir = join(repoRoot, '.claude', 'agents', 'fragments')
  const files = await readdir(dir)
  const out: Record<string, LaneScope> = {}
  for (const f of files) {
    if (!f.endsWith('-supervisor.md')) continue
    const lane = f.replace(/-supervisor\.md$/, '')
    out[lane] = parseOwnedPaths(await readFile(join(dir, f), 'utf8'))
  }
  return out
}
