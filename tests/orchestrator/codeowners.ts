import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The owned patterns from the repo's real `CODEOWNERS`, read from disk.
 *
 * CODEOWNERS stopped being documentation with this change: it IS the fleet's
 * "this needs a human" gate now, enforced by GitHub's own "require review
 * from Code Owners" rule rather than by a function in this repo that only
 * this repo obeyed. So the tests that used to assert `mayAutoMerge` refused a
 * sensitive diff assert coverage of this file instead — against the real
 * file, never a fixture, because a fixture would keep passing while the
 * shipped one lost an entry.
 */
export function codeownersPatterns(repoRoot: string = process.cwd()): string[] {
  return readFileSync(join(repoRoot, 'CODEOWNERS'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0] ?? '')
    .filter((p) => p.length > 0)
}
