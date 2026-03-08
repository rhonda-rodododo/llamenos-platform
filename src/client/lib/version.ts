/**
 * Client API version (Epic 288).
 *
 * Sent as `X-API-Version` header on every API request.
 * Must match or exceed the server's MIN_API_VERSION to avoid 426 Upgrade Required.
 *
 * Increment when the client gains support for new API features.
 */
export const APP_API_VERSION = 1

/**
 * Event name dispatched on window when the server requires a newer client version.
 * The UpdateRequiredScreen listens for this event.
 */
export const UPDATE_REQUIRED_EVENT = 'llamenos:update-required'

export interface UpdateRequiredDetail {
  minVersion: number
  currentVersion: number
}

/** Dispatch an update-required event to trigger the blocking overlay. */
export function emitUpdateRequired(detail: UpdateRequiredDetail): void {
  window.dispatchEvent(new CustomEvent(UPDATE_REQUIRED_EVENT, { detail }))
}
