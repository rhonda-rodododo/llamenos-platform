import { checkBreakers } from './circuit.js'
import { LIMITS, MAX_ATTEMPTS_PER_ITEM, type Lane } from './config.js'
import { failedAttemptsIn, type Outcome, type RunRecord } from './ledger.js'
import { selectForLane, type Rejection } from './select.js'
import type { WorkItem } from './source.js'

export interface TickDeps {
  lanes: Lane[]
  now(): number
  acquireLock(): { held: true; release(): void } | { held: false; heldByPid: number }
  checkHalt(): Promise<{ halted: boolean; reason?: string }>
  readLedger(): RunRecord[]
  resumedAt(): number
  listItems(lane: Lane): Promise<WorkItem[] | undefined>
  readLabels(id: string): Promise<string[] | undefined>
  dispatch(item: WorkItem, lane: Lane): Promise<{ outcome: Outcome; note?: string; pr?: string; branch?: string }>
  record(r: RunRecord): void
  log(msg: string): void
}

export interface TickResult {
  ran: boolean
  halted?: boolean
  haltReason?: string
  aborted?: 'source-unreadable' | 'breaker'
  breakerReason?: string
  dispatched: number
  shadowed: number
  rejections: { id: string; reason: Rejection }[]
}

const empty = (over: Partial<TickResult> = {}): TickResult =>
  ({ ran: false, dispatched: 0, shadowed: 0, rejections: [], ...over })

let counter = 0
function runId(now: number): string {
  counter = (counter + 1) % 0xffff
  return `${now.toString(36)}${counter.toString(36).padStart(3, '0')}`
}

/**
 * Lane order is claim priority. The first lane able to claim an item owns it,
 * so two workers never race the same issue — concurrency is prevented here
 * rather than coordinated later.
 */
export function claimAcrossLanes(lanes: Lane[], itemsByLane: Map<string, WorkItem[]>): Map<string, string> {
  const owned = new Map<string, string>()
  for (const lane of lanes) {
    for (const item of itemsByLane.get(lane.id) ?? []) {
      if (!owned.has(item.id)) owned.set(item.id, lane.id)
    }
  }
  return owned
}

export async function tick(deps: TickDeps): Promise<TickResult> {
  const lock = deps.acquireLock()
  if (!lock.held) {
    deps.log(`another scheduler holds the lock (pid ${lock.heldByPid})`)
    return empty()
  }

  try {
    const halt = await deps.checkHalt()
    if (halt.halted) {
      deps.log(`halted: ${halt.reason ?? 'unknown'}`)
      return empty({ ran: true, halted: true, haltReason: halt.reason })
    }

    const rows = deps.readLedger()
    const now = deps.now()
    const tripped = checkBreakers(rows, LIMITS, now, deps.resumedAt())
    if (tripped) {
      deps.log(`breaker tripped: ${tripped}`)
      return empty({ ran: true, aborted: 'breaker', breakerReason: tripped })
    }

    const active = deps.lanes.filter((l) => l.mode !== 'off')
    const itemsByLane = new Map<string, WorkItem[]>()
    const allRejections: { id: string; reason: Rejection }[] = []
    const labelCache = new Map<string, string[] | undefined>()

    for (const lane of active) {
      const items = await deps.listItems(lane)
      // An unreadable source is NOT an empty one. Aborting the whole pass is
      // the only way a credential failure cannot masquerade as a quiet night.
      if (items === undefined) {
        deps.log(`source unreadable for lane ${lane.id} — aborting pass`)
        return empty({ ran: true, aborted: 'source-unreadable' })
      }
      for (const item of items) {
        if (!labelCache.has(item.id)) labelCache.set(item.id, await deps.readLabels(item.id))
      }
      const { candidates, rejections } = selectForLane(items, labelCache, lane)
      itemsByLane.set(lane.id, candidates)
      allRejections.push(...rejections)
    }

    const owned = claimAcrossLanes(active, itemsByLane)
    let dispatched = 0
    let shadowed = 0

    for (const lane of active) {
      let taken = 0
      for (const item of itemsByLane.get(lane.id) ?? []) {
        if (owned.get(item.id) !== lane.id) continue
        if (taken >= lane.cap) break

        if (failedAttemptsIn(rows, item.id) >= MAX_ATTEMPTS_PER_ITEM) {
          deps.log(`item ${item.id} has exhausted ${MAX_ATTEMPTS_PER_ITEM} attempts — leaving for a human`)
          continue
        }

        // Re-checked between EVERY dispatch: a stop lands within one worker,
        // not within one pass.
        const mid = await deps.checkHalt()
        if (mid.halted) {
          deps.log(`halted mid-pass: ${mid.reason ?? 'unknown'}`)
          return { ran: true, halted: true, haltReason: mid.reason, dispatched, shadowed, rejections: allRejections }
        }

        const base = { ts: deps.now(), runId: runId(deps.now()), lane: lane.id, itemId: item.id, itemName: item.title, engine: lane.engine }

        if (lane.mode === 'shadow') {
          deps.record({ ...base, outcome: 'SHADOW', note: `would dispatch to ${lane.id}; scope=${lane.scope.owned.join(',')}` })
          shadowed++
          taken++
          continue
        }

        const result = await deps.dispatch(item, lane)
        deps.record({ ...base, ...result })
        dispatched++
        taken++
      }
    }

    return { ran: true, dispatched, shadowed, rejections: allRejections }
  } finally {
    if (lock.held) lock.release()
  }
}
