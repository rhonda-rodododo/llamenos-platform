import { describe, it, expect } from 'bun:test'
import { scoreVolunteers, type ScoringInput } from '../../lib/volunteer-scoring'

type ScoringUser = ScoringInput['allUsers'][number]

function makeUser(overrides: Partial<ScoringUser> & { pubkey: string }): ScoringUser {
  return {
    active: true,
    onBreak: false,
    spokenLanguages: ['en'],
    ...overrides,
  }
}

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    allUsers: [],
    onShiftPubkeys: [],
    alreadyAssigned: [],
    activeCaseCounts: new Map(),
    ...overrides,
  }
}

describe('scoreVolunteers', () => {
  it('returns base score of 50 for eligible volunteer with no cases', () => {
    const vol = makeUser({ pubkey: 'vol1' })
    const result = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['vol1'],
    }))

    expect(result).toHaveLength(1)
    // Base 50 + workload 30 (0/20 utilization) = 80
    expect(result[0].score).toBe(80)
    expect(result[0].pubkey).toBe('vol1')
  })

  it('workload score inversely proportional to utilization', () => {
    const volIdle = makeUser({ pubkey: 'idle', maxCaseAssignments: 10 })
    const volBusy = makeUser({ pubkey: 'busy', maxCaseAssignments: 10 })

    const counts = new Map([['idle', 0], ['busy', 8]])

    const result = scoreVolunteers(makeInput({
      allUsers: [volIdle, volBusy],
      onShiftPubkeys: ['idle', 'busy'],
      activeCaseCounts: counts,
    }))

    const idle = result.find(s => s.pubkey === 'idle')!
    const busy = result.find(s => s.pubkey === 'busy')!

    // idle: 50 + round((1 - 0/10)*30) = 50 + 30 = 80
    expect(idle.score).toBe(80)
    // busy: 50 + round((1 - 8/10)*30) = 50 + 6 = 56
    expect(busy.score).toBe(56)
    // idle ranked higher
    expect(result[0].pubkey).toBe('idle')
  })

  it('adds +15 for language match', () => {
    const vol = makeUser({ pubkey: 'vol1', spokenLanguages: ['en', 'es'] })
    const withLang = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['vol1'],
      languageNeed: 'es',
    }))
    const withoutLang = scoreVolunteers(makeInput({
      allUsers: [vol],
      onShiftPubkeys: ['vol1'],
    }))

    expect(withLang[0].score - withoutLang[0].score).toBe(15)
    expect(withLang[0].reasons).toContain('Speaks es')
  })

  it('adds +5 for specializations', () => {
    const specVol = makeUser({ pubkey: 'spec', specializations: ['immigration'] })
    const plainVol = makeUser({ pubkey: 'plain' })

    const result = scoreVolunteers(makeInput({
      allUsers: [specVol, plainVol],
      onShiftPubkeys: ['spec', 'plain'],
    }))

    const spec = result.find(s => s.pubkey === 'spec')!
    const plain = result.find(s => s.pubkey === 'plain')!
    expect(spec.score - plain.score).toBe(5)
    expect(spec.reasons).toContain('Has specializations')
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

  it('excludes inactive, on-break, off-shift, and already-assigned volunteers', () => {
    const inactive = makeUser({ pubkey: 'inactive', active: false })
    const onBreak = makeUser({ pubkey: 'break', onBreak: true })
    const offShift = makeUser({ pubkey: 'offshift' })
    const assigned = makeUser({ pubkey: 'assigned' })
    const eligible = makeUser({ pubkey: 'eligible' })

    const result = scoreVolunteers(makeInput({
      allUsers: [inactive, onBreak, offShift, assigned, eligible],
      onShiftPubkeys: ['inactive', 'break', 'assigned', 'eligible'],
      alreadyAssigned: ['assigned'],
    }))

    expect(result).toHaveLength(1)
    expect(result[0].pubkey).toBe('eligible')
  })

  it('sorts results descending by score', () => {
    const low = makeUser({ pubkey: 'low', maxCaseAssignments: 10 })
    const high = makeUser({ pubkey: 'high', maxCaseAssignments: 10, specializations: ['legal'] })

    const result = scoreVolunteers(makeInput({
      allUsers: [low, high],
      onShiftPubkeys: ['low', 'high'],
      activeCaseCounts: new Map([['low', 8], ['high', 0]]),
    }))

    expect(result[0].pubkey).toBe('high')
    expect(result[0].score).toBeGreaterThan(result[1].score)
  })
})
