/**
 * API Version Registry
 *
 * Tracks the current and minimum supported API versions.
 * Increment CURRENT_API_VERSION when adding new API features.
 * Increment MIN_API_VERSION only when old clients MUST upgrade (breaking changes).
 *
 * Version history:
 *   1 — Initial API (Epic 288)
 */

/** Current API version — latest features available */
export const CURRENT_API_VERSION = 1

/** Minimum API version — clients below this MUST upgrade */
export const MIN_API_VERSION = 1

/**
 * Check whether a client version is acceptable.
 * Returns null if OK, or an error descriptor if the client must upgrade.
 */
export function checkClientVersion(clientVersion: number): { upgrade: true; minVersion: number; currentVersion: number } | null {
  if (clientVersion < MIN_API_VERSION) {
    return { upgrade: true, minVersion: MIN_API_VERSION, currentVersion: CURRENT_API_VERSION }
  }
  return null
}
