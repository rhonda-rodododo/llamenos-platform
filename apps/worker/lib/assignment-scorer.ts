/**
 * Volunteer assignment scoring — real four-component formula.
 *
 * Replaces the +5 stub in volunteer-scoring.ts (EP06-A3).
 *
 * Score = workloadScore + languageScore + specializationScore + availabilityScore
 *
 * - workloadScore    = max(0, 20 - currentAssignments * 4)        — 0–20
 * - languageScore    = spokenLanguages.includes(caseLanguage) ? 15 : 0
 * - specializationScore = matched/required * 25 (rounded)         — 0–25
 * - availabilityScore   = isOnShift ? 10 : 0
 *
 * Volunteers at max capacity are excluded before scoring.
 * Server computes specialization match using blind-indexed tags (hashes match hashes).
 * No plaintext PII is accessed.
 */
import type { User } from '../types'

type ScoringUser = Pick<
  User,
  'pubkey' | 'active' | 'onBreak' | 'spokenLanguages' | 'maxCaseAssignments' | 'specializations'
>

export interface ScoringInput {
  allUsers: ScoringUser[]
  onShiftPubkeys: string[]
  alreadyAssigned: string[]
  activeCaseCounts: Map<string, number>
  /** Language tag the entity/case requires (optional) */
  languageNeed?: string
  /** Specialization tags required by the entity type (from entityType.requiredSpecializations) */
  requiredSpecializations: string[]
}

export interface VolunteerSuggestion {
  pubkey: string
  score: number
  workloadScore: number
  languageScore: number
  specializationScore: number
  availabilityScore: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
  matchedSpecializations: string[]
}

export function scoreVolunteers(input: ScoringInput): VolunteerSuggestion[] {
  const onShiftSet = new Set(input.onShiftPubkeys)
  const assignedSet = new Set(input.alreadyAssigned)
  const suggestions: VolunteerSuggestion[] = []

  for (const vol of input.allUsers) {
    if (!vol.active) continue
    if (vol.onBreak) continue
    if (!onShiftSet.has(vol.pubkey)) continue
    if (assignedSet.has(vol.pubkey)) continue

    const activeCaseCount = input.activeCaseCounts.get(vol.pubkey) ?? 0
    const maxCases = vol.maxCaseAssignments ?? 0
    if (maxCases > 0 && activeCaseCount >= maxCases) continue

    const reasons: string[] = ['On shift']

    // Workload: max(0, 20 - currentAssignments * 4)
    const workloadScore = Math.max(0, 20 - activeCaseCount * 4)
    if (activeCaseCount > 0) {
      reasons.push(`${activeCaseCount} active case${activeCaseCount !== 1 ? 's' : ''}`)
    }

    // Language: +15 if speaks required language
    const languageScore =
      input.languageNeed && vol.spokenLanguages?.includes(input.languageNeed) ? 15 : 0
    if (languageScore > 0) {
      reasons.push(`Speaks ${input.languageNeed}`)
    }

    // Specialization: matched/required * 25 (proportional, 0 if no requirements)
    const required = input.requiredSpecializations
    const volSpecs = vol.specializations ?? []
    const matchedSpecializations =
      required.length > 0 ? required.filter(s => volSpecs.includes(s)) : []
    const specializationScore =
      required.length > 0
        ? Math.round((matchedSpecializations.length / required.length) * 25)
        : 0
    if (matchedSpecializations.length > 0) {
      reasons.push(`${matchedSpecializations.length}/${required.length} specializations`)
    }

    // Availability: on shift (always true here, filtering above)
    const availabilityScore = 10

    const score = workloadScore + languageScore + specializationScore + availabilityScore

    suggestions.push({
      pubkey: vol.pubkey,
      score,
      workloadScore,
      languageScore,
      specializationScore,
      availabilityScore,
      reasons,
      activeCaseCount,
      maxCases: maxCases > 0 ? maxCases : 5,
      matchedSpecializations,
    })
  }

  suggestions.sort((a, b) => b.score - a.score)
  return suggestions
}
