/**
 * Gate for the admin-authenticated demo reset endpoint.
 *
 * The reset wipes every table, so it is deliberately hard to enable by accident:
 * both demo flags must be set, and a production environment refuses no matter
 * what else is configured (checked first, so it cannot be overridden by any flag).
 */

export interface DemoResetGateEnv {
  ENVIRONMENT?: string
  DEMO_MODE?: string
  DEMO_MODE_CONFIRM?: string
}

/** The two-factor confirmation value shared with startup validation and the service resets. */
export const DEMO_RESET_CONFIRMATION = 'DESTROY_ALL_DATA'

/**
 * Returns why the demo reset must be refused, or `null` when it may proceed.
 * The reason is safe to return to an authenticated admin.
 */
export function demoResetRefusal(env: DemoResetGateEnv): string | null {
  if ((env.ENVIRONMENT ?? '').trim().toLowerCase() === 'production') {
    return 'Demo reset is never available in a production environment'
  }
  if (env.DEMO_MODE !== 'true') {
    return 'Demo reset requires DEMO_MODE=true'
  }
  if (env.DEMO_MODE_CONFIRM !== DEMO_RESET_CONFIRMATION) {
    return `Demo reset requires DEMO_MODE_CONFIRM=${DEMO_RESET_CONFIRMATION}`
  }
  return null
}
