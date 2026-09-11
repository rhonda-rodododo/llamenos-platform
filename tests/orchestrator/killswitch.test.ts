import { describe, it, expect } from 'vitest'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('haltedOnGitHubFrom', () => {
  it('halts when an open issue carries the halt label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'OPEN' }])).toBe(true)
  })

  it('does not halt on a closed halt issue', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [{ name: 'halt' }], state: 'CLOSED' }])).toBe(false)
  })

  it('does not halt on the title alone without the label', () => {
    expect(haltedOnGitHubFrom([{ number: 1, title: '🛑 HALT ALL AGENTS', labels: [], state: 'OPEN' }])).toBe(false)
  })

  it('fails OPEN on an unreadable response', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})
