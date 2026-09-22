import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `gh.ts` calls `promisify(execFile)` at module load time — that only
 * resolves to `{stdout, stderr}` (rather than a generic promisify fallback)
 * because Node's REAL `child_process.execFile` carries a
 * `util.promisify.custom` implementation. Replacing the whole `execFile`
 * export (as `vi.mock` does) loses that unless the mock re-attaches its own
 * `promisify.custom` — exactly the pattern integrator.test.ts already
 * established for the same reason. `mockImpl` is swapped per test via
 * `setMockImpl` below instead of `mockImplementation`, since the custom
 * symbol function is what `execFileAsync` actually calls, not `mockFn`
 * itself.
 */
let mockImpl: (args: string[]) => Promise<{ stdout: string; stderr: string }> = () => Promise.resolve({ stdout: '', stderr: '' })

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify: nodePromisify } = await import('node:util')
  const mockFn = vi.fn()
  ;(mockFn as unknown as Record<symbol, unknown>)[nodePromisify.custom] =
    (_file: string, args: string[]) => mockImpl(args)
  return { ...actual, execFile: mockFn }
})

import { GitHubSink } from '../../orchestrator/src/sink.js'
import { REPO } from '../../orchestrator/src/gh.js'

function setMockImpl(fn: typeof mockImpl): void {
  mockImpl = fn
}

const calls: string[][] = []

beforeEach(() => {
  calls.length = 0
  setMockImpl((args) => { calls.push(args); return Promise.resolve({ stdout: '', stderr: '' }) })
})

describe('GitHubSink.listComments', () => {
  it('parses the numeric comment id out of each comment\'s url', async () => {
    setMockImpl((args) => {
      calls.push(args)
      return Promise.resolve({
        stdout: JSON.stringify({
          comments: [
            { url: 'https://github.com/o/r/issues/1#issuecomment-111', body: 'first' },
            { url: 'https://github.com/o/r/issues/1#issuecomment-222', body: 'second' },
          ],
        }),
        stderr: '',
      })
    })
    const sink = new GitHubSink()
    const comments = await sink.listComments('1')
    expect(comments).toEqual([
      { id: '111', body: 'first' },
      { id: '222', body: 'second' },
    ])
  })

  it('drops a comment whose url carries no parseable numeric id, rather than throwing', async () => {
    setMockImpl(() => Promise.resolve({
      stdout: JSON.stringify({ comments: [{ url: 'https://example.com/not-a-comment-url', body: 'weird' }] }),
      stderr: '',
    }))
    const sink = new GitHubSink()
    expect(await sink.listComments('1')).toEqual([])
  })

  it('returns an empty list, never throws, when the live read fails', async () => {
    setMockImpl(() => Promise.reject(Object.assign(new Error('boom'), { code: 1, stderr: 'gh: not found' })))
    const sink = new GitHubSink()
    await expect(sink.listComments('1')).resolves.toEqual([])
  })
})

describe('GitHubSink.editComment', () => {
  it('PATCHes the specific REST comment id via gh api', async () => {
    const sink = new GitHubSink()
    await sink.editComment('222', 'new body')
    expect(calls).toHaveLength(1)
    const args = calls[0] ?? []
    expect(args).toContain(`repos/${REPO}/issues/comments/222`)
    expect(args).toContain('PATCH')
    expect(args).toContain('body=new body')
  })

  // `gh api` rejects `-R`/`--repo` outright ("unknown shorthand flag: 'R'")
  // — see gh.test.ts's own dedicated test for `ghArgs`. This is the
  // regression guard at the call site that would actually break: a
  // `GitHubSink.editComment` that appended `-R` would fail every real edit.
  it('never appends -R — gh api does not accept it', async () => {
    const sink = new GitHubSink()
    await sink.editComment('222', 'new body')
    expect(calls[0]).toEqual(['api', `repos/${REPO}/issues/comments/222`, '-X', 'PATCH', '-f', 'body=new body'])
  })
})

describe('GitHubSink.comment / addLabel / removeLabel — unchanged argv shape', () => {
  it('comment posts via issue comment --body', async () => {
    const sink = new GitHubSink()
    await sink.comment('5', 'hello')
    expect(calls[0]).toEqual(['issue', 'comment', '5', '--body', 'hello', '-R', REPO])
  })
})
