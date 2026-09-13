import { describe, it, expect, vi, beforeEach } from 'vitest'

// `GitHubSource.list()` shells out through `ghJson`, so the seam under test is
// the whole path from a real `execFile` rejection to the `detail` an operator
// reads. Mocked at node:child_process for that reason — mocking `ghJson`
// instead would assert the wiring against itself, which is precisely the gap
// that let a silent failure ship.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { vi: vitest } = await import('vitest')
  const { promisify: nodePromisify } = await import('node:util')
  const mockFn = vitest.fn()
  ;(mockFn as unknown as Record<symbol, unknown>)[nodePromisify.custom] =
    (file: string, args?: readonly string[], options?: unknown) => mockFn(file, args, options)
  return { ...actual, execFile: mockFn }
})

import { execFile } from 'node:child_process'
const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>

beforeEach(() => { mockExecFile.mockReset() })

async function listWith(behaviour: () => Promise<{ stdout: string; stderr: string }>) {
  mockExecFile.mockImplementation(behaviour)
  const { GitHubSource } = await import('../../orchestrator/src/source.js')
  return new GitHubSource('agent-dispatchable').list()
}

describe('GitHubSource.list — a failed read carries its reason', () => {
  it('returns the items on a clean read', async () => {
    const raw = [{ number: 7, title: 't', body: 'b', url: 'u', state: 'OPEN', labels: [{ name: 'agent-dispatchable' }] }]
    const r = await listWith(async () => ({ stdout: JSON.stringify(raw), stderr: '' }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.items[0]?.id).toBe('7')
  })

  // The shape observed in production: the fleet's first scheduled tick aborted
  // with `source unreadable for lane backend` and nothing else, because this
  // detail was thrown away at the point of failure.
  it('reports gh\'s exit code and stderr when gh refuses', async () => {
    const r = await listWith(async () => {
      throw Object.assign(new Error('Command failed: gh issue list'), {
        code: 1, stderr: 'gh: Bad credentials (HTTP 401)\n', stdout: '',
      })
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.detail).toBe('exit 1: gh: Bad credentials (HTTP 401)')
  })

  it('reports a timeout as killed rather than as an exit code', async () => {
    const r = await listWith(async () => {
      throw Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM', stderr: '' })
    })
    expect(r.ok === false && r.detail).toContain('killed (SIGTERM)')
  })

  it('reports a missing gh binary', async () => {
    const r = await listWith(async () => { throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }) })
    expect(r.ok === false && r.detail).toContain('ENOENT')
  })

  // gh exiting 0 with output that is not JSON — an upgrade notice or a
  // paginator banner on stdout would land here.
  it('reports unparseable output rather than pretending the backlog is empty', async () => {
    const r = await listWith(async () => ({ stdout: 'gh: a new release is available\n', stderr: '' }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.detail.length).toBeGreaterThan(0)
  })

  // The load-bearing distinction this whole type exists for.
  it('an EMPTY backlog is a successful read, never a failure', async () => {
    const r = await listWith(async () => ({ stdout: '[]', stderr: '' }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.items).toEqual([])
  })
})
