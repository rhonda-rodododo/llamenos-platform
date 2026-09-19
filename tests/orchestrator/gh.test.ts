import { describe, it, expect } from 'vitest'
import { REPO, ghArgs, describeGhFailure } from '../../orchestrator/src/gh.js'

describe('gh', () => {
  it('pins the repo on every invocation', () => {
    expect(REPO).toBe('rhonda-rodododo/llamenos-platform')
    expect(ghArgs(['issue', 'list'])).toEqual(['issue', 'list', '-R', REPO])
  })

  it('does not duplicate an explicit -R', () => {
    expect(ghArgs(['issue', 'list', '-R', 'other/repo'])).toEqual(['issue', 'list', '-R', 'other/repo'])
  })

  // `gh api` rejects `-R`/`--repo` outright (`unknown shorthand flag: 'R' in
  // -R`) — verified against the real binary. This was silently breaking
  // every artifact-cache lookup in `review-cache.ts` (`gh(['api', ...])`),
  // which always embeds the repo directly in the endpoint path
  // (`repos/${REPO}/...`) and never needs `-R` at all.
  it('never appends -R to an api call — gh api has no such flag', () => {
    expect(ghArgs(['api', 'repos/owner/repo/actions/artifacts?name=x'])).toEqual([
      'api', 'repos/owner/repo/actions/artifacts?name=x',
    ])
  })

  it('leaves an api call alone even if it already carries an explicit -R/--repo-shaped string', () => {
    // Not a real use case (api calls never pass -R today), but ghArgs must
    // stay a no-op for 'api' regardless of what else is in args — the repo
    // is always embedded in the endpoint, never appended as a flag.
    expect(ghArgs(['api', 'user'])).toEqual(['api', 'user'])
  })
})

/**
 * The fleet's first scheduled tick after going live aborted with
 * `source unreadable for lane backend` and nothing else — no exit code, no
 * stderr, no error class — because `ghJson` caught every failure and returned
 * `undefined`. A credential problem, a rate limit, a network blip and a real
 * outage were indistinguishable, and a pass that failed CLOSED also failed
 * SILENTLY. These are the shapes `promisify(execFile)` actually rejects with,
 * which is what the diagnosis has to survive.
 */
describe('describeGhFailure', () => {
  it('leads with the exit code and carries gh\'s own stderr', () => {
    const d = describeGhFailure(Object.assign(new Error('Command failed: gh issue list'), {
      code: 1, stderr: 'gh: Bad credentials (HTTP 401)\n', stdout: '',
    }))
    expect(d).toBe('exit 1: gh: Bad credentials (HTTP 401)')
  })

  // A timeout rejects with killed=true and a signal, and NO exit code — the
  // 20-second abort that started this looked exactly like this shape.
  it('names a timeout as killed, not as an exit code', () => {
    const d = describeGhFailure(Object.assign(new Error('Command failed'), {
      killed: true, signal: 'SIGTERM', code: undefined, stderr: '',
    }))
    expect(d).toContain('killed (SIGTERM)')
  })

  // A missing binary rejects with a STRING code and no stderr at all.
  it('reports a missing gh binary from its string code and message', () => {
    const d = describeGhFailure(Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }))
    expect(d).toContain('error ENOENT')
    expect(d).toContain('spawn gh ENOENT')
  })

  // A JSON parse failure has no code and no stderr — only a message.
  it('falls back to the message when there is no code and no stderr', () => {
    expect(describeGhFailure(new SyntaxError('Unexpected token < in JSON at position 0')))
      .toBe('threw: Unexpected token < in JSON at position 0')
  })

  it('bounds the stderr snippet and flattens it to one line', () => {
    const d = describeGhFailure({ code: 1, stderr: 'a\nb\n' + 'x'.repeat(500) })
    expect(d).not.toContain('\n')
    expect(d.length).toBeLessThanOrEqual('exit 1: '.length + 200)
  })
})
