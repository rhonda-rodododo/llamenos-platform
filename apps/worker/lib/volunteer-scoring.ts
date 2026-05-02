/**
 * Volunteer scoring algorithm for case assignment suggestions.
 *
 * Extracted from the /records/:id/suggest-assignees route handler
 * so it can be unit-tested independently.
 */
import type { User } from '../types'

/** Minimum user fields needed for scoring — accepts both full User and sanitized users */
type ScoringUser = Pick<User, 'pubkey' | 'active' | 'onBreak' | 'spokenLanguages' | 'maxCaseAssignments' | 'specializations'>

export interface ScoringInput {
  /** All users in the hub */
  allUsers: ScoringUser[]
  /** Pubkeys of volunteers currently on shift */
  onShiftPubkeys: string[]
  /** Pubkeys already assigned to this record */
  alreadyAssigned: string[]
  /** Active case counts keyed by pubkey */
  activeCaseCounts: Map<string, number>
  /** Optional language the caller needs */
  languageNeed?: string
}

export interface VolunteerSuggestion {
  pubkey: string
  score: number
  reasons: string[]
  activeCaseCount: number
  maxCases: number
}

/**
 * Score and rank eligible volunteers for case assignment.
 *
 * Scoring breakdown:
 * - Base: 50 points (all eligible volunteers)
 * - Workload: 0–30 points (inversely proportional to utilization)
 * - Language match: +15 when volunteer speaks the requested language
 * - Specialization: +5 when volunteer has any specializations
 *
 * Volunteers at max capacity are excluded entirely.
 * Results are sorted descending by total score.
 */
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

    let score = 50 // Base score
    const reasons: string[] = ['On shift']

    // Workload score: lower workload = higher score (0-30 points)
    const effectiveMax = maxCases > 0 ? maxCases : 20
    const utilization = activeCaseCount / effectiveMax
    score += Math.round((1 - utilization) * 30)
    reasons.push(`${activeCaseCount}/${effectiveMax} cases`)

    // Language match (0-15 points)
    if (input.languageNeed && vol.spokenLanguages?.includes(input.languageNeed)) {
      score += 15
      reasons.push(`Speaks ${input.languageNeed}`)
    }

    // Specialization match (0-5 points)
    if (vol.specializations?.length) {
      score += 5
      reasons.push('Has specializations')
    }

    suggestions.push({
      pubkey: vol.pubkey,
      score,
      reasons,
      activeCaseCount,
      maxCases: effectiveMax,
    })
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score)
  return suggestions
}
