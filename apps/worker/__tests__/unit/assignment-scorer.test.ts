import { describe, it, expect } from 'vitest'
import { scoreVolunteers, type ScoringInput } from '../../lib/assignment-scorer'

type ScoringUser = ScoringInput['allUsers'][number]

function makeUser(overrides: Partial<ScoringUser> & { pubkey: string }): ScoringUser {
  return {
    active: true,
    onBreak: false,
    spokenLanguages: ['en'],
    specializations: [],
    maxCaseAssignments: undefined,
    ...overrides,
  }
}

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    allUsers: [],
    onShiftPubkeys: [],
    alreadyAssigned: [],
    activeCaseCounts: new Map(),
    requiredSpecializations: [],
    ...overrides,
  }
}

describe('scoreVolunteers — real formula', () => {
  it('workload: full score (20) when 0 of default 5 cases used', () => {
    const vol = makeUser({ pubkey: 'v1' })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
    }))
    // workload = max(0, 20 - 0*4) = 20
    // availability = 10 (on shift)
    // language = 0 (no need)
    // specialization = 0 (no required)
    expect(s.workloadScore).toBe(20)
    expect(s.availabilityScore).toBe(10)
    expect(s.score).toBe(30)
  })

  it('workload: decreases by 4 per active case, floors at 0', () => {
    const vol4 = makeUser({ pubkey: 'v4' })
    const vol6 = makeUser({ pubkey: 'v6' })
    const counts = new Map([['v4', 4], ['v6', 6]])

    const result = scoreVolunteers(makeInput({
      allUsers: [vol4, vol6],
      onShiftPubkeys: ['v4', 'v6'],
      activeCaseCounts: counts,
    }))

    const r4 = result.find(r => r.pubkey === 'v4')!
    const r6 = result.find(r => r.pubkey === 'v6')!
    // v4: max(0, 20 - 4*4) = 4
    expect(r4.workloadScore).toBe(4)
    // v6: max(0, 20 - 6*4) = 0
    expect(r6.workloadScore).toBe(0)
  })

  it('language: +15 when volunteer speaks requested language', () => {
    const vol = makeUser({ pubkey: 'v1', spokenLanguages: ['en', 'es'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      languageNeed: 'es',
    }))
    expect(s.languageScore).toBe(15)
  })

  it('language: 0 when no language need specified', () => {
    const vol = makeUser({ pubkey: 'v1', spokenLanguages: ['en', 'es'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
    }))
    expect(s.languageScore).toBe(0)
  })

  it('specialization: proportional — 2/4 required = score 12 or 13 (rounding)', () => {
    const vol = makeUser({ pubkey: 'v1', specializations: ['immigration', 'housing'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      requiredSpecializations: ['immigration', 'housing', 'mental-health', 'legal'],
    }))
    // 2/4 * 25 = 12.5 → rounded to 13
    expect(s.specializationScore).toBe(13)
  })

  it('specialization: 0 when requiredSpecializations is empty', () => {
    const vol = makeUser({ pubkey: 'v1', specializations: ['immigration'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      requiredSpecializations: [],
    }))
    expect(s.specializationScore).toBe(0)
  })

  it('specialization: full 25 when volunteer has all required specializations', () => {
    const vol = makeUser({ pubkey: 'v1', specializations: ['a', 'b', 'c'] })
    const [s] = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['v1'],
      requiredSpecializations: ['a', 'b', 'c'],
    }))
    expect(s.specializationScore).toBe(25)
  })

  it('excludes volunteers at max capacity', () => {
    const vol = makeUser({ pubkey: 'full', maxCaseAssignments: 3 })
    const result = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['full'],
      activeCaseCounts: new Map([['full', 3]]),
    }))
    expect(result).toHaveLength(0)
  })

  it('excludes inactive, on-break, off-shift, and already-assigned', () => {
    const inactive = makeUser({ pubkey: 'i', active: false })
    const onBreak = makeUser({ pubkey: 'b', onBreak: true })
    const offShift = makeUser({ pubkey: 'o' })
    const assigned = makeUser({ pubkey: 'a' })
    const eligible = makeUser({ pubkey: 'e' })
    const result = scoreVolunteers(makeInput({
      allUsers: [inactive, onBreak, offShift, assigned, eligible],
      onShiftPubkeys: ['i', 'b', 'a', 'e'],
      alreadyAssigned: ['a'],
    }))
    expect(result).toHaveLength(1)
    expect(result[0].pubkey).toBe('e')
  })

  it('results sorted descending by total score', () => {
    const low = makeUser({ pubkey: 'low' })
    const high = makeUser({ pubkey: 'high', spokenLanguages: ['en', 'es'] })
    const result = scoreVolunteers(makeInput({
      allUsers: [low, high],
      onShiftPubkeys: ['low', 'high'],
      languageNeed: 'es',
    }))
    expect(result[0].pubkey).toBe('high')
    expect(result[0].score).toBeGreaterThan(result[1].score)
  })
})
