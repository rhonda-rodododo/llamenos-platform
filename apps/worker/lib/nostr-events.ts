import type { AppEnv } from '../types'
import { getNostrPublisher } from './service-factories'
import { deriveHubEventKey, encryptHubEvent } from './hub-event-crypto'
import { NOSTR_EVENT_TAG } from '@shared/crypto-labels'

/** Cached per-hub event keys — derived once per (secret, hubId) pair per isolate lifetime */
const hubEventKeyCache = new Map<string, Uint8Array>()

function getHubEventKey(serverSecret: string, hubId: string): Uint8Array {
  const cacheKey = `${hubId}`
  let key = hubEventKeyCache.get(cacheKey)
  if (!key) {
    key = deriveHubEventKey(serverSecret, hubId)
    hubEventKeyCache.set(cacheKey, key)
  }
  return key
}

/**
 * Publish an event to the Nostr relay for real-time sync.
 * Content is encrypted with a per-hub key if SERVER_NOSTR_SECRET is set.
 * The d-tag is set to hubId for proper per-hub event routing.
 */
export async function publishNostrEvent(
  env: AppEnv['Bindings'],
  kind: number,
  content: Record<string, unknown>,
  hubId: string,
): Promise<void> {
  const publisher = getNostrPublisher(env)

  // Encrypt event content with per-hub key if server secret is available
  let eventContent: string
  if (env.SERVER_NOSTR_SECRET) {
    const eventKey = getHubEventKey(env.SERVER_NOSTR_SECRET, hubId)
    eventContent = encryptHubEvent(content, eventKey)
  } else {
    eventContent = JSON.stringify(content)
  }

  await publisher.publish({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', hubId], ['t', NOSTR_EVENT_TAG]],
    content: eventContent,
  })
}
