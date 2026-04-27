import type { MessagingAdapter } from '../adapter'
import type { RCSConfig } from '@shared/types'
import { RCSAdapter } from './adapter'

/**
 * Create a validated RCSAdapter instance from an RCSConfig.
 * Throws if any required configuration fields are missing.
 */
export function createRCSAdapter(config: RCSConfig, hmacSecret: string): MessagingAdapter {
  if (!config.agentId) {
    throw new Error('RCS agent ID is required')
  }
  if (!config.serviceAccountKey) {
    throw new Error('RCS service account key is required')
  }
  return new RCSAdapter(config, hmacSecret)
}
