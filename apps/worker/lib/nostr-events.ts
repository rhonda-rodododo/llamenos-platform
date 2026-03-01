import type { AppEnv } from '../types'
import { getNostrPublisher } from './do-access'

/** Publish an event to the Nostr relay for real-time sync. */
export function publishNostrEvent(env: AppEnv['Bindings'], kind: number, content: Record<string, unknown>): void {
  try {
    const publisher = getNostrPublisher(env)
    publisher.publish({
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'global'], ['t', 'llamenos:event']],
      content: JSON.stringify(content),
    }).catch(() => {})
  } catch {
    // Nostr not configured
  }
}
