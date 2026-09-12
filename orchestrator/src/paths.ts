import { homedir } from 'node:os'
import { join } from 'node:path'

export const FLEET_DIR = join(homedir(), '.llamenos-fleet')
export const LOCK_FILE = join(FLEET_DIR, 'scheduler.lock')
export const LEDGER_FILE = join(FLEET_DIR, 'runs.jsonl')
export const HALT_REASON_FILE = join(FLEET_DIR, 'halt-reason.txt')
export const RESUMED_AT_FILE = join(FLEET_DIR, 'resumed-at')
export const LOG_FILE = join(FLEET_DIR, 'fleet.log')

/** Deliberately in $HOME, not FLEET_DIR: it must be creatable with `touch` by a
 *  human who does not know where the fleet keeps its state. */
export const HALT_FILE = join(homedir(), '.llamenos-fleet-disabled')
