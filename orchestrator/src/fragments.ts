import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface LaneScope {
  owned: string[]
  notOwned: string[]
}

const OWNED_HEADING = /^\*\*Owned paths:\*\*\s*$/
const NOT_OWNED_HEADING = /^\*\*Does NOT own:?\*\*\s*$/i
const ANY_HEADING = /^\*\*.+\*\*\s*$/
const BULLET_PATH = /^[-*]\s+`([^`]+)`/

function collectSection(lines: string[], startIdx: number): string[] {
  const out: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (ANY_HEADING.test(line.trim())) break
    const m = BULLET_PATH.exec(line.trim())
    if (m?.[1]) out.push(m[1])
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
    if (OWNED_HEADING.test(t)) owned = collectSection(lines, i)
    else if (NOT_OWNED_HEADING.test(t)) notOwned = collectSection(lines, i)
  })
  return { owned, notOwned }
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
