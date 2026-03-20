import type { AppEnv } from '../types'
import { getNostrPublisher } from './service-factories'
import { deriveServerEventKey, encryptHubEvent } from './hub-event-crypto'

/** Cached event key — derived once per isolate lifetime */
let cachedEventKey: Uint8Array | null = null

/** Publish an event to the Nostr relay for real-time sync. Content is encrypted if SERVER_NOSTR_SECRET is set. */
export async function publishNostrEvent(env: AppEnv['Bindings'], kind: number, content: Record<string, unknown>): Promise<void> {
  const publisher = getNostrPublisher(env)

  // Encrypt event content if server secret is available
  let eventContent: string
  if (env.SERVER_NOSTR_SECRET) {
    if (!cachedEventKey) {
      cachedEventKey = deriveServerEventKey(env.SERVER_NOSTR_SECRET)
    }
    eventContent = encryptHubEvent(content, cachedEventKey)
  } else {
    eventContent = JSON.stringify(content)
  }

  await publisher.publish({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'global'], ['t', 'llamenos:event']],
    content: eventContent,
  })
}
