import { existsSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { FLEET_DIR, HALT_FILE, HALT_REASON_FILE, RESUMED_AT_FILE } from './paths.js'
import { ghJson } from './gh.js'

export const HALT_LABEL = 'halt'

export interface GhIssue {
  number: number
  title: string
  state: string
  labels: { name: string }[]
}

/** Fails CLOSED: a file that exists stops the fleet, and needs no network. */
export function haltedLocally(): boolean {
  return existsSync(HALT_FILE)
}

/**
 * Fails OPEN, deliberately. `undefined` means we could not read GitHub, and
 * treating that as a halt would make any API outage an invisible full stop
 * indistinguishable from a quiet night. The local file is the switch that
 * fails closed; this one is the switch that works from a phone.
 */
export function haltedOnGitHubFrom(issues: GhIssue[] | undefined): boolean {
  if (issues === undefined) return false
  return issues.some((i) => i.state === 'OPEN' && i.labels.some((l) => l.name === HALT_LABEL))
}

export async function haltedOnGitHub(): Promise<boolean> {
  const issues = await ghJson<GhIssue[]>([
    'issue', 'list', '--label', HALT_LABEL, '--state', 'open',
    '--json', 'number,title,state,labels',
  ])
  return haltedOnGitHubFrom(issues)
}

export async function checkHalt(): Promise<{ halted: boolean; reason?: string }> {
  if (haltedLocally()) {
    const reason = existsSync(HALT_REASON_FILE) ? readFileSync(HALT_REASON_FILE, 'utf8').trim() : 'halt file present'
    return { halted: true, reason }
  }
  if (await haltedOnGitHub()) return { halted: true, reason: `open issue labelled "${HALT_LABEL}"` }
  return { halted: false }
}

/** Breakers call this too: one halted state, one recovery path, no second
 *  "soft halt" that a human cannot clear the same way. */
export function halt(reason: string): void {
  mkdirSync(FLEET_DIR, { recursive: true })
  writeFileSync(HALT_FILE, '')
  writeFileSync(HALT_REASON_FILE, reason)
}

export function resume(): void {
  rmSync(HALT_FILE, { force: true })
  rmSync(HALT_REASON_FILE, { force: true })
  mkdirSync(FLEET_DIR, { recursive: true })
  writeFileSync(RESUMED_AT_FILE, String(Date.now()))
}
