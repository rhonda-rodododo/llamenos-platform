import { existsSync, readFileSync, statSync } from 'node:fs'
import { FLEET_ENV_FILE } from './paths.js'

export type FleetEnvFileState = 'absent' | 'fail' | 'ok'

export interface FleetEnvFileCheck {
  state: FleetEnvFileState
  message: string
}

/**
 * #773's bot account is not live yet, so the fleet running as the operator's
 * own `gh` auth is the EXPECTED state today — this is the one state `doctor`
 * must never fail on. Exported so `checkFleetEnvFile` and its tests don't
 * have two copies of this string to keep in sync.
 */
export const ABSENT_MESSAGE =
  "fleet runs as the operator's account; create ~/.llamenos-fleet/env with GH_TOKEN for the bot"

/**
 * Once `~/.llamenos-fleet/env` exists, though, it carries a real credential
 * read by two systemd units and the `llamenos-fleet` wrapper (see paths.ts's
 * `FLEET_ENV_FILE` comment) — at that point "missing" stops being the normal
 * case and a misconfigured file becomes a real problem:
 *
 *   - wrong permissions is a credential-leak risk (group/world-readable
 *     token file), reported as a hard FAIL, not a warning;
 *   - present with the right mode but no `GH_TOKEN` line silently does
 *     nothing while looking configured — also a hard FAIL, because a human
 *     who created the file believing it was wired up deserves to find out.
 *
 * Pure-enough to unit test directly against a `FLEET_HOME` temp dir: the only
 * impurity is the one file this function's whole job is to inspect.
 */
export function checkFleetEnvFile(): FleetEnvFileCheck {
  if (!existsSync(FLEET_ENV_FILE)) {
    return { state: 'absent', message: ABSENT_MESSAGE }
  }

  let mode: number
  try {
    mode = statSync(FLEET_ENV_FILE).mode & 0o777
  } catch {
    return { state: 'fail', message: `${FLEET_ENV_FILE} exists but could not be stat'd` }
  }
  if (mode !== 0o600) {
    return {
      state: 'fail',
      message: `${FLEET_ENV_FILE} must be mode 0600 (found ${mode.toString(8).padStart(3, '0')}) — run: chmod 600 ${FLEET_ENV_FILE}`,
    }
  }

  let content: string
  try {
    content = readFileSync(FLEET_ENV_FILE, 'utf8')
  } catch {
    return { state: 'fail', message: `${FLEET_ENV_FILE} is mode 0600 but could not be read` }
  }
  if (!/^\s*GH_TOKEN=/m.test(content)) {
    return { state: 'fail', message: `${FLEET_ENV_FILE} is mode 0600 but does not define GH_TOKEN` }
  }

  return { state: 'ok', message: FLEET_ENV_FILE }
}
