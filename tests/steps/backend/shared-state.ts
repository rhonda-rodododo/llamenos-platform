/**
 * Shared response state accessor for backend BDD step definitions.
 *
 * State is stored in the scenario-scoped world fixture (not module-level).
 * Step files use getSharedState(world) / setLastResponse(world, res) to
 * read and write the shared response without cross-scenario leakage.
 */
import { getState, setState } from './fixtures'

export interface SharedResponseState {
  lastResponse?: { status: number; data: unknown }
}

const KEY = 'shared'

export function getSharedState(world: Record<string, unknown>): SharedResponseState {
  let s = getState<SharedResponseState | undefined>(world, KEY)
  if (!s) {
    s = {}
    setState(world, KEY, s)
  }
  return s
}

export function setLastResponse(world: Record<string, unknown>, res: { status: number; data: unknown }): void {
  getSharedState(world).lastResponse = res
}
