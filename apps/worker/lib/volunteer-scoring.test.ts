/**
 * Unit tests for volunteer scoring algorithm.
 *
 * Covers: scoreVolunteers with all filtering and scoring criteria.
 */

import { describe, it, expect } from 'vitest'
import { scoreVolunteers } from './volunteer-scoring'
import type { ScoringInput } from './volunteer-scoring'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides?: Partial<{
  pubkey: string
  active: boolean
  onBreak: boolean
  spokenLanguages: string[]
  maxCaseAssignments: number | undefined
  specializations: string[]
}>) {
  return {
    pubkey: overrides?.pubkey ?? 'volunteer1',
    active: overrides?.active ?? true,
    onBreak: overrides?.onBreak ?? false,
    spokenLanguages: overrides?.spokenLanguages ?? [],
    maxCaseAssignments: overrides?.maxCaseAssignments,
    specializations: overrides?.specializations ?? [],
  }
}

function makeInput(overrides?: Partial<ScoringInput>): ScoringInput {
  const user = makeUser()
  return {
    allUsers: [user],
    onShiftPubkeys: [user.pubkey],
    alreadyAssigned: [],
    activeCaseCounts: new Map(),
    languageNeed: undefined,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Eligibility filtering
// ---------------------------------------------------------------------------

describe('scoreVolunteers — eligibility filtering', () => {
  it('returns empty array when no users', () => {
    const result = scoreVolunteers({ ...makeInput(), allUsers: [] })
    expect(result).toEqual([])
  })

  it('excludes inactive users', () => {
    const input = makeInput({ allUsers: [makeUser({ active: false })] })
    expect(scoreVolunteers(input)).toHaveLength(0)
  })

  it('excludes users on break', () => {
    const user = makeUser({ onBreak: true })
    const input = makeInput({ allUsers: [user], onShiftPubkeys: [user.pubkey] })
    expect(scoreVolunteers(input)).toHaveLength(0)
  })

  it('excludes users not on shift', () => {
    const user = makeUser({ pubkey: 'notOnShift' })
    const input: ScoringInput = {
      allUsers: [user],
      onShiftPubkeys: [], // empty — no one on shift
      alreadyAssigned: [],
      activeCaseCounts: new Map(),
    }
    expect(scoreVolunteers(input)).toHaveLength(0)
  })

  it('excludes already-assigned volunteers', () => {
    const user = makeUser({ pubkey: 'v1' })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      alreadyAssigned: [user.pubkey],
    })
    expect(scoreVolunteers(input)).toHaveLength(0)
  })

  it('excludes volunteers at max capacity', () => {
    const user = makeUser({ pubkey: 'v1', maxCaseAssignments: 3 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 3]]),
    })
    expect(scoreVolunteers(input)).toHaveLength(0)
  })

  it('includes volunteers with capacity available', () => {
    const user = makeUser({ pubkey: 'v1', maxCaseAssignments: 5 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 4]]),
    })
    expect(scoreVolunteers(input)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe('scoreVolunteers — scoring', () => {
  it('base score is 50 for all eligible volunteers', () => {
    const result = scoreVolunteers(makeInput())
    expect(result[0].score).toBeGreaterThanOrEqual(50)
  })

  it('max workload score adds 30 when utilization is 0', () => {
    const user = makeUser({ pubkey: 'v1', maxCaseAssignments: 10 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 0]]),
    })
    const result = scoreVolunteers(input)
    // base (50) + workload (30) = 80
    expect(result[0].score).toBe(80)
  })

  it('language match adds 15 points', () => {
    const user = makeUser({ pubkey: 'v1', spokenLanguages: ['es'], maxCaseAssignments: 10 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 0]]),
      languageNeed: 'es',
    })
    const result = scoreVolunteers(input)
    // base(50) + workload(30) + language(15) = 95
    expect(result[0].score).toBe(95)
    expect(result[0].reasons).toContain('Speaks es')
  })

  it('no language bonus when volunteer does not speak the language', () => {
    const user = makeUser({ pubkey: 'v1', spokenLanguages: ['en'], maxCaseAssignments: 10 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 0]]),
      languageNeed: 'es',
    })
    const result = scoreVolunteers(input)
    expect(result[0].score).toBe(80) // no language bonus
  })

  it('specialization adds 5 points', () => {
    const user = makeUser({ pubkey: 'v1', specializations: ['crisis'], maxCaseAssignments: 10 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 0]]),
    })
    const result = scoreVolunteers(input)
    // base(50) + workload(30) + spec(5) = 85
    expect(result[0].score).toBe(85)
    expect(result[0].reasons).toContain('Has specializations')
  })

  it('results are sorted descending by score', () => {
    const v1 = makeUser({ pubkey: 'v1', spokenLanguages: ['es'], maxCaseAssignments: 10 })
    const v2 = makeUser({ pubkey: 'v2', maxCaseAssignments: 10 })
    const input: ScoringInput = {
      allUsers: [v1, v2],
      onShiftPubkeys: ['v1', 'v2'],
      alreadyAssigned: [],
      activeCaseCounts: new Map([['v1', 0], ['v2', 0]]),
      languageNeed: 'es',
    }
    const result = scoreVolunteers(input)
    expect(result[0].pubkey).toBe('v1') // v1 has language bonus
    expect(result[0].score).toBeGreaterThan(result[1].score)
  })

  it('activeCaseCount defaults to 0 when not in map', () => {
    const result = scoreVolunteers(makeInput())
    expect(result[0].activeCaseCount).toBe(0)
  })

  it('effectiveMax defaults to 20 when maxCaseAssignments is null', () => {
    const user = makeUser({ pubkey: 'v1', maxCaseAssignments: undefined })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 0]]),
    })
    const result = scoreVolunteers(input)
    expect(result[0].maxCases).toBe(20)
  })

  it('includes "On shift" in reasons', () => {
    const result = scoreVolunteers(makeInput())
    expect(result[0].reasons).toContain('On shift')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('scoreVolunteers — edge cases', () => {
  it('handles no language need (no bonus for any volunteer)', () => {
    const user = makeUser({ pubkey: 'v1', spokenLanguages: ['es', 'en'] })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      languageNeed: undefined,
    })
    const result = scoreVolunteers(input)
    expect(result[0].reasons).not.toContain('Speaks')
  })

  it('excludes volunteer at exactly max capacity when maxCaseAssignments > 0', () => {
    const user = makeUser({ pubkey: 'v1', maxCaseAssignments: 5 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 5]]),
    })
    expect(scoreVolunteers(input)).toHaveLength(0)
  })

  it('allows volunteer when maxCaseAssignments is 0 (unlimited)', () => {
    const user = makeUser({ pubkey: 'v1', maxCaseAssignments: 0 })
    const input = makeInput({
      allUsers: [user],
      onShiftPubkeys: [user.pubkey],
      activeCaseCounts: new Map([['v1', 100]]),
    })
    // maxCaseAssignments=0 means no cap
    expect(scoreVolunteers(input)).toHaveLength(1)
  })
})
