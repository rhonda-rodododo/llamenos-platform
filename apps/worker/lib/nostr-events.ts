import type { AppEnv } from '../types'
import { getNostrPublisher } from './service-factories'
import { deriveServerEventKey, encryptHubEvent, getCurrentEpoch } from './hub-event-crypto'

/**
 * Epoch-keyed event key cache. Keys are derived per-epoch for forward secrecy (H5 fix).
 * Old epochs are evicted when a new epoch starts.
 */
const epochKeyCache = new Map<number, Uint8Array>()
let lastCachedEpoch = -1

function getOrDeriveEpochKey(serverSecret: string, epoch: number): Uint8Array {
  const cached = epochKeyCache.get(epoch)
  if (cached) return cached

  const key = deriveServerEventKey(serverSecret, undefined, epoch)
  epochKeyCache.set(epoch, key)

  // Evict keys older than current - 1
  if (epoch > lastCachedEpoch) {
    lastCachedEpoch = epoch
    for (const cachedEpoch of epochKeyCache.keys()) {
      if (cachedEpoch < epoch - 1) {
        epochKeyCache.delete(cachedEpoch)
      }
    }
  }

  return key
}

/**
 * Publish an event to the Nostr relay for real-time sync.
 * Content is encrypted with an epoch-scoped key for forward secrecy (H5 fix).
 * The epoch tag is included so clients know which key window to use for decryption.
 */
export async function publishNostrEvent(env: AppEnv['Bindings'], kind: number, content: Record<string, unknown>): Promise<void> {
  const publisher = getNostrPublisher(env)
  const createdAt = Math.floor(Date.now() / 1000)
  const epoch = getCurrentEpoch(createdAt)

  // Encrypt event content if server secret is available
  let eventContent: string
  if (env.SERVER_NOSTR_SECRET) {
    const eventKey = getOrDeriveEpochKey(env.SERVER_NOSTR_SECRET, epoch)
    eventContent = encryptHubEvent(content, eventKey)
  } else {
    eventContent = JSON.stringify(content)
  }

  await publisher.publish({
    kind,
    created_at: createdAt,
    tags: [
      ['d', 'global'],
      ['t', 'llamenos:event'],
      ['epoch', epoch.toString()],
    ],
    content: eventContent,
  })
}
