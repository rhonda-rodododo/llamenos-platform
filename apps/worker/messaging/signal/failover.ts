/**
 * SignalFailoverService — manages failover between primary and backup
 * Signal numbers when the primary becomes unreachable.
 *
 * Failover triggers:
 * - Bridge health check fails N consecutive times
 * - Send error rate exceeds threshold
 * - Manual admin override
 *
 * When failover activates:
 * 1. Outbound messages route to the backup bridge/number
 * 2. Admin is notified via audit log + Nostr event
 * 3. Primary is periodically re-checked for recovery
 * 4. When primary recovers, traffic is switched back (auto or manual)
 *
 * Configuration is stored in the messaging config as part of SignalConfig.
 */

import { createLogger } from '../../lib/logger'
import type { SignalConfig } from '@shared/types'
import { checkBridgeHealth, type BridgeHealthStatus } from './health'

const logger = createLogger('signal-failover')

export interface FailoverConfig {
  enabled: boolean
  backupBridgeUrl: string
  backupBridgeApiKey: string
  backupRegisteredNumber: string
  backupWebhookSecret: string
  /** Number of consecutive health check failures before failover (default: 3) */
  failoverThreshold: number
  /** Seconds between health checks (default: 60) */
  healthCheckIntervalSec: number
  /** Auto-recover when primary comes back online (default: true) */
  autoRecover: boolean
}

export interface FailoverState {
  activeTarget: 'primary' | 'backup'
  consecutiveFailures: number
  lastHealthCheck: string | null
  lastFailoverAt: string | null
  lastRecoveryAt: string | null
  primaryStatus: BridgeHealthStatus | null
  backupStatus: BridgeHealthStatus | null
}

const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  enabled: false,
  backupBridgeUrl: '',
  backupBridgeApiKey: '',
  backupRegisteredNumber: '',
  backupWebhookSecret: '',
  failoverThreshold: 3,
  healthCheckIntervalSec: 60,
  autoRecover: true,
}

/**
 * In-memory failover state. Reset on server restart — health checks will
 * quickly re-detect the correct state. This avoids DB writes on every
 * health check while still providing fast failover.
 */
let failoverState: FailoverState = {
  activeTarget: 'primary',
  consecutiveFailures: 0,
  lastHealthCheck: null,
  lastFailoverAt: null,
  lastRecoveryAt: null,
  primaryStatus: null,
  backupStatus: null,
}

/**
 * Get the current failover state.
 */
export function getFailoverState(): Readonly<FailoverState> {
  return { ...failoverState }
}

/**
 * Reset failover state (e.g., on config change or admin override).
 */
export function resetFailoverState(): void {
  failoverState = {
    activeTarget: 'primary',
    consecutiveFailures: 0,
    lastHealthCheck: null,
    lastFailoverAt: null,
    lastRecoveryAt: null,
    primaryStatus: null,
    backupStatus: null,
  }
}

/**
 * Manually set the active target (admin override).
 */
export function setActiveTarget(target: 'primary' | 'backup'): void {
  const previous = failoverState.activeTarget
  failoverState.activeTarget = target
  failoverState.consecutiveFailures = 0

  if (target === 'backup' && previous === 'primary') {
    failoverState.lastFailoverAt = new Date().toISOString()
  } else if (target === 'primary' && previous === 'backup') {
    failoverState.lastRecoveryAt = new Date().toISOString()
  }

  logger.info('Active target manually set', { target, previous })
}

/**
 * Run a health check cycle. Called periodically by the scheduler.
 *
 * Logic:
 * 1. Check primary health
 * 2. If primary healthy and we're on backup with autoRecover → switch back
 * 3. If primary unhealthy → increment failure count
 * 4. If failures >= threshold → switch to backup
 */
export async function runHealthCheck(
  primaryConfig: SignalConfig,
  failoverConfig: FailoverConfig,
): Promise<FailoverState> {
  if (!failoverConfig.enabled) {
    return failoverState
  }

  const now = new Date().toISOString()
  failoverState.lastHealthCheck = now

  // Check primary
  const primaryHealth = await checkBridgeHealth(primaryConfig)
  failoverState.primaryStatus = primaryHealth

  if (primaryHealth.connected) {
    // Primary is healthy
    if (failoverState.activeTarget === 'backup' && failoverConfig.autoRecover) {
      // Switch back to primary
      failoverState.activeTarget = 'primary'
      failoverState.lastRecoveryAt = now
      failoverState.consecutiveFailures = 0
      logger.info('Primary Signal bridge recovered, switching back')
    } else {
      failoverState.consecutiveFailures = 0
    }
  } else {
    // Primary is down
    failoverState.consecutiveFailures++

    logger.warn('Primary Signal bridge health check failed', {
      failures: failoverState.consecutiveFailures,
      threshold: failoverConfig.failoverThreshold,
      error: primaryHealth.error,
    })

    if (
      failoverState.activeTarget === 'primary' &&
      failoverState.consecutiveFailures >= failoverConfig.failoverThreshold
    ) {
      // Check backup before failing over
      const backupConfig: SignalConfig = {
        bridgeUrl: failoverConfig.backupBridgeUrl,
        bridgeApiKey: failoverConfig.backupBridgeApiKey,
        registeredNumber: failoverConfig.backupRegisteredNumber,
        webhookSecret: failoverConfig.backupWebhookSecret,
      }
      const backupHealth = await checkBridgeHealth(backupConfig)
      failoverState.backupStatus = backupHealth

      if (backupHealth.connected) {
        failoverState.activeTarget = 'backup'
        failoverState.lastFailoverAt = now
        logger.warn('Failing over to backup Signal bridge', {
          primaryError: primaryHealth.error,
          backupNumber: failoverConfig.backupRegisteredNumber.slice(-4),
        })
      } else {
        logger.error('Both primary and backup Signal bridges are down', {
          primaryError: primaryHealth.error,
          backupError: backupHealth.error,
        })
      }
    }
  }

  return failoverState
}

/**
 * Get the active Signal config based on failover state.
 * Returns the backup config if failover is active, otherwise the primary.
 */
export function getActiveSignalConfig(
  primaryConfig: SignalConfig,
  failoverConfig?: FailoverConfig,
): SignalConfig {
  if (
    !failoverConfig?.enabled ||
    failoverState.activeTarget === 'primary'
  ) {
    return primaryConfig
  }

  return {
    bridgeUrl: failoverConfig.backupBridgeUrl,
    bridgeApiKey: failoverConfig.backupBridgeApiKey,
    registeredNumber: failoverConfig.backupRegisteredNumber,
    webhookSecret: failoverConfig.backupWebhookSecret,
    autoResponse: primaryConfig.autoResponse,
    afterHoursResponse: primaryConfig.afterHoursResponse,
  }
}

/**
 * Parse failover config from the signal section of messaging config.
 * Returns DEFAULT_FAILOVER_CONFIG if not configured.
 */
export function parseFailoverConfig(
  signalConfig: SignalConfig & { failover?: Partial<FailoverConfig> },
): FailoverConfig {
  const fc = signalConfig.failover
  if (!fc) return DEFAULT_FAILOVER_CONFIG

  return {
    ...DEFAULT_FAILOVER_CONFIG,
    ...fc,
    enabled: fc.enabled ?? false,
  }
}
