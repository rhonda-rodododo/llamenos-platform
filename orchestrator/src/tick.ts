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
  aborted?: 'source-unreadable' | 'breaker' | 'error'
  breakerReason?: string
  errorMessage?: string
  /** Every dispatch() call made, whether it succeeded or threw. Not a count
   *  of successes — see `failed` for the subset that threw. */
  attempted: number
  /** Of `attempted`, the count that threw and were recorded FAILED. */
  failed: number
  shadowed: number
  rejections: { id: string; reason: Rejection }[]
}

const empty = (over: Partial<TickResult> = {}): TickResult =>
  ({ ran: false, attempted: 0, failed: 0, shadowed: 0, rejections: [], ...over })

let counter = 0
function runId(now: number): string {
  counter = (counter + 1) % 0xffff
  return `${now.toString(36)}${counter.toString(36).padStart(3, '0')}`
}

const NOTE_MAX_CHARS = 300

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.length > NOTE_MAX_CHARS ? msg.slice(0, NOTE_MAX_CHARS) : msg
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

/**
 * `tick()` always returns; it never throws. Every abnormal exit — a halted
 * fleet, a tripped breaker, an unreadable source, or an unexpected rejection
 * anywhere in this pass — comes back as a `TickResult` a human can read, not
 * an uncaught rejection that crashes the scheduler process and leaves no
 * ledger row explaining why. A single failed `dispatch()` is handled closer
 * to its source (recorded FAILED, loop continues); this catch is the backstop
 * for everything else that can reject: `checkHalt`, `listItems`,
 * `readLabels`, or a `readLedger`/`now` that throws synchronously.
 */
export async function tick(deps: TickDeps): Promise<TickResult> {
  let lock: ReturnType<TickDeps['acquireLock']> | undefined

  try {
    lock = deps.acquireLock()
    if (!lock.held) {
      deps.log(`another scheduler holds the lock (pid ${lock.heldByPid})`)
      return empty()
    }

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
    let attempted = 0
    let failed = 0
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
          return { ran: true, halted: true, haltReason: mid.reason, attempted, failed, shadowed, rejections: allRejections }
        }

        const base = { ts: deps.now(), runId: runId(deps.now()), lane: lane.id, itemId: item.id, itemName: item.title, engine: lane.engine }

        if (lane.mode === 'shadow') {
          deps.record({ ...base, outcome: 'SHADOW', note: `would dispatch to ${lane.id}; scope=${lane.scope.owned.join(',')}` })
          shadowed++
          taken++
          continue
        }

        // A rejecting dispatch (network failure against GitHub or the engine,
        // routine for either) must not abort the pass or escape uncaught: it
        // is recorded FAILED like any other bad outcome, so the consecutive-
        // failure breaker — not an uncaught rejection — is what stops a run
        // of these, and a human reading the ledger the next morning sees why.
        try {
          const result = await deps.dispatch(item, lane)
          deps.record({ ...base, ...result })
        } catch (e) {
          deps.record({ ...base, outcome: 'FAILED', note: errorMessage(e) })
          failed++
        }
        attempted++
        taken++
      }
    }

    return { ran: true, attempted, failed, shadowed, rejections: allRejections }
  } catch (e) {
    const msg = errorMessage(e)
    deps.log(`tick failed: ${msg}`)
    return empty({ ran: true, aborted: 'error', errorMessage: msg })
  } finally {
    // `acquireLock()` itself may have thrown before `lock` was assigned (e.g.
    // an unwritable $HOME, a full disk, a read-only remount surfacing as a
    // non-EEXIST errno) — guard against releasing a lock we never held.
    if (lock?.held) lock.release()
  }
}
