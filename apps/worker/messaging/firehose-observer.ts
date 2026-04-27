/**
 * Firehose Observer — intercepts Signal group messages and buffers them
 * for connected firehose inference agents.
 *
 * This observer is invoked from the messaging router when a Signal webhook
 * arrives with a group message. If the group is linked to an active firehose
 * connection, the message is encrypted and buffered for later extraction.
 *
 * Privacy: Messages are encrypted with a per-window ephemeral key that is
 * ECIES-sealed for the agent. Window keys rotate on a configurable interval
 * (default 1 hour), providing forward secrecy — compromising one window key
 * only exposes messages in that window.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { LABEL_FIREHOSE_BUFFER_ENCRYPT } from '@shared/crypto-labels'
import { eciesWrapKeyForRecipient } from '../lib/crypto'
import { createLogger } from '../lib/logger'
import type { FirehoseService } from '../services/firehose'

const log = createLogger('messaging.firehose-observer')

/** Default window duration: 1 hour */
const DEFAULT_WINDOW_DURATION_MS = 60 * 60 * 1000

export interface FirehoseGroupMessage {
  signalGroupId: string
  senderIdentifier: string
  senderIdentifierHash: string
  senderUsername: string
  content: string
  timestamp: Date
  hubId?: string
}

/**
 * Encrypt plaintext with a given symmetric key using XChaCha20-Poly1305.
 * Returns hex-encoded nonce(24) + ciphertext.
 */
function encryptWithWindowKey(plaintext: string, windowKey: Uint8Array): string {
  const nonce = new Uint8Array(24)
  crypto.getRandomValues(nonce)
  const cipher = xchacha20poly1305(windowKey, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))
  const packed = new Uint8Array(nonce.length + ciphertext.length)
  packed.set(nonce)
  packed.set(ciphertext, nonce.length)
  return bytesToHex(packed)
}

/**
 * Get the current window key for a connection, creating a new one if needed.
 * Returns the window key ID and the raw key bytes.
 */
async function getOrCreateWindowKey(
  firehose: FirehoseService,
  connectionId: string,
  agentPubkey: string,
): Promise<{ windowKeyId: string; windowKeyBytes: Uint8Array }> {
  const now = new Date()
  const currentKey = await firehose.getCurrentWindowKey(connectionId)

  // If we have a valid (not expired) window key, unseal and return it
  if (currentKey && currentKey.windowEnd > now) {
    // The sealedKey is the raw key hex, ECIES-sealed for the agent.
    // We store the raw key bytes alongside the sealed version in the DB row.
    // Actually — for forward secrecy the server must NOT store the raw key.
    // The server only stores the ECIES-sealed version. But the observer needs
    // the raw key to encrypt messages. So we cache it in-memory per window.
    const cached = windowKeyCache.get(currentKey.id)
    if (cached) {
      return { windowKeyId: currentKey.id, windowKeyBytes: cached }
    }
    // Cache miss — key was created in a previous server instance.
    // We must rotate to a new window since we can't unseal the old one
    // (only the agent's nsec can do that).
  }

  // Generate a new window key
  const windowKeyBytes = new Uint8Array(32)
  crypto.getRandomValues(windowKeyBytes)

  // ECIES-wrap the key for the agent
  const { wrappedKey, ephemeralPubkey } = eciesWrapKeyForRecipient(
    windowKeyBytes,
    agentPubkey,
    LABEL_FIREHOSE_BUFFER_ENCRYPT,
  )

  const sealedKey = JSON.stringify({ wrappedKey, ephemeralPubkey })

  const windowStart = now
  const windowEnd = new Date(now.getTime() + DEFAULT_WINDOW_DURATION_MS)

  const windowKeyRow = await firehose.createWindowKey({
    connectionId,
    sealedKey,
    windowStart,
    windowEnd,
  })

  // Cache for this server instance
  windowKeyCache.set(windowKeyRow.id, windowKeyBytes)

  return { windowKeyId: windowKeyRow.id, windowKeyBytes }
}

/** In-memory cache of raw window key bytes (cleared on server restart). */
const windowKeyCache = new Map<string, Uint8Array>()

/**
 * Clear cached window keys (e.g., on server shutdown).
 */
export function clearWindowKeyCache(): void {
  for (const [id, key] of windowKeyCache) {
    key.fill(0)
    windowKeyCache.delete(id)
  }
}

/**
 * Check if a Signal group message should be buffered for a firehose connection,
 * and if so, encrypt and store it.
 *
 * Returns true if the message was buffered (connection found and active).
 */
export async function observeFirehoseMessage(
  firehose: FirehoseService,
  msg: FirehoseGroupMessage,
): Promise<boolean> {
  // Look up connection by signal group ID
  const conn = await firehose.findConnectionBySignalGroup(msg.signalGroupId, msg.hubId)
  if (!conn) return false
  if (conn.status !== 'active') return false

  try {
    // Get or create a window key for forward secrecy
    const { windowKeyId, windowKeyBytes } = await getOrCreateWindowKey(
      firehose,
      conn.id,
      conn.agentPubkey,
    )

    // Encrypt message content with window key
    const encryptedContent = encryptWithWindowKey(msg.content, windowKeyBytes)

    // Encrypt sender info separately (data minimization)
    const senderInfo = JSON.stringify({
      identifier: msg.senderIdentifier,
      identifierHash: msg.senderIdentifierHash,
      username: msg.senderUsername,
      timestamp: msg.timestamp.getTime(),
    })
    const encryptedSenderInfo = encryptWithWindowKey(senderInfo, windowKeyBytes)

    // Calculate expiry based on connection's buffer TTL
    const expiresAt = new Date(
      msg.timestamp.getTime() + conn.bufferTtlDays * 24 * 60 * 60 * 1000,
    )

    await firehose.addBufferMessage(conn.id, {
      signalTimestamp: msg.timestamp,
      encryptedContent,
      encryptedSenderInfo,
      windowKeyId,
      expiresAt,
    })

    // Increment message count on window key for auditing
    await firehose.incrementWindowKeyMessageCount(windowKeyId)

    log.info('Buffered firehose message', {
      connectionId: conn.id,
      groupId: msg.signalGroupId,
      windowKeyId,
    })

    return true
  } catch (err) {
    log.error('Failed to buffer firehose message', {
      connectionId: conn.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
