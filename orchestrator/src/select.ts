import { MIN_BODY_CHARS, type Lane } from './config.js'
import type { WorkItem } from './source.js'

export type Rejection =
  | 'labels-unreadable'
  | 'missing-require-label'
  | 'vetoed'
  | 'other-lane'
  | 'body-too-short'

export type Verdict = { ok: true } | { ok: false; reason: Rejection }

export const LANE_LABEL_PREFIX = 'lane:'

/**
 * Pure: no I/O, no clock. Order matters — the veto is checked before the lane
 * match so an item a human has flagged can never be routed anywhere, and
 * unreadable labels are checked first so a failed read is never mistaken for
 * an absent label.
 */
export function judge(item: WorkItem, labels: string[] | undefined, lane: Lane): Verdict {
  if (labels === undefined) return { ok: false, reason: 'labels-unreadable' }
  if (!labels.includes(lane.requireLabel)) return { ok: false, reason: 'missing-require-label' }
  if (labels.some((l) => lane.vetoLabels.includes(l))) return { ok: false, reason: 'vetoed' }
  if (!labels.includes(`${LANE_LABEL_PREFIX}${lane.id}`)) return { ok: false, reason: 'other-lane' }
  if (item.body.trim().length < MIN_BODY_CHARS) return { ok: false, reason: 'body-too-short' }
  return { ok: true }
}

export function selectForLane(
  items: WorkItem[],
  labelsById: Map<string, string[] | undefined>,
  lane: Lane,
): { candidates: WorkItem[]; rejections: { id: string; reason: Rejection }[] } {
  const candidates: WorkItem[] = []
  const rejections: { id: string; reason: Rejection }[] = []
  for (const item of items) {
    const v = judge(item, labelsById.get(item.id), lane)
    if (v.ok) candidates.push(item)
    else rejections.push({ id: item.id, reason: v.reason })
  }
  return { candidates, rejections }
}
