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

  // `gh api` rejects -R outright ("unknown shorthand flag"), so appending the
  // pin to it would break every status post with what reads at the call site
  // like an auth failure. The repo is still pinned for `api` — it is in the
  // path the caller builds from REPO (see ci.ts's postCommitStatus).
  it('does not append -R to gh api, which does not accept it', () => {
    expect(ghArgs(['api', `repos/${REPO}/statuses/abc`])).toEqual(['api', `repos/${REPO}/statuses/abc`])
  })
})
