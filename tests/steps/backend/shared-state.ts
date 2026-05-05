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
  /** User created by "a registered user with a known keypair" — shared across step namespaces. */
  sharedUser?: { nsec: string; pubkey: string }
  /** Device IDs registered via "the user has a registered device" — shared across step namespaces. */
  sharedDeviceIds: string[]
  /** Collected response statuses from flood/rate-limit tests (invite, webauthn). */
  floodResponses: number[]
}

const KEY = 'shared'

export function getSharedState(world: Record<string, unknown>): SharedResponseState {
  let s = getState<SharedResponseState | undefined>(world, KEY)
  if (!s) {
    s = { sharedDeviceIds: [], floodResponses: [] }
    setState(world, KEY, s)
  }
  if (!s.sharedDeviceIds) s.sharedDeviceIds = []
  if (!s.floodResponses) s.floodResponses = []
  return s
}

export function setLastResponse(world: Record<string, unknown>, res: { status: number; data: unknown }): void {
  getSharedState(world).lastResponse = res
}
