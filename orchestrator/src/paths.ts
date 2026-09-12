import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The single resolution point every fleet STATE path below derives from.
 * `FLEET_HOME` overrides `homedir()` — deliberately not a per-path override,
 * because this box runs both the real fleet and this test suite: a path that
 * resolved its own `homedir()` independently would silently escape the
 * override the moment someone added a new state file and forgot to route it
 * through here, and an isolation that some paths honour and others don't is
 * worse than no isolation at all (it looks safe while leaking). The test
 * suite points `FLEET_HOME` at a throwaway temp directory (see
 * `vitest.orchestrator.config.ts`) so nothing it does — including the
 * breaker-halt tests, which write the real halt file by design — can ever
 * touch `$HOME/.llamenos-fleet-disabled` on a box that is also running a
 * live fleet. Unset in production, this resolves to the real `homedir()`
 * exactly as before.
 */
function fleetHome(): string {
  return process.env['FLEET_HOME'] ?? homedir()
}

export const FLEET_DIR = join(fleetHome(), '.llamenos-fleet')
export const LOCK_FILE = join(FLEET_DIR, 'scheduler.lock')
export const LEDGER_FILE = join(FLEET_DIR, 'runs.jsonl')
export const HALT_REASON_FILE = join(FLEET_DIR, 'halt-reason.txt')
export const RESUMED_AT_FILE = join(FLEET_DIR, 'resumed-at')
export const LOG_FILE = join(FLEET_DIR, 'fleet.log')

/** Deliberately in `fleetHome()`, not `FLEET_DIR`: it must be creatable with
 *  `touch` by a human who does not know where the fleet keeps its state. */
export const HALT_FILE = join(fleetHome(), '.llamenos-fleet-disabled')

/**
 * `dispatch-one.sh` is NOT vendored into this repo. It lives at
 * `~/.claude/skills/supervising-dispatched-sessions/`, which is a symlink into
 * the `claude-skills` git repository — a real, separately-committed repo, not
 * an untracked local script. That means llamenos cannot pin a version of it:
 * a change committed to `claude-skills` takes effect on the very next dispatch
 * with no llamenos commit at all, and the fleet cannot run at all on a machine
 * where that repo is absent. Vendoring a duplicate here would just create a
 * second source of truth for one script, so instead `dependency.ts` verifies
 * this path is present, executable, reproducible (no uncommitted changes) and
 * carrying rules this repo can actually satisfy — see `checkDispatchDependency`.
 */
export const DISPATCH_SKILL_DIR = join(homedir(), '.claude', 'skills', 'supervising-dispatched-sessions')
export const DISPATCH_SCRIPT = join(DISPATCH_SKILL_DIR, 'dispatch-one.sh')
