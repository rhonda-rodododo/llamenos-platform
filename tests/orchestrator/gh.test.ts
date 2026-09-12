import { describe, it, expect } from 'vitest'
import { REPO, ghArgs } from '../../orchestrator/src/gh.js'

describe('gh', () => {
  it('pins the repo on every invocation', () => {
    expect(REPO).toBe('rhonda-rodododo/llamenos-platform')
    expect(ghArgs(['issue', 'list'])).toEqual(['issue', 'list', '-R', REPO])
  })

  it('does not duplicate an explicit -R', () => {
    expect(ghArgs(['issue', 'list', '-R', 'other/repo'])).toEqual(['issue', 'list', '-R', 'other/repo'])
  })
})
